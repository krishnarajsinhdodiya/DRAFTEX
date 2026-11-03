// Papers are always private to their owner in v1 (SPEC §7), admins included.
// Anything that is not the actor's own paper is "not found".
import { z } from "zod";
import type { CompileKind, CompileStatus } from "@/generated/prisma/enums";
import { BloomLevel, ExamKind, PaperStatus, Program } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/lib/db/client";
import { docSchema } from "@/lib/paper/schema";
import type { Actor } from "./actor";
import { writeAudit } from "./audit";
import { ConflictError, NotFoundError, STALE_VERSION } from "./errors";

const WHAT = "Paper";
/** SPEC §6: keep the last 20 compile jobs per paper. */
export const COMPILE_HISTORY = 20;

const key = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const paperMetaSchema = z.object({
  title: z.string().trim().min(1, "Give the paper a title.").max(200),
  courseId: z.string().max(64).nullable().default(null),
  courseCode: z.string().trim().max(40).default(""),
  courseTitle: z.string().trim().max(200).default(""),
  program: z.enum(Program),
  semesterOrYear: z.number().int().min(1).max(10),
  examKind: z.enum(ExamKind),
  academicYear: z.string().trim().max(20).default(""),
  examDate: z.date().nullable().default(null),
  instructionsOverride: z.array(z.string().max(500)).max(30).nullable().default(null),
  status: z.enum(PaperStatus).default("DRAFT"),
});
export type PaperMeta = z.input<typeof paperMetaSchema>;
export const paperPatchSchema = paperMetaSchema.partial();
export type PaperPatch = z.input<typeof paperPatchSchema>;

export const slotInputSchema = z.object({
  partKey: key,
  groupKey: key,
  position: z.number().int().min(1).max(100),
  content: docSchema,
  marks: z.number().positive().max(100),
  coTag: z
    .string()
    .regex(/^[A-Za-z0-9.]{1,20}$/)
    .nullable()
    .default(null),
  bloomLevel: z.enum(BloomLevel).nullable().default(null),
  answerKey: docSchema.nullable().default(null),
});
export type SlotInput = z.input<typeof slotInputSchema>;

export interface CompileRecord {
  kind: CompileKind;
  status: CompileStatus;
  durationMs?: number | null;
  /** Error kinds and line numbers only; never question text (SPEC §11.7). */
  errorSummary?: string | null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : json(value);
}

export function papers(db: Db) {
  async function findOwn(actor: Actor, id: string) {
    const p = await db.paper.findFirst({ where: { id, ownerId: actor.userId } });
    if (!p) throw new NotFoundError(WHAT);
    return p;
  }

  async function checkCourse(courseId: string | null | undefined) {
    if (
      courseId &&
      !(await db.course.findUnique({ where: { id: courseId }, select: { id: true } }))
    ) {
      throw new NotFoundError("Course");
    }
  }

  return {
    list(actor: Actor) {
      return db.paper.findMany({
        where: { ownerId: actor.userId },
        orderBy: { updatedAt: "desc" },
      });
    },

    get: findOwn,

    /** The paper with its slots, e.g. to compile or export it. */
    async getWithSlots(actor: Actor, id: string) {
      const p = await db.paper.findFirst({
        where: { id, ownerId: actor.userId },
        include: {
          slots: { orderBy: [{ partKey: "asc" }, { groupKey: "asc" }, { position: "asc" }] },
        },
      });
      if (!p) throw new NotFoundError(WHAT);
      return p;
    },

    /** Starts a paper from a template the actor can see, keeping a snapshot of it. */
    async create(actor: Actor, templateId: string, meta: PaperMeta) {
      const t = await db.template.findFirst({
        where: {
          id: templateId,
          deletedAt: null,
          OR: [{ visibility: "GLOBAL" }, { ownerId: actor.userId }],
        },
      });
      if (!t) throw new NotFoundError("Template");
      const m = paperMetaSchema.parse(meta);
      await checkCourse(m.courseId);
      const p = await db.paper.create({
        data: {
          ...m,
          instructionsOverride: nullableJson(m.instructionsOverride),
          ownerId: actor.userId,
          templateId: t.id,
          templateSnapshot: json({ structure: t.structure, style: t.style, header: t.header }),
        },
      });
      await writeAudit(db, {
        actorId: actor.userId,
        action: "create",
        entity: WHAT,
        entityId: p.id,
      });
      return p;
    },

    async update(actor: Actor, id: string, version: number, patch: PaperPatch) {
      await findOwn(actor, id);
      const m = paperPatchSchema.parse(patch);
      await checkCourse(m.courseId);
      const { instructionsOverride, ...rest } = m;
      const { count } = await db.paper.updateMany({
        where: { id, ownerId: actor.userId, version },
        data: {
          ...rest,
          ...(instructionsOverride !== undefined && {
            instructionsOverride: nullableJson(instructionsOverride),
          }),
          version: { increment: 1 },
        },
      });
      if (count === 0) throw new ConflictError(STALE_VERSION);
      await writeAudit(db, { actorId: actor.userId, action: "update", entity: WHAT, entityId: id });
      return findOwn(actor, id);
    },

    async remove(actor: Actor, id: string) {
      await findOwn(actor, id);
      await db.paper.delete({ where: { id } });
      await writeAudit(db, { actorId: actor.userId, action: "delete", entity: WHAT, entityId: id });
    },

    /** Creates or replaces the slot at (part, group, position) of the actor's paper. */
    async saveSlot(actor: Actor, paperId: string, input: SlotInput) {
      await findOwn(actor, paperId);
      const s = slotInputSchema.parse(input);
      const data = {
        content: json(s.content),
        marks: s.marks,
        coTag: s.coTag,
        bloomLevel: s.bloomLevel,
        answerKey: nullableJson(s.answerKey),
      };
      const slot = await db.slot.upsert({
        where: {
          paperId_partKey_groupKey_position: {
            paperId,
            partKey: s.partKey,
            groupKey: s.groupKey,
            position: s.position,
          },
        },
        create: {
          paperId,
          partKey: s.partKey,
          groupKey: s.groupKey,
          position: s.position,
          ...data,
        },
        update: data,
      });
      await db.paper.update({ where: { id: paperId }, data: { updatedAt: new Date() } });
      return slot;
    },

    async removeSlot(actor: Actor, paperId: string, slotId: string) {
      await findOwn(actor, paperId);
      const { count } = await db.slot.deleteMany({ where: { id: slotId, paperId } });
      if (count === 0) throw new NotFoundError("Question");
    },

    /** Records a compile and keeps only the newest COMPILE_HISTORY jobs for the paper. */
    async recordCompile(actor: Actor, paperId: string, rec: CompileRecord) {
      await findOwn(actor, paperId);
      const job = await db.compileJob.create({
        data: {
          paperId,
          kind: rec.kind,
          status: rec.status,
          durationMs: rec.durationMs ?? null,
          errorSummary: rec.errorSummary ?? null,
        },
      });
      const old = await db.compileJob.findMany({
        where: { paperId },
        orderBy: { id: "desc" },
        skip: COMPILE_HISTORY,
        select: { id: true },
      });
      if (old.length > 0)
        await db.compileJob.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      return job;
    },

    async listCompiles(actor: Actor, paperId: string) {
      await findOwn(actor, paperId);
      return db.compileJob.findMany({
        where: { paperId },
        orderBy: { id: "desc" },
      });
    },
  };
}
