// CO tags as the papers print them (D63): `BP604T.01`, and for elective
// options the base code, the CO number, then the option suffix:
// `BP607T.01 AEC1`. Client-safe (no server imports).

/** A tag: letters, digits and dots, then optionally one space and a suffix. */
export const CO_TAG_RE = /^[A-Za-z0-9.]{1,20}(?: [A-Za-z0-9]{1,8})?$/;
export const CO_TAG_MAX = 29;
export const CO_TAG_HINT = "CO tags look like BP604T.01 or BP607T.01 AEC1";

/** At most this many CO tags on one question or sub-part (D119). */
export const CO_TAGS_MAX = 2;
/** Separator of a stored tag list: `BP604T.01, BP604T.03` (D119 as built). */
export const CO_TAG_SEP = ", ";
const ONE = "[A-Za-z0-9.]{1,20}(?: [A-Za-z0-9]{1,8})?";
/** One tag, or two different tags separated by ", " (difference checked by `coTagsSchema` users). */
export const CO_TAGS_RE = new RegExp(`^${ONE}(?:, ${ONE})?$`);
export const CO_TAGS_HINT = `${CO_TAG_HINT}; a second CO follows a comma`;

/** The tags of a stored value: `"A, B"` → `["A", "B"]`; empty or null → `[]`. */
export function splitCoTags(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** The stored value of up to two tags (empty ones and a repeat dropped), or null. */
export function joinCoTags(tags: (string | null | undefined)[]): string | null {
  const out: string[] = [];
  for (const t of tags) {
    const v = t?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out.length ? out.slice(0, CO_TAGS_MAX).join(CO_TAG_SEP) : null;
}

/** True when a stored value holds valid, different tags. */
export function validCoTags(value: string): boolean {
  if (!CO_TAGS_RE.test(value)) return false;
  const t = splitCoTags(value);
  return t.length === new Set(t).size;
}

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
