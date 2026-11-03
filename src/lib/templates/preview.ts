// An empty paper for previewing a template: sample header values and a
// placeholder in every slot. Pure and client-safe.
import type { CourseKind, ExamKind, Program } from "@/generated/prisma/enums";
import type { PaperInput, TemplateInput } from "@/lib/paper/schema";
import { EXAM_TITLE, PROGRAM_LABEL, durationText, marksText } from "./labels";

export interface PreviewSource extends TemplateInput {
  program: Program;
  examKind: ExamKind;
  courseKind: CourseKind;
  durationMinutes: number;
  maxMarks: number;
}

export function previewPaper(t: PreviewSource): PaperInput {
  const practical = t.courseKind === "PRACTICAL";
  return {
    template: { structure: t.structure, header: t.header, style: t.style },
    meta: {
      university: "KADI SARVA VISHWAVIDYALAYA",
      institute: "K B Institute of Pharmaceutical Education & Research",
      examTitle: EXAM_TITLE[t.examKind],
      programLine: `${PROGRAM_LABEL[t.program]} ${t.program === "PHARM_D" ? "Year I" : "Semester I"}`,
      courseTitle: practical ? "Course Title (Practical)" : "Course Title",
      courseCode: practical ? "XX000P" : "XX000T",
      date: "DD/MM/YYYY",
      duration: durationText(t.durationMinutes),
      maxMarks: marksText(t.maxMarks),
    },
    slots: [],
    emptySlots: "PLACEHOLDER",
  };
}
