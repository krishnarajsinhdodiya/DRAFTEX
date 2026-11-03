import { describe, expect, it } from "vitest";
import { type Group, type Structure, structureSchema } from "@/lib/paper/schema";
import { type CheckMeta, checkTemplate, pciRuleSet } from "@/lib/rules";
import { ksvLegacy75, pciEndSem4CreditKsv, practicalEnd } from "../../fixtures/papers/templates";

const rules = pciRuleSet();

function g(
  key: string,
  type: Group["type"],
  slots: number,
  attempt: number,
  marksEach: number,
  extra: Partial<Group> = {},
): Group {
  return {
    key,
    type,
    heading: `${key} heading.`,
    slots,
    attempt,
    marksEach,
    showCoTag: "SLOT",
    ...extra,
  };
}

function s(...groups: Group[]): Structure {
  return {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "MARKS_COLON",
    parts: [{ key: "p1", separateAnswerSheet: false, groups }],
    footer: { text: "", ornament: "NONE" },
  };
}

const end4 = () =>
  s(g("obj", "OBJECTIVE", 20, 20, 1), g("short", "SHORT", 7, 5, 4), g("long", "LONG", 3, 2, 10));
const meta = (m: Partial<CheckMeta> = {}): CheckMeta => ({
  program: "B_PHARM",
  examKind: "END_SEMESTER",
  courseKind: "THEORY",
  credits: 4,
  durationMinutes: 180,
  maxMarks: 60,
  ...m,
});
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("checkTemplate: errors (block saving)", () => {
  it("passes a correct PCI 4-credit end-semester template", () => {
    expect(checkTemplate(end4(), meta(), rules)).toEqual({
      errors: [],
      warnings: [],
      pci: "COMPLIANT",
    });
  });

  it("accepts the 10 × 2 objective variant", () => {
    const st = s(
      g("obj", "OBJECTIVE", 10, 10, 2),
      g("short", "SHORT", 7, 5, 4),
      g("long", "LONG", 3, 2, 10),
    );
    expect(checkTemplate(st, meta(), rules).pci).toBe("COMPLIANT");
  });

  it("flags duplicate part and group keys", () => {
    const st = end4();
    st.parts.push({ key: "p1", separateAnswerSheet: false, groups: [g("obj", "FREE", 1, 1, 1)] });
    const r = checkTemplate(st, meta({ maxMarks: 61 }), null);
    expect(codes(r.errors)).toEqual(["DUPLICATE_PART_KEY", "DUPLICATE_GROUP_KEY"]);
    expect(r.errors[0]?.path).toBe("parts.1");
    expect(r.errors[1]?.path).toBe("parts.1.groups.0");
  });

  it("flags an empty or blank heading, naming the group by position", () => {
    const st = s(
      g("a", "SHORT", 2, 1, 5, { heading: "   " }),
      g("b", "LONG", 1, 1, 0, { heading: "" }),
    );
    const r = checkTemplate(st, meta({ maxMarks: 5 }), null);
    expect(codes(r.errors)).toEqual(["EMPTY_HEADING", "EMPTY_HEADING", "MARKS_NOT_POSITIVE"]);
    expect(r.errors[0]?.message).toBe("Question group 1 has no heading.");
    expect(r.errors[2]?.message).toMatch(/^Question group 2: marks/);
  });

  it("flags attempt < 1, including NaN", () => {
    for (const attempt of [0, -1, Number.NaN]) {
      const r = checkTemplate(s(g("a", "SHORT", 3, attempt, 5)), meta({ maxMarks: 0 }), null);
      expect(codes(r.errors)).toContain("ATTEMPT_TOO_LOW");
    }
  });

  it("flags attempt > slots", () => {
    const r = checkTemplate(s(g("a", "SHORT", 3, 4, 5)), meta({ maxMarks: 20 }), null);
    expect(codes(r.errors)).toEqual(["ATTEMPT_OVER_SLOTS"]);
    expect(r.errors[0]?.message).toBe(
      '"a heading." asks students to attempt 4 questions but has only 3.',
    );
  });

  it("flags a compulsory group with choice and accepts one without", () => {
    const bad = checkTemplate(
      s(g("a", "SHORT", 3, 2, 5, { compulsory: true })),
      meta({ maxMarks: 10 }),
      null,
    );
    expect(codes(bad.errors)).toEqual(["COMPULSORY_WITH_CHOICE"]);
    const ok = checkTemplate(
      s(g("a", "SHORT", 2, 2, 5, { compulsory: true })),
      meta({ maxMarks: 10 }),
      null,
    );
    expect(ok.errors).toEqual([]);
  });

  it("flags marks ≤ 0 and NaN marks", () => {
    for (const m of [0, -2, Number.NaN]) {
      expect(
        codes(checkTemplate(s(g("a", "SHORT", 1, 1, m)), meta({ maxMarks: 0 }), null).errors),
      ).toContain("MARKS_NOT_POSITIVE");
    }
  });

  it("flags a total that differs from max marks, allowing 7.5-mark arithmetic", () => {
    const r = checkTemplate(end4(), meta({ maxMarks: 75 }), null);
    expect(r.errors).toEqual([
      {
        code: "TOTAL_MISMATCH",
        message: "The questions add up to 60 marks, but the paper is out of 75.",
      },
    ]);
    const st = s(
      g("obj", "OBJECTIVE", 10, 10, 1),
      g("short", "SHORT", 7, 5, 4),
      g("long", "LONG", 3, 2, 7.5),
    );
    expect(
      checkTemplate(st, meta({ credits: 3, maxMarks: 45, durationMinutes: 120 }), rules),
    ).toEqual({ errors: [], warnings: [], pci: "COMPLIANT" });
  });

  it("reports errors and warnings together", () => {
    const r = checkTemplate(end4(), meta({ maxMarks: 70 }), rules);
    expect(codes(r.errors)).toEqual(["TOTAL_MISMATCH"]);
    expect(codes(r.warnings)).toEqual(["PCI_MAX_MARKS"]);
    expect(r.pci).toBe("NON_PCI");
  });
});

describe("checkTemplate: which rules apply", () => {
  it("no rule set → neutral notice", () => {
    expect(checkTemplate(end4(), meta(), null)).toEqual({
      errors: [],
      warnings: [],
      pci: "NO_RULE_SET",
      notice: "No PCI 2026 rule set loaded.",
    });
  });

  it("M.Pharm and Pharm.D get the neutral notice, never a warning", () => {
    for (const program of ["M_PHARM", "PHARM_D"] as const) {
      const r = checkTemplate(end4(), meta({ program, maxMarks: 60, durationMinutes: 999 }), rules);
      expect(r.pci).toBe("NO_RULE_SET");
      expect(r.warnings).toEqual([]);
    }
  });

  it("projects and internships are not question papers", () => {
    for (const courseKind of ["PROJECT", "INTERNSHIP"] as const) {
      const r = checkTemplate(end4(), meta({ courseKind }), rules);
      expect(r.pci).toBe("NO_RULE_SET");
      expect(r.notice).toMatch(/does not set a question paper/);
    }
  });

  it("synopsis, custom and year-end exams have no PCI pattern", () => {
    for (const examKind of ["SYNOPSIS", "CUSTOM", "YEAR_END"] as const) {
      const r = checkTemplate(end4(), meta({ examKind }), rules);
      expect(r.pci).toBe("NO_RULE_SET");
      expect(r.notice).toMatch(/no pattern for this kind of exam/);
    }
  });

  it("ATKT papers are checked as end-semester papers", () => {
    expect(checkTemplate(end4(), meta({ examKind: "SUPPLEMENTARY_ATKT" }), rules).pci).toBe(
      "COMPLIANT",
    );
  });

  it("all three sessional kinds use the sessional pattern", () => {
    const st = s(
      g("obj", "OBJECTIVE", 2, 2, 2),
      g("short", "SHORT", 3, 2, 3),
      g("long", "LONG", 2, 1, 10),
    );
    for (const examKind of ["SESSIONAL_1", "SESSIONAL_2", "SESSIONAL_IMPROVEMENT"] as const) {
      expect(
        checkTemplate(st, meta({ examKind, maxMarks: 20, durationMinutes: 60 }), rules).pci,
      ).toBe("COMPLIANT");
    }
  });
});

describe("checkTemplate: theory warnings", () => {
  it("asks for credits when none are set", () => {
    const r = checkTemplate(end4(), meta({ credits: null }), rules);
    expect(r.warnings).toEqual([
      {
        code: "NO_CREDIT_PATTERN",
        message: "Choose the course credits to compare this template with the PCI pattern.",
        page: "28-29",
      },
    ]);
  });

  it("has no pattern for 5 credits", () => {
    const r = checkTemplate(end4(), meta({ credits: 5, examKind: "SESSIONAL_1" }), rules);
    expect(r.warnings).toEqual([
      {
        code: "NO_CREDIT_PATTERN",
        message: "PCI 2026 has no sessional pattern for 5-credit theory courses.",
        page: 28,
      },
    ]);
  });

  it("warns on max marks and duration, citing the page", () => {
    const r = checkTemplate(end4(), meta({ credits: 3, durationMinutes: 90 }), rules);
    expect(r.warnings.slice(0, 2)).toEqual([
      {
        code: "PCI_MAX_MARKS",
        message: "PCI sets 45 marks for a 3-credit end-semester paper; this one is out of 60.",
        page: "28-29",
      },
      {
        code: "PCI_DURATION",
        message:
          "PCI sets 2 hours for a 3-credit end-semester paper; this one is 1 hour 30 minutes.",
        page: "28-29",
      },
    ]);
  });

  it("describes the expected group shapes", () => {
    const st = s(
      g("obj", "OBJECTIVE", 20, 18, 1),
      g("short", "SHORT", 7, 5, 4),
      g("long", "LONG", 3, 2, 10),
    );
    const r = checkTemplate(st, meta({ maxMarks: 58 }), rules);
    expect(r.warnings).toContainEqual({
      code: "PCI_GROUP_SHAPE",
      message:
        'PCI expects "Objective (MCQ)" as 20 compulsory, 1 mark each or 10 compulsory, 2 marks each; this template has any 18 of 20, 1 mark each.',
      path: "parts.0.groups.0",
      page: "28-29",
    });
  });

  it("warns on a missing group, a repeated group and a non-PCI group", () => {
    const st = s(
      g("obj", "OBJECTIVE", 20, 20, 1),
      g("l1", "LONG", 3, 2, 10),
      g("l2", "LONG", 3, 2, 10),
      g("sn", "SHORT_NOTE", 2, 2, 5),
    );
    const r = checkTemplate(st, meta({ maxMarks: 70 }), rules);
    expect(codes(r.warnings)).toEqual([
      "PCI_MAX_MARKS",
      "PCI_MISSING_GROUP",
      "PCI_GROUP_COUNT",
      "PCI_EXTRA_GROUP",
    ]);
    expect(r.warnings[1]?.message).toBe(
      'PCI expects a "Short answers" group (any 5 of 7, 4 marks each); this template has none.',
    );
    expect(r.warnings[2]).toMatchObject({
      message: 'PCI expects one "Long answers" group; this template has 2.',
      path: "parts.0.groups.2",
    });
    expect(r.warnings[3]).toMatchObject({
      message: '"Short notes" questions are not part of the PCI pattern.',
      path: "parts.0.groups.3",
    });
  });

  it("marks the legacy 75-mark KSV template Non-PCI", () => {
    const st = structureSchema.parse(ksvLegacy75.structure);
    const r = checkTemplate(st, meta({ maxMarks: 75, examKind: "SUPPLEMENTARY_ATKT" }), rules);
    expect(r.errors).toEqual([]);
    expect(r.pci).toBe("NON_PCI");
    expect(codes(r.warnings)).toContain("PCI_MAX_MARKS");
  });

  it("finds the reference 4-credit template compliant", () => {
    const st = structureSchema.parse(pciEndSem4CreditKsv.structure);
    expect(checkTemplate(st, meta(), rules)).toEqual({
      errors: [],
      warnings: [],
      pci: "COMPLIANT",
    });
  });
});

describe("checkTemplate: practical warnings", () => {
  const pEnd = () =>
    s(
      g("syn", "SYNOPSIS", 1, 1, 7.5),
      g("major", "PRACTICAL_PERFORM", 6, 1, 10),
      g("minor", "PRACTICAL_PERFORM", 1, 1, 5),
      g("viva", "VIVA", 1, 1, 7.5),
    );
  const pMeta = (m: Partial<CheckMeta> = {}) =>
    meta({
      examKind: "PRACTICAL_END",
      courseKind: "PRACTICAL",
      credits: 1,
      maxMarks: 30,
      durationMinutes: 180,
      ...m,
    });

  it("passes the Table XVI pattern with 3 h or 4 h when lab hours are unknown", () => {
    expect(checkTemplate(pEnd(), pMeta(), rules).pci).toBe("COMPLIANT");
    expect(
      checkTemplate(pEnd(), pMeta({ durationMinutes: 240, labHoursPerWeek: null }), rules).pci,
    ).toBe("COMPLIANT");
  });

  it("uses the lab hours to pick 3 h or 4 h", () => {
    expect(
      checkTemplate(pEnd(), pMeta({ durationMinutes: 240, labHoursPerWeek: 4, credits: 2 }), rules)
        .pci,
    ).toBe("COMPLIANT");
    const r = checkTemplate(pEnd(), pMeta({ durationMinutes: 240, labHoursPerWeek: 3 }), rules);
    expect(r.warnings).toEqual([
      {
        code: "PCI_DURATION",
        message: "PCI sets 3 hours for this practical end-semester paper; this one is 4 hours.",
        page: 29,
      },
    ]);
  });

  it("lists both durations when lab hours are unknown", () => {
    const r = checkTemplate(pEnd(), pMeta({ durationMinutes: 10 }), rules);
    expect(r.warnings[0]?.message).toBe(
      "PCI sets 3 hours or 4 hours for this practical end-semester paper; this one is 10 minutes.",
    );
  });

  it("practical sessional (Table XIV) through either exam kind", () => {
    const st = s(
      g("syn", "SYNOPSIS", 1, 1, 2),
      g("major", "PRACTICAL_PERFORM", 1, 1, 4),
      g("minor", "PRACTICAL_PERFORM", 1, 1, 2),
      g("viva", "VIVA", 1, 1, 2),
    );
    expect(
      checkTemplate(st, pMeta({ examKind: "PRACTICAL_SESSIONAL", maxMarks: 10 }), rules).pci,
    ).toBe("COMPLIANT");
    expect(checkTemplate(st, pMeta({ examKind: "SESSIONAL_2", maxMarks: 10 }), rules).pci).toBe(
      "COMPLIANT",
    );
    expect(checkTemplate(pEnd(), pMeta({ examKind: "END_SEMESTER" }), rules).pci).toBe("COMPLIANT");
  });

  it("warns on credits", () => {
    expect(checkTemplate(pEnd(), pMeta({ credits: null }), rules).warnings[0]).toMatchObject({
      code: "NO_CREDIT_PATTERN",
      page: 29,
    });
    expect(
      checkTemplate(
        pEnd(),
        pMeta({ credits: 3, examKind: "PRACTICAL_SESSIONAL", maxMarks: 30 }),
        rules,
      ).warnings[0],
    ).toEqual({
      code: "NO_CREDIT_PATTERN",
      message: "PCI 2026 practical courses carry 1 or 2 credits, not 3.",
      page: 28,
    });
  });

  it("warns on max marks, components and extra groups (the old fixture)", () => {
    const st = structureSchema.parse(practicalEnd.structure);
    const r = checkTemplate(st, pMeta(), rules);
    expect(r.warnings.map((w) => w.message)).toEqual([
      'PCI expects "Synopsis" for 7.5 marks; this template has 5 marks.',
      'PCI expects 2 "Perform the practical" items (10 marks and 5 marks); this template has 10 marks and 10 marks.',
      'PCI expects "Viva voce" for 7.5 marks; this template has 5 marks.',
    ]);
    const extra = s(
      g("syn", "SYNOPSIS", 1, 1, 7.5),
      g("major", "PRACTICAL_PERFORM", 1, 1, 10),
      g("minor", "PRACTICAL_PERFORM", 1, 1, 5),
      g("q", "SHORT", 1, 1, 7.5),
    );
    const r2 = checkTemplate(extra, pMeta({ maxMarks: 31 }), rules);
    expect(codes(r2.warnings)).toEqual(["PCI_MAX_MARKS", "PCI_COMPONENT", "PCI_EXTRA_GROUP"]);
    expect(r2.warnings[1]?.message).toBe(
      'PCI expects "Viva voce" for 7.5 marks; this template has none.',
    );
    expect(r2.warnings[1]?.path).toBeUndefined();
    expect(r2.warnings[2]?.message).toBe(
      '"Short answers" questions are not part of the PCI practical pattern.',
    );
  });
});
