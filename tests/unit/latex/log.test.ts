import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  goldenFailures,
  looksLikeCacheMiss,
  parseDiagnostics,
  parseLog,
  parseStderr,
} from "@/lib/latex/log";

// Captured from real Tectonic 0.17.0 runs (invented one-line documents).
const fixture = (name: string) =>
  fs.readFileSync(fileURLToPath(new URL(`../../fixtures/latex/${name}`, import.meta.url)), "utf8");

describe("parseStderr (real output)", () => {
  it("reads box warnings once even though TeX ran twice", () => {
    const d = parseStderr(fixture("w.stderr.txt"));
    expect(d).toHaveLength(4);
    expect(d[0]).toEqual({
      severity: "warning",
      kind: "overfull",
      file: "w.tex",
      line: 3,
      overfullPt: 143.0945,
      message: "Overfull \\hbox (143.0945pt too wide) detected at line 3",
    });
    expect(d.filter((x) => x.kind === "underfull")).toHaveLength(2);
  });

  it("reads errors with file and line and drops the generic wrapper lines", () => {
    const d = parseStderr(fixture("e.stderr.txt"));
    expect(d).toEqual([
      { severity: "error", kind: "error", file: "e.tex", line: 4, message: "Missing } inserted" },
    ]);
  });

  it("detects an offline cache miss", () => {
    const d = parseStderr(fixture("p.stderr.txt"));
    expect(d[0]?.message).toBe("LaTeX Error: File `nonexistentpkg.sty' not found.");
    expect(looksLikeCacheMiss(d)).toBe(true);
    expect(looksLikeCacheMiss(parseStderr(fixture("e.stderr.txt")))).toBe(false);
  });

  it("turns an xdvipdfmx font failure into an error and a cache miss", () => {
    const d = parseStderr(fixture("font-miss.stderr.txt"));
    expect(d.filter((x) => x.severity === "error").map((x) => x.message)).toEqual([
      'Cannot proceed without .vf or "physical" font for PDF output...',
    ]);
    expect(looksLikeCacheMiss(d)).toBe(true);
  });

  it("keeps non-TeX engine warnings", () => {
    const d = parseStderr(
      "warning: accessing absolute path `/etc/hosts`; build may not be reproducible\n",
    );
    expect(d[0]).toMatchObject({ kind: "engine-warning", severity: "warning" });
    expect(d[0]?.file).toBeUndefined();
  });
});

describe("parseLog (real output)", () => {
  it("finds LaTeX warnings the stderr stream does not show", () => {
    const d = parseLog(fixture("w.log.txt"));
    expect(d.map((x) => x.message)).toEqual([
      "LaTeX Warning: Reference `nope' on page 1 undefined on input line 3.",
      "LaTeX Warning: There were undefined references.",
    ]);
    expect(d[0]?.line).toBe(3);
  });

  it("joins package warning continuation lines", () => {
    const log = [
      "Package siunitx Warning: Something odd",
      "(siunitx)                happened here on input line 12.",
      "",
      "Class exam Warning: Points are odd.",
      "LaTeX Font Warning: Font shape `OT1/cmr/bx/sc' undefined",
      "(Font)              using `OT1/cmr/bx/n' instead on input line 7.",
      "Missing character: There is no ☃ in font cmr10!",
    ].join("\n");
    const d = parseLog(log);
    expect(d.map((x) => [x.kind, x.line])).toEqual([
      ["latex-warning", 12],
      ["latex-warning", undefined],
      ["latex-warning", 7],
      ["missing-char", undefined],
    ]);
    expect(d[0]?.message).toBe(
      "Package siunitx Warning: Something odd happened here on input line 12.",
    );
  });
});

describe("goldenFailures", () => {
  it("allows overfull boxes up to 1 pt and nothing else", () => {
    const d = parseDiagnostics(
      [
        "warning: p.tex:1: Overfull \\hbox (0.8pt too wide) in paragraph at lines 1--1",
        "warning: p.tex:2: Overfull \\hbox (1.2pt too wide) in paragraph at lines 2--2",
        "warning: p.tex:3: Underfull \\hbox (badness 10000) in paragraph at lines 3--3",
      ].join("\n"),
      "LaTeX Warning: Label(s) may have changed.\n",
    );
    expect(goldenFailures(d).map((x) => x.line ?? x.kind)).toEqual([2, 3, "latex-warning"]);
  });
});
