// POST a backup zip (the raw file as the body) → checked and kept for the
// next start (D28). Administrators only; checks Origin itself (D19).
import { NextResponse, type NextRequest } from "next/server";
import { MAX_BACKUP_BYTES } from "@/lib/backup/archive";
import { NotFoundError, getData } from "@/lib/data";
import { backupCommands } from "@/server/backup-commands";
import { backupContext } from "@/server/backups";
import { apiActor, jsonError, sameOrigin } from "@/server/http";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return jsonError(403, "This request did not come from DRAFTEX.");
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const commands = backupCommands(await getData(), backupContext(), actor);
  try {
    commands.list(); // 404 for anyone but an administrator, before reading the upload
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BACKUP_BYTES) {
      return jsonError(413, "The backup is too large.");
    }
    const r = await commands.stage(new Uint8Array(await req.arrayBuffer()));
    if (!r.ok) return jsonError(422, r.message);
    const m = r.summary;
    return NextResponse.json({
      createdAt: m.manifest.createdAt,
      appVersion: m.manifest.appVersion,
      users: m.users,
      papers: m.papers,
      pictures: m.pictures,
    });
  } catch (e) {
    if (e instanceof NotFoundError) return jsonError(404, "Not found.");
    throw e;
  }
}
