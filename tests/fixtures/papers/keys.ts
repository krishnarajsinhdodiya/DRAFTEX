// Answer-key fixtures for golden and visual tests (D33). Invented answers
// for the invented fixture papers; nothing comes from reference_papers/.
import type { KeySlot } from "@/lib/latex/key";
import type { BlockNode, Doc, PaperInput } from "@/lib/paper/schema";
import { ASSETS, img, legacyPaper, m, md, p, qty, referencePaper, table } from "./papers";

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

export const KEY_FIXTURES = {
  "key-reference": referenceKey,
  "key-legacy": legacyKey,
  "key-own-numbers": ownNumbersKey,
} as const;
