// Invented data for data-layer tests.
import type { PaperMeta, SlotInput } from "@/lib/data/papers";
import type { TemplateFields } from "@/lib/data/templates";
import { pciEndSem4CreditKsv } from "../../fixtures/papers/templates";

export function templateFields(title: string): TemplateFields {
  return {
    title,
    program: "B_PHARM",
    examKind: "END_SEMESTER",
    courseKind: "THEORY",
    creditTier: 4,
    durationMinutes: 180,
    maxMarks: 75,
    ...pciEndSem4CreditKsv,
  };
}

export function paperMeta(over: Partial<PaperMeta> = {}): PaperMeta {
  return {
    title: "Test paper",
    courseCode: "XX101T",
    courseTitle: "Invented Course",
    program: "B_PHARM",
    semesterOrYear: 1,
    examKind: "END_SEMESTER",
    academicYear: "2026-27",
    ...over,
  };
}

export function testSlot(over: Partial<SlotInput> = {}): SlotInput {
  return {
    partKey: "p1",
    groupKey: "g1",
    position: 1,
    marks: 1,
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Define an invented term." }] },
      ],
    },
    ...over,
  };
}
