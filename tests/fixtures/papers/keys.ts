// Answer-key fixtures for golden and visual tests (D33). Invented answers
// for the invented fixture papers; nothing comes from reference_papers/.
import { KEY_CODE_LIMITS } from "@/lib/latex/code";
import type { KeySlot } from "@/lib/latex/key";
import type { BlockNode, Doc, PaperInput } from "@/lib/paper/schema";
import {
  ASSETS,
  bloomPaper,
  code,
  codePaper,
  longLine,
  t,
  img,
  legacyPaper,
  m,
  md,
  p,
  packagesPaper,
  qty,
  referencePaper,
  table,
  tablesPaper,
  xtable,
} from "./papers";

export interface KeyFixture {
  paper: PaperInput;
  keys: KeySlot[];
}

const doc = (...content: BlockNode[]): Doc => ({ type: "doc", content });

/** Marks the correct choice of every choices block in a paper's group. */
function withCorrect(paper: PaperInput, groupKey: string, pick: (pos: number) => number) {
  return {
    ...paper,
    slots: paper.slots.map((s) =>
      s.groupKey !== groupKey
        ? s
        : {
            ...s,
            content: {
              ...s.content,
              content: s.content.content.map((b) =>
                b.type === "choices"
                  ? { ...b, attrs: { ...b.attrs, correct: pick(s.position) } }
                  : b,
              ),
            },
          },
    ),
  };
}

export function referenceKey(): KeyFixture {
  const paper = withCorrect(referencePaper(), "g1", (pos) => pos % 4);
  return {
    paper,
    keys: [
      {
        groupKey: "g1",
        position: 2,
        answerKey: doc(p("About 72 beats per minute.")),
        keyCriteria: [],
      },
      { groupKey: "g1", position: 3, answerKey: doc(p("True")), keyCriteria: [] },
      {
        groupKey: "g1",
        position: 4,
        answerKey: doc(p("True (", qty("290", "mOsm/kg"), ").")),
        keyCriteria: [],
      },
      {
        groupKey: "g2",
        position: 1,
        answerKey: doc(
          p(
            "Fluid mosaic model: a phospholipid bilayer with proteins, cholesterol and glycolipids.",
          ),
          {
            type: "subParts",
            content: [
              {
                type: "subPart",
                content: [p("Phospholipid bilayer with hydrophobic tails inward.")],
              },
              { type: "subPart", content: [p("Integral and peripheral proteins.")] },
            ],
          },
        ),
        keyCriteria: [
          { text: "Labelled diagram", marks: 2 },
          { text: "Description of the bilayer and proteins", marks: 1.5 },
          { text: "Functions", marks: 0.5 },
        ],
      },
      {
        groupKey: "g2",
        position: 2,
        answerKey: doc(
          p("Stroke volume rises with end-diastolic volume. With the given values:"),
          md("CO = 72 \\times 70 = \\SI{5040}{mL/min}"),
          p("so ", m("CO \\approx \\SI{5}{L/min}"), "."),
        ),
        keyCriteria: [
          { text: "Statement of the law", marks: 2 },
          { text: "Calculation with units", marks: 2 },
        ],
      },
      {
        groupKey: "g2",
        position: 3,
        answerKey: doc(
          table([
            ["Feature", "Artery", "Vein"],
            ["Wall", "Thick, elastic", "Thin"],
            ["Valves", "Absent", "Present"],
          ]),
        ),
        keyCriteria: [{ text: "Any four differences, one mark each", marks: 4 }],
      },
      {
        groupKey: "g3",
        position: 2,
        answerKey: doc(p("A synapse; the box marks the synaptic cleft."), img(ASSETS.box, 30)),
        keyCriteria: [
          { text: "Identification", marks: 2 },
          { text: "Role in transmission", marks: 8 },
        ],
      },
    ],
  };
}

/** Two parts (SECTION I / II), objective tables and short notes without keys. */
export function legacyKey(): KeyFixture {
  const base = legacyPaper();
  const paper = withCorrect(
    withCorrect(base, "s1obj", () => 1),
    "s2obj",
    () => 2,
  );
  const keys: KeySlot[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((i) =>
    i % 3 === 0
      ? []
      : [
          {
            groupKey: "s1obj",
            position: i,
            answerKey: doc(p(i % 2 ? "True" : "False")),
            keyCriteria: [],
          },
        ],
  );
  keys.push({
    groupKey: "s1long",
    position: 1,
    answerKey: doc(p("Principle, construction and working of the invented apparatus.")),
    keyCriteria: [
      { text: "Principle", marks: 3 },
      { text: "Diagram", marks: 4 },
      { text: "Working", marks: 3 },
    ],
  });
  return { paper, keys };
}

/** Every question numbered on its own (Pharm.D style). */
export function ownNumbersKey(): KeyFixture {
  const { paper, keys } = referenceKey();
  const t = paper.template as PaperInput["template"];
  return {
    paper: {
      ...paper,
      template: {
        ...t,
        structure: {
          ...t.structure,
          parts: t.structure.parts.map((part) => ({
            ...part,
            groups: part.groups.map((g) => ({ ...g, numbering: "QUESTION" as const })),
          })),
        },
      },
    },
    keys,
  };
}

/** Phase 10 (D68): the key of the Bloom paper, with the Level column and tagged headings. */
export function bloomKey(): KeyFixture {
  const paper = withCorrect(bloomPaper(), "g1", () => 1);
  return {
    paper,
    keys: [
      { groupKey: "g1", position: 2, answerKey: doc(p("True")), keyCriteria: [] },
      {
        groupKey: "g2",
        position: 1,
        answerKey: doc(p("What the body does to a drug.")),
        keyCriteria: [],
      },
      {
        groupKey: "g3",
        position: 1,
        answerKey: doc(p("SA node, AV node, bundle of His, Purkinje fibres.")),
        keyCriteria: [
          { text: "Conducting system", marks: 6 },
          { text: "ECG", marks: 4 },
        ],
      },
    ],
  };
}

/** Phase 12 (D87): a key whose answers use package commands the paper does not. */
export function packagesKey(): KeyFixture {
  const adv = (latex: string): BlockNode => ({ type: "advancedLatex", attrs: { latex } });
  return {
    paper: packagesPaper(),
    keys: [
      {
        groupKey: "g1",
        position: 1,
        answerKey: doc(adv("\\ce{2H2 + O2 -> 2H2O}")),
        keyCriteria: [],
      },
      {
        groupKey: "g2",
        position: 1,
        answerKey: doc(p("Benzoic acid:"), adv("\\chemfig{*6(=-=(-[:30]COOH)-=-)}")),
        keyCriteria: [
          { text: "Name", marks: 2 },
          { text: "Structure", marks: 2 },
        ],
      },
      {
        groupKey: "g3",
        position: 2,
        answerKey: doc(
          adv(
            "\\begin{enumerate}[label=\\alph*), nosep]\\item Absorption\\item Distribution\\end{enumerate}",
          ),
        ),
        keyCriteria: [],
      },
    ],
  };
}

/** Phase 13 (D102): model answers with code blocks, inline code in the objective table. */
export function codeKey(): KeyFixture {
  const paper = withCorrect(codePaper(), "g1", () => 1);
  return {
    paper,
    keys: [
      {
        groupKey: "g1",
        position: 2,
        answerKey: doc(p("True: ", t("def name(args):", "code"), " begins a function.")),
        keyCriteria: [],
      },
      {
        groupKey: "g2",
        position: 1,
        answerKey: doc(code("0.25 g", "0.5 g", "1.0 g"), p("Each dose is divided by 1000.")),
        keyCriteria: [
          { text: "Output", marks: 3 },
          { text: "Explanation", marks: 2 },
        ],
      },
      {
        groupKey: "g2",
        position: 2,
        answerKey: doc(
          p("The last line names ", t("value", "code"), " instead of ", t("values", "code"), ":"),
          code("def mean(values):", "    return sum(values) / len(values)"),
        ),
        keyCriteria: [],
      },
      {
        groupKey: "g3",
        position: 1,
        answerKey: doc({
          type: "subParts",
          content: [
            { type: "subPart", content: [code("1 3")] },
            {
              type: "subPart",
              content: [p("One way:"), code(longLine(KEY_CODE_LIMITS.subPart), "total = 0")],
            },
          ],
        }),
        keyCriteria: [],
      },
    ],
  };
}

/**
 * Phase 14: the same table options in model answers (D105); the objective
 * group keeps its answer table, where a plain answer is written.
 */
export function tablesKey(): KeyFixture {
  const paper = withCorrect(tablesPaper(), "g1", () => 1);
  return {
    paper,
    keys: [
      { groupKey: "g1", position: 1, answerKey: doc(p("B takes 4 minutes.")), keyCriteria: [] },
      {
        groupKey: "g2",
        position: 1,
        answerKey: doc(
          p("Doses:"),
          xtable(
            [
              ["Product", { text: "Dose", colspan: 2 }],
              ["", "Adult", "Child"],
              ["X", "500 mg", "250 mg"],
            ],
            {
              columns: [
                { width: 50 },
                { align: "CENTER", width: 25 },
                { align: "CENTER", width: 25 },
              ],
            },
          ),
        ),
        keyCriteria: [
          { text: "Adult doses", marks: 2 },
          { text: "Child doses", marks: 2 },
        ],
      },
      {
        groupKey: "g2",
        position: 2,
        answerKey: doc(
          xtable(
            [["Class", "Drug"], [{ text: "Analgesic", rowspan: 2 }, "Paracetamol"], ["Ibuprofen"]],
            { borders: "GRID", widthPercent: 70 },
          ),
        ),
        keyCriteria: [],
      },
    ],
  };
}

export const KEY_FIXTURES = {
  "key-reference": referenceKey,
  "key-legacy": legacyKey,
  "key-own-numbers": ownNumbersKey,
  "key-bloom": bloomKey,
  "key-packages": packagesKey,
  "key-code": codeKey,
  "key-tables": tablesKey,
} as const;
