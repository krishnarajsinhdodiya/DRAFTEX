// Prisma CLI config. The database always lives in the data folder
// (memory.md "Data dir outside repo"); there is no DATABASE_URL.
// peekDataDir never creates a folder, so `prisma generate` has no side effects;
// `npm run db:migrate` creates the default folder first when needed.
import { defineConfig } from "prisma/config";
import { sqliteUrl } from "./src/lib/db/url.ts";
import { dataPaths, peekDataDir } from "./src/lib/paths.ts";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: sqliteUrl(dataPaths(peekDataDir()).database) },
});
