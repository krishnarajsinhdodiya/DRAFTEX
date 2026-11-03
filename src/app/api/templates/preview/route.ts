// POST an unsaved template (the builder's current state) → its empty preview PDF.
import { type NextRequest } from "next/server";
import { apiActor, jsonError, pdfResponse, sameOrigin } from "@/server/http";
import { previewDeps } from "@/server/previews";
import { templatePreview } from "@/server/template-preview";

const MAX_BODY = 256 * 1024;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, "This request did not come from DRAFTEX.");
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const body = await req.text();
  if (body.length > MAX_BODY) return jsonError(413, "The template is too large to preview.");
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return jsonError(400, "The preview request was not valid.");
  }
  const r = await templatePreview(previewDeps(), actor.userId, input);
  return r.ok ? pdfResponse(r.pdf) : jsonError(r.status, r.message, r.details);
}
