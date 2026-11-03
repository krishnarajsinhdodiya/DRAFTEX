// CI only: creates <runner temp>/draftex-data and exports DRAFTEX_DATA_DIR
// for later steps (the runner context is not available in job-level env).
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.env.RUNNER_TEMP ?? "", "draftex-data");
if (!process.env.RUNNER_TEMP || !process.env.GITHUB_ENV) {
  console.error("ci-data-dir.mjs is meant for GitHub Actions only.");
  process.exit(1);
}
fs.mkdirSync(dir, { recursive: true });
fs.appendFileSync(process.env.GITHUB_ENV, `DRAFTEX_DATA_DIR=${dir}\n`);
console.log(`DRAFTEX_DATA_DIR=${dir}`);
