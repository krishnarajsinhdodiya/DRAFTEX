// Password rules (SPEC §11.3). No native imports, so forms can show them.
import { z } from "zod";

export const PASSWORD_MIN = 10;
/** Upper bound so a huge password cannot tie up the hasher. */
export const PASSWORD_MAX = 256;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);
