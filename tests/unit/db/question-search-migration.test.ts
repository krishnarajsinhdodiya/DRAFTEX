// D112/D125/D126: the question_search migration fills the index from existing
// questions, and the triggers keep it in step. Invented data only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, expect, it } from "vitest";

const DIR = path.resolve(import.meta.dirname, "../../../prisma/migrations");
const TARGET = "20261117090000_question_search";
let tmp: string;
let db: Database.Database;

function run(filter: (name: string) => boolean) {
  for (const d of fs
    .readdirSync(DIR)
    .filter((n) => !n.endsWith(".toml"))
    .sort()
    .filter(filter)) {
    db.exec(fs.readFileSync(path.join(DIR, d, "migration.sql"), "utf8"));
  }
}

const key = (text: string) =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

function insert(id: string, row: Record<string, unknown>) {
  const full = { id, ownerId: "u1", createdAt: 0, sharing: "PRIVATE", version: 1, ...row };
  const keys = Object.keys(full);
  db.prepare(
    `INSERT INTO "Question" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
  ).run(...Object.values(full));
}

const hits = (match: string) =>
  (
    db
      .prepare(
        `SELECT question_id FROM question_fts WHERE question_fts MATCH ? ORDER BY question_id`,
      )
      .all(match) as { question_id: string }[]
  ).map((r) => r.question_id);

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-fts-"));
  db = new Database(path.join(tmp, "data.db"));
  run((n) => n < TARGET);
  db.exec(`INSERT INTO "User" (id, name, email, passwordHash, role, createdAt, updatedAt)
           VALUES ('u1', 'Invented', 'u1@example.test', 'x', 'FACULTY', 0, 0)`);
  insert("q1", {
    searchText: "Name the isobutylphenyl derivative used as a painkiller.",
    answerKey: key("Ibuprofen"),
    tags: JSON.stringify(["100%_sure", "Café"]),
    courseCode: "XX604T",
    courseTitle: "Invented Chemistry",
    coTag: "XX604T.01, XX604T.03",
  });
  insert("q2", { searchText: "Define bioavailability.", tags: "not json", answerKey: "{broken" });
  insert("q3", { searchText: null });
  run((n) => n >= TARGET);
});

afterAll(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

it("fills one index row per existing question, broken JSON included", () => {
  expect(db.prepare(`SELECT count(*) AS n FROM question_fts`).get()).toEqual({ n: 3 });
  expect(hits('"bioavailab"')).toEqual(["q2"]);
});

it("indexes text inside words, the answer, tags, course and both COs", () => {
  expect(hits('"butyl"')).toEqual(["q1"]);
  expect(hits('"ibuprofen"')).toEqual(["q1"]);
  expect(hits('"100%_sure"')).toEqual(["q1"]);
  expect(hits('"cafe"')).toEqual(["q1"]);
  expect(hits('"invented chem"')).toEqual(["q1"]);
  expect(hits('"XX604T.03"')).toEqual(["q1"]);
});

it("keeps the index in step on insert, update and delete", () => {
  insert("q4", { searchText: "Explain zero-order kinetics." });
  expect(hits('"zero-order"')).toEqual(["q4"]);
  db.prepare(
    `UPDATE "Question" SET searchText = 'Explain first-order kinetics.' WHERE id = 'q4'`,
  ).run();
  expect(hits('"zero-order"')).toEqual([]);
  expect(hits('"first-order"')).toEqual(["q4"]);
  db.prepare(`UPDATE "Question" SET marks = 2 WHERE id = 'q4'`).run();
  expect(
    db.prepare(`SELECT count(*) AS n FROM question_fts WHERE question_id = 'q4'`).get(),
  ).toEqual({ n: 1 });
  db.prepare(`DELETE FROM "Question" WHERE id = 'q4'`).run();
  expect(hits('"first-order"')).toEqual([]);
  expect(db.prepare(`SELECT count(*) AS n FROM question_fts`).get()).toEqual({ n: 3 });
});

it("survives VACUUM (the index is keyed by id, not rowid)", () => {
  db.exec("VACUUM");
  expect(hits('"butyl"')).toEqual(["q1"]);
  db.prepare(`DELETE FROM "Question" WHERE id = 'q1'`).run();
  expect(hits('"butyl"')).toEqual([]);
});
