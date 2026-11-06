// The export service (D32, D34) with a fake engine and a throwaway exports
// folder. Gate 8: someone else's paper, guessed by ID, is "not found".
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/data";
import { NotFoundError } from "@/lib/data";
import { CompileRejected, type CompileJob, type CompileResult } from "@/lib/latex/compile";
import { MISSING_IMAGE } from "@/server/images";
import { type ExportDeps, exportPaper } from "@/server/export";
import { createTestDb, type TestDb } from "../../support/db";
import { paperMeta, templateFields, testSlot } from "../data/fixtures";

let t: TestDb;
let me: Actor;
let other: Actor;
let admin: Actor;
let paperId: string;
let dir: string;
const NOW = new Date(2026, 10, 4, 10, 0);

async function user(email: string, role: "ADMIN" | "FACULTY"): Promise<Actor> {
  const u = await t.db.user.create({ data: { name: email, email, passwordHash: "x", role } });
  return { userId: u.id, role };
}

beforeAll(async () => {
  t = await createTestDb();
  me = await user("me@example.com", "FACULTY");
  other = await user("o@example.com", "FACULTY");
  admin = await user("a@example.com", "ADMIN");
  const tpl = await t.data.templates.create(me, templateFields("Export"));
  paperId = (await t.data.papers.create(me, tpl.id, paperMeta({ title: "Mid: term/1" }))).id;
  await t.data.papers.saveSlot(me, paperId, testSlot({ groupKey: "g2", position: 3, marks: 4 }));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "dx-export-"));
});
afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await t.close();
});

function ok(over: Partial<CompileResult> = {}): CompileResult {
  return {
    ok: true,
    pdf: Buffer.from("%PDF-1.5 fake"),
    diagnostics: [],
    log: "",
    timedOut: false,
    durationMs: 5,
    usedNetwork: false,
    ...over,
  };
}

function deps(
  compile: (job: CompileJob) => Promise<CompileResult> = async () => ok(),
  images: ExportDeps["images"] = async () => [],
): ExportDeps & { jobs: CompileJob[] } {
  const jobs: CompileJob[] = [];
  return {
    jobs,
    data: t.data,
    images,
    exportsDir: dir,
    now: () => NOW,
    compile: {
      compile: vi.fn((job: CompileJob) => {
        jobs.push(job);
        return compile(job);
      }),
    },
  };
}

const FOLDER = ["B.Pharm", "XX101T", "2026-11-04 Mid- term-1"];

describe("exportPaper", () => {
  it("asks first when questions are empty or have no answer", async () => {
    const d = deps();
    const r = await exportPaper(d, me, paperId, { confirmed: false });
    expect(r).toMatchObject({ ok: false, status: 409 });
    if (r.ok) return;
    expect(r.problems.map((p) => p.message)).toEqual([
      expect.stringMatching(/^\d+ empty questions are left out/),
      "Q.2(3) has no answer in the key.",
    ]);
    expect(d.jobs).toHaveLength(0);
  });

  it("writes the folder and returns the same files as a zip", async () => {
    await t.data.papers.saveSlot(
      me,
      paperId,
      testSlot({
        groupKey: "g2",
        position: 3,
        marks: 4,
        answerKey: testSlot().content,
        keyCriteria: [{ text: "Definition", marks: 3 }],
      }),
    );
    const d = deps();
    const r = await exportPaper(d, me, paperId, { confirmed: true });
    if (!r.ok) throw new Error(r.message);
    expect(r.fileName).toBe("2026-11-04 Mid- term-1.zip");
    expect(r.folder).toBe(path.join("exports", ...FOLDER));
    expect(r.warnings.map((w) => w.message)).toContain(
      "Q.2(3): The split-up marks add up to 3, but the question is worth 4.",
    );
    expect(d.jobs.map((j) => j.supersedeKey?.split(":")[1])).toEqual(["PAPER", "KEY"]);
    // The exported paper has no placeholders: empty questions are left out.
    expect(d.jobs[0]?.tex).not.toContain("Question not written yet");
    expect(d.jobs[1]?.tex).toContain("MARKING SCHEME");
    const folder = path.join(dir, ...FOLDER);
    expect(fs.readdirSync(folder).sort()).toEqual([
      ".draftex-paper",
      "README.txt",
      "key.pdf",
      "key.tex",
      "paper.pdf",
      "paper.tex",
    ]);
    const files = unzipSync(r.zip);
    expect(Object.keys(files).sort()).toEqual(
      ["README.txt", "key.pdf", "key.tex", "paper.pdf", "paper.tex"].map(
        (f) => `${FOLDER[2]}/${f}`,
      ),
    );
    expect(new TextDecoder().decode(files[`${FOLDER[2]}/paper.tex`])).toBe(
      fs.readFileSync(path.join(folder, "paper.tex"), "utf8"),
    );
    const history = await t.data.papers.listCompiles(me, paperId);
    expect(history.slice(0, 2).map((h) => h.kind)).toEqual(["KEY", "PAPER"]);
    // D55, D57: the export marks the paper Printed and keeps this version.
    expect(await t.data.papers.get(me, paperId)).toMatchObject({ status: "PRINTED" });
    expect((await t.data.papers.listVersions(me, paperId)).map((v) => v.reason)).toEqual([
      "EXPORT",
    ]);
  });

  it("replaces the same day's folder and leaves no temporary folder", async () => {
    const folder = path.join(dir, ...FOLDER);
    fs.writeFileSync(path.join(folder, "stale.txt"), "old");
    const r = await exportPaper(deps(), me, paperId, { confirmed: true });
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(folder, "stale.txt"))).toBe(false);
    expect(fs.readdirSync(path.dirname(folder)).filter((n) => n.startsWith("."))).toEqual([]);
  });

  it("gives another paper with the same title its own folder", async () => {
    const tpl = await t.data.templates.create(me, templateFields("Twin"));
    const twin = await t.data.papers.create(me, tpl.id, paperMeta({ title: "Mid: term/1" }));
    await t.data.papers.saveSlot(me, twin.id, testSlot({ answerKey: testSlot().content }));
    const r = await exportPaper(deps(), me, twin.id, { confirmed: true });
    if (!r.ok) throw new Error(r.message);
    expect(r.folder).toBe(path.join("exports", "B.Pharm", "XX101T", `${FOLDER[2]} (2)`));
    // The first paper still owns, and replaces, its own folder.
    const again = await exportPaper(deps(), me, paperId, { confirmed: true });
    expect(again.ok && again.folder).toBe(path.join("exports", ...FOLDER));
    expect(
      Object.keys(unzipSync(again.ok ? again.zip : new Uint8Array())).some((n) =>
        n.endsWith(".draftex-paper"),
      ),
    ).toBe(false);
    await t.data.papers.remove(me, twin.id);
  });

  it("copies the pictures the files use into assets/", async () => {
    const sha = "c".repeat(64);
    await t.data.assets.add(me, {
      sha256: sha,
      mime: "image/png",
      bytes: 9,
      originalName: "x.png",
    });
    const tpl = await t.data.templates.create(me, templateFields("Pic"));
    const p = await t.data.papers.create(me, tpl.id, paperMeta({ title: "Pic" }));
    await t.data.papers.saveSlot(
      me,
      p.id,
      testSlot({
        content: { type: "doc", content: [{ type: "image", attrs: { sha256: sha, ext: "png" } }] },
        answerKey: testSlot().content,
      }),
    );
    const src = path.join(dir, "pic.png");
    fs.writeFileSync(src, "png bytes");
    const d = deps(
      async () => ok(),
      async (names) => names.map((n) => ({ name: n, sourcePath: src })),
    );
    const r = await exportPaper(d, me, p.id, { confirmed: true });
    if (!r.ok) throw new Error(r.message);
    const file = `2026-11-04 Pic/assets/${sha}.png`;
    expect(new TextDecoder().decode(unzipSync(r.zip)[file])).toBe("png bytes");
    expect(fs.readFileSync(path.join(dir, "B.Pharm", "XX101T", file), "utf8")).toBe("png bytes");
    expect(d.jobs[0]?.tex).toContain(`assets/${sha}.png`);
  });

  it("stops on a failed compile, a missing picture, the rate limit and an empty paper", async () => {
    const failed = await exportPaper(
      deps(async () =>
        ok({
          ok: false,
          pdf: undefined,
          diagnostics: [
            {
              severity: "error",
              kind: "error",
              message: "Missing } inserted.",
              line: 9,
              slotId: "g2.1",
            },
          ],
        }),
      ),
      me,
      paperId,
      { confirmed: true },
    );
    expect(failed).toMatchObject({
      ok: false,
      status: 422,
      // The compacted g2.1 is the editor's g2.3.
      problems: [{ slotId: "g2.3", message: "Q.2(3) has an unmatched brace." }],
    });
    let n = 0;
    const keyFails = await exportPaper(
      deps(async () => (n++ === 0 ? ok() : ok({ ok: false, pdf: undefined, timedOut: true }))),
      me,
      paperId,
      { confirmed: true },
    );
    expect(keyFails).toMatchObject({
      ok: false,
      message: "Making the PDFs took too long. Try again.",
    });
    let m = 0;
    expect(
      await exportPaper(
        deps(async () => (m++ === 0 ? ok() : ok({ ok: false, pdf: undefined }))),
        me,
        paperId,
        { confirmed: true },
      ),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/answer key could not be made/) });
    expect(
      await exportPaper(
        deps(undefined, async () => MISSING_IMAGE),
        me,
        paperId,
        { confirmed: true },
      ),
    ).toMatchObject({ ok: false, status: 422, message: MISSING_IMAGE });
    expect(
      await exportPaper(
        deps(async () => {
          throw new CompileRejected("rate-limit", "Too many.");
        }),
        me,
        paperId,
        { confirmed: true },
      ),
    ).toMatchObject({ ok: false, status: 429 });
    await expect(
      exportPaper(
        deps(async () => {
          throw new Error("engine broke");
        }),
        me,
        paperId,
        { confirmed: true },
      ),
    ).rejects.toThrow("engine broke");
    const tpl = await t.data.templates.create(me, templateFields("Empty"));
    const empty = await t.data.papers.create(me, tpl.id, paperMeta());
    expect(await exportPaper(deps(), me, empty.id, { confirmed: true })).toMatchObject({
      ok: false,
      status: 422,
      message: "The paper has no questions yet, so there is nothing to export.",
    });
  });

  it("stops before compiling when text cannot be printed or no option is ticked", async () => {
    const tpl = await t.data.templates.create(me, templateFields("Bad"));
    const p = await t.data.papers.create(me, tpl.id, paperMeta());
    await t.data.papers.saveSlot(
      me,
      p.id,
      testSlot({
        content: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Pick one." }] },
            {
              type: "choices",
              content: [
                { type: "choice", content: [{ type: "text", text: "Yes" }] },
                { type: "choice", content: [{ type: "text", text: "No" }] },
              ],
            },
          ],
        },
      }),
    );
    const warn = await exportPaper(deps(), me, p.id, { confirmed: false });
    expect(warn.ok || warn.problems.map((x) => x.message)).toContain(
      "Q.1(1) has no correct option ticked.",
    );
    await t.data.papers.saveSlot(
      me,
      p.id,
      testSlot({
        answerKey: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "😀" }] }],
        },
      }),
    );
    const d = deps();
    expect(await exportPaper(d, me, p.id, { confirmed: true })).toMatchObject({
      ok: false,
      status: 422,
      problems: [{ slotId: "g1.1" }],
    });
    expect(d.jobs).toHaveLength(0);
  });
});

describe.each([
  ["another faculty member", () => other],
  ["an administrator", () => admin],
])("someone else's paper, exported by %s", (_label, who) => {
  it("is not found and nothing is written", async () => {
    const before = fs.readdirSync(dir, { recursive: true }).length;
    const d = deps();
    await expect(exportPaper(d, who(), paperId, { confirmed: true })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(d.jobs).toHaveLength(0);
    expect(fs.readdirSync(dir, { recursive: true }).length).toBe(before);
  });
});
