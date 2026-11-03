// Dev only (/break-ui): adds worst-case papers to a THROWAWAY e2e database:
// one full of realistic extremes, one empty. Questions are invented; drug
// names are public chemistry. Never run it on a real data folder.
// Usage: node tests/break-ui/seed-worst-paper.ts <data.db>
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const file = process.argv[2] ?? "";
if (!path.resolve(file).startsWith(path.resolve(os.tmpdir()))) {
  console.error("Refusing: give the data.db of a throwaway folder under the OS temp folder.");
  process.exit(1);
}
const db = new Database(file);
const owner = db.prepare("SELECT id FROM User ORDER BY createdAt LIMIT 1").get() as
  { id: string } | undefined;
const t = db
  .prepare("SELECT * FROM Template WHERE seedKey = 'pci2026-bpharm-theory-endsem-4'")
  .get() as Record<string, unknown> | undefined;
if (!owner || !t) throw new Error("Run first-run setup first so the built-ins exist.");

const snapshot = JSON.stringify({
  title: t.title,
  program: t.program,
  examKind: t.examKind,
  courseKind: t.courseKind,
  creditTier: t.creditTier,
  durationMinutes: t.durationMinutes,
  maxMarks: t.maxMarks,
  structure: JSON.parse(t.structure as string),
  style: JSON.parse(t.style as string),
  header: JSON.parse(t.header as string),
});

const text = (s: string) => ({ type: "text", text: s });
const para = (...c: unknown[]) => ({ type: "paragraph", content: c });
const doc = (...blocks: unknown[]) => ({ type: "doc", content: blocks });
const choices = (opts: string[], columns?: number) => ({
  type: "choices",
  attrs: { ...(columns ? { columns } : {}), correct: 0 },
  content: opts.map((o) => ({ type: "choice", content: [text(o)] })),
});

const LONG_OPTIONS = [
  "1-(isopropylamino)-3-(1-naphthyloxy)propan-2-ol hydrochloride",
  "N-(4-hydroxyphenyl)acetamide",
  "Acetylsalicylic acid",
  "Jo",
];

function insertPaper(title: string, courseCode: string, courseTitle: string): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO Paper (id, ownerId, templateId, templateSnapshot, title, courseCode, courseTitle, program, semesterOrYear, examKind, academicYear, status, createdAt, updatedAt, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'B_PHARM', 6, 'END_SEMESTER', '2026-27', 'DRAFT', ?, ?, 1)`,
  ).run(id, owner!.id, t!.id, snapshot, title, courseCode, courseTitle, Date.now(), Date.now());
  return id;
}

const slot = db.prepare(
  `INSERT INTO Slot (id, paperId, partKey, groupKey, position, content, marks, coTag, bloomLevel)
   VALUES (?, ?, 'p1', ?, ?, ?, ?, ?, ?)`,
);

const worst = insertPaper(
  "Pharmaceutical Organic Chemistry II · End-Semester · Supplementary (ATKT) for old-scheme students who appeared in 2023 and 2024, with structures and two answer sheets".slice(
    0,
    200,
  ),
  "BP607T AEC1",
  "Pharmaceutical Regulatory Science, Quality Assurance and Intellectual Property Rights for Pharmaceutical Industry (Theory)",
);
db.transaction(() => {
  for (let i = 1; i <= 20; i++) {
    const columns = i % 5 === 0 ? 4 : undefined;
    slot.run(
      randomUUID(),
      worst,
      "g1",
      i,
      JSON.stringify(
        doc(
          para(
            text(
              i === 3
                ? "Which of the following is the IUPAC name of propranolol, the non-selective β-adrenergic receptor antagonist used in hypertension, angina pectoris and migraine prophylaxis?"
                : `Invented multiple-choice question ${i}?`,
            ),
          ),
          choices(LONG_OPTIONS, columns),
        ),
      ),
      1,
      i === 1 ? "BP607TAEC1.05" : null,
      i === 2 ? "UNDERSTAND" : null,
    );
  }
  // A 7.5-mark override, a compile error, and a long unbroken word.
  slot.run(
    randomUUID(),
    worst,
    "g2",
    1,
    JSON.stringify(doc(para(text("Explain the invented mechanism.")))),
    7.5,
    null,
    null,
  );
  slot.run(
    randomUUID(),
    worst,
    "g2",
    2,
    JSON.stringify(
      doc(para(text("Evaluate "), { type: "mathInline", attrs: { latex: "\\frac{a}" } })),
    ),
    4,
    null,
    null,
  );
  slot.run(
    randomUUID(),
    worst,
    "g2",
    3,
    JSON.stringify(doc(para(text("Name: Methylenedioxymethamphetaminehydrochloridemonohydrate.")))),
    4,
    null,
    null,
  );
})();
const empty = insertPaper("Jo", "", "");
console.log(`worst=${worst}\nempty=${empty}`);
