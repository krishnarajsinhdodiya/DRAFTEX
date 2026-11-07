// Gate 6 for the Phase 12 package commands (D93): random Advanced LaTeX built
// from the allowed package commands, with hostile pieces mixed in. Each
// snippet is refused by the sanitiser, or compiles (within the time limit)
// without a canary file's contents in the PDF or log and without writing a
// file. A LaTeX error is allowed here: Advanced LaTeX may be wrong LaTeX, and
// the editor shows that error on the question.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { serializePaper } from "@/lib/latex/serialize";
import type { BlockNode } from "@/lib/paper/schema";
import { ALL_ASSETS, referencePaper } from "../fixtures/papers/papers";
import { realCompileService } from "../support/engine";
import { pdfText } from "../support/pdf";

const COUNT = 200;
const SEED = 20261107;
const CANARY = "DXFUZZCANARY51";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let dir: string;
let file: string;
let svc: CompileService;
beforeAll(() => {
  svc = realCompileService({ timeoutMs: 20_000 });
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "dx-fuzz-")));
  file = path.join(dir, "c.txt").split(path.sep).join("/");
  fs.writeFileSync(file, `${CANARY}\n`);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function snippet(rand: () => number): string {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const hostile = [
    `\\input{${file}}`,
    `^^5cinput{${file}}`,
    `\\csname input\\endcsname{${file}}`,
    `[,,,,insert path={plot file {${file}}}]`,
    "[:30,1.5]",
    "[red]",
    "!{x}",
    "@{a}",
    "\\\\",
    "#",
    "%",
    "{",
    "}",
    "$",
    "_",
    "^",
    "\\lstinputlisting",
    "\\addplot table",
    `plot file {${file}}`,
    "\\alph*",
  ];
  const filler = () => {
    let s = "";
    const len = 1 + Math.floor(rand() * 12);
    for (let i = 0; i < len; i++)
      s += rand() < 0.15 ? pick(hostile) : pick([..."ABCHNOabc0123 +-=()/.:,<>"]);
    return s;
  };
  const forms = [
    () => `\\ce{${filler()}}`,
    () => `\\chemfig{${filler()}}`,
    () => `\\chemfig{A-[${filler()}]B}`,
    () => `\\textcolor{${pick(["red", "blue!40", "gray!50!black", filler()])}}{${filler()}}`,
    () =>
      `\\begin{tabular}{cc}\\multirow{${pick(["2", "0", "99", filler()])}}{*}{${filler()}} & b\\\\ & c\\end{tabular}`,
    () => `\\begin{framed}${filler()}\\end{framed}`,
    () =>
      `\\begin{enumerate}[${pick(["label=(\\alph*)", "nosep", "start=2", "before=", filler()])}]\\item ${filler()}\\end{enumerate}`,
    () => `$\\prescript{${filler()}}{6}{C} \\coloneqq ${filler()}$`,
    () => `\\rupee{} ${filler()}`,
  ];
  const parts = 1 + Math.floor(rand() * 3);
  return Array.from({ length: parts }, () => pick(forms)()).join(" ");
}

function paperWith(latex: string) {
  const paper = referencePaper();
  const first = paper.slots[0];
  if (!first) throw new Error("fixture has no slots");
  first.content.content.push({ type: "advancedLatex", attrs: { latex } } as BlockNode);
  return paper;
}

describe("package fuzz (gate 6, D93)", () => {
  it(`${COUNT} random package snippets are refused or compile without leaking`, async () => {
    const rand = mulberry32(SEED);
    const snippets = Array.from({ length: COUNT }, () => snippet(rand));
    const failures: string[] = [];
    let refused = 0;
    let compiled = 0;
    await Promise.all(
      snippets.map(async (s) => {
        const ser = serializePaper(paperWith(s));
        if (!ser.ok) {
          refused++;
          return;
        }
        const assets = ALL_ASSETS.filter((a) => ser.assets.includes(a.name)).map((a) => ({
          name: a.name,
          sourcePath: a.sourcePath,
        }));
        const res = await svc.compile({ userId: "fuzz-packages", tex: ser.tex, assets });
        compiled++;
        const text = res.pdf ? (await pdfText(res.pdf)).replace(/\s+/g, "") : "";
        if (res.timedOut) failures.push(`timed out: ${s}`);
        if (res.usedNetwork) failures.push(`used the network: ${s}`);
        if (text.includes(CANARY) || res.log.replace(/\s+/g, "").includes(CANARY))
          failures.push(`leaked: ${s}`);
      }),
    );
    console.log(`package fuzz: ${compiled} compiled, ${refused} refused`);
    expect(fs.readdirSync(dir)).toEqual(["c.txt"]);
    expect(compiled).toBeGreaterThan(COUNT / 5);
    expect(failures).toEqual([]);
  });
});
