"use client";
// Bloom and CO summary of the paper (Phase 10, D69): count and marks per
// Bloom level and per CO tag, folded away until opened.
import { useMemo } from "react";
import { isEmptyDoc } from "@/lib/editor/convert";
import { type SummaryRow, tagSummary } from "@/lib/paper/tags";
import { marksText } from "@/lib/templates/labels";
import type { SlotState } from "./use-paper";

function Table({ caption, head, rows }: { caption: string; head: string; rows: SummaryRow[] }) {
  return (
    <table className="w-full text-small">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-rule text-left text-caption text-ink-2">
          <th scope="col" className="py-1 pr-2 font-medium">
            {head}
          </th>
          <th scope="col" className="py-1 pr-2 text-right font-medium">
            Questions
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            Marks
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((r) => (
            <tr key={r.key || "none"} className="border-b border-rule/60 last:border-0">
              <th
                scope="row"
                className={`py-1 pr-2 text-left font-normal break-all ${r.key ? "" : "text-ink-3 italic"}`}
              >
                {r.label}
              </th>
              <td className="py-1 pr-2 text-right tabular-nums">{r.count}</td>
              <td className="py-1 text-right font-paper tabular-nums">{marksText(r.marks)}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={3} className="py-1 text-ink-3">
              No questions written yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function TagSummaryPanel({ slots }: { slots: Map<string, SlotState> }) {
  const summary = useMemo(
    () =>
      tagSummary(
        [...slots.values()]
          .filter((s) => !isEmptyDoc(s.doc))
          .map((s) => ({
            content: s.doc,
            marks: s.marks,
            coTag: s.coTag,
            bloomLevel: s.bloomLevel,
          })),
      ),
    [slots],
  );
  return (
    <details className="group/sum rounded-md border border-rule px-3 py-2">
      <summary className="cursor-pointer text-small font-medium text-ink select-none">
        Bloom and CO summary
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <Table
            caption="Questions and marks per Bloom level"
            head="Bloom level"
            rows={summary.bloom}
          />
          <Table caption="Questions and marks per CO" head="CO" rows={summary.co} />
        </div>
        <p className="text-caption text-ink-2">
          Counts every written question, optional ones included, so marks can add up to more than
          the paper&apos;s total. Sub-parts with their own level or CO count on their own when their
          marks add up to the question&apos;s.
        </p>
      </div>
    </details>
  );
}
