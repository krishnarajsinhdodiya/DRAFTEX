// GET the LaTeX DRAFTEX writes for the saved paper (D104), or its answer key
// with ?kind=key; ?slot=g2.3 limits it to one question. Read-only: nothing is
// compiled or stored. The paper's owner only (the data layer answers "not
// found" to anyone else, admins included).
import { NextResponse, type NextRequest } from "next/server";
import { NotFoundError, getData } from "@/lib/data";
import { apiActor, jsonError } from "@/server/http";
import { paperLatex } from "@/server/paper-latex";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/papers/[id]/latex">) {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const params = req.nextUrl.searchParams;
  try {
    const kind = params.get("kind") === "key" ? "KEY" : "PAPER";
    const r = await paperLatex(await getData(), actor, id, kind, params.get("slot") ?? undefined);
    if (r.ok) {
      return new NextResponse(r.tex, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return NextResponse.json(
      { message: r.message, problems: r.problems.slice(0, 30) },
      { status: r.status },
    );
  } catch (e) {
    if (e instanceof NotFoundError) return jsonError(404, e.message);
    throw e;
  }
}
