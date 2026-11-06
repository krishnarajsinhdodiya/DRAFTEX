// Phase 10: CO tag format (D63), sub-part marks, missing tags and the summary (D69).
import { describe, expect, it } from "vitest";
import { BLOOM_LABEL, BLOOM_LEVELS, bloomPrinted } from "@/lib/paper/bloom";
import { CO_TAG_RE, cleanCoTagInput, coTag } from "@/lib/paper/co-tag";
import type { Doc, SubPartAttrs } from "@/lib/paper/schema";
import { missingTags, subPartMarksNote, tagSummary } from "@/lib/paper/tags";
import { BloomLevel } from "@/generated/prisma/enums";

const para = (x: string) => ({
  type: "paragraph" as const,
  content: [{ type: "text" as const, text: x }],
});
const doc = (...parts: SubPartAttrs[]): Doc => ({
  type: "doc",
  content: [
    para("Stem"),
    ...(parts.length
      ? [
          {
            type: "subParts" as const,
            content: parts.map((attrs) => ({
              type: "subPart" as const,
              attrs,
              content: [para("x")],
            })),
          },
        ]
      : []),
  ],
});

describe("CO tags (D63)", () => {
  it("formats plain and elective codes", () => {
    expect(coTag("BP604T", 1)).toBe("BP604T.01");
    expect(coTag("BP607T AEC1", 3)).toBe("BP607T.03 AEC1");
    expect(coTag(" BP212P  SEC1 ", 10)).toBe("BP212P.10 SEC1");
  });

  it("accepts old and new tags and refuses anything else", () => {
    for (const ok of ["BP604T.01", "BP607TAEC1.01", "BP607T.01 AEC1", "X.1"]) {
      expect(CO_TAG_RE.test(ok), ok).toBe(true);
    }
    for (const bad of [
      "",
      "BP607T.01  AEC1",
      " BP1.01",
      "BP1.01 ",
      "a b c",
      "BP1\\x",
      "BP1.01 A.1",
    ]) {
      expect(CO_TAG_RE.test(bad), bad).toBe(false);
    }
  });

  it("cleans typed tags to one space before the suffix", () => {
    expect(cleanCoTagInput("  BP607T.01 AEC1")).toBe("BP607T.01 AEC1");
    expect(cleanCoTagInput("BP607T.01 ")).toBe("BP607T.01 ");
    expect(cleanCoTagInput("BP607T.01 A E.C1")).toBe("BP607T.01 AEC1");
    expect(cleanCoTagInput("BP{604}T.01")).toBe("BP604T.01");
    expect(cleanCoTagInput("x".repeat(30))).toHaveLength(20);
  });
});

describe("Bloom labels", () => {
  it("names every stored level once, with British spelling", () => {
    expect([...BLOOM_LEVELS].sort()).toEqual(Object.values(BloomLevel).sort());
    expect(BLOOM_LABEL.ANALYZE).toBe("Analyse");
    expect(bloomPrinted("REMEMBER")).toBe("(Bloom: Remember)");
  });
});

describe("sub-part marks note", () => {
  it("says nothing without sub-part marks or when they add up", () => {
    expect(subPartMarksNote(doc(), 10)).toBeNull();
    expect(subPartMarksNote(doc({}, {}), 10)).toBeNull();
    expect(subPartMarksNote(doc({ marks: 6 }, { marks: 4 }), 10)).toBeNull();
    expect(subPartMarksNote(doc({ marks: 3.5 }, { marks: 4 }), 7.5)).toBeNull();
  });

  it("warns when they do not add up or some are missing", () => {
    expect(subPartMarksNote(doc({ marks: 6 }, { marks: 5 }), 10)).toBe(
      "The sub-part marks add up to 11, but the question is worth 10.",
    );
    expect(subPartMarksNote(doc({ marks: 10 }, {}), 10)).toBe(
      "The sub-part marks add up to 10 (1 sub-part has no marks), but the question is worth 10.",
    );
  });
});

describe("missing tags", () => {
  const q = (content: Doc, bloomLevel: "APPLY" | null, coTag: string | null) => ({
    content,
    marks: 10,
    bloomLevel,
    coTag,
  });
  it("checks the question, or each sub-part with the question's values as fallback", () => {
    expect(missingTags(q(doc(), null, null))).toEqual({ bloom: true, co: true });
    expect(missingTags(q(doc(), "APPLY", "X.01"))).toEqual({ bloom: false, co: false });
    expect(missingTags(q(doc({ bloom: "APPLY", coTag: "X.01" }, {}), null, null))).toEqual({
      bloom: true,
      co: true,
    });
    expect(
      missingTags(
        q(doc({ bloom: "APPLY", coTag: "X.01" }, { bloom: "CREATE", coTag: "X.02" }), null, null),
      ),
    ).toEqual({ bloom: false, co: false });
  });
});

describe("Bloom and CO summary (D69)", () => {
  it("counts every written question, splits by sub-part marks only when they add up", () => {
    const s = tagSummary([
      { content: doc(), marks: 4, bloomLevel: "APPLY", coTag: "BP1.02" },
      { content: doc(), marks: 4, bloomLevel: null, coTag: null },
      { content: { type: "doc", content: [] }, marks: 4, bloomLevel: "CREATE", coTag: "X" },
      {
        content: doc({ marks: 6, bloom: "REMEMBER" }, { marks: 4, coTag: "BP1.10" }),
        marks: 10,
        bloomLevel: "APPLY",
        coTag: "BP1.02",
      },
      {
        content: doc({ marks: 6, bloom: "REMEMBER" }, { marks: 5 }),
        marks: 10,
        bloomLevel: "EVALUATE",
        coTag: "BP1.03",
      },
    ]);
    expect(s.items).toBe(5);
    expect(s.bloom).toEqual([
      { key: "REMEMBER", label: "Remember", count: 1, marks: 6 },
      { key: "APPLY", label: "Apply", count: 2, marks: 8 },
      { key: "EVALUATE", label: "Evaluate", count: 1, marks: 10 },
      { key: "", label: "No level", count: 1, marks: 4 },
    ]);
    expect(s.co.map((r) => [r.label, r.count, r.marks])).toEqual([
      ["BP1.02", 2, 10],
      ["BP1.03", 1, 10],
      ["BP1.10", 1, 4],
      ["No CO", 1, 4],
    ]);
  });

  it("is empty for an empty paper", () => {
    expect(tagSummary([])).toEqual({ bloom: [], co: [], items: 0 });
  });
});

describe("hostile CO tag input (gate 6)", () => {
  it("never lets a LaTeX special through, typed or sent", () => {
    let seed = 20261106;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const ALPHABET = "AB09. \\{}$&#^_%~[]\n\t\u00a0é😀\\input\\csname^^5c";
    for (let i = 0; i < 1000; i++) {
      const raw = Array.from(
        { length: 1 + Math.floor(rand() * 40) },
        () => ALPHABET[Math.floor(rand() * ALPHABET.length)],
      ).join("");
      const typed = cleanCoTagInput(raw);
      expect(typed).toMatch(/^[A-Za-z0-9.]*(?: [A-Za-z0-9]*)?$/);
      const trimmed = typed.trim();
      if (trimmed) expect(CO_TAG_RE.test(trimmed), JSON.stringify(trimmed)).toBe(true);
      if (CO_TAG_RE.test(raw)) expect(raw).toMatch(/^[A-Za-z0-9. ]+$/);
    }
  });
});
