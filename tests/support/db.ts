// A fresh SQLite database per test file, built from the real migrations.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inject } from "vitest";
import { dataLayer, type DataLayer } from "@/lib/data";
import { type Db, openDatabase } from "@/lib/db/client";

export interface TestDb {
  db: Db;
  data: DataLayer;
  file: string;
  close: () => Promise<void>;
}

export { applyMigrations } from "./migrations";

/** The migrated template built once by the global setup (tests/support/db-template.ts). */
function migratedTemplate(): string {
  const file = inject("dbTemplate");
  if (!file || !fs.existsSync(file)) {
    throw new Error("No migrated template database: run the tests through vitest's config.");
  }
  return file;
}

/** Writes a fully migrated database to `file` by copying the per-worker template. */
export function copyMigratedDatabase(file: string): void {
  fs.copyFileSync(migratedTemplate(), file);
}

export async function createTestDb(): Promise<TestDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-db-"));
  const file = path.join(dir, "data.db");
  // Replaying every migration per test took over 10 s on the Windows runner; a copy does not.
  copyMigratedDatabase(file);
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
