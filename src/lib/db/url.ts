// SQLite connection URL for a database file. Forward slashes keep Windows
// paths (C:\…) valid for both the Prisma CLI and the better-sqlite3 adapter.
export function sqliteUrl(file: string): string {
  return `file:${file.replaceAll("\\", "/")}`;
}
