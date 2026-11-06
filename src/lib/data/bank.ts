// The question bank (Phase 11). Who sees what (D73, D74):
//   a user sees bank question Q only when Q is not in Trash and
//   (the user wrote Q, or Q is SHARED, or Q's author shares Q's course).
// Only the author may change, share, delete or restore Q. Administrators get
// nothing extra: someone else's private question is "not found" to them too.
// Usage history (D75) is per user: nobody sees another person's uses.
import { createHash } from "node:crypto";
import { z } from "zod";
import { BankSharing, BloomLevel } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/lib/db/client";
import {
  BANK_TYPES,
  type BankCourse,
  type BankFields,
  type BankFieldsInput,
  bankFieldsSchema,
  bankCheck,
  coNote,
  courseCodeSchema,
  dupSource,
  isEmptyDoc,
  plainText,
  subPartCoTags,
  unprintableChars,
} from "@/lib/bank/question";
import { advancedSnippets, imageShas, onlyKnownSnippets } from "@/lib/paper/content";
import { questionNumbers } from "@/lib/paper/numbering";
import { type Doc, docSchema } from "@/lib/paper/schema";
import { keyCriteriaSchema } from "@/lib/paper/key";
import { CO_TAG_RE } from "@/lib/paper/co-tag";
import type { Actor } from "./actor";
import { assertOwnsAssets, shareAssets } from "./assets";
import { writeAudit } from "./audit";
import {
  ConflictError,
  ForbiddenError,
  InvalidQuestionError,
  NotFoundError,
  STALE_VERSION,
} from "./errors";
import { ADVANCED_NOT_ALLOWED, papers, slotPlaceSchema, type SlotPlace } from "./papers";

const WHAT = "Question";
/** How long a bank question stays in Trash before it is removed for good (D82, as D51). */
export const BANK_TRASH_DAYS = 30;
export const BANK_PAGE_SIZE = 50;

export const ALREADY_IN_BANK = "Already in your bank";
export const ALREADY_IN_TRASH = "Already in your Trash";

/** Bank list search and filters (D83); every field optional, empty means "any". */
export const bankFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** Course code (D72 amended: courses outside the catalogue too). */
  course: z.string().trim().max(40).optional(),
  unit: z.coerce.number().int().min(1).max(20).optional(),
  co: z.string().regex(CO_TAG_RE).optional(),
  bloom: z.enum(BloomLevel).optional(),
  marks: z.coerce.number().positive().max(100).optional(),
  type: z.enum(BANK_TYPES).optional(),
  /** "mine": only the actor's own; "shared": only colleagues' shared ones. */
  scope: z.enum(["mine", "shared"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type BankFilter = z.input<typeof bankFilterSchema>;

export interface SkipRow {
  label: string;
  reason: string;
}
export interface AddReport {
  /** Added questions; `warning` names a CO or unit outside the syllabus lists (D85). */
  added: { label: string; id: string; warning?: string }[];
  skipped: SkipRow[];
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : json(value);
}

export function dupKeyOf(doc: Doc): string {
  return createHash("sha256").update(dupSource(doc)).digest("hex");
}

const courseDetail = {
  outcomes: { select: { number: true }, orderBy: { number: "asc" } },
  units: { select: { number: true }, orderBy: { number: "asc" } },
} as const satisfies Prisma.CourseInclude;

type StoredQuestion = Prisma.QuestionGetPayload<object>;

/** A stored row as the screens use it: JSON parsed, tags a string array. */
function shape(q: StoredQuestion) {
  return {
    ...q,
    content: docSchema.parse(q.content) as Doc,
    answerKey: q.answerKey === null ? null : (docSchema.parse(q.answerKey) as Doc),
    keyCriteria: q.keyCriteria === null ? null : keyCriteriaSchema.parse(q.keyCriteria),
    tags: z.array(z.string()).catch([]).parse(q.tags),
  };
}
export type BankQuestion = ReturnType<typeof shape>;

export function bank(db: Db) {
  const paperData = papers(db);

  /** D73 as a query: own, SHARED, or covered by the author's course share; never Trash. */
  async function visibleWhere(actor: Actor): Promise<Prisma.QuestionWhereInput> {
    const shares = await db.bankCourseShare.findMany({
      select: { ownerId: true, courseCode: true },
    });
    return {
      deletedAt: null,
      OR: [
        { ownerId: actor.userId },
        { sharing: "SHARED" },
        ...shares.map((s) => ({ ownerId: s.ownerId, courseCode: s.courseCode })),
      ],
    };
  }

  async function findVisible(actor: Actor, id: string) {
    const q = await db.question.findFirst({ where: { id, ...(await visibleWhere(actor)) } });
    if (!q) throw new NotFoundError(WHAT);
    return q;
  }

  /** The actor's own question, not in Trash; anything else is "not found" (D74). */
  async function findOwn(actor: Actor, id: string) {
    const q = await db.question.findFirst({
      where: { id, ownerId: actor.userId, deletedAt: null },
    });
    if (!q) throw new NotFoundError(WHAT);
    return q;
  }

  type ResolvedCourse = BankCourse & {
    id: string | null;
    title: string;
    program: "B_PHARM" | "M_PHARM" | "PHARM_D";
  };

  /**
   * The course a question is for (D72 amended): the catalogue course when an
   * id is given or the typed code is a catalogue code (its COs are then
   * checked), otherwise the typed course with no CO list.
   */
  async function resolveCourse(input: {
    courseId: string | null;
    courseCode: string;
    courseTitle: string;
    program: ResolvedCourse["program"];
  }): Promise<ResolvedCourse> {
    const c = input.courseId
      ? await db.course.findUnique({ where: { id: input.courseId }, include: courseDetail })
      : await db.course.findUnique({ where: { code: input.courseCode }, include: courseDetail });
    if (input.courseId && !c) throw new NotFoundError("Course");
    // The syllabus gives defaults only (D85): a typed title wins over the catalogue's.
    if (c) return { ...c, title: input.courseTitle || c.title, program: c.program };
    return {
      id: null,
      code: input.courseCode,
      title: input.courseTitle,
      program: input.program,
      outcomes: [],
      units: [],
    };
  }

  /** Advanced LaTeX needs the admin's permission (same rule as a slot). */
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

  /** The actor's own questions (Trash included) in this course with this key, other than `except`. */
  async function duplicatesOf(actor: Actor, courseCode: string, dupKey: string, except?: string) {
    return db.question.findMany({
      where: { ownerId: actor.userId, courseCode, dupKey, ...(except && { id: { not: except } }) },
      select: { id: true, deletedAt: true },
    });
  }

  /**
   * Checks a question; throws with every error. Returns the fields as stored
   * and the warnings (a CO or unit outside the syllabus lists, D85).
   */
  async function validated(actor: Actor, input: BankFieldsInput, prev: Doc[]) {
    const parsed = bankFieldsSchema.parse(input);
    const course = await resolveCourse(parsed);
    const f = {
      ...parsed,
      courseId: course.id,
      courseCode: course.code,
      courseTitle: course.title,
      program: course.program,
    };
    const { errors, warnings } = bankCheck(f, course);
    if (errors.length) throw new InvalidQuestionError(errors);
    await assertOwnsAssets(db, actor.userId, [
      ...imageShas(f.content),
      ...(f.answerKey ? imageShas(f.answerKey) : []),
    ]);
    await checkAdvanced(actor, [f.content, ...(f.answerKey ? [f.answerKey] : [])], prev);
    return { f, warnings };
  }

  function columns(f: BankFields) {
    return {
      courseId: f.courseId,
      courseCode: f.courseCode,
      courseTitle: f.courseTitle,
      program: f.program,
      unit: f.unit,
      coTag: f.coTag,
      bloomLevel: f.bloomLevel,
      marks: f.marks,
      type: f.type,
      content: json(f.content),
      answerKey: nullableJson(f.answerKey),
      keyCriteria: nullableJson(f.keyCriteria?.length ? f.keyCriteria : null),
      tags: json(f.tags),
      dupKey: dupKeyOf(f.content),
      searchText: plainText(f.content),
    };
  }

  function storedDocs(q: { content: unknown; answerKey: unknown }): Doc[] {
    return [q.content, q.answerKey]
      .filter((x) => x !== null && x !== undefined)
      .map((x) => docSchema.parse(x) as Doc);
  }

  async function audit(actor: Actor, action: string, id?: string, detail?: string) {
    await writeAudit(db, {
      actorId: actor.userId,
      action,
      entity: WHAT,
      entityId: id ?? null,
      detail: detail ?? null,
    });
  }

  return {
    /**
     * Questions the actor may see (D73), newest first, narrowed by the filters.
     * Text search runs here, not in SQL (as D59): SQLite LIKE treats % and _
     * as wildcards. Each row carries the actor's own last use only (D75).
     */
    async list(actor: Actor, filter: BankFilter = {}) {
      const f = bankFilterSchema.parse(filter);
      const visible = await visibleWhere(actor);
      const rows = await db.question.findMany({
        where: {
          AND: [
            visible,
            {
              ...(f.course && { courseCode: f.course }),
              ...(f.unit && { unit: f.unit }),
              ...(f.co && { coTag: f.co }),
              ...(f.bloom && { bloomLevel: f.bloom }),
              ...(f.marks && { marks: f.marks }),
              ...(f.type && { type: f.type }),
              ...(f.scope === "mine" && { ownerId: actor.userId }),
              ...(f.scope === "shared" && { ownerId: { not: actor.userId } }),
            },
          ],
        },
        include: {
          course: { select: { code: true, title: true } },
          owner: { select: { name: true } },
          uses: {
            where: { userId: actor.userId },
            orderBy: { usedAt: "desc" },
            take: 1,
            select: { paperTitle: true, usedAt: true, paperId: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      });
      const q = f.q?.toLocaleLowerCase("en");
      const hits = q
        ? rows.filter((r) =>
            [r.searchText ?? "", ...z.array(z.string()).catch([]).parse(r.tags)].some((x) =>
              x.toLocaleLowerCase("en").includes(q),
            ),
          )
        : rows;
      const start = (f.page - 1) * BANK_PAGE_SIZE;
      return {
        total: hits.length,
        page: f.page,
        pageSize: BANK_PAGE_SIZE,
        rows: hits.slice(start, start + BANK_PAGE_SIZE).map(({ uses, owner, ...r }) => ({
          ...shape(r),
          course: r.course,
          ownerName: owner.name,
          mine: r.ownerId === actor.userId,
          lastUse: uses[0] ?? null,
        })),
      };
    },

    /** What the bank filters can offer: courses and COs of the questions the actor can see. */
    async filterOptions(actor: Actor) {
      const visible = await visibleWhere(actor);
      const rows = await db.question.findMany({
        where: { ...visible, courseCode: { not: null } },
        distinct: ["courseCode"],
        select: { courseCode: true, courseTitle: true },
      });
      return rows
        .map((r) => ({ code: r.courseCode ?? "", title: r.courseTitle ?? "" }))
        .sort((a, b) => a.code.localeCompare(b.code));
    },

    /** One question the actor may see, with the actor's own uses, newest first. */
    async get(actor: Actor, id: string) {
      const q = await findVisible(actor, id);
      const [course, owner, uses] = await Promise.all([
        q.courseId
          ? db.course.findUnique({ where: { id: q.courseId }, include: courseDetail })
          : null,
        db.user.findUnique({ where: { id: q.ownerId }, select: { name: true } }),
        db.questionUse.findMany({
          where: { questionId: q.id, userId: actor.userId },
          orderBy: { usedAt: "desc" },
          select: { paperTitle: true, usedAt: true, paperId: true },
        }),
      ]);
      const courseShared = q.courseCode
        ? (await db.bankCourseShare.count({
            where: { ownerId: q.ownerId, courseCode: q.courseCode },
          })) > 0
        : false;
      return {
        ...shape(q),
        /** A CO or unit outside the syllabus lists (D85), shown as a note. */
        warnings: q.coTag
          ? bankCheck(
              {
                coTag: q.coTag,
                unit: q.unit,
                content: docSchema.parse(q.content) as Doc,
                answerKey: null,
              },
              {
                code: q.courseCode ?? "",
                outcomes: course?.outcomes ?? [],
                units: course?.units ?? [],
              },
            ).warnings
          : [],
        ownerName: owner?.name ?? "",
        mine: q.ownerId === actor.userId,
        courseShared,
        uses,
      };
    },

    /**
     * Adds a question to the actor's bank. Duplicates (D76) do not block a
     * question written by hand; they come back so the screen can warn.
     */
    async create(actor: Actor, input: BankFieldsInput, sourcePaperId: string | null = null) {
      const { f, warnings } = await validated(actor, input, []);
      const cols = columns(f);
      const q = await db.question.create({
        data: { ...cols, ownerId: actor.userId, sourcePaperId },
      });
      await audit(actor, "create", q.id);
      const duplicates = await duplicatesOf(actor, f.courseCode, cols.dupKey, q.id);
      return { question: shape(q), duplicates, warnings };
    },

    async update(actor: Actor, id: string, version: number, input: BankFieldsInput) {
      const before = await findOwn(actor, id);
      const { f, warnings } = await validated(actor, input, storedDocs(before));
      const cols = columns(f);
      const { count } = await db.question.updateMany({
        where: { id, ownerId: actor.userId, deletedAt: null, version },
        data: { ...cols, version: { increment: 1 } },
      });
      if (count === 0) throw new ConflictError(STALE_VERSION);
      await audit(actor, "update", id);
      const duplicates = await duplicatesOf(actor, f.courseCode, cols.dupKey, id);
      return { question: shape(await findOwn(actor, id)), duplicates, warnings };
    },

    /** Private or shared with every colleague (D73); the author only. */
    async setSharing(actor: Actor, id: string, sharing: BankSharing) {
      await findOwn(actor, id);
      const s = z.enum(BankSharing).parse(sharing);
      await db.question.update({ where: { id }, data: { sharing: s } });
      await audit(actor, s === "SHARED" ? "share" : "unshare", id);
    },

    /** The courses whose questions the actor shares as a whole (D73). */
    async courseShares(actor: Actor) {
      return db.bankCourseShare.findMany({
        where: { ownerId: actor.userId },
        orderBy: { courseCode: "asc" },
      });
    },

    /** Shares (or stops sharing) all the actor's questions of a course, current and future. */
    async setCourseShare(actor: Actor, code: string, on: boolean) {
      const courseCode = courseCodeSchema.parse(code);
      if (on) {
        await db.bankCourseShare.upsert({
          where: { ownerId_courseCode: { ownerId: actor.userId, courseCode } },
          create: { ownerId: actor.userId, courseCode },
          update: {},
        });
      } else {
        await db.bankCourseShare.deleteMany({ where: { ownerId: actor.userId, courseCode } });
      }
      await writeAudit(db, {
        actorId: actor.userId,
        action: on ? "share-course" : "unshare-course",
        entity: "Course",
        detail: courseCode,
      });
    },

    /**
     * "Copy to my bank" (D74): a private copy of a question the actor may see.
     * Refused when the actor already has the same question in that course.
     */
    async copyToMine(actor: Actor, id: string) {
      const src = await findVisible(actor, id);
      if (src.ownerId === actor.userId) throw new ConflictError("This question is already yours.");
      if (src.courseCode && src.dupKey) {
        const dups = await duplicatesOf(actor, src.courseCode, src.dupKey);
        if (dups.length) {
          throw new ConflictError(
            dups.some((d) => d.deletedAt === null) ? `${ALREADY_IN_BANK}.` : `${ALREADY_IN_TRASH}.`,
          );
        }
      }
      const docs = storedDocs(src);
      await checkAdvanced(actor, docs, []);
      await shareAssets(db, src.ownerId, actor.userId, docs.flatMap(imageShas));
      const q = await db.question.create({
        data: {
          ownerId: actor.userId,
          courseId: src.courseId,
          courseCode: src.courseCode,
          courseTitle: src.courseTitle,
          program: src.program,
          unit: src.unit,
          coTag: src.coTag,
          bloomLevel: src.bloomLevel,
          marks: src.marks,
          type: src.type,
          content: nullableJson(src.content),
          answerKey: nullableJson(src.answerKey),
          keyCriteria: nullableJson(src.keyCriteria),
          tags: nullableJson(src.tags),
          dupKey: src.dupKey,
          searchText: src.searchText,
        },
      });
      await audit(actor, "copy", q.id);
      return shape(q);
    },

    /** Moves the question to Trash (D82); only its author can. */
    async remove(actor: Actor, id: string) {
      await findOwn(actor, id);
      await db.question.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(actor, "trash", id);
    },

    async listTrash(actor: Actor, now: Date = new Date()) {
      const rows = await db.question.findMany({
        where: { ownerId: actor.userId, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        select: {
          id: true,
          searchText: true,
          deletedAt: true,
          courseCode: true,
        },
      });
      return rows.map((q) => {
        const deletedAt = q.deletedAt ?? now;
        const left = deletedAt.getTime() + BANK_TRASH_DAYS * 86_400_000 - now.getTime();
        return {
          id: q.id,
          text: q.searchText ?? "",
          courseCode: q.courseCode ?? "",
          deletedAt,
          daysLeft: Math.max(0, Math.ceil(left / 86_400_000)),
        };
      });
    },

    async restore(actor: Actor, id: string) {
      const { count } = await db.question.updateMany({
        where: { id, ownerId: actor.userId, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      if (count === 0) throw new NotFoundError(WHAT);
      await audit(actor, "restore", id);
    },

    /** Deletes a question in Trash for good; slots made from it keep their copy. */
    async purge(actor: Actor, id: string) {
      const { count } = await db.question.deleteMany({
        where: { id, ownerId: actor.userId, deletedAt: { not: null } },
      });
      if (count === 0) throw new NotFoundError(WHAT);
      await audit(actor, "delete", id);
    },

    async emptyTrash(actor: Actor): Promise<number> {
      const { count } = await db.question.deleteMany({
        where: { ownerId: actor.userId, deletedAt: { not: null } },
      });
      if (count > 0) await audit(actor, "empty-trash", undefined, String(count));
      return count;
    },

    /**
     * "Add to bank" / "Add all questions of this paper" (D77). Each question
     * needs a Bloom level and a CO of the paper's catalogue course; duplicates
     * (D76) of the actor's own bank, Trash or an earlier question are skipped.
     * Returns what was added and what was skipped, with the reason.
     */
    async addFromPaper(actor: Actor, paperId: string, only?: SlotPlace): Promise<AddReport> {
      const paper = await paperData.getWithSlots(actor, paperId);
      const place = only ? slotPlaceSchema.parse(only) : undefined;
      const numbers = questionNumbers(paper.snapshot.structure);
      const groups = paper.snapshot.structure.parts.flatMap((p) => p.groups);
      const ordered = numbers.flatMap((n) => {
        const group = groups.find((g) => g.key === n.key);
        return paper.slots
          .filter((s) => s.groupKey === n.key)
          .filter((s) => !place || (s.groupKey === place.groupKey && s.position === place.position))
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            slot: s,
            type: group?.type ?? "FREE",
            label: n.slotLabels[s.position - 1] ?? "A question",
          }));
      });
      if (place && ordered.length === 0) throw new NotFoundError(WHAT);
      const report: AddReport = { added: [], skipped: [] };
      const code = courseCodeSchema.safeParse(paper.courseCode);
      if (!paper.courseId && !code.success) {
        const reason = "This paper has no course code; set one in Details first.";
        report.skipped = ordered.map((o) => ({ label: o.label, reason }));
        return report;
      }
      const course = await resolveCourse({
        courseId: paper.courseId,
        courseCode: code.success ? code.data : "",
        courseTitle: paper.courseTitle,
        program: paper.program,
      });
      const user = await db.user.findUnique({
        where: { id: actor.userId },
        select: { allowAdvancedLatex: true },
      });
      const seen = new Map<string, string>();
      for (const { slot, type, label } of ordered) {
        const skip = (reason: string) => report.skipped.push({ label, reason });
        const content = slot.content;
        const answerKey = slot.answerKey === null ? null : (docSchema.parse(slot.answerKey) as Doc);
        if (isEmptyDoc(content)) {
          skip("The question is empty.");
          continue;
        }
        if (!slot.bloomLevel) {
          skip("No Bloom level.");
          continue;
        }
        if (!slot.coTag) {
          skip("No CO.");
          continue;
        }
        const notes = [
          coNote(slot.coTag, course),
          ...[...new Set(subPartCoTags(content))].map((t) => {
            const p = coNote(t, course);
            return p && `Sub-part: ${p}`;
          }),
        ].filter((p): p is string => Boolean(p));
        const problems: string[] = [];
        const bad = [
          ...unprintableChars(content),
          ...(answerKey ? unprintableChars(answerKey) : []),
        ];
        if (bad.length) {
          problems.push(
            `This text contains characters that cannot be printed: ${[...new Set(bad)].join(", ")}.`,
          );
        }
        if (
          !user?.allowAdvancedLatex &&
          [content, ...(answerKey ? [answerKey] : [])].some((d) => advancedSnippets(d).length > 0)
        ) {
          problems.push(ADVANCED_NOT_ALLOWED);
        }
        if (problems.length) {
          skip(problems.join(" "));
          continue;
        }
        const dupKey = dupKeyOf(content);
        const earlier = seen.get(dupKey);
        if (earlier) {
          skip(`Same as ${earlier} on this paper.`);
          continue;
        }
        seen.set(dupKey, label);
        const dups = await duplicatesOf(actor, course.code, dupKey);
        if (dups.length) {
          const live = dups.find((d) => d.deletedAt === null);
          skip(live ? `${ALREADY_IN_BANK}.` : `${ALREADY_IN_TRASH}.`);
          continue;
        }
        const q = await db.$transaction(async (tx) => {
          const created = await tx.question.create({
            data: {
              ownerId: actor.userId,
              courseId: course.id,
              courseCode: course.code,
              courseTitle: course.title,
              program: course.program,
              unit: null,
              coTag: slot.coTag,
              bloomLevel: slot.bloomLevel,
              marks: slot.marks,
              type,
              content: json(content),
              answerKey: nullableJson(answerKey),
              keyCriteria: nullableJson(slot.keyCriteria),
              tags: json([]),
              dupKey,
              searchText: plainText(content),
              sourcePaperId: paper.id,
            },
          });
          await tx.slot.update({ where: { id: slot.id }, data: { questionId: created.id } });
          await tx.questionUse.create({
            data: {
              questionId: created.id,
              userId: actor.userId,
              paperId: paper.id,
              paperTitle: paper.title,
            },
          });
          return created;
        });
        report.added.push({ label, id: q.id, ...(notes.length && { warning: notes.join(" ") }) });
      }
      if (report.added.length) {
        await audit(actor, "add-from-paper", paper.id, String(report.added.length));
      }
      return report;
    },

    /**
     * Inserts a question the actor may see into a place of the actor's Draft
     * paper (D78): a copy of its content, CO, Bloom and key; the place keeps
     * its marks. Later edits on either side do not touch the other. The use is
     * recorded for the actor (D75).
     */
    async insert(actor: Actor, questionId: string, paperId: string, place: SlotPlace) {
      const q = await findVisible(actor, questionId);
      const paper = await paperData.getWithSlots(actor, paperId);
      const p = slotPlaceSchema.parse(place);
      const group = paper.snapshot.structure.parts
        .flatMap((x) => x.groups)
        .find((g) => g.key === p.groupKey);
      if (!group || p.position > group.slots) throw new NotFoundError(WHAT);
      const existing = paper.slots.find(
        (s) => s.groupKey === p.groupKey && s.position === p.position,
      );
      const [content, answerKey] = [q.content, q.answerKey].map((x) =>
        x === null ? null : (docSchema.parse(x) as Doc),
      );
      if (!content) throw new NotFoundError(WHAT);
      await shareAssets(db, q.ownerId, actor.userId, [
        ...imageShas(content),
        ...(answerKey ? imageShas(answerKey) : []),
      ]);
      const slot = await paperData.saveSlot(actor, paperId, {
        groupKey: p.groupKey,
        position: p.position,
        content,
        marks: existing?.marks ?? group.marksEach,
        coTag: q.coTag,
        bloomLevel: q.bloomLevel,
        answerKey,
        keyCriteria: q.keyCriteria === null ? null : keyCriteriaSchema.parse(q.keyCriteria),
      });
      await db.slot.update({ where: { id: slot.id }, data: { questionId: q.id } });
      await db.questionUse.create({
        data: { questionId: q.id, userId: actor.userId, paperId, paperTitle: paper.title },
      });
      await audit(actor, "insert", q.id);
      return { slotId: slot.id, marksDiffer: q.marks !== null && q.marks !== slot.marks };
    },

    /** Owner-only import helper: the actor's dup keys for a course (D76). */
    async ownDupKeys(actor: Actor, courseCode: string) {
      const rows = await db.question.findMany({
        where: { ownerId: actor.userId, courseCode, dupKey: { not: null } },
        select: { dupKey: true, deletedAt: true },
      });
      return new Map(rows.map((r) => [r.dupKey as string, r.deletedAt === null]));
    },

    /**
     * Saves rows of a CSV import in one transaction (D80); every row is
     * checked again here, so a row the import screen let through still has
     * to pass the bank's rules.
     */
    async createMany(actor: Actor, rows: BankFieldsInput[]) {
      const checked = [];
      for (const r of rows) checked.push((await validated(actor, r, [])).f);
      const created = await db.$transaction(
        checked.map((f) =>
          db.question.create({
            data: { ...columns(f), ownerId: actor.userId },
            select: { id: true },
          }),
        ),
      );
      if (created.length) await audit(actor, "import", undefined, String(created.length));
      return created.length;
    },

    resolveCourse,
  };
}

/** System only: removes bank questions that have been in Trash for BANK_TRASH_DAYS. */
export async function purgeOldBankTrash(db: Db, now: Date): Promise<number> {
  const before = new Date(now.getTime() - BANK_TRASH_DAYS * 86_400_000);
  const { count } = await db.question.deleteMany({
    where: { deletedAt: { not: null, lte: before } },
  });
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
