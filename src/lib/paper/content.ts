// Walks slot content (TipTap JSON) for the things the data layer must check.
import type { Doc } from "./schema";

type AnyNode = { type: string; attrs?: Record<string, unknown>; content?: AnyNode[] };

function walk(nodes: AnyNode[] | undefined, visit: (n: AnyNode) => void): void {
  for (const n of nodes ?? []) {
    visit(n);
    walk(n.content, visit);
  }
}

/** SHA-256 of every picture in the question. */
export function imageShas(doc: Doc): string[] {
  const out: string[] = [];
  walk(doc.content as AnyNode[], (n) => {
    if (n.type === "image" && typeof n.attrs?.sha256 === "string") out.push(n.attrs.sha256);
  });
  return out;
}

/** The LaTeX of every Advanced LaTeX block, in order. */
export function advancedSnippets(doc: Doc): string[] {
  const out: string[] = [];
  walk(doc.content as AnyNode[], (n) => {
    if (n.type === "advancedLatex" && typeof n.attrs?.latex === "string") out.push(n.attrs.latex);
  });
  return out;
}

/** True when every snippet in `next` was already in `prev` (a revoked user may keep, not add). */
export function onlyKnownSnippets(next: string[], prev: string[]): boolean {
  const left = [...prev];
  for (const s of next) {
    const i = left.indexOf(s);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}
