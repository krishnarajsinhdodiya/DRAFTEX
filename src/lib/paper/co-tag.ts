// CO tags as the papers print them (D63): `BP604T.01`, and for elective
// options the base code, the CO number, then the option suffix:
// `BP607T.01 AEC1`. Client-safe (no server imports).

/** A tag: letters, digits and dots, then optionally one space and a suffix. */
export const CO_TAG_RE = /^[A-Za-z0-9.]{1,20}(?: [A-Za-z0-9]{1,8})?$/;
export const CO_TAG_MAX = 29;
export const CO_TAG_HINT = "CO tags look like BP604T.01 or BP607T.01 AEC1";

/** `coTag("BP607T AEC1", 1)` → `BP607T.01 AEC1`; plain codes → `BP604T.01`. */
export function coTag(code: string, number: number): string {
  const [base = "", ...rest] = code.trim().split(/\s+/);
  const n = String(number).padStart(2, "0");
  const suffix = rest.join("");
  return suffix ? `${base}.${n} ${suffix}` : `${base}.${n}`;
}

/**
 * Cleans a typed tag: drops characters a tag cannot hold and keeps at most
 * one space (before the suffix). Leading spaces go; a trailing space stays
 * while the user is still typing the suffix.
 */
export function cleanCoTagInput(raw: string): string {
  const s = raw.replace(/[^A-Za-z0-9. ]/g, "").replace(/^ +/, "");
  const i = s.indexOf(" ");
  if (i < 0) return s.slice(0, 20);
  const head = s.slice(0, Math.min(i, 20));
  const tail = s
    .slice(i + 1)
    .replace(/[ .]/g, "")
    .slice(0, 8);
  return `${head} ${tail}`;
}
