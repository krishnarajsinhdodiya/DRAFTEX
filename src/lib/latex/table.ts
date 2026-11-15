// Tables with column settings, borders and merged cells (D105-D107,
// docs/SECURITY-REVIEW-PHASE14.md). Pure and client-safe: the editor shows the
// same problems the server refuses. A table with none of the new options is
// written by the serializer exactly as before (D106) and is not checked here.
import type { TableColumn, TableNode } from "../paper/schema.ts";

/**
 * D107. `minWidth`: percent of the table per column; `minLineShare`: percent
 * of the line per column (the table's width times the column's), below which
 * the cell padding alone is wider than the column.
 */
export const TABLE_LIMITS = { columns: 10, rows: 30, minWidth: 5, minLineShare: 4 } as const;

export type Align = NonNullable<TableColumn["align"]>;
type Cell = TableNode["content"][number]["content"][number];

export const spanOf = (c: Cell) => ({
  colspan: c.attrs?.colspan ?? 1,
  rowspan: c.attrs?.rowspan ?? 1,
});

/** A cell where it starts on the grid. */
export interface Anchor {
  row: number;
  col: number;
  colspan: number;
  rowspan: number;
  cell: Cell | null;
}

export interface TableGrid {
  rows: number;
  cols: number;
  /** For every position, the cell covering it (padding cells for short rows have `cell: null`). */
  at: Anchor[][];
}

/** True when the table uses anything from D105 beyond today's header row and width. */
export function hasTableOptions(t: TableNode): boolean {
  if (t.attrs?.borders === "GRID") return true;
  if (t.attrs?.columns?.some((c) => (c.align && c.align !== "LEFT") || c.width !== undefined)) {
    return true;
  }
  return t.content.some((r) =>
    r.content.some((c) => spanOf(c).colspan > 1 || spanOf(c).rowspan > 1),
  );
}

/** True when a cell spans rows (multirow and the \dxMerged check are needed). */
export function hasRowMerge(t: TableNode): boolean {
  return t.content.some((r) => r.content.some((c) => spanOf(c).rowspan > 1));
}

/** Lays the cells on a grid as HTML (and TipTap) do; overlapping or overhanging merges are problems. */
export function tableGrid(t: TableNode): { grid: TableGrid } | { problem: string } {
  const rows = t.content.length;
  const at: (Anchor | undefined)[][] = Array.from({ length: rows }, () => []);
  let cols = 0;
  for (let r = 0; r < rows; r++) {
    let c = 0;
    for (const cell of t.content[r]?.content ?? []) {
      while (at[r]?.[c]) c++;
      const { colspan, rowspan } = spanOf(cell);
      if (r + rowspan > rows) {
        return { problem: "A merged cell reaches below the last row of the table." };
      }
      const anchor: Anchor = { row: r, col: c, colspan, rowspan, cell };
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) {
          const line = at[r + dr] as (Anchor | undefined)[];
          if (line[c + dc]) return { problem: "Two merged cells of the table overlap." };
          line[c + dc] = anchor;
        }
      }
      c += colspan;
      cols = Math.max(cols, c);
    }
    cols = Math.max(cols, at[r]?.length ?? 0);
  }
  // Short rows are padded with empty cells, as the existing writer does.
  const full = at.map((line, r) =>
    Array.from(
      { length: cols },
      (_, c) => line[c] ?? { row: r, col: c, colspan: 1, rowspan: 1, cell: null },
    ),
  );
  return { grid: { rows, cols, at: full } };
}

/** Each column's alignment and width in percent of the table (equal when none is set). */
export function columnSettings(t: TableNode, cols: number): { align: Align; width: number }[] {
  const given = t.attrs?.columns ?? [];
  const widths = given.length === cols && given.every((c) => c.width !== undefined);
  return Array.from({ length: cols }, (_, i) => ({
    align: given[i]?.align ?? "LEFT",
    width: widths ? (given[i]?.width as number) : 100 / cols,
  }));
}

/**
 * Problems that stop a table with new options from printing, in plain
 * English. Empty for a table without them (it prints as before).
 */
export function checkTable(t: TableNode): string[] {
  if (!hasTableOptions(t)) return [];
  const out: string[] = [];
  const g = tableGrid(t);
  if ("problem" in g) return [g.problem];
  const { rows, cols } = g.grid;
  if (cols > TABLE_LIMITS.columns) {
    out.push(
      `A table with column settings, borders or merged cells can have at most ${TABLE_LIMITS.columns} columns; this one has ${cols}.`,
    );
  }
  if (rows > TABLE_LIMITS.rows) {
    out.push(
      `A table with column settings, borders or merged cells can have at most ${TABLE_LIMITS.rows} rows; this one has ${rows}.`,
    );
  }
  const given = t.attrs?.columns ?? [];
  if (given.some((c) => c.width !== undefined)) {
    if (given.length !== cols || given.some((c) => c.width === undefined)) {
      out.push("Give every column a width, or none (equal widths).");
    } else {
      const sum = given.reduce((a, c) => a + (c.width as number), 0);
      if (sum !== 100) out.push(`The column widths add up to ${sum}%; they must add up to 100%.`);
      if (given.some((c) => (c.width as number) < TABLE_LIMITS.minWidth)) {
        out.push(`Each column needs at least ${TABLE_LIMITS.minWidth}% of the table's width.`);
      }
    }
  } else if (given.length > cols) {
    out.push("The table has settings for more columns than it has.");
  }
  if (!out.length) {
    const table = t.attrs?.widthPercent ?? 80;
    const narrow = columnSettings(t, cols).findIndex(
      (c) => (table * c.width) / 100 < TABLE_LIMITS.minLineShare,
    );
    if (narrow >= 0) {
      out.push(
        `Column ${narrow + 1} is too narrow to print: each column needs at least ${TABLE_LIMITS.minLineShare}% of the line. Widen the table or the column, or use fewer columns.`,
      );
    }
  }
  const headerRow = t.attrs?.headerRow ?? true;
  if (headerRow && rows > 1 && t.attrs?.borders !== "GRID") {
    if (g.grid.at[0]?.some((a) => a.row === 0 && a.rowspan > 1)) {
      out.push(
        "A merged cell cannot cross the line under the header row; merge it within the header row, turn the header row off, or use full grid borders.",
      );
    }
  }
  return out;
}

// ---------- LaTeX ----------

/** Rounded down to five decimals, so the columns never add up to more than the table. */
const frac = (n: number) => String(Math.floor(n * 100000 + 1e-6) / 100000);

const RAGGED: Record<Align, string> = {
  LEFT: "\\raggedright",
  CENTER: "\\centering",
  RIGHT: "\\raggedleft",
};

/**
 * Preamble lines for row-merged cells: the text is set in a box of the
 * column's width and refused when it needs more lines than the rows it spans,
 * because \multirow lets it run over the rows below with no error (tested).
 */
export const MERGED_CELL_LINES = [
  "%% A merged cell may wrap over as many lines as the rows it spans, no more.",
  "\\newsavebox\\dxCellBox",
  "\\newcommand{\\dxMerged}[2]{\\sbox\\dxCellBox{\\parbox{\\linewidth}{#2}}\\ifdim\\dimexpr\\ht\\dxCellBox+\\dp\\dxCellBox\\relax>#1\\dimexpr\\ht\\strutbox+\\dp\\strutbox\\relax\\PackageError{draftex}{DXMERGEDCELL: a merged cell needs more lines than the rows it spans}{}\\fi\\usebox\\dxCellBox}",
];

/**
 * The tabular for a table with new options; `cellText` gives a cell's
 * escaped LaTeX. Call only after checkTable found no problem.
 */
export function tableLatex(t: TableNode, cellText: (cell: Cell) => string): string {
  const g = tableGrid(t);
  if ("problem" in g) throw new Error(g.problem);
  const { rows, cols, at } = g.grid;
  const grid = t.attrs?.borders === "GRID";
  const headerRow = t.attrs?.headerRow ?? true;
  const settings = columnSettings(t, cols);
  const table = frac((t.attrs?.widthPercent ?? 80) / 100);
  const seps = grid ? 2 * cols : 2 * (cols - 1);
  const rules = grid ? cols + 1 : 0;
  const room = `\\dimexpr ${table}\\linewidth${seps ? `-${seps}\\tabcolsep` : ""}${rules ? `-${rules}\\arrayrulewidth` : ""}\\relax`;
  const fracs = settings.map((s) => Number(frac(s.width / 100)));
  const colType = (align: Align, width: string) => `>{${RAGGED[align]}\\arraybackslash}p{${width}}`;
  const edges = (spec: string, first: boolean, last: boolean) =>
    grid ? `${first ? "|" : ""}${spec}|` : `${first ? "@{}" : ""}${spec}${last ? "@{}" : ""}`;

  const spec = settings
    .map((s, i) => edges(colType(s.align, `${fracs[i]}${room}`), i === 0, i === cols - 1))
    .join("");

  /** A cell over `span` columns from `col`, with the first column's alignment. */
  const multi = (col: number, span: number, body: string) => {
    const sum = frac(fracs.slice(col, col + span).reduce((a, b) => a + b, 0) + 1e-9);
    const extra = `+${2 * (span - 1)}\\tabcolsep${grid ? `+${span - 1}\\arrayrulewidth` : ""}`;
    const width = `\\dimexpr ${sum}${room}${extra}\\relax`;
    const s = edges(
      colType((settings[col] as { align: Align }).align, width),
      col === 0,
      col + span === cols,
    );
    return `\\multicolumn{${span}}{${s}}{${body}}`;
  };

  const lines: string[] = [grid ? "\\hline" : "\\toprule"];
  for (let r = 0; r < rows; r++) {
    const cells: string[] = [];
    for (let c = 0; c < cols;) {
      const a = at[r]?.[c] as Anchor;
      const start = a.row === r && a.col === c;
      let body = "";
      if (start && a.cell) {
        body = cellText(a.cell);
        if (grid && headerRow && r === 0 && rows > 1 && body !== "") body = `\\textbf{${body}}`;
        if (a.rowspan > 1) {
          const align = RAGGED[(settings[c] as { align: Align }).align];
          body = `\\multirow{${a.rowspan}}{=}{\\dxMerged{${a.rowspan}}{${align} ${body}}}`;
        }
      }
      cells.push(a.colspan > 1 ? multi(c, a.colspan, body) : body);
      c += a.colspan;
    }
    lines.push(`${cells.join(" & ")}\\\\`);
    if (r < rows - 1) {
      if (grid) lines.push(gridRule(at, r, cols));
      else if (r === 0 && headerRow) lines.push("\\midrule");
    }
  }
  lines.push(grid ? "\\hline" : "\\bottomrule");
  // On a very narrow page the padding can outgrow a column: stop rather than overflow.
  const guard = `\\ifdim${Math.min(...fracs)}${room}<1em\\PackageError{draftex}{DXNARROWTABLE: a table column is too narrow for this page}{}\\fi`;
  return [
    "\\par\\smallskip",
    guard,
    `\\begin{tabular}{${spec}}`,
    ...lines.map((l) => `  ${l}`),
    "\\end{tabular}",
  ].join("\n");
}

/** The line under row `r`: left out where a merged cell carries on into the next row. */
function gridRule(at: Anchor[][], r: number, cols: number): string {
  const open: [number, number][] = [];
  for (let c = 0; c < cols; c++) {
    const a = at[r]?.[c] as Anchor;
    if (a.row + a.rowspan - 1 > r) continue;
    const last = open.at(-1);
    if (last && last[1] === c) last[1] = c + 1;
    else open.push([c, c + 1]);
  }
  if (open.length === 1 && open[0]?.[0] === 0 && open[0][1] === cols) return "\\hline";
  return open.map(([a, b]) => `\\cline{${a + 1}-${b}}`).join("");
}

/** True when anything in `value` (a paper or a key) is a table with a row-merged cell. */
export function mergedCellsUsed(value: unknown): boolean {
  let found = false;
  const walk = (v: unknown): void => {
    if (found || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    const o = v as { type?: unknown; content?: unknown };
    if (o.type === "table" && Array.isArray(o.content) && hasRowMerge(o as TableNode)) {
      found = true;
      return;
    }
    for (const x of Object.values(v)) walk(x);
  };
  walk(value);
  return found;
}
