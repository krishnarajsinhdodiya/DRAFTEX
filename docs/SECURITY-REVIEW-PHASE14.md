# Security review: table builder (Phase 14 gate)

Date 2026-11-15. Engine: Tectonic 0.17.0, bundle `tlextras-2022.0r0` (pinned,
D1), `--untrusted`. Every finding marked **tested** was compiled with that
engine on the owner's Mac, inside an `exam` 12 pt question at 5.5 in text
width, with an invented canary file at an absolute path. This review is the
gate before the build (D105-D107).

## 1. What Phase 14 adds to the LaTeX the app writes

1. A table with any new option (column alignment, column widths, grid
   borders, merged cells) is written as `tabular` with `p{}` columns
   (D106). Tables with none of them keep today's `tabularx` writing.
2. Column widths are written by the generator as
   `<fraction>\dimexpr <W>\linewidth-<n>\tabcolsep-<r>\arrayrulewidth\relax`,
   from numbers the server has checked. No length is ever taken as text.
3. Merged cells become `\multicolumn{c}{spec}{...}` and `\multirow{r}{=}{...}`.
   The spec is written by the generator; only cell text goes inside.
4. Cell text is the existing inline path (escaped text, inline maths through
   the maths sanitiser, units, blanks, line breaks). No new path for user text.

## 2. Probes (tested)

| Probe | Result |
|---|---|
| booktabs, three `p{}` columns 30/30/40 % at 100 % width, `@{}` edges | box width 376.46097 pt, `\linewidth` 376.46098 pt; **zero warnings** |
| full grid with `\multicolumn{2}` header (its width = two columns + 2 `\tabcolsep` + one rule) | box width equals `\linewidth` (0.00003 pt under); zero warnings |
| `\multirow{2}{=}` with short text, grid with `\cline` | zero warnings |
| `\multirow{2}{=}` with 103 characters in a 30 % column | **overflows onto the rows below with no error**: only "Overfull \vbox (58pt too high)" |
| the same text measured in a `\parbox` of the column width | 83.5 pt high = 5.76 lines of 14.5 pt |
| `\multirow` inside `\multicolumn` with `=` | `=` takes the merged width; zero warnings |
| every escaped special (`& \\ # % ~ ^ $ { } _`, `^^5c`, `\input{<canary>}`, `\end{tabular}`, `\multicolumn{9}{c}{x}`) in a `p{}` cell, a `\multicolumn` argument and a `\multirow` argument, plus `\newline{}` | **printed as text**; canary not read; no file written; only box notes (the long path cannot break) |
| 10 columns × 30 rows, full grid, 100 % width | compiles; box notes only because 5-character words do not fit a 25 pt column (expected, shown as notes) |
| an unbreakable word in a 10 % column | overfull box note, as for an unbreakable chemical name |
| inline maths `a & b`, `a \\ b`, `\hline` in a cell (today's `tabularx` and a `\multirow`) | **compile errors** ("Missing $", "There's no line here to end", "Misplaced \noalign"); no file access, but the sanitiser lets them through today |
| `\begin{pmatrix}a&b\\c&d\end{pmatrix}` in a cell | compiles |

## 3. Findings and enforcement

| Risk | Enforcement |
|---|---|
| A merged-row cell longer than its rows overlaps the rows below, silently (the roadmap's riskiest item) | The generator wraps the text: `\multirow{r}{=}{\dxMerged{r}{...}}`. `\dxMerged` (defined only when a table uses it) sets the text in a `\parbox` of the column width and raises `Package draftex Error` when it is taller than `r` strut heights; the question shows "This merged cell needs more lines than the rows it spans". Tested: the check refuses exactly where multirow overflows (5 rows refused, 6 pass, for 5.76 lines). So merged rows **may wrap** (up to one line per spanned row); the one-line fallback is not needed |
| Width arithmetic lets a table run past the margin | Widths are whole-number percentages that must add up to 100 (server check, editor shows the sum live); fractions are written with four decimals rounded down, so the sum never exceeds the width; measured equal to `\linewidth` |
| Cell text changes the table structure (`&`, `\\`, `\cr`, `\hline`, `\multicolumn`, `\noalign`, `\omit`, `\span`) | Plain text is escaped (tested in every argument position). In cell maths, `&`, `\\` and `\hline` outside an environment are now refused with a message (today they are engine errors); `\cr`, `\noalign`, `\omit`, `\span`, `\multicolumn` are already not on the allow-list |
| A spec or count is taken from user input | Alignment is one of three words, borders one of two, colspan/rowspan small integers checked against the grid; the server rebuilds the grid and refuses overlapping or ragged merges and merges that cross the header line |
| Code blocks in cells | Cells hold paragraphs only (schema), so a code block cannot be stored there (D101) |
| A table inside the objective key table (a `tabularx` cell) | A table with new options is refused there with a message; today's tables keep today's behaviour |
| A table breaking across pages | `tabular` is one box; 30 rows fit a page at 12 pt (tested) |

## 4. Tests to add (gates 3, 6, 7)

- Unit: options schema, width sums, grid map and merge checks, limits, LaTeX
  per option, byte identity of every existing hash with no new exception.
- Real engine with the canary: every attack string in a plain cell, a header
  cell, a column-merged cell, a row-merged cell and a cell merged both ways,
  in the paper and in a model answer; detector self-check; merged-row check
  refuses where multirow overflows and passes where it fits.
- Fuzz: seeded tables mixing every special character, maths, line breaks,
  random merges, widths and borders; each is refused by the rules or
  compiles with zero errors and no warnings other than box notes.
