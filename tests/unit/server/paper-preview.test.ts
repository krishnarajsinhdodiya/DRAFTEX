import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/data";
import { NotFoundError } from "@/lib/data";
import { CompileRejected, type CompileJob, type CompileResult } from "@/lib/latex/compile";
import type { Diagnostic } from "@/lib/latex/log";
import { paperDate, paperInput, programLine } from "@/lib/paper/assemble";
import { questionNumbers } from "@/lib/paper/numbering";
import { errorSummary, explain, fromDiagnostics, slotLabel } from "@/lib/paper/problems";
import { MISSING_IMAGE } from "@/server/images";
import { paperPreview, paperPreviewCache, type PaperPreviewDeps } from "@/server/paper-preview";
import { createTestDb, type TestDb } from "../../support/db";
import { paperMeta, templateFields, testSlot } from "../data/fixtures";
import { pciEndSem4CreditKsv } from "../../fixtures/papers/templates";

let t: TestDb;
let me: Actor;
let paperId: string;

beforeAll(async () => {
  t = await createTestDb();
  const u = await t.db.user.create({
    data: { name: "P", email: "p@example.com", passwordHash: "x", role: "FACULTY" },
  });
  me = { userId: u.id, role: "FACULTY" };
  const tpl = await t.data.templates.create(me, templateFields("Preview"));
  paperId = (
    await t.data.papers.create(me, tpl.id, paperMeta({ examDate: new Date("2026-11-03") }))
  ).id;
  await t.data.papers.saveSlot(me, paperId, testSlot({ groupKey: "g2", position: 3, marks: 4 }));
});
afterAll(() => t.close());

function result(over: Partial<CompileResult> = {}): CompileResult {
  return {
    ok: true,
    pdf: Buffer.from("%PDF-1.5"),
    diagnostics: [],
    log: "",
    timedOut: false,
    durationMs: 12,
    usedNetwork: false,
    ...over,
  };
}

function deps(
  compile: (job: CompileJob) => Promise<CompileResult>,
  images: PaperPreviewDeps["images"] = async () => [],
): PaperPreviewDeps & { jobs: CompileJob[] } {
  const jobs: CompileJob[] = [];
  return {
    jobs,
    data: t.data,
    images,
    cache: paperPreviewCache(),
    compile: {
      compile: vi.fn((job: CompileJob) => {
        jobs.push(job);
        return compile(job);
      }),
    },
  };
}

describe("paperPreview", () => {
  it("compiles the saved paper once per change, newest wins, and records the job", async () => {
    const d = deps(async () => result());
    const first = await paperPreview(d, me, paperId);
    expect(first).toMatchObject({ ok: true, cached: false, problems: [] });
    expect(await paperPreview(d, me, paperId)).toMatchObject({ ok: true, cached: true });
    expect(d.jobs).toHaveLength(1);
    const job = d.jobs[0] as CompileJob;
    expect(job.supersedeKey).toBe(`paper-preview:${me.userId}:${paperId}`);
    expect(job.tex).toContain("Date: 03/11/2026");
    expect(job.tex).toContain("B.Pharm Semester I");
    expect(job.slotRanges?.map((r) => r.slotId)).toContain("g2.3");
    const history = await t.data.papers.listCompiles(me, paperId);
    expect(history[0]).toMatchObject({ kind: "PAPER", status: "SUCCEEDED", durationMs: 12 });
  });

  it("puts engine problems on the question that caused them", async () => {
    const diag: Diagnostic = {
      severity: "error",
      kind: "error",
      message: "Missing } inserted.",
      line: 80,
      slotId: "g2.3",
    };
    // The second compile (without the refused question) fails too: nothing to show.
    const d = deps(async () => result({ ok: false, pdf: undefined, diagnostics: [diag] }));
    // A fresh edit so the cached PDF does not answer.
    await t.data.papers.saveSlot(me, paperId, testSlot({ groupKey: "g2", position: 3, marks: 3 }));
    const r = await paperPreview(d, me, paperId);
    expect(r).toMatchObject({
      ok: false,
      status: 422,
      problems: [{ level: "error", slotId: "g2.3", message: "Q.2(3) has an unmatched brace." }],
    });
    expect(d.jobs).toHaveLength(2);
    expect(d.jobs[1]?.tex).toContain("This question could not be typeset");

    // When the rest compiles, the paper shows with the question left out and still flagged.
    let n = 0;
    const second = deps(async () =>
      n++ === 0 ? result({ ok: false, pdf: undefined, diagnostics: [diag] }) : result(),
    );
    await t.data.papers.saveSlot(
      me,
      paperId,
      testSlot({ groupKey: "g2", position: 3, marks: 2.5 }),
    );
    expect(await paperPreview(second, me, paperId)).toMatchObject({
      ok: true,
      problems: [{ level: "error", slotId: "g2.3" }],
    });
    // A paper-wide error (no question to blame) is not retried.
    const wide = deps(async () =>
      result({ ok: false, pdf: undefined, diagnostics: [{ ...diag, slotId: undefined }] }),
    );
    await t.data.papers.saveSlot(me, paperId, testSlot({ groupKey: "g2", position: 3, marks: 2 }));
    expect(await paperPreview(wide, me, paperId)).toMatchObject({ ok: false });
    expect(wide.jobs).toHaveLength(1);
    const history = await t.data.papers.listCompiles(me, paperId);
    expect(history.map((h) => h.errorSummary)).toContain("brace@g2.3:80");
    expect(history[0]).toMatchObject({ status: "FAILED", errorSummary: "brace:80" });
  });

  it("keeps notes but still returns the PDF", async () => {
    const note: Diagnostic = {
      severity: "warning",
      kind: "overfull",
      message: "Overfull \\hbox (12.0pt too wide) in paragraph",
      overfullPt: 12,
      slotId: "g2.3",
    };
    const d = deps(async () => result({ diagnostics: [note] }));
    await t.data.papers.saveSlot(
      me,
      paperId,
      testSlot({ groupKey: "g2", position: 3, marks: 1.5 }),
    );
    expect(await paperPreview(d, me, paperId)).toMatchObject({
      ok: true,
      problems: [{ level: "note", message: "Q.2(3) has a line that is too wide for the page." }],
    });
  });

  it("stops before compiling on unprintable text or a missing picture", async () => {
    const d = deps(async () => result());
    await t.data.papers.saveSlot(
      me,
      paperId,
      testSlot({
        groupKey: "g3",
        position: 1,
        marks: 10,
        content: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Smile 😀" }] }],
        },
      }),
    );
    const r = await paperPreview(d, me, paperId);
    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(r.problems[0]).toMatchObject({ slotId: "g3.1", level: "error" });
    expect(r.problems[0]?.message).toMatch(/^Q\.3\(1\): /);
    await t.data.papers.clearSlot(me, paperId, { groupKey: "g3", position: 1 });

    const noImages = deps(
      async () => result(),
      async () => MISSING_IMAGE,
    );
    expect(await paperPreview(noImages, me, paperId)).toMatchObject({
      ok: false,
      message: MISSING_IMAGE,
    });
    expect(d.jobs).toHaveLength(0);
  });

  it("reports a timeout, a newer preview, the rate limit, and someone else's paper", async () => {
    await t.data.papers.saveSlot(me, paperId, testSlot({ groupKey: "g2", position: 3, marks: 1 }));
    const slow = deps(async () => result({ ok: false, pdf: undefined, timedOut: true }));
    expect(await paperPreview(slow, me, paperId)).toMatchObject({
      message: "The preview took too long to make. Try again.",
    });
    for (const [reason, status] of [
      ["superseded", 409],
      ["rate-limit", 429],
    ] as const) {
      const d = deps(() => Promise.reject(new CompileRejected(reason, "x")));
      expect(await paperPreview(d, me, paperId)).toMatchObject({ ok: false, status });
    }
    const boom = deps(() => Promise.reject(new Error("engine missing")));
    await expect(paperPreview(boom, me, paperId)).rejects.toThrow("engine missing");
    await expect(
      paperPreview(
        deps(async () => result()),
        { userId: "someone", role: "ADMIN" },
        paperId,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("paper assembly", () => {
  it("formats the header facts like the reference papers", () => {
    expect(paperDate(null)).toBe("");
    expect(paperDate(new Date("2027-04-09"))).toBe("09/04/2027");
    expect(programLine("PHARM_D", 2)).toBe("Pharm.D Year II");
    expect(programLine("B_PHARM", 12)).toBe("B.Pharm Semester 12");
  });

  it("replaces the instructions when the paper overrides them and omits CO tags it lacks", () => {
    const input = paperInput(
      {
        snapshot: {
          ...templateFields("x"),
          description: undefined,
          creditTier: 4,
        } as never,
        courseCode: "XX101T",
        courseTitle: "Invented",
        program: "B_PHARM",
        semesterOrYear: 3,
        examKind: "SESSIONAL_1",
        examDate: null,
        instructionsOverride: ["Only this."],
        slots: [testSlot({ coTag: null }) as never],
      },
      "OMIT",
    );
    expect(input.template.header.instructions).toEqual(["Only this."]);
    expect(input.meta).toMatchObject({ examTitle: "Sessional Examination I", duration: "3 hours" });
    expect(input.slots[0]).not.toHaveProperty("coTag");
    expect(input.emptySlots).toBe("OMIT");
  });
});

describe("problems", () => {
  const numbers = questionNumbers(pciEndSem4CreditKsv.structure as never);

  it("explains the common engine messages in plain words", () => {
    expect(explain("Undefined control sequence.")).toMatch(/does not know/);
    expect(explain("Missing $ inserted.")).toMatch(/maths outside/);
    expect(explain("Extra \\right.")).toMatch(/\\left without/);
    expect(explain("Double superscript.")).toMatch(/add braces/);
    expect(explain("something new")).toBe("could not be typeset");
  });

  it("names questions by their printed number", () => {
    expect(slotLabel(numbers, "g1.20")).toBe("Q.1(20)");
    expect(slotLabel(numbers, "nope.1")).toBe("A question");
  });

  it("drops tiny overfull boxes and repeats, and keeps paper-wide problems", () => {
    const p = fromDiagnostics(
      [
        { severity: "warning", kind: "overfull", message: "Overfull \\hbox", overfullPt: 0.5 },
        { severity: "warning", kind: "underfull", message: "Underfull \\hbox" },
        { severity: "warning", kind: "underfull", message: "Underfull \\hbox" },
        { severity: "error", kind: "error", message: "File `x.png' not found." },
      ],
      numbers,
    );
    expect(p.map((x) => x.message)).toEqual([
      "The paper has a loosely spaced line.",
      "The paper uses a picture that is missing; insert it again.",
    ]);
    expect(errorSummary([])).toBeNull();
  });
});
