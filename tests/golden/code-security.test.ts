// Gates 3, 6 and 7 for code blocks and inline code (Phase 13, D98-D103,
// docs/SECURITY-REVIEW-PHASE13.md), with the real engine:
// - no code line or inline code gets a canary file's contents into the PDF or
//   the log, and nothing is written beside it;
// - the longest line the generator allows fits inside the frame, and one more
//   character would not, at every nesting level, class size and in the key
//   (fancyvrb lets a long line overflow with no warning, so the width is
//   measured in the engine itself);
// - seeded fuzz: every code block is refused by the rules or compiles with
//   zero errors and zero warnings; grouped Advanced LaTeX with stray braces
//   is refused or compiles.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { KEY_CODE_LIMITS, checkCode, paperCodeLimit, paperCodeLimits } from "@/lib/latex/code";
import { serializeKey } from "@/lib/latex/key";
import { serializePaper } from "@/lib/latex/serialize";
import type { BlockNode, LeafBlockNode, PaperInput, TemplateInput } from "@/lib/paper/schema";
import { ALL_ASSETS, code, p, referencePaper, t } from "../fixtures/papers/papers";
import { realCompileService } from "../support/engine";
import { pdfText } from "../support/pdf";

const CANARY = "DXCODECANARY4Q7";
let dir: string;
let file: string;
let out: string;
let svc: CompileService;

beforeAll(() => {
  svc = realCompileService({ timeoutMs: 30_000 });
  // Long path: a Windows 8.3 short name has a "~" (see packages-security.test.ts).
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "dx-code-")));
  file = path.join(dir, "c.txt").split(path.sep).join("/");
  out = path.join(dir, "w.tex").split(path.sep).join("/");
  fs.writeFileSync(file, `${CANARY}\n`);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const squash = (s: string) => s.replace(/\s+/g, "");

/** A wide page (10 pt class, 8 in), so an absolute path fits on one code line. */
function widePaper(
  content: BlockNode[][],
  tweak: (t: TemplateInput) => void = () => {},
): PaperInput {
  const base = referencePaper();
  const template = structuredClone(base.template);
  template.style = {
    ...template.style,
    classSize: 10,
    geometry: { ...template.style.geometry, left: 0.1, width: 8 },
  };
  tweak(template);
  const places: [string, number][] = [];
  for (const g of template.structure.parts.flatMap((x) => x.groups)) {
    for (let i = 1; i <= g.slots; i++) places.push([g.key, i]);
  }
  return {
    ...base,
    template,
    slots: content.map((c, i) => {
      const [groupKey, position] = places[i] as [string, number];
      return { groupKey, position, content: { type: "doc", content: c } };
    }),
  };
}

async function compile(tex: string, used: string[]) {
  const assets = ALL_ASSETS.filter((a) => used.includes(a.name)).map((a) => ({
    name: a.name,
    sourcePath: a.sourcePath,
  }));
  return svc.compile({ userId: "gate7-code", tex, assets });
}

/** Overfull and underfull lines: notes on the question (inline code cannot hyphenate). */
const BOX = /^warning: (Overfull|Underfull) \\[hv]box/;

async function expectClean(input: PaperInput, allowBoxes = false) {
  const ser = serializePaper(input);
  if (!ser.ok) throw new Error(ser.issues.map((i) => `${i.slotId}: ${i.message}`).join("\n"));
  const res = await compile(ser.tex, ser.assets);
  expect(res.usedNetwork).toBe(false);
  if (res.pdf) expect(squash(await pdfText(res.pdf))).not.toContain(CANARY);
  expect(squash(res.log)).not.toContain(CANARY);
  expect(fs.readdirSync(dir)).toEqual(["c.txt"]);
  expect(
    res.diagnostics
      .map((d) => `${d.severity}: ${d.message}`)
      .filter((d) => !(allowBoxes && BOX.test(d))),
  ).toEqual([]);
  expect(res.ok).toBe(true);
  return res;
}

describe("code lines and inline code never reach a file (gate 7)", () => {
  it("would see the canary if a read got through (detector self-check)", async () => {
    const res = await svc.compile({
      userId: "gate7-code",
      tex: `\\documentclass{article}\\begin{document}\\input{${file}}\\end{document}`,
    });
    expect(squash(await pdfText(res.pdf as Buffer))).toContain(CANARY);
  });

  it("would read the file if a line holding \\end{Verbatim} reached the engine", async () => {
    // Why the rule looks anywhere in a line (found by the fuzz below): fancyvrb
    // ends the block at "x \end{Verbatim}", drops the "x " and reads the next
    // line as LaTeX.
    const res = await svc.compile({
      userId: "gate7-code",
      tex: [
        "\\documentclass{article}\\usepackage{fancyvrb}\\begin{document}",
        "\\begin{Verbatim}",
        "x \\end{Verbatim}",
        `\\input{${file}}`,
        "\\begin{Verbatim}",
        "\\end{Verbatim}",
        "\\end{document}",
      ].join("\n"),
    });
    expect(squash(await pdfText(res.pdf as Buffer))).toContain(CANARY);
  });

  const lines = () => [
    `\\input{${file}}`,
    `\\input ${file}`,
    `\\csname input\\endcsname{${file}}`,
    `^^5cinput{${file}}`,
    `\\VerbatimInput{${file}}`,
    `\\lstinputlisting{${file}}`,
    `\\newwrite\\w\\immediate\\openout\\w=${out}`,
    "\\end{itemize}",
    "\\end x{Verbatim}",
    "%#&_^~$\\{}",
    "\\",
    "\\begin{Verbatim}",
    "}}}{{{",
  ];

  it("prints every attack line as text inside a code block", async () => {
    await expectClean(widePaper([[code(...lines())]]));
  });

  it("prints every attack as text in inline code", async () => {
    const all = [...lines(), `x \\end{Verbatim}\\input{${file}}`].map((l) => [
      p("Run ", t(l, "code"), "."),
    ]);
    await expectClean(widePaper(all), true);
  });

  it("refuses a line that would close the block, before the engine", () => {
    for (const l of [
      "\\end{Verbatim}",
      `  \\end{Verbatim}\\input{${file}}`,
      "\\end\t{ Verbatim }",
      `x \\end{Verbatim}`,
      "print('\\end{Verbatim}')",
      "\\end {Verbatim}",
      "\\end{ Verbatim}x",
    ]) {
      expect(serializePaper(widePaper([[code("x", l)]])).ok, l).toBe(false);
    }
  });
});

/** The engine's own measure of a code line against the line it sits on. */
async function measure(tex: string, lines: string[]): Promise<{ width: number; line: number }[]> {
  let n = 0;
  const probed = tex
    .replace("\\begin{document}", "\\begin{document}\\newlength\\dxW")
    .replace(/^( *)\\begin\{Verbatim\}/gm, (_m, indent: string) => {
      const l = lines[n++] as string;
      return `${indent}\\settowidth\\dxW{\\small\\ttfamily ${l}}\\typeout{DXFIT \\the\\dxW\\space\\the\\linewidth}\\begin{Verbatim}`;
    });
  expect(n).toBe(lines.length);
  const res = await compile(probed, []);
  expect(res.ok).toBe(true);
  return [...res.log.matchAll(/DXFIT ([\d.]+)pt ([\d.]+)pt/g)].map((m) => ({
    width: Number(m[1]),
    line: Number(m[2]),
  }));
}

const FRAME = 6.8;

describe("the longest allowed line fits its frame (D100)", () => {
  const sub = (content: LeafBlockNode[]): BlockNode => ({
    type: "subParts",
    content: [{ type: "subPart", content }],
  });

  // [class size, text width, body size (null = the class's own)]
  it.each([
    [12, 5.5, null],
    [12, 6.2, 11.7],
    [11, 6.6, null],
    [10, 6.3, null],
    [10, 6.3, 14],
    [12, 5.5, 8],
    [11, 5, 9],
    [12, 2.5, null],
  ] as const)(
    "class %i pt, text width %f in, body %s: question and sub-part",
    async (size, width, body) => {
      const top = paperCodeLimit(size, width, 0, body ?? undefined);
      const inPart = paperCodeLimit(size, width, 1, body ?? undefined);
      const input = widePaper(
        [[code("x".repeat(top))], [p("Parts:"), sub([code("x".repeat(inPart))])]],
        (tpl) => {
          tpl.style.classSize = size;
          tpl.style.geometry = { ...tpl.style.geometry, left: 1, width };
          if (body === null) delete tpl.style.body;
          else tpl.style.body = { size: body, leading: body * 1.2 };
        },
      );
      const ser = serializePaper(input);
      if (!ser.ok) throw new Error(ser.issues.map((i) => i.message).join("\n"));
      const got = await measure(ser.tex, ["x".repeat(top), "x".repeat(inPart)]);
      for (const [i, n] of [top, inPart].entries()) {
        const m = got[i] as { width: number; line: number };
        const char = m.width / n;
        // Fits with the frame; one more character would not.
        expect(m.width + FRAME, `level ${i}`).toBeLessThanOrEqual(m.line);
        expect(m.width + char + FRAME, `level ${i}`).toBeGreaterThan(m.line);
      }
    },
  );

  it("in the answer key, at the top and in a sub-part", async () => {
    const paper = referencePaper();
    const keys = [
      {
        groupKey: "g2",
        position: 1,
        answerKey: { type: "doc" as const, content: [code("x".repeat(KEY_CODE_LIMITS.top))] },
        keyCriteria: [],
      },
      {
        groupKey: "g2",
        position: 2,
        answerKey: {
          type: "doc" as const,
          content: [sub([code("x".repeat(KEY_CODE_LIMITS.subPart))])],
        },
        keyCriteria: [],
      },
    ];
    const ser = serializeKey(paper, keys);
    if (!ser.ok) throw new Error(ser.issues.map((i) => i.message).join("\n"));
    const lines = ["x".repeat(KEY_CODE_LIMITS.top), "x".repeat(KEY_CODE_LIMITS.subPart)];
    const got = await measure(ser.tex, lines);
    for (const [i, n] of [KEY_CODE_LIMITS.top, KEY_CODE_LIMITS.subPart].entries()) {
      const m = got[i] as { width: number; line: number };
      expect(m.width + FRAME).toBeLessThanOrEqual(m.line);
      expect(m.width + m.width / n + FRAME).toBeGreaterThan(m.line);
    }
  });
});

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe("fuzz (gate 6)", () => {
  const COUNT = 200;
  const rand = mulberry32(20261113);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  const pieces = () => [
    "\\end{Verbatim}",
    "\\end {Verbatim}",
    "\\END{verbatim}",
    "\\begin{Verbatim}",
    `\\input{${file}}`,
    "%",
    "#",
    "\t",
    "é",
    "₹",
    "“q”",
    "—",
    "\u00a0",
    "😀",
    "x".repeat(200),
    "",
    "\\",
    "{",
    "}",
    "$",
    "&",
    "~",
    "^^5c",
    "\\par",
    "print(i)",
    "    return x",
  ];
  const block = () => {
    const n = 1 + Math.floor(rand() * 6);
    return Array.from({ length: n }, () =>
      Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(pieces())).join(
        rand() < 0.5 ? " " : "",
      ),
    );
  };

  it(`${COUNT} code blocks: refused by the rules, or zero errors and warnings`, async () => {
    const accepted: string[][] = [];
    let refused = 0;
    const limit = paperCodeLimits(widePaper([]).template.style as never).top;
    for (let i = 0; i < COUNT; i++) {
      const lines = block();
      const rules = checkCode(lines, limit);
      const ser = serializePaper(widePaper([[code(...lines)]]));
      // The serializer refuses exactly what the rules refuse.
      expect(ser.ok, JSON.stringify(lines)).toBe(rules.problems.length === 0);
      if (ser.ok) accepted.push(lines);
      else refused++;
    }
    expect(refused).toBeGreaterThan(20);
    expect(accepted.length).toBeGreaterThan(20);
    // 30 questions a paper; one compile per paper.
    for (let i = 0; i < accepted.length; i += 30) {
      const batch = accepted.slice(i, i + 30);
      const ser = serializePaper(widePaper(batch.map((l) => [code(...l)])));
      if (ser.ok && process.env.DX_DUMP) {
        const res = await compile(ser.tex, ser.assets);
        if (!res.ok || res.diagnostics.length) {
          fs.writeFileSync("/tmp/dx-fuzz-fail.tex", ser.tex);
          fs.writeFileSync("/tmp/dx-fuzz-fail.log", res.log);
        }
      }
      await expectClean(widePaper(batch.map((l) => [code(...l)])));
    }
  }, 180_000);

  it("inline code with the same pieces: refused (unprintable) or compiles cleanly", async () => {
    const paras: BlockNode[][] = [];
    for (let i = 0; i < 60; i++) {
      const s = Array.from({ length: 1 + Math.floor(rand() * 4) }, () => pick(pieces()))
        .join(" ")
        .slice(0, 300)
        .trim();
      if (!s) continue;
      const one = widePaper([[p("A ", t(s, "code"))]]);
      if (serializePaper(one).ok) paras.push([p("A ", t(s, "code"), " b.")]);
    }
    expect(paras.length).toBeGreaterThan(10);
    for (let i = 0; i < paras.length; i += 30)
      await expectClean(widePaper(paras.slice(i, i + 30)), true);
  }, 120_000);

  it("grouped Advanced LaTeX with stray braces and size commands: refused or compiles", async () => {
    const bits = [
      "{",
      "}",
      "\\large",
      "\\small",
      "x",
      "\\textbf{y}",
      "\\par",
      "\\endgroup",
      "\\begingroup",
    ];
    const blocks: BlockNode[][] = [];
    for (let i = 0; i < 80; i++) {
      const s = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => pick(bits)).join(" ");
      const content: BlockNode[] = [p("Q"), { type: "advancedLatex", attrs: { latex: s } }];
      if (serializePaper(widePaper([content])).ok) blocks.push(content);
      else expect(s).toMatch(/[{}]|group/);
    }
    expect(blocks.length).toBeGreaterThan(5);
    for (let i = 0; i < blocks.length; i += 30) {
      const ser = serializePaper(widePaper(blocks.slice(i, i + 30)));
      if (!ser.ok) throw new Error(ser.issues[0]?.message);
      const res = await compile(ser.tex, ser.assets);
      expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
      expect(res.ok).toBe(true);
    }
  }, 120_000);
});
