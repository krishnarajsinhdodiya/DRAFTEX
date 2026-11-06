// Dev only (/break-ui, Phase 9): fills a THROWAWAY e2e database with
// worst-case papers for the Papers list, filters, Recent papers and the
// Versions dialog: 250 papers, titles and course titles at their limits,
// one-letter titles, odd academic-year text, every status, and one paper
// with the full 20 versions. Invented text only. Never run it on a real data
// folder. Needs one paper with a version first (mark any paper Final).
// Usage: node tests/break-ui/seed-worst-retrieval.ts <data.db>
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const file = process.argv[2] ?? "";
if (!path.resolve(file).startsWith(path.resolve(os.tmpdir()))) {
  console.error("Refusing: give the data.db of a throwaway folder under the OS temp folder.");
  process.exit(1);
}
const db = new Database(file);
const src = db
  .prepare(
    "SELECT p.* FROM Paper p JOIN PaperSnapshot s ON s.paperId = p.id WHERE p.deletedAt IS NULL LIMIT 1",
  )
  .get() as Record<string, unknown> | undefined;
if (!src) throw new Error("Mark one paper Final first, so a paper with a version exists.");
const snap = db.prepare("SELECT data FROM PaperSnapshot WHERE paperId = ? LIMIT 1").get(src.id) as {
  data: string;
};

const titles = [
  // 200 characters, the schema limit (paperMetaSchema.title).
  "Pharmaceutical Organic Chemistry III · End-Semester · Supplementary (ATKT) for old-scheme students who appeared in 2023 and 2024, with structures, mechanisms and two answer sheets for section B".slice(
    0,
    200,
  ),
  "Jo",
  "Q",
  "Sessional 1 – Pharmacology (re-test, revised after the board meeting)",
  "Industrial Pharmacy II: Pilot plant scale-up techniques",
];
const courses: [string, string][] = [
  [
    "BP607T AEC1",
    "Pharmaceutical Regulatory Science, Quality Assurance and Intellectual Property Rights for Pharmaceutical Industry (Theory)",
  ],
  ["X", ""],
  ["", ""],
  ["BP604T", "Medicinal Chemistry III"],
  // 40 characters, the course code limit.
  ["ELECTIVE-ADVANCED-INSTRUMENTATION-TECHNI", "Advanced Instrumentation Techniques"],
];
const years = ["2026-27", "2025-26", "AY 2026–27 (odd sem)", "", "2027", "2026-2027"];
const kinds = [
  "END_SEMESTER",
  "SESSIONAL_1",
  "SUPPLEMENTARY_ATKT",
  "PRACTICAL_END",
  "SYNOPSIS",
  "YEAR_END",
];
const statuses = ["DRAFT", "FINAL", "PRINTED"];

const insert = db.prepare(
  `INSERT INTO Paper (id, ownerId, templateId, templateSnapshot, title, courseId, courseCode, courseTitle,
     program, semesterOrYear, examKind, academicYear, status, printedAt, createdAt, updatedAt, version)
   VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
);
const now = Date.now();
db.transaction(() => {
  for (let i = 0; i < 250; i++) {
    const [code, title] = courses[i % courses.length] as [string, string];
    const status = statuses[i % statuses.length] as string;
    const at = now - i * 3_600_000;
    insert.run(
      randomUUID(),
      src.ownerId,
      src.templateId,
      src.templateSnapshot,
      `${titles[i % titles.length]}${i >= titles.length ? ` ${i}` : ""}`.slice(0, 200),
      code,
      title,
      src.program,
      src.semesterOrYear,
      kinds[i % kinds.length],
      years[i % years.length],
      status,
      status === "PRINTED" ? at : null,
      at,
      at,
    );
  }
  // The paper that already has a version gets the full 20 (D58).
  const add = db.prepare(
    "INSERT INTO PaperSnapshot (id, paperId, reason, sha256, data, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (let i = 1; i < 20; i++) {
    add.run(
      randomUUID(),
      src.id,
      i % 2 ? "EXPORT" : "FINAL",
      createHash("sha256").update(`${i}`).digest("hex"),
      snap.data,
      now - i * 86_400_000,
    );
  }
})();
console.log(`Added 250 papers and 19 versions to ${String(src.title)}.`);
