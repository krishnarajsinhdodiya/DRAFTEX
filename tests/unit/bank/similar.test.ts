// Near-duplicates (D114): the threshold is chosen on these invented pairs.
// "same" = a teacher would call it the same question reworded; "different" =
// shares a pattern or topic but asks something else. Invented text only.
import { describe, expect, it } from "vitest";
import {
  NEAR_THRESHOLD,
  jaccard,
  shingles,
  similarPairs,
  similarTo,
  words,
} from "@/lib/bank/similar";

const SAME: [string, string][] = [
  [
    "Define bioavailability and explain the factors affecting it.",
    "Define bioavailability and explain the factors that affect it.",
  ],
  [
    "Explain the mechanism of action of beta blockers with a neat diagram.",
    "Explain the mechanism of action of beta blockers with a diagram.",
  ],
  [
    "Write a note on the stability testing of tablets as per ICH guidelines.",
    "Write a short note on the stability testing of tablets as per ICH guidelines.",
  ],
  [
    "Classify diuretics and describe the mechanism of action of loop diuretics.",
    "Classify diuretics. Describe the mechanism of action of loop diuretics.",
  ],
  [
    "Discuss the synthesis of paracetamol from phenol with reaction conditions.",
    "Discuss the synthesis of paracetamol from phenol, giving the reaction conditions.",
  ],
  [
    "Calculate the half-life of a drug with an elimination rate constant of 0.2 per hour.",
    "Calculate the half-life of a drug whose elimination rate constant is 0.2 per hour.",
  ],
  [
    "What is the difference between a suspension and an emulsion? Give two examples of each.",
    "What is the difference between a suspension and an emulsion? Give examples of each.",
  ],
  [
    "Describe the evaluation tests for capsules: weight variation, disintegration and dissolution.",
    "Describe the evaluation tests for capsules such as weight variation, disintegration and dissolution.",
  ],
];

const DIFFERENT: [string, string][] = [
  [
    "Explain the mechanism of action of beta blockers with a neat diagram.",
    "Explain the mechanism of action of calcium channel blockers with a neat diagram.",
  ],
  [
    "Define bioavailability and explain the factors affecting it.",
    "Define bioequivalence and explain how it is tested.",
  ],
  [
    "Write a note on the stability testing of tablets as per ICH guidelines.",
    "Write a note on the packaging of tablets.",
  ],
  [
    "Discuss the synthesis of paracetamol from phenol with reaction conditions.",
    "Discuss the synthesis of aspirin from salicylic acid with reaction conditions.",
  ],
  [
    "Classify diuretics and describe the mechanism of action of loop diuretics.",
    "Classify antihypertensive drugs and describe the mechanism of action of ACE inhibitors.",
  ],
  [
    "Calculate the half-life of a drug with an elimination rate constant of 0.2 per hour.",
    "Calculate the volume of distribution of a drug given a dose of 500 mg.",
  ],
  [
    "Describe the evaluation tests for capsules: weight variation, disintegration and dissolution.",
    "Describe the evaluation tests for ointments: spreadability, viscosity and drug content.",
  ],
  [
    "What is the difference between a suspension and an emulsion? Give two examples of each.",
    "What is the difference between a cream and a gel? Give two examples of each.",
  ],
];

const score = ([a, b]: [string, string]) => jaccard(shingles(a), shingles(b));

describe("threshold (D114)", () => {
  it("catches every reworded pair and flags at most 3 of 8 alike-but-different ones", () => {
    const same = SAME.map(score);
    const diff = DIFFERENT.map(score);
    if (process.env.SHOW_SCORES) {
      console.log("same", same.map((x) => x.toFixed(2)).join(" "));
      console.log("different", diff.map((x) => x.toFixed(2)).join(" "));
    }
    expect(Math.min(...same)).toBeGreaterThanOrEqual(NEAR_THRESHOLD);
    expect(diff.filter((x) => x >= NEAR_THRESHOLD).length).toBeLessThanOrEqual(3);
  });
});

describe("shingles", () => {
  it("ignore case, spacing and punctuation, keep maths symbols", () => {
    expect(words("Find  x^2, given:  CAFÉ!")).toEqual(["find", "x^2", "given", "café"]);
    expect(shingles("One two three four")).toEqual(new Set(["one two three", "two three four"]));
  });

  it("leave short texts to the exact check", () => {
    expect(shingles("Define pKa.").size).toBe(0);
    expect(similarTo("Define pKa.", [{ id: "x", text: "Define pKa value." }])).toEqual([]);
  });
});

describe("similarTo", () => {
  it("lists similar questions, most similar first, without the exact duplicate", () => {
    const [a, b] = SAME[0]!;
    const r = similarTo(a, [
      { id: "exact", text: a.toUpperCase() },
      { id: "near", text: b },
      { id: "far", text: DIFFERENT[1]![1] },
    ]);
    expect(r.map((x) => x.id)).toEqual(["near"]);
    expect(r[0]!.score).toBeGreaterThanOrEqual(NEAR_THRESHOLD);
  });
});

describe("similarPairs", () => {
  it("finds every near pair once, in a set of 400", () => {
    const items = [
      ...SAME.flatMap(([a, b], i) => [
        { id: `s${i}a`, text: a },
        { id: `s${i}b`, text: b },
      ]),
      ...Array.from({ length: 384 }, (_, i) => ({
        id: `f${String(i).padStart(3, "0")}`,
        text: `Invented filler question number ${i} about topic ${i * 7} and ${i * 13}.`,
      })),
    ];
    const pairs = similarPairs(items);
    const named = pairs.filter((p) => p.a.startsWith("s"));
    expect(named.map((p) => `${p.a}/${p.b}`).sort()).toEqual(
      SAME.map((_, i) => `s${i}a/s${i}b`).sort(),
    );
    expect(pairs.every((p) => p.score >= NEAR_THRESHOLD && p.score < 1)).toBe(true);
  });
});

describe("template phrases (COMMON_SHINGLE)", () => {
  it("keep 3,000 questions from one template fast, and still find a real pair", () => {
    const items = Array.from({ length: 3000 }, (_, i) => ({
      id: `q${String(i).padStart(4, "0")}`,
      text: `Explain the mechanism of action of drug number ${i} in detail.`,
    }));
    items.push(
      {
        id: "r1",
        text: "Explain the mechanism of action of loop diuretics on the nephron in detail.",
      },
      {
        id: "r2",
        text: "Explain the mechanism of action of loop diuretics on the nephron with detail.",
      },
    );
    const start = performance.now();
    const pairs = similarPairs(items);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(pairs.map((p) => `${p.a}/${p.b}`)).toEqual(["r1/r2"]);
  });
});
