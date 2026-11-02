// Commit hygiene rules shared by the commit-msg hook and the CI job.
// Usage:
//   node scripts/commit-hygiene.mjs --message-file <path>   check one message (hook)
//   node scripts/commit-hygiene.mjs --range <rev-range>     check commits in git history (CI)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FORBIDDEN = /co-authored-by|generated with|claude|anthropic|\bai[- ]generated/i;
export const OWNER_NAME = "Krishnarajsinh Dodiya";
export const OWNER_EMAIL = "dodiyakh@gmail.com";

/** Lines git strips before storing the message (comment lines) are not checked. */
export function checkMessage(message) {
  const problems = [];
  const lines = message.split(/\r?\n/).filter((line) => !line.startsWith("#"));
  for (const line of lines) {
    if (FORBIDDEN.test(line)) {
      problems.push(`forbidden attribution text: "${line.trim()}"`);
    }
  }
  return problems;
}

export function checkIdentity({ authorName, authorEmail, committerName, committerEmail }) {
  const problems = [];
  if (authorName !== OWNER_NAME || authorEmail !== OWNER_EMAIL) {
    problems.push(
      `author must be ${OWNER_NAME} <${OWNER_EMAIL}>, got ${authorName} <${authorEmail}>`,
    );
  }
  if (committerName !== OWNER_NAME || committerEmail !== OWNER_EMAIL) {
    problems.push(
      `committer must be ${OWNER_NAME} <${OWNER_EMAIL}>, got ${committerName} <${committerEmail}>`,
    );
  }
  return problems;
}

function checkRange(range) {
  const SEP = "\u001e";
  const FIELD = "\u001f";
  const raw = execFileSync(
    "git",
    ["log", `--format=%H${FIELD}%an${FIELD}%ae${FIELD}%cn${FIELD}%ce${FIELD}%B${SEP}`, range],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const failures = [];
  let count = 0;
  for (const record of raw.split(SEP)) {
    if (!record.trim()) continue;
    const [hash, authorName, authorEmail, committerName, committerEmail, body = ""] = record
      .replace(/^\n/, "")
      .split(FIELD);
    count += 1;
    const problems = [
      ...checkIdentity({ authorName, authorEmail, committerName, committerEmail }),
      ...checkMessage(body),
    ];
    for (const problem of problems) failures.push(`${hash.slice(0, 10)}: ${problem}`);
  }
  return { count, failures };
}

function main(argv) {
  const [flag, value] = argv;
  if (flag === "--message-file" && value) {
    const problems = checkMessage(readFileSync(value, "utf8"));
    if (problems.length > 0) {
      console.error("Commit rejected by commit-hygiene:");
      for (const problem of problems) console.error(`  - ${problem}`);
      return 1;
    }
    return 0;
  }
  if (flag === "--range" && value) {
    const { count, failures } = checkRange(value);
    if (failures.length > 0) {
      console.error(`commit-hygiene: ${failures.length} problem(s) in ${count} commit(s):`);
      for (const failure of failures) console.error(`  - ${failure}`);
      return 1;
    }
    console.log(`commit-hygiene: ${count} commit(s) clean.`);
    return 0;
  }
  console.error("usage: commit-hygiene.mjs --message-file <path> | --range <rev-range>");
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
