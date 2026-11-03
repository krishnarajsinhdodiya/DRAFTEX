// Storage for sign-in, sessions, first-run setup and invites. Only
// src/lib/auth calls these; they run before there is a signed-in actor, so
// each function does exactly one narrow thing and returns as little as it can.
import type { Role } from "@/generated/prisma/enums";
import type { Db } from "@/lib/db/client";
import { type Actor, requireAdmin } from "./actor";
import { writeAudit } from "./audit";
import { ConflictError, NotFoundError } from "./errors";
import { EMAIL_TAKEN, isUniqueViolation } from "./users";

export interface AccountData {
  name: string;
  /** Already normalised (trimmed, lower-case). */
  email: string;
  passwordHash: string;
}

export const ALREADY_SET_UP = "DRAFTEX is already set up. Sign in instead.";
export const INVITE_INVALID =
  "This invite code is not valid. It may have expired or been used already.";

const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
} as const;

export function authStore(db: Db) {
  return {
    async hasUsers(): Promise<boolean> {
      return (await db.user.count()) > 0;
    },

    /** First-run admin. The count and the insert share one transaction, so only one caller wins. */
    async createFirstAdmin(data: AccountData) {
      const user = await db.$transaction(async (tx) => {
        if ((await tx.user.count()) > 0) throw new ConflictError(ALREADY_SET_UP);
        return tx.user.create({ data: { ...data, role: "ADMIN" }, select: { id: true } });
      });
      await writeAudit(db, {
        actorId: user.id,
        action: "setup-admin",
        entity: "User",
        entityId: user.id,
      });
      return user;
    },

    findLoginUser(email: string) {
      return db.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, isActive: true, lockedUntil: true },
      });
    },

    /**
     * Counts a failed password. On the `max`-th failure in a row the account
     * locks until `now + lockMs` and the count starts again. Returns the lock end, if any.
     */
    async recordFailedLogin(
      userId: string,
      now: Date,
      max: number,
      lockMs: number,
    ): Promise<Date | null> {
      return db.$transaction(async (tx) => {
        const u = await tx.user.update({
          where: { id: userId },
          data: { failedLogins: { increment: 1 } },
          select: { failedLogins: true },
        });
        if (u.failedLogins < max) return null;
        const until = new Date(now.getTime() + lockMs);
        await tx.user.update({
          where: { id: userId },
          data: { failedLogins: 0, lockedUntil: until },
        });
        await writeAudit(tx, {
          actorId: null,
          action: "lockout",
          entity: "User",
          entityId: userId,
        });
        return until;
      });
    },

    async recordSuccessfulLogin(userId: string): Promise<void> {
      await db.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
      await writeAudit(db, {
        actorId: userId,
        action: "sign-in",
        entity: "User",
        entityId: userId,
      });
    },

    getPasswordHash(userId: string) {
      return db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    },

    /** Own password change: clears the must-change flag and ends the user's other sessions. */
    async setOwnPassword(
      userId: string,
      passwordHash: string,
      keepSessionId: string,
    ): Promise<void> {
      await db.$transaction([
        db.user.update({
          where: { id: userId },
          data: { passwordHash, mustChangePassword: false },
        }),
        db.session.deleteMany({ where: { userId, id: { not: keepSessionId } } }),
      ]);
      await writeAudit(db, {
        actorId: userId,
        action: "change-password",
        entity: "User",
        entityId: userId,
      });
    },

    // ---------- sessions ----------

    async createSession(id: string, userId: string, expiresAt: Date): Promise<void> {
      await db.session.create({ data: { id, userId, expiresAt } });
    },

    findSession(id: string) {
      return db.session.findUnique({
        where: { id },
        include: { user: { select: sessionUserSelect } },
      });
    },

    async extendSession(id: string, expiresAt: Date): Promise<void> {
      await db.session.updateMany({ where: { id }, data: { expiresAt } });
    },

    async deleteSession(id: string): Promise<void> {
      await db.session.deleteMany({ where: { id } });
    },

    async deleteExpiredSessions(now: Date): Promise<number> {
      return (await db.session.deleteMany({ where: { expiresAt: { lte: now } } })).count;
    },

    // ---------- invites ----------

    async createInvite(actor: Actor, id: string, role: Role, expiresAt: Date, note: string | null) {
      requireAdmin(actor);
      await db.inviteCode.create({
        data: { id, role, expiresAt, note, createdById: actor.userId },
      });
      await writeAudit(db, { actorId: actor.userId, action: "create", entity: "Invite" });
    },

    /** Invites still waiting to be used. The codes themselves are never stored. */
    listOpenInvites(actor: Actor, now: Date) {
      requireAdmin(actor);
      return db.inviteCode.findMany({
        where: { usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        select: {
          id: true,
          role: true,
          note: true,
          createdAt: true,
          expiresAt: true,
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    },

    async revokeInvite(actor: Actor, id: string, now: Date): Promise<void> {
      requireAdmin(actor);
      const { count } = await db.inviteCode.updateMany({
        where: { id, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      });
      if (count === 0) throw new NotFoundError("Invite");
      await writeAudit(db, { actorId: actor.userId, action: "revoke", entity: "Invite" });
    },

    /** Uses an invite exactly once: the claim and the new account commit together or not at all. */
    async redeemInvite(id: string, now: Date, data: AccountData) {
      try {
        const user = await db.$transaction(async (tx) => {
          const invite = await tx.inviteCode.findUnique({ where: { id }, select: { role: true } });
          if (!invite) throw new ConflictError(INVITE_INVALID);
          const u = await tx.user.create({
            data: { ...data, role: invite.role },
            select: { id: true },
          });
          const { count } = await tx.inviteCode.updateMany({
            where: { id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
            data: { usedAt: now, usedById: u.id },
          });
          if (count === 0) throw new ConflictError(INVITE_INVALID);
          return u;
        });
        await writeAudit(db, { actorId: user.id, action: "redeem", entity: "Invite" });
        return user;
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictError(EMAIL_TAKEN);
        throw e;
      }
    },
  };
}
