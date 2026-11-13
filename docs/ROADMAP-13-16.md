# ROADMAP-13-16: Phases 13 to 16 (plan, not approved)

The owner's brief of 2026-11-13 (a prompt from the end user's own notes) with
the advisor's changes the owner accepted in chat: no editing of generated
LaTeX (a read-only View LaTeX instead), the existing Table block extended
rather than replaced, the blueprint keyed by course code, no admin-wide
duplicate view, the existing icon reused. Nothing here is built until the
owner replies "Go". Decisions are numbered from D98. Rules for Phases 9-12
(docs/ROADMAP-9-12.md) still apply: plan first, measure performance before and
after, existing papers print the same unless a decision says otherwise,
Windows and macOS both, guide and screenshots updated, break-ui on new screens.

| # | Phase | Branch | Done when | Tag |
|---|---|---|---|---|
| 13 | Code blocks, grouped Advanced LaTeX, View LaTeX | `phase/13-code-blocks` | A + B + D104 | v0.13.0 |
| 14 | Table builder | `phase/14-table-builder` | C | v0.14.0 |
| 15 | CO blueprint check | `phase/15-co-blueprint` | D | v0.15.0 |
| 16 | Bank search, pages, near-duplicates | `phase/16-bank-search` | E | v0.16.0 |
| - | App icon in the app | `chore/app-icon` | F | none |

Order kept from the brief: 13 and 14 change LaTeX output and go first, one
security review each; 15 and 16 change no LaTeX.

## Before Phase 13 (in progress, waiting for CI)

- `fix/setup-honest-errors`: setup names a copied `draftex.local.json` and
  retries `npm ci` only for network errors (found on the end user's laptop).
- `fix/network-restart-windows`: the e2e log now keeps the server's output and
  restart timings, so the Windows LAN-mode timeout (run 42355929142) can be
  diagnosed. Likely cause: on windows-latest the restarted server sometimes
  takes more than the test's 90 s to answer; not proven.
- Both are pushed and blocked: GitHub Actions refuses to start jobs until the
  account's billing is fixed (every job of runs 43379586908 and 43379840241).

## Phase 13: code blocks (A), grouped Advanced LaTeX (B), View LaTeX

Security review first: `docs/SECURITY-REVIEW-PHASE13.md` (written, tested).

| D | Decision | Reason / cost / risk |
|---|---|---|
| D98 | A `codeBlock` node in the existing content JSON (lines of text, Zod-checked) and an inline `code` mark; no migration | Same storage as every block; bank, versions, backups carry it unchanged |
| D99 | The generator writes `\begin{Verbatim}[numbers=left, numbersep=4pt, frame=single, fontsize=\small, samepage=true]`; numbering restarts at 1 in each block; fancyvrb is loaded only when a paper or key has a code block (D87 pattern) | Fixed options leave nothing for the user to set; tested zero warnings |
| D100 | Code lines are ASCII; curly quotes, en/em dashes and non-breaking spaces become ASCII with a notice; tabs become 4 spaces; other characters are a named error; at most 40 lines a block; the longest line is computed per paper from class size, text width and nesting (64 characters at question level and 59 in a sub-part on the narrowest built-in template) and enforced by the server | fancyvrb overflows silently, so no warning would catch it; `₹` has no glyph in the mono font |
| D101 | Code blocks only as a question's block, a sub-part's block or a model answer; not in choices, table cells or the objective key table; a question that starts with code gets its number on its own line | Verbatim fails inside arguments and cells; a leading block's line number printed over the question number (tested) |
| D102 | The answer key holds code blocks like any other block (the key is already a content document); bank questions keep them and the duplicate key (D76) includes code text; CSV import does not take code | Indentation does not survive Excel; a CSV code cell would print wrong |
| D103 | Each Advanced LaTeX block is written as `\begingroup ... \par\endgroup`, with the question's tail inside the group at normal size | Fixes D97. Changes on purpose the LaTeX of `kitchenSink`, `packages`, `key-packages`; the v0.11.0 upgrade export must stay pixel-identical or the build stops and asks |
| D104 | Read-only "View LaTeX" for one question and for the whole paper (the owner of the paper only, through the data layer); a copy button; no editing | The owner's request without the risk: editing generated LaTeX would either bypass the sanitiser (unchecked LaTeX can read data.db, Phase 12) or freeze a question so later edits to marks, CO, Bloom, numbering or template no longer reach it |

Files: `src/lib/paper/schema.ts`, `src/lib/latex/{serialize,key,escape,sanitize,packages,warmup}.ts`,
new `src/lib/latex/code.ts`, `src/components/editor/*` (code block view,
inline code mark, View LaTeX dialog), `src/app/api/papers/[id]/latex/route.ts`
(GET, reviewed CSRF list), fixtures, guide.

Tests: unit (code rules, width formula, grouping output); byte identity with
the three listed exceptions; engine canary for code lines and inline code;
a frame-width test at every nesting level; fuzz (code and stray braces);
new fixtures `code`, `key-code` with new ubuntu baselines (no existing
baseline changes); e2e (write a code block, see the refusal of a closing line,
View LaTeX); upgrade v0.11.0 pixel check; guide section and screenshot.

Riskiest item: D103's tail handling, because it touches every paper with an
Advanced LaTeX block. Size: large (about Phase 12).

## Phase 14: table builder (C)

| D | Decision | Reason / cost / risk |
|---|---|---|
| D105 | Extend the existing Table block, not a second tool: per-column alignment (left, centre, right), per-column width (percent of the table), header row, borders (booktabs rules as today, or a full grid), merged cells (TipTap's own colspan/rowspan) | One table model; existing tables keep their LaTeX |
| D106 | Existing tables (no new option set) are written exactly as today with `tabularx`; a table with new options gets `p{}` columns whose widths add up to the table width; merged cells use `\multicolumn` and `\multirow` (already allowed, loaded when used) | The brief's "no tabularx" would change every existing table; kept for old tables only |
| D107 | Up to 10 columns and 30 rows; cells hold text and inline maths only, escaped by the generator; a table never breaks across pages (a tabular is one box) | Fixed widths cannot overflow, so no box warning |

Tests: as Phase 13 (byte identity, canary in cells, fuzz of every special
character in cells and in merged cells, fixtures with new baselines, e2e,
guide). Riskiest item: rowspan cells with long text, which `\multirow`
does not wrap well; the build measures it and may limit merged rows to one
line. Size: medium.

## Phase 15: CO blueprint check (D)

| D | Decision | Reason / cost / risk |
|---|---|---|
| D108 | A blueprint = target marks (or percent) per CO with a tolerance, keyed by course code and exam group (D59 groups), owned by the teacher who makes it (private, like templates) and shareable with colleagues; new table `Blueprint` (additive migration) | D85: the syllabus gives defaults, course codes are typed freely; admins see no one's private data |
| D109 | `coverage(paper, blueprint)` is a pure function: a question counts its marks to its one CO; sub-parts with their own COs split the question only when their marks add up (D69 rule); untagged marks go to "No CO"; optional groups per the owner's answer (question 2) | One CO per question is the current model; more than one is a schema change (question 3) |
| D110 | The result shows in the editor's summary panel and in the export dialog as over/under per CO; it never blocks export; nothing is printed | No LaTeX change; the byte-identity check proves it |
| D111 | The function takes a dimension (CO now, Bloom later) | A Bloom blueprint later needs no rewrite |

Tests: unit for every rule and edge case; data layer gate 8 for blueprints;
upgrade fixture made at v0.14.0 (first migration since Phase 11); e2e.
Riskiest item: the optional-group rule, because a wrong rule gives wrong
warnings on every paper. Size: medium.

## Phase 16: bank search, pages, near-duplicates (E)

| D | Decision | Reason / cost / risk |
|---|---|---|
| D112 | Search with SQLite FTS5 (available in the bundled SQLite 3.53.2, tested) in a virtual table kept by triggers, created in a raw-SQL migration; queried in the data layer with the ownership rule in the same query; compared against the current filter-in-JavaScript with 5,000 invented questions before choosing | Prisma cannot model a virtual table; the migration and raw query are the cost |
| D113 | Keyset (cursor) pages of 50 for the bank, the picker and the papers list, ordered by (updated time, id) | No skipped or repeated rows (a bug found in Phase 11) |
| D114 | Near-duplicates: 3-word shingles and Jaccard similarity on the D76 normalised text (code and table text included); threshold chosen on invented pairs and reported; warn on save and CSV import; a "possible duplicates" view of **the user's own bank** only | An admin-wide view would show colleagues' private questions (D73) |
| D115 | Measure search and paging with 5,000 invented questions next to the Phase 12 figures | Roadmap rule |

Riskiest item: FTS5 triggers during restore and migration of an existing
backup. Size: medium.

## F: app icon (chore)

| D | Decision | Reason |
|---|---|---|
| D116 | Reuse `assets/draftex-icon.svg` (the sheet with the marks margin, already the desktop icon), redrawn with `currentColor`; used in the app header, as the favicon (SVG plus the existing `.ico`), on sign-in and setup; never on papers; no new dependency (sharp already exists for any PNG) | The app already has a mark; a second one would split its identity |

Reviewed with /apple-design and /break-ui; checked against the CSP in local,
LAN and server modes.

## Questions for the owner (most important first)

1. **Grouping (D103):** papers that use a size command in Advanced LaTeX will
   print differently (later questions no longer change size). Go ahead?
2. **Optional groups in the blueprint (D109):** a group "answer any 5 of 7":
   count each question's marks scaled by 5/7, or only the largest 5?
3. **More than one CO on a question:** needed on real papers? It is a schema
   change; today a question has one CO tag.
4. **Code characters (D100):** ASCII only (with quotes and dashes converted)
   is enough for Python questions?
5. **Blueprint scope (D108):** one blueprint per course and exam group
   (sessional vs end-semester), or one per course?
6. **Other blocked commands:** besides code, which commands did the end user
   try in Advanced LaTeX that were refused? Each needs its own review.

## SPEC amendments when approved

- §8 editor: code block, inline code, View LaTeX; table options.
- §8 serialiser: fancyvrb fixed options; grouped Advanced LaTeX.
- §6 data model: `Blueprint` table (Phase 15), FTS5 virtual table (Phase 16).
- §10 gate 3: code-line width is enforced by the generator, because fancyvrb
  overflow produces no warning.
- §13: Phases 13-16.

## Where the brief and the code disagree

- "The v0.12.0 upgrade fixture": none exists; Phase 12 had no migration, so the
  newest fixture is v0.11.0 (D95). It holds an Advanced LaTeX block, so D103
  changes its LaTeX; its export must still look the same.
- "No tabularx": every existing table is written with `tabularx` (D106).
- "Questions tagged with more than one CO": a question holds one CO tag.
- "Store the blueprint in the catalogue, edited by an admin": conflicts with
  D85 (course codes typed freely) and with private-by-default data.
- "An admin find-duplicates view": conflicts with D73 (admins see no one's
  private questions).
- "Two new logo variants": an icon already exists (D116).
- "Verbatim inside a macro argument": questions are not written inside one,
  but choices and key table cells are tabular or column contexts, so code is
  kept out of them (D101).
