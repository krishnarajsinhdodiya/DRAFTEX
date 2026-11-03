// Finds the files behind the image names a .tex uses. Built-in logos come
// from the app folder; uploads come from the data folder, and only when the
// given owner has a row for them (memory.md "Asset primary key", D22).
import fs from "node:fs";
import path from "node:path";
import type { CompileAsset } from "@/lib/latex/compile";
import { builtInLogoBySha } from "@/lib/templates/logos";

const ASSET = /^assets\/([a-f0-9]{64})\.(png|jpg|pdf)$/;
const MIME = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" } as const;

export interface ImageSource {
  repoRoot: string;
  assetsDir: string;
  /** The owner's row for this upload, if they have one. */
  ownAsset: (ownerId: string, sha256: string) => Promise<{ mime: string } | null>;
}

export const MISSING_IMAGE =
  "A picture on this paper is no longer available. Insert it again or remove it.";

export type ResolveImages = (names: string[], ownerId: string) => Promise<CompileAsset[] | string>;

export function imageResolver(src: ImageSource): ResolveImages {
  return async (names, ownerId) => {
    const out: CompileAsset[] = [];
    for (const name of names) {
      const m = ASSET.exec(name);
      if (!m) return MISSING_IMAGE;
      const [, sha, ext] = m as unknown as [string, string, keyof typeof MIME];
      const logo = builtInLogoBySha(sha);
      if (logo && logo.ext === ext) {
        out.push({ name, sourcePath: path.join(src.repoRoot, logo.file) });
        continue;
      }
      const row = await src.ownAsset(ownerId, sha);
      const file = path.join(/* turbopackIgnore: true */ src.assetsDir, `${sha}.${ext}`);
      if (row?.mime !== MIME[ext] || !fs.existsSync(file)) return MISSING_IMAGE;
      out.push({ name, sourcePath: file });
    }
    return out;
  };
}
