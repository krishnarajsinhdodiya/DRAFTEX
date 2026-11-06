// D61: long chemical names in 2- and 4-column choices. Before the fix the
// engine could not break them, so they ran into the next column (overfull
// boxes, shown as notes on the question): it never hyphenated the first word
// after the label, and never broke after , ) ]. Now the paper compiles with
// no line-fitting notes at all. Invented options.
import { beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { goldenFailures } from "@/lib/latex/log";
import { serializePaper } from "@/lib/latex/serialize";
import type { Doc, PaperInput } from "@/lib/paper/schema";
import { realCompileService } from "../support/engine";
import { choices, p } from "../fixtures/papers/papers";
import { pciEndSem4CreditKsv } from "../fixtures/papers/templates";

const NAMES = [
  "N-(4-hydroxyphenyl)acetamide",
  "2-(acetyloxy)benzoic acid",
  "(2S,5R,6R)-3,3-dimethyl-7-oxo-6-[(2-phenylacetyl)amino]-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
  "1,3,7-trimethyl-3,7-dihydro-1H-purine-2,6-dione",
  "4-amino-N-(5-methylisoxazol-3-yl)benzenesulfonamide",
  "Hydroxypropylmethylcellulosephthalate",
  "7-chloro-1-methyl-5-phenyl-1,3-dihydro-2H-1,4-benzodiazepin-2-one",
  "Sodium carboxymethylcellulose",
];

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
});

// Four columns are about 85 pt wide: names like these now fit. Pieces the
// hyphenation patterns cannot split further ("carboxymethyl-", "trimethylx-",
// "isobutylphenyl)") are wider than the column and keep their note; such
// options belong in two columns.
const FOUR_COLUMN_NAMES = [
  "N-(4-hydroxyphenyl)acetamide",
  "2-(acetyloxy)benzoic acid",
  "Metformin hydrochloride",
  "Hydroxypropylmethylcellulose",
  "Sodium bicarbonate",
  "Diphenhydramine hydrochloride",
  "Chlorpheniramine maleate",
  "Acetylsalicylic acid",
];

describe.each([
  [2, NAMES],
  [4, FOUR_COLUMN_NAMES],
] as const)("%i-column choices with long chemical names", (columns, names) => {
  it("compile with no overfull or underfull lines", async () => {
    const docs: Doc[] = [0, 4].map((start) => ({
      type: "doc",
      content: [
        p("Which invented compound is described?"),
        choices(names.slice(start, start + 4), columns),
      ],
    }));
    docs.push({
      type: "doc",
      content: [p("Pick the longest name."), choices([NAMES[2] ?? "", "A", "B", "C"], 2)],
    });
    const paper: PaperInput = {
      template: pciEndSem4CreditKsv,
      meta: {},
      emptySlots: "OMIT",
      slots: docs.map((content, i) => ({ groupKey: "g1", position: i + 1, content })),
    };
    const ser = serializePaper(paper);
    if (!ser.ok) throw new Error(ser.issues.map((x) => x.message).join("\n"));
    const res = await svc.compile({ userId: "chem", tex: ser.tex, slotRanges: ser.slotRanges });
    expect(res.ok).toBe(true);
    expect(goldenFailures(res.diagnostics).map((d) => `${d.kind}: ${d.message}`)).toEqual([]);
  }, 120_000);
});
