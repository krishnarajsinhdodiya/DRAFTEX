import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dummyHash, hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { newInviteCode, newSessionToken, normaliseInviteCode, sha256Hex } from "@/lib/auth/tokens";
import { ConfigError, readConfig } from "@/lib/config";

describe("passwords", () => {
  it("hash with argon2id and verify", async () => {
    const h = await hashPassword("a long enough password");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "a long enough password")).toBe(true);
    expect(await verifyPassword(h, "a long enough passworD")).toBe(false);
  });

  it("treat a malformed stored hash as a mismatch", async () => {
    expect(await verifyPassword("not a hash", "whatever")).toBe(false);
  });

  it("keep one dummy hash for unknown accounts", async () => {
    expect(await dummyHash()).toBe(await dummyHash());
  });

  it("allow 10 to 256 characters, including spaces and any script", () => {
    expect(passwordSchema.safeParse("123456789").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890").success).toBe(true);
    expect(passwordSchema.safeParse("पासवर्ड सुरक्षित है").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(256)).success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(257)).success).toBe(false);
  });
});

describe("tokens", () => {
  it("session tokens are 160-bit base64url and unique", () => {
    const a = newSessionToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{27}$/);
    expect(newSessionToken()).not.toBe(a);
  });

  it("sha256Hex is the hex digest", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("invite codes round-trip through what a person might type", () => {
    for (let i = 0; i < 200; i++) {
      const c = newInviteCode();
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$/);
      expect(normaliseInviteCode(c.toLowerCase().replaceAll("-", " "))).toBe(c);
    }
    expect(normaliseInviteCode("ABCD-EFGH-JKOI")).toBe("ABCD-EFGH-JK01");
    expect(normaliseInviteCode("abcd efgh jkl")).toBeNull();
    expect(normaliseInviteCode("ABCD-EFGH-JKU1")).toBeNull();
    expect(normaliseInviteCode("ABCD-EFGH-JK1")).toBeNull();
  });
});

describe("rate limiter", () => {
  it("allows max hits per window per key, then reports the wait", () => {
    let now = 0;
    const rl = createRateLimiter({ max: 3, windowMs: 1000, now: () => now });
    expect([rl.hit("a"), rl.hit("a"), rl.hit("a")]).toEqual([0, 0, 0]);
    now = 400;
    expect(rl.hit("a")).toBe(600);
    expect(rl.hit("b")).toBe(0);
    now = 1001;
    expect(rl.hit("a")).toBe(0);
    rl.reset("a");
    expect([rl.hit("a"), rl.hit("a")]).toEqual([0, 0]);
  });

  it("forgets the oldest key when too many are tracked", () => {
    const now = 0;
    const rl = createRateLimiter({ max: 1, windowMs: 1000, now: () => now, maxKeys: 2 });
    rl.hit("a");
    rl.hit("b");
    rl.hit("c");
    expect(rl.hit("a")).toBe(0);
    expect(rl.hit("c")).toBe(1000);
  });

  it("uses the real clock by default", () => {
    const rl = createRateLimiter({ max: 1, windowMs: 60_000 });
    expect(rl.hit("x")).toBe(0);
    expect(rl.hit("x")).toBeGreaterThan(0);
  });
});

describe("config.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-config-"));
  const file = path.join(dir, "config.json");

  it("defaults to local mode when missing", () => {
    expect(readConfig(path.join(dir, "missing.json"))).toEqual({ mode: "local" });
  });

  it("reads the mode and ignores settings for later phases", () => {
    fs.writeFileSync(file, JSON.stringify({ mode: "lan", port: 3210 }));
    expect(readConfig(file)).toEqual({ mode: "lan" });
  });

  it("explains bad JSON, bad values and unreadable files", () => {
    fs.writeFileSync(file, "{");
    expect(() => readConfig(file)).toThrow(/not valid JSON/);
    fs.writeFileSync(file, JSON.stringify({ mode: "internet" }));
    expect(() => readConfig(file)).toThrow(ConfigError);
    expect(() =>
      readConfig(file, () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }),
    ).toThrow(/cannot read/);
  });
});
