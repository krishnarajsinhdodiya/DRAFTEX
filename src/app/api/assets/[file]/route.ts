// GET one of the signed-in user's own pictures, for the editor. Another
// user's picture, or a guessed hash, is "not found" (SPEC §7, gate 8).
import fs from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { NotFoundError, getData } from "@/lib/data";
import { dataPaths, getDataDir } from "@/lib/paths";
import { apiActor, jsonError } from "@/server/http";
import { assetFile } from "@/server/uploads/store";

const NAME = /^([0-9a-f]{64})\.(png|jpg|pdf)$/;
const MIME = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" } as const;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const m = NAME.exec((await ctx.params).file);
  if (!m) return jsonError(404, "Image not found.");
  const [, sha256, ext] = m as unknown as [string, string, keyof typeof MIME];
  try {
    const a = await (await getData()).assets.get(actor, sha256);
    if (a.mime !== MIME[ext]) return jsonError(404, "Image not found.");
    const bytes = await fs.readFile(assetFile(dataPaths(getDataDir()).assets, sha256, ext));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": MIME[ext],
        // Content-addressed: the bytes behind this name never change.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return jsonError(404, "Image not found.");
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return jsonError(404, "Image not found.");
    throw e;
  }
}
