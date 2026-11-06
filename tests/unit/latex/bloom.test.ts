// Phase 10 (WP-C): Bloom levels and CO tags on the printed paper and the key.
import { describe, expect, it } from "vitest";
import { serializeKey } from "@/lib/latex/key";
import { type SerializeResult, serializePaper } from "@/lib/latex/serialize";
import type { BlockNode, PaperInput, SubPartAttrs, TemplateInput } from "@/lib/paper/schema";
import { bloomKey } from "../../fixtures/papers/keys";
import { FIXTURES, bloomPaper, choices, p } from "../../fixtures/papers/papers";
import { pciEndSem4CreditKsv } from "../../fixtures/papers/templates";

function ok(r: SerializeResult) {
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.slotId ?? "-"}: ${i.message}`).join("\n"));
  return r;
}

const tpl = (f: (t: TemplateInput) => void = () => {}): TemplateInput => {
  const t = structuredClone(pciEndSem4CreditKsv);
  t.style = { ...t.style, showBloom: true };
  f(t);
  return t;
};

const one = (
  content: BlockNode[],
  slot: Partial<PaperInput["slots"][number]> = {},
  template: TemplateInput = tpl(),
): string =>
  ok(
    serializePaper({
      template,
      meta: {},
      emptySlots: "OMIT",
      slots: [{ groupKey: "g2", position: 1, content: { type: "doc", content }, ...slot }],
    }),
  ).tex;

const parts = (...ps: [string, SubPartAttrs?][]): BlockNode => ({
  type: "subParts",
  content: ps.map(([x, attrs]) => ({
    type: "subPart",
    ...(attrs ? { attrs } : {}),
    content: [p(x)],
  })),
});

describe("Bloom on the printed paper", () => {
  it("prints nothing new while the option is off, even with levels stored", () => {
    for (const make of Object.values(FIXTURES)) {
      if (make === bloomPaper) continue;
      const tex = ok(serializePaper(make())).tex;
      expect(tex).not.toContain("dxBloom");
    }
    const off = tpl((t) => void (t.style.showBloom = false));
    const tex = one([p("Define x.")], { bloomLevel: "APPLY", coTag: "BP104T.01" }, off);
    expect(tex).not.toContain("Bloom");
    expect(tex).toContain("Define x.\\dxTail{[BP104T.01]}");
  });

  it("prints (Bloom: …) right after the text, before the right-aligned CO tag", () => {
    const tex = one([p("Define x.")], { bloomLevel: "ANALYZE", coTag: "BP104T.01" });
    expect(tex).toContain("\\newcommand{\\dxBloom}[1]{\\unskip\\ \\mbox{\\footnotesize #1}}");
    expect(tex).toContain("Define x.\\dxBloom{(Bloom: Analyse)}\\dxTail{[BP104T.01]}");
  });

  it("uses the CO tag style's size, and prints Bloom alone when there is no tail", () => {
    const bold = tpl((t) => void (t.style.coTagStyle = "BOLD"));
    const tex = one([p("Define x.")], { bloomLevel: "CREATE" }, bold);
    expect(tex).toContain("\\newcommand{\\dxBloom}[1]{\\unskip\\ \\mbox{#1}}");
    expect(tex).toContain("Define x.\\dxBloom{(Bloom: Create)}\n");
  });

  it("puts the tail before choices and, with Bloom on, before sub-parts", () => {
    const mcq = one([p("Pick one."), choices(["a", "b"])], { bloomLevel: "REMEMBER" });
    expect(mcq).toMatch(/Pick one\.\\dxBloom\{\(Bloom: Remember\)\}\n\s*\\vspace/);
    const sp = one([p("Stem."), parts(["one"], ["two"])], {
      bloomLevel: "APPLY",
      coTag: "BP1.01",
    });
    expect(sp).toMatch(
      /Stem\.\\dxBloom\{\(Bloom: Apply\)\}\\dxTail\{\[BP1\.01\]\}\n\s*\\begin\{parts\}/,
    );
  });

  it("keeps the old place of the tail on sub-part questions while Bloom is off", () => {
    const off = tpl((t) => void (t.style.showBloom = false));
    const tex = one([p("Stem."), parts(["one"])], { coTag: "BP1.01" }, off);
    expect(tex).toMatch(/\\end\{parts\}\\dxTail\{\[BP1\.01\]\}/);
  });

  it("prints elective CO tags with a tie so the suffix stays with the tag (D63)", () => {
    const tex = one([p("Define x.")], { coTag: "BP607T.01 AEC1" });
    expect(tex).toContain("\\dxTail{[BP607T.01~AEC1]}");
  });

  it("prints Bloom on questions that carry their own number", () => {
    const own = tpl((t) => {
      t.structure.parts[0]!.groups[1]!.numbering = "QUESTION";
    });
    const tex = one([p("Define x.")], { bloomLevel: "APPLY", coTag: "X.01" }, own);
    expect(tex).toContain(
      "Define x.\\dxBloom{(Bloom: Apply)}\\dxTailRaw{{\\footnotesize [X.01]}\\quad \\textbf{[4]}}",
    );
  });
});

describe("sub-parts with their own values (D67)", () => {
  it("prints the tags on the question when every sub-part follows it", () => {
    const tex = one([p("Stem."), parts(["one", { bloom: "APPLY" }], ["two"])], {
      bloomLevel: "APPLY",
      coTag: "BP1.01",
    });
    expect(tex).toContain("Stem.\\dxBloom{(Bloom: Apply)}\\dxTail{[BP1.01]}");
    expect(tex).toContain("\\part one\n");
  });

  it("moves the tags to each sub-part when one differs, falling back to the question's", () => {
    const tex = one([p("Stem."), parts(["one", { bloom: "EVALUATE", coTag: "BP1.02" }], ["two"])], {
      bloomLevel: "APPLY",
      coTag: "BP1.01",
    });
    expect(tex).toContain("Stem.\\par\n");
    expect(tex).toContain("\\part one\\dxBloom{(Bloom: Evaluate)}\\dxTail{[BP1.02]}");
    expect(tex).toContain("\\part two\\dxBloom{(Bloom: Apply)}\\dxTail{[BP1.01]}");
  });

  it("ignores a differing CO when the group hides CO tags", () => {
    const hidden = tpl((t) => {
      t.structure.parts[0]!.groups[1]!.showCoTag = "NONE";
    });
    const tex = one(
      [p("Stem."), parts(["one", { coTag: "BP1.02" }], ["two"])],
      { bloomLevel: "APPLY", coTag: "BP1.01" },
      hidden,
    );
    expect(tex).toContain("Stem.\\dxBloom{(Bloom: Apply)}");
    expect(tex).not.toContain("BP1.0");
  });

  it("prints sub-part marks only with marks per question", () => {
    const attrs: SubPartAttrs = { marks: 2 };
    expect(one([p("Stem."), parts(["one", attrs], ["two", { marks: 2 }])])).not.toContain(
      "\\dxTail{[2]}",
    );
    const marks = tpl((t) => void (t.style.showMarksPerQuestion = true));
    const tex = one([p("Stem."), parts(["one", attrs], ["two", { marks: 2 }])], {}, marks);
    expect(tex).toContain("Stem.\\dxTail{[4]}");
    expect(tex).toContain("\\part one\\dxTail{[2]}");
  });

  it("refuses a malformed sub-part tag", () => {
    const r = serializePaper({
      template: tpl(),
      meta: {},
      slots: [
        {
          groupKey: "g2",
          position: 1,
          content: {
            type: "doc",
            content: [
              {
                type: "subParts",
                content: [{ type: "subPart", attrs: { coTag: "\\input{x}" }, content: [p("a")] }],
              },
            ],
          },
        },
      ],
    });
    expect(r.ok).toBe(false);
  });
});

describe("answer key with Bloom on (D68)", () => {
  it("adds a Level column to objective tables and tags to other questions", () => {
    const k = bloomKey();
    const tex = ok(serializeKey(k.paper, k.keys)).tex;
    expect(tex).toContain("\\begin{tabularx}{\\linewidth}{@{} l Y l Z @{}}");
    expect(tex).toContain("\\textbf{Level} &");
    expect(tex).toContain("& Remember & 1");
    expect(tex).toContain("\\dxKeyHead{Q.2(1) (Bloom: Remember) {[}BP104T.02{]}}");
    expect(tex).toContain("\\dxKeyHead{Q.2(4)}");
    // Sub-parts with their own tags are listed as printed.
    expect(tex).toContain(
      "\\dxKeyHead{Q.3(1) (a) (Bloom: Understand) {[}BP104T.05{]}; (b) (Bloom: Evaluate) {[}BP104T.06{]}}",
    );
  });

  it("leaves the key unchanged while the option is off", () => {
    const k = bloomKey();
    k.paper.template.style = { ...k.paper.template.style, showBloom: false } as never;
    const tex = ok(serializeKey(k.paper, k.keys)).tex;
    expect(tex).toContain("{@{} l Y Z @{}}");
    expect(tex).not.toContain("Bloom");
  });
});
