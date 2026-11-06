// Question bank rules (Phase 11): the fields a bank question must have, the
// catalogue check of its CO and Bloom level (D72, D77), its plain text for
// search and the normalised form behind the duplicate key (D76).
// Pure and client-safe; the data layer hashes `dupSource`.
import { z } from "zod";
import { escapeText, describeChar } from "../latex/escape.ts";
import { coTag } from "../paper/co-tag.ts";
import { keyCriteriaSchema } from "../paper/key.ts";
import { type Doc, bloomSchema, coTagSchema, docSchema, groupSchema } from "../paper/schema.ts";

/** Programs as stored (the Prisma `Program` enum). */
export const BANK_PROGRAMS = ["B_PHARM", "M_PHARM", "PHARM_D"] as const;

/**
 * A course code as printed: a code, optionally one space and an elective
 * suffix (`BP607T AEC1`). Typed codes are upper-cased and spaces folded.
 */
export const COURSE_CODE_RE = /^[A-Z0-9]{1,20}(?: [A-Z0-9]{1,8})?$/;
export const courseCodeSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " ").toUpperCase())
  .pipe(
    z
      .string()
      .min(1, "Give the course code.")
      .regex(COURSE_CODE_RE, "Course codes look like BP604T, MPH101T or BP607T AEC1."),
  );

export const BANK_TYPES = groupSchema.shape.type.options;
export type BankType = (typeof BANK_TYPES)[number];

/** Free tags: short words, at most 10 on a question. */
export const TAG_MAX = 30;
export const TAGS_MAX = 10;
export const bankTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(TAG_MAX, `A tag has at most ${TAG_MAX} characters.`)
  .regex(/^[\p{L}\p{N} ._-]+$/u, "Tags use letters, digits, spaces, dots, - and _ only.");

export const bankFieldsSchema = z.object({
  /** Catalogue course; null for a course outside the catalogue (D72 amended). */
  courseId: z.string().min(1).max(64).nullable().default(null),
  /** Taken from the catalogue when `courseId` is set; typed otherwise. */
  courseCode: courseCodeSchema,
  courseTitle: z.string().trim().max(200).default(""),
  program: z.enum(BANK_PROGRAMS).default("B_PHARM"),
  unit: z.number().int().min(1).max(20).nullable().default(null),
  coTag: coTagSchema,
  bloomLevel: bloomSchema,
  marks: z.number().positive().max(100),
  type: z.enum(BANK_TYPES),
  content: docSchema,
  answerKey: docSchema.nullable().default(null),
  keyCriteria: keyCriteriaSchema.nullable().default(null),
  tags: z
    .array(bankTagSchema)
    .max(TAGS_MAX, `A question has at most ${TAGS_MAX} tags.`)
    .default([])
    .transform((t) => [...new Set(t)]),
});
export type BankFieldsInput = z.input<typeof bankFieldsSchema>;
export type BankFields = z.output<typeof bankFieldsSchema>;

/**
 * A course as the bank checks it: its code, and the COs and units of a
 * catalogue course. A course outside the catalogue (or one whose catalogue
 * entry has no COs) has empty lists, and only the shape of its CO is checked.
 */
export interface BankCourse {
  code: string;
  outcomes: readonly { number: number }[];
  units: readonly { number: number }[];
}

/** Shown on questions whose course has no CO list (D72 amended). */
export const CO_UNCHECKED = "CO not checked against a list";
/** Two-digit CO numbers (memory.md, owner 2026-11-06). */
const CO_NUMBERS = Array.from({ length: 99 }, (_, i) => i + 1);

/** The CO tags of a catalogue course: `BP604T.01`, `BP607T.01 AEC1` (D63). */
export function courseCoTags(course: Pick<BankCourse, "code" | "outcomes">): string[] {
  return course.outcomes.map((o) => coTag(course.code, o.number));
}

/** True when the course has a CO list to check against. */
export function hasCoList(course: Pick<BankCourse, "outcomes">): boolean {
  return course.outcomes.length > 0;
}

/** Names the problem with a CO tag for this course, or null when it fits. */
export function coProblem(
  tag: string,
  course: Pick<BankCourse, "code" | "outcomes">,
): string | null {
  if (hasCoList(course)) {
    return courseCoTags(course).includes(tag) ? null : `CO ${tag} is not a CO of ${course.code}.`;
  }
  if (CO_NUMBERS.some((n) => coTag(course.code, n) === tag)) return null;
  return `CO ${tag} does not belong to ${course.code}; write it as ${coTag(course.code, 1)}, ${coTag(course.code, 2)} and so on.`;
}

type AnyNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: AnyNode[];
};

function walk(nodes: AnyNode[] | undefined, visit: (n: AnyNode) => void): void {
  for (const n of nodes ?? []) {
    visit(n);
    walk(n.content, visit);
  }
}

/** Every sub-part CO tag that is set, in order. */
export function subPartCoTags(doc: Doc): string[] {
  const out: string[] = [];
  walk(doc.content as AnyNode[], (n) => {
    if (n.type === "subPart" && typeof n.attrs?.coTag === "string") out.push(n.attrs.coTag);
  });
  return out;
}

/**
 * The question as plain text: words, maths as its LaTeX, units, choices and
 * table cells, one block per line. Used for search and the duplicate key.
 */
export function plainText(doc: Doc): string {
  const lines: string[] = [];
  const inline = (nodes: AnyNode[] | undefined): string =>
    (nodes ?? [])
      .map((n) => {
        if (n.type === "text") return n.text ?? "";
        if (n.type === "hardBreak") return " ";
        if (n.type === "mathInline") return ` $${String(n.attrs?.latex ?? "")}$ `;
        if (n.type === "blank") return " ____ ";
        if (n.type === "units")
          return ` ${String(n.attrs?.value ?? "")} ${String(n.attrs?.unit ?? "")} `;
        return "";
      })
      .join("");
  const block = (n: AnyNode): void => {
    switch (n.type) {
      case "paragraph":
      case "choice":
        lines.push(inline(n.content));
        return;
      case "mathDisplay":
        lines.push(`$$${String(n.attrs?.latex ?? "")}$$`);
        return;
      case "advancedLatex":
        lines.push(String(n.attrs?.latex ?? ""));
        return;
      case "image":
        return;
      default:
        for (const c of n.content ?? []) block(c);
    }
  };
  for (const n of doc.content as AnyNode[]) block(n);
  return lines
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Normalised text (D76): NFKC, lower case, spaces folded; punctuation kept. */
export function normaliseText(s: string): string {
  return s.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/g, " ").trim();
}

/** What the duplicate key hashes: the normalised text plus every picture's hash. */
export function dupSource(doc: Doc): string {
  const shas: string[] = [];
  walk(doc.content as AnyNode[], (n) => {
    if (n.type === "image" && typeof n.attrs?.sha256 === "string") shas.push(n.attrs.sha256);
  });
  return [normaliseText(plainText(doc)), ...shas].join("\n#");
}

/** True when the question has nothing in it (no text, maths or picture). */
export function isEmptyDoc(doc: Doc): boolean {
  return dupSource(doc) === "";
}

/** Characters the paper cannot print, named ("😀 (U+1F600)"), from every text in the doc. */
export function unprintableChars(doc: Doc): string[] {
  const bad = new Set<string>();
  walk(doc.content as AnyNode[], (n) => {
    const texts =
      n.type === "text" ? [n.text ?? ""] : n.type === "units" ? [String(n.attrs?.unit ?? "")] : [];
    for (const t of texts) {
      const r = escapeText(t);
      if (!r.ok) for (const b of r.bad) bad.add(describeChar(b.char));
    }
  });
  return [...bad];
}

/**
 * Everything wrong with a question for this course (D77): the CO and every
 * sub-part CO must be the course's, the unit must exist, the text must print.
 * Bloom and the shape of each field are checked by `bankFieldsSchema`.
 */
export function bankProblems(
  q: { coTag: string; unit: number | null; content: Doc; answerKey: Doc | null },
  course: BankCourse,
): string[] {
  const out: string[] = [];
  const co = coProblem(q.coTag, course);
  if (co) out.push(co);
  for (const tag of new Set(subPartCoTags(q.content))) {
    const p = coProblem(tag, course);
    if (p) out.push(`Sub-part: ${p}`);
  }
  if (
    q.unit !== null &&
    course.units.length > 0 &&
    !course.units.some((u) => u.number === q.unit)
  ) {
    out.push(`${course.code} has no unit ${q.unit}.`);
  }
  if (isEmptyDoc(q.content)) out.push("The question is empty.");
  const bad = [
    ...unprintableChars(q.content),
    ...(q.answerKey ? unprintableChars(q.answerKey) : []),
  ];
  if (bad.length) {
    out.push(
      `This text contains characters that cannot be printed: ${[...new Set(bad)].join(", ")}.`,
    );
  }
  return out;
}
