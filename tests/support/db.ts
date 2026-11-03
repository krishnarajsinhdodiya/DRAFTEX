// A fresh SQLite database per test file, built from the real migrations.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { dataLayer, type DataLayer } from "@/lib/data";
import { type Db, openDatabase } from "@/lib/db/client";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../prisma/migrations");

export interface TestDb {
  db: Db;
  data: DataLayer;
  file: string;
  close: () => Promise<void>;
}

export function applyMigrations(file: string): void {
  const sqlite = new Database(file);
  try {
    const dirs = fs
      .readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const d of dirs)
      sqlite.exec(fs.readFileSync(path.join(MIGRATIONS, d, "migration.sql"), "utf8"));
  } finally {
    sqlite.close();
  }
}

/** One migrated database per test worker; each test database is a copy of it. */
let migrated: string | undefined;
function migratedTemplate(): string {
  if (migrated && fs.existsSync(migrated)) return migrated;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-db-template-"));
  const file = path.join(dir, "data.db");
  applyMigrations(file);
  // Fold any journal into the main file so a plain copy is complete.
  const db = new Database(file);
  db.pragma("journal_mode = DELETE");
  db.close();
  process.once("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
  migrated = file;
  return file;
}

export async function createTestDb(): Promise<TestDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-db-"));
  const file = path.join(dir, "data.db");
  // Replaying every migration per test took over 10 s on the Windows runner; a copy does not.
  fs.copyFileSync(migratedTemplate(), file);
  const db = await openDatabase(file);
  return {
    db,
    data: dataLayer(db),
    file,
    close: async () => {
      await db.$disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
