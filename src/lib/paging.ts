// Keyset pages (Phase 16, D129/D130) for the bank, the picker and the papers
// list: newest changed first, ties broken by id, 50 to a page, Older/Newer
// cursors in the address. Server side (cursors use Buffer).
import { z } from "zod";

export const PAGE_SIZE = 50;

const cursorSchema = z.object({
  /** COALESCE(updatedAt, createdAt) of the edge row, in whole milliseconds since 1970. */
  t: z.number().int().min(0).max(8.64e15),
  /** Id of the edge row (uuid). */
  id: z.string().min(1).max(64),
});
export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify({ t: c.t, id: c.id }), "utf8").toString("base64url");
}

/** A cursor from the address bar; anything that is not one of ours reads as "first page". */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw || raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const r = cursorSchema.safeParse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * The order key in SQL: whole milliseconds, because the stored text is not one
 * format (the adapter writes "+00:00", a JavaScript date reads "Z").
 */
export function msSql(column: string): string {
  return `CAST(round((julianday(${column}) - 2440587.5) * 86400000) AS INTEGER)`;
}

/** Cursor fields of a page request: `after` = older than the cursor, `before` = newer. */
export const pageRequestSchema = z.object({
  after: z.string().max(200).optional(),
  before: z.string().max(200).optional(),
});

export interface Page<T> {
  rows: T[];
  /** Cursor for the next older page, or null when this is the oldest. */
  older: string | null;
  /** Cursor for the next newer page, or null when this is the newest. */
  newer: string | null;
  pageSize: number;
}

/**
 * Builds a page from rows the caller already holds (all of them, filtered),
 * with the same order and cursor rules as the SQL pages: (time, id) descending.
 */
export function pageOf<T extends { id: string }>(
  all: T[],
  time: (row: T) => Date,
  request: { after?: string; before?: string },
  size = PAGE_SIZE,
): Page<T> {
  const key = (r: T) => ({ t: time(r).getTime(), id: r.id });
  const cmp = (a: Cursor, b: Cursor) =>
    a.t !== b.t ? b.t - a.t : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  const sorted = [...all].sort((a, b) => cmp(key(a), key(b)));
  const before = decodeCursor(request.before);
  const after = before ? null : decodeCursor(request.after);
  let rows: T[];
  let more: boolean;
  if (before) {
    const newer = sorted.filter((r) => cmp(key(r), before) < 0);
    more = newer.length > size;
    rows = newer.slice(-size);
  } else {
    const older = after ? sorted.filter((r) => cmp(key(r), after) > 0) : sorted;
    more = older.length > size;
    rows = older.slice(0, size);
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  const hasOlder = before ? true : more;
  const hasNewer = before ? more : after !== null;
  return {
    rows,
    older: hasOlder && last ? encodeCursor(key(last)) : null,
    newer: hasNewer && first ? encodeCursor(key(first)) : null,
    pageSize: size,
  };
}
