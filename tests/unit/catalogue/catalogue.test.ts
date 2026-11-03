// Gate for Phase 3 (SPEC §13): every Table X course is present with matching
// credits, marks and durations, and agrees with the PCI rule set.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import tableX from "@/lib/catalogue/table-x.json" with { type: "json" };
import { bpharmCatalogue, coTag } from "@/lib/catalogue";
import { pciRuleSet } from "@/lib/rules";

const catalogue = bpharmCatalogue();
const courses = catalogue.courses;
const rules = pciRuleSet();
const rows = tableX.rows;
const noted = (code: string, what: string) =>
  catalogue.discrepancies.some((d) => d.code === code && d.text.includes(what));

describe("B.Pharm catalogue", () => {
  it("was generated from the committed syllabus PDF", () => {
    const pdf = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../..", catalogue.source.document),
    );
    expect(createHash("sha256").update(pdf).digest("hex")).toBe(catalogue.source.sha256);
    expect(tableX.source.sha256).toBe(catalogue.source.sha256);
  });

  it("has unique codes", () => {
    expect(new Set(courses.map((c) => c.code)).size).toBe(courses.length);
  });

  it("covers all 88 Table X rows, elective slots through their options", () => {
    expect(rows).toHaveLength(88);
    for (const row of rows) {
      const matches = row.electiveLabel
        ? courses.filter((c) => c.electiveOf === row.code)
        : courses.filter((c) => c.code === row.code);
      expect(matches.length, row.code).toBeGreaterThan(0);
      if (!row.electiveLabel) expect(matches).toHaveLength(1);
      for (const c of matches) {
        expect(c.code.startsWith(row.code), c.code).toBe(true);
        expect(c.electiveLabel).toBe(row.electiveLabel);
        expect(
          {
            semester: c.semester,
            credits: c.credits,
            maxMarks: c.maxMarks,
            continuousMarks: c.continuousMarks,
            sessionalMarks: c.sessionalMarks,
            sessionalMinutes: c.sessionalMinutes,
            endSemMarks: c.endSemMarks,
            endSemMinutes: c.endSemMinutes,
          },
          c.code,
        ).toEqual({
          semester: row.semester,
          credits: row.credits,
          maxMarks: row.totalMarks,
          continuousMarks: row.continuousMarks ?? 0,
          sessionalMarks: row.sessionalMarks ?? 0,
          sessionalMinutes: row.sessionalMinutes,
          endSemMarks: row.endSemMarks,
          endSemMinutes: row.endSemMinutes,
        });
      }
    }
    // No course without a Table X row.
    for (const c of courses) {
      expect(
        rows.some((r) => r.code === (c.electiveOf ?? c.code)),
        c.code,
      ).toBe(true);
    }
  });

  it("adds up per semester to Table IX (21/26/25/23/22/26/26/24 = 193)", () => {
    const perSemester = [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
      rows.filter((r) => r.semester === s).reduce((sum, r) => sum + r.credits, 0),
    );
    expect(perSemester).toEqual([21, 26, 25, 23, 22, 26, 26, 24]);
  });

  it("internal + external = total for every row (Regulation 10.3)", () => {
    for (const r of rows) {
      expect((r.internalMarks ?? 0) + r.endSemMarks, r.code).toBe(r.totalMarks);
      if (r.internalMarks !== null)
        expect(r.continuousMarks! + r.sessionalMarks!, r.code).toBe(r.internalMarks);
    }
  });

  it("agrees with the PCI rule set for theory courses", () => {
    for (const c of courses.filter((x) => x.courseKind === "THEORY")) {
      const m = rules.creditMarks.get(c.credits);
      const end = rules.theory.END_SEMESTER.get(c.credits);
      const ses = rules.theory.SESSIONAL.get(c.credits);
      expect(c.ruleSetId).toBe(rules.ruleSetId);
      expect([c.maxMarks, c.endSemMarks, c.continuousMarks + c.sessionalMarks], c.code).toEqual([
        m?.total,
        m?.external,
        m?.internal,
      ]);
      expect([c.endSemMarks, c.endSemMinutes], c.code).toEqual([
        end?.maxMarks,
        end?.durationMinutes,
      ]);
      expect([c.sessionalMarks, c.sessionalMinutes], c.code).toEqual([
        ses?.maxMarks,
        ses?.durationMinutes,
      ]);
    }
  });

  it("agrees with the PCI rule set for practical courses, including the 3 h / 4 h rule", () => {
    const p = rules.practical;
    for (const c of courses.filter((x) => x.courseKind === "PRACTICAL")) {
      expect(p.allowedCredits, c.code).toContain(c.credits);
      expect(c.ruleSetId).toBe(rules.ruleSetId);
      expect([c.sessionalMarks, c.endSemMarks], c.code).toEqual([
        p.SESSIONAL.maxMarks,
        p.END_SEMESTER.maxMarks,
      ]);
      const expected =
        c.practicalHrs >= p.durationRule.labHoursPerWeekAtLeast
          ? p.durationRule.minutesIfAtLeast
          : p.durationRule.minutesOtherwise;
      expect([c.sessionalMinutes, c.endSemMinutes], c.code).toEqual([expected, expected]);
    }
  });

  it("projects and internships carry no rule set", () => {
    const others = courses.filter(
      (c) => c.courseKind === "PROJECT" || c.courseKind === "INTERNSHIP",
    );
    expect(others.map((c) => c.code).sort()).toEqual(["BP411I", "BP612I", "BP710RP", "BP810RP"]);
    for (const c of others) expect(c.ruleSetId).toBeNull();
  });

  it("has consistent hours: L+T = credits for theory, 15 weeks of contact hours", () => {
    for (const c of courses) {
      if (c.courseKind === "THEORY") {
        expect([c.lectureHrs + c.tutorialHrs, c.practicalHrs], c.code).toEqual([c.credits, 0]);
      }
      if (c.courseKind === "PRACTICAL") {
        expect(c.lectureHrs, c.code).toBe(0);
        expect(c.credits, c.code).toBe(c.practicalHrs >= 4 ? 2 : 1);
      }
      if (c.maxHours !== null && c.courseKind !== "INTERNSHIP") {
        expect(c.maxHours, c.code).toBe(15 * (c.lectureHrs + c.tutorialHrs + c.practicalHrs));
      }
    }
  });

  it("numbers outcomes and units 1..n; theory courses have units that fill the hours", () => {
    for (const c of courses) {
      expect(
        c.outcomes.map((o) => o.number),
        c.code,
      ).toEqual(c.outcomes.map((_, k) => k + 1));
      expect(
        c.units.map((u) => u.number),
        c.code,
      ).toEqual(c.units.map((_, k) => k + 1));
      if (c.courseKind === "THEORY" || c.courseKind === "PRACTICAL") {
        expect(c.outcomes.length, c.code).toBeGreaterThanOrEqual(5);
      }
      if (c.courseKind === "THEORY") {
        expect(c.units.length, c.code).toBeGreaterThanOrEqual(5);
        const sum = c.units.reduce((s, u) => s + u.hours, 0);
        if (sum !== c.maxHours) expect(noted(c.code, "unit hours"), c.code).toBe(true);
      }
    }
  });

  it("spot-checks courses against the PDF (read by hand)", () => {
    const get = (code: string) => courses.find((c) => c.code === code)!;
    const bp101 = get("BP101T");
    expect(bp101.title).toBe("Basics of Python Programming for Pharmaceutical Sciences (Theory)");
    expect(bp101.outcomes[1]?.text).toBe(
      "Analyze program logic using control structures and functions.",
    );
    expect(bp101.units.map((u) => [u.title, u.hours])[0]).toEqual([
      "Introduction to Python programming",
      6,
    ]);
    const bp702 = get("BP702T");
    expect([bp702.semester, bp702.credits, bp702.maxMarks, bp702.endSemMinutes]).toEqual([
      7, 2, 50, 90,
    ]);
    const bp309 = get("BP309P");
    expect([bp309.practicalHrs, bp309.credits, bp309.endSemMinutes]).toEqual([4, 2, 240]);
    expect(get("BP708T AEC7").title).toBe("Precision Medicine (Theory)");
    expect(get("BP810RP")).toMatchObject({
      semester: 8,
      credits: 6,
      maxMarks: 150,
      syllabusPage: null,
    });
    expect(get("BP802T").units).toHaveLength(9);
  });

  it("formats CO tags as the papers print them", () => {
    expect(coTag("BP604T", 1)).toBe("BP604T.01");
    expect(coTag("BP607T AEC1", 12)).toBe("BP607TAEC1.12");
  });
});
