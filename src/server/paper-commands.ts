// What the paper screens can ask for, independent of Next.js so it can be
// tested with guessed IDs (gate 8). Server actions are thin wrappers.
import { z, ZodError } from "zod";
import {
  type Actor,
  ConflictError,
  type DataLayer,
  ForbiddenError,
  NotFoundError,
} from "@/lib/data";
import { paperMetaSchema, slotInputSchema, slotPlaceSchema } from "@/lib/data/papers";
import { coTag } from "@/lib/catalogue";
import { ExamKind, Program } from "@/generated/prisma/enums";
import type { CommandFailure, CommandResult } from "./template-commands";

const idSchema = z.string().min(1).max(64);
const versionSchema = z.number().int().min(1);

function fail(e: unknown): CommandFailure {
  if (e instanceof ZodError) {
    return {
      ok: false,
      message: "Some fields are not filled in correctly.",
      issues: e.issues.map((i) => ({ message: i.message, path: i.path.join(".") })),
    };
  }
  if (e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof ConflictError) {
    return { ok: false, message: e.message };
  }
  throw e;
}

async function run<T>(f: () => Promise<T>): Promise<CommandResult<T>> {
  try {
    return { ok: true, value: await f() };
  } catch (e) {
    return fail(e);
  }
}

/** What "New paper" asks for; the rest comes from the template and the course. */
export const newPaperSchema = z.object({
  title: z.string().trim().min(1, "Give the paper a title.").max(200),
  courseId: z.string().max(64).nullable().default(null),
  courseCode: z.string().trim().max(40).default(""),
  courseTitle: z.string().trim().max(200).default(""),
  /** Left out: the syllabus course's semester, else 1. */
  semesterOrYear: z.number().int().min(1).max(10).optional(),
  academicYear: z.string().trim().max(20).default(""),
  examDate: z.coerce.date().nullable().default(null),
});

/** What the "Duplicate as…" dialog sends (D60). */
export const duplicatePaperSchema = z.object({
  title: z.string().trim().min(1, "Give the copy a title.").max(200),
  examKind: z.enum(ExamKind),
  examDate: z.coerce.date().nullable().default(null),
  academicYear: z.string().trim().max(20).optional(),
});

/** "Mark as Final" and "Edit" (back to Draft, D56); Printed comes from export only. */
const statusSchema = z.enum(["DRAFT", "FINAL"]);

/** Metadata the editor's header form can change. */
export const paperDetailsSchema = paperMetaSchema
  .pick({
    title: true,
    courseId: true,
    courseCode: true,
    courseTitle: true,
    semesterOrYear: true,
    academicYear: true,
    instructionsOverride: true,
  })
  .extend({ examDate: z.coerce.date().nullable(), showBloom: z.boolean() })
  .partial();

export function paperCommands(data: DataLayer, actor: Actor) {
  /**
   * A course from the syllabus fills its code, title and semester as
   * defaults only (D85): whatever the user typed for them wins.
   */
  async function courseFacts(
    courseId: string | null | undefined,
    given: { courseCode?: string; courseTitle?: string; semesterOrYear?: number },
  ) {
    if (!courseId) return {};
    const c = await data.courses.get(actor, courseId);
    return {
      courseCode: given.courseCode?.trim() || c.code,
      courseTitle: given.courseTitle?.trim() || c.title,
      semesterOrYear: given.semesterOrYear ?? c.semesterOrYear,
    };
  }

  return {
    async create(templateId: unknown, input: unknown): Promise<CommandResult<string>> {
      return run(async () => {
        const tpl = await data.templates.get(actor, idSchema.parse(templateId));
        const m = newPaperSchema.parse(input);
        const paper = await data.papers.create(actor, tpl.id, {
          ...m,
          semesterOrYear: m.semesterOrYear ?? 1,
          ...(await courseFacts(m.courseId, m)),
          program: z.enum(Program).parse(tpl.program),
          examKind: z.enum(ExamKind).parse(tpl.examKind),
        });
        return paper.id;
      });
    },

    async updateDetails(
      id: unknown,
      version: unknown,
      patch: unknown,
    ): Promise<CommandResult<number>> {
      return run(async () => {
        const p = paperDetailsSchema.parse(patch);
        const saved = await data.papers.update(
          actor,
          idSchema.parse(id),
          versionSchema.parse(version),
          { ...p, ...(await courseFacts(p.courseId, p)) },
        );
        return saved.version;
      });
    },

    /** Marks the paper Final, or puts a Final/Printed paper back to Draft; returns the version. */
    async setStatus(
      id: unknown,
      version: unknown,
      status: unknown,
    ): Promise<CommandResult<number>> {
      return run(async () => {
        const saved = await data.papers.update(
          actor,
          idSchema.parse(id),
          versionSchema.parse(version),
          { status: statusSchema.parse(status) },
        );
        return saved.version;
      });
    },

    /** Restores a version as a new Draft paper (D57); returns the new paper's id. */
    async restoreVersion(
      id: unknown,
      versionId: unknown,
      title: unknown,
    ): Promise<CommandResult<string>> {
      return run(async () => {
        const copy = await data.papers.restoreVersion(
          actor,
          idSchema.parse(id),
          idSchema.parse(versionId),
          z.string().parse(title),
        );
        return copy.id;
      });
    },

    async saveSlot(id: unknown, input: unknown): Promise<CommandResult<string>> {
      return run(
        async () =>
          (await data.papers.saveSlot(actor, idSchema.parse(id), slotInputSchema.parse(input))).id,
      );
    },

    /** "Duplicate paper" (SPEC §1 ATKT flow); returns the copy's id. */
    async duplicate(id: unknown, input: unknown): Promise<CommandResult<string>> {
      return run(async () => {
        const d = duplicatePaperSchema.parse(input);
        return (await data.papers.duplicate(actor, idSchema.parse(id), d)).id;
      });
    },

    async clearSlot(id: unknown, place: unknown): Promise<CommandResult> {
      return run(async () => {
        await data.papers.clearSlot(actor, idSchema.parse(id), slotPlaceSchema.parse(place));
        return null;
      });
    },

    async moveSlot(id: unknown, from: unknown, to: unknown): Promise<CommandResult> {
      return run(async () => {
        await data.papers.moveSlot(
          actor,
          idSchema.parse(id),
          slotPlaceSchema.parse(from),
          slotPlaceSchema.parse(to),
        );
        return null;
      });
    },

    async duplicateSlot(
      id: unknown,
      place: unknown,
    ): Promise<CommandResult<{ groupKey: string; position: number }>> {
      return run(() =>
        data.papers.duplicateSlot(actor, idSchema.parse(id), slotPlaceSchema.parse(place)),
      );
    },

    async remove(id: unknown): Promise<CommandResult> {
      return run(async () => {
        await data.papers.remove(actor, idSchema.parse(id));
        return null;
      });
    },

    async restore(id: unknown): Promise<CommandResult> {
      return run(async () => {
        await data.papers.restore(actor, idSchema.parse(id));
        return null;
      });
    },

    async purge(id: unknown): Promise<CommandResult> {
      return run(async () => {
        await data.papers.purge(actor, idSchema.parse(id));
        return null;
      });
    },

    async emptyTrash(): Promise<CommandResult<number>> {
      return run(() => data.papers.emptyTrash(actor));
    },
  };
}

/** CO tag choices for a course: `BP604T.01 · <outcome text>`. */
export function coOptions(course: { code: string; outcomes: { number: number; text: string }[] }) {
  return course.outcomes.map((o) => ({ value: coTag(course.code, o.number), label: o.text }));
}
