// Turns an uploaded file into a safe image for the paper (SPEC §11.5).
// The type comes from the file's bytes, never its name. Rasters are re-encoded
// by sharp, which drops EXIF, XMP and ICC profiles (xdvipdfmx warns on EXIF
// resolution data and ICC v4, memory.md). SVG never reaches LaTeX: resvg
// renders it to PNG at 300 DPI. A PDF is kept as it is once it has one page.
import { createHash } from "node:crypto";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Longest side kept for rasters: 10 in at 300 DPI, far more than a paper column. */
export const MAX_SIDE_PX = 3000;
/** Refuse decompression bombs before sharp allocates them. */
const MAX_INPUT_PIXELS = 40_000_000;
const SVG_DPI = 300;
/** Largest PDF page accepted, in points (A3 is 842 × 1191). */
const MAX_PDF_POINTS = 1200;

export type ImageKind = "png" | "jpg" | "pdf" | "svg";
export type StoredExt = "png" | "jpg" | "pdf";

export interface ProcessedImage {
  bytes: Buffer;
  sha256: string;
  ext: StoredExt;
  mime: "image/png" | "image/jpeg" | "application/pdf";
  /** Pixels for rasters, points for PDF. */
  width: number;
  height: number;
  /** What the user uploaded, for messages ("SVG drawings become PNG"). */
  from: ImageKind;
}

export class UploadError extends Error {
  override name = "UploadError";
}

const startsWith = (b: Buffer, sig: number[]) => sig.every((v, i) => b[i] === v);

/** The file's real type, from its first bytes. */
export function sniff(b: Buffer): ImageKind | null {
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "jpg";
  if (b.subarray(0, 1024).includes("%PDF-")) return "pdf";
  // SVG is text: optional BOM, XML declaration, comments or doctype, then <svg.
  const head = b
    .subarray(0, 4096)
    .toString("utf8")
    .replace(/^\uFEFF/, "");
  const stripped = head
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?\s*>/gi, "")
    .trimStart();
  if (/^<svg[\s>]/i.test(stripped)) return "svg";
  return null;
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function raster(
  input: Buffer,
  kind: "png" | "jpg",
  from: ImageKind,
): Promise<ProcessedImage> {
  let img;
  try {
    img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      // Apply the camera's orientation before the EXIF that holds it is dropped.
      .rotate()
      .resize({
        width: MAX_SIDE_PX,
        height: MAX_SIDE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb");
    img =
      kind === "png"
        ? img.png({ compressionLevel: 9 })
        : img.flatten({ background: "#ffffff" }).jpeg({ quality: 92, mozjpeg: true });
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    return {
      bytes: data,
      sha256: sha256(data),
      ext: kind,
      mime: kind === "png" ? "image/png" : "image/jpeg",
      width: info.width,
      height: info.height,
      from,
    };
  } catch (e) {
    if (e instanceof Error && /pixel limit/i.test(e.message)) {
      throw new UploadError("This picture is too large. Save it smaller and try again.");
    }
    throw new UploadError("This picture could not be read. It may be damaged.");
  }
}

/** Rejects SVG features that could reach outside the file or blow up while parsing. */
function checkSvg(svg: string): void {
  if (/<!ENTITY/i.test(svg) || /<!DOCTYPE[^>]*\[/i.test(svg)) {
    throw new UploadError("This SVG file uses features DRAFTEX does not accept (entities).");
  }
  const hrefs = svg.matchAll(/\b(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi);
  for (const [, , ref] of hrefs) {
    if (!ref?.startsWith("#") && !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(ref ?? "")) {
      throw new UploadError(
        "This SVG file links to other files. Export it again with images embedded.",
      );
    }
  }
}

/**
 * Only a drawing with text needs the system fonts. Loading them scans every
 * installed font, synchronously, on each upload: 1.5 s cold on the owner's
 * Mac and more than 30 s once on a busy Windows runner (run 42251776929).
 */
export function svgNeedsFonts(svg: string): boolean {
  return /<(?:[A-Za-z_][\w.-]*:)?text[\s>/]/.test(svg);
}

function svgToPng(input: Buffer): Buffer {
  const svg = input.toString("utf8");
  checkSvg(svg);
  // CorelDRAW keeps text as text unless told otherwise; system fonts let it render.
  const font = { loadSystemFonts: svgNeedsFonts(svg) };
  let r: Resvg;
  try {
    r = new Resvg(svg, {
      fitTo: { mode: "zoom", value: SVG_DPI / 96 },
      font,
    });
  } catch {
    throw new UploadError("This SVG file could not be read. It may be damaged.");
  }
  const { width, height } = r;
  if (width < 1 || height < 1) throw new UploadError("This SVG drawing is empty.");
  if (width * height > MAX_INPUT_PIXELS) {
    // Render it smaller rather than refuse: the drawing is vector, so it stays sharp.
    const scale = Math.sqrt(MAX_INPUT_PIXELS / (width * height));
    r = new Resvg(svg, {
      fitTo: { mode: "width", value: Math.floor(width * scale) },
      font,
    });
  }
  return r.render().asPng();
}

/** pdf.js is loaded on first use: most uploads are pictures. */
async function pdfPage(input: Buffer): Promise<{ width: number; height: number }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(input),
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: true,
  });
  try {
    const doc = await task.promise;
    if (doc.numPages !== 1) {
      throw new UploadError(
        `This PDF has ${doc.numPages} pages. Export the drawing as a single-page PDF.`,
      );
    }
    const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
    return { width: Math.round(vp.width), height: Math.round(vp.height) };
  } catch (e) {
    if (e instanceof UploadError) throw e;
    if (e instanceof Error && e.name === "PasswordException") {
      throw new UploadError("This PDF is password-protected. Export it again without a password.");
    }
    throw new UploadError("This PDF could not be read. It may be damaged.");
  } finally {
    await task.destroy();
  }
}

export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  if (input.length === 0) throw new UploadError("The file is empty.");
  if (input.length > MAX_UPLOAD_BYTES) {
    throw new UploadError("The file is larger than 10 MB. Save it smaller and try again.");
  }
  const kind = sniff(input);
  if (!kind) {
    throw new UploadError("Use a PNG, JPG, PDF or SVG file.");
  }
  if (kind === "png" || kind === "jpg") return raster(input, kind, kind);
  if (kind === "svg") return raster(svgToPng(input), "png", "svg");
  const { width, height } = await pdfPage(input);
  if (width < 1 || height < 1 || width > MAX_PDF_POINTS || height > MAX_PDF_POINTS) {
    throw new UploadError("This PDF page is larger than A3. Export just the drawing.");
  }
  return {
    bytes: input,
    sha256: sha256(input),
    ext: "pdf",
    mime: "application/pdf",
    width,
    height,
    from: "pdf",
  };
}
