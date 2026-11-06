// Plain-English names for enum values (SPEC §12 copy rules). Client-safe.
import type { CourseKind, ExamKind, PaperStatus, Program } from "@/generated/prisma/enums";
import type { Group, Header, Structure, Style } from "@/lib/paper/schema";

export const PROGRAM_LABEL: Record<Program, string> = {
  B_PHARM: "B.Pharm",
  M_PHARM: "M.Pharm",
  PHARM_D: "Pharm.D",
};

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  SESSIONAL_1: "Sessional 1",
  SESSIONAL_2: "Sessional 2",
  SESSIONAL_IMPROVEMENT: "Sessional improvement",
  END_SEMESTER: "End-semester",
  YEAR_END: "Year-end",
  SUPPLEMENTARY_ATKT: "Supplementary (ATKT)",
  PRACTICAL_SESSIONAL: "Practical sessional",
  PRACTICAL_END: "Practical end-semester",
  SYNOPSIS: "Synopsis",
  CUSTOM: "Other",
};

/** Filter groups on the Papers list (D59): one table, every ExamKind in exactly one group. */
export const EXAM_GROUPS = {
  SESSIONAL: { label: "Sessional", kinds: ["SESSIONAL_1", "SESSIONAL_2", "SESSIONAL_IMPROVEMENT"] },
  END_SEMESTER: { label: "End-semester", kinds: ["END_SEMESTER", "YEAR_END"] },
  ATKT: { label: "ATKT", kinds: ["SUPPLEMENTARY_ATKT"] },
  PRACTICAL: { label: "Practical", kinds: ["PRACTICAL_SESSIONAL", "PRACTICAL_END"] },
  OTHER: { label: "Other", kinds: ["SYNOPSIS", "CUSTOM"] },
} as const satisfies Record<string, { label: string; kinds: readonly ExamKind[] }>;
export type ExamGroup = keyof typeof EXAM_GROUPS;
export const EXAM_GROUP_KEYS = Object.keys(EXAM_GROUPS) as ExamGroup[];

export const PAPER_STATUS_LABEL: Record<PaperStatus, string> = {
  DRAFT: "Draft",
  FINAL: "Final",
  PRINTED: "Printed",
};

/** What the paper header calls the exam, for previews. */
export const EXAM_TITLE: Record<ExamKind, string> = {
  SESSIONAL_1: "Sessional Examination I",
  SESSIONAL_2: "Sessional Examination II",
  SESSIONAL_IMPROVEMENT: "Sessional Improvement Examination",
  END_SEMESTER: "Semester End Examination",
  YEAR_END: "Year End Examination",
  SUPPLEMENTARY_ATKT: "Supplementary Examination",
  PRACTICAL_SESSIONAL: "Practical Sessional Examination",
  PRACTICAL_END: "Semester End Practical Examination",
  SYNOPSIS: "Semester End Practical Exam",
  CUSTOM: "Examination",
};

export const COURSE_KIND_LABEL: Record<CourseKind, string> = {
  THEORY: "Theory",
  PRACTICAL: "Practical",
  PROJECT: "Project",
  INTERNSHIP: "Internship",
};

export const GROUP_TYPE_LABEL: Record<Group["type"], string> = {
  OBJECTIVE: "Objective (MCQ)",
  SHORT: "Short answers",
  LONG: "Long answers",
  SHORT_NOTE: "Short notes",
  PRACTICAL_PERFORM: "Perform the practical",
  SYNOPSIS: "Synopsis",
  VIVA: "Viva voce",
  FREE: "Free-form",
};

export const MARKS_STYLE_LABEL: Record<Structure["marksStyle"], string> = {
  MARKS_COLON: "Marks: 10",
  PARENS: "(10)",
  BRACKETS: "[10]",
};

export const CANDIDATE_LABEL: Record<Header["candidateField"], string> = {
  EXAM_NO: "Exam No",
  ROLL_NO: "Roll No",
  SEAT_NO: "Seat No",
  NONE: "None",
};

export const NUMBERING_LABEL: Record<NonNullable<Group["numbering"]>, string> = {
  GROUP: "One number for the group (Q.2, then 1, 2, 3)",
  QUESTION: "A number for each question (Q.6, Q.7 …)",
};

export const OBJECTIVE_LAYOUT_LABEL: Record<NonNullable<Group["objectiveLayout"]>, string> = {
  TWO_COLUMN: "Two columns",
  ONE_COLUMN: "One column",
  FOUR_COLUMN: "Four columns",
};

export const CO_TAG_LABEL: Record<Group["showCoTag"], string> = {
  SLOT: "On each question",
  GROUP: "On the group",
  NONE: "Hidden",
};

export const CO_TAG_STYLE_LABEL: Record<Style["coTagStyle"], string> = {
  FOOTNOTE: "Small",
  BOLD: "Bold",
};

export function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minutes`;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  return m === 0 ? hours : `${hours} ${m} minutes`;
}

export function marksText(n: number): string {
  return String(Math.round(n * 100) / 100);
}
