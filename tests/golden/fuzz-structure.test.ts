// Gate 6 for the editor's output: 200 random questions built from every node
// the editor can make (marks, maths, blanks, units, lists, tables, choices,
// sub-parts, nesting) are valid in the editor's schema, survive the
// editor ↔ stored round trip, and compile with no errors and no warnings
// other than line-fitting notes. Batches of 20.
import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { beforeAll, describe, expect, it } from "vitest";
import { fromStored, toStored, type EditorNode } from "@/lib/editor/convert";
import { questionSchemaExtensions } from "@/lib/editor/nodes";
import type { CompileService } from "@/lib/latex/compile";
import { goldenFailures } from "@/lib/latex/log";
import { serializePaper } from "@/lib/latex/serialize";
import type { BlockNode, Doc, InlineNode, LeafBlockNode, PaperInput } from "@/lib/paper/schema";
import { realCompileService } from "../support/engine";
import { pciEndSem4CreditKsv } from "../fixtures/papers/templates";

const COUNT = 200;
const BATCH = 20;
const SEED = 20261104;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS =
  "dose tablet % 5 mg & # $ _ {x} ~ ^ \\ “quoted” 37°C ±2 µg α-receptor naïve 0.5 mL".split(" ");
const MATHS = [
  "x^2+1",
  "\\frac{a}{b}",
  "\\sqrt[3]{27}",
  "\\alpha+\\beta",
  "\\int_0^1 x\\,\\mathrm{d}x",
  "\\left(\\frac{1}{2}\\right)^{n}",
  "\\mathrm{CH_3COOH}",
  "\\Delta G = \\Delta H - T\\Delta S",
  "K_a=\\frac{[\\mathrm{H}^+][\\mathrm{A}^-]}{[\\mathrm{HA}]}",
  "\\sum_{i=1}^{n} x_i",
];
const UNITS = [
  "\\milli\\gram",
  "\\celsius",
  "\\milli\\litre",
  "\\centi\\metre",
  "\\percent",
  "M",
  "mM",
];
const MARKS = ["bold", "italic", "underline", "subscript", "superscript"] as const;

function generator(seed: number) {
  const rand = mulberry32(seed);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)] as T;
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

  const inline = (): InlineNode[] =>
    Array.from({ length: int(1, 5) }, (): InlineNode => {
      const r = rand();
      if (r < 0.55) {
        const marks = rand() < 0.3 ? [{ type: pick(MARKS) }] : undefined;
        return { type: "text", text: `${pick(WORDS)} `, ...(marks ? { marks } : {}) };
      }
      if (r < 0.7) return { type: "mathInline", attrs: { latex: pick(MATHS) } };
      if (r < 0.8)
        return rand() < 0.5 ? { type: "blank" } : { type: "blank", attrs: { widthCm: int(1, 6) } };
      if (r < 0.9)
        return { type: "units", attrs: { value: String(int(1, 500)), unit: pick(UNITS) } };
      return { type: "hardBreak" };
    });
  // A paragraph never ends on a line break (the editor keeps it, LaTeX would warn).
  const para = (): LeafBlockNode => {
    const content = inline();
    while (content.at(-1)?.type === "hardBreak") content.pop();
    return { type: "paragraph", content: content.length ? content : [{ type: "text", text: "x" }] };
  };

  const leaf = (): LeafBlockNode => {
    const r = rand();
    if (r < 0.45) return para();
    if (r < 0.55) return { type: "mathDisplay", attrs: { latex: pick(MATHS) } };
    if (r < 0.7) {
      const cols = int(1, 4);
      return {
        type: "table",
        attrs: { headerRow: rand() < 0.7, widthPercent: pick([50, 80, 100]) },
        content: Array.from({ length: int(1, 4) }, () => ({
          type: "tableRow" as const,
          content: Array.from({ length: cols }, () => ({
            type: "tableCell" as const,
            content: [
              {
                type: "paragraph" as const,
                content: [{ type: "text" as const, text: pick(WORDS) }],
              },
            ],
          })),
        })),
      };
    }
    if (r < 0.85) {
      const n = int(2, 8);
      return {
        type: "choices",
        attrs: { columns: pick([1, 2, 4] as const), correct: int(0, n - 1) },
        content: Array.from({ length: n }, () => ({
          type: "choice" as const,
          content: inline().filter((x) => x.type !== "hardBreak"),
        })),
      };
    }
    return {
      type: pick(["orderedList", "bulletList"] as const),
      content: Array.from({ length: int(1, 3) }, () => ({
        type: "listItem" as const,
        content: [para() as { type: "paragraph"; content?: InlineNode[] }],
      })),
    };
  };

  return (): Doc => {
    const blocks: BlockNode[] = Array.from({ length: int(1, 3) }, () =>
      rand() < 0.2
        ? {
            type: "subParts" as const,
            content: Array.from({ length: int(1, 3) }, () => ({
              type: "subPart" as const,
              content: Array.from({ length: int(1, 2) }, leaf),
            })),
          }
        : leaf(),
    );
    return { type: "doc", content: blocks };
  };
}

const schema = getSchema(questionSchemaExtensions());
const next = generator(SEED);
/** The editor's normal form (it merges neighbouring text with the same marks). */
function normal(doc: Doc): Doc {
  const node = PMNode.fromJSON(schema, fromStored(doc));
  node.check();
  const r = toStored(node.toJSON() as EditorNode);
  if (!r.ok) throw new Error(r.message);
  return r.doc;
}
const docs = Array.from({ length: COUNT }, () => normal(next()));

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
});

describe("editor-shaped questions", () => {
  it("are valid editor documents and round-trip unchanged", () => {
    for (const doc of docs) expect(normal(doc)).toEqual(doc);
  });

  it.each(Array.from({ length: COUNT / BATCH }, (_, i) => i))(
    "batch %i compiles",
    async (b) => {
      // The long-answer group has 3 places; the short one 7; the MCQ one 20.
      const places = [
        ...Array.from({ length: 20 }, (_, i) => ({ groupKey: "g1", position: i + 1 })),
      ].slice(0, BATCH);
      const paper: PaperInput = {
        template: pciEndSem4CreditKsv,
        meta: {},
        emptySlots: "OMIT",
        slots: docs.slice(b * BATCH, (b + 1) * BATCH).map((content, i) => ({
          ...(places[i] as { groupKey: string; position: number }),
          content,
        })),
      };
      const ser = serializePaper(paper);
      if (!ser.ok) throw new Error(ser.issues.map((x) => `${x.slotId}: ${x.message}`).join("\n"));
      const res = await svc.compile({ userId: "fuzz", tex: ser.tex, slotRanges: ser.slotRanges });
      const lines = ser.tex.split("\n");
      // Gate 6: it compiles. Random words in narrow columns make loose or wide
      // lines, which the editor shows as notes; anything else must not appear.
      const failures = goldenFailures(res.diagnostics)
        .filter((d) => d.kind !== "overfull" && d.kind !== "underfull")
        .map(
          (d) =>
            `${d.slotId ?? "-"}: ${d.message}\n${lines.slice(Math.max(0, (d.line ?? 1) - 3), (d.line ?? 1) + 1).join("\n")}`,
        );
      expect(failures).toEqual([]);
    },
    120_000,
  );
});
