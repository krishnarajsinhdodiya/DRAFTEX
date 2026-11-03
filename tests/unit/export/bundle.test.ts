import { describe, expect, it } from "vitest";
import { bundleSegments, compactForExport, localDate, readme, safeName } from "@/lib/export/bundle";
import { serializePaper } from "@/lib/latex/serialize";
import { legacyKey, referenceKey } from "../../fixtures/papers/keys";

describe("compactForExport", () => {
  it("leaves out empty questions and renumbers the rest without gaps", () => {
    const f = referenceKey();
    // Empty g2.1 and all of g3: Q.2 keeps (2),(3) as (1),(2); Q.3 disappears.
    const paper = {
      ...f.paper,
      slots: f.paper.slots
        .filter((s) => s.groupKey !== "g3")
        .map((s) =>
          s.groupKey === "g2" && s.position === 1
            ? { ...s, content: { type: "doc" as const, content: [] } }
            : s,
        ),
    };
    const c = compactForExport(paper, f.keys);
    const groups = c.paper.template.structure.parts.flatMap((p) => p.groups);
    expect(groups.map((g) => [g.key, g.slots])).toEqual([
      ["g1", 4],
      ["g2", 2],
    ]);
    // Q.1: 16 of 20 empty; Q.2: 5 of 7 (one emptied above); Q.3: all 3.
    expect(c.leftOut).toBe(16 + 5 + 3);
    expect(c.paper.slots.filter((s) => s.groupKey === "g2").map((s) => s.position)).toEqual([1, 2]);
    expect(c.keys.find((k) => k.groupKey === "g2" && k.position === 1)?.keyCriteria[0]?.text).toBe(
      "Statement of the law",
    );
    expect(c.keys.some((k) => k.groupKey === "g3")).toBe(false);
    expect(c.origin.get("g2.1")).toBe("g2.2");
    expect(c.paper.emptySlots).toBe("OMIT");
    const ser = serializePaper(c.paper);
    expect(ser.ok).toBe(true);
    if (ser.ok) expect(ser.tex).not.toContain("Question not written yet");
  });

  it("drops a part with no questions left", () => {
    const f = legacyKey();
    const paper = { ...f.paper, slots: f.paper.slots.filter((s) => s.groupKey.startsWith("s1")) };
    const c = compactForExport(paper, f.keys);
    expect(c.paper.template.structure.parts.map((p) => p.title)).toEqual(["SECTION I"]);
  });
});

describe("safe names", () => {
  it("make names every OS accepts", () => {
    expect(safeName('Q: "A/B" <test>? *', "x")).toBe("Q- -A-B- -test-- -");
    expect(safeName("  Trailing dots...  ", "x")).toBe("Trailing dots");
    expect(safeName("con", "x")).toBe("_con");
    expect(safeName("LPT1.txt", "x")).toBe("_LPT1.txt");
    expect(safeName("///", "fallback")).toBe("fallback");
    expect(safeName("", "fallback")).toBe("fallback");
    expect(safeName("a\u0001b\tc  d", "x")).toBe("a-b-c d");
    expect(safeName("x".repeat(100), "x")).toHaveLength(60);
    // A cut lands on a word boundary when that keeps most of the name.
    expect(safeName("Pharmacognosy ".repeat(10), "x", 20)).toBe("Pharmacognosy");
    expect(
      safeName("Pharmaceutical Organic Chemistry II End-Semester Supplementary", "x", 60),
    ).toBe("Pharmaceutical Organic Chemistry II End-Semester");
    expect(safeName("A Pharmacokineticsandbiopharmaceutics", "x", 20)).toBe("A Pharmacokineticsan");
  });

  it("build exports/<Program>/<CourseCode>/<date> <title>", () => {
    const d = new Date(2026, 10, 4, 23, 30);
    expect(localDate(d)).toBe("2026-11-04");
    expect(
      bundleSegments({
        programLabel: "B.Pharm",
        courseCode: "BP607T AEC1",
        title: "End-sem: ATKT",
        date: d,
      }),
    ).toEqual(["B.Pharm", "BP607T AEC1", "2026-11-04 End-sem- ATKT"]);
    expect(bundleSegments({ programLabel: "B.Pharm", courseCode: "", title: "", date: d })).toEqual(
      ["B.Pharm", "No course code", "2026-11-04 Untitled paper"],
    );
  });

  it("explain the folder in the readme", () => {
    const r = readme({ title: "Test", withKey: true, leftOut: 2 });
    expect(r).toContain("key.pdf");
    expect(r).toContain("2 empty questions were left out");
    expect(r).toContain("CONFIDENTIAL");
    expect(r).toContain("tectonic paper.tex");
    const one = readme({ title: "Test", withKey: false, leftOut: 1 });
    expect(one).toContain("1 empty question was left out");
    expect(one).not.toContain("key.tex");
    expect(readme({ title: "T", withKey: true, leftOut: 0 })).not.toContain("left out");
  });
});
