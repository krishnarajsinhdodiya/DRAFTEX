// Gate 3 for answer keys (D33): every key fixture compiles with zero errors
// and zero warnings, offline.
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { serializeKey } from "@/lib/latex/key";
import { goldenFailures } from "@/lib/latex/log";
import { realCompileService } from "../support/engine";
import { KEY_FIXTURES } from "../fixtures/papers/keys";
import { ALL_ASSETS } from "../fixtures/papers/papers";

const OUT = path.resolve("test-results/golden");

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
  fs.mkdirSync(OUT, { recursive: true });
});

const assets = ALL_ASSETS.map((a) => ({ name: a.name, sourcePath: a.sourcePath }));

describe("golden compile: answer keys", () => {
  it.each(Object.keys(KEY_FIXTURES))("%s compiles with zero warnings", async (name) => {
    const f = KEY_FIXTURES[name as keyof typeof KEY_FIXTURES]();
    const ser = serializeKey(f.paper, f.keys);
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
  });
});
