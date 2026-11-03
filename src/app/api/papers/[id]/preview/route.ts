// GET the saved paper's PDF (D23), or its answer key with ?kind=key (D33). Problems travel in X-DX-Problems (JSON,
// URI-encoded): messages name questions, never quote them (SPEC §11.7).
import { NextResponse, type NextRequest } from "next/server";
import { NotFoundError } from "@/lib/data";
import type { Problem } from "@/lib/paper/problems";
import { apiActor, jsonError, pdfResponse } from "@/server/http";
import { paperPreview } from "@/server/paper-preview";
import { paperPreviewDeps } from "@/server/previews";

const MAX_PROBLEMS = 30;

function problemsHeader(problems: Problem[]): string {
  return encodeURIComponent(JSON.stringify(problems.slice(0, MAX_PROBLEMS)));
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/papers/[id]/preview">) {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  try {
    const kind = req.nextUrl.searchParams.get("kind") === "key" ? "KEY" : "PAPER";
    const r = await paperPreview(await paperPreviewDeps(), actor, id, kind);
    if (r.ok) {
      const res = pdfResponse(r.pdf);
      res.headers.set("X-DX-Problems", problemsHeader(r.problems));
      return res;
    }
    return NextResponse.json(
      { message: r.message, problems: r.problems.slice(0, MAX_PROBLEMS) },
      { status: r.status },
    );
  } catch (e) {
    if (e instanceof NotFoundError) return jsonError(404, e.message);
    throw e;
  }
}
