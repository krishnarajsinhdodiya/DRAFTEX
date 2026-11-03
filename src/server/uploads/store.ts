// Stores a processed upload: the file once by hash in the data folder's
// assets directory, and one Asset row for the uploader (memory.md).
import fs from "node:fs/promises";
import path from "node:path";
import type { Actor, DataLayer } from "@/lib/data";
import { type ProcessedImage, UploadError, processUpload } from "./process";

export interface UploadDeps {
  data: Pick<DataLayer, "assets">;
  assetsDir: string;
  /** Places a PDF on a page with the real engine; false = the paper could not use it. */
  checkPdf: (userId: string, sha256: string, bytes: Buffer) => Promise<boolean>;
}

export interface UploadedImage {
  sha256: string;
  ext: ProcessedImage["ext"];
  width: number;
  height: number;
  from: ProcessedImage["from"];
}

export function assetFile(assetsDir: string, sha256: string, ext: string): string {
  return path.join(assetsDir, `${sha256}.${ext}`);
}

/** Writes beside the target, then renames, so a crash never leaves half a file under its hash. */
async function writeOnce(file: string, bytes: Buffer): Promise<void> {
  try {
    await fs.access(file);
    return;
  } catch {
    // not there yet
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, file);
}

export async function storeUpload(
  deps: UploadDeps,
  actor: Actor,
  input: Buffer,
  originalName: string,
): Promise<UploadedImage> {
  const img = await processUpload(input);
  if (img.ext === "pdf" && !(await deps.checkPdf(actor.userId, img.sha256, img.bytes))) {
    throw new UploadError(
      "This PDF cannot be placed on a paper. Export the drawing again as PDF, or as PNG.",
    );
  }
  await writeOnce(assetFile(deps.assetsDir, img.sha256, img.ext), img.bytes);
  await deps.data.assets.add(actor, {
    sha256: img.sha256,
    mime: img.mime,
    bytes: img.bytes.length,
    width: img.width,
    height: img.height,
    originalName: originalName.trim().slice(0, 255) || "image",
  });
  return { sha256: img.sha256, ext: img.ext, width: img.width, height: img.height, from: img.from };
}
