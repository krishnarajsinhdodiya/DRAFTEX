// What a paper keeps of its template (SPEC §6 templateSnapshot): the layout
// plus the facts the checker and the header need, so the paper still prints
// and checks the same after the template changes or is deleted.
import type { z } from "zod";
import { templateFieldsSchema } from "@/lib/templates/fields";

export const paperSnapshotSchema = templateFieldsSchema.pick({
  title: true,
  program: true,
  examKind: true,
  courseKind: true,
  creditTier: true,
  durationMinutes: true,
  maxMarks: true,
  structure: true,
  style: true,
  header: true,
});
export type PaperSnapshot = z.output<typeof paperSnapshotSchema>;
export type PaperSnapshotInput = z.input<typeof paperSnapshotSchema>;
