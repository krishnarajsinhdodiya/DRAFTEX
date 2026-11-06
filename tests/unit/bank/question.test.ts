// Bank rules (Phase 11): fields, catalogue CO check (D72 amended, D77),
// plain text and the duplicate key's normalisation (D76). Invented text only.
import { describe, expect, it } from "vitest";
import {
  bankFieldsSchema,
  bankProblems,
  coProblem,
  courseCodeSchema,
  courseCoTags,
  dupSource,
  isEmptyDoc,
  normaliseText,
  plainText,
  subPartCoTags,
  unprintableChars,
} from "@/lib/bank/question";
import type { Doc } from "@/lib/paper/schema";

const para = (text: string) => ({
  type: "paragraph" as const,
  content: [{ type: "text" as const, text }],
});
const doc = (...content: Doc["content"]): Doc => ({ type: "doc", content });

const catalogue = {
  code: "XX604T",
  outcomes: [{ number: 1 }, { number: 2 }],
  units: [{ number: 1 }],
};
const elective = { code: "XX607T AEC1", outcomes: [{ number: 1 }], units: [] };
const typed = { code: "MPH101T", outcomes: [], units: [] };

describe("course codes", () => {
  it("upper-cases and folds spaces", () => {
    expect(courseCodeSchema.parse("  xx607t   aec1 ")).toBe("XX607T AEC1");
  });
  it.each(["", "BP 604T X", "BP604T;", "A".repeat(21)])("refuses %j", (raw) => {
    expect(courseCodeSchema.safeParse(raw).success).toBe(false);
  });
});

describe("CO check", () => {
  it("lists a catalogue course's tags, elective suffix after the number (D63)", () => {
    expect(courseCoTags(catalogue)).toEqual(["XX604T.01", "XX604T.02"]);
    expect(courseCoTags(elective)).toEqual(["XX607T.01 AEC1"]);
  });
  it("accepts only the catalogue's COs when there is a list", () => {
    expect(coProblem("XX604T.02", catalogue)).toBeNull();
    expect(coProblem("XX604T.03", catalogue)).toMatch(/not a CO of XX604T/);
    expect(coProblem("XX607T.01 AEC1", elective)).toBeNull();
    expect(coProblem("XX607TAEC1.01", elective)).toMatch(/not a CO/);
  });
  it("checks only the shape for a course without a list (D72 amended)", () => {
    expect(coProblem("MPH101T.07", typed)).toBeNull();
    expect(coProblem("MPH101T.7", typed)).toMatch(/MPH101T\.01/);
    expect(coProblem("BP604T.01", typed)).toMatch(/does not belong to MPH101T/);
    expect(coProblem("YY1.01 AEC2", { code: "YY1 AEC2", outcomes: [] })).toBeNull();
  });
});

describe("bankProblems", () => {
  const base = {
    coTag: "XX604T.01",
    unit: null,
    content: doc(para("Define a term.")),
    answerKey: null,
  };

  it("passes a good question", () => {
    expect(bankProblems(base, catalogue)).toEqual([]);
  });
  it("checks sub-part COs, units, empty text and unprintable characters", () => {
    const content = doc(para("Explain 😀."), {
      type: "subParts",
      content: [
        { type: "subPart", attrs: { coTag: "XX604T.09" }, content: [para("a")] },
        { type: "subPart", attrs: { coTag: "XX604T.09" }, content: [para("b")] },
      ],
    });
    const p = bankProblems({ ...base, unit: 4, content }, catalogue);
    expect(p).toEqual([
      "Sub-part: CO XX604T.09 is not a CO of XX604T.",
      "XX604T has no unit 4.",
      expect.stringMatching(/cannot be printed: 😀 \(U\+1F600\)/),
    ]);
    expect(bankProblems({ ...base, content: doc(para(" ")) }, catalogue)).toContain(
      "The question is empty.",
    );
  });
  it("allows any unit for a course with no unit list", () => {
    expect(bankProblems({ ...base, coTag: "MPH101T.01", unit: 7 }, typed)).toEqual([]);
  });
  it("checks the answer key's characters too", () => {
    expect(bankProblems({ ...base, answerKey: doc(para("ok \u0007")) }, catalogue)[0]).toMatch(
      /U\+0007/,
    );
  });
});

describe("fields", () => {
  it("needs Bloom and a well-formed CO; tags are deduplicated", () => {
    const ok = bankFieldsSchema.parse({
      courseCode: "xx604t",
      coTag: "XX604T.01",
      bloomLevel: "APPLY",
      marks: 2,
      type: "SHORT",
      content: doc(para("x")),
      tags: ["a", "a", "b c"],
    });
    expect(ok).toMatchObject({ courseId: null, courseCode: "XX604T", tags: ["a", "b c"] });
    expect(bankFieldsSchema.safeParse({ ...ok, bloomLevel: undefined }).success).toBe(false);
    expect(bankFieldsSchema.safeParse({ ...ok, coTag: "XX604T.01;" }).success).toBe(false);
    expect(bankFieldsSchema.safeParse({ ...ok, tags: ["$x"] }).success).toBe(false);
    expect(
      bankFieldsSchema.safeParse({
        ...ok,
        tags: Array(11)
          .fill("t")
          .map((t, i) => t + i),
      }).success,
    ).toBe(false);
  });
});

describe("plain text and duplicate key (D76)", () => {
  const rich = doc(
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Calculate  the ", marks: [{ type: "bold" }] },
        { type: "mathInline", attrs: { latex: "x^2" } },
        { type: "hardBreak" },
        { type: "blank" },
        { type: "units", attrs: { value: "5", unit: "mg" } },
      ],
    },
    { type: "mathDisplay", attrs: { latex: "a+b" } },
    { type: "advancedLatex", attrs: { latex: "\\relax" } },
    { type: "image", attrs: { sha256: "b".repeat(64), ext: "png" } },
    {
      type: "choices",
      content: [
        { type: "choice", content: [{ type: "text", text: "One" }] },
        { type: "choice", content: [{ type: "text", text: "Two" }] },
      ],
    },
    {
      type: "table",
      content: [{ type: "tableRow", content: [{ type: "tableCell", content: [para("cell")] }] }],
    },
  );

  it("reads every kind of block", () => {
    expect(plainText(rich)).toBe("Calculate the $x^2$ ____ 5 mg\n$$a+b$$\n\\relax\nOne\nTwo\ncell");
  });
  it("ignores case, Unicode form, spaces and formatting, keeps punctuation", () => {
    const a = doc(para("Define  pKa of Na+ ions."));
    const b = doc({
      type: "paragraph",
      content: [{ type: "text", text: "define pka of na+ IONS.", marks: [{ type: "italic" }] }],
    });
    expect(dupSource(a)).toBe(dupSource(b));
    expect(dupSource(doc(para("Na+ ions")))).not.toBe(dupSource(doc(para("Na ions"))));
    expect(normaliseText("ﬁ  Ｘ")).toBe("fi x");
  });
  it("counts pictures, so two picture-only questions differ", () => {
    const pic = (c: string) => doc({ type: "image", attrs: { sha256: c.repeat(64), ext: "png" } });
    expect(isEmptyDoc(pic("a"))).toBe(false);
    expect(dupSource(pic("a"))).not.toBe(dupSource(pic("c")));
    expect(isEmptyDoc(doc())).toBe(true);
  });
  it("finds sub-part tags and unprintable unit text", () => {
    expect(subPartCoTags(doc())).toEqual([]);
    expect(
      unprintableChars(
        doc({ type: "paragraph", content: [{ type: "units", attrs: { value: "1", unit: "😀" } }] }),
      ),
    ).toEqual(["😀 (U+1F600)"]);
  });
});
