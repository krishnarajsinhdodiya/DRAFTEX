// Gate 7 (SPEC §10): every forbidden primitive is rejected, including obfuscated forms.
import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_PRIMITIVES,
  MAX_SNIPPET_BYTES,
  sanitizeLatex,
  type SanitizeMode,
} from "@/lib/latex/sanitize";

const modes: SanitizeMode[] = ["math", "advanced"];

function rejects(src: string, mode: SanitizeMode, msg?: RegExp) {
  const r = sanitizeLatex(src, mode);
  expect(r.ok, `expected rejection of ${JSON.stringify(src)} in ${mode}`).toBe(false);
  if (!r.ok && msg) expect(r.issues.map((i) => i.message).join("\n")).toMatch(msg);
}

function accepts(src: string, mode: SanitizeMode) {
  const r = sanitizeLatex(src, mode);
  expect(r, JSON.stringify(src)).toEqual({ ok: true, value: src, packages: [] });
}

describe("forbidden primitives (SPEC §8 list)", () => {
  it.each(modes.flatMap((m) => FORBIDDEN_PRIMITIVES.map((p) => [m, p] as const)))(
    "%s rejects \\%s",
    (mode, prim) => {
      // TeX reads \write18 as \write followed by the digits 18.
      const name = prim === "write18" ? "write" : prim;
      rejects(`x \\${prim}{a}`, mode, new RegExp(`\\\\${name} is not allowed for safety`));
      rejects(`\\${prim}`, mode);
    },
  );

  it.each([
    "\\write18{rm -rf /}",
    "\\immediate\\write18{calc}",
    "\\input{/etc/passwd}",
    "\\input /etc/passwd",
    "\\include{secret}",
    "\\openin5=/etc/passwd \\read5 to\\x",
    "\\openout3=evil.tex",
    "\\directlua{os.execute('x')}",
    "\\special{dvipdfmx:config}",
    "\\usepackage{shellesc}",
    "\\documentclass{article}",
    "\\makeatletter\\@input{x}",
    "\\jobname",
    "\\endinput",
    "\\loop\\iftrue\\repeat",
    "\\catcode`\\%=11",
    "\\def\\x{\\input}",
    "\\let\\x=\\input",
  ])("rejects %s in both modes", (src) => {
    for (const m of modes) rejects(src, m);
  });
});

describe("obfuscated forms", () => {
  it.each([
    ["\\csname input\\endcsname{/etc/passwd}", /\\csname is not allowed/],
    ["\\csname in\\endcsname", /\\csname/],
    ["^^5cinput{/etc/passwd}", /\^\^/],
    ["^^5c^^69nput", /\^\^/],
    ["^^^^005cinput", /\^\^/],
    ["x^^M", /\^\^/],
    ["\\expandafter\\input", /\\expandafter is not allowed for safety/],
    ["\\lowercase{\\INPUT}", /\\lowercase/],
    ["\\uppercase{\\input}", /\\uppercase/],
    ["\\scantokens{\\input x}", /\\scantokens/],
    ["\\edef\\x{y}", /\\edef/],
    ["\\gdef\\x{y}", /\\gdef/],
    ["\\xdef\\x{y}", /\\xdef/],
    ["\\newcommand{\\x}{\\input}", /\\newcommand/],
    ["\\renewcommand{\\frac}{x}", /\\renewcommand/],
    ["\\providecommand{\\x}{y}", /\\providecommand/],
    ["\\futurelet\\a\\b", /\\futurelet/],
    ["\\afterassignment\\x", /\\afterassignment/],
    ["\\string\\input", /\\string/],
    ["\\detokenize{x}", /\\detokenize/],
    ["\\the\\catcode", /\\the/],
    ["\\verb|\\input|", /\\verb/],
    ["\\@input{x}", /\\@/],
    ["\\InPut{x}", /\\InPut/],
    ["\\inputx", /\\inputx/],
    ["\\ input", undefined],
  ] as const)("rejects %s", (src, msg) => {
    for (const m of modes) {
      if (src === "\\ input") {
        // "\ " is a harmless control space followed by the word "input"
        accepts(src, m);
        continue;
      }
      rejects(src, m, msg);
    }
  });

  it("does not let a split command name reassemble (\\in{}put is ∈ then text)", () => {
    accepts("\\in{}put", "math");
    // With normal catcodes @ is not a letter: this is \in then the text "@put".
    accepts("\\in@put", "math");
  });
});

describe("structure breakers", () => {
  it.each([
    ["\\end{questions}", /“questions” is not allowed/],
    ["\\end{document}", /“document”/],
    ["\\begin{verbatim}x\\end{verbatim}", /“verbatim”/],
    ["\\begin{filecontents}{x}", /“filecontents”/],
    ["\\begin{cases}", /has no matching/],
    ["\\end{cases}", /does not match/],
    ["\\begin{cases}x\\end{pmatrix}", /does not match/],
    ["\\begin x", /must be followed by an environment name/],
    ["{x", /without a matching \}/],
    ["x}", /without a matching \{/],
    ["x % comment", /comment/],
    ["#1", /hash/],
    ["x\\", /lone backslash/],
    ["\\@", /“\\@” is not allowed/],
    ["a\u0000b", /Control characters/],
    ["\u00e9", /cannot be used here/],
    ["😀", /cannot be used here/],
  ] as const)("rejects %s", (src, msg) => {
    for (const m of modes) rejects(src, m, msg);
  });

  it("forbids $ and mode switches in math", () => {
    rejects("x$ \\input $", "math", /\$ is not allowed/);
    rejects("\\(x\\)", "math", /“\\\(” is not allowed/);
    rejects("\\[x\\]", "math");
  });

  it("requires balanced $ in advanced LaTeX", () => {
    accepts("Area $= \\pi r^2$ here", "advanced");
    rejects("cost $5", "advanced", /\$ without a matching/);
  });

  it("rejects snippets over 4 KB, counting UTF-8 bytes", () => {
    rejects("x".repeat(MAX_SNIPPET_BYTES + 1), "math", /longer than 4 KB/);
    accepts("x".repeat(MAX_SNIPPET_BYTES), "math");
  });

  it("reports every problem in offset order", () => {
    const r = sanitizeLatex("\\input{a} \\def", "math");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.offset)).toEqual([0, 10]);
  });
});

describe("allowed content", () => {
  it.each([
    "\\frac{a}{b} + \\sqrt[3]{x^{2}} - \\alpha_{i}",
    "CO = HR \\times SV",
    "\\SI{290}{mOsm/kg}",
    "\\qty{5}{\\milli\\gram\\per\\litre}",
    "\\left( \\frac{1}{2} \\right)^{n}",
    "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
    "f(x) = \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}",
    "\\sum_{i=1}^{n} x_i \\leq \\infty",
    "\\ce",
  ])("accepts math %s", (src) => {
    if (src === "\\ce") {
      rejects(src, "math"); // mhchem is not loaded
      return;
    }
    accepts(src, "math");
  });

  it("accepts text-level commands only in advanced mode", () => {
    const src =
      "\\begin{center}\\textbf{Note}\\end{center}\\begin{tabular}{ll}\\toprule a & b\\\\ \\bottomrule\\end{tabular}";
    accepts(src, "advanced");
    rejects(src, "math", /\\textbf|center/);
    accepts("50\\% w/v \\& \\# \\_ \\{ \\}", "advanced");
    accepts("\\(x\\) and \\[y\\]", "advanced");
  });
});
