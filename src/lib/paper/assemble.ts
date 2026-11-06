// A stored paper → the serializer's input. Pure and client-safe.
import type { BloomLevel, ExamKind, Program } from "@/generated/prisma/enums";
import { EXAM_TITLE, PROGRAM_LABEL, durationText, marksText } from "@/lib/templates/labels";
import type { Doc, PaperInput } from "./schema";
import type { PaperSnapshot } from "./snapshot";

/** Printed in every header until institutions become configurable. */
export const UNIVERSITY = "KADI SARVA VISHWAVIDYALAYA";
export const INSTITUTE = "K B Institute of Pharmaceutical Education & Research";

export interface StoredSlot {
  id?: string;
  partKey: string;
  groupKey: string;
  position: number;
  content: Doc;
  marks: number;
  coTag: string | null;
  bloomLevel: BloomLevel | null;
}

export interface StoredPaper {
  snapshot: PaperSnapshot;
  courseCode: string;
  courseTitle: string;
  program: Program;
  semesterOrYear: number;
  examKind: ExamKind;
  examDate: Date | null;
  instructionsOverride: string[] | null;
  slots: StoredSlot[];
}

/** 2026-11-03 → "03/11/2026", the date style on the reference papers. */
export function paperDate(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export function programLine(program: Program, semesterOrYear: number): string {
  const unit = program === "PHARM_D" ? "Year" : "Semester";
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][semesterOrYear - 1];
  return `${PROGRAM_LABEL[program]} ${unit} ${roman ?? semesterOrYear}`;
}

export function paperInput(
  p: StoredPaper,
  emptySlots: PaperInput["emptySlots"] = "PLACEHOLDER",
): PaperInput {
  const s = p.snapshot;
  const header = p.instructionsOverride
    ? { ...s.header, instructions: p.instructionsOverride }
    : s.header;
  return {
    template: { structure: s.structure, style: s.style, header },
    meta: {
      university: UNIVERSITY,
      institute: INSTITUTE,
      examTitle: EXAM_TITLE[p.examKind],
      programLine: programLine(p.program, p.semesterOrYear),
      courseTitle: p.courseTitle,
      courseCode: p.courseCode,
      date: paperDate(p.examDate),
      duration: durationText(s.durationMinutes),
      maxMarks: marksText(s.maxMarks),
    },
    slots: p.slots.map((x) => ({
      groupKey: x.groupKey,
      position: x.position,
      content: x.content,
      marks: x.marks,
      ...(x.coTag ? { coTag: x.coTag } : {}),
      ...(x.bloomLevel ? { bloomLevel: x.bloomLevel } : {}),
    })),
    emptySlots,
  };
}
