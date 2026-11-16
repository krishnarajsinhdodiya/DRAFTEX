// Template checker (SPEC §7). Pure: no I/O, no clock, no database.
// Errors mean the paper itself would be wrong and block saving. Warnings mean
// the paper is valid but differs from the PCI 2026 pattern ("Non-PCI").
import type { CourseKind, ExamKind, Program } from "@/generated/prisma/enums";
import type { Group, Structure } from "@/lib/paper/schema";
import type { ComponentType, ExamStage, Page, RuleSet, TheoryGroupRule } from "./rule-set";

export type CheckMeta = {
  program: Program;
  examKind: ExamKind;
  courseKind: CourseKind;
  /** Credit tier the template targets; null when not chosen. */
  credits: number | null;
  durationMinutes: number;
  maxMarks: number;
  /** Lab hours per week of the course, when known (practical duration rule). */
  labHoursPerWeek?: number | null;
};

export type Issue = {
  code: string;
  /** Plain English, shown to the teacher. */
  message: string;
  /** Where in the structure, e.g. "parts.0.groups.2". */
  path?: string;
  /** Page of the PCI 2026 syllabus that states the rule. */
  page?: Page;
};

export type PciStatus = "COMPLIANT" | "NON_PCI" | "NO_RULE_SET";

export type CheckResult = {
  errors: Issue[];
  warnings: Issue[];
  pci: PciStatus;
  /** Neutral explanation when no rule set applies. */
  notice?: string;
};

type Located = { group: Group; path: string };

const EPS = 1e-9;
const same = (a: number, b: number) => Math.abs(a - b) < EPS;
const fmt = (n: number) => String(Math.round(n * 100) / 100);

const GROUP_LABEL: Record<Group["type"], string> = {
  OBJECTIVE: "Objective (MCQ)",
  SHORT: "Short answers",
  LONG: "Long answers",
  SHORT_NOTE: "Short notes",
  PRACTICAL_PERFORM: "Perform the practical",
  SYNOPSIS: "Synopsis",
  VIVA: "Viva voce",
  FREE: "Free-form",
};

const COMPONENT_GROUP: Record<ComponentType, Group["type"]> = {
  SYNOPSIS: "SYNOPSIS",
  MAJOR_EXPERIMENT: "PRACTICAL_PERFORM",
  MINOR_EXPERIMENT: "PRACTICAL_PERFORM",
  VIVA: "VIVA",
};

function minutesText(m: number): string {
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} minutes`;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  return rest === 0 ? hours : `${hours} ${rest} minutes`;
}

function shapeText(c: { slots: number; attempt: number; marksEach: number }): string {
  const marks = `${fmt(c.marksEach)} mark${same(c.marksEach, 1) ? "" : "s"} each`;
  return c.attempt === c.slots
    ? `${c.slots} compulsory, ${marks}`
    : `any ${c.attempt} of ${c.slots}, ${marks}`;
}

const groupTotal = (g: Group) => g.attempt * g.marksEach;

// ---------- level 1: errors ----------

function structuralErrors(
  structure: Structure,
  meta: CheckMeta,
): { errors: Issue[]; groups: Located[] } {
  const errors: Issue[] = [];
  const groups: Located[] = [];
  const partKeys = new Set<string>();
  const groupKeys = new Set<string>();

  structure.parts.forEach((part, p) => {
    if (partKeys.has(part.key)) {
      errors.push({
        code: "DUPLICATE_PART_KEY",
        message: `Two parts share the key "${part.key}".`,
        path: `parts.${p}`,
      });
    }
    partKeys.add(part.key);

    part.groups.forEach((group, g) => {
      const path = `parts.${p}.groups.${g}`;
      groups.push({ group, path });
      const name = group.heading.trim()
        ? `"${group.heading.trim()}"`
        : `Question group ${groups.length}`;

      if (groupKeys.has(group.key)) {
        errors.push({
          code: "DUPLICATE_GROUP_KEY",
          message: `Two question groups share the key "${group.key}".`,
          path,
        });
      }
      groupKeys.add(group.key);

      if (!group.heading.trim()) {
        errors.push({ code: "EMPTY_HEADING", message: `${name} has no heading.`, path });
      }
      if (!(group.attempt >= 1)) {
        errors.push({
          code: "ATTEMPT_TOO_LOW",
          message: `${name}: students must attempt at least one question.`,
          path,
        });
      } else if (group.attempt > group.slots) {
        errors.push({
          code: "ATTEMPT_OVER_SLOTS",
          message: `${name} asks students to attempt ${group.attempt} questions but has only ${group.slots}.`,
          path,
        });
      } else if (group.compulsory && group.attempt !== group.slots) {
        errors.push({
          code: "COMPULSORY_WITH_CHOICE",
          message: `${name} is compulsory, so every one of its ${group.slots} questions must be attempted.`,
          path,
        });
      }
      if (!(group.marksEach > 0)) {
        errors.push({
          code: "MARKS_NOT_POSITIVE",
          message: `${name}: marks per question must be more than 0.`,
          path,
        });
      }
    });
  });

  const total = groups.reduce((s, { group }) => s + groupTotal(group), 0);
  if (!same(total, meta.maxMarks)) {
    errors.push({
      code: "TOTAL_MISMATCH",
      message: `The questions add up to ${fmt(total)} marks, but the paper is out of ${fmt(meta.maxMarks)}.`,
    });
  }
  return { errors, groups };
}

// ---------- level 2: PCI warnings ----------

type Route =
  | { kind: "theory"; stage: ExamStage }
  | { kind: "practical"; stage: ExamStage }
  | { kind: "none"; notice: string };

const NO_RULE_SET = "No PCI 2026 rule set loaded";

function route(meta: CheckMeta, ruleSet: RuleSet | null): Route {
  if (!ruleSet || meta.program !== ruleSet.program)
    return { kind: "none", notice: `${NO_RULE_SET}.` };
  if (meta.courseKind === "PROJECT" || meta.courseKind === "INTERNSHIP") {
    return {
      kind: "none",
      notice: `${NO_RULE_SET}: PCI does not set a question paper for this course.`,
    };
  }
  switch (meta.examKind) {
    case "PRACTICAL_SESSIONAL_1":
    case "PRACTICAL_SESSIONAL_2":
      return { kind: "practical", stage: "SESSIONAL" };
    case "PRACTICAL_END":
      return { kind: "practical", stage: "END_SEMESTER" };
    case "SESSIONAL_1":
    case "SESSIONAL_2":
    case "SESSIONAL_IMPROVEMENT":
      return { kind: meta.courseKind === "PRACTICAL" ? "practical" : "theory", stage: "SESSIONAL" };
    case "END_SEMESTER":
    case "SUPPLEMENTARY_ATKT":
      return {
        kind: meta.courseKind === "PRACTICAL" ? "practical" : "theory",
        stage: "END_SEMESTER",
      };
    default:
      return {
        kind: "none",
        notice: `${NO_RULE_SET}: PCI 2026 has no pattern for this kind of exam.`,
      };
  }
}

function theoryWarnings(
  groups: Located[],
  meta: CheckMeta,
  ruleSet: RuleSet,
  stage: ExamStage,
): Issue[] {
  const page = stage === "SESSIONAL" ? ruleSet.pages.sessionalTheory : ruleSet.pages.endSemTheory;
  const exam = stage === "SESSIONAL" ? "sessional" : "end-semester";
  const pattern = meta.credits === null ? undefined : ruleSet.theory[stage].get(meta.credits);
  if (!pattern) {
    return [
      {
        code: "NO_CREDIT_PATTERN",
        message:
          meta.credits === null
            ? "Choose the course credits to compare this template with the PCI pattern."
            : `PCI 2026 has no ${exam} pattern for ${fmt(meta.credits)}-credit theory courses.`,
        page,
      },
    ];
  }

  const warnings: Issue[] = [];
  const credits = `${fmt(meta.credits as number)}-credit`;
  if (!same(meta.maxMarks, pattern.maxMarks)) {
    warnings.push({
      code: "PCI_MAX_MARKS",
      message: `PCI sets ${fmt(pattern.maxMarks)} marks for a ${credits} ${exam} paper; this one is out of ${fmt(meta.maxMarks)}.`,
      page,
    });
  }
  if (meta.durationMinutes !== pattern.durationMinutes) {
    warnings.push({
      code: "PCI_DURATION",
      message: `PCI sets ${minutesText(pattern.durationMinutes)} for a ${credits} ${exam} paper; this one is ${minutesText(meta.durationMinutes)}.`,
      page,
    });
  }

  const ruleTypes = new Set(pattern.groups.map((r) => r.type));
  for (const rule of pattern.groups) warnings.push(...theoryGroupWarnings(rule, groups, page));
  for (const { group, path } of groups) {
    if (!ruleTypes.has(group.type as TheoryGroupRule["type"])) {
      warnings.push({
        code: "PCI_EXTRA_GROUP",
        message: `"${GROUP_LABEL[group.type]}" questions are not part of the PCI pattern.`,
        path,
        page,
      });
    }
  }
  return warnings;
}

function theoryGroupWarnings(rule: TheoryGroupRule, groups: Located[], page: Page): Issue[] {
  const label = GROUP_LABEL[rule.type];
  const expected = rule.variants.map(shapeText).join(" or ");
  const matches = groups.filter(({ group }) => group.type === rule.type);
  if (matches.length === 0) {
    return [
      {
        code: "PCI_MISSING_GROUP",
        message: `PCI expects a "${label}" group (${expected}); this template has none.`,
        page,
      },
    ];
  }
  if (matches.length > 1) {
    return [
      {
        code: "PCI_GROUP_COUNT",
        message: `PCI expects one "${label}" group; this template has ${matches.length}.`,
        path: matches[1]?.path,
        page,
      },
    ];
  }
  const { group, path } = matches[0] as Located;
  const fits = rule.variants.some(
    (v) =>
      v.slots === group.slots && v.attempt === group.attempt && same(v.marksEach, group.marksEach),
  );
  return fits
    ? []
    : [
        {
          code: "PCI_GROUP_SHAPE",
          message: `PCI expects "${label}" as ${expected}; this template has ${shapeText(group)}.`,
          path,
          page,
        },
      ];
}

function practicalWarnings(
  groups: Located[],
  meta: CheckMeta,
  ruleSet: RuleSet,
  stage: ExamStage,
): Issue[] {
  const rules = ruleSet.practical;
  const pattern = rules[stage];
  const page =
    stage === "SESSIONAL" ? ruleSet.pages.sessionalPractical : ruleSet.pages.endSemPractical;
  const exam = stage === "SESSIONAL" ? "practical sessional" : "practical end-semester";
  const warnings: Issue[] = [];

  if (meta.credits === null || !rules.allowedCredits.includes(meta.credits)) {
    warnings.push({
      code: "NO_CREDIT_PATTERN",
      message:
        meta.credits === null
          ? "Choose the course credits to compare this template with the PCI pattern."
          : `PCI 2026 practical courses carry ${rules.allowedCredits.join(" or ")} credits, not ${fmt(meta.credits)}.`,
      page,
    });
  }
  if (!same(meta.maxMarks, pattern.maxMarks)) {
    warnings.push({
      code: "PCI_MAX_MARKS",
      message: `PCI sets ${fmt(pattern.maxMarks)} marks for a ${exam} paper; this one is out of ${fmt(meta.maxMarks)}.`,
      page,
    });
  }

  const d = rules.durationRule;
  const lab = meta.labHoursPerWeek;
  const allowed =
    lab === null || lab === undefined
      ? [d.minutesOtherwise, d.minutesIfAtLeast]
      : [lab >= d.labHoursPerWeekAtLeast ? d.minutesIfAtLeast : d.minutesOtherwise];
  if (!allowed.includes(meta.durationMinutes)) {
    warnings.push({
      code: "PCI_DURATION",
      message: `PCI sets ${allowed.map(minutesText).join(" or ")} for this ${exam} paper; this one is ${minutesText(meta.durationMinutes)}.`,
      page,
    });
  }

  const wantedTypes = new Set<Group["type"]>();
  for (const type of ["SYNOPSIS", "PRACTICAL_PERFORM", "VIVA"] as const) {
    wantedTypes.add(type);
    const expected = pattern.components
      .filter((c) => COMPONENT_GROUP[c.type] === type)
      .map((c) => c.marks)
      .sort((a, b) => b - a);
    const found = groups.filter(({ group }) => group.type === type);
    const actual = found.map(({ group }) => groupTotal(group)).sort((a, b) => b - a);
    const ok =
      expected.length === actual.length && expected.every((m, i) => same(m, actual[i] as number));
    if (!ok) {
      const label = GROUP_LABEL[type];
      const want = expected.map((m) => `${fmt(m)} marks`).join(" and ");
      const have = actual.length ? actual.map((m) => `${fmt(m)} marks`).join(" and ") : "none";
      warnings.push({
        code: "PCI_COMPONENT",
        message:
          expected.length > 1
            ? `PCI expects ${expected.length} "${label}" items (${want}); this template has ${have}.`
            : `PCI expects "${label}" for ${want}; this template has ${have}.`,
        path: found[0]?.path,
        page,
      });
    }
  }
  for (const { group, path } of groups) {
    if (!wantedTypes.has(group.type)) {
      warnings.push({
        code: "PCI_EXTRA_GROUP",
        message: `"${GROUP_LABEL[group.type]}" questions are not part of the PCI practical pattern.`,
        path,
        page,
      });
    }
  }
  return warnings;
}

/**
 * checkTemplate(structure, meta, ruleSet) → { errors, warnings } (SPEC §7).
 * `ruleSet` is the set named by the template's ruleSetId, or null.
 */
export function checkTemplate(
  structure: Structure,
  meta: CheckMeta,
  ruleSet: RuleSet | null,
): CheckResult {
  const { errors, groups } = structuralErrors(structure, meta);
  const r = route(meta, ruleSet);
  if (r.kind === "none") return { errors, warnings: [], pci: "NO_RULE_SET", notice: r.notice };
  const rules = ruleSet as RuleSet;
  const warnings =
    r.kind === "theory"
      ? theoryWarnings(groups, meta, rules, r.stage)
      : practicalWarnings(groups, meta, rules, r.stage);
  return { errors, warnings, pci: warnings.length ? "NON_PCI" : "COMPLIANT" };
}
