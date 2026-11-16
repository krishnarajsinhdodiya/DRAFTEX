// What the question bank screens can ask for, independent of Next.js so it
// can be tested with guessed IDs (gate 8). Server actions are thin wrappers.
// Who may do what lives in the data layer (src/lib/data/bank.ts, D73-D75).
import { z, ZodError } from "zod";
import {
  type Actor,
  ConflictError,
  type DataLayer,
  ForbiddenError,
  NotFoundError,
} from "@/lib/data";
import { InvalidQuestionError } from "@/lib/data/errors";
import { type AddReport, bankFilterSchema } from "@/lib/data/bank";
import type { BankFieldsInput } from "@/lib/bank/question";
import { slotPlaceSchema } from "@/lib/data/papers";
import { coTag } from "@/lib/paper/co-tag";
import type { CommandFailure, CommandResult } from "./template-commands";

const idSchema = z.string().min(1).max(64);
const versionSchema = z.number().int().min(1);

function fail(e: unknown): CommandFailure {
  if (e instanceof InvalidQuestionError) {
    return {
      ok: false,
      message: "Fix the problems listed before saving.",
      issues: e.problems.map((message) => ({ message })),
    };
  }
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

export interface SaveResult {
  id: string;
  version: number;
  warnings: string[];
  /** The actor's own questions with the same text in this course (D76); Trash included. */
  duplicates: number;
  /** The actor's own questions in this course that read almost the same (D114). */
  similar: { id: string; score: number; summary: string }[];
}

/** A course the bank form can suggest (D85): code, title, programme, COs and units. */
export interface CourseSuggestion {
  code: string;
  title: string;
  program: string;
  cos: { value: string; label: string }[];
  units: { value: number; label: string }[];
}

export function bankCommands(data: DataLayer, actor: Actor) {
  return {
    list: (filter: unknown) => data.bank.list(actor, bankFilterSchema.parse(filter ?? {})),

    get: (id: unknown) => data.bank.get(actor, idSchema.parse(id)),

    /** Syllabus courses as suggestions for the form (D85). */
    async courseSuggestions(): Promise<CourseSuggestion[]> {
      const rows = await data.courses.suggestions(actor);
      return rows.map((c) => ({
        code: c.code,
        title: c.title,
        program: c.program,
        cos: c.outcomes.map((o) => ({ value: coTag(c.code, o.number), label: o.text })),
        units: c.units.map((u) => ({
          value: u.number,
          label: u.title ? `Unit ${u.number}: ${u.title}` : `Unit ${u.number}`,
        })),
      }));
    },

    /** Creates (id null) or updates a question; the warnings and duplicates come back (D76, D85). */
    async save(id: unknown, version: unknown, fields: unknown): Promise<CommandResult<SaveResult>> {
      return run(async () => {
        // The data layer checks every field with bankFieldsSchema; here it is only an object.
        const input = z.record(z.string(), z.unknown()).parse(fields) as BankFieldsInput;
        const r =
          id === null
            ? await data.bank.create(actor, input)
            : await data.bank.update(
                actor,
                idSchema.parse(id),
                versionSchema.parse(version),
                input,
              );
        return {
          id: r.question.id,
          version: r.question.version,
          warnings: r.warnings,
          duplicates: r.duplicates.length,
          similar: r.similar,
        };
      });
    },

    setSharing: (id: unknown, shared: unknown) =>
      run(() =>
        data.bank.setSharing(
          actor,
          idSchema.parse(id),
          z.boolean().parse(shared) ? "SHARED" : "PRIVATE",
        ),
      ),

    courseShares: () => data.bank.courseShares(actor),

    setCourseShare: (code: unknown, on: unknown) =>
      run(() =>
        data.bank.setCourseShare(actor, z.string().max(40).parse(code), z.boolean().parse(on)),
      ),

    copy: (id: unknown) =>
      run(async () => (await data.bank.copyToMine(actor, idSchema.parse(id))).id),

    remove: (id: unknown) => run(() => data.bank.remove(actor, idSchema.parse(id))),
    restore: (id: unknown) => run(() => data.bank.restore(actor, idSchema.parse(id))),
    purge: (id: unknown) => run(() => data.bank.purge(actor, idSchema.parse(id))),
    listTrash: () => data.bank.listTrash(actor),
    emptyTrash: () => run(() => data.bank.emptyTrash(actor)),

    /** "Add to bank" for one question, or every question of the paper (D77). */
    addFromPaper: (paperId: unknown, place?: unknown): Promise<CommandResult<AddReport>> =>
      run(() =>
        data.bank.addFromPaper(
          actor,
          idSchema.parse(paperId),
          place === undefined ? undefined : slotPlaceSchema.parse(place),
        ),
      ),

    /** Inserts a question into a place of the actor's paper (D78). */
    insert: (questionId: unknown, paperId: unknown, place: unknown) =>
      run(() =>
        data.bank.insert(
          actor,
          idSchema.parse(questionId),
          idSchema.parse(paperId),
          slotPlaceSchema.parse(place),
        ),
      ),
  };
}
