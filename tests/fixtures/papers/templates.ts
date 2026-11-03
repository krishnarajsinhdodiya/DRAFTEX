// Template fixtures for golden tests. Layout values mirror the house style
// observed in the reference sources; no question text comes from them.
import type { TemplateInput } from "@/lib/paper/schema";

const ksvHeaderLines = [
  { text: "{{university}}", size: "large", bold: true },
  { text: "{{examTitle}}", size: "normal", bold: false },
  { text: "{{programLine}}", size: "large", bold: true },
  { text: "{{courseTitle}} [{{courseCode}}]", size: "large", bold: true },
] as const;

/** docs/reference/templates/pci2026-bpharm-endsem-4credit-ksv.tex */
export const pciEndSem4CreditKsv: TemplateInput = {
  structure: {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "MARKS_COLON",
    parts: [
      {
        key: "p1",
        groups: [
          {
            key: "g1",
            type: "OBJECTIVE",
            heading: "Answer the following questions (Compulsory).",
            slots: 20,
            attempt: 20,
            marksEach: 1,
            objectiveLayout: "TWO_COLUMN",
          },
          {
            key: "g2",
            type: "SHORT",
            heading: "Answer the following questions (Any five).",
            slots: 7,
            attempt: 5,
            marksEach: 4,
          },
          {
            key: "g3",
            type: "LONG",
            heading: "Answer the following questions (Any two).",
            slots: 3,
            attempt: 2,
            marksEach: 10,
          },
        ],
      },
    ],
    footer: { text: "Best wishes", ornament: "ASTERISKS" },
  },
  header: {
    lines: [...ksvHeaderLines],
    dateRow: {
      style: "RULE",
      left: "Date: {{date}}",
      centre: "Duration: {{duration}}",
      right: "Max marks: {{maxMarks}}",
    },
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

/** Old-scheme KSV external: 75 marks in SECTION I / SECTION II, underlined date row. */
export const ksvLegacy75: TemplateInput = {
  structure: {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "MARKS_COLON",
    parts: ["I", "II"].map((roman, i) => ({
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
          heading: `Short answer the following questions (Any ${i === 0 ? "four" : "three"}).`,
          slots: 5,
          attempt: i === 0 ? 4 : 3,
          marksEach: 5,
        },
      ],
    })),
    footer: { text: "Best wishes", ornament: "NONE" },
  },
  header: {
    lines: [...ksvHeaderLines],
    dateRow: {
      style: "ULINE",
      left: "Date: {{date}}",
      centre: "Duration: {{duration}}",
      right: "Max marks: {{maxMarks}}",
    },
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

/** KBIPER internal sessional: logo left, Roll No, page x/y, bold CO tags, marks per question. */
export const kbiperSessional = (logo: { sha256: string; ext: "png" }): TemplateInput => ({
  structure: {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "MARKS_COLON",
    parts: [
      {
        key: "p1",
        groups: [
          {
            key: "mcq",
            type: "OBJECTIVE",
            heading: "Answer the following questions (MCQs).",
            slots: 10,
            attempt: 10,
            marksEach: 1,
          },
          {
            key: "short",
            type: "SHORT",
            heading: "Answer the following questions (Any two).",
            slots: 3,
            attempt: 2,
            marksEach: 5,
          },
          {
            key: "long",
            type: "LONG",
            heading: "Answer the following question.",
            slots: 1,
            attempt: 1,
            marksEach: 10,
          },
        ],
      },
    ],
    footer: { text: "", ornament: "NONE" },
  },
  header: {
    lines: [
      { text: "{{institute}}", size: "large", bold: true },
      { text: "A Constituent College of KSV", size: "small", bold: false },
      { text: "{{programLine}}", size: "normal", bold: true },
      { text: "{{courseTitle}} ({{courseCode}})", size: "large", bold: true },
      { text: "{{examTitle}}", size: "small", bold: true },
    ],
    logoLeft: logo,
    dateRow: {
      style: "ULINE",
      left: "{{date}}",
      centre: "Duration: {{duration}}",
      right: "Max. marks: {{maxMarks}}",
    },
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
});

/** Practical end-semester: synopsis, two perform lists, viva. */
export const practicalEnd: TemplateInput = {
  structure: {
    numbering: { prefix: "Q:", separator: "" },
    marksStyle: "PARENS",
    parts: [
      {
        key: "p1",
        groups: [
          {
            key: "syn",
            type: "SYNOPSIS",
            heading: "Synopsis.",
            slots: 1,
            attempt: 1,
            marksEach: 5,
          },
          {
            key: "major",
            type: "PRACTICAL_PERFORM",
            heading: "Perform the following practical (any one, allotted by the examiner).",
            slots: 1,
            attempt: 1,
            marksEach: 10,
          },
          {
            key: "minor",
            type: "PRACTICAL_PERFORM",
            heading: "Perform the following practical.",
            slots: 1,
            attempt: 1,
            marksEach: 10,
          },
          { key: "viva", type: "VIVA", heading: "Viva-voce.", slots: 1, attempt: 1, marksEach: 5 },
        ],
      },
    ],
    footer: { text: "Best wishes", ornament: "NONE" },
  },
  header: {
    lines: [...ksvHeaderLines],
    dateRow: {
      style: "RULE",
      left: "Date: {{date}}",
      centre: "Duration: {{duration}}",
      right: "Max marks: {{maxMarks}}",
    },
    candidateField: "SEAT_NO",
    instructions: [],
    pageNumbers: "NONE",
  },
  style: {
    classSize: 12,
    geometry: { left: 1, top: 0.9, width: 6.2, height: 9.7 },
  },
};

/** Synopsis quiz before practicals: 10 × 1 MCQs, 10 minutes. */
export const synopsisQuiz: TemplateInput = {
  structure: {
    numbering: { prefix: "Q.", separator: "" },
    marksStyle: "BRACKETS",
    parts: [
      {
        key: "p1",
        groups: [
          {
            key: "mcq",
            type: "OBJECTIVE",
            heading: "Choose the correct answer.",
            slots: 10,
            attempt: 10,
            marksEach: 1,
            objectiveLayout: "FOUR_COLUMN",
          },
        ],
      },
    ],
    footer: { text: "", ornament: "ASTERISKS" },
  },
  header: {
    lines: [
      { text: "{{institute}}", size: "large", bold: true },
      { text: "{{examTitle}}: {{courseTitle}}", size: "normal", bold: true },
    ],
    dateRow: {
      style: "RULE",
      left: "{{date}}",
      centre: "Time: {{duration}}",
      right: "Marks: {{maxMarks}}",
    },
    candidateField: "ROLL_NO",
    instructions: [],
    pageNumbers: "NONE",
  },
  style: {
    classSize: 11,
    geometry: { left: 0.8, top: 0.8, width: 6.6, height: 10 },
  },
};
