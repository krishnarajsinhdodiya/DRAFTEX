// The checker applied to a template's fields. Shared by the data layer (save
// rules) and the builder (live feedback); pure, safe in client components.
import type { CourseKind, ExamKind, Program } from "@/generated/prisma/enums";
import { serializePaper } from "@/lib/latex/serialize";
import type { Header, Structure, Style } from "@/lib/paper/schema";
import { type CheckResult, checkTemplate, pciRuleSet } from "@/lib/rules";
import { previewPaper } from "./preview";

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
  header: Header;
  style: Style;
}

/**
 * The checker (SPEC §7) plus one more level-1 error: text the paper cannot
 * print (an emoji in a heading, an unknown {{placeholder}}). Such a template
 * would save, but no paper made from it could compile.
 */
export function checkTemplateFields(t: CheckableTemplate): CheckResult {
  const result = checkRules(t);
  // Structural errors come first; the serializer would only repeat them.
  if (result.errors.length > 0) return result;
  const ser = serializePaper(previewPaper(t));
  if (ser.ok) return result;
  return {
    ...result,
    errors: [
      ...result.errors,
      ...ser.issues.map((i) => ({ code: "UNPRINTABLE_TEXT", message: i.message })),
    ],
  };
}

function checkRules(t: CheckableTemplate): CheckResult {
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
