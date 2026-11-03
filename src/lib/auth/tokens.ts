// Session tokens and invite codes. Only their SHA-256 is stored, so a copy of
// the database cannot be used to sign in or to redeem an invite.
import { createHash, randomBytes } from "node:crypto";

/** 160 random bits, base64url: the session cookie value. */
export function newSessionToken(): string {
  return randomBytes(20).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Crockford base32: no I, L, O or U, so codes read aloud or typed by hand survive. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 60 random bits as 12 characters in three groups: XXXX-XXXX-XXXX. */
export function newInviteCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) out += ALPHABET[b & 31];
  return out.match(/.{4}/g)!.join("-");
}

/**
 * Normalises a typed invite code: case-insensitive, spaces and dashes ignored,
 * and the look-alikes O→0, I/L→1. Returns null if it cannot be a code.
 */
export function normaliseInviteCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (raw.length !== 12 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return raw.match(/.{4}/g)!.join("-");
}
