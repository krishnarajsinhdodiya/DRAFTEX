// What the template screens can ask for, independent of Next.js so it can be
// tested with guessed IDs (gate 8). Server actions are thin wrappers.
import { z, ZodError } from "zod";
import {
  type Actor,
  ConflictError,
  type DataLayer,
  ForbiddenError,
  InvalidTemplateError,
  NotFoundError,
} from "@/lib/data";
import { templateFieldsSchema } from "@/lib/templates/fields";

export type CommandFailure = {
  ok: false;
  message: string;
  issues?: { message: string; path?: string }[];
};
export type CommandResult<T = null> = { ok: true; value: T } | CommandFailure;

const idSchema = z.string().min(1).max(64);

function fail(e: unknown): CommandFailure {
  if (e instanceof InvalidTemplateError) {
    return {
      ok: false,
      message: "Fix the problems listed before saving.",
      issues: e.issues.map((i) => ({ message: i.message, path: i.path })),
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

export function templateCommands(data: DataLayer, actor: Actor) {
  return {
    /** "Save as new": a private copy the actor owns, ready to edit. */
    async copy(id: unknown, title?: string): Promise<CommandResult<string>> {
      try {
        const src = await data.templates.get(actor, idSchema.parse(id));
        const copy = await data.templates.saveAsNew(actor, src.id, {
          title: (title ?? `${src.title} (copy)`).slice(0, 200),
        });
        return { ok: true, value: copy.id };
      } catch (e) {
        return fail(e);
      }
    },

    async save(id: unknown, version: unknown, fields: unknown): Promise<CommandResult<number>> {
      try {
        const parsed = templateFieldsSchema.parse(fields);
        const saved = await data.templates.update(
          actor,
          idSchema.parse(id),
          z.number().int().min(1).parse(version),
          parsed,
        );
        return { ok: true, value: saved.version };
      } catch (e) {
        return fail(e);
      }
    },

    async setVisibility(id: unknown, visibility: unknown): Promise<CommandResult> {
      try {
        await data.templates.setVisibility(
          actor,
          idSchema.parse(id),
          z.enum(["PRIVATE", "GLOBAL"]).parse(visibility),
        );
        return { ok: true, value: null };
      } catch (e) {
        return fail(e);
      }
    },

    async remove(id: unknown): Promise<CommandResult> {
      try {
        await data.templates.remove(actor, idSchema.parse(id));
        return { ok: true, value: null };
      } catch (e) {
        return fail(e);
      }
    },

    async restoreBuiltIns(): Promise<CommandResult<number>> {
      try {
        return { ok: true, value: await data.templates.restoreBuiltIns(actor) };
      } catch (e) {
        return fail(e);
      }
    },
  };
}
