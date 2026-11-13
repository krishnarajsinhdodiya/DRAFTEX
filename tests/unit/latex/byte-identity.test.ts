// D94: papers that use no Advanced LaTeX package produce the same LaTeX as
// v0.11.0, byte for byte. The hashes were written at v0.11.0 with
// DX_WRITE_LATEX_HASHES=1 and are never regenerated to make a change pass.
//
// Documented exceptions (each changed on purpose, by hand, in the file):
// - paper:kitchenSink, Phase 13 (D103): its Advanced LaTeX block is now
//   written as \begingroup ... \par\endgroup. Its pages were compared with
//   the v0.11.0 output on the pinned engine: pixel-identical.
//   (The packages and key-packages fixtures, which also changed, were added in
//   Phase 12 and are not in this file.)
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { serializeKey } from "@/lib/latex/key";
import { serializePaper } from "@/lib/latex/serialize";
import { KEY_FIXTURES } from "../../fixtures/papers/keys";
import { FIXTURES, SEED_PREVIEWS } from "../../fixtures/papers/papers";

const FILE = path.resolve("tests/fixtures/latex/v0.11.0-hashes.json");

function current(): Record<string, string> {
  const out: Record<string, string> = {};
  const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
  const papers: Record<string, () => unknown> = { ...FIXTURES, ...SEED_PREVIEWS };
  for (const [name, make] of Object.entries(papers)) {
    const r = serializePaper(make());
    out[`paper:${name}`] = r.ok ? sha(r.tex) : "not-ok";
  }
  for (const [name, make] of Object.entries(KEY_FIXTURES)) {
    const f = make();
    const r = serializeKey(f.paper, f.keys);
    out[`key:${name}`] = r.ok ? sha(r.tex) : "not-ok";
  }
  return out;
}

/** The v0.11.0 hash of each documented exception, so an exception cannot spread unnoticed. */
const CHANGED_ON_PURPOSE: Record<string, string> = {
  "paper:kitchenSink": "2cd88992177e3280337dda88f9a8c628b42d0be5d9557f9388fcb0e9072d22bf",
};

describe("LaTeX unchanged since v0.11.0 (D94)", () => {
  if (process.env.DX_WRITE_LATEX_HASHES === "1") {
    it("writes the hashes", () => {
      fs.writeFileSync(FILE, `${JSON.stringify(current(), null, 2)}\n`);
    });
    return;
  }
  it("every fixture paper and key serializes to the v0.11.0 bytes", () => {
    const want = JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, string>;
    const got = current();
    for (const [k, v] of Object.entries(want)) expect({ [k]: got[k] }).toEqual({ [k]: v });
    expect(Object.values(want)).not.toContain("not-ok");
  });
  it("only the documented exceptions differ from v0.11.0", () => {
    const got = current();
    for (const [k, old] of Object.entries(CHANGED_ON_PURPOSE)) expect(got[k]).not.toBe(old);
    expect(Object.keys(CHANGED_ON_PURPOSE)).toEqual(["paper:kitchenSink"]);
  });
});
