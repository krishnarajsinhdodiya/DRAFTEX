// Package warm-up (SPEC §9): compile documents that touch every package,
// class size, font and content type the generator can emit, so the Tectonic
// cache holds every file and later compiles work offline.
import type { PaperInput, TemplateInput } from "../paper/schema.ts";

/** Loads every package SPEC §9 lists, including ones only Advanced users reach. */
export const PACKAGES_DOCUMENT = String.raw`\documentclass[11pt, a4paper]{exam}
\usepackage{geometry}
\usepackage{graphicx}
\usepackage{multicol}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{siunitx}
\usepackage{booktabs}
\usepackage{tabularx}
\usepackage{array}
\usepackage{enumitem}
\usepackage{lastpage}
\usepackage[normalem]{ulem}
\usepackage{xcolor}
\usepackage{tikz}
\usepackage{tcolorbox}
\begin{document}
\uline{Warm-up} \textcolor{gray}{text}
\begin{tcolorbox}Box\end{tcolorbox}
\tikz\draw (0,0) -- (1,1);
\begin{enumerate}[label=(\alph*)]\item a\end{enumerate}
\begin{tabular}{>{\bfseries}l}x\\\end{tabular}
\end{document}
`;

const sizes = [10, 11, 12] as const;

function warmTemplate(classSize: 10 | 11 | 12, uline: boolean): TemplateInput {
  return {
    structure: {
      numbering: { prefix: "Q.", separator: "" },
      marksStyle: "MARKS_COLON",
      parts: [
        {
          key: "p1",
          title: "SECTION I",
          groups: [
            {
              key: "g1",
              type: "OBJECTIVE",
              heading: "Warm-up.",
              slots: 3,
              attempt: 3,
              marksEach: 1,
            },
            { key: "g2", type: "LONG", heading: "Warm-up.", slots: 1, attempt: 1, marksEach: 7.5 },
          ],
        },
      ],
      footer: { text: "Best wishes", ornament: "ASTERISKS" },
    },
    header: {
      lines: [
        { text: "{{university}}", size: "large", bold: true },
        { text: "{{examTitle}}", size: "small", bold: true },
        { text: "{{programLine}}", size: "normal", bold: false },
      ],
      dateRow: { style: uline ? "ULINE" : "RULE", left: "{{date}}", centre: "x", right: "y" },
      candidateField: "EXAM_NO",
      instructions: ["Warm-up instruction."],
      pageNumbers: "X_OF_Y",
    },
    style: {
      classSize,
      body: { size: 11.7, leading: 13.9 },
      geometry: { left: 1, top: 0.9, width: 6.2, height: 9.7 },
      showMarksPerQuestion: true,
      coTagStyle: classSize === 11 ? "BOLD" : "FOOTNOTE",
    },
  };
}

/**
 * Fonts are fetched per design size: walk every size from 4.5 pt to 25 pt in
 * every family, series and shape, with text, script and bold maths, so the
 * cache holds every Latin Modern and CM maths font file the generator can hit.
 */
export function fontsDocument(): string {
  const sizes: number[] = [];
  for (let s = 4.5; s <= 25; s += 0.5) sizes.push(s);
  sizes.push(10.95, 11.7, 11.9, 13.9, 14.4, 17.28, 20.74, 24.88);
  const sample = ["\\rmfamily", "\\sffamily", "\\ttfamily"].flatMap((fam) =>
    ["\\mdseries", "\\bfseries"].flatMap((ser) =>
      ["\\upshape", "\\itshape", "\\slshape", "\\scshape"].map((sh) => `{${fam}${ser}${sh} Ag}`),
    ),
  );
  const math =
    "$x^{y^{z}}_{i} \\alpha\\sum\\int\\prod\\sqrt{x}\\left(\\frac{a}{b}\\right)\\leq\\mathbf{v}\\mathrm{d}\\mathsf{s}\\mathtt{t}\\mathit{i}\\mathcal{L}\\mathbb{R}\\boldsymbol{\\alpha x}\\leqslant\\checkmark$" +
    "\\[\\sum_{i=1}^{n}\\int_0^1 \\Bigl(\\frac{1}{x}\\Bigr) \\biggl[\\prod\\biggr]\\]";
  const body = sizes
    .map(
      (s) =>
        `\\fontsize{${s}}{${(s * 1.2).toFixed(2)}}\\selectfont ${sample.join(" ")} ${math}\\par`,
    )
    .join("\n");
  return `\\documentclass[11pt, a4paper]{exam}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{siunitx}
\\begin{document}
\\raggedright
${body}
\\end{document}
`;
}

/**
 * fancyhdr clashes with exam.cls in this bundle ("\\lhead already defined"),
 * so it is warmed in an article document. The generator uses exam's own
 * header commands instead.
 */
export const FANCYHDR_DOCUMENT = String.raw`\documentclass{article}
\usepackage{fancyhdr}
\usepackage{lastpage}
\pagestyle{fancy}
\fancyhf{}
\fancyfoot[C]{\thepage/\pageref{LastPage}}
\begin{document}
Warm-up.
\end{document}
`;

/** Every inline and block type, all marks, mapped symbols and maths fonts. */
function warmSlots(): PaperInput["slots"] {
  const t = (text: string) => ({ type: "text" as const, text });
  const para = (
    ...content: Array<
      { type: "text"; text: string } | { type: "mathInline"; attrs: { latex: string } }
    >
  ) => ({
    type: "paragraph" as const,
    content,
  });
  const math = (latex: string) => ({ type: "mathInline" as const, attrs: { latex } });
  return [
    {
      groupKey: "g1",
      position: 1,
      coTag: "BP000T.01",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Bold", marks: [{ type: "bold" }] },
              { type: "text", text: " italic", marks: [{ type: "italic" }] },
              { type: "text", text: " both", marks: [{ type: "bold" }, { type: "italic" }] },
              { type: "text", text: "u", marks: [{ type: "underline" }] },
              { type: "text", text: "2", marks: [{ type: "subscript" }] },
              { type: "text", text: "3", marks: [{ type: "superscript" }] },
              t(
                " °µ±×÷·→←↔⇌⇒↑↓≤≥≠≈≡∞√∆′−–—‐…•‘’“”©®™§¶½¼¾²³¹₂₃₄Å₹ αβγδεζηθικλμνξοπρςστυφχψω ΓΔΘΛΞΠΣΥΦΨΩ àéîõüçñ ĀĞŁŒš",
              ),
              t(" \\{}$&#^_%~<>|[]` \"q\" 'q'"),
              { type: "blank" },
              { type: "units", attrs: { value: "2.5", unit: "\\milli\\gram\\per\\litre" } },
            ],
          },
          {
            type: "choices",
            content: ["a", "b", "c", "d"].map((x) => ({ type: "choice", content: [t(x)] })),
          },
        ],
      },
    },
    {
      groupKey: "g1",
      position: 2,
      content: {
        type: "doc",
        content: [
          para(
            math(
              "\\alpha\\beta\\Gamma \\frac{a}{b} \\dfrac{1}{2} \\sqrt[3]{x} \\sum_{i=1}^{n} \\int_0^\\infty \\prod \\lim_{x\\to 0} \\leq\\geq\\neq\\approx\\pm\\times\\div\\cdot\\infty\\partial\\nabla\\rightarrow\\rightleftharpoons\\Rightarrow",
            ),
            math(
              "\\mathbb{R}\\mathcal{L}\\mathbf{v}\\mathrm{d}\\boldsymbol{\\alpha}\\checkmark\\therefore\\leqslant\\text{text}\\textbf{b}\\SI{5}{\\micro\\gram}\\qty{3}{\\kelvin}\\ang{30}",
            ),
          ),
          {
            type: "mathDisplay",
            attrs: {
              latex:
                "\\left( \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} \\right) \\quad \\begin{cases} 1 & x>0 \\\\ 0 & \\text{else} \\end{cases} \\overbrace{x}^{a}\\underbrace{y}_{b}\\widehat{x}\\vec{v}\\overline{AB}",
            },
          },
          {
            type: "choices",
            attrs: { columns: 4 },
            content: ["a", "b", "c", "d"].map((x) => ({ type: "choice", content: [t(x)] })),
          },
        ],
      },
    },
    {
      groupKey: "g1",
      position: 3,
      content: {
        type: "doc",
        content: [
          {
            type: "choices",
            attrs: { columns: 1 },
            content: ["a", "b"].map((x) => ({ type: "choice", content: [t(x)] })),
          },
          { type: "orderedList", content: [{ type: "listItem", content: [para(t("one"))] }] },
          { type: "bulletList", content: [{ type: "listItem", content: [para(t("one"))] }] },
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  { type: "tableCell", content: [para(t("h"))] },
                  { type: "tableCell", content: [para(t("h"))] },
                ],
              },
              {
                type: "tableRow",
                content: [
                  { type: "tableCell", content: [para(t("x"))] },
                  { type: "tableCell", content: [para(t("y"))] },
                ],
              },
            ],
          },
          {
            type: "advancedLatex",
            attrs: {
              latex:
                "{\\small s}{\\footnotesize f}{\\scriptsize c}{\\large l}{\\Large L}\\textsc{Sc}\\texttt{tt}\\textsf{sf}\\emph{em}",
            },
          },
        ],
      },
    },
    {
      groupKey: "g2",
      position: 1,
      content: {
        type: "doc",
        content: [
          {
            type: "subParts",
            content: [
              { type: "subPart", content: [para(t("a"))] },
              { type: "subPart", content: [para(t("b"))] },
            ],
          },
        ],
      },
    },
  ];
}

export function warmUpPapers(): PaperInput[] {
  const out: PaperInput[] = [];
  for (const size of sizes) {
    for (const uline of [false, true]) {
      out.push({
        template: warmTemplate(size, uline),
        meta: {
          university: "WARM-UP",
          examTitle: "Warm-up",
          programLine: "Warm-up",
          date: "DD/MM/YYYY",
        },
        slots: warmSlots(),
      });
    }
  }
  return out;
}
