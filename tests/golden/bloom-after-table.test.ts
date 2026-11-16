// With "Print Bloom levels" on, a question that ends in a table printed its
// Bloom level beside the table, past the right margin (overfull hbox, seen on
// the end user's paper). It now starts its own line under the table, with the
// CO tag at the right of that line. Invented text.
import { beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { goldenFailures } from "@/lib/latex/log";
import { serializePaper } from "@/lib/latex/serialize";
import type { PaperInput } from "@/lib/paper/schema";
import { realCompileService } from "../support/engine";
import { p, table } from "../fixtures/papers/papers";
import { pciEndSem4CreditKsv } from "../fixtures/papers/templates";

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
});

const cells = [
  ["Drug", "Dose", "Route"],
  ["Invented A", "10 mg", "Oral"],
  ["Invented B", "5 mg", "IV"],
];

function paper(showBloom: boolean, width: number): PaperInput {
  return {
    template: {
      ...pciEndSem4CreditKsv,
      style: { ...pciEndSem4CreditKsv.style, showBloom },
    },
    meta: {},
    emptySlots: "OMIT",
    slots: [
      {
        groupKey: "g1",
        position: 1,
        content: { type: "doc", content: [p("Complete the invented table."), table(cells, width)] },
        coTag: "BP101T.01",
        bloomLevel: "REMEMBER",
      },
    ],
  };
}

describe("Bloom after a table", () => {
  it.each([100, 80])(
    "starts its own line and compiles cleanly (table %i%%)",
    async (width) => {
      const ser = serializePaper(paper(true, width));
      if (!ser.ok) throw new Error(ser.issues.map((x) => x.message).join("\n"));
      expect(ser.tex).toContain("\\par\\noindent\\kern-\\fontdimen2\\font\\dxBloom{");
      const res = await svc.compile({
        userId: "bloom-table",
        tex: ser.tex,
        slotRanges: ser.slotRanges,
      });
      expect(res.ok).toBe(true);
      expect(goldenFailures(res.diagnostics).map((d) => `${d.kind}: ${d.message}`)).toEqual([]);
    },
    120_000,
  );

  it("leaves papers without Bloom unchanged", () => {
    const ser = serializePaper(paper(false, 100));
    if (!ser.ok) throw new Error("serialize failed");
    expect(ser.tex).not.toContain("\\kern-\\fontdimen2\\font");
  });
});
