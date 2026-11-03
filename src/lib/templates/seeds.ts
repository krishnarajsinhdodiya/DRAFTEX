// Built-in templates (SPEC §7 "Seed templates"). Global, read-only, owned by
// the first administrator, synced at startup by seedKey. Layout values follow
// the house style of the reference sources; no paper text comes from them.
import type { TemplateFields } from "./fields";
import type { Group, TemplateInput } from "@/lib/paper/schema";
import { logoRef } from "./logos";

export type SeedTemplate = TemplateFields & { seedKey: string };

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const any = (n: number) => `(Any ${WORDS[n] ?? n})`;

const ksvLines = [
  { text: "{{university}}", size: "large", bold: true },
  { text: "{{examTitle}}", size: "normal", bold: false },
  { text: "{{programLine}}", size: "large", bold: true },
  { text: "{{courseTitle}} [{{courseCode}}]", size: "large", bold: true },
] as const;

const kbiperLines = [
  { text: "{{institute}}", size: "large", bold: true },
  { text: "A Constituent College of KSV", size: "small", bold: false },
  { text: "{{programLine}}", size: "normal", bold: true },
  { text: "{{courseTitle}} ({{courseCode}})", size: "large", bold: true },
  { text: "{{examTitle}}", size: "small", bold: true },
] as const;

const ksvDateRow = {
  style: "RULE",
  left: "Date: {{date}}",
  centre: "Duration: {{duration}}",
  right: "Max marks: {{maxMarks}}",
} as const;

const kbiperDateRow = {
  style: "ULINE",
  left: "{{date}}",
  centre: "Duration: {{duration}}",
  right: "Max. marks: {{maxMarks}}",
} as const;

type GroupInput = TemplateInput["structure"]["parts"][number]["groups"][number];
const onePart = (groups: GroupInput[]) => [{ key: "p1", groups }];

const duration = (m: number) =>
  m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : `${m} minutes`;

// ---------- PCI 2026 theory ----------

interface TheoryShape {
  credits: 4 | 3 | 2;
  label: string;
  minutes: number;
  marks: number;
  objective: number;
  short: [slots: number, attempt: number, each: number];
  long: [slots: number, attempt: number, each: number];
}

const END_SEM: TheoryShape[] = [
  {
    credits: 4,
    label: "4 credits",
    minutes: 180,
    marks: 60,
    objective: 20,
    short: [7, 5, 4],
    long: [3, 2, 10],
  },
  {
    credits: 3,
    label: "3 credits",
    minutes: 120,
    marks: 45,
    objective: 10,
    short: [7, 5, 4],
    long: [3, 2, 7.5],
  },
  {
    credits: 2,
    label: "2 or 1 credit",
    minutes: 90,
    marks: 30,
    objective: 10,
    short: [7, 5, 2],
    long: [3, 2, 5],
  },
];

const SESSIONAL: TheoryShape[] = [
  {
    credits: 4,
    label: "4 credits",
    minutes: 60,
    marks: 20,
    objective: 4,
    short: [3, 2, 3],
    long: [2, 1, 10],
  },
  {
    credits: 3,
    label: "3 credits",
    minutes: 60,
    marks: 15,
    objective: 2,
    short: [3, 2, 3],
    long: [2, 1, 7],
  },
  {
    credits: 2,
    label: "2 or 1 credit",
    minutes: 60,
    marks: 10,
    objective: 2,
    short: [2, 1, 3],
    long: [2, 1, 5],
  },
];

function theoryGroups(s: TheoryShape, objectiveLayout: "TWO_COLUMN" | "ONE_COLUMN") {
  const [ss, sa, se] = s.short;
  const [ls, la, le] = s.long;
  const head = (slots: number, attempt: number) =>
    attempt === slots
      ? "Answer the following questions."
      : `Answer the following questions ${any(attempt)}.`;
  return [
    {
      key: "g1",
      type: "OBJECTIVE",
      heading: "Answer the following questions (Compulsory).",
      slots: s.objective,
      attempt: s.objective,
      marksEach: 1,
      compulsory: true,
      objectiveLayout,
    },
    { key: "g2", type: "SHORT", heading: head(ss, sa), slots: ss, attempt: sa, marksEach: se },
    { key: "g3", type: "LONG", heading: head(ls, la), slots: ls, attempt: la, marksEach: le },
  ] as const satisfies readonly GroupInput[];
}

function endSem(s: TheoryShape): SeedTemplate {
  return {
    seedKey: `pci2026-bpharm-theory-endsem-${s.credits}`,
    title: `PCI 2026 · B.Pharm · Theory · End-Semester · ${s.label}`,
    description: `KSV university paper, ${s.marks} marks, ${duration(s.minutes)}. Objective, short and long answer groups as PCI 2026 sets them.`,
    program: "B_PHARM",
    examKind: "END_SEMESTER",
    courseKind: "THEORY",
    creditTier: s.credits,
    durationMinutes: s.minutes,
    maxMarks: s.marks,
    structure: {
      numbering: { prefix: "Q.", separator: "" },
      marksStyle: "MARKS_COLON",
      parts: onePart([...theoryGroups(s, "TWO_COLUMN")]),
      footer: { text: "Best wishes", ornament: "ASTERISKS" },
    },
    header: {
      lines: [...ksvLines],
      dateRow: ksvDateRow,
      candidateField: "EXAM_NO",
      instructions: [
        "Attempt all groups. Group I is compulsory.",
        "Draw neat and labelled diagrams wherever necessary.",
        "The figure on the right indicates marks.",
      ],
      pageNumbers: "X_OF_Y",
    },
    style: {
      classSize: 12,
      body: { size: 11.7, leading: 13.9 },
      geometry: { left: 1, top: 0.9, width: 6.2, height: 9.7 },
    },
  };
}

function sessional(s: TheoryShape): SeedTemplate {
  return {
    seedKey: `pci2026-bpharm-theory-sessional-${s.credits}`,
    title: `PCI 2026 · B.Pharm · Theory · Sessional · ${s.label}`,
    description: `KBIPER internal sessional, ${s.marks} marks, 1 hour. Marks print beside each question.`,
    program: "B_PHARM",
    examKind: "SESSIONAL_1",
    courseKind: "THEORY",
    creditTier: s.credits,
    durationMinutes: s.minutes,
    maxMarks: s.marks,
    structure: {
      numbering: { prefix: "Q.", separator: "" },
      marksStyle: "MARKS_COLON",
      parts: onePart([...theoryGroups(s, "TWO_COLUMN")]),
      footer: { text: "", ornament: "NONE" },
    },
    header: {
      lines: [...kbiperLines],
      logoLeft: logoRef("kbiper"),
      dateRow: kbiperDateRow,
      candidateField: "ROLL_NO",
      instructions: ["Answer all the given questions."],
      pageNumbers: "X_OF_Y",
    },
    style: {
      classSize: 11,
      geometry: { left: 0.75, top: 0.9, width: 6.6, height: 10 },
      showMarksPerQuestion: true,
      coTagStyle: "BOLD",
      spacing: { afterHeader: 0.05, beforeGroup: 0.2 },
    },
  };
}

// ---------- PCI 2026 practical ----------

function practical(stage: "SESSIONAL" | "END"): SeedTemplate {
  const end = stage === "END";
  const [syn, major, minor, viva] = end ? [7.5, 10, 5, 7.5] : [2, 4, 2, 2];
  const one = (key: string, type: Group["type"], heading: string, marksEach: number) => ({
    key,
    type,
    heading,
    slots: 1,
    attempt: 1,
    marksEach,
    compulsory: true,
    showCoTag: "NONE" as const,
  });
  return {
    seedKey: `pci2026-bpharm-practical-${end ? "endsem" : "sessional"}`,
    title: `PCI 2026 · B.Pharm · Practical · ${end ? "End-Semester (30)" : "Sessional (10)"}`,
    description: `${end ? "KSV" : "KBIPER"} practical paper: synopsis, a major and a minor experiment, and viva voce. Set for 4 hours (courses with 4 or more lab hours a week); save a copy and choose 3 hours for the others.`,
    program: "B_PHARM",
    examKind: end ? "PRACTICAL_END" : "PRACTICAL_SESSIONAL",
    courseKind: "PRACTICAL",
    creditTier: 2,
    durationMinutes: 240,
    maxMarks: end ? 30 : 10,
    structure: {
      numbering: { prefix: "Q.", separator: "" },
      marksStyle: "PARENS",
      parts: onePart([
        one("syn", "SYNOPSIS", "Synopsis.", syn),
        one(
          "major",
          "PRACTICAL_PERFORM",
          "Perform the following practical (major experiment).",
          major,
        ),
        one(
          "minor",
          "PRACTICAL_PERFORM",
          "Perform the following practical (minor experiment).",
          minor,
        ),
        one("viva", "VIVA", "Viva voce.", viva),
      ]),
      footer: { text: end ? "Best wishes" : "", ornament: "NONE" },
    },
    header: end
      ? {
          lines: [...ksvLines],
          logoLeft: logoRef("ksv"),
          dateRow: ksvDateRow,
          candidateField: "EXAM_NO",
          instructions: [],
          pageNumbers: "NONE",
        }
      : {
          lines: [...kbiperLines],
          logoLeft: logoRef("kbiper"),
          dateRow: kbiperDateRow,
          candidateField: "ROLL_NO",
          instructions: [],
          pageNumbers: "NONE",
        },
    style: {
      classSize: 12,
      geometry: { left: 1, top: 0.9, width: 6.2, height: 9.7 },
      logoWidth: 0.11,
    },
  };
}

const synopsis: SeedTemplate = {
  seedKey: "pci2026-bpharm-synopsis",
  title: "PCI 2026 · B.Pharm · Synopsis (10 × 1, 10 minutes)",
  description: "The short MCQ quiz before a practical exam: ten one-mark questions.",
  program: "B_PHARM",
  examKind: "SYNOPSIS",
  courseKind: "PRACTICAL",
  creditTier: null,
  durationMinutes: 10,
  maxMarks: 10,
  structure: {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "BRACKETS",
    parts: onePart([
      {
        key: "mcq",
        type: "OBJECTIVE",
        heading: "Synopsis: Answer the following questions.",
        slots: 10,
        attempt: 10,
        marksEach: 1,
        compulsory: true,
        objectiveLayout: "TWO_COLUMN",
        showCoTag: "NONE",
      },
    ]),
    footer: { text: "", ornament: "NONE" },
  },
  header: {
    lines: [
      { text: "{{university}}", size: "large", bold: true },
      { text: "{{programLine}}", size: "large", bold: true },
      { text: "{{courseTitle}}", size: "large", bold: true },
      { text: "{{examTitle}}", size: "small", bold: true },
    ],
    logoLeft: logoRef("ksv"),
    dateRow: {
      style: "ULINE",
      left: "Time: {{duration}}",
      centre: "{{date}}",
      right: "Max marks: {{maxMarks}}",
    },
    candidateField: "EXAM_NO",
    instructions: [],
    pageNumbers: "NONE",
  },
  style: {
    classSize: 12,
    geometry: { left: 1, top: 1, width: 6.3, height: 10 },
    logoWidth: 0.11,
  },
};

// ---------- KSV legacy and Pharm.D ----------

const legacy: SeedTemplate = {
  seedKey: "ksv-legacy-external-75",
  title: "KSV Legacy · External · 75 marks · Section I/II",
  description:
    "Old-scheme university paper for ATKT students: two sections on separate answer sheets, each with objective, long and short groups.",
  program: "B_PHARM",
  examKind: "SUPPLEMENTARY_ATKT",
  courseKind: "THEORY",
  creditTier: null,
  durationMinutes: 180,
  maxMarks: 75,
  structure: {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "MARKS_COLON",
    parts: (["I", "II"] as const).map((roman, i) => ({
      key: `s${i + 1}`,
      title: `SECTION ${roman}`,
      separateAnswerSheet: true,
      groups: [
        {
          key: `s${i + 1}obj`,
          type: "OBJECTIVE" as const,
          heading: "Answer the following questions.",
          slots: 10,
          attempt: 10,
          marksEach: 1,
          compulsory: true,
        },
        {
          key: `s${i + 1}long`,
          type: "LONG" as const,
          heading: "Long answer the following questions (Any one).",
          slots: 2,
          attempt: 1,
          marksEach: 10,
        },
        {
          key: `s${i + 1}short`,
          type: "SHORT" as const,
          heading: `Short answer the following questions ${any(i === 0 ? 4 : 3)}.`,
          slots: 5,
          attempt: i === 0 ? 4 : 3,
          marksEach: 5,
        },
      ],
    })),
    footer: { text: "Best wishes", ornament: "NONE" },
  },
  header: {
    lines: [...ksvLines],
    dateRow: { ...ksvDateRow, style: "ULINE" },
    candidateField: "NONE",
    instructions: [
      "Answer both the sections in separate answer sheet.",
      "Draw neat and labeled diagram wherever necessary.",
      "The figure on the right indicates mark.",
    ],
    pageNumbers: "NONE",
  },
  style: {
    classSize: 12,
    body: { size: 11.7, leading: 13.9 },
    geometry: { left: 1, top: 1.1, width: 6.2, height: 9.5 },
    spacing: { afterHeader: 0.08, beforePart: 0.125, beforeGroup: 0.125, afterGroupHead: 0.03 },
  },
};

const pharmD: SeedTemplate = {
  seedKey: "ksv-pharmd-year-end-70",
  title: "KSV Pharm.D · Year-End · 70 marks",
  description:
    "Two sections of 35 marks: a compulsory 5-mark question, then any three of four 10-mark questions.",
  program: "PHARM_D",
  examKind: "YEAR_END",
  courseKind: "THEORY",
  creditTier: null,
  durationMinutes: 180,
  maxMarks: 70,
  structure: {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "BRACKETS",
    parts: (["I", "II"] as const).map((roman, i) => ({
      key: `s${i + 1}`,
      title: `SECTION ${roman}`,
      separateAnswerSheet: false,
      groups: [
        {
          key: `s${i + 1}c`,
          type: "SHORT" as const,
          heading: "Answer the following question (Compulsory).",
          slots: 1,
          attempt: 1,
          marksEach: 5,
          compulsory: true,
          showCoTag: "NONE" as const,
          numbering: "QUESTION" as const,
        },
        {
          key: `s${i + 1}l`,
          type: "LONG" as const,
          heading: "Answer the following questions (Any three).",
          slots: 4,
          attempt: 3,
          marksEach: 10,
          showCoTag: "NONE" as const,
          numbering: "QUESTION" as const,
        },
      ],
    })),
    footer: { text: "Best wishes", ornament: "NONE" },
  },
  header: {
    lines: [...ksvLines],
    dateRow: {
      style: "ULINE",
      left: "Date: {{date}}",
      centre: "Time: {{duration}}",
      right: "Max marks: {{maxMarks}}",
    },
    candidateField: "EXAM_NO",
    instructions: [
      "Questions 1 and 6 are compulsory.",
      "Attempt any three of the remaining four questions in each section.",
    ],
    pageNumbers: "NONE",
  },
  style: {
    classSize: 12,
    geometry: { left: 1, top: 1.3, width: 5.5, height: 9.45 },
    showMarksPerQuestion: true,
  },
};

const blank: SeedTemplate = {
  seedKey: "blank",
  title: "Blank template",
  description: "One group of questions and a plain header. Start here to build your own.",
  program: "B_PHARM",
  examKind: "CUSTOM",
  courseKind: "THEORY",
  creditTier: null,
  durationMinutes: 60,
  maxMarks: 10,
  structure: {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "MARKS_COLON",
    parts: onePart([
      {
        key: "g1",
        type: "FREE",
        heading: "Answer the following questions.",
        slots: 2,
        attempt: 2,
        marksEach: 5,
      },
    ]),
    footer: { text: "", ornament: "NONE" },
  },
  header: {
    lines: [
      { text: "{{institute}}", size: "large", bold: true },
      { text: "{{courseTitle}} ({{courseCode}})", size: "normal", bold: true },
      { text: "{{examTitle}}", size: "small", bold: false },
    ],
    dateRow: ksvDateRow,
    candidateField: "ROLL_NO",
    instructions: [],
    pageNumbers: "NONE",
  },
  style: {
    classSize: 12,
    geometry: { left: 1, top: 1, width: 6.2, height: 9.7 },
  },
};

export const BUILT_IN_TEMPLATES: readonly SeedTemplate[] = [
  ...END_SEM.map(endSem),
  ...SESSIONAL.map(sessional),
  practical("SESSIONAL"),
  practical("END"),
  synopsis,
  legacy,
  pharmD,
  blank,
];
