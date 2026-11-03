// Answer keys (SPEC §8, D24, D33): each question may carry a model answer
// (rich content) and split-up marks. Pure and client-safe.
import { z } from "zod";
import type { Doc } from "./schema";

export const keyCriterionSchema = z.object({
  text: z.string().trim().min(1, "Describe what earns these marks.").max(300),
  marks: z.number().min(0).max(100),
});
export const keyCriteriaSchema = z.array(keyCriterionSchema).max(20);
export type KeyCriterion = z.output<typeof keyCriterionSchema>;

/** Marks are halves at most (7.5 is common); compare with a small tolerance. */
export function sameMarks(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

export function criteriaTotal(criteria: readonly KeyCriterion[]): number {
  return criteria.reduce((sum, c) => sum + c.marks, 0);
}

/** "7.5", "10", "0.25": marks as printed. */
export function marksNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** A plain-English note when the split-up marks do not add up to the question's marks. */
export function criteriaNote(criteria: readonly KeyCriterion[], marks: number): string | null {
  if (criteria.length === 0) return null;
  const total = criteriaTotal(criteria);
  if (sameMarks(total, marks)) return null;
  return `The split-up marks add up to ${marksNumber(total)}, but the question is worth ${marksNumber(marks)}.`;
}

/** True when a doc has anything in it. */
export function hasContent(doc: Doc | null | undefined): doc is Doc {
  return !!doc && doc.content.length > 0;
}
