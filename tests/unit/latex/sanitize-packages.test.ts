// Gate 7 for the Phase 12 package commands (D86-D91). Every attack form from
// docs/SECURITY-REVIEW-PHASE12.md is refused; the real engine check is
// tests/golden/packages-security.test.ts.
import { describe, expect, it } from "vitest";
import { FORBIDDEN_PRIMITIVES, sanitizeLatex } from "@/lib/latex/sanitize";

const adv = (s: string) => sanitizeLatex(s, "advanced");
const packagesOf = (s: string) => {
  const r = adv(s);
  expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  return r.ok ? r.packages : [];
};
const refused = (s: string, mode: "math" | "advanced" = "advanced") => {
  const r = sanitizeLatex(s, mode);
  expect(r.ok, s).toBe(false);
  return r.ok ? "" : r.issues.map((i) => i.message).join(" | ");
};

describe("package commands are accepted in Advanced LaTeX and name their package", () => {
  it.each([
    ["\\ce{H2SO4 -> 2H+ + SO4^2-}", ["mhchem"]],
    ["\\chemfig{*6(=-=-=-)}", ["chemfig"]],
    ["\\chemfig{H_3C-[:30]C(=[2]O)-[::-60,1.5,1,2]OH}", ["chemfig"]],
    ["$a \\coloneqq b$ and $\\prescript{14}{6}{C}$", ["mathtools"]],
    ["$\\begin{dcases} 1 & x \\end{dcases}$", ["mathtools"]],
    ["$\\begin{pmatrix*}[r] 1 \\end{pmatrix*}$", ["mathtools"]],
    ["\\begin{tabular}{cc}\\multirow{2}{*}{a} & b\\\\ & c\\end{tabular}", ["multirow"]],
    ["\\multirow{3}{2.5cm}{a}", ["multirow"]],
    ["\\begin{enumerate}[label=(\\alph*)]\\item x\\end{enumerate}", ["enumitem"]],
    [
      "\\begin{itemize} [label={--}, nosep, itemsep=2pt, leftmargin=*]\\item x\\end{itemize}",
      ["enumitem"],
    ],
    ["\\begin{enumerate}[label=Q\\arabic*., start=3]\\item x\\end{enumerate}", ["enumitem"]],
    ["\\textcolor{red}{x} \\textcolor{blue!50}{y} \\textcolor{red!30!black}{z}", ["xcolor"]],
    ["\\begin{framed}x\\end{framed}", ["framed"]],
    ["\\rupee{} 100", ["tfrupee"]],
  ])("%s", (src, want) => {
    expect(packagesOf(src)).toEqual(want);
  });

  it("lists packages once, in preamble order", () => {
    expect(packagesOf("\\rupee{} \\ce{H2O} \\ce{O2} \\chemfig{A-B}")).toEqual([
      "mhchem",
      "chemfig",
      "tfrupee",
    ]);
  });

  it("plain enumerate and itemize without options need no package", () => {
    expect(packagesOf("\\begin{enumerate}\\item x\\end{enumerate}")).toEqual([]);
  });

  it("refuses every package command in the Equation field (D88)", () => {
    for (const s of ["\\ce{H2O}", "\\coloneqq", "\\rupee", "\\textcolor{red}{x}"])
      expect(refused(s, "math")).toMatch(/not a supported command/);
    expect(refused("\\begin{dcases}1\\end{dcases}", "math")).toMatch(/not allowed here/);
  });
});

describe("chemfig keeps tikz out of reach (D89)", () => {
  it.each([
    "\\chemfig{A-[,,,,draw=none]B}",
    "\\chemfig{A-[:30,,,,insert path={plot file {/tmp/x}}]B}",
    "\\chemfig{A-[,,,,]B}",
    "\\chemfig{**[0,360,dashed]6(------)}",
    "\\chemfig{A-[red]B}",
    "\\chemfig{A-[:30}",
  ])("bond options %s", (s) => {
    expect(refused(s)).toMatch(/bond options may only hold/);
  });

  it.each([
    ["\\chemfig[line width=2pt]{A-B}", /followed directly by the molecule/],
    ["\\chemfig*{A-B}", /followed directly by the molecule/],
    ["\\chemfig {A-B}", /followed directly by the molecule/],
    ["\\chemfig{A-@{a}B}", /“@” is not allowed inside \\chemfig/],
    ["\\chemfig{A-!{x}}", /“!” is not allowed inside \\chemfig/],
    ["\\chemfig{A-\\chemfig{B}}", /cannot sit inside another/],
    ["\\chemfig{A-B\\input{/etc/hosts}}", /\\input is not allowed for safety/],
    ["\\chemfig{A-B}\\chemmove{\\draw(a)--(b);}", /\\chemmove is not allowed for safety/],
    ["\\definesubmol{x}{A-B}", /\\definesubmol is not allowed for safety/],
    ["\\setchemfig{atom sep=2em}", /\\setchemfig is not allowed for safety/],
    ["\\schemestart A \\arrow B \\schemestop", /\\schemestart is not a supported command/],
  ])("%s", (s, why) => {
    expect(refused(s)).toMatch(why);
  });

  it("brackets and ! are ordinary again once the molecule closes", () => {
    expect(packagesOf("\\chemfig{A-B} [see note]! done")).toEqual(["chemfig"]);
  });
});

describe("argument grammars (D90)", () => {
  it.each([
    ["\\textcolor{red!50!black!20}{x}", /colour from this list/],
    ["\\textcolor[rgb]{1,0,0}{x}", /colour from this list/],
    ["\\textcolor{\\input}{x}", /colour from this list/],
    ["\\textcolor{red}x", /colour from this list/],
    ["\\textcolor{pink}{x}", /colour from this list/],
    ["\\color{red} x", /\\color is not a supported command/],
    ["\\pagecolor{black}", /\\pagecolor is not allowed for safety/],
    ["\\definecolor{x}{rgb}{1,0,0}", /\\definecolor is not allowed for safety/],
    ["\\multirow{0}{*}{a}", /1 to 20 rows/],
    ["\\multirow{21}{*}{a}", /1 to 20 rows/],
    ["\\multirow[c]{2}{*}{a}", /1 to 20 rows/],
    ["\\multirow{2}{\\linewidth}{a}", /1 to 20 rows/],
    ["\\begin{enumerate}[before={\\large}]\\item x\\end{enumerate}", /List option “before=/],
    ["\\begin{enumerate}[first=\\large]\\item x\\end{enumerate}", /List option “first=/],
    ["\\begin{enumerate}[label=\\input]\\item x\\end{enumerate}", /List option “label=\\input”/],
    ["\\begin{enumerate}[ref=x]\\item x\\end{enumerate}", /List option “ref=x”/],
    ["\\begin{enumerate}[]\\item x\\end{enumerate}", /List option “”/],
    ["\\begin{enumerate}[label=(a)", /List option/],
    ["\\setlist{nosep}", /\\setlist is not allowed for safety/],
  ])("%s", (s, why) => {
    expect(refused(s)).toMatch(why);
  });
});

describe("obfuscated forms inside package arguments", () => {
  it.each([
    ["\\ce{^^5cinput{/etc/hosts}}", /“\^\^”/],
    ["\\ce{\\csname input\\endcsname}", /\\csname is not allowed/],
    ["\\textcolor{red}{\\input{/etc/hosts}}", /\\input is not allowed/],
    ["\\multirow{2}{*}{\\openout}", /\\openout is not allowed/],
    [
      "\\begin{framed}\\lstinputlisting{/etc/hosts}\\end{framed}",
      /\\lstinputlisting is not allowed/,
    ],
    ["\\ce{A ->[\\includegraphics{/x.png}] B}", /\\includegraphics is not allowed/],
    ["\\chemfig{A-B^^5c}", /“\^\^”/],
    ["\\rupee\\addplot table {/etc/hosts};", /\\addplot is not allowed/],
    ["\\begin{input}\\end{input}", /environment “input” is not allowed/],
    ["\\ce{₹}", /character “₹”/],
  ])("%s", (s, why) => {
    expect(refused(s)).toMatch(why);
  });
});

describe("second-layer blocklist (D91)", () => {
  it.each(FORBIDDEN_PRIMITIVES.map((p) => [p]))("\\%s is refused for safety in both modes", (p) => {
    expect(refused(`\\${p}`)).toMatch(/is not allowed for safety/);
    expect(refused(`\\${p}`, "math")).toMatch(/is not allowed for safety/);
  });
});
