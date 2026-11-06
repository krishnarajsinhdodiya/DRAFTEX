"use client";
// A question as it reads, without an editor: used for every question that is
// not being edited, so a paper with 40 questions opens at once.
import type { ReactNode } from "react";
import type { BlockNode, Doc, InlineNode, LeafBlockNode } from "@/lib/paper/schema";
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
                {row.content.map((cell, c) => (
                  <td key={c} className="px-1.5 py-1 align-top">
                    {(cell.content ?? []).map((p, k) => (
                      <Inline key={k} nodes={p.content} />
                    ))}
                  </td>
                ))}
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

function Block({ b, defaultColumns }: { b: BlockNode; defaultColumns: number }) {
  if (b.type !== "subParts") return <Leaf b={b} defaultColumns={defaultColumns} />;
  return (
    <ol className="my-1 list-[lower-alpha] pl-7">
      {b.content.map((sp, i) => (
        <li key={i}>
          {sp.content.map((x, k) => (
            <Leaf key={k} b={x} defaultColumns={defaultColumns} />
          ))}
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
