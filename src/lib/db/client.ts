// The only place a Prisma client is made. Import it from src/lib/data only
// (enforced by ESLint), so every query passes the ownership rules there.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { dataPaths, getDataDir } from "@/lib/paths";
import { sqliteUrl } from "./url";

export type Db = PrismaClient;

/**
 * Opens an existing database file (migrations create it; opening never does),
 * switching it to WAL and enforcing foreign keys.
 */
export async function openDatabase(file: string): Promise<Db> {
  const adapter = new PrismaBetterSqlite3({
    url: sqliteUrl(file),
    timeout: 5_000,
    fileMustExist: true,
  });
  const db = new PrismaClient({ adapter });
  await db.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  return db;
}

/* v8 ignore start -- process-wide singleton over the real data folder */
const globalForDb = globalThis as unknown as { draftexDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.draftexDb ??= openDatabase(dataPaths(getDataDir()).database);
  return globalForDb.draftexDb;
}
/* v8 ignore stop */
