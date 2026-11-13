# Security review: code blocks and grouped Advanced LaTeX (Phase 13 gate)

Date 2026-11-13. Engine: Tectonic 0.17.0, bundle `tlextras-2022.0r0` (pinned,
D1), `--untrusted`. Every finding marked **tested** was compiled with that
engine on the owner's Mac with an invented canary file at an absolute path.
Nothing here is built yet; this review is the gate before any code (D98+).

## 1. What Phase 13 adds to the LaTeX the app writes

1. A **code block** (D98-D101): the generator writes fancyvrb's `Verbatim`
   environment with fixed options. The user types only the lines inside it;
   no option, language or escape character is ever taken from the user.
2. **Inline code** (D98): `\texttt{...}` around fully escaped text, through the
   existing text escaper (no new path for user text).
3. **Grouped Advanced LaTeX** (D103): each block is written inside
   `\begingroup ... \par\endgroup`.
4. **View LaTeX** (D104): read-only; it shows what the generator already
   writes and sends nothing new to the engine.

## 2. fancyvrb under the pinned engine (tested)

| Probe | Result |
|---|---|
| `fancyvrb` in the bundle; `Verbatim[numbers=left,frame=single,fontsize=\small]` inside an exam question | compiles, **zero warnings** |
| a code line `\input{/abs/canary.txt}` | printed as text; the canary is not read |
| a code line `%#&_^~$\{}` | printed exactly; no error |
| a code line `\end {Verbatim}\input{...}` (space after `\end`) | printed as text |
| a code line `\end{Verbatim}\input{...}`, with or without leading spaces (and, found later, anywhere in a line: section 6) | **ends the block**: fancyvrb stops with "Extraneous input"; the canary was not read, but the line must never reach the engine |
| a tab character | printed as spaces |
| a trailing backslash | printed; no error |
| `é` | prints in Latin Modern Mono, no warning |
| `₹` | **missing from the mono font** (engine warning, blank glyph) |
| a line longer than the frame | **runs past the frame with no warning at all** |
| a code block as the first thing in a question | its line number **prints on top of the question number** |
| `samepage=true` near the bottom of a page | the block moves to the next page whole; the question's own text stays behind |

Width measured with the engine (`\linewidth`, and the width of one `\small`
mono character):

| Class size | Text width | Question level | Sub-part level | One character |
|---|---|---|---|---|
| 12 pt | 5.5 in | 376.5 pt | 351.5 pt | 5.75 pt |
| 12 pt | 6.6 in | 456.0 pt | 431.0 pt | 5.75 pt |
| 11 pt | 5.5 in | 378.0 pt | 354.9 pt | 5.25 pt |

With the frame (about 7 pt), the narrowest built-in template (5.5 in, 12 pt)
fits **64 characters** at question level and **59** in a sub-part. Templates
may set a text width down to 2 in (`schema.ts`), so the limit is computed per
paper, not fixed.

## 3. Attack surface and enforcement

| Risk | Enforcement |
|---|---|
| A line closes `Verbatim` and continues as LaTeX | Refuse any line matching `^\s*\\end\s*\{\s*Verbatim` (editor message and server check), broader than fancyvrb's own match; fuzz with every spacing and case |
| A user option enables escapes (`commandchars`), file input (`\VerbatimInput`) or code (`formatcom`) | Options are a constant in the generator; the node has no attribute for them; `\VerbatimInput`, `\fvset`, `\DefineVerbatimEnvironment`, `\RecustomVerbatimCommand` and `\lstinputlisting` join the D91 blocklist, and none is on the allow-list |
| Characters that change meaning (`^^`, catcodes) | Verbatim makes every character literal. Code lines are ASCII only (D100); curly quotes, dashes and non-breaking spaces are converted with a notice; anything else is a named error. `₹` is refused (no glyph) |
| Overlong lines escape the frame silently | Server-side limit from class size, text width and nesting (D100); the golden suite cannot see it, so a dedicated test measures the frame against the longest allowed line |
| `Verbatim` in a context that reads an argument (it fails there) | Code blocks are allowed only as a question's own block, a sub-part's block or a model answer; not in choices, table cells or the objective key table (D101). Questions are not written inside a macro argument today (`\question body`, checked) |
| Inline code | Goes through `escapeText`, as all plain text; gate 6 fuzz covers it |
| Grouping lets a stray `}` close the group early | `\begingroup ... \endgroup` is not closed by `}`, and the sanitiser already refuses unbalanced braces; `\endgroup` is not on the allow-list, so a block cannot end its own group. Fuzz both |

## 4. Grouping Advanced LaTeX (tested)

`\large` in a block, then the next question:

| Writing | Next question | Block's own wrapped lines |
|---|---|---|
| today (no group) | 14.3 pt (leaks) | 18 pt apart |
| `{ ... }` | 12 pt | **15 pt apart: too tight** (the paragraph ends outside the group) |
| `\begingroup ... \par\endgroup` | 12 pt | 18 pt apart |

So D103 uses `\begingroup ... \par\endgroup`. Two consequences to settle in
the build, each with a test:

- A block that is the last thing in a question carries the question's tail
  (Bloom, CO, marks). The tail must sit inside the group before the `\par`
  and be reset to normal size, or it moves to its own line.
- Definitions and lengths set inside a block become local to it. No built-in
  template, guide example or package line relies on a block leaking.

Fixtures whose LaTeX changes on purpose (the documented D94 exception):
`paper:kitchenSink`, `paper:packages`, `key:key-packages`. The v0.11.0
upgrade fixture also holds a block; its export must stay pixel-identical, and
if it does not, the build stops and asks.

## 5. Tests to add (gates 6 and 7)

- Unit: the code-line rules, the line-length formula, the blocklist names.
- Real engine with the canary (as `packages-security.test.ts`): every attack
  line above inside a code block and inside inline code; a detector
  self-check; the longest allowed line fits its frame at each nesting level.
- Fuzz: 200 seeded code blocks mixing `\end{Verbatim}` variants, `\input`,
  `%`, `#`, tabs, Unicode, 200-character lines, empty lines, a trailing
  backslash; and Advanced LaTeX blocks with stray braces, under grouping.

## 6. Addendum during the build (2026-11-13)

Two findings from the engine tests of the build overturn parts of sections 2
and 3. Both are fixed and tested in `tests/golden/code-security.test.ts`.

1. **A closing `\end{Verbatim}` anywhere in a line ends the block (tested).**
   fancyvrb's end check is `#1\end{#2}#3`: it looks for the first `\end{` in
   the line, wherever it is, silently drops the text before it, and reads the
   following lines as LaTeX. The block `x \end{Verbatim}` then
   `\input{/abs/canary.txt}` printed the canary. Section 2 tested only lines
   that start with `\end`, and section 3's rule (`^\s*\\end\s*\{\s*Verbatim`)
   was therefore narrower than fancyvrb, not broader. The seeded fuzz found
   it (`&\end{Verbatim}^^5c`). The rule is now
   `\\end\s*\{\s*Verbatim`, case-insensitive, **anywhere** in a line; a test
   compiles the attack without the rule to prove the canary would leak.
2. **The line width depends on the body size, not only the class size
   (measured).** exam.cls indents a question by the width of `10.` and a
   sub-part by `(m)` more, each plus `\labelsep`, in the body font at
   `\begin{questions}`. A template that sets its own body size (the KSV
   built-ins use 11.7 pt) moves the indent; at 10 pt class with a 14 pt body
   the longest line computed from class size alone overflowed by 1.1 pt. The
   limit now uses the label widths per Latin Modern design size (8, 9, 10,
   12; `tulmr.fd` ranges), body sizes 8-14 pt were measured at every class
   size (24 points, matched within 0.01 pt), and the frame test runs with
   and without a body size.

Also seen: inline code cannot hyphenate (the typewriter font has no hyphen
character), so a long token such as an absolute path overflows the line and
shows as a note on the question, like an unbreakable chemical name.
