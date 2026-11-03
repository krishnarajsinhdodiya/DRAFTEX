// GET a backup zip (administrators only; anyone else gets 404).
import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { NotFoundError } from "@/lib/data";
import { getData } from "@/lib/data";
import { backupCommands } from "@/server/backup-commands";
import { backupContext } from "@/server/backups";
import { apiActor, jsonError } from "@/server/http";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/admin/backups/[name]">) {
  const actor = await apiActor();
  if (actor instanceof Response) return actor;
  const { name } = await ctx.params;
  let file: string;
  try {
    file = backupCommands(await getData(), backupContext(), actor).file(name);
  } catch (e) {
    if (e instanceof NotFoundError) return jsonError(404, "Not found.");
    throw e;
  }
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(fs.statSync(file).size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
