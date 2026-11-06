// Papers are always private to their owner in v1 (SPEC §7), admins included.
// Anything that is not the actor's own paper is "not found".
import { z } from "zod";
import type { CompileKind, CompileStatus, SnapshotReason } from "@/generated/prisma/enums";
import { BloomLevel, ExamKind, PaperStatus, Program } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/lib/db/client";
import { advancedSnippets, imageShas, onlyKnownSnippets } from "@/lib/paper/content";
import { questionNumbers } from "@/lib/paper/numbering";
import { keyCriteriaSchema } from "@/lib/paper/key";
import { type Doc, docSchema } from "@/lib/paper/schema";
import { type PaperSnapshot, paperSnapshotSchema } from "@/lib/paper/snapshot";
import { versionDataSchema, versionHash, versionOf } from "@/lib/paper/version";
import { EXAM_GROUPS, EXAM_GROUP_KEYS } from "@/lib/templates/labels";
import type { Actor } from "./actor";
import { assertOwnsAssets, headerUploads, shareAssets } from "./assets";
import { writeAudit } from "./audit";
import { parsePatch } from "./patch";
import { ConflictError, ForbiddenError, NotFoundError, STALE_VERSION } from "./errors";
import { storedFields } from "./templates";

const WHAT = "Paper";
/** SPEC §6: keep the last 20 compile jobs per paper. */
export const COMPILE_HISTORY = 20;
/** D58: keep the newest 20 version snapshots per paper. */
export const VERSION_HISTORY = 20;

/** D56: Final and Printed papers are read-only until the user chooses Edit. */
export const PAPER_LOCKED =
  "This paper is marked Final or Printed. Choose Edit to put it back to Draft before changing it.";
export const PRINTED_BY_EXPORT = "A paper is marked Printed by exporting it.";

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

/** "Duplicate paper": a new title, and the exam it is for (ATKT copies, SPEC §1; D60). */
export const duplicateInputSchema = z.object({
  title: z.string().trim().min(1, "Give the copy a title.").max(200),
  examKind: z.enum(ExamKind),
  examDate: z.date().nullable().default(null),
  /** "Next academic year" (D60); the source's year when left out. */
  academicYear: z.string().trim().max(20).optional(),
});

/** Papers list search and filters (D59). Every field optional; empty means "any". */
export const paperFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  group: z.enum(EXAM_GROUP_KEYS).optional(),
  year: z.string().trim().max(20).optional(),
  status: z.enum(PaperStatus).optional(),
  course: z.string().trim().max(40).optional(),
});
export type PaperFilter = z.input<typeof paperFilterSchema>;
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

  /** The actor's own paper, if it is a Draft (D56); Final and Printed papers refuse changes. */
  async function findEditable(actor: Actor, id: string) {
    const p = await findOwn(actor, id);
    if (p.status !== "DRAFT") throw new ConflictError(PAPER_LOCKED);
    return p;
  }

  /**
   * Keeps a version of the paper as it is now (D57). Nothing is added when the
   * newest version has the same content; only the newest VERSION_HISTORY stay.
   */
  async function takeVersion(paperId: string, reason: SnapshotReason) {
    const p = await db.paper.findUniqueOrThrow({
      where: { id: paperId },
      include: { slots: true },
    });
    const data = versionOf(p, p.slots);
    const sha256 = versionHash(data);
    const newest = await db.paperSnapshot.findFirst({
      where: { paperId },
      orderBy: { createdAt: "desc" },
      select: { sha256: true },
    });
    if (newest?.sha256 === sha256) return;
    await db.paperSnapshot.create({ data: { paperId, reason, sha256, data: json(data) } });
    const old = await db.paperSnapshot.findMany({
      where: { paperId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: VERSION_HISTORY,
      select: { id: true },
    });
    if (old.length > 0) {
      await db.paperSnapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
  }

  /** A version of one of the actor's papers (not in Trash), or "not found". */
  async function findVersion(actor: Actor, paperId: string, versionId: string) {
    const paper = await findOwn(actor, paperId);
    const v = await db.paperSnapshot.findFirst({ where: { id: versionId, paperId: paper.id } });
    if (!v) throw new NotFoundError("Version");
    return { paper, version: v, data: versionDataSchema.parse(v.data) };
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
    /**
     * The actor's papers, most recently edited first, narrowed by search and
     * filters (D59). The text search runs here, not in SQL: SQLite LIKE treats
     * % and _ as wildcards and folds only ASCII case; one person's papers are few.
     */
    async list(actor: Actor, filter: PaperFilter = {}) {
      const f = paperFilterSchema.parse(filter);
      const rows = await db.paper.findMany({
        where: {
          ownerId: actor.userId,
          deletedAt: null,
          ...(f.group && { examKind: { in: [...EXAM_GROUPS[f.group].kinds] } }),
          ...(f.year && { academicYear: f.year }),
          ...(f.status && { status: f.status }),
          ...(f.course && { courseCode: f.course }),
        },
        orderBy: { updatedAt: "desc" },
      });
      const q = f.q?.toLocaleLowerCase("en");
      if (!q) return rows;
      return rows.filter((p) =>
        [p.title, p.courseCode, p.courseTitle].some((x) => x.toLocaleLowerCase("en").includes(q)),
      );
    },

    /** The last `n` papers the actor edited, for the home screen. */
    recent(actor: Actor, n = 5) {
      return db.paper.findMany({
        where: { ownerId: actor.userId, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: n,
      });
    },

    /** What the Papers filters can offer: the years and courses of the actor's own papers. */
    async filterOptions(actor: Actor) {
      const where = { ownerId: actor.userId, deletedAt: null };
      const [years, courses] = await Promise.all([
        db.paper.findMany({
          where: { ...where, academicYear: { not: "" } },
          distinct: ["academicYear"],
          select: { academicYear: true },
          orderBy: { academicYear: "desc" },
        }),
        db.paper.findMany({
          where: { ...where, courseCode: { not: "" } },
          distinct: ["courseCode"],
          select: { courseCode: true, courseTitle: true },
          orderBy: { courseCode: "asc" },
        }),
      ]);
      return {
        years: years.map((y) => y.academicYear),
        courses: courses.map((c) => ({ code: c.courseCode, title: c.courseTitle })),
      };
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
      if (m.status === "PRINTED") throw new ConflictError(PRINTED_BY_EXPORT);
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

    /**
     * Changes the paper's details. A Final or Printed paper accepts only
     * {status: "DRAFT"} ("Edit", D56); Printed is set by export only (D55).
     * Marking a paper Final keeps a version of it (D57).
     */
    async update(actor: Actor, id: string, version: number, patch: PaperPatch) {
      const before = await findOwn(actor, id);
      const m = parsePatch(paperPatchSchema, patch);
      if (m.status === "PRINTED") throw new ConflictError(PRINTED_BY_EXPORT);
      const reopen = before.status !== "DRAFT" && m.status === "DRAFT";
      if (before.status !== "DRAFT") {
        const others = Object.keys(m).filter((k) => k !== "status");
        if (!reopen || others.length > 0) throw new ConflictError(PAPER_LOCKED);
      }
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
      await writeAudit(db, {
        actorId: actor.userId,
        action: reopen ? "reopen" : "update",
        entity: WHAT,
        entityId: id,
      });
      if (before.status !== "FINAL" && m.status === "FINAL") await takeVersion(id, "FINAL");
      return findOwn(actor, id);
    },

    /**
     * After a successful export (D55): the paper becomes Printed with the time,
     * and a version is kept (D57). Returns the new version number.
     */
    async markPrinted(actor: Actor, id: string, at: Date = new Date()) {
      await findOwn(actor, id);
      const p = await db.paper.update({
        where: { id },
        data: { status: "PRINTED", printedAt: at, version: { increment: 1 } },
      });
      await writeAudit(db, { actorId: actor.userId, action: "print", entity: WHAT, entityId: id });
      await takeVersion(id, "EXPORT");
      return p.version;
    },

    /** The paper's versions, newest first (D57); content is read only when one is opened. */
    async listVersions(actor: Actor, paperId: string) {
      await findOwn(actor, paperId);
      return db.paperSnapshot.findMany({
        where: { paperId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, reason: true, createdAt: true },
      });
    },

    /** One version's content, e.g. to compile it as a PDF. */
    async getVersion(actor: Actor, paperId: string, versionId: string) {
      const { version, data } = await findVersion(actor, paperId, versionId);
      return { id: version.id, reason: version.reason, createdAt: version.createdAt, data };
    },

    /** Restores a version as a new Draft paper with no date (D57), linked to its paper. */
    async restoreVersion(actor: Actor, paperId: string, versionId: string, title: string) {
      const { paper, data } = await findVersion(actor, paperId, versionId);
      const t = z.string().trim().min(1, "Give the copy a title.").max(200).parse(title);
      const v = data.paper;
      // The course and template may have gone since; the copy keeps its own snapshot either way.
      const course = v.courseId
        ? await db.course.findUnique({ where: { id: v.courseId }, select: { id: true } })
        : null;
      const template = v.templateId
        ? await db.template.findUnique({ where: { id: v.templateId }, select: { id: true } })
        : null;
      const copy = await db.$transaction(async (tx) => {
        const p = await tx.paper.create({
          data: {
            ownerId: actor.userId,
            templateId: template?.id ?? null,
            templateSnapshot: json(v.templateSnapshot),
            title: t,
            courseId: course?.id ?? null,
            courseCode: v.courseCode,
            courseTitle: v.courseTitle,
            program: v.program,
            semesterOrYear: v.semesterOrYear,
            examKind: v.examKind,
            academicYear: v.academicYear,
            examDate: null,
            instructionsOverride: nullableJson(v.instructionsOverride),
            status: "DRAFT",
            derivedFromPaperId: paper.id,
          },
        });
        await tx.slot.createMany({
          data: data.slots.map((x) => ({
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
        action: "restore-version",
        entity: WHAT,
        entityId: copy.id,
      });
      return copy;
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
      const paper = await findEditable(actor, paperId);
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
            academicYear: d.academicYear ?? src.academicYear,
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
      const paper = await findEditable(actor, paperId);
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
      const paper = await findEditable(actor, paperId);
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
      const paper = await findEditable(actor, paperId);
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
