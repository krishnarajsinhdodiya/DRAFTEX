// The checker applied to a template's fields. Shared by the data layer (save
// rules) and the builder (live feedback); pure, safe in client components.
import type { CourseKind, ExamKind, Program } from "@/generated/prisma/enums";
import type { Structure } from "@/lib/paper/schema";
import { type CheckResult, checkTemplate, pciRuleSet } from "@/lib/rules";

/** The rule set a template is checked against; only B.Pharm has one (PCI 2026). */
export function ruleSetIdFor(program: Program): string | null {
  const pci = pciRuleSet();
  return program === pci.program ? pci.ruleSetId : null;
}

export interface CheckableTemplate {
  program: Program;
  examKind: ExamKind;
  courseKind: CourseKind;
  creditTier: number | null;
  durationMinutes: number;
  maxMarks: number;
  structure: Structure;
}

export function checkTemplateFields(t: CheckableTemplate): CheckResult {
  const id = ruleSetIdFor(t.program);
  return checkTemplate(
    t.structure,
    {
      program: t.program,
      examKind: t.examKind,
      courseKind: t.courseKind,
      credits: t.creditTier,
      durationMinutes: t.durationMinutes,
      maxMarks: t.maxMarks,
    },
    id ? pciRuleSet() : null,
  );
}
