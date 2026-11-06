// What a paper version snapshot holds (D57): the paper's details, its own copy
// of the template, every question and key. Enough to compile the paper and
// key again, and to restore it as a new Draft paper. No PDF is stored.
import { createHash } from "node:crypto";
import { z } from "zod";
import { BloomLevel, ExamKind, Program } from "@/generated/prisma/enums";
import { keyCriteriaSchema } from "./key";
import { docSchema } from "./schema";
import { paperSnapshotSchema } from "./snapshot";

export const VERSION_FORMAT = 1;

export const versionSlotSchema = z.object({
  partKey: z.string(),
  groupKey: z.string(),
  position: z.number().int(),
  content: docSchema,
  marks: z.number(),
  coTag: z.string().nullable(),
  bloomLevel: z.enum(BloomLevel).nullable(),
  answerKey: docSchema.nullable(),
  keyCriteria: keyCriteriaSchema.nullable(),
});

export const versionDataSchema = z.object({
  format: z.literal(VERSION_FORMAT),
  paper: z.object({
    title: z.string(),
    templateId: z.string().nullable(),
    templateSnapshot: paperSnapshotSchema,
    courseId: z.string().nullable(),
    courseCode: z.string(),
    courseTitle: z.string(),
    program: z.enum(Program),
    semesterOrYear: z.number().int(),
    examKind: z.enum(ExamKind),
    academicYear: z.string(),
    examDate: z.string().nullable(),
    instructionsOverride: z.array(z.string()).nullable(),
  }),
  slots: z.array(versionSlotSchema),
});
export type VersionData = z.infer<typeof versionDataSchema>;

interface PaperRow {
  title: string;
  templateId: string | null;
  templateSnapshot: unknown;
  courseId: string | null;
  courseCode: string;
  courseTitle: string;
  program: Program;
  semesterOrYear: number;
  examKind: ExamKind;
  academicYear: string;
  examDate: Date | null;
  instructionsOverride: unknown;
}
interface SlotRow {
  partKey: string;
  groupKey: string;
  position: number;
  content: unknown;
  marks: number;
  coTag: string | null;
  bloomLevel: BloomLevel | null;
  answerKey: unknown;
  keyCriteria: unknown;
}

const order = (a: SlotRow, b: SlotRow) =>
  a.partKey.localeCompare(b.partKey) ||
  a.groupKey.localeCompare(b.groupKey) ||
  a.position - b.position;

/** The snapshot of a paper as stored; fields in a fixed order so equal papers hash equally. */
export function versionOf(paper: PaperRow, slots: SlotRow[]): VersionData {
  return versionDataSchema.parse({
    format: VERSION_FORMAT,
    paper: {
      title: paper.title,
      templateId: paper.templateId,
      templateSnapshot: paper.templateSnapshot,
      courseId: paper.courseId,
      courseCode: paper.courseCode,
      courseTitle: paper.courseTitle,
      program: paper.program,
      semesterOrYear: paper.semesterOrYear,
      examKind: paper.examKind,
      academicYear: paper.academicYear,
      examDate: paper.examDate ? paper.examDate.toISOString() : null,
      instructionsOverride: paper.instructionsOverride ?? null,
    },
    slots: [...slots].sort(order).map((s) => ({
      partKey: s.partKey,
      groupKey: s.groupKey,
      position: s.position,
      content: s.content,
      marks: s.marks,
      coTag: s.coTag,
      bloomLevel: s.bloomLevel,
      answerKey: s.answerKey ?? null,
      keyCriteria: s.keyCriteria ?? null,
    })),
  });
}

export function versionHash(v: VersionData): string {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex");
}
