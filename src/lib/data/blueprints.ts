// CO blueprints (Phase 15, D108). A blueprint belongs to its maker; others
// see it only while it is SHARED, and then only read it (as D73/D74 for bank
// questions). Admins get nothing extra: another person's private blueprint is
// "not found" to them too. One blueprint per owner, course code and exam group.
import type { Db } from "@/lib/db/client";
import {
  type BlueprintFields,
  type BlueprintTarget,
  blueprintFieldsSchema,
  blueprintTargetsSchema,
} from "@/lib/blueprint/schema";
import { type ExamGroup, examGroupOf } from "@/lib/templates/labels";
import type { ExamKind } from "@/generated/prisma/enums";
import { type Actor, requireSignedIn } from "./actor";
import { writeAudit } from "./audit";
import { ConflictError, NotFoundError, STALE_VERSION } from "./errors";
import { isUniqueViolation } from "./users";

const WHAT = "Blueprint";
export const BLUEPRINT_TAKEN =
  "You already have a blueprint for this course and exam group. Open it to change it.";

const select = {
  id: true,
  ownerId: true,
  courseCode: true,
  examGroup: true,
  unit: true,
  tolerance: true,
  targets: true,
  sharing: true,
  version: true,
  updatedAt: true,
  owner: { select: { name: true } },
} as const;

type Row = {
  id: string;
  ownerId: string;
  courseCode: string;
  examGroup: string;
  unit: string;
  tolerance: number;
  targets: unknown;
  sharing: "PRIVATE" | "SHARED";
  version: number;
  updatedAt: Date;
  owner: { name: string };
};

export interface BlueprintView {
  id: string;
  courseCode: string;
  examGroup: ExamGroup;
  unit: BlueprintFields["unit"];
  tolerance: number;
  targets: BlueprintTarget[];
  sharing: "PRIVATE" | "SHARED";
  version: number;
  updatedAt: Date;
  /** True when the actor made it (may edit, share, delete). */
  mine: boolean;
  /** The maker's name, for "From <name>" on shared ones. */
  ownerName: string;
}

function view(actor: Actor, r: Row): BlueprintView {
  // Stored rows were validated on save; a row that no longer parses shows no targets.
  const targets = blueprintTargetsSchema.safeParse(r.targets);
  return {
    id: r.id,
    courseCode: r.courseCode,
    examGroup: r.examGroup as ExamGroup,
    unit: r.unit as BlueprintFields["unit"],
    tolerance: r.tolerance,
    targets: targets.success ? targets.data : [],
    sharing: r.sharing,
    version: r.version,
    updatedAt: r.updatedAt,
    mine: r.ownerId === actor.userId,
    ownerName: r.owner.name,
  };
}

export function blueprints(db: Db) {
  const visible = (actor: Actor) => ({
    OR: [{ ownerId: actor.userId }, { sharing: "SHARED" as const }],
  });

  async function audit(actor: Actor, action: string, id: string) {
    await writeAudit(db, { actorId: actor.userId, action, entity: "blueprint", entityId: id });
  }

  async function findOwn(actor: Actor, id: string) {
    const r = await db.blueprint.findFirst({ where: { id, ownerId: actor.userId }, select });
    if (!r) throw new NotFoundError(WHAT);
    return r;
  }

  return {
    /** The actor's own blueprints, then colleagues' shared ones. */
    async list(actor: Actor): Promise<BlueprintView[]> {
      requireSignedIn(actor);
      const rows = await db.blueprint.findMany({
        where: visible(actor),
        select,
        orderBy: [
          { courseCode: "asc" },
          { examGroup: "asc" },
          { updatedAt: "desc" },
          { id: "asc" },
        ],
      });
      return rows.map((r) => view(actor, r)).sort((a, b) => Number(b.mine) - Number(a.mine));
    },

    async get(actor: Actor, id: string): Promise<BlueprintView> {
      requireSignedIn(actor);
      const r = await db.blueprint.findFirst({ where: { id, ...visible(actor) }, select });
      if (!r) throw new NotFoundError(WHAT);
      return view(actor, r);
    },

    /**
     * The blueprint that applies to a paper of this course and exam kind: the
     * actor's own, else the most recently changed shared one. Null when none.
     */
    async match(
      actor: Actor,
      courseCode: string,
      examKind: ExamKind,
    ): Promise<BlueprintView | null> {
      requireSignedIn(actor);
      const where = {
        courseCode: courseCode.trim().toUpperCase(),
        examGroup: examGroupOf(examKind),
      };
      const own = await db.blueprint.findFirst({
        where: { ...where, ownerId: actor.userId },
        select,
      });
      if (own) return view(actor, own);
      const shared = await db.blueprint.findFirst({
        where: { ...where, sharing: "SHARED" },
        select,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      });
      return shared ? view(actor, shared) : null;
    },

    async create(actor: Actor, input: unknown): Promise<BlueprintView> {
      requireSignedIn(actor);
      const f = blueprintFieldsSchema.parse(input);
      try {
        const r = await db.blueprint.create({ data: { ...f, ownerId: actor.userId }, select });
        await audit(actor, "create", r.id);
        return view(actor, r);
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictError(BLUEPRINT_TAKEN);
        throw e;
      }
    },

    /** Saves the actor's own blueprint; `version` guards against a stale window. */
    async update(
      actor: Actor,
      id: string,
      version: number,
      input: unknown,
    ): Promise<BlueprintView> {
      requireSignedIn(actor);
      await findOwn(actor, id);
      const f = blueprintFieldsSchema.parse(input);
      try {
        const { count } = await db.blueprint.updateMany({
          where: { id, ownerId: actor.userId, version },
          data: { ...f, version: { increment: 1 } },
        });
        if (count === 0) throw new ConflictError(STALE_VERSION);
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictError(BLUEPRINT_TAKEN);
        throw e;
      }
      await audit(actor, "update", id);
      return view(actor, await findOwn(actor, id));
    },

    async setSharing(actor: Actor, id: string, sharing: "PRIVATE" | "SHARED"): Promise<void> {
      requireSignedIn(actor);
      await findOwn(actor, id);
      await db.blueprint.update({ where: { id }, data: { sharing } });
      await audit(actor, sharing === "SHARED" ? "share" : "unshare", id);
    },

    /** Deletes the actor's own blueprint (nothing else refers to it, papers are untouched). */
    async remove(actor: Actor, id: string): Promise<void> {
      requireSignedIn(actor);
      await findOwn(actor, id);
      await db.blueprint.delete({ where: { id } });
      await audit(actor, "delete", id);
    },
  };
}
