// How a paper covers a blueprint (Phase 15, D109-D111). Pure and client-safe:
// the editor's summary panel and the export dialog call it with the paper as
// it is on screen.
//
// Rules:
// - A question counts as itself, or as its sub-parts when they split it (D69,
//   `questionItems`).
// - A piece with two COs gives each half its marks (D121).
// - Optional groups ("any 5 of 7") count each question's marks times
//   attempt/slots (owner answer 2026-11-16), so the total is the marks a
//   student answers.
// - Marks with no CO go to the "" row ("No CO").
// - The dimension is CO now; BLOOM uses the same code (D111).
import { splitCoTags } from "../paper/co-tag.ts";
import { questionItems, type TaggedQuestion } from "../paper/tags.ts";
import type { BlueprintTarget, BlueprintUnit } from "./schema.ts";

export type CoverageDimension = "CO" | "BLOOM";

export interface CoverageQuestion extends TaggedQuestion {
  groupKey: string;
}

export interface CoverageGroup {
  key: string;
  slots: number;
  attempt: number;
}

export interface CoverageBlueprint {
  unit: BlueprintUnit;
  tolerance: number;
  targets: BlueprintTarget[];
}

export type CoverageStatus = "OK" | "UNDER" | "OVER" | "NOT_PLANNED" | "UNTAGGED";

export interface CoverageRow {
  /** CO tag (or Bloom level); "" for marks without one. */
  key: string;
  /** Target in the blueprint's unit; null when the blueprint has no row for it. */
  target: number | null;
  /** Marks the paper gives it (optional groups scaled). */
  marks: number;
  /** The paper's value in the blueprint's unit: marks, or percent of the total. */
  actual: number;
  /** actual - target (0 for rows without a target). */
  difference: number;
  status: CoverageStatus;
}

export interface Coverage {
  rows: CoverageRow[];
  /** Marks counted (optional groups scaled): the base for percentages. */
  total: number;
  /** Rows that need attention: UNDER, OVER, NOT_PLANNED, UNTAGGED. */
  problems: number;
}

/** Rounding noise in sums of halves and sevenths must not flip a status. */
const EPS = 1e-6;
const round = (n: number) => Math.round(n * 100) / 100;

/** Marks per key (CO tag or Bloom level), with optional groups scaled. */
export function marksBy(
  questions: CoverageQuestion[],
  groups: CoverageGroup[],
  dimension: CoverageDimension = "CO",
): { byKey: Map<string, number>; total: number } {
  const scale = new Map(
    groups.map((g) => [g.key, g.slots > 0 && g.attempt < g.slots ? g.attempt / g.slots : 1]),
  );
  const byKey = new Map<string, number>();
  let total = 0;
  const add = (k: string, m: number) => byKey.set(k, (byKey.get(k) ?? 0) + m);
  for (const q of questions) {
    const f = scale.get(q.groupKey) ?? 1;
    for (const it of questionItems(q)) {
      const marks = it.marks * f;
      total += marks;
      if (dimension === "BLOOM") {
        add(it.bloom ?? "", marks);
        continue;
      }
      const tags = splitCoTags(it.co);
      if (!tags.length) add("", marks);
      for (const t of tags) add(t, marks / tags.length);
    }
  }
  return { byKey, total };
}

export function coverage(
  questions: CoverageQuestion[],
  groups: CoverageGroup[],
  blueprint: CoverageBlueprint,
  dimension: CoverageDimension = "CO",
): Coverage {
  const { byKey, total } = marksBy(questions, groups, dimension);
  const inUnit = (marks: number) =>
    blueprint.unit === "PERCENT" ? (total > 0 ? (marks / total) * 100 : 0) : marks;
  const rows: CoverageRow[] = blueprint.targets.map((t) => {
    const marks = byKey.get(t.co) ?? 0;
    const actual = inUnit(marks);
    const difference = actual - t.target;
    const status: CoverageStatus =
      Math.abs(difference) <= blueprint.tolerance + EPS ? "OK" : difference < 0 ? "UNDER" : "OVER";
    return {
      key: t.co,
      target: t.target,
      marks: round(marks),
      actual: round(actual),
      difference: round(difference),
      status,
    };
  });
  const planned = new Set(blueprint.targets.map((t) => t.co));
  const extra = [...byKey.keys()]
    .filter((k) => k && !planned.has(k))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  for (const k of extra) {
    const marks = byKey.get(k) ?? 0;
    rows.push({
      key: k,
      target: null,
      marks: round(marks),
      actual: round(inUnit(marks)),
      difference: 0,
      status: "NOT_PLANNED",
    });
  }
  const untagged = byKey.get("") ?? 0;
  if (untagged > EPS) {
    rows.push({
      key: "",
      target: null,
      marks: round(untagged),
      actual: round(inUnit(untagged)),
      difference: 0,
      status: "UNTAGGED",
    });
  }
  return { rows, total: round(total), problems: rows.filter((r) => r.status !== "OK").length };
}

const num = (n: number) => String(Number(n.toFixed(2)));

/**
 * One plain sentence per row that needs attention, for the export dialog and
 * the summary panel (D110). Never an error: a blueprint only advises.
 */
export function coverageNotes(c: Coverage, unit: BlueprintUnit): string[] {
  const u = (n: number) => (unit === "PERCENT" ? `${num(n)}%` : `${num(n)} marks`);
  return c.rows.flatMap((r) => {
    switch (r.status) {
      case "UNDER":
        return [
          `${r.key} has ${u(r.actual)}; the blueprint asks for ${u(r.target ?? 0)} (${u(-r.difference)} short).`,
        ];
      case "OVER":
        return [
          `${r.key} has ${u(r.actual)}; the blueprint asks for ${u(r.target ?? 0)} (${u(r.difference)} over).`,
        ];
      case "NOT_PLANNED":
        return [`${r.key} (${u(r.actual)}) is not in the blueprint.`];
      case "UNTAGGED":
        return [`${u(r.actual)} have no CO.`];
      default:
        return [];
    }
  });
}

/** The coverage inputs from a paper's template structure and its saved questions. */
export function paperCoverageInput(
  structure: { parts: { groups: { key: string; slots: number; attempt: number }[] }[] },
  slots: CoverageQuestion[],
): { questions: CoverageQuestion[]; groups: CoverageGroup[] } {
  return {
    questions: slots,
    groups: structure.parts.flatMap((p) =>
      p.groups.map((g) => ({ key: g.key, slots: g.slots, attempt: g.attempt })),
    ),
  };
}
