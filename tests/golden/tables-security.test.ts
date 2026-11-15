// Gates 3, 6 and 7 for table options (Phase 14, D105-D107,
// docs/SECURITY-REVIEW-PHASE14.md), with the real engine:
// - no cell text reaches a file: a canary at an absolute path stays out of
//   the PDF and the log in plain, header, column-merged, row-merged and
//   both-ways merged cells, in the paper and in a model answer;
// - columns add up to the table's width, measured in the engine;
// - the merged-row check refuses exactly where \multirow would run over the
//   rows below (it does so silently, which is why the check exists);
// - seeded fuzz: every random table is refused before the engine or
//   compiles with no errors and no warnings other than box notes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { serializeKey } from "@/lib/latex/key";
import { serializePaper } from "@/lib/latex/serialize";
import type { InlineNode, PaperInput } from "@/lib/paper/schema";
import { tablesKey } from "../fixtures/papers/keys";
import { m, p, qty, referencePaper, t, xtable, type XCell } from "../fixtures/papers/papers";
import { realCompileService } from "../support/engine";
import { pdfText } from "../support/pdf";

const CANARY = "DXTABLECANARY82";
let dir: string;
let file: string;
let out: string;
let svc: CompileService;

beforeAll(() => {
  svc = realCompileService({ timeoutMs: 30_000 });
  // Long path: a Windows 8.3 short name has a "~" (see packages-security.test.ts).
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "dx-table-")));
  file = path.join(dir, "c.txt").split(path.sep).join("/");
  out = path.join(dir, "w.tex").split(path.sep).join("/");
  fs.writeFileSync(file, `${CANARY}\n`);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const squash = (s: string) => s.replace(/\s+/g, "");
const BOX = /^warning: (Overfull|Underfull) \\[hv]box/;

function paperWith(...tables: ReturnType<typeof xtable>[]): PaperInput {
  const base = referencePaper();
  const places: [string, number][] = [];
  for (const g of base.template.structure.parts.flatMap((x) => x.groups)) {
    for (let i = 1; i <= g.slots; i++) places.push([g.key, i]);
  }
  return {
    ...base,
    slots: tables.map((tb, i) => {
      const [groupKey, position] = places[i] as [string, number];
      return { groupKey, position, content: { type: "doc", content: [p("Table:"), tb] } };
    }),
  };
}

async function compileTex(tex: string) {
  const res = await svc.compile({ userId: "gate7-tables", tex });
  const text = res.pdf ? squash(await pdfText(res.pdf)) : "";
  return { res, text };
}

async function expectClean(tex: string) {
  const { res, text } = await compileTex(tex);
  expect(res.usedNetwork).toBe(false);
  expect(text).not.toContain(CANARY);
  expect(squash(res.log)).not.toContain(CANARY);
  expect(fs.readdirSync(dir)).toEqual(["c.txt"]);
  expect(
    res.diagnostics.map((d) => `${d.severity}: ${d.message}`).filter((d) => !BOX.test(d)),
  ).toEqual([]);
  expect(res.ok).toBe(true);
  return text;
}

const attacks = () => [
  `\\input{${file}}`,
  `\\input ${file}`,
  `\\csname input\\endcsname{${file}}`,
  `^^5cinput{${file}}`,
  `\\newwrite\\w\\immediate\\openout\\w=${out}`,
  "& \\\\ \\cr \\hline \\noalign{x} \\omit \\span",
  "\\multicolumn{9}{c}{x} \\multirow{9}{*}{x} \\end{tabular}",
  "%#&_^~$\\{}",
  "}}}{{{",
];

/**
 * Every kind of cell holding `s`: header, plain, column-merged, row-merged
 * and merged both ways. The merges span six rows, so a long attack line
 * fits (the merged-cell check would stop the compile otherwise).
 */
const everyCell = (s: string): ReturnType<typeof xtable> =>
  xtable(
    [
      [s, { text: s, colspan: 2 }],
      [{ text: s, rowspan: 6 }, s, "y"],
      ...Array.from({ length: 5 }, () => ["y", "y"]),
      [{ text: s, colspan: 2, rowspan: 6 }, "z"],
      ...Array.from({ length: 5 }, () => ["z"]),
    ],
    { borders: "GRID", widthPercent: 100 },
  );

describe("cell text never reaches a file (gate 7)", () => {
  it("would see the canary if a read got through (detector self-check)", async () => {
    const { text } = await compileTex(
      `\\documentclass{article}\\begin{document}\\input{${file}}\\end{document}`,
    );
    expect(text).toContain(CANARY);
  });

  it("prints every attack as text in every kind of cell", async () => {
    const text = await expectClean(okTex(serializePaper(paperWith(...attacks().map(everyCell)))));
    expect(text).toContain(squash("\\multicolumn{9}{c}{x}"));
  });

  it("prints every attack as text in a model answer's table", async () => {
    const f = tablesKey();
    const keys = attacks().map((s, i) => ({
      groupKey: "g2",
      position: (i % 7) + 1,
      answerKey: { type: "doc" as const, content: [everyCell(s)] },
      keyCriteria: [],
    }));
    // Seven answers per key: one compile per batch.
    for (let i = 0; i < keys.length; i += 7) {
      await expectClean(okTex(serializeKey(f.paper, keys.slice(i, i + 7))));
    }
  });

  it("refuses an equation that would split a cell, before the engine", () => {
    for (const latex of ["a & b", "a \\\\ b", "\\hline", "x \\\\[2pt] y"]) {
      expect(serializePaper(paperWith(xtable([[[m(latex)]]], { borders: "GRID" }))).ok).toBe(false);
    }
  });
});

function okTex(r: ReturnType<typeof serializePaper>): string {
  if (!r.ok) throw new Error(r.issues.map((i) => `${i.slotId}: ${i.message}`).join("\n"));
  return r.tex;
}

describe("columns fill the table's width exactly (measured)", () => {
  it.each([
    ["BOOKTABS", 100, [30, 30, 40]],
    ["GRID", 100, [30, 30, 40]],
    ["GRID", 100, [5, 5, 5, 5, 5, 5, 5, 5, 5, 55]],
    ["BOOKTABS", 73, undefined],
    ["GRID", 30, undefined],
  ] as const)("%s at %d%% with widths %j", async (borders, widthPercent, widths) => {
    const n = widths?.length ?? 5;
    const rows: XCell[][] = [Array.from({ length: n }, () => ""), [{ text: "", colspan: n }]];
    const tex = okTex(
      serializePaper(
        paperWith(
          xtable(rows, {
            borders,
            widthPercent,
            columns: Array.from({ length: n }, (_, i) =>
              widths ? { width: widths[i] as number } : { align: "CENTER" as const },
            ),
          }),
        ),
      ),
    );
    const probed = tex
      .replace("\\begin{document}", "\\begin{document}\\newsavebox\\dxT")
      .replace("\\begin{tabular}", "\\sbox\\dxT{\\begin{tabular}")
      .replace(
        "\\end{tabular}",
        "\\end{tabular}}\\typeout{DXTW \\the\\wd\\dxT\\space\\the\\linewidth}\\usebox\\dxT",
      );
    const { res } = await compileTex(probed);
    expect(res.ok).toBe(true);
    const [, wd, lw] = /DXTW ([\d.]+)pt ([\d.]+)pt/.exec(res.log) ?? [];
    const target = (Number(lw) * widthPercent) / 100;
    // Rounded down to five decimals: at most 0.05 pt narrower; TeX rounds each
    // length to its smallest unit, which may add a few of them (0.0003 pt seen),
    // far below the 0.1 pt TeX allows before it reports a box.
    expect(Number(wd)).toBeLessThanOrEqual(target + 0.01);
    expect(Number(wd)).toBeGreaterThan(target - 0.05);
  });

  it("stops a page too narrow for the table's padding (engine guard)", async () => {
    const paper = paperWith(
      xtable([Array.from({ length: 10 }, (_, i) => String(i))], {
        borders: "GRID",
        widthPercent: 100,
      }),
    );
    paper.template = structuredClone(paper.template);
    paper.template.style.geometry = { ...paper.template.style.geometry, width: 2 };
    const { res } = await compileTex(okTex(serializePaper(paper)));
    expect(res.diagnostics.map((d) => d.message)).toContain(
      "Package draftex Error: DXNARROWTABLE: a table column is too narrow for this page.",
    );
  });
});

describe("a merged cell over rows holds as many lines as rows (D106)", () => {
  const WORDS =
    "Paracetamol is an analgesic and antipyretic drug used for mild pain and for fever in adults and children alike";
  const cases = [8, 20, 40, 60, 80, 111].map((n) => WORDS.slice(0, n).trim());

  it.each([2, 3])("the check refuses exactly where multirow overflows, over %d rows", async (k) => {
    for (const text of cases) {
      const rows: XCell[][] = [
        [{ text, rowspan: k }, "a"],
        ...Array.from({ length: k - 1 }, () => ["b"]),
      ];
      const tex = okTex(
        serializePaper(
          paperWith(
            xtable(rows, {
              borders: "GRID",
              headerRow: false,
              columns: [{ width: 25 }, { width: 75 }],
            }),
          ),
        ),
      );
      const checked = await compileTex(tex);
      const refused = checked.res.diagnostics.some((d) => d.message.includes("DXMERGEDCELL"));
      // The same table with the check turned into a plain box.
      const bare = await compileTex(
        tex.replace(
          /\\newcommand\{\\dxMerged\}.*$/m,
          "\\newcommand{\\dxMerged}[2]{\\parbox{\\linewidth}{#2}}",
        ),
      );
      const overflows = bare.res.diagnostics.some((d) => /Overfull \\vbox/.test(d.message));
      expect(refused, `${k} rows, ${text.length} characters`).toBe(overflows);
      if (!refused) expect(checked.res.diagnostics).toEqual([]);
    }
  });
});

// ---------- fuzz (gate 6) ----------

const COUNT = 120;
const SEED = 20261115;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const PIECES = [
  "&",
  "\\\\",
  "#",
  "%",
  "~",
  "^",
  "$",
  "{",
  "}",
  "_",
  "\\",
  "^^5c",
  "é",
  "100%",
  "Rs.",
  "tablet",
  "dose",
  "N-(4-hydroxyphenyl)acetamide",
  "\\input{x}",
  "\\end{tabular}",
  "\\multicolumn",
  " ",
  "  ",
];
const MATHS = [
  "x^2",
  "\\frac{a}{b}",
  "\\alpha",
  "a & b",
  "a \\\\ b",
  "\\hline",
  "\\begin{matrix}a&b\\end{matrix}",
];

function inlines(rand: () => number): InlineNode[] {
  const outp: InlineNode[] = [];
  const n = Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const r = rand();
    if (r < 0.7) {
      const words = Array.from(
        { length: 1 + Math.floor(rand() * 4) },
        () => PIECES[Math.floor(rand() * PIECES.length)] as string,
      ).join(rand() < 0.5 ? " " : "");
      if (words.trim()) outp.push(t(words, ...(rand() < 0.15 ? (["bold"] as const) : [])));
    } else if (r < 0.85) outp.push(m(MATHS[Math.floor(rand() * MATHS.length)] as string));
    else if (r < 0.92) outp.push({ type: "hardBreak" });
    else outp.push(qty("2.5", "\\milli\\gram"));
  }
  return outp;
}

function randomTable(rand: () => number): ReturnType<typeof xtable> {
  const rows = 1 + Math.floor(rand() * 6);
  const cols = 1 + Math.floor(rand() * 5);
  const taken: boolean[][] = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const grid: (XCell | null)[][] = Array.from({ length: rows }, () =>
    Array<XCell | null>(cols).fill(null),
  );
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (taken[r]?.[c]) continue;
      let cs = rand() < 0.2 ? 1 + Math.floor(rand() * 3) : 1;
      let rs = rand() < 0.2 ? 1 + Math.floor(rand() * 3) : 1;
      while (c + cs > cols || [...Array(cs).keys()].some((d) => taken[r]?.[c + d])) cs--;
      rs = Math.min(rs, rows - r);
      const text = inlines(rand);
      for (let dr = 0; dr < rs; dr++)
        for (let dc = 0; dc < cs; dc++) (taken[r + dr] as boolean[])[c + dc] = true;
      (grid[r] as (XCell | null)[])[c] = {
        text,
        ...(cs > 1 ? { colspan: cs } : {}),
        ...(rs > 1 ? { rowspan: rs } : {}),
      };
    }
  }
  const widths = rand() < 0.5;
  const sumTo100 = rand() < 0.8;
  const w = Array.from({ length: cols }, (_, i) =>
    i < cols - 1 ? Math.floor(100 / cols) : 100 - Math.floor(100 / cols) * (cols - 1),
  );
  if (!sumTo100) w[0] = (w[0] as number) + 3;
  const aligns = ["LEFT", "CENTER", "RIGHT"] as const;
  return xtable(
    grid.map((row) => row.filter((x): x is XCell => x !== null)),
    {
      headerRow: rand() < 0.5,
      widthPercent: 20 + Math.floor(rand() * 81),
      borders: rand() < 0.5 ? "GRID" : "BOOKTABS",
      columns: Array.from({ length: cols }, (_, i) => ({
        align: aligns[Math.floor(rand() * 3)] as (typeof aligns)[number],
        ...(widths ? { width: w[i] as number } : {}),
      })),
    },
  );
}

describe("table fuzz (gate 6)", () => {
  it(`${COUNT} random tables are refused or compile with box notes only`, async () => {
    const rand = mulberry32(SEED);
    const tables = Array.from({ length: COUNT }, () => randomTable(rand));
    const failures: string[] = [];
    let refused = 0;
    let compiled = 0;
    let mergedRefused = 0;
    await Promise.all(
      tables.map(async (tb, i) => {
        const ser = serializePaper(paperWith(tb));
        if (!ser.ok) {
          refused++;
          return;
        }
        const { res, text } = await compileTex(ser.tex);
        compiled++;
        if (res.timedOut) failures.push(`${i}: timed out`);
        if (res.usedNetwork) failures.push(`${i}: used the network`);
        const other = res.diagnostics.filter(
          (d) => !BOX.test(`warning: ${d.message}`) && !d.message.includes("DXMERGEDCELL"),
        );
        if (res.diagnostics.some((d) => d.message.includes("DXMERGEDCELL"))) mergedRefused++;
        if (other.length) failures.push(`${i}: ${other.map((d) => d.message).join(" | ")}`);
        if (text.includes(CANARY)) failures.push(`${i}: leaked`);
      }),
    );
    console.log(
      `table fuzz: ${compiled} compiled (${mergedRefused} stopped by the merged-cell check), ${refused} refused`,
    );
    expect(fs.readdirSync(dir)).toEqual(["c.txt"]);
    expect(compiled).toBeGreaterThan(COUNT / 4);
    expect(failures).toEqual([]);
  }, 300_000);
});
