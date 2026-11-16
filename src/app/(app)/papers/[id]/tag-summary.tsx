"use client";
// Bloom and CO summary of the paper (Phase 10, D69): count and marks per
// Bloom level and per CO tag, folded away until opened.
import Link from "next/link";
import { useMemo } from "react";
import { linkStyles } from "@/components/styles";
import { type CoverageRow, coverage, coverageNotes } from "@/lib/blueprint/coverage";
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

export interface PanelBlueprint {
  id: string;
  unit: "MARKS" | "PERCENT";
  tolerance: number;
  targets: { co: string; target: number }[];
  mine: boolean;
  ownerName: string;
}

const STATUS: Record<CoverageRow["status"], string> = {
  OK: "Within range",
  UNDER: "Under",
  OVER: "Over",
  NOT_PLANNED: "Not in blueprint",
  UNTAGGED: "No CO",
};

/** D110: the paper against its CO blueprint, as it is on screen. Advises only. */
function BlueprintCheck({
  slots,
  groups,
  blueprint,
  scopeLabel,
}: {
  slots: Map<string, SlotState>;
  groups: { key: string; slots: number; attempt: number }[];
  blueprint: PanelBlueprint | null;
  scopeLabel: string;
}) {
  const result = useMemo(() => {
    if (!blueprint) return null;
    const questions = [...slots.entries()]
      .filter(([, s]) => !isEmptyDoc(s.doc))
      .map(([key, s]) => ({
        groupKey: key.slice(0, key.lastIndexOf(".")),
        content: s.doc,
        marks: s.marks,
        coTag: s.coTag,
        bloomLevel: s.bloomLevel,
      }));
    return coverage(questions, groups, blueprint);
  }, [slots, groups, blueprint]);
  if (!blueprint || !result) {
    return (
      <p className="text-caption text-ink-2">
        No CO blueprint for {scopeLabel}.{" "}
        <Link href="/blueprints/new" className={linkStyles}>
          Make one
        </Link>{" "}
        to see over and under per CO.
      </p>
    );
  }
  const unit = blueprint.unit === "PERCENT" ? "%" : "";
  const fmt = (n: number) => `${marksText(Number(n.toFixed(2)))}${unit}`;
  const notes = coverageNotes(result, blueprint.unit);
  return (
    <section aria-label="CO blueprint check" className="flex flex-col gap-2">
      <p className="text-small text-ink">
        <span className="font-medium">CO blueprint</span>{" "}
        <span className="text-ink-2">
          ({blueprint.mine ? "yours" : `from ${blueprint.ownerName}`}, ±{blueprint.tolerance}
          {unit || " marks"}) ·{" "}
          <Link href={`/blueprints/${blueprint.id}`} className={linkStyles}>
            Open
          </Link>
        </span>
      </p>
      <table className="w-full text-small">
        <caption className="sr-only">Paper against the CO blueprint</caption>
        <thead>
          <tr className="border-b border-rule text-left text-caption text-ink-2">
            <th scope="col" className="py-1 pr-2 font-medium">
              CO
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">
              Target
            </th>
            <th scope="col" className="py-1 pr-2 text-right font-medium">
              Paper
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.key || "none"} className="border-b border-rule/60 last:border-0">
              <th
                scope="row"
                className={`py-1 pr-2 text-left font-normal break-all ${r.key ? "" : "text-ink-3 italic"}`}
              >
                {r.key || "No CO"}
              </th>
              <td className="py-1 pr-2 text-right tabular-nums">
                {r.target === null ? "–" : fmt(r.target)}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmt(r.actual)}</td>
              <td
                className={`py-1 text-right ${r.status === "OK" ? "text-ink-2" : "font-medium text-caution"}`}
              >
                {STATUS[r.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p aria-live="polite" className="text-caption text-ink-2">
        {notes.length
          ? `${notes.length} CO${notes.length === 1 ? " needs" : "s need"} a look. Export still works.`
          : "Every CO is within range."}{" "}
        Optional groups count their marks times attempt/slots; a question with two COs gives each
        half.
      </p>
    </section>
  );
}

export function TagSummaryPanel({
  slots,
  groups,
  blueprint,
  scopeLabel,
}: {
  slots: Map<string, SlotState>;
  groups: { key: string; slots: number; attempt: number }[];
  blueprint: PanelBlueprint | null;
  scopeLabel: string;
}) {
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
        <BlueprintCheck
          slots={slots}
          groups={groups}
          blueprint={blueprint}
          scopeLabel={scopeLabel}
        />
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
