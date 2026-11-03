// POST → export the paper and its key (D32, D34): writes the export folder
// and answers with the same folder as a zip. Body {"confirmed": true} after
// the user has seen the warnings ("Export anyway"). Checks Origin itself (D19).
import { NextResponse, type NextRequest } from "next/server";
import { NotFoundError } from "@/lib/data";
import { exportPaper } from "@/server/export";
import { apiActor, jsonError, sameOrigin } from "@/server/http";
import { exportDeps } from "@/server/previews";

const MAX_PROBLEMS = 30;

export async function POST(req: NextRequest, ctx: RouteContext<"/api/papers/[id]/export">) {
  if (!sameOrigin(req)) return jsonError(403, "This request did not come from DRAFTEX.");
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { confirmed?: unknown };
  try {
    const r = await exportPaper(await exportDeps(), actor, id, {
      confirmed: body.confirmed === true,
    });
    if (!r.ok) {
      return NextResponse.json(
        { message: r.message, problems: r.problems.slice(0, MAX_PROBLEMS) },
        { status: r.status },
      );
    }
    return new NextResponse(new Uint8Array(r.zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="export.zip"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-DX-Folder": encodeURIComponent(r.folder),
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return jsonError(404, e.message);
    throw e;
  }
}
