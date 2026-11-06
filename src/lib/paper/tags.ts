// Bloom levels and CO tags of a paper's questions and sub-parts: the
// sub-part marks check, the export warnings and the summary panel (Phase 10,
// D65-D69). Pure and client-safe.
import { BLOOM_LABEL, BLOOM_LEVELS, type Bloom } from "./bloom.ts";
import { marksNumber, sameMarks } from "./key.ts";
import type { Doc, SubPartAttrs } from "./schema.ts";

export interface TaggedQuestion {
  content: Doc;
  marks: number;
  coTag: string | null;
  bloomLevel: Bloom | null;
}

/** Every sub-part's own values, in order. */
export function subPartAttrs(doc: Doc): (SubPartAttrs | undefined)[] {
  return doc.content.flatMap((b) => (b.type === "subParts" ? b.content.map((p) => p.attrs) : []));
}

/** The total of the sub-parts' own marks, or null when none has marks. */
function subPartTotal(parts: (SubPartAttrs | undefined)[]): number | null {
  const set = parts.map((a) => a?.marks).filter((m): m is number => typeof m === "number");
  return set.length ? set.reduce((a, b) => a + b, 0) : null;
}

/** A warning when the sub-parts' marks do not add up to the question's (never an error). */
export function subPartMarksNote(doc: Doc, marks: number): string | null {
  const parts = subPartAttrs(doc);
  const total = subPartTotal(parts);
  if (total === null) return null;
  const unset = parts.filter((a) => typeof a?.marks !== "number").length;
  if (unset === 0 && sameMarks(total, marks)) return null;
  const rest = unset ? ` (${unset} sub-part${unset === 1 ? " has" : "s have"} no marks)` : "";
  return `The sub-part marks add up to ${marksNumber(total)}${rest}, but the question is worth ${marksNumber(marks)}.`;
}

/** Whether a question (or any of its sub-parts) would print without a Bloom level or CO tag. */
export function missingTags(q: TaggedQuestion): { bloom: boolean; co: boolean } {
  const parts = subPartAttrs(q.content);
  if (!parts.length) return { bloom: !q.bloomLevel, co: !q.coTag };
  return {
    bloom: parts.some((a) => !(a?.bloom ?? q.bloomLevel)),
    co: parts.some((a) => !(a?.coTag ?? q.coTag)),
  };
}

export interface SummaryRow {
  /** A Bloom level, a CO tag, or "" for questions without one. */
  key: string;
  label: string;
  count: number;
  marks: number;
}

export interface TagSummary {
  bloom: SummaryRow[];
  co: SummaryRow[];
  /** Questions counted (sub-parts that split a question count once each). */
  items: number;
}

/**
 * Count and marks per Bloom level and per CO (D69). Every written question
 * counts, optional ones included. A question whose sub-parts carry their own
 * values is split by sub-part marks, but only when those add up to its marks;
 * otherwise it counts under its own values.
 */
export function tagSummary(questions: TaggedQuestion[]): TagSummary {
  const bloom = new Map<string, SummaryRow>();
  const co = new Map<string, SummaryRow>();
  let items = 0;
  const add = (m: Map<string, SummaryRow>, key: string, label: string, marks: number) => {
    const row = m.get(key) ?? { key, label, count: 0, marks: 0 };
    row.count++;
    row.marks += marks;
    m.set(key, row);
  };
  const count = (b: Bloom | null, c: string | null, marks: number) => {
    items++;
    add(bloom, b ?? "", b ? BLOOM_LABEL[b] : "No level", marks);
    add(co, c ?? "", c ?? "No CO", marks);
  };
  for (const q of questions) {
    if (q.content.content.length === 0) continue;
    const parts = subPartAttrs(q.content);
    const own = parts.some((a) => a?.bloom || a?.coTag);
    const split =
      own &&
      parts.every((a) => typeof a?.marks === "number") &&
      sameMarks(subPartTotal(parts) ?? 0, q.marks);
    if (!split) {
      count(q.bloomLevel, q.coTag, q.marks);
      continue;
    }
    for (const a of parts) {
      count(a?.bloom ?? q.bloomLevel, a?.coTag ?? q.coTag, a?.marks as number);
    }
  }
  const order = (m: Map<string, SummaryRow>, keys: string[]) => {
    const rows = keys.flatMap((k) => (m.has(k) ? [m.get(k) as SummaryRow] : []));
    return m.has("") ? [...rows, m.get("") as SummaryRow] : rows;
  };
  return {
    bloom: order(bloom, [...BLOOM_LEVELS]),
    co: order(
      co,
      [...co.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    ),
    items,
  };
}
