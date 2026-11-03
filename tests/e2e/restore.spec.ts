// Gate 9, the rest (D26): back up from the admin screen, restore on an empty
// data folder, and the paper still compiles identically. Two empty folders:
// one gets the backup as a pending restore and is applied when a second copy
// of DRAFTEX starts (D28); the other is filled by `npm run restore` (D35).
// Runs after papers.spec.ts, whose paper it checks. Test data only.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { unzipSync } from "fflate";
import { type APIRequestContext, type Page, expect, request, test } from "@playwright/test";
import { diffPages, renderPdf } from "../support/pdf";
import { ADMIN, FACULTY, asUser, signIn } from "./support";

test.describe.configure({ mode: "serial" });

const TITLE = "Invented Pharmacology Paper";
const PORT = 3214;
const SECOND = `http://127.0.0.1:${PORT}`;
const require = createRequire(import.meta.url);
const realTools = path.join(os.tmpdir(), "draftex-e2e-3211", "tools");

let before: Record<string, Uint8Array> = {};
let backupFile = "";
let pendingDir = "";
let scriptDir = "";
let server: ChildProcess | undefined;

/** A fresh empty data folder that shares the installed engine, as the e2e server's does. */
function emptyFolder(name: string): string {
  const dir = path.join(os.tmpdir(), `draftex-e2e-${name}`);
  removeFolder(dir);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(realTools)) {
    fs.symlinkSync(fs.realpathSync(realTools), path.join(dir, "tools"), "junction");
  }
  return dir;
}

function removeFolder(dir: string): void {
  const link = path.join(dir, "tools");
  if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(link);
  // Windows keeps a file locked for a moment after the process that held it exits.
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

const env = (dir: string) => ({
  ...process.env,
  DRAFTEX_DATA_DIR: dir,
  CHECKPOINT_DISABLE: "1",
  NEXT_TELEMETRY_DISABLED: "1",
});

/** The exported files of the owner's paper, by name inside the zip's folder. */
async function exportFiles(api: APIRequestContext, base: string, id: string) {
  const res = await api.post(`${base}/api/papers/${id}/export`, {
    headers: { Origin: base },
    data: { confirmed: true },
    timeout: 120_000,
  });
  expect(res.status(), await res.text().catch(() => "")).toBe(200);
  return Object.fromEntries(
    Object.entries(unzipSync(new Uint8Array(await res.body()))).map(([n, b]) => [
      n.split("/").slice(1).join("/"),
      b,
    ]),
  );
}

async function paperId(page: Page): Promise<string> {
  await page.goto("/papers");
  // The card's name starts with the title, then its status ("Draft"); the ATKT copy has "(ATKT)" between.
  await page.getByRole("link", { name: new RegExp(`^${TITLE} (Draft|Final)`) }).click();
  await expect(page).toHaveURL(/\/papers\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() as string;
}

test.afterAll(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server?.once("exit", resolve));
    server.kill();
    await exited;
  }
  for (const dir of [pendingDir, scriptDir]) if (dir) removeFolder(dir);
  if (backupFile) fs.rmSync(backupFile, { force: true });
});

test("the paper is exported before the backup", async ({ browser }) => {
  const page = await asUser(browser, FACULTY, FACULTY.own);
  const id = await paperId(page);
  before = await exportFiles(page.request, new URL(page.url()).origin, id);
  expect(Object.keys(before)).toContain("paper.tex");
});

test("an administrator backs up from the Backups screen", async ({ browser }) => {
  const page = await asUser(browser, ADMIN, ADMIN.password);
  await page.goto("/admin/backups");
  await expect(page.getByRole("heading", { name: "Backups", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back up now" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Backup saved." })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("cell", { name: "Made by hand" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", { name: /^Download the backup made/ })
    .first()
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^DRAFTEX-backup-.*-manual\.zip$/);
  backupFile = path.join(os.tmpdir(), file.suggestedFilename());
  await file.saveAs(backupFile);

  // The same file can be checked and staged here; cancelling leaves everything as it was.
  await page.getByLabel("Backup file").setInputFiles(backupFile);
  await page.getByRole("button", { name: "Restore this backup…" }).click();
  await page.getByRole("button", { name: "Check and restore" }).click();
  await expect(page.getByText(/is checked and ready/)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByText("A restore is waiting.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel the restore" }).click();
  await expect(page.getByText("A restore is waiting.")).toHaveCount(0);

  // A file that is not a backup is refused before anything is kept.
  const junk = path.join(os.tmpdir(), "not-a-backup.zip");
  fs.writeFileSync(junk, "PK not really");
  await page.getByLabel("Backup file").setInputFiles(junk);
  await page.getByRole("button", { name: "Restore this backup…" }).click();
  await page.getByRole("button", { name: "Check and restore" }).click();
  await expect(page.getByText("The backup file is damaged and cannot be opened.")).toBeVisible();
  fs.rmSync(junk);
});

test("npm run restore fills an empty data folder", () => {
  scriptDir = emptyFolder("restore-script");
  execFileSync(process.execPath, ["scripts/restore.ts", backupFile, "--yes"], {
    env: env(scriptDir),
    stdio: "pipe",
  });
  const db = new Database(path.join(scriptDir, "data.db"), { readonly: true });
  try {
    const titles = (db.prepare("SELECT title FROM Paper").all() as { title: string }[]).map(
      (r) => r.title,
    );
    expect(titles).toContain(TITLE);
  } finally {
    db.close();
  }
  expect(fs.readdirSync(path.join(scriptDir, "assets")).length).toBeGreaterThan(0);
});

test("a restore waiting in an empty folder is applied at start, and the paper is identical", async ({
  browser,
}) => {
  pendingDir = emptyFolder("restore-pending");
  fs.copyFileSync(backupFile, path.join(pendingDir, "restore-pending.zip"));
  server = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(PORT),
    ],
    { env: env(pendingDir), stdio: "ignore" },
  );
  const api = await request.newContext({ baseURL: SECOND });
  await expect
    .poll(async () => (await api.get("/login").catch(() => null))?.status(), { timeout: 90_000 })
    .toBe(200);
  expect(fs.existsSync(path.join(pendingDir, "restore-pending.zip"))).toBe(false);
  await api.dispose();

  const ctx = await browser.newContext({ baseURL: SECOND });
  try {
    const page = await ctx.newPage();
    await signIn(page, FACULTY.email, FACULTY.own);
    await expect(page.getByRole("heading", { name: `Welcome, ${FACULTY.name}` })).toBeVisible();
    const id = await paperId(page);
    const after = await exportFiles(page.request, SECOND, id);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const name of ["paper.tex", "key.tex", "README.txt"]) {
      expect(new TextDecoder().decode(after[name]), name).toBe(
        new TextDecoder().decode(before[name]),
      );
    }
    for (const name of Object.keys(before).filter((n) => n.startsWith("assets/"))) {
      expect(
        Buffer.from(after[name] as Uint8Array).equals(Buffer.from(before[name] as Uint8Array)),
      ).toBe(true);
    }
    for (const name of ["paper.pdf", "key.pdf"]) {
      const [a, b] = await Promise.all([
        renderPdf(before[name] as Uint8Array),
        renderPdf(after[name] as Uint8Array),
      ]);
      expect(a.length, name).toBe(b.length);
      for (const d of diffPages(a, b)) expect(d.changedPixels, `${name} page ${d.page}`).toBe(0);
    }
  } finally {
    await ctx.close();
  }
});
