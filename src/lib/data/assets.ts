// Uploaded images. One row per owner and file (memory.md "Asset primary key");
// another owner's row for the same file is invisible.
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import type { Actor } from "./actor";
import { writeAudit } from "./audit";
import { NotFoundError } from "./errors";
import { builtInLogoBySha } from "@/lib/templates/logos";

const WHAT = "Image";

export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "Not a SHA-256 digest.");

export const assetInputSchema = z.object({
  sha256: sha256Schema,
  mime: z.enum(["image/png", "image/jpeg", "application/pdf"]),
  bytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  originalName: z.string().trim().min(1).max(255),
});
export type AssetInput = z.input<typeof assetInputSchema>;

/** Images in a template header that are uploads (built-in logos ship with the app). */
export function headerUploads(header: { logoLeft?: { sha256: string } | undefined }): string[] {
  const sha = header.logoLeft?.sha256;
  return sha && !builtInLogoBySha(sha) ? [sha] : [];
}

/** Every upload must be the owner's own: a guessed hash of someone else's file is refused. */
export async function assertOwnsAssets(db: Db, ownerId: string, shas: string[]): Promise<void> {
  const unique = [...new Set(shas)];
  if (unique.length === 0) return;
  const found = await db.asset.count({ where: { ownerId, sha256: { in: unique } } });
  if (found !== unique.length) throw new NotFoundError(WHAT);
}

/**
 * D22: a paper or copy made from a visible template gets its own rows for the
 * template's header images, so every compile resolves images by one owner.
 */
export async function shareAssets(db: Db, fromOwnerId: string, toOwnerId: string, shas: string[]) {
  if (fromOwnerId === toOwnerId) return;
  for (const sha256 of new Set(shas)) {
    const src = await db.asset.findUnique({
      where: { ownerId_sha256: { ownerId: fromOwnerId, sha256 } },
    });
    if (!src) continue;
    const { mime, bytes, width, height, originalName } = src;
    await db.asset.upsert({
      where: { ownerId_sha256: { ownerId: toOwnerId, sha256 } },
      create: { sha256, mime, bytes, width, height, originalName, ownerId: toOwnerId },
      update: {},
    });
  }
}

export function assets(db: Db) {
  async function findOwn(actor: Actor, sha256: string) {
    const a = sha256Schema.safeParse(sha256).success
      ? await db.asset.findUnique({ where: { ownerId_sha256: { ownerId: actor.userId, sha256 } } })
      : null;
    if (!a) throw new NotFoundError(WHAT);
    return a;
  }

  return {
    list(actor: Actor) {
      return db.asset.findMany({
        where: { ownerId: actor.userId },
        orderBy: { createdAt: "desc" },
      });
    },

    get: findOwn,

    /** Records an upload for the actor; uploading the same file again keeps one row. */
    async add(actor: Actor, input: AssetInput) {
      const a = assetInputSchema.parse(input);
      const { sha256, ...meta } = a;
      return db.asset.upsert({
        where: { ownerId_sha256: { ownerId: actor.userId, sha256 } },
        create: { ...a, ownerId: actor.userId },
        update: meta,
      });
    },

    async remove(actor: Actor, sha256: string) {
      const a = await findOwn(actor, sha256);
      await db.asset.delete({
        where: { ownerId_sha256: { ownerId: actor.userId, sha256: a.sha256 } },
      });
      await writeAudit(db, {
        actorId: actor.userId,
        action: "delete",
        entity: WHAT,
        entityId: sha256,
      });
    },

    /** System check before deleting the file on disk: does any owner still use it? */
    async fileInUse(sha256: string): Promise<boolean> {
      return (await db.asset.count({ where: { sha256 } })) > 0;
    },
  };
}
