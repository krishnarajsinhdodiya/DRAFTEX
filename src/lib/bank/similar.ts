// Near-duplicate questions (Phase 16, D114): 3-word shingles and Jaccard
// similarity on the D76 normalised text (NFKC, lower case, spaces folded).
// Words are runs of letters, digits and maths/code symbols, so punctuation
// alone never makes two questions differ. Pure and client-safe.
import { normaliseText } from "./question";

/** Shingle length in words. */
export const SHINGLE = 3;
/**
 * Jaccard at or above this is "possibly the same question". Chosen on the
 * invented pairs in tests/unit/bank/similar.test.ts: every reworded pair
 * (lowest 0.35) is caught; 3 of 8 different-but-alike pairs are flagged too
 * (highest 0.50), which a warning that never blocks can afford (memory.md).
 */
export const NEAR_THRESHOLD = 0.35;
/** Texts shorter than this many words are left to the exact check (D76). */
export const MIN_WORDS = 4;

export function words(text: string): string[] {
  return normaliseText(text).match(/[\p{L}\p{N}$^\\_{}=+*/<>%-]+/gu) ?? [];
}

/** The set of 3-word shingles of a text; empty when it has fewer than MIN_WORDS words. */
export function shingles(text: string): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  if (w.length < MIN_WORDS) return out;
  for (let i = 0; i + SHINGLE <= w.length; i++) out.add(w.slice(i, i + SHINGLE).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let both = 0;
  for (const s of small) if (large.has(s)) both += 1;
  return both / (a.size + b.size - both);
}

export interface Candidate {
  id: string;
  text: string;
}

export interface Similar {
  id: string;
  /** Jaccard similarity, 0-1. */
  score: number;
}

/**
 * Candidates at or above the threshold, most similar first; at most `limit`.
 * Identical texts (the exact D76 duplicate) are left out: the exact check
 * reports those already.
 */
export function similarTo(text: string, candidates: Candidate[], limit = 5): Similar[] {
  const mine = shingles(text);
  if (mine.size === 0) return [];
  const self = normaliseText(text);
  const out: Similar[] = [];
  for (const c of candidates) {
    if (normaliseText(c.text) === self) continue;
    const score = jaccard(mine, shingles(c.text));
    if (score >= NEAR_THRESHOLD) out.push({ id: c.id, score });
  }
  return out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, limit);
}

export interface SimilarPair {
  a: string;
  b: string;
  score: number;
}

/**
 * Every pair in one set of questions at or above the threshold, most similar
 * first. An inverted index on shingles limits the work to pairs that share
 * at least one shingle.
 */
export function similarPairs(items: Candidate[]): SimilarPair[] {
  const sets = items.map((c) => ({ id: c.id, norm: normaliseText(c.text), s: shingles(c.text) }));
  const index = new Map<string, number[]>();
  sets.forEach((x, i) => {
    for (const sh of x.s) {
      const list = index.get(sh);
      if (list) list.push(i);
      else index.set(sh, [i]);
    }
  });
  const seen = new Set<number>();
  const out: SimilarPair[] = [];
  const n = sets.length;
  for (const list of index.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const i = list[x]!;
        const j = list[y]!;
        const key = i * n + j;
        if (seen.has(key)) continue;
        seen.add(key);
        const [p, q] = [sets[i]!, sets[j]!];
        if (p.norm === q.norm) continue;
        const score = jaccard(p.s, q.s);
        if (score >= NEAR_THRESHOLD) {
          const [a, b] = p.id < q.id ? [p.id, q.id] : [q.id, p.id];
          out.push({ a, b, score });
        }
      }
    }
  }
  return out.sort((x, y) => y.score - x.score || (x.a < y.a ? -1 : x.a > y.a ? 1 : 0));
}

/** "72%" for messages. */
export function percent(score: number): string {
  return `${Math.round(score * 100)}%`;
}
