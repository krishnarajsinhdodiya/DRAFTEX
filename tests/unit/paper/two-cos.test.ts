// Phase 15 Part A (D119-D123): a question or sub-part may carry two CO tags,
// stored as one value `A, B`. Invented codes only.
import { describe, expect, it } from "vitest";
import { coNote } from "@/lib/bank/question";
import { rowToInput } from "@/lib/bank/csv";
import { serializeKey } from "@/lib/latex/key";
import { type SerializeResult, serializePaper } from "@/lib/latex/serialize";
import { joinCoTags, splitCoTags, validCoTags } from "@/lib/paper/co-tag";
import { coTagSchema, type BlockNode, type Doc, type TemplateInput } from "@/lib/paper/schema";
import { tagSummary } from "@/lib/paper/tags";
import { p } from "../../fixtures/papers/papers";
import { pciEndSem4CreditKsv } from "../../fixtures/papers/templates";

function ok(r: SerializeResult) {
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("\n"));
  return r.tex;
}

const tpl = (showBloom: boolean): TemplateInput => {
  const t = structuredClone(pciEndSem4CreditKsv);
  t.style = { ...t.style, showBloom };
  return t;
};

const paper = (coTag: string, showBloom = false, content: BlockNode[] = [p("Q")]) =>
  ok(
    serializePaper({
      template: tpl(showBloom),
      meta: {},
      emptySlots: "OMIT",
      slots: [
        {
          groupKey: "g2",
          position: 1,
          content: { type: "doc", content },
          coTag,
          bloomLevel: "APPLY",
        },
      ],
    }),
  );

describe("stored value", () => {
  it("splits and joins", () => {
    expect(splitCoTags("XX604T.01, XX607T.02 AEC1")).toEqual(["XX604T.01", "XX607T.02 AEC1"]);
    expect(splitCoTags(null)).toEqual([]);
    expect(joinCoTags(["XX604T.01", " ", "XX604T.01", "XX604T.03"])).toBe("XX604T.01, XX604T.03");
    expect(joinCoTags(["A.01", "A.02", "A.03"])).toBe("A.01, A.02");
    expect(joinCoTags(["", null])).toBeNull();
    expect(joinCoTags(["XX604T.01", "XX604T.03"])).toBe("XX604T.01, XX604T.03");
  });
  it.each([
    ["XX604T.01", true],
    ["XX604T.01, XX604T.03", true],
    ["XX607T.01 AEC1, XX607T.03 AEC1", true],
    ["XX604T.01, XX604T.01", false],
    ["XX604T.01,XX604T.03", false],
    ["XX604T.01, XX604T.02, XX604T.03", false],
    ["XX604T.01, ", false],
    ["XX604T.01; XX604T.02", false],
  ])("%s valid: %s", (v, want) => {
    expect(validCoTags(v)).toBe(want);
    expect(coTagSchema.safeParse(v).success).toBe(want);
  });
});

describe("printing (D120)", () => {
  it("one bracket, comma, each tag kept whole", () => {
    expect(paper("XX604T.01, XX607T.03 AEC1")).toContain("[XX604T.01,~XX607T.03~AEC1]");
  });
  it("a single tag prints as before", () => {
    expect(paper("XX607T.03 AEC1")).toContain("[XX607T.03~AEC1]");
  });
  it("with Bloom on, on each sub-part line", () => {
    const tex = paper("XX604T.01, XX604T.02", true, [
      p("Stem"),
      {
        type: "subParts",
        content: [
          { type: "subPart", content: [p("a")] },
          { type: "subPart", attrs: { coTag: "XX604T.05" }, content: [p("b")] },
        ],
      },
    ]);
    expect(tex).toContain("[XX604T.01,~XX604T.02]");
    expect(tex).toContain("[XX604T.05]");
  });
  it("the key lists both", () => {
    const r = serializeKey(
      {
        template: tpl(true),
        meta: {},
        emptySlots: "OMIT",
        slots: [
          {
            groupKey: "g2",
            position: 1,
            content: { type: "doc", content: [p("Q")] },
            coTag: "XX604T.01, XX604T.03",
            bloomLevel: "APPLY",
          },
        ],
      },
      [
        {
          groupKey: "g2",
          position: 1,
          answerKey: { type: "doc", content: [p("A")] },
          keyCriteria: [],
        },
      ],
    );
    if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("\n"));
    expect(r.tex).toContain("{[}XX604T.01, XX604T.03{]}");
  });
});

describe("summary (D121: equal split)", () => {
  const doc: Doc = { type: "doc", content: [p("Q")] };
  it("splits marks and counts the question under both", () => {
    const s = tagSummary([
      { content: doc, marks: 5, coTag: "XX604T.01, XX604T.02", bloomLevel: "APPLY" },
      { content: doc, marks: 2, coTag: "XX604T.01", bloomLevel: null },
    ]);
    expect(s.items).toBe(2);
    expect(s.co).toEqual([
      { key: "XX604T.01", label: "XX604T.01", count: 2, marks: 4.5 },
      { key: "XX604T.02", label: "XX604T.02", count: 1, marks: 2.5 },
    ]);
    expect(s.bloom.find((r) => r.key === "APPLY")?.marks).toBe(5);
  });
});

describe("bank CO notes", () => {
  const course = { code: "XX604T", outcomes: [] };
  it("notes each tag that does not fit", () => {
    expect(coNote("XX604T.01, XX604T.02", course)).toBeNull();
    expect(coNote("XX604T.01, YY101T.02", course)).toMatch(/YY101T\.02/);
  });
});

describe("CSV co 2 (D123)", () => {
  const good = {
    courseCode: "xx604t",
    unit: "2",
    co: "3",
    bloom: "apply",
    marks: "5",
    type: "Short",
    question: "Q",
    answer: "A",
    tags: "",
  };
  it("joins co and co 2", () => {
    expect(rowToInput({ ...good, co2: "CO 4" }, 2).input?.coTag).toBe("XX604T.03, XX604T.04");
  });
  it("without co 2 stays one tag", () => {
    expect(rowToInput(good, 2).input?.coTag).toBe("XX604T.03");
  });
  it("refuses the same CO twice", () => {
    expect(rowToInput({ ...good, co2: "03" }, 2).errors.join()).toMatch(/same CO/);
  });
});
