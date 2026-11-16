// D131/D134: the exam_kinds migration on a database written by v0.15.0.
// Rows are inserted with raw SQL before the migration runs. Invented data only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, expect, it } from "vitest";

const DIR = path.resolve(import.meta.dirname, "../../../prisma/migrations");
const TARGET = "20261116180000_exam_kinds";
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

const snap = (kind: string) => JSON.stringify({ title: "Invented", examKind: kind, structure: {} });

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-mig-"));
  db = new Database(path.join(tmp, "data.db"));
  run((n) => n < TARGET);
  db.exec(`INSERT INTO "User" (id, name, email, passwordHash, role, createdAt, updatedAt)
           VALUES ('u1', 'Invented', 'u1@example.test', 'x', 'FACULTY', 0, 0)`);
  const tpl = db.prepare(`SELECT sql FROM sqlite_master WHERE name = 'Template'`).get() as {
    sql: string;
  };
  expect(tpl.sql).toContain("examKind");
  // Columns the test does not name get a neutral value (0 for times, "{}" otherwise).
  const ins = (table: string, row: Record<string, unknown>) => {
    const keys = Object.keys(row);
    db.prepare(
      `INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    ).run(...Object.values(row));
  };
  const cols = (table: string) =>
    (
      db.prepare(`PRAGMA table_info("${table}")`).all() as {
        name: string;
        notnull: number;
        dflt_value: unknown;
        pk: number;
      }[]
    )
      .filter((c) => c.notnull && c.dflt_value === null && !c.pk)
      .map((c) => c.name);
  const fill = (table: string, row: Record<string, unknown>) => {
    const full: Record<string, unknown> = { ...row };
    for (const c of cols(table)) if (!(c in full)) full[c] = c.endsWith("At") ? 0 : "{}";
    ins(table, full);
  };
  fill("Template", {
    id: "t1",
    ownerId: "u1",
    examKind: "PRACTICAL_SESSIONAL",
    title: "T",
    program: "B_PHARM",
    courseKind: "PRACTICAL",
  });
  fill("Paper", {
    id: "p1",
    ownerId: "u1",
    examKind: "PRACTICAL_SESSIONAL",
    title: "P",
    templateSnapshot: snap("PRACTICAL_SESSIONAL"),
  });
  fill("Paper", {
    id: "p2",
    ownerId: "u1",
    examKind: "SESSIONAL_2",
    title: "Q",
    templateSnapshot: snap("SESSIONAL_2"),
  });
  fill("PaperSnapshot", {
    id: "s1",
    paperId: "p1",
    reason: "FINAL",
    sha256: "x",
    data: JSON.stringify({
      examKind: "PRACTICAL_SESSIONAL",
      templateSnapshot: JSON.parse(snap("PRACTICAL_SESSIONAL")),
    }),
  });
  for (const [i, g] of ["SESSIONAL", "END_SEMESTER", "PRACTICAL", "ATKT", "OTHER"].entries()) {
    fill("Blueprint", {
      id: `b${i}`,
      ownerId: "u1",
      courseCode: "XX601T",
      examGroup: g,
      unit: "MARKS",
      tolerance: 1,
      targets: "[]",
    });
  }
  run((n) => n >= TARGET);
});
afterAll(() => {
  db?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

it("renames practical sessional papers, templates and their JSON copies", () => {
  const kinds = db
    .prepare(`SELECT id, examKind, templateSnapshot FROM "Paper" ORDER BY id`)
    .all() as {
    id: string;
    examKind: string;
    templateSnapshot: string;
  }[];
  expect(kinds.map((k) => k.examKind)).toEqual(["PRACTICAL_SESSIONAL_1", "SESSIONAL_2"]);
  expect(JSON.parse(kinds[0]!.templateSnapshot).examKind).toBe("PRACTICAL_SESSIONAL_1");
  expect(JSON.parse(kinds[1]!.templateSnapshot).examKind).toBe("SESSIONAL_2");
  expect(db.prepare(`SELECT examKind FROM "Template"`).pluck().get()).toBe("PRACTICAL_SESSIONAL_1");
  const data = JSON.parse(db.prepare(`SELECT data FROM "PaperSnapshot"`).pluck().get() as string);
  expect(data.examKind).toBe("PRACTICAL_SESSIONAL_1");
  expect(data.templateSnapshot.examKind).toBe("PRACTICAL_SESSIONAL_1");
});

it("maps blueprint groups to one exact exam each (D134)", () => {
  const rows = db.prepare(`SELECT id, examKind FROM "Blueprint" ORDER BY id`).all();
  expect(rows).toEqual([
    { id: "b0", examKind: "SESSIONAL_1" },
    { id: "b1", examKind: "END_SEMESTER" },
    { id: "b2", examKind: "PRACTICAL_SESSIONAL_1" },
    { id: "b3", examKind: "SUPPLEMENTARY_ATKT" },
    { id: "b4", examKind: "CUSTOM" },
  ]);
  expect(() =>
    db.exec(`INSERT INTO "Blueprint" (id, ownerId, courseCode, examKind, unit, tolerance, targets, updatedAt)
             VALUES ('dup', 'u1', 'XX601T', 'SESSIONAL_1', 'MARKS', 1, '[]', 0)`),
  ).toThrow(/UNIQUE/);
});
