// Accounts and sessions (SPEC §11.2–3, memory.md "Auth (D5)").
// Pure server logic: Next.js cookies and redirects live in src/server.
import { z } from "zod";
import type { Role } from "@/generated/prisma/enums";
import type { NetworkMode } from "@/lib/config";
import type { Actor, DataLayer } from "@/lib/data";
import { ConflictError } from "@/lib/data";
import { INVITE_INVALID } from "@/lib/data/auth-store";
import { emailSchema, nameSchema } from "@/lib/data/users";
import { SESSION_IDLE_MS, SESSION_RENEW_AFTER_MS } from "./constants";
import { dummyHash, hashPassword, passwordSchema, verifyPassword } from "./password";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { newInviteCode, newSessionToken, normaliseInviteCode, sha256Hex } from "./tokens";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export { SESSION_IDLE_MS, SESSION_RENEW_AFTER_MS } from "./constants";
/** SPEC §11.3, D38: 5 wrong passwords in a row from one address lock it out of that account for 15 minutes. */
export const LOCKOUT_FAILURES = 5;
export const LOCKOUT_MS = 15 * MINUTE;
/** Per client address, across all accounts, so one machine cannot try many emails. */
export const SIGN_IN_PER_ADDRESS = { max: 20, windowMs: 15 * MINUTE };
export const INVITE_PER_ADDRESS = { max: 10, windowMs: 15 * MINUTE };
/** SPEC §11.2: invites are single-use and expire after 7 days. */
export const INVITE_TTL_MS = 7 * DAY;

export const SETUP_NOT_LOCAL =
  "The first administrator can only be created when DRAFTEX runs in local mode, on this computer.";
export const WRONG_PASSWORD = "That email and password do not match.";
export const SAME_PASSWORD = "Choose a password different from the current one.";

export const accountSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type AccountInput = z.input<typeof accountSchema>;

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(1024),
});

export type SignInResult =
  | { ok: true; token: string; expiresAt: Date; mustChangePassword: boolean }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; retryAfterMs: number }
  | { ok: false; reason: "rate-limited"; retryAfterMs: number };

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  /** Admin-enabled per user (SPEC §8); the data layer checks it again on save. */
  allowAdvancedLatex: boolean;
}

export interface ValidSession {
  sessionId: string;
  user: SessionUser;
  expiresAt: Date;
  /** True when the expiry moved, so the cookie should be re-sent. */
  renewed: boolean;
}

export interface AuthDeps {
  data: DataLayer;
  mode: () => NetworkMode;
  now?: () => Date;
  signInLimiter?: RateLimiter;
  inviteLimiter?: RateLimiter;
}

export function actorOf(user: SessionUser): Actor {
  return { userId: user.id, role: user.role };
}

export function createAuth(deps: AuthDeps) {
  const { data } = deps;
  const now = deps.now ?? (() => new Date());
  const ms = () => now().getTime();
  const signInLimiter =
    deps.signInLimiter ?? createRateLimiter({ ...SIGN_IN_PER_ADDRESS, now: ms });
  const inviteLimiter = deps.inviteLimiter ?? createRateLimiter({ ...INVITE_PER_ADDRESS, now: ms });

  async function startSession(userId: string) {
    const token = newSessionToken();
    const expiresAt = new Date(ms() + SESSION_IDLE_MS);
    await data.auth.createSession(sha256Hex(token), userId, expiresAt);
    return { token, expiresAt };
  }

  async function account(input: AccountInput) {
    const a = accountSchema.parse(input);
    return { name: a.name, email: a.email, passwordHash: await hashPassword(a.password) };
  }

  return {
    /** True until the first administrator exists. */
    async needsSetup(): Promise<boolean> {
      return !(await data.auth.hasUsers());
    },

    /** First-run admin: only with no users at all, and only in local mode. Signs the admin in. */
    async setupAdmin(input: AccountInput) {
      if (deps.mode() !== "local") throw new ConflictError(SETUP_NOT_LOCAL);
      const user = await data.auth.createFirstAdmin(await account(input));
      return startSession(user.id);
    },

    async signIn(input: z.input<typeof signInSchema>, address: string): Promise<SignInResult> {
      const wait = signInLimiter.hit(address);
      if (wait > 0) return { ok: false, reason: "rate-limited", retryAfterMs: wait };
      const { email, password } = signInSchema.parse(input);
      const user = await data.auth.findLoginUser(email);
      if (!user) {
        await verifyPassword(await dummyHash(), password);
        return { ok: false, reason: "invalid" };
      }
      const locked = await data.auth.lockedUntil(user.id, address, now());
      if (locked) {
        return { ok: false, reason: "locked", retryAfterMs: locked.getTime() - ms() };
      }
      const matches = await verifyPassword(user.passwordHash, password);
      if (!matches) {
        const lockedUntil = await data.auth.recordFailedLogin(
          user.id,
          address,
          now(),
          LOCKOUT_FAILURES,
          LOCKOUT_MS,
        );
        return lockedUntil
          ? { ok: false, reason: "locked", retryAfterMs: lockedUntil.getTime() - ms() }
          : { ok: false, reason: "invalid" };
      }
      // A deactivated account looks exactly like a wrong password.
      if (!user.isActive) return { ok: false, reason: "invalid" };
      await data.auth.recordSuccessfulLogin(user.id, address);
      return {
        ok: true,
        ...(await startSession(user.id)),
        mustChangePassword: user.mustChangePassword,
      };
    },

    /** Checks a cookie token; deletes it if expired or the account is off; slides the idle expiry. */
    async validateSession(token: string | undefined): Promise<ValidSession | null> {
      if (!token || token.length > 100) return null;
      const id = sha256Hex(token);
      const s = await data.auth.findSession(id);
      if (!s) return null;
      if (s.expiresAt.getTime() <= ms() || !s.user.isActive) {
        await data.auth.deleteSession(id);
        return null;
      }
      const user: SessionUser = {
        id: s.user.id,
        name: s.user.name,
        email: s.user.email,
        role: s.user.role,
        mustChangePassword: s.user.mustChangePassword,
        allowAdvancedLatex: s.user.allowAdvancedLatex,
      };
      let expiresAt = s.expiresAt;
      const renewed = expiresAt.getTime() - ms() < SESSION_IDLE_MS - SESSION_RENEW_AFTER_MS;
      if (renewed) {
        expiresAt = new Date(ms() + SESSION_IDLE_MS);
        await data.auth.extendSession(id, expiresAt);
      }
      return { sessionId: id, user, expiresAt, renewed };
    },

    async signOut(token: string | undefined): Promise<void> {
      if (token) await data.auth.deleteSession(sha256Hex(token));
    },

    /** Changes your own password; your other sessions end. Returns false if the current one is wrong. */
    async changePassword(session: ValidSession, current: string, next: string): Promise<boolean> {
      const newPassword = passwordSchema.parse(next);
      const stored = await data.auth.getPasswordHash(session.user.id);
      if (!stored || !(await verifyPassword(stored.passwordHash, current))) return false;
      if (current === newPassword) throw new ConflictError(SAME_PASSWORD);
      await data.auth.setOwnPassword(
        session.user.id,
        await hashPassword(newPassword),
        session.sessionId,
      );
      return true;
    },

    async pruneSessions(): Promise<number> {
      return data.auth.deleteExpiredSessions(now());
    },

    // ---------- admin ----------

    adminCreateUser(
      actor: Actor,
      input: AccountInput & { role?: Role; institution?: string | null },
    ) {
      return account(input).then((a) =>
        data.users.create(actor, {
          ...a,
          role: input.role,
          institution: input.institution ?? null,
        }),
      );
    },

    async adminResetPassword(actor: Actor, userId: string, password: string): Promise<void> {
      await data.users.resetPassword(
        actor,
        userId,
        await hashPassword(passwordSchema.parse(password)),
      );
    },

    /** Returns the code once; only its hash is stored. */
    async createInvite(actor: Actor, role: Role, note: string | null) {
      const code = newInviteCode();
      const expiresAt = new Date(ms() + INVITE_TTL_MS);
      await data.auth.createInvite(
        actor,
        sha256Hex(code),
        role,
        expiresAt,
        note?.trim().slice(0, 120) || null,
      );
      return { code, expiresAt };
    },

    listInvites(actor: Actor) {
      return data.auth.listOpenInvites(actor, now());
    },

    revokeInvite(actor: Actor, inviteId: string) {
      return data.auth.revokeInvite(actor, inviteId, now());
    },

    /** Creates an account from an invite code and signs it in. */
    async redeemInvite(code: string, input: AccountInput, address: string) {
      const wait = inviteLimiter.hit(address);
      if (wait > 0) return { ok: false as const, retryAfterMs: wait };
      const normalised = normaliseInviteCode(code);
      if (!normalised) throw new ConflictError(INVITE_INVALID);
      const user = await data.auth.redeemInvite(sha256Hex(normalised), now(), await account(input));
      return { ok: true as const, ...(await startSession(user.id)) };
    },
  };
}
export type Auth = ReturnType<typeof createAuth>;
