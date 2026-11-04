import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  type Auth,
  INVITE_PER_ADDRESS,
  LOCKOUT_FAILURES,
  LOCKOUT_MS,
  SAME_PASSWORD,
  SESSION_IDLE_MS,
  SESSION_RENEW_AFTER_MS,
  SETUP_NOT_LOCAL,
  SIGN_IN_PER_ADDRESS,
  WRONG_PASSWORD,
  actorOf,
  createAuth,
} from "@/lib/auth/service";
import { sha256Hex } from "@/lib/auth/tokens";
import type { NetworkMode } from "@/lib/config";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/data";
import { ALREADY_SET_UP, INVITE_INVALID } from "@/lib/data/auth-store";
import { EMAIL_TAKEN } from "@/lib/data/users";
import { createTestDb, type TestDb } from "../../support/db";

const PW = "correct horse battery";
const ADDR = "127.0.0.1";

let t: TestDb;
let auth: Auth;
let clock: number;
let mode: NetworkMode;

const advance = (ms: number) => {
  clock += ms;
};

beforeEach(async () => {
  t = await createTestDb();
  clock = Date.parse("2026-11-03T10:00:00Z");
  mode = "local";
  auth = createAuth({ data: t.data, mode: () => mode, now: () => new Date(clock) });
});

afterEach(async () => {
  await t.close();
});

async function setup() {
  const s = await auth.setupAdmin({ name: "Admin", email: "Admin@Example.com", password: PW });
  const v = await auth.validateSession(s.token);
  return { ...s, session: v!, actor: actorOf(v!.user) };
}

describe("first-run setup", () => {
  it("creates one signed-in admin, then refuses", async () => {
    expect(await auth.needsSetup()).toBe(true);
    const { session } = await setup();
    expect(session.user).toMatchObject({
      email: "admin@example.com",
      role: "ADMIN",
      mustChangePassword: false,
    });
    expect(await auth.needsSetup()).toBe(false);
    await expect(
      auth.setupAdmin({ name: "B", email: "b@example.com", password: PW }),
    ).rejects.toThrow(ALREADY_SET_UP);
  });

  it("lets only one of two simultaneous requests win", async () => {
    const results = await Promise.allSettled([
      auth.setupAdmin({ name: "A", email: "a@example.com", password: PW }),
      auth.setupAdmin({ name: "B", email: "b@example.com", password: PW }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await t.db.user.count()).toBe(1);
  });

  it("is refused outside local mode", async () => {
    mode = "lan";
    await expect(setup()).rejects.toThrow(SETUP_NOT_LOCAL);
    expect(await t.db.user.count()).toBe(0);
  });

  it("enforces the password rules", async () => {
    await expect(
      auth.setupAdmin({ name: "A", email: "a@example.com", password: "short" }),
    ).rejects.toBeInstanceOf(ZodError);
    await expect(
      auth.setupAdmin({ name: "A", email: "a@example.com", password: "x".repeat(257) }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("stores an argon2id hash, never the password", async () => {
    await setup();
    const u = await t.db.user.findFirstOrThrow();
    expect(u.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(u.passwordHash).not.toContain(PW);
  });
});

describe("sign-in", () => {
  beforeEach(setup);

  it("accepts the right password with any email case and spacing", async () => {
    const r = await auth.signIn({ email: "  ADMIN@example.com ", password: PW }, ADDR);
    expect(r).toMatchObject({ ok: true, mustChangePassword: false });
    if (r.ok) expect((await auth.validateSession(r.token))?.user.email).toBe("admin@example.com");
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    expect(
      await auth.signIn({ email: "admin@example.com", password: "wrong password" }, ADDR),
    ).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await auth.signIn({ email: "nobody@example.com", password: PW }, ADDR)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(WRONG_PASSWORD).toMatch(/do not match/);
  });

  it(`locks that address out for 15 minutes after ${LOCKOUT_FAILURES} wrong passwords`, async () => {
    for (let i = 1; i < LOCKOUT_FAILURES; i++) {
      expect(
        await auth.signIn({ email: "admin@example.com", password: `wrong ${i}` }, ADDR),
      ).toMatchObject({
        reason: "invalid",
      });
    }
    expect(await auth.signIn({ email: "admin@example.com", password: "wrong 5" }, ADDR)).toEqual({
      ok: false,
      reason: "locked",
      retryAfterMs: LOCKOUT_MS,
    });
    advance(60_000);
    expect(await auth.signIn({ email: "admin@example.com", password: PW }, ADDR)).toEqual({
      ok: false,
      reason: "locked",
      retryAfterMs: LOCKOUT_MS - 60_000,
    });
    advance(LOCKOUT_MS);
    expect((await auth.signIn({ email: "admin@example.com", password: PW }, ADDR)).ok).toBe(true);
    expect(await t.db.loginLock.count()).toBe(0);
    expect(await t.db.auditLog.count({ where: { action: "lockout", detail: ADDR } })).toBe(1);
    expect(await t.db.auditLog.count({ where: { action: "sign-in-failed", detail: ADDR } })).toBe(
      LOCKOUT_FAILURES,
    );
  });

  it("a lockout from one computer leaves the account open everywhere else (D38)", async () => {
    for (let i = 0; i < LOCKOUT_FAILURES; i++) {
      await auth.signIn({ email: "admin@example.com", password: "wrong" }, "192.168.1.66");
    }
    expect(
      await auth.signIn({ email: "admin@example.com", password: PW }, "192.168.1.66"),
    ).toMatchObject({ reason: "locked" });
    expect((await auth.signIn({ email: "admin@example.com", password: PW }, "127.0.0.1")).ok).toBe(
      true,
    );
    // The laptop's success does not unlock the other computer.
    expect(
      await auth.signIn({ email: "admin@example.com", password: PW }, "192.168.1.66"),
    ).toMatchObject({ reason: "locked" });
  });

  it("forgets stale failure counts but keeps active locks", async () => {
    await auth.signIn({ email: "admin@example.com", password: "x" }, "10.1.1.1");
    for (let i = 0; i < LOCKOUT_FAILURES; i++) {
      await auth.signIn({ email: "admin@example.com", password: "x" }, "10.1.1.2");
    }
    const later = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await t.db.loginLock.updateMany({ data: { updatedAt: new Date(0) } });
    await t.db.loginLock.updateMany({
      where: { address: "10.1.1.2" },
      data: { lockedUntil: new Date(later.getTime() + 60_000) },
    });
    expect(await t.data.auth.deleteStaleLoginLocks(later)).toBe(1);
    expect((await t.db.loginLock.findMany()).map((l) => l.address)).toEqual(["10.1.1.2"]);
  });

  it("a success resets the failure count", async () => {
    for (let i = 1; i < LOCKOUT_FAILURES; i++)
      await auth.signIn({ email: "admin@example.com", password: "x" }, ADDR);
    await auth.signIn({ email: "admin@example.com", password: PW }, ADDR);
    expect(await auth.signIn({ email: "admin@example.com", password: "x" }, ADDR)).toMatchObject({
      reason: "invalid",
    });
  });

  it("treats a deactivated account like a wrong password", async () => {
    const admin = (await t.db.user.findFirstOrThrow()).id;
    const f = await auth.adminCreateUser(
      { userId: admin, role: "ADMIN" },
      { name: "F", email: "f@example.com", password: PW },
    );
    await t.data.users.setActive({ userId: admin, role: "ADMIN" }, f.id, false);
    expect(await auth.signIn({ email: "f@example.com", password: PW }, ADDR)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("limits attempts per address across all accounts", async () => {
    for (let i = 0; i < SIGN_IN_PER_ADDRESS.max; i++) {
      await auth.signIn({ email: `user${i}@example.com`, password: "x" }, "10.0.0.9");
    }
    const r = await auth.signIn({ email: "admin@example.com", password: PW }, "10.0.0.9");
    expect(r).toEqual({
      ok: false,
      reason: "rate-limited",
      retryAfterMs: SIGN_IN_PER_ADDRESS.windowMs,
    });
    expect((await auth.signIn({ email: "admin@example.com", password: PW }, "10.0.0.10")).ok).toBe(
      true,
    );
  });
});

describe("sessions", () => {
  it("store only the token hash", async () => {
    const { token } = await setup();
    expect(await t.db.session.findUnique({ where: { id: token } })).toBeNull();
    expect(await t.db.session.findUnique({ where: { id: sha256Hex(token) } })).not.toBeNull();
  });

  it("reject missing, unknown and oversized tokens", async () => {
    await setup();
    expect(await auth.validateSession(undefined)).toBeNull();
    expect(await auth.validateSession("")).toBeNull();
    expect(await auth.validateSession("not-a-token")).toBeNull();
    expect(await auth.validateSession("x".repeat(101))).toBeNull();
  });

  it("slide forward when used, at most once an hour, and end after 7 idle days", async () => {
    const { token, expiresAt } = await setup();
    expect(expiresAt.getTime()).toBe(clock + SESSION_IDLE_MS);
    advance(SESSION_RENEW_AFTER_MS - 1);
    expect((await auth.validateSession(token))?.renewed).toBe(false);
    advance(2);
    const renewed = await auth.validateSession(token);
    expect(renewed?.renewed).toBe(true);
    expect(renewed?.expiresAt.getTime()).toBe(clock + SESSION_IDLE_MS);
    advance(SESSION_IDLE_MS);
    expect(await auth.validateSession(token)).toBeNull();
    expect(await t.db.session.count()).toBe(0);
  });

  it("end when the account is deactivated or signed out", async () => {
    const { actor } = await setup();
    const f = await auth.adminCreateUser(actor, {
      name: "F",
      email: "f@example.com",
      password: PW,
    });
    const r = await auth.signIn({ email: "f@example.com", password: PW }, ADDR);
    expect(r).toMatchObject({ ok: true, mustChangePassword: true });
    if (!r.ok) return;
    await t.db.user.update({ where: { id: f.id }, data: { isActive: false } });
    expect(await auth.validateSession(r.token)).toBeNull();

    const again = await auth.signIn({ email: "admin@example.com", password: PW }, ADDR);
    if (!again.ok) throw new Error("sign-in failed");
    await auth.signOut(again.token);
    await auth.signOut(undefined);
    expect(await auth.validateSession(again.token)).toBeNull();
  });

  it("expired rows are pruned", async () => {
    await setup();
    advance(SESSION_IDLE_MS + 1);
    expect(await auth.pruneSessions()).toBe(1);
  });
});

describe("changing your own password", () => {
  it("needs the current password, refuses the same one, and ends your other sessions", async () => {
    const { session, token } = await setup();
    const other = await auth.signIn({ email: "admin@example.com", password: PW }, ADDR);
    if (!other.ok) throw new Error("sign-in failed");
    expect(await auth.changePassword(session, "wrong password", "another password 1")).toBe(false);
    await expect(auth.changePassword(session, PW, PW)).rejects.toThrow(SAME_PASSWORD);
    await expect(auth.changePassword(session, PW, "short")).rejects.toBeInstanceOf(ZodError);
    expect(await auth.changePassword(session, PW, "another password 1")).toBe(true);
    expect(await auth.validateSession(token)).not.toBeNull();
    expect(await auth.validateSession(other.token)).toBeNull();
    expect(
      (await auth.signIn({ email: "admin@example.com", password: "another password 1" }, ADDR)).ok,
    ).toBe(true);
  });

  it("clears the must-change flag an admin set", async () => {
    const { actor } = await setup();
    const f = await auth.adminCreateUser(actor, {
      name: "F",
      email: "f@example.com",
      password: PW,
    });
    await auth.adminResetPassword(actor, f.id, "temporary pass 1");
    const r = await auth.signIn({ email: "f@example.com", password: "temporary pass 1" }, ADDR);
    if (!r.ok) throw new Error("sign-in failed");
    expect(r.mustChangePassword).toBe(true);
    const s = (await auth.validateSession(r.token))!;
    await auth.changePassword(s, "temporary pass 1", "my own password");
    expect((await auth.validateSession(r.token))?.user.mustChangePassword).toBe(false);
  });

  it("returns false if the account vanished", async () => {
    const { session } = await setup();
    await expect(
      auth.changePassword(
        { ...session, user: { ...session.user, id: "gone" } },
        PW,
        "another password 1",
      ),
    ).resolves.toBe(false);
  });
});

describe("admin actions", () => {
  it("are refused to faculty", async () => {
    const { actor } = await setup();
    const f = await auth.adminCreateUser(actor, {
      name: "F",
      email: "f@example.com",
      password: PW,
      institution: "KBIPER",
    });
    expect(f.institution).toBe("KBIPER");
    const fa = { userId: f.id, role: "FACULTY" as const };
    await expect(
      auth.adminCreateUser(fa, { name: "G", email: "g@example.com", password: PW }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      auth.adminResetPassword(fa, actor.userId, "new password 1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(auth.createInvite(fa, "ADMIN", null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("invites", () => {
  it("create an account once, with the invite's role, and sign it in", async () => {
    const { actor } = await setup();
    const { code, expiresAt } = await auth.createInvite(actor, "FACULTY", "  for Dr Shah  ");
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(expiresAt.getTime() - clock).toBe(7 * 24 * 3600_000);
    const open = await auth.listInvites(actor);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ note: "for Dr Shah", role: "FACULTY" });
    expect(JSON.stringify(open)).not.toContain(code);

    const typed = code.toLowerCase().replaceAll("-", " ");
    const r = await auth.redeemInvite(
      typed,
      { name: "Dr Shah", email: "shah@example.com", password: PW },
      ADDR,
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect((await auth.validateSession(r.token))?.user).toMatchObject({
        role: "FACULTY",
        name: "Dr Shah",
      });
    await expect(
      auth.redeemInvite(code, { name: "X", email: "x@example.com", password: PW }, ADDR),
    ).rejects.toThrow(INVITE_INVALID);
    expect(await auth.listInvites(actor)).toEqual([]);
  });

  it("expire after 7 days", async () => {
    const { actor } = await setup();
    const { code } = await auth.createInvite(actor, "ADMIN", null);
    advance(7 * 24 * 3600_000);
    await expect(
      auth.redeemInvite(code, { name: "X", email: "x@example.com", password: PW }, ADDR),
    ).rejects.toThrow(INVITE_INVALID);
    expect(await t.db.user.count()).toBe(1);
  });

  it("can be revoked, and only once", async () => {
    const { actor } = await setup();
    const { code } = await auth.createInvite(actor, "FACULTY", null);
    const [invite] = await auth.listInvites(actor);
    await auth.revokeInvite(actor, invite!.id);
    await expect(auth.revokeInvite(actor, invite!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      auth.redeemInvite(code, { name: "X", email: "x@example.com", password: PW }, ADDR),
    ).rejects.toThrow(INVITE_INVALID);
  });

  it("are not used up when the email is already taken", async () => {
    const { actor } = await setup();
    const { code } = await auth.createInvite(actor, "FACULTY", null);
    await expect(
      auth.redeemInvite(code, { name: "X", email: "admin@example.com", password: PW }, ADDR),
    ).rejects.toThrow(EMAIL_TAKEN);
    expect(
      (await auth.redeemInvite(code, { name: "X", email: "x@example.com", password: PW }, ADDR)).ok,
    ).toBe(true);
  });

  it("refuse unknown and malformed codes", async () => {
    await setup();
    const input = { name: "X", email: "x@example.com", password: PW };
    await expect(auth.redeemInvite("0000-0000-0000", input, ADDR)).rejects.toThrow(INVITE_INVALID);
    await expect(auth.redeemInvite("not a code", input, ADDR)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("limit attempts per address", async () => {
    await setup();
    const input = { name: "X", email: "x@example.com", password: PW };
    for (let i = 0; i < INVITE_PER_ADDRESS.max; i++) {
      await auth.redeemInvite("0000-0000-0000", input, "10.0.0.7").catch(() => undefined);
    }
    expect(await auth.redeemInvite("0000-0000-0000", input, "10.0.0.7")).toEqual({
      ok: false,
      retryAfterMs: INVITE_PER_ADDRESS.windowMs,
    });
  });
});

describe("SPEC §11 values", () => {
  it("match the specification exactly", () => {
    expect(LOCKOUT_FAILURES).toBe(5);
    expect(LOCKOUT_MS).toBe(15 * 60_000);
    expect(SESSION_IDLE_MS).toBe(7 * 24 * 3600_000);
  });
});
