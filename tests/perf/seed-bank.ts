// 5,000 invented bank questions for search and paging measurements (D115).
// Deterministic (seeded generator); no text from any real paper.
import type { Db } from "@/lib/db/client";
import { dupKeyOf } from "@/lib/data/bank";
import { plainText } from "@/lib/bank/question";
import type { Doc } from "@/lib/paper/schema";

const SUBJECTS = [
  "paracetamol",
  "ibuprofen",
  "aspirin",
  "metformin",
  "atenolol",
  "amoxicillin",
  "omeprazole",
  "diazepam",
  "morphine",
  "insulin",
  "heparin",
  "warfarin",
  "caffeine",
  "atropine",
  "digoxin",
  "propranolol",
  "salbutamol",
  "cetirizine",
  "4-isobutylphenyl propanoic acid",
  "sodium carboxymethyl cellulose",
  "β-lactam ring",
];
const TOPICS = [
  "mechanism of action",
  "structure activity relationship",
  "synthesis",
  "assay",
  "pharmacokinetics",
  "adverse effects",
  "therapeutic uses",
  "formulation",
  "stability",
  "bioavailability",
  "dissolution testing",
  "tablet coating",
  "emulsion stability",
  "suspension design",
  "sterilisation",
  "quality control",
];
const VERBS = [
  "Explain",
  "Describe",
  "Discuss",
  "Define",
  "Classify",
  "Write a note on",
  "Compare",
  "Outline",
];
const TAGS = [
  "unit-test",
  "important",
  "repeat",
  "numerical",
  "diagram",
  "short-note",
  "100%_sure",
  "50% weight",
];
const BLOOMS = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"] as const;
const TYPES = ["OBJECTIVE", "SHORT", "LONG"] as const;
export const SEED_COURSES = ["XX601T", "XX602T", "XX603T", "XX604T", "XX605T"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const para = (text: string) => ({
  type: "paragraph" as const,
  content: [{ type: "text" as const, text }],
});

export interface SeedUsers {
  author: string;
  colleague: string;
}

/**
 * Writes `count` questions: 60% for the author, the rest for the colleague
 * (a third of those SHARED, plus a course share on XX605T). Rows are written
 * in batches of 25 that share one updatedAt, so paging meets ties (D113).
 */
export async function seedBank(db: Db, users: SeedUsers, count = 5000): Promise<void> {
  const r = rng(16);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)] as T;
  const base = Date.UTC(2026, 0, 1);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const mine = i % 5 < 3;
    const course = pick(SEED_COURSES);
    const text = `${pick(VERBS)} the ${pick(TOPICS)} of ${pick(SUBJECTS)} (item ${i}).`;
    const content: Doc = { type: "doc", content: [para(text)] };
    const answer: Doc = {
      type: "doc",
      content: [para(`Model answer ${i}: ${pick(TOPICS)} of ${pick(SUBJECTS)}.`)],
    };
    const n = 1 + Math.floor(r() * 9);
    const at = new Date(base + Math.floor(i / 25) * 60_000);
    rows.push({
      ownerId: mine ? users.author : users.colleague,
      courseCode: course,
      courseTitle: `Invented course ${course}`,
      program: "B_PHARM" as const,
      unit: 1 + (i % 5),
      coTag: i % 7 === 0 ? `${course}.0${n}, ${course}.0${(n % 9) + 1}` : `${course}.0${n}`,
      bloomLevel: pick(BLOOMS),
      marks: pick([1, 2, 5, 10]),
      type: pick(TYPES),
      content,
      answerKey: answer,
      tags: i % 3 === 0 ? [pick(TAGS)] : [],
      dupKey: dupKeyOf(content),
      searchText: plainText(content),
      sharing: !mine && i % 3 === 0 ? ("SHARED" as const) : ("PRIVATE" as const),
      createdAt: at,
      updatedAt: at,
      deletedAt: i % 97 === 0 ? at : null,
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    await db.question.createMany({ data: rows.slice(i, i + 500) });
  }
  await db.bankCourseShare.create({ data: { ownerId: users.colleague, courseCode: "XX605T" } });
}
