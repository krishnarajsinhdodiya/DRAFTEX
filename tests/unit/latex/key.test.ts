import { describe, expect, it } from "vitest";
import { KEY_TITLE, groupMarksText, serializeKey } from "@/lib/latex/key";
import type { SerializeResult } from "@/lib/latex/serialize";
import type { Doc } from "@/lib/paper/schema";
import { KEY_FIXTURES, legacyKey, ownNumbersKey, referenceKey } from "../../fixtures/papers/keys";
import { p, referencePaper } from "../../fixtures/papers/papers";

function ok(r: SerializeResult) {
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("\n"));
  return r;
}

const doc = (...content: Doc["content"]): Doc => ({ type: "doc", content });

describe("groupMarksText", () => {
  it("prints the group's marks the way the hand-written keys do", () => {
    expect(groupMarksText({ slots: 10, attempt: 10, marksEach: 1 })).toBe(
      "(10 $\\times$ 1 = 10 Marks)",
    );
    expect(groupMarksText({ slots: 5, attempt: 4, marksEach: 7.5 })).toBe(
      "(Any 4 $\\times$ 7.5 = 30 Marks)",
    );
    expect(groupMarksText({ slots: 1, attempt: 1, marksEach: 10 })).toBe("(10 Marks)");
  });
});

describe("serializeKey", () => {
  it("is deterministic and follows the house layout", () => {
    const f = referenceKey();
    const a = ok(serializeKey(f.paper, f.keys));
    const b = ok(serializeKey(f.paper, f.keys));
    expect(a.tex).toBe(b.tex);
    expect(a.tex).toContain("\\documentclass[12pt, a4paper]{article}");
    expect(a.tex).toContain("\\usepackage{fancyhdr}");
    expect(a.tex).toContain(KEY_TITLE);
    expect(a.tex).toContain("\\textbf{No.} & \\textbf{Answer} & \\textbf{Marks}");
    expect(a.tex).toContain("\\textbf{B.} Nephron");
    expect(a.tex).toContain("\\textbf{Criteria} & \\textbf{Marks}");
    expect(a.tex).toContain("\\textbf{Total} & \\textbf{4}");
    // Sub-parts in an article are enumerate lists, not exam.cls parts.
    expect(a.tex).toContain("\\begin{enumerate}[label=(\\alph*), start=1]");
    expect(a.tex).not.toContain("\\begin{parts}");
    // Question text is never reprinted.
    expect(a.tex).not.toContain("functional unit of the kidney");
    expect(a.assets).toHaveLength(1);
    expect(a.slotRanges.map((r) => r.slotId)).toContain("g2.1");
  });

  it("uses the code alone in the running head when the title is long", () => {
    const f = referenceKey();
    expect(ok(serializeKey(f.paper, f.keys)).tex).toContain(
      "\\fancyhead[R]{\\small \\textbf{BP104T}}",
    );
    const short = { ...f.paper, meta: { ...f.paper.meta, courseTitle: "Short Title" } };
    expect(ok(serializeKey(short, f.keys)).tex).toContain(
      "\\fancyhead[R]{\\small \\textbf{BP104T: Short Title}}",
    );
    const none = { ...f.paper, meta: { ...f.paper.meta, courseCode: "", courseTitle: "" } };
    const tex = ok(serializeKey(none, f.keys)).tex;
    expect(tex).toContain("\\fancyhead[R]{\\small \\textbf{}}");
    expect(tex).not.toContain("[BP104T]");
  });

  it("prints parts and leaves out empty questions and groups", () => {
    const f = legacyKey();
    const tex = ok(serializeKey(f.paper, f.keys)).tex;
    expect(tex).toContain("\\dxKeyPart{SECTION I}");
    expect(tex).toContain("\\dxKeyPart{SECTION II}");
    const only = { ...f.paper, slots: f.paper.slots.filter((s) => s.groupKey === "s1long") };
    const one = ok(serializeKey(only, f.keys)).tex;
    expect(one).toContain("\\dxKeyPart{SECTION I}");
    expect(one).not.toContain("SECTION II");
    expect(one).not.toContain("DX-GROUP id=s1obj");
  });

  it("numbers each question on its own when the group does", () => {
    const f = ownNumbersKey();
    const tex = ok(serializeKey(f.paper, f.keys)).tex;
    expect(tex).not.toContain("\\textbf{No.}");
    expect(tex).toContain("\\dxKeyHead{Q.1}{(1 Mark)}");
    expect(tex).toContain("Answer: \\textbf{B.} Nephron\\par");
  });

  it("letters the answers of several choices blocks and says when none is set", () => {
    const paper = referencePaper();
    paper.slots = [
      {
        groupKey: "g1",
        position: 1,
        content: doc(
          p("Two MCQs."),
          {
            type: "choices",
            attrs: { correct: 0 },
            content: [
              { type: "choice", content: [{ type: "text", text: "Yes" }] },
              { type: "choice", content: [{ type: "text", text: "No" }] },
            ],
          },
          {
            type: "subParts",
            content: [
              {
                type: "subPart",
                content: [
                  {
                    type: "choices",
                    attrs: { correct: 1 },
                    content: [
                      { type: "choice", content: [{ type: "text", text: "Up" }] },
                      { type: "choice", content: [{ type: "text", text: "Down" }] },
                    ],
                  },
                ],
              },
            ],
          },
        ),
      },
      { groupKey: "g1", position: 2, content: doc(p("No answer here.")) },
      { groupKey: "g2", position: 1, content: doc(p("Long answer.")) },
    ];
    const tex = ok(serializeKey(paper, [])).tex;
    expect(tex).toContain("(a) \\textbf{A.} Yes; (b) \\textbf{B.} Down");
    expect(tex).toContain("\\textit{No answer written.}");
    expect(tex).toContain("\\textit{No model answer written.}");
  });

  it("rejects invalid data, an empty paper and unprintable text", () => {
    expect(serializeKey({}, []).ok).toBe(false);
    const f = referenceKey();
    expect(serializeKey(f.paper, [{ groupKey: "g1" }]).ok).toBe(false);
    const empty = { ...f.paper, slots: [] };
    const r = serializeKey(empty, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toMatch(/no questions yet/);
    const bad = serializeKey(f.paper, [
      { groupKey: "g2", position: 1, answerKey: doc(p("smile 😀")), keyCriteria: [] },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.issues[0]?.slotId).toBe("g2.1");
  });

  it("every key fixture serializes", () => {
    for (const make of Object.values(KEY_FIXTURES)) {
      const f = make();
      expect(serializeKey(f.paper, f.keys).ok).toBe(true);
    }
  });
});
