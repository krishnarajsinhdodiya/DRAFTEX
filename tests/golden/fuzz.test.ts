// Gate 6: 1,000 random strings (every special character, mapped symbols,
// accents, emoji, control and zero-width characters) either compile cleanly
// or are refused with a validation error. Batches of 50 per document
// (memory.md), splitting a failing batch until the culprit is found.
import { beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { serializePaper, validateSlotContent } from "@/lib/latex/serialize";
import type { BlockNode, PaperInput } from "@/lib/paper/schema";
import { realCompileService } from "../support/engine";

const COUNT = 1_000;
const BATCH = 50;
const SEED = 20261103;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOLS = [
  // ASCII printable, weighted towards LaTeX specials
  [..." !\"#$%&'()*+,-./0123456789:;<=>?@ABCXYZ[\\]^_`abcxyz{|}~"],
  [..."\\{}$&#^_%~[]\"'`<>|"],
  [..."°µ±×÷·→←↔⇌≤≥≠≈∞√αβγδμπσςωΔΩ–—…•“”‘’©®™½²³₂Å₹"],
  [..."éèçñüöåøßŁłŒœšž"],
  ["😀", "🧪", "💊", "👍🏽", "🇮🇳"],
  ["\u0000", "\u0007", "\u001b", "\u200b", "\u200d", "\ufeff", "\u202e", "\ud800"],
  [..."你好мирעבריתक्ष"],
];

function randomString(rand: () => number): string {
  const len = 1 + Math.floor(rand() * 80);
  // About a quarter of strings may contain unprintable characters.
  const allowRare = rand() < 0.25;
  let s = "";
  for (let i = 0; i < len; i++) {
    const r = rand();
    if (r < 0.15) {
      s += " ";
      continue;
    }
    const pool =
      r < 0.55
        ? POOLS[0]
        : r < 0.75
          ? POOLS[1]
          : r < 0.88
            ? POOLS[2]
            : r < 0.95 || !allowRare
              ? POOLS[3]
              : POOLS[4 + Math.floor(rand() * 3)];
    const chars = pool as string[];
    s += chars[Math.floor(rand() * chars.length)];
  }
  return s;
}

function slotBlocks(s: string, i: number): BlockNode[] {
  const text = {
    type: "text" as const,
    text: s,
    ...(i % 7 === 0 ? { marks: [{ type: "bold" as const }] } : {}),
  };
  const blocks: BlockNode[] = [{ type: "paragraph", content: [text] }];
  if (i % 5 === 0) {
    blocks.push({
      type: "choices",
      content: [{ type: "choice", content: [{ type: "text", text: s }] }, { type: "choice" }],
    });
  }
  return blocks;
}

function paperFor(strings: string[], offset: number): PaperInput {
  return {
    template: {
      structure: {
        numbering: { prefix: "Q.", separator: "" },
        marksStyle: "MARKS_COLON",
        parts: [
          {
            key: "p",
            groups: [
              {
                key: "f",
                type: "FREE",
                heading: "Fuzz.",
                slots: strings.length,
                attempt: strings.length,
                marksEach: 1,
              },
            ],
          },
        ],
        footer: { text: "", ornament: "NONE" },
      },
      header: {
        lines: [{ text: "Fuzz", size: "normal", bold: false }],
        dateRow: { style: "NONE", left: "", centre: "", right: "" },
        candidateField: "NONE",
        instructions: [],
        pageNumbers: "NONE",
      },
      style: { classSize: 12, geometry: { left: 1, top: 0.9, width: 6.2, height: 9.7 } },
    },
    meta: {},
    emptySlots: "OMIT",
    slots: strings.map((s, i) => ({
      groupKey: "f",
      position: i + 1,
      content: { type: "doc", content: slotBlocks(s, offset + i) },
    })),
  };
}

let svc: CompileService;
beforeAll(() => {
  svc = realCompileService();
});

/** null = compiled cleanly; otherwise the reason. */
async function compileBatch(strings: string[], offset: number): Promise<string | null> {
  const ser = serializePaper(paperFor(strings, offset));
  if (!ser.ok) return `serialiser refused accepted strings: ${ser.issues[0]?.message}`;
  const res = await svc.compile({ userId: "fuzz", tex: ser.tex });
  const bad = res.diagnostics.filter((d) => d.severity === "error" || d.kind === "missing-char");
  if (res.ok && bad.length === 0) return null;
  return bad.map((d) => d.message).join("; ") || "no PDF";
}

async function findCulprit(strings: string[], offset: number): Promise<string> {
  if (strings.length === 1) return JSON.stringify(strings[0]);
  const mid = Math.floor(strings.length / 2);
  const left = strings.slice(0, mid);
  if (await compileBatch(left, offset)) return findCulprit(left, offset);
  return findCulprit(strings.slice(mid), offset + mid);
}

describe("serialiser fuzz", () => {
  it("would catch a glyph the font lacks (detector self-check)", async () => {
    const res = await svc.compile({
      userId: "fuzz",
      tex: "\\documentclass[12pt]{exam}\n\\begin{document}\nsmile \u{1F600}\n\\end{document}\n",
    });
    expect(res.diagnostics.some((d) => d.kind === "missing-char")).toBe(true);
  });

  it(`${COUNT} random strings compile or fail validation cleanly`, async () => {
    const rand = mulberry32(SEED);
    const strings = Array.from({ length: COUNT }, () => randomString(rand));
    const accepted: string[] = [];
    let refused = 0;
    strings.forEach((s, i) => {
      const problems = validateSlotContent({ type: "doc", content: slotBlocks(s, i) });
      if (problems.length === 0) accepted.push(s);
      else {
        refused++;
        expect(problems[0]?.message).toMatch(/cannot be printed/);
      }
    });
    console.log(`fuzz: ${accepted.length} accepted, ${refused} refused with a validation error`);
    expect(accepted.length).toBeGreaterThan(COUNT / 2);

    const failures: string[] = [];
    const jobs: Array<Promise<void>> = [];
    for (let i = 0; i < accepted.length; i += BATCH) {
      const batch = accepted.slice(i, i + BATCH);
      jobs.push(
        compileBatch(batch, i).then(async (why) => {
          if (why) failures.push(`${await findCulprit(batch, i)} → ${why}`);
        }),
      );
    }
    await Promise.all(jobs);
    expect(failures).toEqual([]);
  });
});
