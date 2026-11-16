// Phase 15 (D109-D111): coverage of a paper against a CO blueprint, and the
// blueprint field rules. Invented codes only.
import { describe, expect, it } from "vitest";
import { type CoverageQuestion, coverage, marksBy } from "@/lib/blueprint/coverage";
import { blueprintFieldsSchema } from "@/lib/blueprint/schema";
import type { Doc, SubPartAttrs } from "@/lib/paper/schema";

const para = { type: "paragraph" as const, content: [{ type: "text" as const, text: "Q" }] };
const plain: Doc = { type: "doc", content: [para] };
const withParts = (...parts: SubPartAttrs[]): Doc => ({
  type: "doc",
  content: [
    para,
    {
      type: "subParts",
      content: parts.map((attrs) => ({ type: "subPart", attrs, content: [para] })),
    },
  ],
});
const q = (
  groupKey: string,
  marks: number,
  coTag: string | null,
  content: Doc = plain,
): CoverageQuestion => ({
  groupKey,
  marks,
  coTag,
  bloomLevel: null,
  content,
});
const G = [
  { key: "g1", slots: 2, attempt: 2 },
  { key: "g2", slots: 7, attempt: 5 },
];
const bp = (targets: [string, number][], unit: "MARKS" | "PERCENT" = "MARKS", tolerance = 0) => ({
  unit,
  tolerance,
  targets: targets.map(([co, target]) => ({ co, target })),
});

describe("coverage", () => {
  it("an empty paper is under on every target and has no total", () => {
    const c = coverage([], G, bp([["A.01", 10]]));
    expect(c.total).toBe(0);
    expect(c.rows).toEqual([
      { key: "A.01", target: 10, marks: 0, actual: 0, difference: -10, status: "UNDER" },
    ]);
  });

  it("empty questions count as nothing", () => {
    const c = coverage([q("g1", 5, "A.01", { type: "doc", content: [] })], G, bp([["A.01", 0]]));
    expect(c.total).toBe(0);
    expect(c.problems).toBe(0);
  });

  it("marks with no CO go to the No CO row", () => {
    const c = coverage([q("g1", 5, null), q("g1", 5, "A.01")], G, bp([["A.01", 5]]));
    expect(c.rows.at(-1)).toMatchObject({ key: "", marks: 5, status: "UNTAGGED" });
    expect(c.problems).toBe(1);
  });

  it("two COs split equally (D121)", () => {
    const c = coverage(
      [q("g1", 5, "A.01, A.02")],
      G,
      bp([
        ["A.01", 2.5],
        ["A.02", 2.5],
      ]),
    );
    expect(c.rows.map((r) => [r.key, r.marks, r.status])).toEqual([
      ["A.01", 2.5, "OK"],
      ["A.02", 2.5, "OK"],
    ]);
  });

  it("optional groups scale by attempt/slots", () => {
    const qs = Array.from({ length: 7 }, (_, i) => q("g2", 7, i < 4 ? "A.01" : "A.02"));
    const c = coverage(
      qs,
      G,
      bp([
        ["A.01", 20],
        ["A.02", 15],
      ]),
    );
    expect(c.total).toBe(35);
    expect(c.rows.map((r) => r.status)).toEqual(["OK", "OK"]);
  });

  it("an unknown group counts in full", () => {
    expect(marksBy([q("gx", 4, "A.01")], G).total).toBe(4);
  });

  it("sub-parts split a question only when their marks add up (D69)", () => {
    const adds = withParts({ marks: 6, coTag: "A.02" }, { marks: 4 });
    const short = withParts({ marks: 6, coTag: "A.02" }, { marks: 3 });
    expect([...marksBy([q("g1", 10, "A.01", adds)], G).byKey]).toEqual([
      ["A.02", 6],
      ["A.01", 4],
    ]);
    expect([...marksBy([q("g1", 10, "A.01", short)], G).byKey]).toEqual([["A.01", 10]]);
  });

  it("a sub-part following a two-CO question splits its own marks", () => {
    const d = withParts({ marks: 6, coTag: "A.03" }, { marks: 4 });
    expect(Object.fromEntries(marksBy([q("g1", 10, "A.01, A.02", d)], G).byKey)).toEqual({
      "A.03": 6,
      "A.01": 2,
      "A.02": 2,
    });
  });

  it("elective suffix tags are separate keys", () => {
    const c = coverage([q("g1", 5, "XX607T.01 AEC1")], G, bp([["XX607T.01", 5]]));
    expect(c.rows.map((r) => [r.key, r.status])).toEqual([
      ["XX607T.01", "UNDER"],
      ["XX607T.01 AEC1", "NOT_PLANNED"],
    ]);
  });

  it("percent targets use the counted total", () => {
    const c = coverage(
      [q("g1", 6, "A.01"), q("g1", 4, "A.02")],
      G,
      bp(
        [
          ["A.01", 60],
          ["A.02", 40],
        ],
        "PERCENT",
      ),
    );
    expect(c.rows.map((r) => [r.actual, r.status])).toEqual([
      [60, "OK"],
      [40, "OK"],
    ]);
  });

  it.each([
    [5, 4, 1, "OK"],
    [5, 3.99, 1, "UNDER"],
    [5, 6, 1, "OK"],
    [5, 6.01, 1, "OVER"],
    [0, 0.5, 0, "OVER"],
    [0, 0, 0, "OK"],
  ])("target %d, paper %d, tolerance %d → %s", (target, marks, tol, status) => {
    const qs = marks > 0 ? [q("g1", marks, "A.01")] : [];
    expect(coverage(qs, G, bp([["A.01", target]], "MARKS", tol)).rows[0]?.status).toBe(status);
  });

  it("sevenths do not flip a status at the tolerance edge", () => {
    const qs = Array.from({ length: 7 }, () => q("g2", 1, "A.01"));
    expect(coverage(qs, G, bp([["A.01", 5]])).rows[0]?.status).toBe("OK");
  });

  it("the Bloom dimension uses the same rules (D111)", () => {
    const qs = [{ ...q("g1", 4, "A.01"), bloomLevel: "APPLY" as const }, q("g1", 1, null)];
    expect(Object.fromEntries(marksBy(qs, G, "BLOOM").byKey)).toEqual({ APPLY: 4, "": 1 });
  });
});

describe("blueprint fields", () => {
  const base = {
    courseCode: "XX604T",
    examKind: "SESSIONAL_1",
    unit: "MARKS",
    tolerance: 1,
    targets: [{ co: "XX604T.01", target: 10 }],
  };
  it("accepts a marks blueprint", () => {
    expect(blueprintFieldsSchema.safeParse(base).success).toBe(true);
  });
  it("percent targets must add up to 100", () => {
    const r = blueprintFieldsSchema.safeParse({
      ...base,
      unit: "PERCENT",
      targets: [
        { co: "XX604T.01", target: 60 },
        { co: "XX604T.02", target: 30 },
      ],
    });
    expect(r.error?.issues[0]?.message).toMatch(/add up to 90%/);
    expect(
      blueprintFieldsSchema.safeParse({
        ...base,
        unit: "PERCENT",
        targets: [{ co: "XX604T.01", target: 100 }],
      }).success,
    ).toBe(true);
  });
  it("refuses a CO listed twice, two tags in one row, no rows and bad groups", () => {
    const bad = [
      { ...base, targets: [base.targets[0], base.targets[0]] },
      { ...base, targets: [{ co: "XX604T.01, XX604T.02", target: 1 }] },
      { ...base, targets: [] },
      { ...base, examKind: "MIDTERM" },
      { ...base, tolerance: -1 },
    ];
    for (const b of bad) expect(blueprintFieldsSchema.safeParse(b).success).toBe(false);
  });
});
