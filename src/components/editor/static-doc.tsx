"use client";
// A question as it reads, without an editor: used for every question that is
// not being edited, so a paper with 40 questions opens at once.
import type { ReactNode } from "react";
import { BLOOM_LABEL } from "@/lib/paper/bloom";
import { tableGrid } from "@/lib/latex/table";
import type {
  BlockNode,
  Doc,
  InlineNode,
  LeafBlockNode,
  SubPartAttrs,
  TableNode,
} from "@/lib/paper/schema";
import { MathText } from "./math";
import { unitLabel } from "./units";

const LETTERS = "ABCDEFGH";

function Inline({ nodes }: { nodes: InlineNode[] | undefined }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        switch (n.type) {
          case "text": {
            let el: ReactNode = n.text;
            for (const m of n.marks ?? []) {
              el =
                m.type === "bold" ? (
                  <strong>{el}</strong>
                ) : m.type === "italic" ? (
                  <em>{el}</em>
                ) : m.type === "underline" ? (
                  <u>{el}</u>
                ) : m.type === "subscript" ? (
                  <sub>{el}</sub>
                ) : m.type === "code" ? (
                  <code className="rounded bg-sunk px-1 font-mono text-[0.92em]">{el}</code>
                ) : (
                  <sup>{el}</sup>
                );
            }
            return <span key={i}>{el}</span>;
          }
          case "hardBreak":
            return <br key={i} />;
          case "mathInline":
            return <MathText key={i} latex={n.attrs.latex} />;
          case "blank":
            return (
              <span
                key={i}
                aria-label="blank"
                className="inline-block border-b border-ink align-baseline"
                style={{
                  width: `${Math.min(n.attrs?.widthCm ?? 2.5, 12) * 0.6}rem`,
                  height: "1em",
                }}
              />
            );
          case "units":
            return (
              <span key={i} className="tabular-nums">
                {n.attrs.value}&thinsp;{unitLabel(n.attrs.unit)}
              </span>
            );
        }
      })}
    </>
  );
}

/** The grid column where the `c`-th cell of row `r` starts (merged cells push later ones along). */
function cellColumn(t: TableNode, r: number, c: number): number {
  const g = tableGrid(t);
  if ("problem" in g) return c;
  const starts = (g.grid.at[r] ?? []).filter((a) => a.row === r && a.cell !== null);
  const seen = new Set<number>();
  const cols = starts.filter((a) => !seen.has(a.col) && seen.add(a.col)).map((a) => a.col);
  return cols[c] ?? c;
}

function Leaf({ b, defaultColumns }: { b: LeafBlockNode; defaultColumns: number }) {
  switch (b.type) {
    case "paragraph":
      return (
        <p className="min-h-[1.375rem]">
          <Inline nodes={b.content} />
        </p>
      );
    case "mathDisplay":
      return (
        <div className="my-1">
          <MathText latex={b.attrs.latex} display />
        </div>
      );
    case "image":
      return (
        <div className="my-2 flex justify-center">
          {b.attrs.ext === "pdf" ? (
            <span className="rounded border border-dashed border-rule-strong px-3 py-4 text-small text-ink-2">
              PDF drawing
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- the user's own upload
            <img
              src={`/api/assets/${b.attrs.sha256}.${b.attrs.ext}`}
              alt="Picture in the question"
              className="h-auto bg-white"
              style={{ width: `${b.attrs.widthPercent ?? 60}%` }}
            />
          )}
        </div>
      );
    case "table":
      return (
        <table
          className="my-2 border-collapse text-small"
          style={{ width: `${b.attrs?.widthPercent ?? 80}%` }}
        >
          <tbody>
            {b.content.map((row, r) => (
              <tr
                key={r}
                className={
                  r === 0 && (b.attrs?.headerRow ?? true)
                    ? "border-y border-ink font-semibold"
                    : "border-b border-rule"
                }
              >
                {row.content.map((cell, c) => {
                  // D105: the column a cell starts in sets its alignment.
                  const col = cellColumn(b, r, c);
                  const align = b.attrs?.columns?.[col]?.align;
                  return (
                    <td
                      key={c}
                      colSpan={cell.attrs?.colspan}
                      rowSpan={cell.attrs?.rowspan}
                      className={`px-1.5 py-1 align-top ${b.attrs?.borders === "GRID" ? "border border-ink" : ""} ${align === "CENTER" ? "text-center" : align === "RIGHT" ? "text-right" : ""}`}
                      style={
                        b.attrs?.columns?.[col]?.width
                          ? { width: `${b.attrs.columns[col].width}%` }
                          : undefined
                      }
                    >
                      {(cell.content ?? []).map((p, k) => (
                        <Inline key={k} nodes={p.content} />
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "choices": {
      const cols = b.attrs?.columns ?? defaultColumns;
      return (
        <ol
          className="my-1 grid gap-x-6"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {b.content.map((ch, i) => (
            <li
              key={i}
              // Long chemical names break inside their column, never into the next (D61).
              className={
                "min-w-0 hyphens-auto [overflow-wrap:anywhere]" +
                (b.attrs?.correct === i ? " font-medium text-positive" : "")
              }
            >
              <span className="font-paper font-semibold">{LETTERS[i]}.</span>{" "}
              <Inline nodes={ch.content} />
              {b.attrs?.correct === i ? <span className="sr-only"> (correct)</span> : null}
            </li>
          ))}
        </ol>
      );
    }
    case "advancedLatex":
      return (
        <pre className="my-1 whitespace-pre-wrap rounded bg-sunk px-2 py-1 font-mono text-small text-ink-2">
          {b.attrs.latex}
        </pre>
      );
    case "codeBlock":
      return <CodeLines lines={b.attrs.lines} />;
    case "orderedList":
    case "bulletList": {
      const Tag = b.type === "orderedList" ? "ol" : "ul";
      return (
        <Tag className={`my-1 pl-6 ${b.type === "orderedList" ? "list-decimal" : "list-disc"}`}>
          {b.content.map((li, i) => (
            <li key={i}>
              {li.content.map((p, k) => (
                <Inline key={k} nodes={p.content} />
              ))}
            </li>
          ))}
        </Tag>
      );
    }
  }
}

/** A code block as it prints: numbered lines in a frame (D99). */
export function CodeLines({ lines }: { lines: readonly string[] }) {
  return (
    <pre
      aria-label="Code"
      className="my-1 overflow-x-auto rounded border border-rule-strong bg-surface py-1 font-mono text-small leading-5 text-ink"
    >
      {lines.map((l, i) => (
        <span key={i} className="flex">
          <span aria-hidden className="w-8 shrink-0 select-none pr-2 text-right text-ink-3">
            {i + 1}
          </span>
          <span className="whitespace-pre pr-2">{l || " "}</span>
        </span>
      ))}
    </pre>
  );
}

/** A sub-part's own marks, CO tag and Bloom level (D65), when it has any. */
function SubPartFacts({ attrs }: { attrs: SubPartAttrs | undefined }) {
  const bits = [
    attrs?.marks != null ? `${attrs.marks} ${attrs.marks === 1 ? "mark" : "marks"}` : null,
    attrs?.coTag ?? null,
    attrs?.bloom ? BLOOM_LABEL[attrs.bloom] : null,
  ].filter(Boolean);
  if (!bits.length) return null;
  return <span className="block font-sans text-caption text-ink-3">{bits.join(" · ")}</span>;
}

function Block({ b, defaultColumns }: { b: BlockNode; defaultColumns: number }) {
  if (b.type !== "subParts") return <Leaf b={b} defaultColumns={defaultColumns} />;
  return (
    <ol className="my-1 list-[lower-alpha] pl-7">
      {b.content.map((sp, i) => (
        <li key={i}>
          {sp.content.map((x, k) => (
            <Leaf key={k} b={x} defaultColumns={defaultColumns} />
          ))}
          <SubPartFacts attrs={sp.attrs} />
        </li>
      ))}
    </ol>
  );
}

export function StaticDoc({ doc, defaultColumns = 2 }: { doc: Doc; defaultColumns?: number }) {
  return (
    <div className="flex flex-col gap-1 px-3 py-2 text-body text-ink">
      {doc.content.map((b, i) => (
        <Block key={i} b={b} defaultColumns={defaultColumns} />
      ))}
    </div>
  );
}
