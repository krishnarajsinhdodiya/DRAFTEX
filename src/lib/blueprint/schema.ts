// CO blueprint fields (Phase 15, D108): what a blueprint holds and the rules
// a save must meet. Client-safe, so the editor validates with the same rules.
import { z } from "zod";
import { courseCodeSchema } from "../bank/question.ts";
import { CO_TAG_HINT, CO_TAG_RE } from "../paper/co-tag.ts";
import { EXAM_GROUP_KEYS, type ExamGroup } from "../templates/labels.ts";

export const BLUEPRINT_UNITS = ["MARKS", "PERCENT"] as const;
export type BlueprintUnit = (typeof BLUEPRINT_UNITS)[number];
/** More rows than any course has COs (the syllabus has at most 8). */
export const BLUEPRINT_MAX_TARGETS = 30;

export const blueprintTargetSchema = z.object({
  co: z.string().trim().regex(CO_TAG_RE, CO_TAG_HINT),
  /** Marks (0-500) or percent (0-100); 0 means "this CO should not appear". */
  target: z.number().min(0).max(500),
});
export type BlueprintTarget = z.infer<typeof blueprintTargetSchema>;

export const blueprintTargetsSchema = z
  .array(blueprintTargetSchema)
  .min(1, "Add at least one CO.")
  .max(BLUEPRINT_MAX_TARGETS, `At most ${BLUEPRINT_MAX_TARGETS} COs.`)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      if (seen.has(r.co)) {
        ctx.addIssue({ code: "custom", path: [i, "co"], message: `${r.co} is listed twice.` });
      }
      seen.add(r.co);
    });
  });

export const blueprintFieldsSchema = z
  .object({
    courseCode: courseCodeSchema,
    examGroup: z.enum(EXAM_GROUP_KEYS as [ExamGroup, ...ExamGroup[]]),
    unit: z.enum(BLUEPRINT_UNITS),
    tolerance: z.number().min(0).max(100),
    targets: blueprintTargetsSchema,
  })
  .superRefine((b, ctx) => {
    if (b.unit !== "PERCENT") return;
    b.targets.forEach((t, i) => {
      if (t.target > 100) {
        ctx.addIssue({ code: "custom", path: ["targets", i, "target"], message: "At most 100%." });
      }
    });
    const sum = b.targets.reduce((a, t) => a + t.target, 0);
    if (Math.abs(sum - 100) > 0.01) {
      ctx.addIssue({
        code: "custom",
        path: ["targets"],
        message: `Percentages add up to ${Number(sum.toFixed(2))}%, not 100%.`,
      });
    }
  });
export type BlueprintFields = z.infer<typeof blueprintFieldsSchema>;
