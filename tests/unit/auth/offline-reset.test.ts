// The staged offline password reset (D49), in a throwaway folder.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RESET_FILE, stageReset, takeReset, temporaryPassword } from "@/lib/auth/offline-reset";
import { PASSWORD_MIN } from "@/lib/auth/password-rules";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-reset-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const request = {
  email: "admin@example.test",
  passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA",
  createdAt: "2026-11-04T10:00:00.000Z",
};

describe("temporaryPassword", () => {
  it("is three groups of five easy-to-read characters", () => {
    for (let i = 0; i < 50; i++) {
      const p = temporaryPassword();
      expect(p).toMatch(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/);
      expect(p.length).toBeGreaterThanOrEqual(PASSWORD_MIN);
    }
    expect(temporaryPassword(() => 0)).toBe("aaaaa-aaaaa-aaaaa");
    expect(new Set(Array.from({ length: 20 }, () => temporaryPassword())).size).toBe(20);
  });
});

describe("stageReset and takeReset", () => {
  it("hands the request over once and leaves nothing behind", () => {
    stageReset(dir, { ...request, email: " Admin@Example.TEST " });
    const file = path.join(dir, RESET_FILE);
    if (process.platform !== "win32") expect(fs.statSync(file).mode & 0o077).toBe(0);
    expect(takeReset(dir)).toEqual(request);
    expect(fs.existsSync(file)).toBe(false);
    expect(takeReset(dir)).toBeNull();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("refuses to stage anything but an argon2id hash", () => {
    expect(() => stageReset(dir, { ...request, passwordHash: "plain text" })).toThrow();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("removes an unreadable or altered file instead of applying it", () => {
    const file = path.join(dir, RESET_FILE);
    fs.writeFileSync(file, "{ not json");
    expect(takeReset(dir)).toBe("invalid");
    expect(fs.existsSync(file)).toBe(false);
    fs.writeFileSync(file, JSON.stringify({ ...request, role: "ADMIN" }));
    expect(takeReset(dir)).toBe("invalid");
    expect(fs.existsSync(file)).toBe(false);
  });
});
