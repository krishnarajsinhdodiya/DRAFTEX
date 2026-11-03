// Gate 3: every fixture paper compiles with zero errors and zero warnings
// (overfull boxes of at most 1 pt excepted), offline.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { goldenFailures } from "@/lib/latex/log";
import { serializePaper } from "@/lib/latex/serialize";
import { realCompileService } from "../support/engine";
import { ALL_ASSETS, FIXTURES } from "../fixtures/papers/papers";

const OUT = path.resolve("test-results/golden");
const REFERENCE_TEX = path.resolve(
  "docs/reference/templates/pci2026-bpharm-endsem-4credit-ksv.tex",
);

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
  fs.mkdirSync(OUT, { recursive: true });
});

const assets = ALL_ASSETS.map((a) => ({ name: a.name, sourcePath: a.sourcePath }));

describe("golden compile", () => {
  it("the hand-written reference template compiles cleanly", async () => {
    const res = await svc.compile({
      userId: "golden",
      tex: fs.readFileSync(REFERENCE_TEX, "utf8"),
    });
    expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(goldenFailures(res.diagnostics)).toEqual([]);
    fs.writeFileSync(path.join(OUT, "reference-handwritten.pdf"), res.pdf as Buffer);
  });

  it.each(Object.keys(FIXTURES) as Array<keyof typeof FIXTURES>)(
    "%s compiles with zero warnings",
    async (name) => {
      const ser = serializePaper(FIXTURES[name]());
      if (!ser.ok)
        throw new Error(ser.issues.map((i) => `${i.slotId ?? ""} ${i.message}`).join("\n"));
      fs.writeFileSync(path.join(OUT, `${name}.tex`), ser.tex);
      const res = await svc.compile({
        userId: "golden",
        tex: ser.tex,
        slotRanges: ser.slotRanges,
        assets: assets.filter((a) => ser.assets.includes(a.name)),
      });
      expect(res.usedNetwork).toBe(false);
      expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(goldenFailures(res.diagnostics)).toEqual([]);
      expect(res.ok).toBe(true);
      fs.writeFileSync(path.join(OUT, `${name}.pdf`), res.pdf as Buffer);
    },
  );
});
