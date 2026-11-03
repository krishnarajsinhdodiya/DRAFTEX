// GET a saved template's empty preview PDF. Private templates of others are "not found".
import { type NextRequest } from "next/server";
import { NotFoundError, getData } from "@/lib/data";
import { storedFields } from "@/lib/data/templates";
import { apiActor, jsonError, pdfResponse } from "@/server/http";
import { previewDeps } from "@/server/previews";
import { templatePreview } from "@/server/template-preview";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/templates/[id]/preview">) {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const { id } = await ctx.params;
  const data = await getData();
  let fields;
  try {
    fields = storedFields(await data.templates.get(actor, id));
  } catch (e) {
    if (e instanceof NotFoundError) return jsonError(404, e.message);
    throw e;
  }
  const r = await templatePreview(previewDeps(), actor.userId, fields);
  return r.ok ? pdfResponse(r.pdf) : jsonError(r.status, r.message, r.details);
}
