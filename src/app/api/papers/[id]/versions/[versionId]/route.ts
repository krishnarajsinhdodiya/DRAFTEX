// GET a version of the paper as PDF (D57), or its answer key with ?kind=key.
// Opens in the browser's PDF viewer; ?download=1 saves it instead.
import { type NextRequest } from "next/server";
import { NotFoundError } from "@/lib/data";
import { apiActor, jsonError, pdfResponse } from "@/server/http";
import { versionPdfDeps } from "@/server/previews";
import { versionPdf } from "@/server/version-pdf";

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/papers/[id]/versions/[versionId]">,
) {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const { id, versionId } = await ctx.params;
  try {
    const kind = req.nextUrl.searchParams.get("kind") === "key" ? "KEY" : "PAPER";
    const r = await versionPdf(await versionPdfDeps(), actor, id, versionId, kind);
    if (!r.ok) return jsonError(r.status, r.message);
    const res = pdfResponse(r.pdf);
    const how = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    res.headers.set(
      "Content-Disposition",
      `${how}; filename="version.pdf"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
    );
    return res;
  } catch (e) {
    if (e instanceof NotFoundError) return jsonError(404, e.message);
    throw e;
  }
}
