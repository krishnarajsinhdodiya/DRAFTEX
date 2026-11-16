// Bank search terms and page cursors (Phase 16; D125, D127, D129, D130).
// Pure; server side (cursors use Buffer). Nothing the user types ever reaches FTS5 as syntax:
// each word becomes one quoted phrase (inner quotes doubled), and words too
// short for the trigram index are matched with instr() on the indexed text.
import { z } from "zod";

export const SEARCH_MAX_CHARS = 100;
export const SEARCH_MAX_WORDS = 8;
/** The trigram tokenizer cannot match anything shorter than this. */
export const TRIGRAM = 3;

export interface SearchTerms {
  /** FTS5 MATCH string (every phrase must match), or null when no word is long enough. */
  match: string | null;
  /** Lower-cased words under three characters, each matched with instr() on the indexed text. */
  short: string[];
  /** The words actually searched for (after the 8-word cap), for messages. */
  words: string[];
}

/** Characters, not UTF-16 units: an emoji counts once. */
const length = (s: string) => [...s].length;

/**
 * Splits the search box on white space (D127). Every word must match.
 * Over 100 characters the text is cut there; words after the 8th are dropped.
 * Returns null for an empty search.
 */
export function searchTerms(input: string | null | undefined): SearchTerms | null {
  const text = [...(input ?? "").normalize("NFKC")].slice(0, SEARCH_MAX_CHARS).join("");
  const words = [...new Set(text.split(/\s+/u).filter(Boolean))].slice(0, SEARCH_MAX_WORDS);
  if (words.length === 0) return null;
  const long = words.filter((w) => length(w) >= TRIGRAM);
  return {
    match: long.length ? long.map((w) => `"${w.replaceAll('"', '""')}"`).join(" ") : null,
    short: words.filter((w) => length(w) < TRIGRAM).map((w) => w.toLocaleLowerCase("en")),
    words,
  };
}

// --- Keyset cursors (D130) ------------------------------------------------

const cursorSchema = z.object({
  /** COALESCE(updatedAt, createdAt) of the edge row, in whole milliseconds since 1970. */
  t: z.number().int().min(0).max(8.64e15),
  /** Question id of the edge row (uuid). */
  id: z.string().min(1).max(64),
});
export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify({ t: c.t, id: c.id }), "utf8").toString("base64url");
}

/** A cursor from the address bar; anything that is not one of ours reads as "first page". */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const r = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * The order key in SQL: whole milliseconds, because the stored text is not one
 * format (the adapter writes "+00:00", a JavaScript date reads "Z").
 */
export function msSql(column: string): string {
  return `CAST(round((julianday(${column}) - 2440587.5) * 86400000) AS INTEGER)`;
}

/** Cursor fields of a page request: `after` = older than the cursor, `before` = newer. */
export const pageRequestSchema = z.object({
  after: z.string().max(200).optional(),
  before: z.string().max(200).optional(),
});
