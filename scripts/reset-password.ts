// Gives an account a new temporary password from the DRAFTEX computer itself
// (D49): the way back in when the only administrator has forgotten theirs.
// DRAFTEX must be stopped; the reset is applied when it next starts.
// Usage: npm run reset-password -- <email>
import fs from "node:fs";
import { stageReset, temporaryPassword } from "../src/lib/auth/offline-reset.ts";
import { hashPassword } from "../src/lib/auth/password.ts";
import { appRunning } from "../src/lib/lock.ts";
import { DataDirError, dataPaths, getDataDir } from "../src/lib/paths.ts";

const say = (msg: string) => console.log(`[reset-password] ${msg}`);
function stop(msg: string): never {
  console.error(`[reset-password] ${msg}`);
  process.exit(1);
}

const email = process.argv
  .slice(2)
  .find((a) => !a.startsWith("--"))
  ?.trim()
  .toLowerCase();
if (!email || !email.includes("@")) {
  stop('Say whose password to reset: npm run reset-password -- "name@example.com"');
}
try {
  const paths = dataPaths(getDataDir());
  if (!fs.existsSync(paths.database)) stop(`There is no DRAFTEX database in ${paths.root}.`);
  if (appRunning(paths)) stop("DRAFTEX is running. Close its window first, then run this again.");
  const password = temporaryPassword();
  stageReset(paths.root, {
    email,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  });
  say(`Temporary password for ${email}:`);
  console.log(`\n    ${password}\n`);
  say("Write it down now; it is not shown again or saved anywhere readable.");
  say("Start DRAFTEX. Its window confirms the reset; then sign in with this password");
  say("and choose a new one. Running this command again replaces the waiting reset.");
} catch (e) {
  if (e instanceof DataDirError) stop(e.message);
  throw e;
}
