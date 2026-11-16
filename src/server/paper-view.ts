// Plain, serialisable view of a paper for the editor screen.
import type { BloomLevel, ExamKind, PaperStatus, Program } from "@/generated/prisma/enums";
import type { Actor, DataLayer } from "@/lib/data";
import { type CodeLimits, paperCodeLimits } from "@/lib/latex/code";
import { questionNumbers } from "@/lib/paper/numbering";
import { type KeyCriterion, keyCriteriaSchema } from "@/lib/paper/key";
import { type Doc, type Group, docSchema } from "@/lib/paper/schema";
import type { Issue, PciStatus } from "@/lib/rules";
import { checkTemplateFields } from "@/lib/templates/check";
import { durationText, marksText } from "@/lib/templates/labels";
import { coOptions } from "./paper-commands";

export interface EditorGroup {
  key: string;
  partKey: string;
  type: Group["type"];
  heading: string;
  slots: number;
  attempt: number;
  marksEach: number;
  compulsory: boolean;
  numbering: "GROUP" | "QUESTION";
  showCoTag: Group["showCoTag"];
  objectiveColumns: 1 | 2 | 4;
  /** "Q.2" for a group-numbered group. */
  label?: string;
  /** Per position: "Q.2(3)" or "Q.6". */
  slotLabels: string[];
  /** Per position, as printed in the list: "3." or "Q.6". */
  printed: string[];
}

export interface EditorSlot {
  groupKey: string;
  position: number;
  content: Doc;
  marks: number;
  coTag: string | null;
  bloomLevel: BloomLevel | null;
  answerKey: Doc | null;
  keyCriteria: KeyCriterion[];
}

export interface PaperEditorView {
  id: string;
  version: number;
  title: string;
  courseId: string | null;
  courseCode: string;
  courseTitle: string;
  program: Program;
  semesterOrYear: number;
  examKind: ExamKind;
  academicYear: string;
  examDate: string | null;
  status: PaperStatus;
  /** ISO time of the last export (D55). */
  printedAt: string | null;
  /** Kept versions, newest first (D57). */
  versions: { id: string; reason: "FINAL" | "EXPORT"; createdAt: string }[];
  templateTitle: string;
  maxMarks: number;
  maxMarksText: string;
  duration: string;
  marksStyle: "MARKS_COLON" | "PARENS" | "BRACKETS";
  /** D64: this paper prints Bloom levels (its own switch, from the template at creation). */
  showBloom: boolean;
  /** D100: the longest code line this paper's page allows. */
  codeLimits: CodeLimits;
  parts: { key: string; title?: string }[];
  groups: EditorGroup[];
  slots: EditorSlot[];
  coOptions: { value: string; label: string }[];
  pci: { status: PciStatus; warnings: Issue[]; notice?: string };
  courses: { id: string; code: string; title: string; semesterOrYear: number }[];
  /** The CO blueprint for this course and exam (D108, D134), or null. */
  blueprint: {
    id: string;
    unit: "MARKS" | "PERCENT";
    tolerance: number;
    targets: { co: string; target: number }[];
    mine: boolean;
    ownerName: string;
  } | null;
}

export async function paperEditorView(
  data: DataLayer,
  actor: Actor,
  id: string,
): Promise<PaperEditorView> {
  const p = await data.papers.getWithSlots(actor, id);
  const s = p.snapshot;
  const course = p.courseId ? await data.courses.get(actor, p.courseId).catch(() => null) : null;
  const check = checkTemplateFields(s, { labHoursPerWeek: course?.practicalHrs ?? null });
  const numbers = new Map(questionNumbers(s.structure).map((n) => [n.key, n]));
  const courses = await data.courses.list(actor, { program: p.program, courseKind: s.courseKind });
  const bp = await data.blueprints.match(actor, p.courseCode, p.examKind);
  return {
    id: p.id,
    version: p.version,
    title: p.title,
    courseId: p.courseId,
    courseCode: p.courseCode,
    courseTitle: p.courseTitle,
    program: p.program,
    semesterOrYear: p.semesterOrYear,
    examKind: p.examKind,
    academicYear: p.academicYear,
    examDate: p.examDate ? p.examDate.toISOString().slice(0, 10) : null,
    status: p.status,
    printedAt: p.printedAt ? p.printedAt.toISOString() : null,
    versions: (await data.papers.listVersions(actor, id)).map((v) => ({
      id: v.id,
      reason: v.reason,
      createdAt: v.createdAt.toISOString(),
    })),
    templateTitle: s.title,
    maxMarks: s.maxMarks,
    maxMarksText: marksText(s.maxMarks),
    duration: durationText(s.durationMinutes),
    marksStyle: s.structure.marksStyle,
    showBloom: s.style.showBloom,
    codeLimits: paperCodeLimits(s.style),
    parts: s.structure.parts.map((x) => ({ key: x.key, ...(x.title ? { title: x.title } : {}) })),
    groups: s.structure.parts.flatMap((part) =>
      part.groups.map((g) => {
        const n = numbers.get(g.key);
        return {
          key: g.key,
          partKey: part.key,
          type: g.type,
          heading: g.heading,
          slots: g.slots,
          attempt: g.attempt,
          marksEach: g.marksEach,
          compulsory: g.compulsory ?? false,
          numbering: g.numbering ?? "GROUP",
          showCoTag: g.showCoTag,
          objectiveColumns:
            g.objectiveLayout === "ONE_COLUMN" ? 1 : g.objectiveLayout === "FOUR_COLUMN" ? 4 : 2,
          ...(n?.label ? { label: n.label } : {}),
          slotLabels: n?.slotLabels ?? [],
          printed: n?.printed ?? [],
        } satisfies EditorGroup;
      }),
    ),
    slots: p.slots.map((x) => ({
      groupKey: x.groupKey,
      position: x.position,
      content: x.content,
      marks: x.marks,
      coTag: x.coTag,
      bloomLevel: x.bloomLevel,
      answerKey: x.answerKey === null ? null : (docSchema.parse(x.answerKey) as Doc),
      keyCriteria: x.keyCriteria === null ? [] : keyCriteriaSchema.parse(x.keyCriteria),
    })),
    coOptions: course ? coOptions(course) : [],
    pci: {
      status: check.pci,
      warnings: check.warnings,
      ...(check.notice ? { notice: check.notice } : {}),
    },
    courses: courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      semesterOrYear: c.semesterOrYear,
    })),
    blueprint: bp
      ? {
          id: bp.id,
          unit: bp.unit,
          tolerance: bp.tolerance,
          targets: bp.targets,
          mine: bp.mine,
          ownerName: bp.ownerName,
        }
      : null,
  };
}
