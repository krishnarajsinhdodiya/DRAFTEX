// Bloom levels: the one label table shared by the editor, the summary panel,
// the printed paper and the answer key (owner's wording, 2026-11-06: the
// level names, British "Analyse", printed as "(Bloom: Remember)").
// Client-safe; the values match the Prisma `BloomLevel` enum.

export const BLOOM_LEVELS = [
  "REMEMBER",
  "UNDERSTAND",
  "APPLY",
  "ANALYZE",
  "EVALUATE",
  "CREATE",
] as const;
export type Bloom = (typeof BLOOM_LEVELS)[number];

export const BLOOM_LABEL: Record<Bloom, string> = {
  REMEMBER: "Remember",
  UNDERSTAND: "Understand",
  APPLY: "Apply",
  ANALYZE: "Analyse",
  EVALUATE: "Evaluate",
  CREATE: "Create",
};

/** As printed after a question's text: `(Bloom: Remember)`. */
export function bloomPrinted(level: Bloom): string {
  return `(Bloom: ${BLOOM_LABEL[level]})`;
}
