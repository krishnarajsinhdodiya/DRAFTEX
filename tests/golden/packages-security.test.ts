// Gate 7 with the real engine (D93): no Advanced LaTeX form, with or without
// the Phase 12 packages, gets a file's contents into the PDF or the log, or
// writes a file outside the job folder. docs/SECURITY-REVIEW-PHASE12.md lists
// the attacks; each one here is either refused by the serializer before the
// engine runs, or compiled and checked for the canary.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompileService } from "@/lib/latex/compile";
import { serializeKey } from "@/lib/latex/key";
import { PACKAGE_COMMANDS, PACKAGE_ENVIRONMENTS } from "@/lib/latex/sanitize";
import { serializePaper } from "@/lib/latex/serialize";
import type { BlockNode } from "@/lib/paper/schema";
import { ALL_ASSETS, referencePaper } from "../fixtures/papers/papers";
import { realCompileService } from "../support/engine";
import { pdfText } from "../support/pdf";

const CANARY = "DXCANARY7F3A9Q";
let dir: string;
let file: string; // absolute path, forward slashes (TeX reads them on Windows too)
let out: string; // where a write would land
let svc: CompileService;

beforeAll(() => {
  svc = realCompileService();
  // Long path: a Windows 8.3 short name (RUNNER~1) has a "~", which \ce refuses.
  dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "dx-canary-")));
  file = path.join(dir, "canary.txt").split(path.sep).join("/");
  out = path.join(dir, "written.tex").split(path.sep).join("/");
  fs.writeFileSync(file, `${CANARY}\n1 2\n3 ${CANARY}\n`);
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const squash = (s: string) => s.replace(/\s+/g, "");

/** The canary must not show in the PDF text or the log, and nothing new may appear beside it. */
async function expectNoLeak(tex: string, used: string[]) {
  const assets = ALL_ASSETS.filter((a) => used.includes(a.name)).map((a) => ({
    name: a.name,
    sourcePath: a.sourcePath,
  }));
  const res = await svc.compile({ userId: "gate7", tex, assets });
  expect(res.usedNetwork).toBe(false);
  if (res.pdf) expect(squash(await pdfText(res.pdf))).not.toContain(CANARY);
  expect(squash(res.log)).not.toContain(CANARY);
  expect(fs.readdirSync(dir)).toEqual(["canary.txt"]);
  return res;
}

function paperWith(latex: string) {
  const paper = referencePaper();
  const block = { type: "advancedLatex", attrs: { latex } } as BlockNode;
  const first = paper.slots[0];
  if (!first) throw new Error("fixture has no slots");
  first.content.content.push(block);
  return paper;
}

const attacks = (): string[] => {
  const P = file;
  return [
    `\\input{${P}}`,
    `\\input ${P} `,
    `\\include{${P}}`,
    `\\csname input\\endcsname{${P}}`,
    `^^5cinput{${P}}`,
    `\\begin{input}${P}\\end{input}`,
    `\\lstinputlisting{${P}}`,
    `\\includegraphics{${P}}`,
    `\\addplot table {${P}};`,
    `\\pgfplotstableread{${P}}\\t`,
    `\\newwrite\\w\\immediate\\openout\\w=${out} \\immediate\\write\\w{x}`,
    `\\chemfig{A-[,,,,insert path={plot file {${P}}}]B}`,
    `\\chemfig{**[0,360,insert path={plot file {${P}}}]6(------)}`,
    `\\chemfig[insert path={plot file {${P}}}]{A-B}`,
    `\\chemfig{A-B}\\chemmove{\\draw plot file {${P}};}`,
    `\\begin{enumerate}[before={\\input{${P}}}]\\item x\\end{enumerate}`,
    `\\begin{enumerate}[label=\\input{${P}}]\\item x\\end{enumerate}`,
    `\\textcolor{red}{\\input{${P}}}`,
    `\\textcolor{\\input{${P}}}{x}`,
    `\\multirow{2}{*}{\\input{${P}}}`,
    `\\ce{\\input{${P}}}`,
    `\\ce{A ->[\\input{${P}}] B}`,
    `\\pu{\\csname input\\endcsname ${P}}`,
    `\\begin{framed}\\input{${P}}\\end{framed}`,
    `$\\begin{dcases}\\input{${P}}\\end{dcases}$`,
    `\\rupee\\expandafter\\input{${P}}`,
    `\\usetikzlibrary{${P}}`,
    `\\tcbuselibrary{listings}\\tcbinputlisting{listing file=${P}}`,
  ];
};

/**
 * Accepted on purpose: package commands holding path-like text (@P@ = the
 * canary's path without a drive letter, "_" escaped), which must print as text only.
 */
const ACCEPTED = [
  "\\ce{@P@}",
  "\\chemfig{A-[:30]B@P@}",
  "\\textcolor{red}{@P@}",
  "\\multirow{2}{*}{@P@}",
  "\\begin{framed}@P@\\end{framed}",
  "\\begin{enumerate}[label=(\\alph*), nosep]\\item @P@\\end{enumerate}",
  "$\\prescript{14}{6}{C}$ \\rupee{} @P@",
];

describe("gate 7 with the real engine (D93)", () => {
  it("would see the canary if a read got through (detector self-check)", async () => {
    const res = await svc.compile({
      userId: "gate7",
      tex: `\\documentclass{article}\\begin{document}\\input{${file}}\\end{document}`,
    });
    expect(squash(await pdfText(res.pdf as Buffer))).toContain(CANARY);
  });

  it("would see a write outside the job folder (detector self-check)", async () => {
    await svc.compile({
      userId: "gate7",
      tex: `\\documentclass{article}\\begin{document}\\newwrite\\w\\immediate\\openout\\w=${out} \\immediate\\write\\w{x}\\immediate\\closeout\\w x\\end{document}`,
    });
    const wrote = fs.existsSync(out);
    if (process.platform === "win32" && !wrote) {
      // windows-latest did not write to an absolute C:/ path (run 42354386185),
      // while absolute reads work there; the refusals below still run.
      console.log("gate 7: the engine did not write to an absolute path on this computer");
      return;
    }
    expect(wrote).toBe(true);
    fs.rmSync(out);
  });

  it("refuses every attack form before the engine, in the paper and in the key", () => {
    for (const a of attacks()) {
      expect(serializePaper(paperWith(a)).ok, a).toBe(false);
      const key = [
        { groupKey: "g1", position: 1, answerKey: paperWith(a).slots[0]?.content, keyCriteria: [] },
      ];
      expect(serializeKey(referencePaper(), key).ok, a).toBe(false);
    }
  });

  it.each(ACCEPTED.map((a) => [a]))("accepted %s compiles without leaking", async (a) => {
    const ser = serializePaper(
      paperWith(a.replaceAll("@P@", file.replace(/^[A-Za-z]:/, "").replaceAll("_", "\\_"))),
    );
    if (!ser.ok) throw new Error(ser.issues.map((i) => i.message).join("\n"));
    const res = await expectNoLeak(ser.tex, ser.assets);
    expect(res.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(res.ok).toBe(true);
  });
});

/** One use of every command and environment the allow-list adds (D86). */
function sample(name: string): string {
  const special: Record<string, string> = {
    ce: "\\ce{2H2O}",
    chemfig: "\\chemfig{A-[:30]B}",
    multirow: "\\begin{tabular}{cc}\\multirow{2}{*}{a} & b\\\\ & c\\end{tabular}",
    textcolor: "\\textcolor{red}{x}",
    rupee: "\\rupee{}",
  };
  return special[name] ?? `$\\${name}{a}{b}{c}$`;
}

describe("every allowed package command exists in the pinned bundle", () => {
  it("compiles each one with no error", async () => {
    const blocks = [
      ...Object.keys(PACKAGE_COMMANDS).map(sample),
      ...Object.keys(PACKAGE_ENVIRONMENTS).map((e) =>
        e === "framed" ? "\\begin{framed}x\\end{framed}" : `$\\begin{${e}} a & b \\end{${e}}$`,
      ),
      "\\begin{enumerate}[label=(\\alph*), nosep]\\item x\\end{enumerate}",
    ];
    const failures: string[] = [];
    for (const b of blocks) {
      const ser = serializePaper(paperWith(b));
      if (!ser.ok) {
        failures.push(`${b}: refused (${ser.issues[0]?.message})`);
        continue;
      }
      const res = await expectNoLeak(ser.tex, ser.assets);
      const errors = res.diagnostics.filter((d) => d.severity === "error");
      if (!res.ok || errors.length)
        failures.push(`${b}: ${errors.map((d) => d.message).join("; ")}`);
    }
    expect(failures).toEqual([]);
  });
});
