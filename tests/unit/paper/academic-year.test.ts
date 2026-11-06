import { describe, expect, it } from "vitest";
import { nextAcademicYear } from "@/lib/paper/academic-year";
import { EXAM_GROUPS } from "@/lib/templates/labels";
import { ExamKind } from "@/generated/prisma/enums";

describe("nextAcademicYear (D60)", () => {
  it.each([
    ["2025-26", "2026-27"],
    ["2025-2026", "2026-2027"],
    [" 2099-00 ", "2100-01"],
    ["2029–30", "2030–31"],
    ["2025/26", "2026/27"],
  ])("%s → %s", (from, to) => {
    expect(nextAcademicYear(from)).toBe(to);
  });

  it.each(["", "2025", "2025-27", "2025-2027", "AY 2025-26", "26-27", "2025-26-27"])(
    "does not guess from %j",
    (from) => {
      expect(nextAcademicYear(from)).toBeNull();
    },
  );
});

describe("exam groups (D59)", () => {
  it("put every exam kind in exactly one group", () => {
    const all = Object.values(EXAM_GROUPS).flatMap((g) => [...g.kinds]);
    expect([...all].sort()).toEqual(Object.values(ExamKind).sort());
  });
});
