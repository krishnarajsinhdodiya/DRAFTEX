import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  OWNER_EMAIL,
  OWNER_NAME,
  checkIdentity,
  checkMessage,
} from "../../scripts/commit-hygiene.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const script = path.join(repoRoot, "scripts", "commit-hygiene.mjs");

describe("checkMessage", () => {
  it.each([
    "Co-Authored-By: Someone <someone@example.com>",
    "co-authored-by: lower case",
    "Generated with some tool",
    "Mentions Claude in the body",
    "Session trailer Claude-Session: abc",
    "Anthropic noreply address",
    "This is AI-generated",
    "this is ai generated",
  ])("rejects %j", (line) => {
    expect(checkMessage(`feat: something\n\n${line}\n`)).toHaveLength(1);
  });

  it.each([
    "feat(editor): add equation node",
    "fix(latex): escape ampersand in headings",
    "docs: explain the maintenance plan",
    "chore: bump paid dependencies",
  ])("accepts %j", (message) => {
    expect(checkMessage(message)).toEqual([]);
  });

  it("ignores comment lines that git strips", () => {
    expect(checkMessage("feat: x\n# Co-Authored-By: template comment\n")).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    expect(checkMessage("feat: x\r\n\r\nCo-Authored-By: y\r\n")).toHaveLength(1);
  });
});

describe("checkIdentity", () => {
  const owner = {
    authorName: OWNER_NAME,
    authorEmail: OWNER_EMAIL,
    committerName: OWNER_NAME,
    committerEmail: OWNER_EMAIL,
  };

  it("accepts the owner as author and committer", () => {
    expect(checkIdentity(owner)).toEqual([]);
  });

  it("rejects another author", () => {
    expect(checkIdentity({ ...owner, authorEmail: "other@example.com" })).toHaveLength(1);
  });

  it("rejects another committer", () => {
    expect(checkIdentity({ ...owner, committerName: "GitHub" })).toHaveLength(1);
  });
});

describe("commit-msg hook in a real repository", () => {
  let dir = "";
  const git = (...args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "dx-hook-"));
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("git", ["config", "user.name", OWNER_NAME], { cwd: dir });
    execFileSync("git", ["config", "user.email", OWNER_EMAIL], { cwd: dir });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
    execFileSync("git", ["config", "core.hooksPath", path.join(repoRoot, ".githooks")], {
      cwd: dir,
    });
    writeFileSync(path.join(dir, "file.txt"), "content\n");
    execFileSync("git", ["add", "file.txt"], { cwd: dir });
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects a commit carrying a Co-Authored-By trailer", () => {
    const result = git(
      "commit",
      "-m",
      "feat: add file",
      "-m",
      "Co-Authored-By: Someone <someone@example.com>",
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("commit-hygiene");
    expect(git("rev-parse", "--verify", "-q", "HEAD").status).not.toBe(0);
  });

  it("accepts a clean conventional commit", () => {
    const result = git("commit", "-m", "feat: add file", "-m", "Explains why.");
    expect(result.status).toBe(0);
  });

  it("range check passes on clean history and fails on a dirty commit", () => {
    const clean = spawnSync(process.execPath, [script, "--range", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(clean.status).toBe(0);

    git(
      "commit",
      "--allow-empty",
      "--no-verify",
      "-m",
      "chore: sneaky",
      "-m",
      "Generated with a tool",
    );
    const dirty = spawnSync(process.execPath, [script, "--range", "HEAD"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(dirty.status).toBe(1);
    expect(dirty.stderr).toContain("forbidden attribution text");
  });

  it("prints usage on bad arguments", () => {
    const result = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(result.status).toBe(2);
  });
});
