// Offline password reset (D49): `npm run reset-password -- <email>` runs on the
// DRAFTEX computer while the app is stopped, hashes a new temporary password
// and leaves a one-time request in the data folder; the next start applies it
// through the data layer (src/server/startup.ts) and deletes the file. It is
// the way back in when the only administrator has forgotten the password.
// Anyone who can write to the data folder could already change the database.
// Imported by Node scripts under type stripping: relative imports only.
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const RESET_FILE = "reset-password.json";

/** No 0/o, 1/l/i: the password is read off a screen and typed by hand. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Three groups of five, e.g. "k7mpq-x3vta-9hcer": 17 characters, about 74 bits. */
export function temporaryPassword(pick: (n: number) => number = randomInt): string {
  const group = () => Array.from({ length: 5 }, () => ALPHABET[pick(ALPHABET.length)]).join("");
  return [group(), group(), group()].join("-");
}

const requestSchema = z
  .object({
    email: z.string().trim().toLowerCase().min(3).max(254),
    passwordHash: z.string().startsWith("$argon2id$").max(512),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type ResetRequest = z.output<typeof requestSchema>;

/** Writes the request atomically and readable by this account only. */
export function stageReset(dataDir: string, request: ResetRequest): void {
  const checked = requestSchema.parse(request);
  const file = path.join(dataDir, RESET_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(checked, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * Reads and deletes a staged request. The file is removed even when it is
 * unreadable, so a bad file never blocks startup twice and a request is never
 * applied twice.
 */
export function takeReset(dataDir: string): ResetRequest | "invalid" | null {
  const file = path.join(dataDir, RESET_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    return requestSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return "invalid";
  } finally {
    fs.rmSync(file, { force: true });
  }
}
