// Renders PDF pages to PNG with pdf.js + @napi-rs/canvas and compares them
// with pixelmatch (SPEC §10 gates 4 and 5).
import { createCanvas } from "@napi-rs/canvas";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function renderPdf(pdf: Uint8Array, dpi = 100): Promise<PNG[]> {
  const task = getDocument({
    data: new Uint8Array(pdf),
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await task.promise;
  const pages: PNG[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        // pdf.js types expect a DOM canvas; @napi-rs/canvas implements the same 2D API.
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        canvas: canvas as unknown as HTMLCanvasElement,
        viewport,
      }).promise;
      pages.push(PNG.sync.read(canvas.toBuffer("image/png")));
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

export interface PageDiff {
  page: number;
  changedPixels: number;
  ratio: number;
  diff: PNG;
}

/** Compares page by page; a page-count or size mismatch is a 100% difference. */
export function diffPages(actual: PNG[], expected: PNG[], threshold = 0.1): PageDiff[] {
  const out: PageDiff[] = [];
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const e = expected[i];
    if (!a || !e || a.width !== e.width || a.height !== e.height) {
      const w = a?.width ?? e?.width ?? 1;
      const h = a?.height ?? e?.height ?? 1;
      out.push({
        page: i + 1,
        changedPixels: w * h,
        ratio: 1,
        diff: new PNG({ width: w, height: h }),
      });
      continue;
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const changed = pixelmatch(a.data, e.data, diff.data, a.width, a.height, { threshold });
    out.push({ page: i + 1, changedPixels: changed, ratio: changed / (a.width * a.height), diff });
  }
  return out;
}

export const pngBytes = (png: PNG): Buffer => PNG.sync.write(png);
export const readPng = (bytes: Buffer): PNG => PNG.sync.read(bytes);
