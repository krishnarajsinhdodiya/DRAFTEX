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
 * A course as the bank knows it: its code, and the COs and units the
 * syllabus lists for that code (empty for a course outside the catalogue).
 * The lists are defaults and suggestions, never a rule (D85).
 */
export interface BankCourse {
  code: string;
  outcomes: readonly { number: number }[];
  units: readonly { number: number }[];
}

/** Two-digit CO numbers (memory.md, owner 2026-11-06). */
const CO_NUMBERS = Array.from({ length: 99 }, (_, i) => i + 1);

/** The CO tags the syllabus lists for a course: `BP604T.01`, `BP607T.01 AEC1` (D63). */
export function courseCoTags(course: Pick<BankCourse, "code" | "outcomes">): string[] {
  return course.outcomes.map((o) => coTag(course.code, o.number));
}

/**
 * A warning when a CO tag does not fit the course (D85), or null: not one
 * the syllabus lists for the code, or (with no list) not the code plus a
 * number. Never an error: syllabi change and the user's own tag wins.
 */
export function coNote(tag: string, course: Pick<BankCourse, "code" | "outcomes">): string | null {
  if (course.outcomes.length > 0) {
    return courseCoTags(course).includes(tag)
      ? null
      : `CO ${tag} is not in the syllabus list for ${course.code}.`;
  }
  if (CO_NUMBERS.some((n) => coTag(course.code, n) === tag)) return null;
  return `CO ${tag} does not look like a CO of ${course.code} (${coTag(course.code, 1)}, ${coTag(course.code, 2)} …).`;
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

export interface BankCheck {
  /** Block the save: empty question, characters the paper cannot print. */
  errors: string[];
  /** Shown, never blocking (D85): CO or unit not in the syllabus lists. */
  warnings: string[];
}

/**
 * Checks a question for its course. The syllabus lists are defaults (D85),
 * so a CO or unit outside them is a warning; only what cannot be saved or
 * printed is an error. Bloom and each field's shape are `bankFieldsSchema`'s.
 */
export function bankCheck(
  q: { coTag: string; unit: number | null; content: Doc; answerKey: Doc | null },
  course: BankCourse,
): BankCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const co = coNote(q.coTag, course);
  if (co) warnings.push(co);
  for (const tag of new Set(subPartCoTags(q.content))) {
    const p = coNote(tag, course);
    if (p) warnings.push(`Sub-part: ${p}`);
  }
  if (
    q.unit !== null &&
    course.units.length > 0 &&
    !course.units.some((u) => u.number === q.unit)
  ) {
    warnings.push(`Unit ${q.unit} is not in the syllabus list for ${course.code}.`);
  }
  if (isEmptyDoc(q.content)) errors.push("The question is empty.");
  const bad = [
    ...unprintableChars(q.content),
    ...(q.answerKey ? unprintableChars(q.answerKey) : []),
  ];
  if (bad.length) {
    errors.push(
      `This text contains characters that cannot be printed: ${[...new Set(bad)].join(", ")}.`,
    );
  }
  return { errors, warnings };
}
