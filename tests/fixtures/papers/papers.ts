// Paper fixtures for golden, visual and fuzz tests. All question text is
// invented (or copied from the tracked reference template, which is itself
// invented). Nothing comes from reference_papers/.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { templateFieldsSchema } from "@/lib/data/templates";
import type { Bloom } from "@/lib/paper/bloom";
import type {
  BlockNode,
  InlineNode,
  LeafBlockNode,
  PaperInput,
  SubPartAttrs,
} from "@/lib/paper/schema";
import { previewPaper } from "@/lib/templates/preview";
import { BUILT_IN_TEMPLATES } from "@/lib/templates/seeds";
import {
  kbiperSessional,
  ksvLegacy75,
  pciEndSem4CreditKsv,
  practicalEnd,
  synopsisQuiz,
} from "./templates";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export interface FixtureAsset {
  sha256: string;
  ext: "png" | "jpg" | "pdf";
  sourcePath: string;
  name: string;
}

function asset(rel: string): FixtureAsset {
  const sourcePath = path.join(ROOT, rel);
  const sha256 = createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex");
  const ext = path.extname(rel).slice(1) as FixtureAsset["ext"];
  return { sha256, ext, sourcePath, name: `assets/${sha256}.${ext}` };
}

export const ASSETS = {
  kbiperLogo: asset("assets/logos/kbiper-logo.png"),
  ksvLogo: asset("assets/logos/ksv-logo.png"),
  box: asset("tests/fixtures/latex/assets/box.pdf"),
  png: asset("tests/fixtures/latex/assets/sample.png"),
  jpg: asset("tests/fixtures/latex/assets/sample.jpg"),
};

// ---------- tiny builders ----------
export const t = (
  text: string,
  ...marks: Array<"bold" | "italic" | "underline" | "subscript" | "superscript">
): InlineNode =>
  marks.length
    ? { type: "text", text, marks: marks.map((type) => ({ type })) }
    : { type: "text", text };
export const m = (latex: string): InlineNode => ({ type: "mathInline", attrs: { latex } });
export const blank = (widthCm?: number): InlineNode =>
  widthCm ? { type: "blank", attrs: { widthCm } } : { type: "blank" };
export const qty = (value: string, unit: string): InlineNode => ({
  type: "units",
  attrs: { value, unit },
});
export const p = (...content: Array<InlineNode | string>): LeafBlockNode => ({
  type: "paragraph",
  content: content.map((c) => (typeof c === "string" ? t(c) : c)),
});
export const md = (latex: string): LeafBlockNode => ({ type: "mathDisplay", attrs: { latex } });
export const choices = (opts: string[], columns?: 1 | 2 | 4): LeafBlockNode => ({
  type: "choices",
  ...(columns ? { attrs: { columns } } : {}),
  content: opts.map((o) => ({ type: "choice", content: [t(o)] })),
});
export const img = (a: FixtureAsset, widthPercent?: number): LeafBlockNode => ({
  type: "image",
  attrs: { sha256: a.sha256, ext: a.ext, ...(widthPercent ? { widthPercent } : {}) },
});
export const table = (rows: string[][], widthPercent = 80): LeafBlockNode => ({
  type: "table",
  attrs: { headerRow: true, widthPercent },
  content: rows.map((r) => ({
    type: "tableRow",
    content: r.map((c) => ({
      type: "tableCell",
      content: [{ type: "paragraph", content: [t(c)] }],
    })),
  })),
});
const doc = (...content: BlockNode[]) => ({ type: "doc" as const, content });
const slot = (
  groupKey: string,
  position: number,
  content: BlockNode[],
  extra: { coTag?: string; marks?: number; bloomLevel?: Bloom } = {},
) => ({
  groupKey,
  position,
  content: doc(...content),
  ...extra,
});

// ---------- the reference template, as data ----------

/** Same content as docs/reference/templates/pci2026-bpharm-endsem-4credit-ksv.tex. */
export function referencePaper(): PaperInput {
  return {
    template: pciEndSem4CreditKsv,
    emptySlots: "OMIT",
    meta: {
      university: "KADI SARVA VISHWAVIDYALAYA",
      examTitle: "Semester End Examination",
      programLine: "B.Pharm Semester I",
      courseTitle: "Human Anatomy, Physiology and Pathophysiology I",
      courseCode: "BP104T",
      date: "DD/MM/YYYY",
      duration: "3 hours",
      maxMarks: "60",
    },
    slots: [
      slot("g1", 1, [
        p("Which of the following is the functional unit of the kidney?"),
        choices(["Neuron", "Nephron", "Alveolus", "Hepatocyte"]),
      ]),
      slot("g1", 2, [
        p("The normal resting heart rate of an adult is ", blank(), " beats per minute."),
        choices(["40–50", "60–100", "110–130", "140–160"]),
      ]),
      slot("g1", 3, [p("Haemoglobin carries oxygen as oxyhaemoglobin. True/False")]),
      slot("g1", 4, [
        p("Normal plasma osmolality is approximately ", qty("290", "mOsm/kg"), ". True/False"),
      ]),
      slot(
        "g2",
        1,
        [p("Describe the structure of a typical cell membrane with a labelled diagram.")],
        { coTag: "BP104T.1" },
      ),
      slot(
        "g2",
        2,
        [
          p("Explain the Frank–Starling law of the heart. Cardiac output is given by"),
          md("CO = HR \\times SV"),
          p(
            "Calculate ",
            m("CO"),
            " when ",
            m("HR = \\SI{72}{beats/min}"),
            " and ",
            m("SV = \\SI{70}{mL}"),
            ".",
          ),
        ],
        { coTag: "BP104T.3" },
      ),
      slot("g2", 3, [
        p("Tabulate the differences between arteries and veins."),
        table([
          ["Feature", "Artery", "Vein"],
          ["Wall", "…", "…"],
        ]),
      ]),
      slot("g3", 1, [
        p("Describe the conducting system of the heart. Add a note on the normal ECG."),
      ]),
      slot("g3", 2, [
        p("Identify the structure shown below and explain its role in synaptic transmission."),
        img(ASSETS.box),
      ]),
      slot("g3", 3, [p("Classify blood cells. Describe the mechanism of blood coagulation.")]),
    ],
  };
}

const mcq = (q: string, opts: string[]) => [p(q), choices(opts)];

/** Full KSV legacy paper (invented questions), every slot filled. */
export function legacyPaper(): PaperInput {
  const section = (s: string, n: number) => [
    ...Array.from({ length: 10 }, (_, i) =>
      i % 3 === 0
        ? slot(
            `${s}obj`,
            i + 1,
            mcq(`Invented objective question ${n}.${i + 1}: which option is correct?`, [
              "First option",
              "Second option",
              "Third option",
              "Fourth option",
            ]),
          )
        : slot(`${s}obj`, i + 1, [
            p(`Invented statement ${n}.${i + 1} about pharmaceutical processing. True/False`),
          ]),
    ),
    ...[1, 2].map((i) =>
      slot(`${s}long`, i, [
        p(
          `Invented long question ${n}.${i}: describe the principle, construction and working of an invented apparatus with a neat diagram.`,
        ),
      ]),
    ),
    ...[1, 2, 3, 4, 5].map((i) =>
      slot(`${s}short`, i, [
        p(`Invented short question ${n}.${i}: write a brief note on an invented topic.`),
      ]),
    ),
  ];
  return {
    template: ksvLegacy75,
    meta: {
      university: "KADI SARVA VISHWAVIDYALAYA",
      examTitle: "Semester End Examination",
      programLine: "B.Pharm Semester VII",
      courseTitle: "Invented Course Title",
      courseCode: "BP000T",
      date: "DD/MM/YYYY",
      duration: "3 hours",
      maxMarks: "75",
    },
    slots: [...section("s1", 1), ...section("s2", 2)],
  };
}

export function kbiperPaper(): PaperInput {
  return {
    template: kbiperSessional({ sha256: ASSETS.kbiperLogo.sha256, ext: "png" }),
    meta: {
      institute: "K B Institute of Pharm Education & Research",
      programLine: "B.Pharm Semester VI",
      courseTitle: "Invented Pharmacokinetics",
      courseCode: "BP000T",
      examTitle: "Second Sessional Examination",
      date: "DD/MM/YYYY",
      duration: "60 minutes",
      maxMarks: "30",
    },
    slots: [
      ...Array.from({ length: 10 }, (_, i) =>
        slot(
          "mcq",
          i + 1,
          mcq(`Invented MCQ ${i + 1}: the half-life of a drug following first-order kinetics is`, [
            "dependent on dose",
            "independent of dose",
            "zero",
            "infinite",
          ]),
          {
            coTag: "BP000T.01",
          },
        ),
      ),
      slot(
        "short",
        1,
        [
          p(
            "Derive the equation for ",
            m("t_{1/2} = \\frac{0.693}{K}"),
            " for a one-compartment model.",
          ),
        ],
        { coTag: "BP000T.02" },
      ),
      slot(
        "short",
        2,
        [
          p(
            "Define bioavailability. Calculate ",
            m("F"),
            " when ",
            m("AUC_{oral} = 40"),
            " and ",
            m("AUC_{iv} = 50"),
            ".",
          ),
        ],
        { coTag: "BP000T.02", marks: 5 },
      ),
      slot("short", 3, [p("Explain non-linear pharmacokinetics with one example.")], {
        coTag: "BP000T.03",
      }),
      slot("long", 1, [p("Describe the two-compartment open model with a neat plot.")], {
        coTag: "BP000T.04",
      }),
    ],
  };
}

export function practicalPaper(): PaperInput {
  return {
    template: practicalEnd,
    meta: {
      university: "KADI SARVA VISHWAVIDYALAYA",
      examTitle: "Practical Examination",
      programLine: "B.Pharm Semester III",
      courseTitle: "Invented Practical Course",
      courseCode: "BP000P",
      date: "DD/MM/YYYY",
      duration: "4 hours",
      maxMarks: "30",
    },
    slots: [
      slot("syn", 1, [p("Write the synopsis of the experiment allotted to you.")]),
      slot("major", 1, [
        p("Perform any one of the following:"),
        {
          type: "orderedList",
          content: [
            "Determine the invented constant of a liquid by an invented method.",
            "Prepare and submit an invented formulation.",
            "Estimate an invented substance by titration.",
          ].map((x) => ({
            type: "listItem" as const,
            content: [{ type: "paragraph" as const, content: [t(x)] }],
          })),
        },
      ]),
      slot("minor", 1, [
        p("Identify the given invented sample:"),
        {
          type: "subParts",
          content: ["Sample A", "Sample B", "Sample C", "Sample D"].map((x) => ({
            type: "subPart" as const,
            content: [p(x)],
          })),
        },
      ]),
      slot("viva", 1, [p("Viva-voce.")]),
    ],
  };
}

export function synopsisPaper(): PaperInput {
  return {
    template: synopsisQuiz,
    meta: {
      institute: "K B Institute of Pharm Education & Research",
      examTitle: "Synopsis",
      courseTitle: "Invented Practical",
      date: "DD/MM/YYYY",
      duration: "10 minutes",
      maxMarks: "10",
    },
    slots: Array.from({ length: 10 }, (_, i) =>
      slot(
        "mcq",
        i + 1,
        mcq(`Invented synopsis question ${i + 1}?`, ["alpha", "beta", "gamma", "delta"]),
      ),
    ),
  };
}

/** Every node type and mark, plus mapped Unicode symbols. */
export function kitchenSinkPaper(): PaperInput {
  return {
    template: pciEndSem4CreditKsv,
    emptySlots: "PLACEHOLDER",
    meta: {
      university: "KADI SARVA VISHWAVIDYALAYA",
      examTitle: "Semester End Examination",
      programLine: "B.Pharm Semester II",
      courseTitle: "Invented Course: “Quotes”, 50% & more",
      courseCode: "BP000T",
      date: "DD/MM/YYYY",
      duration: "3 hours",
      maxMarks: "60",
    },
    slots: [
      slot("g1", 1, [
        p(
          t("Bold", "bold"),
          " ",
          t("italic", "italic"),
          " ",
          t("under", "underline"),
          " H",
          t("2", "subscript"),
          "O x",
          t("2", "superscript"),
          " ",
          t("both", "bold", "italic"),
        ),
        choices(["A", "B", "C", "D"], 4),
      ]),
      slot("g1", 2, [
        p(
          "Symbols: 37 °C, 5 µg, ± 2, 3 × 4, 6 ÷ 2, A → B, a ≤ b ≥ c ≠ d ≈ e, α β γ Δ Ω, 1–2 — … • ½ ² ³ Å, café naïve.",
        ),
      ]),
      slot("g1", 3, [p("Specials: \\ { } $ & # ^ _ % ~ < > | [x] `tick` \"double\" 'single'")]),
      slot("g1", 4, [
        p(
          "Units ",
          qty("2.5", "\\milli\\gram\\per\\milli\\litre"),
          " and ",
          qty("0,9", "\\percent"),
          " and blank ",
          blank(4),
          ".",
        ),
        choices(["one", "two"], 1),
      ]),
      slot("g1", 5, [p("Line one", { type: "hardBreak" }, "Line two")]),
      slot(
        "g2",
        1,
        [
          p("Sub-parts:"),
          {
            type: "subParts",
            content: [
              { type: "subPart", content: [p("Part with maths ", m("\\sqrt{x^2+y^2}"))] },
              { type: "subPart", content: [md("\\int_0^\\infty e^{-kt}\\,dt = \\frac{1}{k}")] },
            ],
          },
        ],
        { coTag: "BP000T.1" },
      ),
      slot("g2", 2, [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [t("bullet")] }] }],
        },
        {
          type: "advancedLatex",
          attrs: { latex: "\\begin{center}\\textbf{Advanced} $x^2$\\end{center}" },
        },
      ]),
      slot("g2", 3, [img(ASSETS.png, 20), img(ASSETS.jpg, 15)]),
      slot("g3", 1, [
        table(
          [
            ["Drug", "Dose", "Route"],
            ["Invented A", "5 mg", "oral"],
            ["Invented B", "10 mg"],
          ],
          100,
        ),
      ]),
    ],
  };
}

const subParts = (...parts: [LeafBlockNode[], SubPartAttrs?][]): BlockNode => ({
  type: "subParts",
  content: parts.map(([content, attrs]) => ({
    type: "subPart" as const,
    ...(attrs ? { attrs } : {}),
    content,
  })),
});

/**
 * Phase 10: Bloom levels and CO tags printed (WP-C). One-line and wrapped
 * questions, long chemical names, sub-parts with their own tags, two-column
 * choices, a question without tags and an elective CO tag (D63).
 */
export function bloomPaper(): PaperInput {
  const base = referencePaper();
  return {
    ...base,
    template: {
      ...base.template,
      style: { ...base.template.style, showBloom: true, showMarksPerQuestion: true },
    },
    slots: [
      slot(
        "g1",
        1,
        [
          p("Which of the following is the functional unit of the kidney?"),
          choices(["Neuron", "Nephron", "Alveolus", "Hepatocyte"]),
        ],
        { bloomLevel: "REMEMBER", coTag: "BP104T.01" },
      ),
      slot("g1", 2, [p("Haemoglobin carries oxygen as oxyhaemoglobin. True/False")], {
        bloomLevel: "UNDERSTAND",
      }),
      slot("g2", 1, [p("Define pharmacokinetics.")], {
        bloomLevel: "REMEMBER",
        coTag: "BP104T.02",
      }),
      slot(
        "g2",
        2,
        [
          p(
            "Explain how the plasma half-life of a drug that follows first-order elimination changes when the volume of distribution doubles while clearance stays the same, and state why.",
          ),
        ],
        { bloomLevel: "ANALYZE", coTag: "BP607T.03 AEC1" },
      ),
      slot(
        "g2",
        3,
        [
          p(
            "Write the mechanism of action of acetylsalicylic acid and N-acetyl-para-aminophenol, and the use of hydroxypropyl methylcellulose in tablets.",
          ),
        ],
        { bloomLevel: "UNDERSTAND", coTag: "BP104T.04" },
      ),
      slot("g2", 4, [p("Write a note on the lymphatic system.")]),
      slot(
        "g3",
        1,
        [
          p("Answer the following about the heart."),
          subParts(
            [
              [p("Describe the conducting system of the heart.")],
              { marks: 6, bloom: "UNDERSTAND" },
            ],
            [
              [p("Evaluate the normal ECG shown in class.")],
              { marks: 4, bloom: "EVALUATE", coTag: "BP104T.06" },
            ],
          ),
        ],
        { bloomLevel: "APPLY", coTag: "BP104T.05" },
      ),
      slot(
        "g3",
        2,
        [
          p("Classify blood cells."),
          subParts([[p("Give two examples of each class.")]], [[p("State their normal counts.")]]),
        ],
        { bloomLevel: "CREATE", coTag: "BP104T.05" },
      ),
    ],
  };
}

const adv = (latex: string): LeafBlockNode => ({ type: "advancedLatex", attrs: { latex } });

/** Every Advanced LaTeX package of Phase 12 (D86). */
export function packagesPaper(): PaperInput {
  const base = referencePaper();
  return {
    ...base,
    meta: { ...base.meta, courseTitle: "Invented Course: Packages", courseCode: "BP000T" },
    slots: [
      slot("g1", 1, [p("Balance the reaction: "), adv("\\ce{2H2 + O2 -> 2H2O}")]),
      slot("g1", 2, [
        adv("A strip of ten tablets costs \\rupee{}\\,45. What does one tablet cost?"),
      ]),
      slot("g2", 1, [p("Name the compound drawn below."), adv("\\chemfig{*6(=-=(-COOH)-=-)}")]),
      slot("g2", 2, [
        p("For the equilibrium below, write the constant."),
        adv(
          "$\\prescript{14}{6}{C} \\xrightleftharpoons[k_2]{k_1} X$ and $K \\coloneqq \\frac{k_1}{k_2}$",
        ),
      ]),
      slot("g3", 1, [
        adv(
          "\\begin{tabular}{|c|c|}\\hline \\multirow{2}{*}{Dose} & 5 mg\\\\ & 10 mg\\\\ \\hline\\end{tabular}",
        ),
      ]),
      slot("g3", 2, [
        p("List two of the following:"),
        adv(
          "\\begin{enumerate}[label=(\\roman*), nosep]\\item Absorption\\item Distribution\\end{enumerate}",
        ),
      ]),
      slot("g3", 3, [
        p("Answer from the note below."),
        adv(
          "\\begin{framed}\\textcolor{gray}{Note:} Read the label before answering.\\end{framed}",
        ),
      ]),
    ],
  };
}

export const FIXTURES = {
  reference: referencePaper,
  legacy: legacyPaper,
  kbiper: kbiperPaper,
  practical: practicalPaper,
  synopsis: synopsisPaper,
  kitchenSink: kitchenSinkPaper,
  bloom: bloomPaper,
  packages: packagesPaper,
} as const;

export const ALL_ASSETS = Object.values(ASSETS);

/** Every built-in template as the empty preview the library shows. */
export const SEED_PREVIEWS: Record<string, () => PaperInput> = Object.fromEntries(
  BUILT_IN_TEMPLATES.map((s) => [
    `seed-${s.seedKey}`,
    () => previewPaper(templateFieldsSchema.parse(s)),
  ]),
);
