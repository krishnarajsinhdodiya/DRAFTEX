import { describe, expect, it } from "vitest";
import {
  criteriaNote,
  criteriaTotal,
  hasContent,
  keyCriteriaSchema,
  marksNumber,
  sameMarks,
} from "@/lib/paper/key";

describe("answer key helpers", () => {
  it("add up split-up marks and say when they do not match", () => {
    const c = [
      { text: "Definition", marks: 1.5 },
      { text: "Example", marks: 2 },
    ];
    expect(criteriaTotal(c)).toBe(3.5);
    expect(criteriaNote(c, 3.5)).toBeNull();
    expect(criteriaNote([], 5)).toBeNull();
    expect(criteriaNote(c, 5)).toBe(
      "The split-up marks add up to 3.5, but the question is worth 5.",
    );
    expect(sameMarks(0.1 + 0.2, 0.3)).toBe(true);
    expect(marksNumber(7.5)).toBe("7.5");
    expect(marksNumber(1 / 3)).toBe("0.33");
  });

  it("validate rows and tell empty docs apart", () => {
    expect(keyCriteriaSchema.safeParse([{ text: " x ", marks: 0 }]).data).toEqual([
      { text: "x", marks: 0 },
    ]);
    expect(keyCriteriaSchema.safeParse([{ text: "", marks: 1 }]).success).toBe(false);
    expect(keyCriteriaSchema.safeParse([{ text: "x", marks: -1 }]).success).toBe(false);
    expect(hasContent(null)).toBe(false);
    expect(hasContent({ type: "doc", content: [] })).toBe(false);
    expect(hasContent({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
  });
});
