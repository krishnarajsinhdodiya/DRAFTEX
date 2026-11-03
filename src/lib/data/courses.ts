// Course catalogue. Readable by any signed-in user; nobody edits it through
// the app. The seed comes from src/lib/catalogue and is synced at startup.
import type { CourseKind, Program } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "@/lib/db/client";
import type { CatalogueCourse } from "@/lib/catalogue";
import { type Actor, requireSignedIn } from "./actor";
import { NotFoundError } from "./errors";

const WHAT = "Course";

export type CourseFilter = {
  program?: Program;
  semesterOrYear?: number;
  courseKind?: CourseKind;
  /** Matches code or title. */
  search?: string;
};

const detail = {
  outcomes: { orderBy: { number: "asc" } },
  units: { orderBy: { number: "asc" } },
} as const satisfies Prisma.CourseInclude;

export function courses(db: Db) {
  return {
    async list(actor: Actor, filter: CourseFilter = {}) {
      requireSignedIn(actor);
      const search = filter.search?.trim();
      return db.course.findMany({
        where: {
          program: filter.program,
          semesterOrYear: filter.semesterOrYear,
          courseKind: filter.courseKind,
          ...(search && { OR: [{ code: { contains: search } }, { title: { contains: search } }] }),
        },
        orderBy: [{ program: "asc" }, { semesterOrYear: "asc" }, { code: "asc" }],
      });
    },

    async get(actor: Actor, id: string) {
      requireSignedIn(actor);
      const c = await db.course.findUnique({ where: { id }, include: detail });
      if (!c) throw new NotFoundError(WHAT);
      return c;
    },

    async getByCode(actor: Actor, code: string) {
      requireSignedIn(actor);
      const c = await db.course.findUnique({ where: { code }, include: detail });
      if (!c) throw new NotFoundError(WHAT);
      return c;
    },
  };
}

// ---------- system only: catalogue sync ----------

function fields(c: CatalogueCourse, program: Program) {
  return {
    title: c.title,
    program,
    semesterOrYear: c.semester,
    courseKind: c.courseKind,
    credits: c.credits,
    lectureHrs: c.lectureHrs,
    tutorialHrs: c.tutorialHrs,
    practicalHrs: c.practicalHrs,
    maxMarks: c.maxMarks,
    sessionalMarks: c.sessionalMarks,
    endSemMarks: c.endSemMarks,
    endSemMinutes: c.endSemMinutes,
    ruleSetId: c.ruleSetId,
    continuousMarks: c.continuousMarks,
    sessionalMinutes: c.sessionalMinutes,
    maxHours: c.maxHours,
    electiveOf: c.electiveOf,
    electiveLabel: c.electiveLabel,
    syllabusPage: c.syllabusPage,
  };
}

const sameList = <T extends Record<string, unknown>>(a: T[], b: T[], keys: (keyof T)[]) =>
  a.length === b.length && a.every((x, i) => keys.every((k) => x[k] === b[i]?.[k]));

export type SyncResult = { created: number; updated: number; unchanged: number };

/**
 * Brings the Course tables in line with the catalogue: adds missing courses
 * and rewrites changed ones (outcomes and units are replaced). Courses are
 * never deleted, because papers may point at them. Safe to run on every start.
 */
export async function syncCatalogue(
  db: Db,
  catalogue: { program: Program; courses: CatalogueCourse[] },
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, unchanged: 0 };
  const existing = new Map(
    (
      await db.course.findMany({
        where: { code: { in: catalogue.courses.map((c) => c.code) } },
        include: detail,
      })
    ).map((c) => [c.code, c]),
  );
  await db.$transaction(async (tx) => {
    for (const c of catalogue.courses) {
      const data = fields(c, catalogue.program);
      const outcomes = c.outcomes.map((o) => ({ number: o.number, text: o.text }));
      const units = c.units.map((u) => ({ number: u.number, title: u.title, hours: u.hours }));
      const old = existing.get(c.code);
      if (!old) {
        await tx.course.create({
          data: { code: c.code, ...data, outcomes: { create: outcomes }, units: { create: units } },
        });
        result.created++;
        continue;
      }
      const same =
        (Object.keys(data) as (keyof typeof data)[]).every((k) => old[k] === data[k]) &&
        sameList(old.outcomes, outcomes, ["number", "text"]) &&
        sameList(old.units, units, ["number", "title", "hours"]);
      if (same) {
        result.unchanged++;
        continue;
      }
      await tx.courseOutcome.deleteMany({ where: { courseId: old.id } });
      await tx.courseUnit.deleteMany({ where: { courseId: old.id } });
      await tx.course.update({
        where: { id: old.id },
        data: { ...data, outcomes: { create: outcomes }, units: { create: units } },
      });
      result.updated++;
    }
  });
  return result;
}
