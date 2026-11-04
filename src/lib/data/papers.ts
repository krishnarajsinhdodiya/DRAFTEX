// Papers are always private to their owner in v1 (SPEC §7), admins included.
// Anything that is not the actor's own paper is "not found".
import { z } from "zod";
import type { CompileKind, CompileStatus } from "@/generated/prisma/enums";
import { BloomLevel, ExamKind, PaperStatus, Program } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/lib/db/client";
import { advancedSnippets, imageShas, onlyKnownSnippets } from "@/lib/paper/content";
import { questionNumbers } from "@/lib/paper/numbering";
import { keyCriteriaSchema } from "@/lib/paper/key";
import { type Doc, docSchema } from "@/lib/paper/schema";
import { type PaperSnapshot, paperSnapshotSchema } from "@/lib/paper/snapshot";
import type { Actor } from "./actor";
import { assertOwnsAssets, headerUploads, shareAssets } from "./assets";
import { writeAudit } from "./audit";
import { parsePatch } from "./patch";
import { ConflictError, ForbiddenError, NotFoundError, STALE_VERSION } from "./errors";
import { storedFields } from "./templates";

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

export const slotPlaceSchema = z.object({
  groupKey: key,
  position: z.number().int().min(1).max(100),
});
export type SlotPlace = z.input<typeof slotPlaceSchema>;

export const ADVANCED_NOT_ALLOWED =
  "Advanced LaTeX is turned off for your account. Ask an administrator to allow it.";

export const slotInputSchema = z.object({
  /** Optional: the part follows from the group in the paper's template. */
  partKey: key.optional(),
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
  /** The answer key (D24); left as it is when not sent. */
  answerKey: docSchema.nullable().optional(),
  keyCriteria: keyCriteriaSchema.nullable().optional(),
});
export type SlotInput = z.input<typeof slotInputSchema>;

/** "Duplicate paper": a new title, and the exam it is for (ATKT copies, SPEC §1). */
export const duplicateInputSchema = z.object({
  title: z.string().trim().min(1, "Give the copy a title.").max(200),
  examKind: z.enum(ExamKind),
  examDate: z.date().nullable().default(null),
});
export type DuplicateInput = z.input<typeof duplicateInputSchema>;

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
    // A paper in Trash (D51) is "not found" to everything but the Trash itself.
    const p = await db.paper.findFirst({ where: { id, ownerId: actor.userId, deletedAt: null } });
    if (!p) throw new NotFoundError(WHAT);
    return p;
  }

  /** The paper's own copy of its template; every slot is checked against it. */
  function snapshotOf(p: { templateSnapshot: unknown }): PaperSnapshot {
    return paperSnapshotSchema.parse(p.templateSnapshot);
  }

  /** The group at `place` in the snapshot, or "not found" for a place the paper does not have. */
  function placeIn(snapshot: PaperSnapshot, place: SlotPlace) {
    const part = snapshot.structure.parts.find((x) =>
      x.groups.some((g) => g.key === place.groupKey),
    );
    const group = part?.groups.find((g) => g.key === place.groupKey);
    if (!part || !group || place.position > group.slots) throw new NotFoundError("Question");
    return { partKey: part.key, group };
  }

  function labelOf(snapshot: PaperSnapshot, groupKey: string): string {
    const n = questionNumbers(snapshot.structure).find((x) => x.key === groupKey);
    return n?.label ?? n?.printed[0] ?? groupKey;
  }

  async function slotAt(
    paperId: string,
    place: { partKey: string; groupKey: string; position: number },
  ) {
    return db.slot.findUnique({
      where: {
        paperId_partKey_groupKey_position: {
          paperId,
          partKey: place.partKey,
          groupKey: place.groupKey,
          position: place.position,
        },
      },
    });
  }

  async function touch(paperId: string) {
    await db.paper.update({ where: { id: paperId }, data: { updatedAt: new Date() } });
  }

  async function checkCourse(courseId: string | null | undefined) {
    if (
      courseId &&
      !(await db.course.findUnique({ where: { id: courseId }, select: { id: true } }))
    ) {
      throw new NotFoundError("Course");
    }
  }

  /**
   * Advanced LaTeX needs the admin's permission; a user whose permission was
   * turned off may keep, but not add, blocks.
   */
  async function checkAdvanced(actor: Actor, next: Doc[], prev: Doc[]) {
    const snippets = next.flatMap(advancedSnippets);
    if (snippets.length === 0) return;
    const user = await db.user.findUnique({
      where: { id: actor.userId },
      select: { allowAdvancedLatex: true },
    });
    if (user?.allowAdvancedLatex) return;
    if (!onlyKnownSnippets(snippets, prev.flatMap(advancedSnippets))) {
      throw new ForbiddenError(ADVANCED_NOT_ALLOWED);
    }
  }

  function storedDoc(value: unknown): Doc[] {
    return value === null || value === undefined ? [] : [docSchema.parse(value) as Doc];
  }

  return {
    list(actor: Actor) {
      return db.paper.findMany({
        where: { ownerId: actor.userId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
      });
    },

    get: findOwn,

    /** The paper with its slots, e.g. to compile or export it. */
    async getWithSlots(actor: Actor, id: string) {
      const p = await db.paper.findFirst({
        where: { id, ownerId: actor.userId, deletedAt: null },
        include: {
          slots: { orderBy: [{ partKey: "asc" }, { groupKey: "asc" }, { position: "asc" }] },
        },
      });
      if (!p) throw new NotFoundError(WHAT);
      return {
        ...p,
        snapshot: snapshotOf(p),
        slots: p.slots.map((x) => ({ ...x, content: docSchema.parse(x.content) as Doc })),
      };
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
          templateSnapshot: json(paperSnapshotSchema.parse(storedFields(t))),
        },
      });
      await shareAssets(db, t.ownerId, actor.userId, headerUploads(storedFields(t).header));
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
      const m = parsePatch(paperPatchSchema, patch);
      await checkCourse(m.courseId);
      const { instructionsOverride, ...rest } = m;
      const { count } = await db.paper.updateMany({
        where: { id, ownerId: actor.userId, deletedAt: null, version },
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

    /** Moves the paper to Trash (D51); restore brings it back, purge removes it for good. */
    async remove(actor: Actor, id: string) {
      await findOwn(actor, id);
      await db.paper.update({ where: { id }, data: { deletedAt: new Date() } });
      await writeAudit(db, { actorId: actor.userId, action: "trash", entity: WHAT, entityId: id });
    },

    /** The actor's papers in Trash, most recently deleted first, with the days each has left. */
    async listTrash(actor: Actor, now: Date = new Date()) {
      const rows = await db.paper.findMany({
        where: { ownerId: actor.userId, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        select: { id: true, title: true, courseCode: true, examKind: true, deletedAt: true },
      });
      return rows.map((p) => {
        const deletedAt = p.deletedAt ?? now;
        const left = deletedAt.getTime() + TRASH_DAYS * 86_400_000 - now.getTime();
        return { ...p, deletedAt, daysLeft: Math.max(0, Math.ceil(left / 86_400_000)) };
      });
    },

    async restore(actor: Actor, id: string) {
      const { count } = await db.paper.updateMany({
        where: { id, ownerId: actor.userId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (count === 0) throw new NotFoundError(WHAT);
      await writeAudit(db, {
        actorId: actor.userId,
        action: "restore",
        entity: WHAT,
        entityId: id,
      });
    },

    /** Deletes a paper in Trash for good, with its questions. */
    async purge(actor: Actor, id: string) {
      const { count } = await db.paper.deleteMany({
        where: { id, ownerId: actor.userId, deletedAt: { not: null } },
      });
      if (count === 0) throw new NotFoundError(WHAT);
      await writeAudit(db, { actorId: actor.userId, action: "delete", entity: WHAT, entityId: id });
    },

    /** Deletes every paper in the actor's Trash for good; returns how many. */
    async emptyTrash(actor: Actor): Promise<number> {
      const { count } = await db.paper.deleteMany({
        where: { ownerId: actor.userId, deletedAt: { not: null } },
      });
      if (count > 0) {
        await writeAudit(db, {
          actorId: actor.userId,
          action: "empty-trash",
          entity: WHAT,
          detail: String(count),
        });
      }
      return count;
    },

    /**
     * Creates or replaces the question at (group, position). Pictures must be
     * the actor's own uploads; Advanced LaTeX needs the admin's permission
     * (a user whose permission was turned off may keep, but not add, blocks).
     */
    async saveSlot(actor: Actor, paperId: string, input: SlotInput) {
      const paper = await findOwn(actor, paperId);
      const s = slotInputSchema.parse(input);
      const { partKey } = placeIn(snapshotOf(paper), s);
      if (s.partKey !== undefined && s.partKey !== partKey) throw new NotFoundError("Question");
      await assertOwnsAssets(db, actor.userId, [
        ...imageShas(s.content),
        ...(s.answerKey ? imageShas(s.answerKey) : []),
      ]);
      const prev = await slotAt(paperId, { ...s, partKey });
      await checkAdvanced(
        actor,
        [s.content, ...(s.answerKey ? [s.answerKey] : [])],
        prev ? [...storedDoc(prev.content), ...storedDoc(prev.answerKey)] : [],
      );
      const data = {
        content: json(s.content),
        marks: s.marks,
        coTag: s.coTag,
        bloomLevel: s.bloomLevel,
        ...(s.answerKey !== undefined && { answerKey: nullableJson(s.answerKey) }),
        ...(s.keyCriteria !== undefined && {
          keyCriteria: nullableJson(s.keyCriteria?.length ? s.keyCriteria : null),
        }),
      };
      const slot = await db.slot.upsert({
        where: {
          paperId_partKey_groupKey_position: {
            paperId,
            partKey,
            groupKey: s.groupKey,
            position: s.position,
          },
        },
        create: { paperId, partKey, groupKey: s.groupKey, position: s.position, ...data },
        update: data,
      });
      await touch(paperId);
      return slot;
    },

    /**
     * Copies one of the actor's papers with every question and key, e.g. a
     * regular paper into its ATKT version. The copy is a draft with no date.
     */
    async duplicate(actor: Actor, id: string, input: DuplicateInput) {
      const src = await db.paper.findFirst({
        where: { id, ownerId: actor.userId, deletedAt: null },
        include: { slots: true },
      });
      if (!src) throw new NotFoundError(WHAT);
      const d = duplicateInputSchema.parse(input);
      const copy = await db.$transaction(async (tx) => {
        const p = await tx.paper.create({
          data: {
            ownerId: actor.userId,
            templateId: src.templateId,
            templateSnapshot: json(src.templateSnapshot),
            title: d.title,
            courseId: src.courseId,
            courseCode: src.courseCode,
            courseTitle: src.courseTitle,
            program: src.program,
            semesterOrYear: src.semesterOrYear,
            examKind: d.examKind,
            academicYear: src.academicYear,
            examDate: d.examDate,
            instructionsOverride: nullableJson(src.instructionsOverride),
            status: "DRAFT",
            derivedFromPaperId: src.id,
          },
        });
        await tx.slot.createMany({
          data: src.slots.map((x) => ({
            paperId: p.id,
            partKey: x.partKey,
            groupKey: x.groupKey,
            position: x.position,
            content: json(x.content),
            marks: x.marks,
            coTag: x.coTag,
            bloomLevel: x.bloomLevel,
            answerKey: nullableJson(x.answerKey),
            keyCriteria: nullableJson(x.keyCriteria),
          })),
        });
        return p;
      });
      await writeAudit(db, {
        actorId: actor.userId,
        action: "duplicate",
        entity: WHAT,
        entityId: copy.id,
      });
      return copy;
    },

    /** Empties the question at (group, position). Clearing an empty one is fine. */
    async clearSlot(actor: Actor, paperId: string, place: SlotPlace) {
      const paper = await findOwn(actor, paperId);
      const p = slotPlaceSchema.parse(place);
      const { partKey } = placeIn(snapshotOf(paper), p);
      await db.slot.deleteMany({ where: { paperId, partKey, ...p } });
      await touch(paperId);
    },

    /**
     * Moves a question to another place in the paper; whatever was there
     * takes its old place. The marks follow the place, not the question.
     */
    async moveSlot(actor: Actor, paperId: string, from: SlotPlace, to: SlotPlace) {
      const paper = await findOwn(actor, paperId);
      const snapshot = snapshotOf(paper);
      const a = slotPlaceSchema.parse(from);
      const b = slotPlaceSchema.parse(to);
      const pa = placeIn(snapshot, a);
      const pb = placeIn(snapshot, b);
      if (a.groupKey === b.groupKey && a.position === b.position) return;
      const [sa, sb] = await Promise.all([
        slotAt(paperId, { partKey: pa.partKey, ...a }),
        slotAt(paperId, { partKey: pb.partKey, ...b }),
      ]);
      const moved = (row: typeof sa, at: typeof pa, place: typeof a) =>
        row
          ? [
              db.slot.create({
                data: {
                  paperId,
                  partKey: at.partKey,
                  groupKey: place.groupKey,
                  position: place.position,
                  content: json(row.content),
                  // Within a group a question keeps its marks; in another group it takes that group's.
                  marks: row.groupKey === place.groupKey ? row.marks : at.group.marksEach,
                  coTag: row.coTag,
                  bloomLevel: row.bloomLevel,
                  answerKey: nullableJson(row.answerKey),
                  keyCriteria: nullableJson(row.keyCriteria),
                },
              }),
            ]
          : [];
      await db.$transaction([
        db.slot.deleteMany({ where: { id: { in: [sa?.id, sb?.id].filter(Boolean) as string[] } } }),
        ...moved(sa, pb, b),
        ...moved(sb, pa, a),
      ]);
      await touch(paperId);
    },

    /** Copies a question into the next empty place of its group; returns that place. */
    async duplicateSlot(actor: Actor, paperId: string, place: SlotPlace) {
      const paper = await findOwn(actor, paperId);
      const snapshot = snapshotOf(paper);
      const p = slotPlaceSchema.parse(place);
      const { partKey, group } = placeIn(snapshot, p);
      const src = await slotAt(paperId, { partKey, ...p });
      if (!src) throw new NotFoundError("Question");
      const taken = new Set(
        (
          await db.slot.findMany({
            where: { paperId, groupKey: p.groupKey },
            select: { position: true },
          })
        ).map((x) => x.position),
      );
      const order = [
        ...Array.from({ length: group.slots - p.position }, (_, i) => p.position + 1 + i),
        ...Array.from({ length: p.position - 1 }, (_, i) => i + 1),
      ];
      const free = order.find((n) => !taken.has(n));
      if (free === undefined) {
        throw new ConflictError(
          `Every question in ${labelOf(snapshot, p.groupKey)} is written. Clear one first.`,
        );
      }
      await db.slot.create({
        data: {
          paperId,
          partKey,
          groupKey: p.groupKey,
          position: free,
          content: json(src.content),
          marks: src.marks,
          coTag: src.coTag,
          bloomLevel: src.bloomLevel,
          answerKey: nullableJson(src.answerKey),
          keyCriteria: nullableJson(src.keyCriteria),
        },
      });
      await touch(paperId);
      return { groupKey: p.groupKey, position: free };
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

/** How long a paper stays in Trash before it is removed for good (D51). */
export const TRASH_DAYS = 30;

/** System only: removes papers that have been in Trash for TRASH_DAYS. */
export async function purgeOldTrash(db: Db, now: Date): Promise<number> {
  const before = new Date(now.getTime() - TRASH_DAYS * 86_400_000);
  const { count } = await db.paper.deleteMany({ where: { deletedAt: { not: null, lte: before } } });
  if (count > 0) {
    await writeAudit(db, {
      actorId: null,
      action: "purge-trash",
      entity: WHAT,
      detail: String(count),
    });
  }
  return count;
}
