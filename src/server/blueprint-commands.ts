// What the blueprint screens can ask for, independent of Next.js so it can be
// tested with guessed IDs (gate 8). Who may do what lives in the data layer
// (src/lib/data/blueprints.ts, D108).
import { z, ZodError } from "zod";
import {
  type Actor,
  ConflictError,
  type DataLayer,
  ForbiddenError,
  NotFoundError,
} from "@/lib/data";
import type { BlueprintView } from "@/lib/data/blueprints";
import { coTag } from "@/lib/paper/co-tag";
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

export interface BlueprintCourse {
  code: string;
  title: string;
  /** Syllabus COs, as suggestions (D85). */
  cos: { value: string; label: string }[];
}

export function blueprintCommands(data: DataLayer, actor: Actor) {
  return {
    list: () => data.blueprints.list(actor),
    get: (id: string) => data.blueprints.get(actor, idSchema.parse(id)),

    async courses(): Promise<BlueprintCourse[]> {
      const rows = await data.courses.suggestions(actor);
      return rows.map((c) => ({
        code: c.code,
        title: c.title,
        cos: c.outcomes.map((o) => ({ value: coTag(c.code, o.number), label: o.text })),
      }));
    },

    /** Creates (id null) or updates the actor's own blueprint. */
    save(id: unknown, version: unknown, fields: unknown): Promise<CommandResult<BlueprintView>> {
      return run(async () =>
        id === null
          ? data.blueprints.create(actor, fields)
          : data.blueprints.update(actor, idSchema.parse(id), versionSchema.parse(version), fields),
      );
    },

    setSharing(id: unknown, shared: unknown): Promise<CommandResult> {
      return run(async () => {
        await data.blueprints.setSharing(
          actor,
          idSchema.parse(id),
          z.boolean().parse(shared) ? "SHARED" : "PRIVATE",
        );
        return null;
      });
    },

    remove(id: unknown): Promise<CommandResult> {
      return run(async () => {
        await data.blueprints.remove(actor, idSchema.parse(id));
        return null;
      });
    },
  };
}
