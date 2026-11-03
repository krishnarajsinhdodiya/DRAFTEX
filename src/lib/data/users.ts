// Account administration. Admin only; a non-admin gets ForbiddenError.
// Password hashing happens in src/lib/auth; this layer only stores hashes.
import { z } from "zod";
import { Role } from "@/generated/prisma/enums";
import type { Db } from "@/lib/db/client";
import { type Actor, requireAdmin } from "./actor";
import { writeAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";

const WHAT = "User";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter an email address like name@example.com."));

export const nameSchema = z.string().trim().min(1, "Enter a name.").max(120);

export const newUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(Role).default("FACULTY"),
  institution: z.string().trim().max(200).nullable().default(null),
  passwordHash: z.string().min(1),
});
export type NewUser = z.input<typeof newUserSchema>;

/** Fields safe to show in the admin screen; never the hash. */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  institution: true,
  isActive: true,
  mustChangePassword: true,
  allowAdvancedLatex: true,
  lockedUntil: true,
  createdAt: true,
} as const;

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "P2002";
}

export const EMAIL_TAKEN = "An account with this email already exists.";
export const LAST_ADMIN = "DRAFTEX needs at least one active administrator.";

export function users(db: Db) {
  async function findUser(id: string) {
    const u = await db.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!u) throw new NotFoundError(WHAT);
    return u;
  }

  async function otherActiveAdmins(userId: string) {
    return db.user.count({ where: { role: "ADMIN", isActive: true, id: { not: userId } } });
  }

  return {
    list(actor: Actor) {
      requireAdmin(actor);
      return db.user.findMany({
        select: publicUserSelect,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      });
    },

    /** An admin-made account; the user must choose their own password at first sign-in. */
    async create(actor: Actor, input: NewUser) {
      requireAdmin(actor);
      const u = newUserSchema.parse(input);
      try {
        const created = await db.user.create({
          data: { ...u, mustChangePassword: true },
          select: publicUserSelect,
        });
        await writeAudit(db, {
          actorId: actor.userId,
          action: "create",
          entity: WHAT,
          entityId: created.id,
        });
        return created;
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictError(EMAIL_TAKEN);
        throw e;
      }
    },

    /** Deactivating signs the user out everywhere. */
    async setActive(actor: Actor, userId: string, isActive: boolean) {
      requireAdmin(actor);
      const u = await findUser(userId);
      if (!isActive && u.role === "ADMIN" && (await otherActiveAdmins(userId)) === 0) {
        throw new ConflictError(LAST_ADMIN);
      }
      await db.$transaction([
        db.user.update({ where: { id: userId }, data: { isActive } }),
        ...(isActive ? [] : [db.session.deleteMany({ where: { userId } })]),
      ]);
      await writeAudit(db, {
        actorId: actor.userId,
        action: isActive ? "activate" : "deactivate",
        entity: WHAT,
        entityId: userId,
      });
      return findUser(userId);
    },

    async setRole(actor: Actor, userId: string, role: Role) {
      requireAdmin(actor);
      const u = await findUser(userId);
      if (
        u.role === "ADMIN" &&
        role !== "ADMIN" &&
        u.isActive &&
        (await otherActiveAdmins(userId)) === 0
      ) {
        throw new ConflictError(LAST_ADMIN);
      }
      await db.user.update({ where: { id: userId }, data: { role } });
      await writeAudit(db, {
        actorId: actor.userId,
        action: `role:${role}`,
        entity: WHAT,
        entityId: userId,
      });
      return findUser(userId);
    },

    /** Admin-set password: unlocks the account, signs it out, and asks for a new password at sign-in. */
    async resetPassword(actor: Actor, userId: string, passwordHash: string) {
      requireAdmin(actor);
      await findUser(userId);
      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null },
        }),
        db.session.deleteMany({ where: { userId } }),
      ]);
      await writeAudit(db, {
        actorId: actor.userId,
        action: "reset-password",
        entity: WHAT,
        entityId: userId,
      });
    },

    /** Advanced LaTeX blocks are off by default and enabled per user by an admin (SPEC §8). */
    async setAdvancedLatex(actor: Actor, userId: string, allow: boolean) {
      requireAdmin(actor);
      await findUser(userId);
      await db.user.update({ where: { id: userId }, data: { allowAdvancedLatex: allow } });
      await writeAudit(db, {
        actorId: actor.userId,
        action: allow ? "advanced-latex:on" : "advanced-latex:off",
        entity: WHAT,
        entityId: userId,
      });
      return findUser(userId);
    },

    async unlock(actor: Actor, userId: string) {
      requireAdmin(actor);
      await findUser(userId);
      await db.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
      await writeAudit(db, {
        actorId: actor.userId,
        action: "unlock",
        entity: WHAT,
        entityId: userId,
      });
    },
  };
}
