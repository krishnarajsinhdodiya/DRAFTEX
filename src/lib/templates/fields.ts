// The editable fields of a template, validated at every boundary. Client-safe,
// so the builder checks the same rules as the data layer while you type.
import { z } from "zod";
import { CourseKind, ExamKind, Program } from "@/generated/prisma/enums";
import { headerSchema, structureSchema, styleSchema } from "@/lib/paper/schema";

export const templateFieldsSchema = z.object({
  title: z.string().trim().min(1, "Give the template a title.").max(200),
  description: z.string().trim().max(2000).default(""),
  program: z.enum(Program),
  examKind: z.enum(ExamKind),
  courseKind: z.enum(CourseKind),
  creditTier: z.number().int().min(0).max(10).nullable().default(null),
  durationMinutes: z.number().int().min(1).max(600),
  maxMarks: z.number().positive().max(1000),
  structure: structureSchema,
  style: styleSchema,
  header: headerSchema,
});
export type TemplateFields = z.input<typeof templateFieldsSchema>;
export type ParsedTemplateFields = z.output<typeof templateFieldsSchema>;
