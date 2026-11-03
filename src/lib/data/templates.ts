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
import { checkTemplateFields, ruleSetIdFor } from "@/lib/templates/check";
import type { Actor } from "./actor";
import { writeAudit } from "./audit";
import {
  ConflictError,
  ForbiddenError,
  InvalidTemplateError,
  NotFoundError,
  STALE_VERSION,
} from "./errors";

const WHAT = "Template";

export const templateFieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the template a title.").max(200),
  description: z.string().trim().max(2000).default(""),
  program: z.enum(Program),
  examKind: z.enum(ExamKind),
  courseKind: z.enum(CourseKind),
  creditTier: z.number().int().min(0).max(10).nullable().default(null),
  durationMinutes: z.number().int().min(1).max(600),
  maxMarks: z.number().positive().max(1000),
  structure: structureSchema,
  style: styleSchema,
  header: headerSchema,
});
export type TemplateFields = z.input<typeof templateFieldsSchema>;

export const templatePatchSchema = templateFieldsSchema.partial();
export type TemplatePatch = z.input<typeof templatePatchSchema>;

type ParsedFields = z.output<typeof templateFieldsSchema>;

/** Level-1 checker errors block the save; warnings never do (SPEC §7). */
function assertValid(fields: ParsedFields): void {
  const { errors } = checkTemplateFields(fields);
  if (errors.length > 0) throw new InvalidTemplateError(errors);
}

/** A stored row as checked fields (rows are validated on the way in, so this only fails on corruption). */
export function storedFields(t: {
  title: string;
  description: string;
  program: Program;
  examKind: ExamKind;
  courseKind: CourseKind;
  creditTier: number | null;
  durationMinutes: number;
  maxMarks: number;
  structure: unknown;
  style: unknown;
  header: unknown;
}): ParsedFields {
  return templateFieldsSchema.parse({
    title: t.title,
    description: t.description,
    program: t.program,
    examKind: t.examKind,
    courseKind: t.courseKind,
    creditTier: t.creditTier,
    durationMinutes: t.durationMinutes,
    maxMarks: t.maxMarks,
    structure: t.structure,
    style: t.style,
    header: t.header,
  });
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function createData(fields: ParsedFields) {
  const { structure, style, header, ...rest } = fields;
  return {
    ...rest,
    ruleSetId: ruleSetIdFor(rest.program),
    structure: json(structure),
    style: json(style),
    header: json(header),
  };
}

function toData(fields: Partial<ParsedFields>) {
  const { structure, style, header, ...rest } = fields;
  return {
    ...rest,
    ...(rest.program !== undefined && { ruleSetId: ruleSetIdFor(rest.program) }),
    ...(structure !== undefined && { structure: json(structure) }),
    ...(style !== undefined && { style: json(style) }),
    ...(header !== undefined && { header: json(header) }),
  };
}

/** Templates the actor may see: every GLOBAL one plus their own, never deleted ones. */
function visibleTo(actor: Actor): Prisma.TemplateWhereInput {
  return { deletedAt: null, OR: [{ visibility: "GLOBAL" }, { ownerId: actor.userId }] };
}

export type TemplateScope = "ALL" | "MINE" | "SHARED" | "BUILT_IN";

export type TemplateFilter = {
  program?: Program;
  examKind?: ExamKind;
  /** MINE = owned by the actor; SHARED = other people's global ones; BUILT_IN = seeds. */
  scope?: TemplateScope;
  /** Matches title or description. */
  search?: string;
};

function scopeWhere(actor: Actor, scope: TemplateScope): Prisma.TemplateWhereInput {
  switch (scope) {
    case "MINE":
      return { ownerId: actor.userId, builtIn: false };
    case "SHARED":
      return { ownerId: { not: actor.userId }, builtIn: false };
    case "BUILT_IN":
      return { builtIn: true };
    default:
      return {};
  }
}

export function templates(db: Db) {
  async function findVisible(actor: Actor, id: string) {
    const t = await db.template.findFirst({ where: { id, ...visibleTo(actor) } });
    if (!t) throw new NotFoundError(WHAT);
    return t;
  }

  return {
    list(actor: Actor, filter: TemplateFilter = {}) {
      const search = filter.search?.trim();
      return db.template.findMany({
        where: {
          AND: [
            visibleTo(actor),
            scopeWhere(actor, filter.scope ?? "ALL"),
            { program: filter.program, examKind: filter.examKind },
            search
              ? { OR: [{ title: { contains: search } }, { description: { contains: search } }] }
              : {},
          ],
        },
        include: { owner: { select: { name: true } } },
        orderBy: [{ builtIn: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
      });
    },

    get: findVisible,

    async create(actor: Actor, input: TemplateFields) {
      const fields = templateFieldsSchema.parse(input);
      assertValid(fields);
      const t = await db.template.create({
        data: {
          ...createData(fields),
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
      assertValid({ ...storedFields(t), ...fields });
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
      const merged = { ...storedFields(src), ...templatePatchSchema.parse(overrides) };
      assertValid(merged);
      const copy = await db.template.create({
        data: {
          ...createData(merged),
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

// ---------- system only: built-in templates ----------

export type SeedSyncResult = {
  created: number;
  updated: number;
  unchanged: number;
  /** True when no administrator exists yet, so there is no owner for the built-ins. */
  waitingForAdmin: boolean;
};

const comparable = (f: ParsedFields) => JSON.stringify(createData(f));

/**
 * Brings the built-in templates in line with the seeds: adds missing ones and
 * rewrites changed ones in place (version + 1). Papers keep their snapshot,
 * so changing a seed never changes a paper. Built-ins are never deleted.
 * They belong to the first administrator (D15); before setup this does nothing.
 */
export async function syncBuiltInTemplates(
  db: Db,
  seeds: readonly (TemplateFields & { seedKey: string })[],
): Promise<SeedSyncResult> {
  const result: SeedSyncResult = { created: 0, updated: 0, unchanged: 0, waitingForAdmin: false };
  const owner = await db.user.findFirst({
    where: { role: "ADMIN" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!owner) return { ...result, waitingForAdmin: true };
  const parsed = seeds.map(({ seedKey, ...f }) => {
    const fields = templateFieldsSchema.parse(f);
    assertValid(fields);
    return { seedKey, fields };
  });
  const existing = new Map(
    (await db.template.findMany({ where: { seedKey: { in: parsed.map((p) => p.seedKey) } } })).map(
      (t) => [t.seedKey, t],
    ),
  );
  await db.$transaction(async (tx) => {
    for (const { seedKey, fields } of parsed) {
      const old = existing.get(seedKey);
      const fixed = { builtIn: true, visibility: "GLOBAL" as const, deletedAt: null };
      if (!old) {
        await tx.template.create({
          data: { ...createData(fields), ...fixed, seedKey, ownerId: owner.id },
        });
        result.created++;
        continue;
      }
      const same =
        old.builtIn &&
        old.visibility === "GLOBAL" &&
        old.deletedAt === null &&
        comparable(storedFields(old)) === comparable(fields);
      if (same) {
        result.unchanged++;
        continue;
      }
      await tx.template.update({
        where: { id: old.id },
        data: { ...createData(fields), ...fixed, version: { increment: 1 } },
      });
      result.updated++;
    }
  });
  return result;
}
