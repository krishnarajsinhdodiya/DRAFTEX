// Bank search terms (Phase 16; D125, D127). Pure. Nothing the user types ever reaches FTS5 as syntax:
// each word becomes one quoted phrase (inner quotes doubled), and words too
// short for the trigram index are matched with instr() on the indexed text.

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
