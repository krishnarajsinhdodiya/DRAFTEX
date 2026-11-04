// Password rules and argon2id hashing (SPEC §11.3, memory.md "Auth (D5)").
import { type Algorithm, hash, verify } from "@node-rs/argon2";
export { PASSWORD_MAX, PASSWORD_MIN, passwordSchema } from "./password-rules.ts";

/** OWASP argon2id baseline: 19 MiB, 2 passes, 1 lane. Algorithm 2 is Argon2id. */
export const ARGON2_OPTIONS = {
  algorithm: 2 as Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** False for a wrong password and for a malformed stored hash; never throws. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** A real hash of a random string, so a sign-in for an unknown email takes as long as a real one. */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(crypto.randomUUID());
  return dummy;
}
