import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CompileRejected, type CompileJob, type CompileResult } from "@/lib/latex/compile";
import { templateFieldsSchema } from "@/lib/data/templates";
import { BUILT_IN_TEMPLATES } from "@/lib/templates/seeds";
import { sameOrigin } from "@/server/http";
import {
  PreviewCache,
  resolveAssets,
  templatePreview,
  type PreviewDeps,
} from "@/server/template-preview";

const ROOT = path.resolve(".");
const seed = (key: string) =>
  templateFieldsSchema.parse(BUILT_IN_TEMPLATES.find((s) => s.seedKey === key));

function result(over: Partial<CompileResult> = {}): CompileResult {
  return {
    ok: true,
    pdf: Buffer.from("%PDF-1.5"),
    diagnostics: [],
    log: "",
    timedOut: false,
    durationMs: 1,
    usedNetwork: false,
    ...over,
  };
}

function deps(compile: (job: CompileJob) => Promise<CompileResult>): PreviewDeps & {
  jobs: CompileJob[];
} {
  const jobs: CompileJob[] = [];
  return {
    jobs,
    repoRoot: ROOT,
    cache: new PreviewCache(2),
    compile: {
      compile: vi.fn((job: CompileJob) => {
        jobs.push(job);
        return compile(job);
      }),
    },
  };
}

describe("templatePreview", () => {
  it("compiles once, then serves the same template from the cache", async () => {
    const d = deps(async () => result());
    const input = seed("pci2026-bpharm-theory-sessional-4");
    const first = await templatePreview(d, "u1", input);
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(await templatePreview(d, "u1", input)).toMatchObject({ ok: true, cached: true });
    expect(d.jobs).toHaveLength(1);
    expect(d.jobs[0]).toMatchObject({
      userId: "u1",
      supersedeKey: "template-preview:u1",
      assets: [
        {
          name: expect.stringMatching(/^assets\/4badd2a1.*\.png$/),
          sourcePath: path.join(ROOT, "assets/logos/kbiper-logo.png"),
        },
      ],
    });
  });

  it("forgets the least recently used preview", async () => {
    const d = deps(async () => result());
    const a = seed("blank");
    const b = { ...a, maxMarks: 20, structure: { ...a.structure } };
    b.structure.parts = [
      {
        ...a.structure.parts[0]!,
        groups: [{ ...a.structure.parts[0]!.groups[0]!, marksEach: 10 }],
      },
    ];
    const c = seed("pci2026-bpharm-synopsis");
    for (const x of [a, b, c, a]) await templatePreview(d, "u", x);
    expect(d.jobs).toHaveLength(4);
  });

  it("explains invalid input, unknown images and failed compiles in plain English", async () => {
    const d = deps(async () =>
      result({
        ok: false,
        pdf: undefined,
        diagnostics: [{ severity: "error", kind: "error", message: "Undefined control sequence" }],
      }),
    );
    expect(await templatePreview(d, "u", { program: "X" })).toMatchObject({
      ok: false,
      status: 422,
      message: "The template has a field the preview cannot read.",
    });

    const withUnknownLogo = seed("blank");
    withUnknownLogo.header.logoLeft = { sha256: "a".repeat(64), ext: "png" };
    expect(await templatePreview(d, "u", withUnknownLogo)).toMatchObject({
      status: 422,
      message: expect.stringContaining("built-in logos"),
    });

    const badPlaceholder = seed("blank");
    badPlaceholder.header.lines = [
      { text: "{{nope}}", size: "normal", bold: false, ownLeading: false },
    ];
    expect(await templatePreview(d, "u", badPlaceholder)).toMatchObject({
      status: 422,
      details: ["Unknown placeholder {{nope}} in the header."],
    });

    expect(await templatePreview(d, "u", seed("blank"))).toMatchObject({
      status: 422,
      message: "The preview could not be compiled.",
      details: ["Undefined control sequence"],
    });
  });

  it("reports a timeout, a newer preview and the rate limit", async () => {
    const timedOut = deps(async () => result({ ok: false, pdf: undefined, timedOut: true }));
    expect(await templatePreview(timedOut, "u", seed("blank"))).toMatchObject({
      status: 422,
      message: "The preview took too long to make. Try again.",
    });
    for (const [reason, status] of [
      ["superseded", 409],
      ["rate-limit", 429],
    ] as const) {
      const d = deps(() => Promise.reject(new CompileRejected(reason, "x")));
      expect(await templatePreview(d, "u", seed("blank"))).toMatchObject({ ok: false, status });
    }
    const boom = deps(() => Promise.reject(new Error("engine missing")));
    await expect(templatePreview(boom, "u", seed("blank"))).rejects.toThrow("engine missing");
    const invalid = deps(() => Promise.reject(new CompileRejected("invalid", "bad")));
    await expect(templatePreview(invalid, "u", seed("blank"))).rejects.toThrow("bad");
  });
});

describe("resolveAssets", () => {
  it("only allows the built-in logos with their own extension", () => {
    const ksv = "f847009ea404b1e13d6e7e2ad544f73ca3fdd8ea791dfdb795e6a4c9b431658c";
    expect(resolveAssets([`assets/${ksv}.png`], ROOT)).toEqual([
      { name: `assets/${ksv}.png`, sourcePath: path.join(ROOT, "assets/logos/ksv-logo.png") },
    ]);
    expect(typeof resolveAssets([`assets/${ksv}.pdf`], ROOT)).toBe("string");
    expect(typeof resolveAssets(["assets/../../etc/hosts"], ROOT)).toBe("string");
  });
});

describe("sameOrigin", () => {
  const req = (headers: Record<string, string>) => new Request("http://x/", { headers });
  it("accepts only an Origin that names this host", () => {
    expect(sameOrigin(req({ origin: "http://127.0.0.1:3210", host: "127.0.0.1:3210" }))).toBe(true);
    expect(sameOrigin(req({ origin: "http://evil.test", host: "127.0.0.1:3210" }))).toBe(false);
    expect(sameOrigin(req({ host: "127.0.0.1:3210" }))).toBe(false);
    expect(sameOrigin(req({ origin: "null", host: "127.0.0.1:3210" }))).toBe(false);
  });
});
