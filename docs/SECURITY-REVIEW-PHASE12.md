# Security review: Advanced LaTeX packages (Phase 12, WP-F gate)

Date 2026-11-07. Engine: Tectonic 0.17.0, bundle `tlextras-2022.0r0` (pinned,
D1), flags as in `src/lib/latex/engine.ts` (`--untrusted --keep-logs`).
Every finding below marked **tested** was compiled with that engine and bundle
on the owner's Mac; the probes used an invented canary file
(`SECRET-LINE-42 alpha beta`) at an absolute path in the temp folder.

## 1. What the engine allows (tested)

| Probe (raw, no sanitiser) | Result |
|---|---|
| `\input{/abs/canary.txt}` | canary text printed in the PDF |
| `\input{../canary.txt}` (relative, outside the job folder) | canary text printed |
| `\newwrite\w\immediate\openout\w=/abs/x.txt ...` | **file written at the absolute path** |
| `\lstinputlisting{/abs/canary.txt}` (listings) | canary printed |
| `\includegraphics{/abs/any.png}` (graphicx) | image embedded |
| `\addplot table {/abs/data}` (pgfplots) | file read; non-numeric lines echoed **into the log** ("Could not parse input 'SECRETNUM'") |
| `\addplot graphics {...}{/abs/any.png}` (pgfplots) | image embedded |
| `\draw plot file {/abs/data};` (tikz core) | file read and plotted; a missing file gives a warning naming it (existence oracle) |
| `\chemfig{A-[,,,,insert path={plot file {/abs/data}}]B}` (chemfig → tikz) | file opened, **no forbidden command name used** |
| `\usetikzlibrary{external}\tikzexternalize`, `\addplot gnuplot` | refused by `--untrusted` (shell escape off) |
| `\usetikzlibrary{../../x}` | looks up `tikzlibrary../../x.code.tex` (path not cleaned) |

So `--untrusted` stops shell commands only. Reads **and writes** anywhere the
OS account can reach are open. The data folder (`data.db` holds every user's
papers; `assets/` holds everyone's pictures) is readable by the engine. The
compile log is shown to the user, so even a read that does not print can leak
through error messages.

## 2. How the current sanitiser stops it (`src/lib/latex/sanitize.ts`)

It is an allow-list over the snippet's characters and control-sequence names:

- Every `\name` must be in a fixed set (math set, plus a text set in Advanced
  mode). Anything else fails. A named blocklist of 20 primitives gives a
  clearer message ("not allowed for safety") but is not what makes it safe.
- `\begin{X}` / `\end{X}` need X from an environment list. This matters
  because LaTeX turns `\begin{input}` into `\input` and `\end{input}` into
  `\endinput` through `\csname`.
- Obfuscated forms (gate 7, `tests/unit/latex/sanitize.test.ts`):
  - `\csname input\endcsname`: `\csname` is refused.
  - `^^5cinput`, `^^5c^^69nput`, `^^^^005c`, `x^^M`: any `^^` pair is
    refused before names are read. TeX needs two identical catcode-7 characters
    for `^^`; only `^` has that catcode, and `\catcode` is refused, so no other
    character can take its place.
  - `\in{}put`: TeX reads `\in` (∈, allowed) and then text, so the name does
    not reassemble (tested).
  - Any character above U+007E is refused. This matters under XeTeX, where
    Unicode letters are catcode 11: `\inputé` would be one control sequence.
  - `@` is never a letter (`\makeatletter` refused), `\@` is refused, bare `%`
    and `#` are refused, braces and environments must balance, 4 KB cap.
- No allowed command takes a file name, a code hook that runs later, or a key
  list that reaches tikz/pgfkeys. That last property is what Phase 12 can lose.

The editor runs the same function as the user types (Advanced LaTeX popover,
`src/components/editor/views.tsx`) and will not accept the block until it
passes. The serializer runs it again on the server (`snippet()` in
`serialize.ts`), so a crafted request cannot skip it. A refused snippet never
reaches Tectonic: its message shows on the question, the preview prints the
rest of the paper with a note in its place, and export is blocked.

## 3. What each candidate package adds

"Command names" = new names the allow-list would need. "String surface" =
arguments that are not command names, so the name allow-list cannot see what
is in them.

| Package | Attack surface found | Verdict |
|---|---|---|
| mhchem | `\ce{}`; argument is chemistry text; no file or code hooks known. `\pu` is not offered: the bundled v4.09 does not define it (found by the engine test) | allow (likely safe; real-engine canary test required) |
| mathtools | extra maths commands; `\DeclarePairedDelimiter`, `\newtagform`, `\mathtoolsset` define or set globally | allow a named subset, no definers |
| multirow | `\multirow{n}{w}{text}` | allow |
| framed | `framed` environment; `shaded` needs a colour definition | allow `framed` only |
| xcolor | `\color` leaks into later questions (no group); `\pagecolor` colours the whole paper; `\definecolor` | allow `\textcolor{name}{..}` with a fixed colour list only |
| enumitem | optional `[keys]`; hooks `before=`, `after=`, `first=` run code later; `\setlist`, `\newlist` change every list on the paper | allow a key allow-list, no hooks, no setters |
| tfrupee | `\rupee` | allow (tested: renders under XeTeX, zero warnings) |
| chemfig | loads tikz; bond option field 5, `\chemfig[...]`, `\arrow` options and `\chemmove` are tikz keys/paths → `insert path={plot file{..}}` **tested: opens a file** | allow only with a strict option grammar (numbers and angles only) |
| tikz | path operations `plot file {..}`, keys like `insert path`; libraries load by name | **exclude**: needs a parser for tikz paths and pgfkeys to be safe |
| pgfplots | `\addplot table/file/graphics {path}` **tested: reads files and leaks into the log**; `\pgfplotstableread` | **exclude** |
| tcolorbox | pgfkeys options (`savelowerto`, `watermark graphics`, libraries such as `listings`, `minted`) | **exclude** |
| listings | `\lstinputlisting` **tested: prints any file**; catcode changes inside listings | **exclude** (no use on exam papers) |
| graphicx | `\includegraphics{path}` **tested** | already loaded; stays out of user text. Pictures come only from the Image block, which prints `assets/<sha256>.<ext>` chosen by the app |
| longtable | not usable inside `multicols` (choices) and in the exam question list | exclude (low value) |
| caption, float | floats move away from their question; nothing on a paper needs a caption | exclude |
| multicol, booktabs, tabularx, array | already loaded on every paper; their commands are already allowed | no change |
| minted, matplotlib | shell escape / not LaTeX | excluded by the brief |

## 4. Proposed enforcement

1. Allow-list stays the barrier. New names are added per package and accepted
   **only in Advanced LaTeX blocks** (never in the Equation field), only for
   users with `allowAdvancedLatex` (existing rule, server-checked on save).
2. Argument grammar for the few commands whose arguments carry keys:
   chemfig bond options, enumitem options, `\textcolor` names, `\multirow`
   rows. Anything outside the grammar is refused with a named message.
3. Packages load only when a block uses one of their commands (no user
   `\usepackage`), so papers without them produce byte-identical LaTeX.
4. Second layer: the named blocklist grows to the brief's list plus the names
   found here (`\RequirePackage`, `\ShellEscape`, `\lstinputlisting`,
   `\includegraphics`, `\addplot`, `\pgfplotstableread`, `\usetikzlibrary`,
   `\tcbuselibrary`, `\scantokens`, `\expandafter`, `\string`, `\uppercase`,
   `\lowercase`, `\newwrite`, `\newread`, `\XeTeXpicfile`, `\XeTeXpdffile`,
   `\IfFileExists`, `\InputIfFileExists`, `\definesubmol`, `\setchemfig`,
   `\setlist`, `\pagecolor`, ...). These are already refused by the
   allow-list; the list exists for the message and as a tripwire test.
5. Gate 7 with the real engine: every hostile form in §1 and §3, plus
   `\csname`/`^^` variants inside each new command's argument, is compiled
   through the serializer with a canary file at an absolute path. The test
   fails if the canary text appears in the PDF text or the log, or if any file
   appears outside the job folder.
6. Gate 6: the fuzz draws from the new commands and their arguments.

## 5. Not fixed here (existing behaviour, found during the review)

- Advanced LaTeX blocks are not wrapped in a group, so a size command carries
  into later questions. **Tested** in the exam class: `\large` in question 1
  printed question 2, its number included, at 14.3 pt instead of 12 pt.
  Wrapping blocks would change the output of existing papers that use this.
