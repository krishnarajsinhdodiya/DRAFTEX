// Applies the real migrations to a new SQLite file (no vitest imports, so the
// global setup can use it outside a test worker).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../prisma/migrations");

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
