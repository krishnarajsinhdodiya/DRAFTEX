// The only place a Prisma client is made. Import it from src/lib/data only
// (enforced by ESLint), so every query passes the ownership rules there.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { dataPaths, getDataDir } from "@/lib/paths";
import { sqliteUrl } from "./url";

/**
 * Prisma error messages repeat the query's arguments, which can be question
 * text or a password hash, and Next.js prints unexpected errors to the log
 * (SPEC §11.7). Errors leave the client with only their last line (what was
 * wrong, naming fields, never values) and the error code.
 */
export function scrubbedError(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientValidationError) {
    const last = e.message.trim().split("\n").at(-1) ?? "";
    return new Prisma.PrismaClientValidationError(`Invalid database query. ${last}`, {
      clientVersion: e.clientVersion,
    });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    const target = (e.meta as { target?: unknown } | undefined)?.target;
    return new Prisma.PrismaClientKnownRequestError(
      `Database request failed (${e.code}${Array.isArray(target) ? ` on ${target.join(", ")}` : ""}).`,
      { code: e.code, clientVersion: e.clientVersion, meta: e.meta },
    );
  }
  return e;
}

function withScrubbedErrors(client: PrismaClient) {
  return client.$extends({
    name: "scrubbed-errors",
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (e) {
          throw scrubbedError(e);
        }
      },
    },
  });
}

export type Db = ReturnType<typeof withScrubbedErrors>;

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
  const db = withScrubbedErrors(new PrismaClient({ adapter, errorFormat: "minimal" }));
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
