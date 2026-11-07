// Upgrading from earlier versions (roadmap rule; D28, D35, D84): backups made
// by v0.8.0, v0.10.0 and v0.11.0 (tests/fixtures/upgrade, invented data, made by
// scripts/make-upgrade-fixture.ts) are restored into this version with
// `npm run restore`; the start applies the newer migrations. Their templates,
// papers and questions must come through unchanged, their exports must look
// exactly like the ones those versions made, and their questions must go into
// the question bank (Phase 11). The v0.11.0 paper holds an Advanced LaTeX
// block, so its unchanged export also covers the Phase 12 sanitiser (D95).
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { unzipSync } from "fflate";
import { expect, request, test } from "@playwright/test";
import { diffPages, renderPdf } from "../support/pdf";
import { closeOpenContexts, signIn } from "./support";

test.describe.configure({ mode: "serial", timeout: 180_000 });

test.afterEach(closeOpenContexts);

const FROMS = ["v0.8.0", "v0.10.0", "v0.11.0"] as const;
const FIXTURE = path.resolve("tests", "fixtures", "upgrade");
const ADMIN = { name: "Upgrade Admin", email: "upgrade@example.test", password: "upgrade fixture" };
const PAPER = "Upgrade Example Paper";
const PORT = 3220;
const BASE = `http://127.0.0.1:${PORT}`;
const realTools = path.join(os.tmpdir(), "draftex-e2e-3211", "tools");
const dir = path.join(os.tmpdir(), "draftex-e2e-upgrade");
let server: ChildProcess | undefined;

function removeFolder(d: string): void {
  const link = path.join(d, "tools");
  if (fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) fs.unlinkSync(link);
  fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

const env = {
  ...process.env,
  DRAFTEX_DATA_DIR: dir,
  CHECKPOINT_DISABLE: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};

/** The rows a user made, without columns added by later migrations. */
function rows(file: string) {
  const db = new Database(file, { readonly: true });
  try {
    return {
      templates: db
        .prepare(
          "SELECT id, ownerId, title, visibility, structure, style, header, version FROM Template ORDER BY id",
        )
        .all(),
      papers: db
        .prepare(
          `SELECT id, ownerId, templateId, templateSnapshot, title, courseId, courseCode, courseTitle,
             program, semesterOrYear, examKind, academicYear, examDate, instructionsOverride, status,
             version FROM Paper ORDER BY id`,
        )
        .all(),
      slots: db.prepare("SELECT * FROM Slot ORDER BY id").all(),
      assets: db.prepare("SELECT * FROM Asset ORDER BY sha256").all(),
      // The Question table was an empty stub before Phase 11.
      questions: db.prepare("SELECT id, ownerId FROM Question ORDER BY id").all(),
    };
  } finally {
    db.close();
  }
}

async function stopServer() {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server?.once("exit", resolve));
    server.kill();
    await exited;
  }
  server = undefined;
}

test.afterAll(async () => {
  await stopServer();
  removeFolder(dir);
});

for (const FROM of FROMS)
  test(`a ${FROM} backup restores into this version unchanged`, async ({ browser }) => {
    await stopServer();
    removeFolder(dir);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(realTools)) {
      fs.symlinkSync(fs.realpathSync(realTools), path.join(dir, "tools"), "junction");
    }
    const zip = path.join(FIXTURE, `${FROM}-backup.zip`);
    execFileSync(process.execPath, ["scripts/restore.ts", zip, "--yes"], { env, stdio: "pipe" });
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ port: PORT }));
    const original = path.join(dir, "original.db");
    fs.writeFileSync(
      original,
      unzipSync(new Uint8Array(fs.readFileSync(zip)))["data.db"] as Uint8Array,
    );
    const before = rows(original);
    expect(before.papers.length).toBeGreaterThan(0);
    expect(before.slots.length).toBeGreaterThan(0);
    expect(before.questions).toEqual([]);

    // The start applies the migrations this version added.
    server = spawn(process.execPath, [path.resolve("server.ts")], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Keep the server's own words: a start that never answers must say why.
    let output = "";
    const keep = (b: Buffer) => void (output = (output + b.toString()).slice(-20_000));
    server.stdout?.on("data", keep);
    server.stderr?.on("data", keep);
    const started = Date.now();
    const api = await request.newContext({ baseURL: BASE });
    try {
      await expect
        .poll(
          async () => {
            if (server?.exitCode !== null) return `exited ${server?.exitCode}`;
            return (await api.get("/login").catch(() => null))?.status();
          },
          { timeout: 90_000 },
        )
        .toBe(200);
    } catch (err) {
      throw new Error(`${(err as Error).message}\n--- server output ---\n${output}`);
    }
    console.log(`upgrade server answered after ${Date.now() - started} ms`);
    await api.dispose();
    expect(rows(path.join(dir, "data.db"))).toEqual(before);

    const ctx = await browser.newContext({ baseURL: BASE });
    try {
      const page = await ctx.newPage();
      await signIn(page, ADMIN.email, ADMIN.password);
      await expect(page.getByRole("heading", { name: `Welcome, ${ADMIN.name}` })).toBeVisible();

      // The private template opens and its preview compiles.
      const template = before.templates.find(
        (t) => (t as { title: string }).title === "Upgrade Example Template",
      ) as { id: string } | undefined;
      expect(template).toBeDefined();
      const preview = await page.request.get(`/api/templates/${template?.id}/preview`);
      expect(preview.status()).toBe(200);

      // A Final paper (v0.8.0) or Printed one (v0.10.0 export, D55) stays so: read-only (D56).
      await page.goto("/papers");
      await page.getByRole("link", { name: new RegExp(`^${PAPER} (Final|Printed)`) }).click();
      await expect(
        page.getByRole("note").filter({ hasText: /This paper is (Final|Printed)/ }),
      ).toBeVisible();
      const id = page.url().split("/").pop() as string;

      // Its export looks exactly like the one v0.8.0 made.
      const res = await page.request.post(`/api/papers/${id}/export`, {
        headers: { Origin: BASE },
        data: { confirmed: true },
        timeout: 120_000,
      });
      expect(res.status(), await res.text().catch(() => "")).toBe(200);
      const files = Object.fromEntries(
        Object.entries(unzipSync(new Uint8Array(await res.body()))).map(([n, b]) => [
          n.split("/").slice(1).join("/"),
          b,
        ]),
      );
      for (const name of ["paper", "key"]) {
        const [a, b] = await Promise.all([
          renderPdf(files[`${name}.pdf`] as Uint8Array),
          renderPdf(new Uint8Array(fs.readFileSync(path.join(FIXTURE, `${FROM}-${name}.pdf`)))),
        ]);
        expect(a.length, name).toBe(b.length);
        for (const d of diffPages(a, b)) expect(d.changedPixels, `${name} page ${d.page}`).toBe(0);
      }

      // Its tagged question goes into the question bank (Phase 11, D77).
      await page.getByRole("button", { name: "Add to bank" }).click();
      const report = page.getByRole("dialog", { name: "1 question added to the bank" });
      await expect(report).toContainText("Skipped");
      await report.getByRole("button", { name: "OK" }).click();
      await page.goto("/bank");
      await expect(page.getByText("1 question, most recently changed first")).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
