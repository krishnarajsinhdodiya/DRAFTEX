// Gate 4: visual regression against committed baselines (ubuntu only, D4),
// and the Phase 1 exit check: the reference template regenerated from JSON
// matches the hand-written one (≤ 0.5% changed pixels per page, any OS).
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { serializePaper } from "@/lib/latex/serialize";
import { realCompileService } from "../support/engine";
import { diffPages, pngBytes, readPng, renderPdf } from "../support/pdf";
import { ALL_ASSETS, FIXTURES, SEED_PREVIEWS } from "../fixtures/papers/papers";

const OUT = path.resolve("test-results/golden");
const BASELINES = path.resolve("tests/golden/baselines");
const REFERENCE_TEX = path.resolve(
  "docs/reference/templates/pci2026-bpharm-endsem-4credit-ksv.tex",
);
const MAX_RATIO = 0.005;
const UPDATE = process.env.UPDATE_BASELINES === "1";
const COMPARE_BASELINES = process.platform === "linux";

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
  fs.mkdirSync(OUT, { recursive: true });
});

const assets = ALL_ASSETS.map((a) => ({ name: a.name, sourcePath: a.sourcePath }));

const PAPERS: Record<string, () => unknown> = { ...FIXTURES, ...SEED_PREVIEWS };

async function compileFixture(name: string): Promise<Buffer> {
  const ser = serializePaper((PAPERS[name] as () => unknown)());
  if (!ser.ok) throw new Error(ser.issues.map((i) => i.message).join("\n"));
  const res = await svc.compile({
    userId: "visual",
    tex: ser.tex,
    assets: assets.filter((a) => ser.assets.includes(a.name)),
  });
  if (!res.pdf) throw new Error(`${name} did not compile`);
  return res.pdf;
}

async function compileHandwritten(): Promise<Buffer> {
  const res = await svc.compile({ userId: "visual", tex: fs.readFileSync(REFERENCE_TEX, "utf8") });
  if (!res.pdf) throw new Error("hand-written reference did not compile");
  return res.pdf;
}

describe("reference template regenerated from JSON", () => {
  it("matches the hand-written reference within 0.5% per page", async () => {
    const [generated, handwritten] = await Promise.all([
      renderPdf(await compileFixture("reference")),
      renderPdf(await compileHandwritten()),
    ]);
    const diffs = diffPages(generated, handwritten);
    for (const d of diffs) {
      fs.writeFileSync(path.join(OUT, `reference-vs-handwritten-p${d.page}.png`), pngBytes(d.diff));
      const g = generated[d.page - 1];
      const h = handwritten[d.page - 1];
      if (g) fs.writeFileSync(path.join(OUT, `reference-generated-p${d.page}.png`), pngBytes(g));
      if (h) fs.writeFileSync(path.join(OUT, `reference-handwritten-p${d.page}.png`), pngBytes(h));
    }
    const report = diffs.map((d) => `p${d.page}: ${(d.ratio * 100).toFixed(3)}%`).join(", ");
    console.log(`reference vs hand-written: ${report}`);
    expect(generated.length).toBe(handwritten.length);
    for (const d of diffs) expect(d.ratio, report).toBeLessThanOrEqual(MAX_RATIO);
  });
});

const targets: Array<[string, () => Promise<Buffer>]> = [
  ["handwritten-reference", compileHandwritten],
  ...Object.keys(PAPERS).map(
    (n) => [n, () => compileFixture(n)] as [string, () => Promise<Buffer>],
  ),
];

describe.skipIf(!COMPARE_BASELINES && !UPDATE)("visual baselines", () => {
  it.each(targets)("%s matches its baselines", async (name, make) => {
    const pages = await renderPdf(await make());
    if (UPDATE) {
      fs.mkdirSync(BASELINES, { recursive: true });
      for (const f of fs.readdirSync(BASELINES).filter((f) => f.startsWith(`${name}-p`))) {
        fs.rmSync(path.join(BASELINES, f));
      }
      pages.forEach((p, i) =>
        fs.writeFileSync(path.join(BASELINES, `${name}-p${i + 1}.png`), pngBytes(p)),
      );
      return;
    }
    const expected = fs
      .readdirSync(BASELINES)
      .filter((f) => f.startsWith(`${name}-p`))
      .sort((a, b) => Number(/p(\d+)\.png$/.exec(a)?.[1]) - Number(/p(\d+)\.png$/.exec(b)?.[1]))
      .map((f) => readPng(fs.readFileSync(path.join(BASELINES, f))));
    expect(expected.length, `no baselines for ${name}`).toBeGreaterThan(0);
    const diffs = diffPages(pages, expected);
    for (const d of diffs) {
      if (d.ratio > 0) {
        fs.writeFileSync(
          path.join(OUT, `${name}-p${d.page}-actual.png`),
          pngBytes(pages[d.page - 1] ?? d.diff),
        );
        fs.writeFileSync(path.join(OUT, `${name}-p${d.page}-diff.png`), pngBytes(d.diff));
      }
      expect(d.ratio, `${name} page ${d.page}`).toBeLessThanOrEqual(MAX_RATIO);
    }
  });
});
