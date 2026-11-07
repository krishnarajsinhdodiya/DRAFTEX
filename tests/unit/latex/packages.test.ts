// D87: packages are loaded from what the Advanced LaTeX blocks use, and only then.
import { describe, expect, it } from "vitest";
import { serializeKey } from "@/lib/latex/key";
import { packageLines, packagesUsed } from "@/lib/latex/packages";
import { serializePaper } from "@/lib/latex/serialize";
import { packagesKey } from "../../fixtures/papers/keys";
import { packagesPaper, referencePaper } from "../../fixtures/papers/papers";

const tex = (paper: unknown) => {
  const r = serializePaper(paper);
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("\n"));
  return r.tex;
};
const advanced = (latex: string) => ({ type: "advancedLatex", attrs: { latex } });

describe("package lines", () => {
  it("a paper without package commands loads none of them", () => {
    expect(tex(referencePaper())).not.toMatch(
      /mhchem|chemfig|mathtools|multirow|enumitem|xcolor|framed|tfrupee/,
    );
  });

  it("loads every package the blocks use, once, after the fixed set and in a fixed order", () => {
    const t = tex(packagesPaper());
    const lines = t
      .split("\n")
      .filter((l) =>
        /usepackage(\[[^\]]*\])?\{(mhchem|chemfig|mathtools|multirow|enumitem|xcolor|framed|tfrupee)\}/.test(
          l,
        ),
      );
    expect(lines).toEqual([
      "\\usepackage[version=4]{mhchem}",
      '\\XeTeXdefaultencoding "iso-8859-1"\\usepackage{chemfig}\\XeTeXdefaultencoding "utf-8"',
      "\\usepackage{mathtools}",
      "\\usepackage{multirow}",
      "\\usepackage{enumitem}",
      "\\usepackage{xcolor}",
      "\\usepackage{framed}",
      "\\usepackage{tfrupee}",
    ]);
    expect(t.indexOf("{tabularx}")).toBeLessThan(t.indexOf("{mhchem}"));
    expect(t.indexOf("{tfrupee}")).toBeLessThan(t.indexOf("\\begin{document}"));
  });

  it("a refused block loads nothing and never reaches the LaTeX", () => {
    const paper = referencePaper();
    const first = paper.slots[0];
    if (!first) throw new Error("fixture has no slots");
    first.content.content.push(advanced("\\ce{H2O} \\input{/etc/hosts}") as never);
    expect(packagesUsed(paper)).toEqual([]);
    const r = serializePaper(paper);
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues.map((i) => i.message).join()).toMatch(/\\input is not allowed for safety/);
  });

  it("finds blocks anywhere, sub-parts and keys included", () => {
    expect(
      packagesUsed({
        a: [{ b: { content: [advanced("\\rupee"), advanced("\\multirow{2}{*}{x}")] } }],
      }),
    ).toEqual(["multirow", "tfrupee"]);
  });

  it("the key loads what its answers use, without a second enumitem", () => {
    const f = packagesKey();
    const r = serializeKey(f.paper, f.keys);
    if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("\n"));
    expect(r.tex.match(/\{enumitem\}/g)).toHaveLength(1);
    expect(r.tex).toContain("\\usepackage[version=4]{mhchem}");
    expect(r.tex).toContain("{chemfig}");
  });

  it("packageLines is empty for no packages", () => {
    expect(packageLines([])).toEqual([]);
  });
});
