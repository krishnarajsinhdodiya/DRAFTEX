// Templates, scoped by the permission table in SPEC §7:
// GLOBAL ones are visible to everyone, PRIVATE ones to their owner only
// (others get "not found"). Only the owner edits in place; anyone who can
// see a template may save a copy. Admins may unpublish and delete GLOBAL ones.
import { z } from "zod";
import type { Visibility } from "@/generated/prisma/enums";
import { CourseKind, ExamKind, Program } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/lib/db/client";
import { headerSchema, structureSchema, styleSchema } from "@/lib/paper/schema";
import type { Actor } from "./actor";
import { writeAudit } from "./audit";
import { ConflictError, ForbiddenError, NotFoundError, STALE_VERSION } from "./errors";

const WHAT = "Template";

export const templateFieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the template a title.").max(200),
  description: z.string().trim().max(2000).default(""),
  program: z.enum(Program),
  examKind: z.enum(ExamKind),
  courseKind: z.enum(CourseKind),
  creditTier: z.number().int().min(0).max(10).nullable().default(null),
  ruleSetId: z.string().max(100).nullable().default(null),
  durationMinutes: z.number().int().min(1).max(600),
  maxMarks: z.number().positive().max(1000),
  structure: structureSchema,
  style: styleSchema,
  header: headerSchema,
});
export type TemplateFields = z.input<typeof templateFieldsSchema>;

export const templatePatchSchema = templateFieldsSchema.partial();
export type TemplatePatch = z.input<typeof templatePatchSchema>;

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toData(fields: Partial<z.output<typeof templateFieldsSchema>>) {
  const { structure, style, header, ...rest } = fields;
  return {
    ...rest,
    ...(structure !== undefined && { structure: json(structure) }),
    ...(style !== undefined && { style: json(style) }),
    ...(header !== undefined && { header: json(header) }),
  };
}

/** Templates the actor may see: every GLOBAL one plus their own, never deleted ones. */
function visibleTo(actor: Actor): Prisma.TemplateWhereInput {
  return { deletedAt: null, OR: [{ visibility: "GLOBAL" }, { ownerId: actor.userId }] };
}

export function templates(db: Db) {
  async function findVisible(actor: Actor, id: string) {
    const t = await db.template.findFirst({ where: { id, ...visibleTo(actor) } });
    if (!t) throw new NotFoundError(WHAT);
    return t;
  }

  return {
    list(actor: Actor, filter: { program?: Program; examKind?: ExamKind } = {}) {
      return db.template.findMany({
        where: { ...visibleTo(actor), ...filter },
        orderBy: [{ builtIn: "desc" }, { updatedAt: "desc" }],
      });
    },

    get: findVisible,

    async create(actor: Actor, input: TemplateFields) {
      const { structure, style, header, ...fields } = templateFieldsSchema.parse(input);
      const t = await db.template.create({
        data: {
          ...fields,
          structure: json(structure),
          style: json(style),
          header: json(header),
          ownerId: actor.userId,
          visibility: "PRIVATE",
        },
      });
      await writeAudit(db, {
        actorId: actor.userId,
        action: "create",
        entity: WHAT,
        entityId: t.id,
      });
      return t;
    },

    /** Edit in place: owner only, built-ins never, and only from the latest version. */
    async update(actor: Actor, id: string, version: number, patch: TemplatePatch) {
      const t = await findVisible(actor, id);
      if (t.builtIn)
        throw new ForbiddenError("Built-in templates cannot be changed. Save a copy instead.");
      if (t.ownerId !== actor.userId) {
        throw new ForbiddenError("Only the owner can edit this template. Save a copy instead.");
      }
      const fields = templatePatchSchema.parse(patch);
      const { count } = await db.template.updateMany({
        where: { id, ownerId: actor.userId, version, deletedAt: null },
        data: { ...toData(fields), version: { increment: 1 } },
      });
      if (count === 0) throw new ConflictError(STALE_VERSION);
      await writeAudit(db, { actorId: actor.userId, action: "update", entity: WHAT, entityId: id });
      return findVisible(actor, id);
    },

    /** "Save as new": a PRIVATE copy owned by the actor, linked to its source. */
    async saveAsNew(actor: Actor, id: string, overrides: TemplatePatch = {}) {
      const src = await findVisible(actor, id);
      const fields = templatePatchSchema.parse(overrides);
      const copy = await db.template.create({
        data: {
          title: src.title,
          description: src.description,
          program: src.program,
          examKind: src.examKind,
          courseKind: src.courseKind,
          creditTier: src.creditTier,
          ruleSetId: src.ruleSetId,
          durationMinutes: src.durationMinutes,
          maxMarks: src.maxMarks,
          structure: json(src.structure),
          style: json(src.style),
          header: json(src.header),
          ...toData(fields),
          ownerId: actor.userId,
          visibility: "PRIVATE",
          derivedFromId: src.id,
        },
      });
      await writeAudit(db, {
        actorId: actor.userId,
        action: "copy",
        entity: WHAT,
        entityId: copy.id,
      });
      return copy;
    },

    /** Owner may switch either way; an admin may only unpublish someone else's. */
    async setVisibility(actor: Actor, id: string, visibility: Visibility) {
      const t = await findVisible(actor, id);
      if (t.builtIn) throw new ForbiddenError("Built-in templates are always global.");
      const isOwner = t.ownerId === actor.userId;
      const adminUnpublish = actor.role === "ADMIN" && visibility === "PRIVATE";
      if (!isOwner && !adminUnpublish) {
        throw new ForbiddenError("Only the owner can change who sees this template.");
      }
      const updated = await db.template.update({
        where: { id },
        data: { visibility, version: { increment: 1 } },
      });
      await writeAudit(db, {
        actorId: actor.userId,
        action: visibility === "GLOBAL" ? "publish" : "unpublish",
        entity: WHAT,
        entityId: id,
      });
      return updated;
    },

    /** Soft delete: owner, or an admin for any template they can see. Papers keep their snapshot. */
    async remove(actor: Actor, id: string) {
      const t = await findVisible(actor, id);
      if (t.builtIn) throw new ForbiddenError("Built-in templates cannot be deleted.");
      if (t.ownerId !== actor.userId && actor.role !== "ADMIN") {
        throw new ForbiddenError("Only the owner can delete this template.");
      }
      await db.template.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeAudit(db, { actorId: actor.userId, action: "delete", entity: WHAT, entityId: id });
    },
  };
}
