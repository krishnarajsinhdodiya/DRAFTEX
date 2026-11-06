// Vitest global setup: builds the migrated template database once, before any
// test worker starts, and hands its path to the workers (inject("dbTemplate")).
// Each worker used to replay every migration inside the first setup hook it
// ran; on windows-latest that alone passed the 10 s hook limit, failing a
// different file each time (runs 42251776929, 42260059011).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { TestProject } from "vitest/node";
import { applyMigrations } from "./migrations";

declare module "vitest" {
  export interface ProvidedContext {
    dbTemplate: string;
  }
}

export default function setup(project: TestProject): () => void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "draftex-db-template-"));
  const file = path.join(dir, "data.db");
  applyMigrations(file);
  // Fold any journal into the main file so a plain copy is complete.
  const db = new Database(file);
  db.pragma("journal_mode = DELETE");
  db.close();
  project.provide("dbTemplate", file);
  return () => fs.rmSync(dir, { recursive: true, force: true });
}
