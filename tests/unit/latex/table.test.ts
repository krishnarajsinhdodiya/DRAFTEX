// Phase 14 (D105-D107): table options, grid map, limits and the LaTeX for
// each option. The engine side (widths, merged-row check, canary) is in
// tests/golden/tables-security.test.ts.
import { describe, expect, it } from "vitest";
import { type EditorNode, fromStored, toStored } from "@/lib/editor/convert";
import { serializeKey } from "@/lib/latex/key";
import { packagesUsed } from "@/lib/latex/packages";
import { cellBreaker, serializePaper } from "@/lib/latex/serialize";
import {
  MERGED_CELL_LINES,
  TABLE_LIMITS,
  checkTable,
  columnSettings,
  hasTableOptions,
  mergedCellsUsed,
  tableGrid,
  tableLatex,
} from "@/lib/latex/table";
import { explain } from "@/lib/paper/problems";
import { tableNode, type PaperInput, type TableNode } from "@/lib/paper/schema";
import { tablesKey } from "../../fixtures/papers/keys";
import {
  m,
  p,
  referencePaper,
  t,
  table,
  tablesPaper,
  xtable,
  type XCell,
} from "../../fixtures/papers/papers";

const tab = (rows: XCell[][], attrs: Parameters<typeof xtable>[1] = {}) =>
  tableNode.parse(xtable(rows, attrs));
const plain = (c: TableNode["content"][number]["content"][number]) =>
  (c.content ?? [])
    .map((x) => (x.content ?? []).map((n) => (n.type === "text" ? n.text : "")).join(""))
    .join("|");

function paperWith(block: unknown): PaperInput {
  const base = referencePaper();
  return {
    ...base,
    slots: [{ groupKey: "g2", position: 1, content: { type: "doc", content: [block as never] } }],
  };
}

describe("hasTableOptions", () => {
  it("is false for today's tables and for settings that print the same", () => {
    expect(hasTableOptions(tab([["a", "b"]]))).toBe(false);
    expect(
      hasTableOptions(tab([["a"]], { borders: "BOOKTABS", columns: [{ align: "LEFT" }] })),
    ).toBe(false);
  });
  it("is true for alignment, widths, grid borders and merges", () => {
    expect(hasTableOptions(tab([["a"]], { columns: [{ align: "RIGHT" }] }))).toBe(true);
    expect(hasTableOptions(tab([["a"]], { columns: [{ width: 100 }] }))).toBe(true);
    expect(hasTableOptions(tab([["a"]], { borders: "GRID" }))).toBe(true);
    expect(hasTableOptions(tab([[{ text: "a", colspan: 2 }], ["b", "c"]]))).toBe(true);
    expect(hasTableOptions(tab([[{ text: "a", rowspan: 2 }, "b"], ["c"]]))).toBe(true);
  });
});

describe("tableGrid", () => {
  it("places merged cells as HTML does", () => {
    const g = tableGrid(
      tab([
        [
          { text: "a", rowspan: 2 },
          { text: "b", colspan: 2 },
        ],
        ["c", "d"],
      ]),
    );
    if ("problem" in g) throw new Error(g.problem);
    expect(g.grid.cols).toBe(3);
    expect(g.grid.at[1]?.map((a) => `${a.row}${a.col}`)).toEqual(["00", "11", "12"]);
  });
  it("pads short rows with empty cells", () => {
    const g = tableGrid(tab([["a", "b", "c"], ["d"]]));
    if ("problem" in g) throw new Error(g.problem);
    expect(g.grid.at[1]?.map((a) => a.cell)).toHaveLength(3);
    expect(g.grid.at[1]?.[2]?.cell).toBeNull();
  });
  it("refuses a merge below the last row and overlapping merges", () => {
    expect(tableGrid(tab([[{ text: "a", rowspan: 3 }], ["b"]]))).toEqual({
      problem: "A merged cell reaches below the last row of the table.",
    });
    expect(tableGrid(tab([["a", { text: "b", rowspan: 2 }], [{ text: "c", colspan: 2 }]]))).toEqual(
      { problem: "Two merged cells of the table overlap." },
    );
  });
});

describe("checkTable (D107)", () => {
  const cols = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
  it("allows 10 columns and 30 rows, not more", () => {
    const ok = tab(
      Array.from({ length: 30 }, () => cols(10)),
      { borders: "GRID" },
    );
    expect(checkTable(ok)).toEqual([]);
    expect(checkTable(tab([cols(11)], { borders: "GRID" }))).toEqual([
      `A table with column settings, borders or merged cells can have at most ${TABLE_LIMITS.columns} columns; this one has 11.`,
    ]);
    expect(
      checkTable(
        tab(
          Array.from({ length: 31 }, () => ["x"]),
          { borders: "GRID" },
        ),
      )[0],
    ).toMatch(/at most 30 rows; this one has 31/);
  });
  it("leaves today's tables alone, even past the new limits", () => {
    expect(checkTable(tab([cols(12)]))).toEqual([]);
  });
  it("wants widths on every column or none, adding up to 100, at least 5 each", () => {
    expect(checkTable(tab([["a", "b"]], { columns: [{ width: 50 }, {}] }))).toEqual([
      "Give every column a width, or none (equal widths).",
    ]);
    expect(checkTable(tab([["a", "b"]], { columns: [{ width: 50 }, { width: 40 }] }))).toEqual([
      "The column widths add up to 90%; they must add up to 100%.",
    ]);
    expect(checkTable(tab([["a", "b"]], { columns: [{ width: 97 }, { width: 3 }] }))).toEqual([
      "Each column needs at least 5% of the table's width.",
    ]);
    expect(checkTable(tab([["a", "b"]], { columns: [{ width: 60 }, { width: 40 }] }))).toEqual([]);
    expect(
      checkTable(tab([["a"]], { columns: [{ align: "RIGHT" }, { align: "CENTER" }] })),
    ).toEqual(["The table has settings for more columns than it has."]);
  });
  it("keeps a row merge out of the booktabs header line, not the grid's", () => {
    const rows: XCell[][] = [[{ text: "h", rowspan: 2 }, "x"], ["y"]];
    expect(checkTable(tab(rows))[0]).toMatch(/cannot cross the line under the header row/);
    expect(checkTable(tab(rows, { headerRow: false }))).toEqual([]);
    expect(checkTable(tab(rows, { borders: "GRID" }))).toEqual([]);
  });
  it("wants each column to keep 4% of the line", () => {
    expect(
      checkTable(tab([["a", "b", "c", "d", "e", "f"]], { borders: "GRID", widthPercent: 20 })),
    ).toEqual([
      "Column 1 is too narrow to print: each column needs at least 4% of the line. Widen the table or the column, or use fewer columns.",
    ]);
    expect(
      checkTable(
        tab([["a", "b"]], { widthPercent: 50, columns: [{ width: 95 }, { width: 5 }] }),
      )[0],
    ).toMatch(/^Column 2 is too narrow/);
    expect(
      checkTable(tab([["a", "b", "c", "d", "e"]], { borders: "GRID", widthPercent: 20 })),
    ).toEqual([]);
  });

  it("reports a grid problem on its own", () => {
    expect(checkTable(tab([[{ text: "a", rowspan: 2 }]]))).toEqual([
      "A merged cell reaches below the last row of the table.",
    ]);
  });
});

describe("columnSettings", () => {
  it("gives equal widths unless every column has one", () => {
    expect(columnSettings(tab([["a", "b", "c"]]), 3).map((c) => c.width)).toEqual([
      100 / 3,
      100 / 3,
      100 / 3,
    ]);
    expect(
      columnSettings(
        tab([["a", "b"]], { columns: [{ width: 70, align: "RIGHT" }, { width: 30 }] }),
        2,
      ),
    ).toEqual([
      { align: "RIGHT", width: 70 },
      { align: "LEFT", width: 30 },
    ]);
  });
});

describe("tableLatex (D106)", () => {
  const latex = (rows: XCell[][], attrs: Parameters<typeof xtable>[1] = {}) =>
    tableLatex(tab(rows, attrs), plain);

  it("writes p{} columns from the table width, with alignment", () => {
    const s = latex([["a", "b"]], {
      widthPercent: 50,
      columns: [
        { width: 30, align: "CENTER" },
        { width: 70, align: "RIGHT" },
      ],
    });
    expect(s).toContain(
      "\\begin{tabular}{@{}>{\\centering\\arraybackslash}p{0.3\\dimexpr 0.5\\linewidth-2\\tabcolsep\\relax}>{\\raggedleft\\arraybackslash}p{0.7\\dimexpr 0.5\\linewidth-2\\tabcolsep\\relax}@{}}",
    );
    expect(
      s.startsWith(
        "\\par\\smallskip\n\\ifdim0.3\\dimexpr 0.5\\linewidth-2\\tabcolsep\\relax<1em\\PackageError{draftex}{DXNARROWTABLE",
      ),
    ).toBe(true);
    expect(s).toContain("\\toprule");
    expect(s).toContain("\\bottomrule");
    expect(s.trim().endsWith("\\end{tabular}")).toBe(true);
  });

  it("rounds equal widths down so the columns never pass the table width", () => {
    const s = latex([["a", "b", "c"]], { borders: "GRID" });
    expect(
      s.match(/p\{0\.33333\\dimexpr 0\.8\\linewidth-6\\tabcolsep-4\\arrayrulewidth\\relax\}/g),
    ).toHaveLength(3);
  });

  it("writes no \\tabcolsep for one booktabs column", () => {
    expect(latex([["a"]], { columns: [{ align: "CENTER" }] })).toContain(
      "p{1\\dimexpr 0.8\\linewidth\\relax}@{}}",
    );
  });

  it("puts \\midrule under the header row only with booktabs", () => {
    expect(latex([["h"], ["b"]], { columns: [{ align: "RIGHT" }] })).toContain("\\midrule");
    expect(
      latex([["h"], ["b"]], { columns: [{ align: "RIGHT" }], headerRow: false }),
    ).not.toContain("\\midrule");
  });

  it("draws a full grid with a bold header row", () => {
    const s = latex(
      [
        ["H1", "H2"],
        ["a", "b"],
      ],
      { borders: "GRID" },
    );
    expect(s).toMatch(/\\begin\{tabular\}\{\|>.*\|>.*\|\}/);
    expect(s).toContain("\\textbf{H1} & \\textbf{H2}\\\\");
    expect(s.match(/\\hline/g)).toHaveLength(3);
    expect(latex([["H1"], ["a"]], { borders: "GRID", headerRow: false })).not.toContain("\\textbf");
  });

  it("merges columns with \\multicolumn over their widths and separators", () => {
    const s = latex(
      [
        [{ text: "Dose", colspan: 2 }, "R"],
        ["a", "b", "c"],
      ],
      {
        columns: [{ width: 40, align: "CENTER" }, { width: 30 }, { width: 30 }],
      },
    );
    expect(s).toContain(
      "\\multicolumn{2}{@{}>{\\centering\\arraybackslash}p{\\dimexpr 0.7\\dimexpr 0.8\\linewidth-4\\tabcolsep\\relax+2\\tabcolsep\\relax}}{Dose} & R\\\\",
    );
    const grid = latex(
      [
        ["a", { text: "b", colspan: 2 }],
        ["c", "d", "e"],
      ],
      { borders: "GRID" },
    );
    expect(grid).toContain("+2\\tabcolsep+1\\arrayrulewidth\\relax}|}{\\textbf{b}}");
  });

  it("merges rows with \\multirow and the line check, leaving the line out under it", () => {
    const s = latex([["h", "h2"], [{ text: "m", rowspan: 2 }, "x"], ["y"]], {
      borders: "GRID",
      columns: [{ align: "RIGHT" }, {}],
    });
    expect(s).toContain("\\multirow{2}{=}{\\dxMerged{2}{\\raggedleft m}} & x\\\\");
    expect(s).toContain("\\cline{2-2}");
    expect(s).toContain(" & y\\\\");
  });

  it("merges both ways: \\multirow inside \\multicolumn, empty \\multicolumn below", () => {
    const s = latex([[{ text: "m", colspan: 2, rowspan: 2 }, "a"], ["b"], ["c", "d", "e"]], {
      borders: "GRID",
      headerRow: false,
    });
    expect(s).toMatch(
      /\\multicolumn\{2\}\{\|.*\|\}\{\\multirow\{2\}\{=\}\{\\dxMerged\{2\}\{\\raggedright m\}\}\} & a/,
    );
    expect(s).toMatch(/\\multicolumn\{2\}\{\|.*\|\}\{\} & b/);
    expect(s).toContain("\\cline{3-3}");
  });

  it("splits a grid line into pieces around a merge in the middle", () => {
    const s = latex(
      [
        ["a", { text: "m", rowspan: 2 }, "b"],
        ["c", "d"],
      ],
      { borders: "GRID", headerRow: false },
    );
    expect(s).toContain("\\cline{1-1}\\cline{3-3}");
  });
});

describe("serializePaper with table options", () => {
  it("prints the fixture and loads multirow and \\dxMerged only when rows are merged", () => {
    const r = serializePaper(tablesPaper());
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.tex).toContain("\\usepackage{multirow}");
    for (const l of MERGED_CELL_LINES) expect(r.tex).toContain(l);
    // The old table in the fixture keeps tabularx (D106).
    expect(r.tex).toContain("\\begin{tabularx}{0.8\\linewidth}{@{}lX@{}}");

    const noRows = serializePaper(
      paperWith(xtable([[{ text: "a", colspan: 2 }], ["b", "c"]], { borders: "GRID" })),
    );
    if (!noRows.ok) throw new Error(JSON.stringify(noRows.issues));
    expect(noRows.tex).not.toContain("multirow");
    expect(noRows.tex).not.toContain("dxMerged");
  });

  it("writes cell paragraphs on their own lines in new tables, joined in old ones", () => {
    const two = {
      type: "tableCell",
      content: [p("one"), p("two")],
    };
    const mk = (attrs: object) => ({
      type: "table",
      attrs: { headerRow: false, widthPercent: 80, ...attrs },
      content: [{ type: "tableRow", content: [two] }],
    });
    const fresh = serializePaper(paperWith(mk({ borders: "GRID" })));
    const old = serializePaper(paperWith(mk({})));
    if (!fresh.ok || !old.ok) throw new Error("not ok");
    expect(fresh.tex).toContain("one\\par two");
    expect(old.tex).toContain("one two\\\\");
  });

  it("names a table's problems on its question", () => {
    const r = serializePaper(
      paperWith(xtable([["a", "b"]], { columns: [{ width: 50 }, { width: 20 }] })),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toEqual([
      {
        slotId: "g2.1",
        message: "Table: The column widths add up to 70%; they must add up to 100%.",
      },
    ]);
  });

  it("refuses an equation that would split a cell, in old and new tables", () => {
    for (const latex of ["a & b", "a \\\\ b", "\\hline"]) {
      for (const tbl of [xtable([[[m(latex)]]], { borders: "GRID" }), xtable([[[m(latex)]]])]) {
        const r = serializePaper(paperWith(tbl));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.issues[0]?.message).toMatch(/cannot use &/);
      }
    }
    const ok = serializePaper(
      paperWith(xtable([[[m("\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}")]]], { borders: "GRID" })),
    );
    expect(ok.ok).toBe(true);
  });

  it("keeps & and \\\\ in equations outside tables", () => {
    expect(serializePaper(paperWith(p(m("a & b")))).ok).toBe(true);
  });
});

describe("cellBreaker", () => {
  it.each([
    ["a & b", true],
    ["a \\\\ b", true],
    ["\\hline", true],
    ["\\& b", false],
    ["\\begin{matrix}a&b\\\\c\\end{matrix}", false],
    ["\\begin{matrix}a\\end{matrix} & b", true],
    ["\\end{x} & b", true],
    ["\\hlinex", false],
    ["\\frac{a}{b}", false],
    ["x\\", false],
  ])("%s → %s", (latex, broken) => {
    expect(cellBreaker(latex)).toBe(broken);
  });
});

describe("answer key with table options", () => {
  it("prints them in model answers", () => {
    const f = tablesKey();
    const r = serializeKey(f.paper, f.keys);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    expect(r.tex).toContain("\\usepackage{multirow}");
    expect(r.tex).toContain("\\multirow{2}{=}{\\dxMerged{2}");
    expect(r.tex).toContain("\\multicolumn{2}");
  });

  it("refuses them in the objective answer table, keeps old tables there", () => {
    const f = tablesKey();
    const withTable = (tbl: unknown) =>
      serializeKey(f.paper, [
        {
          groupKey: "g1",
          position: 1,
          answerKey: { type: "doc", content: [tbl as never] },
          keyCriteria: [],
        },
      ]);
    const r = withTable(xtable([["a"]], { borders: "GRID" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.message).toMatch(/cannot go in the answer table/);
    expect(withTable(table([["a", "b"]])).ok).toBe(true);
  });
});

describe("packages and problems", () => {
  it("adds multirow for a row merge only", () => {
    expect(packagesUsed(tablesPaper())).toContain("multirow");
    expect(packagesUsed(paperWith(xtable([[{ text: "a", colspan: 2 }], ["b", "c"]])))).toEqual([]);
    expect(mergedCellsUsed({ a: [null, 1, { type: "table" }] })).toBe(false);
  });
  it("explains the merged-cell engine error in plain English", () => {
    expect(
      explain(
        "Package draftex Error: DXMERGEDCELL: a merged cell needs more lines than the rows it spans.",
      ),
    ).toMatch(/merged table cell whose text needs more lines/);
    expect(explain("Package draftex Error: DXNARROWTABLE: x.")).toMatch(/too narrow for this page/);
  });
});

describe("editor conversion", () => {
  const editorTable = (
    attrs: Record<string, unknown>,
    cellAttrs = { colspan: 1, rowspan: 1, colwidth: null },
  ) =>
    ({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { widthPercent: 80, ...attrs },
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: cellAttrs,
                  content: [{ type: "paragraph", content: [{ type: "text", text: "h" }] }],
                },
              ],
            },
          ],
        },
      ],
    }) as EditorNode;

  it("stores today's tables exactly as before", () => {
    const r = toStored(editorTable({ columns: [{ align: "LEFT" }], borders: "BOOKTABS" }));
    if (!r.ok) throw new Error(r.message);
    expect(r.doc.content[0]).toEqual({
      type: "table",
      attrs: { widthPercent: 80, headerRow: true },
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableCell", content: [{ type: "paragraph", content: [t("h")] }] }],
        },
      ],
    });
  });

  it("keeps alignment, widths, grid and merges, and brings them back", () => {
    const r = toStored(
      editorTable(
        { columns: [{ align: "CENTER", width: 100 }], borders: "GRID" },
        { colspan: 1, rowspan: 2, colwidth: null },
      ),
    );
    if (!r.ok) throw new Error(r.message);
    const stored = r.doc.content[0] as TableNode;
    expect(stored.attrs).toEqual({
      widthPercent: 80,
      headerRow: true,
      columns: [{ align: "CENTER", width: 100 }],
      borders: "GRID",
    });
    expect(stored.content[0]?.content[0]?.attrs).toEqual({ rowspan: 2 });
    const back = fromStored(r.doc).content?.[0];
    expect(back?.attrs?.borders).toBe("GRID");
    expect(back?.content?.[0]?.content?.[0]).toMatchObject({
      type: "tableHeader",
      attrs: { rowspan: 2 },
    });
  });

  it("drops a row that merged cells cover entirely and shortens those merges", () => {
    const cell = (text: string, attrs: Record<string, unknown> = {}) => ({
      type: "tableCell",
      attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs },
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    });
    const r = toStored({
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { widthPercent: 80, borders: "GRID" },
          content: [
            {
              type: "tableRow",
              content: [cell("a", { rowspan: 3 }), cell("b", { colspan: 2, rowspan: 2 })],
            },
            { type: "tableRow", content: [] },
            { type: "tableRow", content: [cell("c"), cell("d")] },
          ],
        },
      ],
    } as EditorNode);
    if (!r.ok) throw new Error(r.message);
    const stored = r.doc.content[0] as TableNode;
    expect(stored.content).toHaveLength(2);
    expect(stored.content[0]?.content.map((c) => c.attrs)).toEqual([
      { rowspan: 2 },
      { colspan: 2 },
    ]);
    expect(checkTable(stored)).toEqual([]);
  });
});
