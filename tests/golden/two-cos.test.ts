// D120: two CO tags print in one bracket, `[XX604T.01, XX604T.03]`, on the
// paper and in the key, with Bloom on and off, including the longest elective
// pair without Bloom. Invented text.
//
// Known limits (engine-probed 2026-11-16, logged in memory.md):
// - With Bloom on, a question whose last line is nearly full overflows ~20 pt
//   with one CO, two or none: \dxBloom's break is too loose. Exists before
//   Phase 15; texts here are short so this test checks the tags only.
// - Two tags at the schema maximum (17-character code + 8-character suffix
//   each) overflow the key heading with Bloom on; real codes fit.
import { beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { serializeKey } from "@/lib/latex/key";
import { goldenFailures } from "@/lib/latex/log";
import { serializePaper } from "@/lib/latex/serialize";
import type { PaperInput } from "@/lib/paper/schema";
import { realCompileService } from "../support/engine";
import { p } from "../fixtures/papers/papers";
import { pciEndSem4CreditKsv } from "../fixtures/papers/templates";

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
});

const LONG = "XXXXXXXXXXXXXXXXX.01 AEC12345, XXXXXXXXXXXXXXXXX.03 AEC12345";

function paper(showBloom: boolean): PaperInput {
  const slot = (position: number, coTag: string, sub = false) => ({
    groupKey: "g2",
    position,
    coTag,
    bloomLevel: "ANALYZE" as const,
    content: {
      type: "doc" as const,
      content: sub
        ? [
            p("Answer both invented parts."),
            {
              type: "subParts" as const,
              content: [
                { type: "subPart" as const, content: [p("First part.")] },
                {
                  type: "subPart" as const,
                  attrs: { coTag: "XX604T.04, XX604T.05" },
                  content: [p("Second part.")],
                },
              ],
            },
          ]
        : [p("Explain an invented process.")],
    },
  });
  return {
    template: { ...pciEndSem4CreditKsv, style: { ...pciEndSem4CreditKsv.style, showBloom } },
    meta: {},
    emptySlots: "OMIT",
    slots: [
      slot(1, "XX604T.01, XX604T.03"),
      slot(2, showBloom ? "XX607T.01 AEC1, XX607T.03 AEC1" : LONG),
      slot(3, "XX604T.02, XX604T.06", true),
    ],
  };
}

describe.each([true, false])("two COs, Bloom shown: %s", (showBloom) => {
  it("paper compiles with no warnings", async () => {
    const ser = serializePaper(paper(showBloom));
    if (!ser.ok) throw new Error(ser.issues.map((x) => x.message).join("\n"));
    expect(ser.tex).toContain("[XX604T.01,~XX604T.03]");
    const res = await svc.compile({ userId: "two-cos", tex: ser.tex, slotRanges: ser.slotRanges });
    expect(res.ok).toBe(true);
    expect(goldenFailures(res.diagnostics).map((d) => `${d.kind}: ${d.message}`)).toEqual([]);
  }, 120_000);

  it("key compiles with no warnings", async () => {
    const answer = { type: "doc" as const, content: [p("An invented answer.")] };
    const ser = serializeKey(
      paper(showBloom),
      [1, 2, 3].map((position) => ({
        groupKey: "g2",
        position,
        answerKey: answer,
        keyCriteria: [],
      })),
    );
    if (!ser.ok) throw new Error(ser.issues.map((x) => x.message).join("\n"));
    const res = await svc.compile({ userId: "two-cos-key", tex: ser.tex, slotRanges: [] });
    expect(res.ok).toBe(true);
    expect(goldenFailures(res.diagnostics).map((d) => `${d.kind}: ${d.message}`)).toEqual([]);
  }, 120_000);
});
