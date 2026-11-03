import { describe, expect, it } from "vitest";
import { describeChar, escapeText, mapMathUnicode } from "@/lib/latex/escape";
import {
  formatMarks,
  marksLabel,
  serializePaper,
  validateSlotContent,
  type SerializeResult,
} from "@/lib/latex/serialize";
import {
  FANCYHDR_DOCUMENT,
  PACKAGES_DOCUMENT,
  fontsDocument,
  warmUpPapers,
} from "@/lib/latex/warmup";
import type { BlockNode, PaperInput, TemplateInput } from "@/lib/paper/schema";
import { FIXTURES, md, p, referencePaper, t } from "../../fixtures/papers/papers";
import { pciEndSem4CreditKsv } from "../../fixtures/papers/templates";

function ok(r: SerializeResult) {
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.slotId ?? "-"}: ${i.message}`).join("\n"));
  return r;
}

function issues(r: SerializeResult): string {
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.issues.map((i) => `${i.slotId ?? "-"}: ${i.message}`).join("\n");
}

const paperWith = (content: BlockNode[], over: Partial<PaperInput> = {}): PaperInput => ({
  template: pciEndSem4CreditKsv,
  meta: {},
  emptySlots: "OMIT",
  slots: [{ groupKey: "g2", position: 1, content: { type: "doc", content } }],
  ...over,
});

const withTemplate = (f: (t: TemplateInput) => void): TemplateInput => {
  const copy = structuredClone(pciEndSem4CreditKsv);
  f(copy);
  return copy;
};

describe("escapeText", () => {
  it("escapes every LaTeX special character", () => {
    const r = escapeText("\\ { } $ & # ^ _ % ~ < > | ` [x]");
    expect(r).toEqual({
      ok: true,
      value:
        "\\textbackslash{} \\{ \\} \\$ \\& \\# \\textasciicircum{} \\_ \\% \\textasciitilde{} \\textless{} \\textgreater{} \\textbar{} \\textasciigrave{} {[}x{]}",
    });
  });

  it("alternates straight double quotes and keeps state across calls", () => {
    const q = { doubleOpen: false };
    expect(escapeText('say "hi', q)).toEqual({ ok: true, value: "say ``hi" });
    expect(escapeText('" now', q)).toEqual({ ok: true, value: "'' now" });
    expect(escapeText("“a” ‘b’")).toEqual({ ok: true, value: "``a'' `b'" });
  });

  it("maps every Greek letter to its own command", () => {
    const r = escapeText("ρςστ");
    expect(r).toEqual({
      ok: true,
      value: "\\ensuremath{\\rho}\\ensuremath{\\varsigma}\\ensuremath{\\sigma}\\ensuremath{\\tau}",
    });
    expect(escapeText("ο")).toEqual({ ok: true, value: "o" });
    expect(escapeText("Ω")).toEqual({ ok: true, value: "\\ensuremath{\\Omega}" });
  });

  it("maps symbols, passes accented Latin letters, and turns whitespace into spaces", () => {
    expect(escapeText("37 °C, 5 µg, a ≤ b, café, Łódź\tx\ny")).toEqual({
      ok: true,
      value: "37 \\textdegree{}C, 5 \\ensuremath{\\mu}g, a \\ensuremath{\\leq} b, café, Łódź x y",
    });
  });

  it("rejects characters it cannot print, with offsets", () => {
    expect(escapeText("a😀b\u200bc")).toEqual({
      ok: false,
      bad: [
        { char: "😀", offset: 1 },
        { char: "\u200b", offset: 4 },
      ],
    });
    expect(describeChar("😀")).toBe("😀 (U+1F600)");
    expect(describeChar("\u0007")).toBe("\u0007 (U+0007)");
  });

  it("maps Unicode inside maths", () => {
    expect(mapMathUnicode("α × β ≤ 5° − ο Ω")).toBe(
      "\\alpha  \\times  \\beta  \\leq  5^{\\circ} - ο \\Omega ",
    );
  });
});

describe("formatting helpers", () => {
  it("formats marks", () => {
    expect(formatMarks(4)).toBe("4");
    expect(formatMarks(7.5)).toBe("7.5");
    expect(formatMarks(1 / 3)).toBe("0.33");
    expect(marksLabel("MARKS_COLON", 20)).toBe("Marks: 20");
    expect(marksLabel("PARENS", 7.5)).toBe("(7.5)");
    expect(marksLabel("BRACKETS", 1)).toBe("[1]");
  });
});

describe("serializePaper: reference structure", () => {
  const r = ok(serializePaper(referencePaper()));

  it("uses one questions environment with \\dxGroupHead and \\dxQOffset", () => {
    expect(r.tex.match(/\\begin\{questions\}/g)).toHaveLength(1);
    expect(r.tex.match(/\\end\{questions\}/g)).toHaveLength(1);
    expect(r.tex.match(/^\\dxGroupHead\{/gm)).toHaveLength(3);
    expect(r.tex).toContain("\\newcount\\dxQOffset");
    expect(r.tex).toContain(
      "\\dxGroupHead{Q.1 Answer the following questions (Compulsory).}{Marks: 20}",
    );
    expect(r.tex).toContain("%% DX-GROUP id=g2 type=SHORT slots=7 attempt=5 marksEach=4");
    expect(r.tex).toContain("\\usepackage{lastpage}");
    expect(r.tex).toContain("\\firstpageheader{}{}{Exam No:\\,\\rule{2cm}{0.4pt}}");
    expect(r.tex).toContain("\\fontsize{11.7}{13.9}\\selectfont");
    expect(r.tex).toContain(
      "{\\large\\textbf{Human Anatomy, Physiology and Pathophysiology I {[}BP104T{]}}}\\par",
    );
  });

  it("records a line range per slot that starts at its DX-SLOT marker", () => {
    const lines = r.tex.split("\n");
    expect(r.slotRanges.map((s) => s.slotId)).toEqual([
      "g1.1",
      "g1.2",
      "g1.3",
      "g1.4",
      "g2.1",
      "g2.2",
      "g2.3",
      "g3.1",
      "g3.2",
      "g3.3",
    ]);
    for (const s of r.slotRanges) {
      expect(lines[s.startLine - 1]).toBe(`  %% DX-SLOT ${s.slotId}`);
      expect(s.endLine).toBeGreaterThan(s.startLine);
    }
  });

  it("keeps display maths inside its paragraph and the CO tag on the question text", () => {
    expect(r.tex).toContain(
      "  \\question Explain the Frank--Starling law of the heart. Cardiac output is given by\n  \\[ CO = HR \\times SV \\]\n  Calculate $CO$ when $HR = \\SI{72}{beats/min}$ and $SV = \\SI{70}{mL}$.\\dxTail{[BP104T.3]}",
    );
  });

  it("lists the assets it references", () => {
    expect(r.assets).toEqual([expect.stringMatching(/^assets\/[a-f0-9]{64}\.pdf$/)]);
  });

  it("is deterministic", () => {
    expect(ok(serializePaper(referencePaper())).tex).toBe(r.tex);
  });
});

describe("serializePaper: every fixture and warm-up paper", () => {
  it.each(Object.entries(FIXTURES))("%s serialises", (_, make) => {
    expect(serializePaper(make()).ok).toBe(true);
  });

  it("serialises all warm-up papers and exposes the raw warm-up documents", () => {
    for (const w of warmUpPapers()) ok(serializePaper(w));
    expect(PACKAGES_DOCUMENT).toContain("\\usepackage{tcolorbox}");
    expect(FANCYHDR_DOCUMENT).toContain("{article}");
    expect(fontsDocument()).toContain("\\fontsize{4.5}{5.40}");
  });
});

describe("serializePaper: content nodes", () => {
  const tex = (content: BlockNode[], over: Partial<PaperInput> = {}) =>
    ok(serializePaper(paperWith(content, over))).tex;

  it("puts the tail before choices and keeps choices after it", () => {
    const out = ok(
      serializePaper({
        ...paperWith([]),
        slots: [
          {
            groupKey: "g1",
            position: 1,
            coTag: "BP1.01",
            content: {
              type: "doc",
              content: [
                p("Q?"),
                {
                  type: "choices",
                  content: [{ type: "choice", content: [t("a")] }, { type: "choice" }],
                },
              ],
            },
          },
        ],
      }),
    ).tex;
    expect(out).toContain(
      "\\question Q?\\dxTail{[BP1.01]}\n  \\vspace{-0.09in}\n  \\begin{multicols}{2}",
    );
    expect(out).toContain("\\choice a \\choice ");
  });

  it("renders choices in one and four columns", () => {
    const one = tex([
      { type: "choices", attrs: { columns: 1 }, content: [{ type: "choice" }, { type: "choice" }] },
    ]);
    expect(one).not.toContain("multicols");
    const four = tex([
      { type: "choices", attrs: { columns: 4 }, content: [{ type: "choice" }, { type: "choice" }] },
    ]);
    expect(four).toContain("\\begin{multicols}{4}");
  });

  it("uses the group's objective layout as the default column count", () => {
    const t1 = withTemplate((tpl) => {
      const g = tpl.structure.parts[0]?.groups[1];
      if (g) g.objectiveLayout = "ONE_COLUMN";
    });
    const t4 = withTemplate((tpl) => {
      const g = tpl.structure.parts[0]?.groups[1];
      if (g) g.objectiveLayout = "FOUR_COLUMN";
    });
    const c: BlockNode[] = [{ type: "choices", content: [{ type: "choice" }, { type: "choice" }] }];
    expect(tex(c, { template: t1 })).not.toContain("multicols");
    expect(tex(c, { template: t4 })).toContain("{multicols}{4}");
  });

  it("renders marks, blanks, units, hard breaks, lists, sub-parts and advanced LaTeX", () => {
    const out = tex([
      p(
        t("b", "bold", "italic"),
        t("u", "underline"),
        t("2", "subscript"),
        t("3", "superscript"),
        { type: "hardBreak" },
        { type: "blank", attrs: { widthCm: 3.5 } },
        { type: "units", attrs: { value: "0,9", unit: "\\percent" } },
      ),
      {
        type: "orderedList",
        content: [{ type: "listItem", content: [p("one"), p("two")] as never }],
      },
      { type: "bulletList", content: [{ type: "listItem", content: [p("x")] as never }] },
      {
        type: "subParts",
        content: [
          {
            type: "subPart",
            content: [{ type: "advancedLatex", attrs: { latex: "[x] \\textbf{y}" } }],
          },
        ],
      },
      p(),
    ]);
    expect(out).toContain(
      "\\textit{\\textbf{b}}\\underline{u}\\textsubscript{2}\\textsuperscript{3}\\newline{}\\dxBlank[3.5cm]{}\\qty{0.9}{\\percent}",
    );
    expect(out).toContain("\\begin{enumerate}\n    \\item one\\par two\n  \\end{enumerate}");
    expect(out).toContain("\\begin{itemize}");
    expect(out).toContain("\\part {}[x] \\textbf{y}");
  });

  it("guards a question that starts with an advanced-LaTeX bracket", () => {
    expect(tex([{ type: "advancedLatex", attrs: { latex: "[2] x" } }])).toContain(
      "\\question {}[2] x",
    );
  });

  it("renders images with and without a width", () => {
    const sha = "b".repeat(64);
    const out = ok(
      serializePaper(
        paperWith([
          { type: "image", attrs: { sha256: sha, ext: "png", widthPercent: 45 } },
          { type: "image", attrs: { sha256: sha, ext: "jpg" } },
        ]),
      ),
    );
    expect(out.tex).toContain(
      `\\includegraphics[width=0.45\\linewidth,height=0.6\\textheight,keepaspectratio]{assets/${sha}.png}`,
    );
    expect(out.tex).toContain(`\\includegraphics{assets/${sha}.jpg}`);
    expect(out.assets).toEqual([`assets/${sha}.jpg`, `assets/${sha}.png`]);
  });

  it("renders tables with padding for short rows and without a header rule", () => {
    const out = tex([
      {
        type: "table",
        attrs: { headerRow: false, widthPercent: 100 },
        content: [
          {
            type: "tableRow",
            content: [{ type: "tableCell", content: [p("a") as never] }, { type: "tableCell" }],
          },
          { type: "tableRow", content: [{ type: "tableCell" }] },
        ],
      },
    ]);
    expect(out).toContain("\\begin{tabularx}{1\\linewidth}{@{}lX@{}}");
    expect(out).toContain("a & \\\\");
    expect(out).toContain(" & \\\\");
    expect(out).not.toContain("\\midrule");
  });

  it("separates paragraphs with \\par but keeps display maths tight", () => {
    expect(tex([p("a"), p("b"), md("x"), p("c")])).toContain("a\\par\n  b\n  \\[ x \\]\n  c");
  });
});

describe("serializePaper: template options", () => {
  it("omits the header row extras when nothing needs them", () => {
    const tpl = withTemplate((t) => {
      t.header.candidateField = "NONE";
      t.header.pageNumbers = "NONE";
      t.header.dateRow.style = "NONE";
      t.header.instructions = [];
      t.structure.footer = { text: "", ornament: "NONE" };
      delete t.style.body;
    });
    const out = ok(serializePaper(paperWith([p("x")], { template: tpl }))).tex;
    expect(out).toContain("\\pagestyle{empty}");
    expect(out).not.toContain("lastpage");
    expect(out).not.toContain("dxRuledLine{");
    expect(out).not.toContain("\\fontsize");
    expect(out).not.toContain("Best wishes");
  });

  it("supports page numbers without a candidate field, an underlined date row and a logo", () => {
    const sha = "c".repeat(64);
    const tpl = withTemplate((t) => {
      t.header.candidateField = "NONE";
      t.header.dateRow.style = "ULINE";
      t.header.logoLeft = { sha256: sha, ext: "png" };
      t.header.lines.push({ text: "small {{institute}}", size: "small", bold: false });
      t.header.lines.push({ text: "large plain", size: "large", bold: false });
      t.structure.parts[0]!.title = "SECTION I";
      t.structure.footer = { text: "", ornament: "ASTERISKS" };
    });
    const r = ok(
      serializePaper(paperWith([p("x")], { template: tpl, meta: { institute: "KBIPER" } })),
    );
    expect(r.tex).toContain("\\firstpageheader{}{}{}");
    expect(r.tex).toContain("\\uline{Date: ");
    expect(r.tex).toContain("\\usepackage[normalem]{ulem}");
    expect(r.tex).toContain(`\\includegraphics[width=\\linewidth]{assets/${sha}.png}`);
    expect(r.tex).toContain("\\end{minipage}\\par\n\\vspace{0.06in}\n\\par\\noindent\\uline{");
    expect(r.tex).toContain("{\\small small KBIPER}\\par");
    expect(r.tex).toContain("{\\large large plain}\\par");
    expect(r.tex).toContain("\\dxPartHead{SECTION I}");
    expect(r.tex).toContain("\\begin{center}\\texttt{**********************}\\end{center}");
    expect(r.assets).toEqual([`assets/${sha}.png`]);
  });

  it("prints marks per question and bold CO tags, and hides tags for NONE/GROUP", () => {
    const tpl = withTemplate((t) => {
      t.style.showMarksPerQuestion = true;
      t.style.coTagStyle = "BOLD";
      t.structure.parts[0]!.groups[2]!.showCoTag = "NONE";
    });
    const r = ok(
      serializePaper({
        template: tpl,
        meta: {},
        emptySlots: "OMIT",
        slots: [
          {
            groupKey: "g2",
            position: 1,
            coTag: "X.1",
            marks: 7.5,
            content: { type: "doc", content: [p("a")] },
          },
          {
            groupKey: "g3",
            position: 1,
            coTag: "X.2",
            content: { type: "doc", content: [p("b")] },
          },
        ],
      }),
    );
    expect(r.tex).toContain("\\textbf{#1}");
    expect(r.tex).toContain("a\\dxTail{[X.1]\\quad [7.5]}");
    expect(r.tex).toContain("b\\dxTail{[10]}");
    const parens = withTemplate((t) => {
      t.style.showMarksPerQuestion = true;
      t.structure.marksStyle = "PARENS";
    });
    expect(ok(serializePaper(paperWith([p("a")], { template: parens }))).tex).toContain(
      "a\\dxTail{(4)}",
    );
  });

  it("applies per-group spacing overrides, own-leading header lines and exact lengths", () => {
    const tpl = withTemplate((t) => {
      t.structure.parts[0]!.groups[1]!.spaceBefore = 0.2;
      t.structure.parts[0]!.groups[2]!.spaceAfterHead = 0.03;
      t.header.lines[2] = { text: "{{programLine}}", size: "large", bold: true, ownLeading: true };
      t.style.spacing = { beforeGroup: 0.125, afterGroupHead: -0.035 };
    });
    const out = ok(
      serializePaper(paperWith([p("x")], { template: tpl, meta: { programLine: "B.Pharm" } })),
    ).tex;
    expect(out).toContain(
      "\\newcommand{\\dxGroupHead}[2]{\\dxGroupHeadAt{0.125in}{-0.035in}{#1}{#2}}",
    );
    expect(out).toContain("\\dxGroupHead{Q.1 ");
    expect(out).toContain("\\dxGroupHeadAt{0.2in}{-0.035in}{Q.2 ");
    expect(out).toContain("\\dxGroupHeadAt{0.125in}{0.03in}{Q.3 ");
    expect(out).toContain("{\\large\\textbf{B.Pharm}\\par}");
    expect(out).toContain("\\dxKeepWithNext");
  });

  it("writes placeholders for empty slots unless told to omit them", () => {
    const r = ok(serializePaper({ ...paperWith([]), emptySlots: "PLACEHOLDER", slots: [] }));
    expect(r.tex.match(/Question not written yet/g)).toHaveLength(30);
    expect(issues(serializePaper({ ...paperWith([]), slots: [] }))).toContain(
      "-: The paper has no questions yet.",
    );
  });
});

describe("serializePaper: per-question numbering", () => {
  const numbered = withTemplate((t) => {
    const [g1, g2, g3] = t.structure.parts[0]!.groups;
    (g2 as NonNullable<typeof g2>).numbering = "QUESTION";
    (g3 as NonNullable<typeof g3>).numbering = "QUESTION";
    void g1;
  });

  it("numbers each question on from the last group number, with bold marks and no heading", () => {
    const r = ok(
      serializePaper({
        template: numbered,
        meta: {},
        emptySlots: "PLACEHOLDER",
        slots: [
          {
            groupKey: "g2",
            position: 2,
            marks: 3,
            coTag: "BP101T.02",
            content: { type: "doc", content: [p("Explain it.")] },
          },
        ],
      }),
    );
    // g1 keeps its group number (Q.1); g2 is Q.2–Q.8, g3 is Q.9–Q.11.
    expect(r.tex).toContain("\\dxGroupHead{Q.1 ");
    expect(r.tex).not.toContain("Answer the following questions (Any five)");
    expect(r.tex).toContain("\\settowidth{\\dxOwnW}{\\textbf{Q.10}}");
    expect(r.tex).toContain("\\dxOwnLabel{Q.2}");
    expect(r.tex).toContain("\\dxOwnLabel{Q.11}");
    expect(r.tex).toContain(
      "\\question Explain it.\\dxTailRaw{{\\footnotesize [BP101T.02]}\\quad \\textbf{[3]}}",
    );
    expect(r.tex).toContain(
      "\\question \\textit{(Question not written yet)}\\dxTailRaw{\\textbf{[4]}}",
    );
    // Group-numbered headings switch the label back.
    expect(r.tex).toContain(
      "\\newcommand{\\dxGroupHeadAt}[4]{\\global\\let\\dxLabel\\dxGroupLabel",
    );
  });

  it("uses the group's marks style and bold CO tags, and keeps the plain label without own numbers", () => {
    const bold = withTemplate((t) => {
      t.structure.marksStyle = "PARENS";
      t.style.coTagStyle = "BOLD";
      const g = t.structure.parts[0]!.groups[2]!;
      g.numbering = "QUESTION";
      g.spaceBefore = 0.3;
    });
    const r = ok(
      serializePaper({
        template: bold,
        meta: {},
        emptySlots: "OMIT",
        slots: [
          {
            groupKey: "g3",
            position: 1,
            coTag: "X.01",
            content: { type: "doc", content: [p("A")] },
          },
        ],
      }),
    );
    expect(r.tex).toContain("\\dxTailRaw{\\textbf{[X.01]}\\quad \\textbf{(10)}}");
    expect(r.tex).toContain("\\par\\vspace{0.3in}");
    const plain = ok(serializePaper(paperWith([p("x")])));
    expect(plain.tex).not.toContain("dxOwnLabel");
    expect(plain.tex).toContain("\\renewcommand{\\questionlabel}{\\the\\numexpr");
  });
});

describe("serializePaper: errors", () => {
  it("reports invalid data with its path", () => {
    expect(issues(serializePaper({}))).toMatch(/Invalid paper data at template/);
    expect(issues(serializePaper(null))).toMatch(/\(root\)/);
  });

  it("refuses duplicate keys, unknown groups, out-of-range and duplicate positions", () => {
    const dup = withTemplate((t) => {
      t.structure.parts[0]!.groups[1]!.key = "g1";
    });
    expect(issues(serializePaper(paperWith([p("x")], { template: dup })))).toMatch(
      /“g1” is used twice/,
    );
    const s = (groupKey: string, position: number) => ({
      groupKey,
      position,
      content: { type: "doc" as const, content: [p("x")] },
    });
    const msg = issues(
      serializePaper({ ...paperWith([]), slots: [s("zz", 1), s("g3", 4), s("g2", 1), s("g2", 1)] }),
    );
    expect(msg).toMatch(/group “zz” that is not in the template/);
    expect(msg).toMatch(/Question 4 is beyond the 3 questions/);
    expect(msg).toMatch(/Two questions share position 1/);
  });

  it("names the slot for unprintable characters and unsafe or empty LaTeX", () => {
    const msg = issues(
      serializePaper(
        paperWith([
          p("smile 😀"),
          p({ type: "mathInline", attrs: { latex: "\\input{x}" } }),
          p({ type: "mathInline", attrs: { latex: "  " } }),
          p({ type: "units", attrs: { value: "1", unit: "%" } }),
          { type: "advancedLatex", attrs: { latex: "\\def\\x{}" } },
        ]),
      ),
    );
    expect(msg).toContain(
      "g2.1: This text contains characters that cannot be printed: 😀 (U+1F600).",
    );
    expect(msg).toContain("g2.1: Equation: \\input is not allowed for safety.");
    expect(msg).toContain("g2.1: The equation is empty.");
    expect(msg).toContain("g2.1: Unit: A bare % starts a LaTeX comment");
    expect(msg).toContain("g2.1: Advanced LaTeX: \\def is not allowed for safety.");
  });

  it("reports header problems without a slot id", () => {
    const tpl = withTemplate((t) => {
      t.header.lines[0]!.text = "{{nope}} ☃";
    });
    const msg = issues(serializePaper(paperWith([p("x")], { template: tpl })));
    expect(msg).toContain("-: Unknown placeholder {{nope}} in the header.");
    expect(msg).toContain("-: This text contains characters that cannot be printed: ☃ (U+2603).");
  });
});

describe("validateSlotContent", () => {
  it("validates shape and content of one slot", () => {
    expect(validateSlotContent({ type: "doc", content: [p("fine")] })).toEqual([]);
    expect(validateSlotContent({ type: "doc", content: [p("☃")] })[0]?.message).toMatch(
      /cannot be printed/,
    );
    expect(validateSlotContent({ type: "nope" }).length).toBeGreaterThan(0);
  });
});

describe("serializePaper: question details found by the editor fuzz", () => {
  const sub = (...texts: string[]): BlockNode => ({
    type: "subParts",
    content: texts.map((x) => ({ type: "subPart", content: [p(x)] })),
  });

  it("drops line breaks that would end no line", () => {
    const r = ok(
      serializePaper(
        paperWith([
          {
            type: "paragraph",
            content: [
              { type: "hardBreak" },
              { type: "text", text: "a" },
              { type: "hardBreak" },
              { type: "hardBreak" },
              { type: "text", text: "b" },
              { type: "hardBreak" },
            ],
          },
        ]),
      ),
    );
    expect(r.tex).toContain("\\question a\\newline{}b\n");
  });

  it("letters a second sub-parts list on from the first and fills one-column tables", () => {
    const r = ok(serializePaper(paperWith([sub("x", "y"), p("between"), sub("z")])));
    expect(r.tex).toContain("\\begin{parts}\n  \\setcounter{partno}{2}\n    \\part z");
    const t = ok(
      serializePaper(
        paperWith([
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "only" }] }],
                  },
                ],
              },
            ],
          },
        ]),
      ),
    );
    expect(t.tex).toContain("{@{}X@{}}");
    expect(t.tex).toMatch(/^\\RequirePackage\{fix-cm\}$/m);
  });
});
