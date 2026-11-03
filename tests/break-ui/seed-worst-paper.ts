// Dev only (/break-ui): adds worst-case papers to a THROWAWAY e2e database:
// one full of realistic extremes, one empty. Questions are invented; drug
// names are public chemistry. Never run it on a real data folder.
// Usage: node tests/break-ui/seed-worst-paper.ts <data.db>
import { randomUUID } from "node:crypto";
import fs from "node:fs";
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
// Phase 6: worst-case answer keys. The longest split-up row the schema takes (300),
// all 20 rows, quarter marks, and a total that does not match the question.
const LONG_ROW =
  "Correct structure of propranolol hydrochloride with the naphthyloxy ring, the secondary alcohol on the side chain and the isopropylamino group drawn and labelled, the salt form named, and the mechanism of non-selective β-adrenergic blockade explained with one clinical use".slice(
    0,
    300,
  );
const key = db.prepare(
  "UPDATE Slot SET answerKey = ?, keyCriteria = ? WHERE paperId = ? AND groupKey = ? AND position = ?",
);
key.run(
  JSON.stringify(
    doc(
      para(
        text("Methylenedioxymethamphetaminehydrochloridemonohydrate is the full name expected."),
      ),
    ),
  ),
  JSON.stringify(
    Array.from({ length: 20 }, (_, i) => ({
      text: i === 0 ? LONG_ROW : i === 1 ? "Jo" : `Point ${i + 1} of the expected answer`,
      marks: i % 4 === 0 ? 0.25 : 0.5,
    })),
  ),
  worst,
  "g2",
  3,
);
key.run(null, JSON.stringify([{ text: "Definition", marks: 1 }]), worst, "g2", 1);

// Phase 6: a backups folder after months of use: 14 daily, many by hand (never pruned).
const backups = path.join(path.dirname(file), "backups");
fs.mkdirSync(backups, { recursive: true });
const stamp = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}0000`;
for (let i = 0; i < 40; i++) {
  const d = new Date(2026, 9, 31 - (i % 30), 9 + (i % 10));
  const kind =
    i < 14 ? "auto" : i % 3 === 0 ? "before-update" : i % 3 === 1 ? "before-restore" : "manual";
  // Sparse: the listed size is real, the disk space is not used.
  const f = path.join(backups, `DRAFTEX-backup-${stamp(d)}-${kind}.zip`);
  fs.writeFileSync(f, "");
  fs.truncateSync(f, i === 0 ? 900 : 1024 * 1024 * (1 + i));
}

const empty = insertPaper("Jo", "", "");
console.log(`worst=${worst}\nempty=${empty}`);
