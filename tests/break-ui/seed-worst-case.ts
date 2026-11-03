// Dev only (/break-ui): fills a THROWAWAY e2e database with 200 worst-case
// templates, cloned from a built-in so they stay valid. Never run it on a
// real data folder. Usage: node tests/break-ui/seed-worst-case.ts <data.db>
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";

const file = process.argv[2] ?? "";
if (!path.resolve(file).startsWith(path.resolve(os.tmpdir()))) {
  console.error("Refusing: give the data.db of a throwaway folder under the OS temp folder.");
  process.exit(1);
}
const db = new Database(file);
const src = db
  .prepare("SELECT * FROM Template WHERE seedKey = 'pci2026-bpharm-theory-endsem-3'")
  .get() as Record<string, unknown> | undefined;
if (!src) throw new Error("Run first-run setup first so the built-ins exist.");

const long = "Dr. Aleksandra Wiśniewska-Kowalczyk";
const ownerId = randomUUID();
db.prepare(
  "INSERT OR IGNORE INTO User (id, name, email, passwordHash, role, createdAt, updatedAt) VALUES (?, ?, ?, 'x', 'FACULTY', ?, ?)",
).run(
  ownerId,
  long,
  `aleksandra.wisniewska-kowalczyk.${Date.now()}@kbiper-pharmacy-department.example.com`,
  Date.now(),
  Date.now(),
);

const titles = [
  "Pharmaceutical Organic Chemistry II · End-Semester · Supplementary (ATKT) for old-scheme students who appeared in 2023 and 2024, with structures from CorelDRAW and two separate answer sheets",
  "Jo",
  "Pharmacology",
  "Biopharmaceutics & Pharmacokinetics (BP604T) — Sessional II — Improvement — Copy of copy (copy)",
  "Pharmacognosy and Phytochemistry I – revised after the Board of Studies meeting – v12-final-FINAL",
  "Industrial Pharmacy I [BP502T] Sessional 1 — 7.5-mark long answers",
];
const structure = JSON.parse(src.structure as string);
structure.parts[0].groups[1].heading =
  "Answer the following questions in detail, with neat and labelled diagrams, chemical structures and mechanisms wherever necessary, and write the CO number against each answer (Any five).";
const insert = db.prepare(
  `INSERT INTO Template (id, title, description, ownerId, visibility, builtIn, program, examKind, courseKind, creditTier, ruleSetId, durationMinutes, maxMarks, structure, style, header, createdAt, updatedAt, version)
   VALUES (?, ?, ?, ?, 'GLOBAL', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
);
const tx = db.transaction(() => {
  for (let i = 0; i < 200; i++) {
    const title = titles[i % titles.length] + (i >= titles.length ? ` (${i})` : "");
    insert.run(
      randomUUID(),
      title.slice(0, 200),
      i % 3 === 0
        ? "Used for the April and November sessions. Keep the instructions in sync with the university circular; the 7.5-mark long answers follow PCI 2026 for 3-credit courses and the CO tags follow the department's mapping sheet."
        : "",
      ownerId,
      src.program,
      src.examKind,
      src.courseKind,
      src.creditTier,
      src.ruleSetId,
      src.durationMinutes,
      src.maxMarks,
      JSON.stringify(structure),
      src.style,
      src.header,
      Date.now() - i * 60_000,
      Date.now() - i * 60_000,
    );
  }
});
tx();
console.log("Added 200 worst-case templates.");
