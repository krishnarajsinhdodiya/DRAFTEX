// Applies pending database migrations to the data folder. Safe to run again.
// Creates the default data folder first if none is configured.
// Usage: node scripts/db-migrate.ts
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { DataDirError, dataPaths, getDataDir } from "../src/lib/paths.ts";

try {
  const paths = dataPaths(getDataDir());
  console.log(`[db] Database: ${paths.database}`);
  const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, CHECKPOINT_DISABLE: "1" },
  });
  console.log("[db] Database is up to date.");
} catch (e) {
  if (e instanceof DataDirError) console.error(`[db] ${e.message}`);
  else console.error("[db] Migration failed; see the messages above.");
  process.exit(1);
}
