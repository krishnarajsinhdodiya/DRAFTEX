# ROADMAP-9-12: Phases 9 to 12

The owner's brief for the phases after Phase 8, approved as deviation D53 on
2026-11-06. Each phase runs as its own session and reads this file. The SPEC
§13 table and the handoff checklist list the same phases.
("The operating rules file" below is the repo's session rules file, §2 = end
of session.)

| # | Phase | Done when |
|---|---|---|
| 9 | Polish + paper retrieval | WP-A and WP-B below; tag v0.9.0 |
| 10 | Bloom and CO on the printed paper | WP-C; tag v0.10.0 |
| 11 | Question bank + CSV import | WP-D and WP-E; tag v0.11.0 |
| 12 | Advanced LaTeX packages | WP-F (security review gate first); tag v0.12.0 |

## Rules for Phases 9-12

- Plan first in every phase: list each deviation as the next D-number, with a
  one-line cost/risk, and wait for the owner's "go". Nothing unapproved is
  built.
- Current rules stay unless the owner approves a change. In particular: every
  person, administrators included, sees only their own papers and private
  templates (memory.md: "not found" to everyone, admins included; gate 8 tests
  it). Do not widen this.
- Reuse what exists instead of adding parallel models: `ExamKind`,
  `PaperStatus`, `BloomLevel` + `Slot.bloomLevel`, `Slot.coTag`, the
  `subParts` node in `src/lib/paper/schema.ts`, the stub `Question` model and
  `Slot.questionId`, Trash (D51), audit log, backup/restore (D28-D31).
- Every user-typed string reaches LaTeX only through the existing allow-list
  sanitiser and text policy. Add fuzz cases (gate 6) for every new input.
  Never concatenate user text into LaTeX.
- Migrations are additive, new fields optional. Test by restoring a backup
  made on v0.8.0 into the new version (D28 runs the migrations) and opening
  its papers and templates unchanged.
- With no new option switched on, every existing paper compiles to the same
  PDF: existing golden and visual baselines pass without being regenerated.
  Only exception: a Phase 9 fix that deliberately changes layout (for example
  long chemical names in choices) may update a baseline in a commit whose
  message says why (SPEC §10 gate 4), and only after the owner approves it in
  the plan.
- Windows and macOS both; Windows scripts stay ASCII only; Windows CI and the
  gate 10 install job stay green.
- New screens work at 900 px wide (a Windows laptop at 125-150 % scaling).
  On a phone: lists, search and review must work; the editor stays
  best-effort as today unless the phase says otherwise.
- Update docs/USER_GUIDE.md (regenerate its screenshots with
  scripts/guide-screenshots.ts, invented data only) and README for every
  user-visible change.
- Measure editor input latency (< 50 ms) and warm preview (< 3 s) before and
  after each phase and record the figures in memory.md.
- If a work package turns out larger than planned, stop and report instead of
  cutting corners. End each phase per the operating rules file §2 (handoff,
  memory, merge --no-ff, tag, delete branch, report).

## Phase 9: Polish + paper retrieval

### WP-A: Polish (the original Phase 9)
1. Measure performance first (editor input latency, warm preview) and record
   it.
2. Run /apple-design full review and /break-ui across all screens, including
   the newer ones (Trash, Network, Activity, Backups, reset and uninstall
   flows). Fix findings or log them with reasons.
3. Carried-over issues from handoff.md: fix the cheap ones (long chemical
   names in 2/4-column choices, cramped phone editor); log the rest with
   reasons.

### WP-B: Paper retrieval
- Metadata already on every paper: course code and title, `examKind`,
  academic year, exam date, status. Do not add a second "exam type" field;
  filters group `ExamKind` values (Sessional = SESSIONAL_1/2/IMPROVEMENT,
  End-semester, ATKT, Practical, Other) in one label table.
- Add `PRINTED` to `PaperStatus` (additive). Exporting a paper marks it
  Printed. Editing a Final or Printed paper asks for confirmation first and
  puts it back to Draft.
- Papers list: text search (title, course code, course title), filters
  (exam group, academic year, status, course), sort by recently edited.
  Home screen: "Recent papers" (last 5).
- "Duplicate as..." extends the existing Duplicate: next academic year, or
  ATKT copy; the copy is Draft with no date (as today).
- Version snapshots: one is taken when a paper is marked Final and at each
  export. A paper's snapshots can be listed, viewed as PDF and restored as a
  new Draft paper. They belong to their paper (trashed and purged with it,
  D51), are included in backups and restores, and are capped so data.db does
  not grow without limit (D58: newest 20 per paper).
- Tests: unit (data layer incl. gate 8 for snapshots and search), e2e for
  search/filter, Final-edit confirmation, Printed on export, snapshot restore.

## Phase 10: Bloom and CO on the printed paper (WP-C)
- Bloom is already stored per question (`Slot.bloomLevel`, enum with the six
  names) and chosen in the editor, but never printed. Keep the enum; keep
  every printed label in one table, because the owner will confirm whether
  the college prints the names or L1-L6.
- Sub-parts: the existing `subParts` node gets optional per-sub-part `marks`,
  `coTag` and `bloom`. The question's own values prefill new sub-parts;
  sub-parts may differ. The question's marks stay the authority for totals
  and the PCI checker; sub-part marks that do not add up to it are a warning,
  not an error.
- Template option "Show Bloom level", next to the existing
  `showMarksPerQuestion`, default off, so existing output is unchanged. It
  applies to answer keys and to ATKT copies the same way.
- Print format: `(Bloom: Remember)` right after the question text; the CO tag
  right-aligned at the end of the line as today. If it does not fit on the
  last line, it goes right-aligned on the line below; never overlapping.
- Export warns (never blocks) about questions without Bloom or CO while the
  option is on.
- Paper summary panel: count and marks per Bloom level and per CO.
- Golden + visual tests: one-line question, wrapped question, long chemical
  names, sub-parts with different tags, two-column choices, missing tag.

## Phase 11: Question bank + CSV import (WP-D, WP-E)
- Build the bank on the existing `Question` model (extend it additively):
  course, unit, CO, Bloom, marks, type, content (same document schema and
  sanitising as a slot), optional answer key, tags, author, timestamps,
  optional source paper, usage history (paper, date).
- Server-side rule: no bank save without a Bloom level and a CO that exists
  in the catalogue for that course.
- Confidentiality (owner's rule, the papers are unreleased): a bank question
  is private to its author by default. The author may share it with
  colleagues per question or per course. Admins follow the same rule as for
  papers (they do not see private entries). List the exact rule in the plan
  and test it (gate 8).
- Add from a paper ("Add to bank", "Add all questions of this paper"),
  skipping duplicates (normalised text within the course) with a report of
  what was skipped and why.
- Insert from the bank: picker in the editor filtered by course, unit, CO,
  Bloom, marks and text, showing "last used in <paper, date>". Insert copies
  the question into the slot; later edits on either side do not affect the
  other. Record the usage.
- Delete follows Trash rules (D51). Bank data goes through backup, restore,
  move-data and the audit log.
- CSV import: downloadable template (course code, unit, CO, Bloom, marks,
  type, question, answer, tags). Accept UTF-8 with or without BOM and
  Windows-1252 and say which was read; size and row caps (untrusted input,
  like D29). Upload, then preview with a row-by-row report (valid, invalid
  with reason, duplicate); nothing is saved until the owner confirms; valid
  rows can be saved without the invalid ones; the error report downloads as
  CSV. Same validation as the bank; unknown characters give a named
  row-level error. Text only: the guide says figures are added in the editor.
  Tests: Excel Windows-1252 file, BOM, quoted commas and newlines, hostile
  cells (`\input{...}`, `=cmd` formula injection, very long cells).

## Phase 12: Advanced LaTeX packages (WP-F)
Gate: before any code, write a short security review (current sanitiser for
Advanced LaTeX blocks, how each package below could read files or run
commands under Tectonic `--untrusted`, which still allows `\input` of
absolute paths, and the proposed enforcement). Wait for the owner's approval.

Design after approval:
- No user-written `\usepackage`. Advanced LaTeX gets a "Packages" checklist
  from a server-side allow-list; the app writes the preamble lines. File and
  shell primitives (`\usepackage`, `\RequirePackage`, `\input`, `\include`,
  `\openin`, `\openout`, `\write`, `\read`, `\catcode`, `\csname`,
  `\directlua`, `\immediate`, `\ShellEscape`) in user text are validation
  errors; this blocklist is a second layer behind the allow-list, not a
  replacement.
- Packages load only when ticked, so default compiles and baselines do not
  change. `allowAdvancedLatex` stays per user and admin-controlled.
- Candidates: mhchem, chemfig, mathtools, enumitem, multirow, booktabs,
  tabularx, longtable, xcolor, framed, array, caption, float, multicol;
  with restrictions tikz and pgfplots (no external library, no table reads,
  no gnuplot), tcolorbox (no minted/external libraries, no \tcbinput),
  listings (no \lstinputlisting), graphicx (only app-uploaded images by
  app-generated id). Check each against the `exam` class and the pinned
  bundle (titlesec and enumitem may clash with exam.cls; report, do not
  force). Excluded: minted (shell escape), matplotlib (not LaTeX).
- tfrupee: check it exists in the pinned bundle (TeX Live 2022) and works
  with XeTeX; if not, report and propose an alternative.
- Allowed packages go into the install warm-up so compiles stay offline;
  measure the longer install and record it (update D48). The bundle pin does
  not change.
- Extend the fuzz with hostile inputs per package, including `\csname`-built
  names and path tricks, and verify with the real engine that no allowed
  package lets an absolute-path `\input` reach the output. If a package
  cannot be made safe, leave it out and report; never weaken the sanitiser.
- Measure preview time with tikz, pgfplots and tcolorbox and show a "slower
  preview" hint.

## Close-out of each phase
- Add CI tests for the phase's flows; the Windows install job must apply the
  new migrations to a data folder created by the previous version.
- Re-run /break-ui on the phase's new screens.
- Owner tasks go in handoff.md, not code: try the firewall helper once on the
  laptop, try one real `update-windows.bat` with the token, confirm the
  Bloom wording and the CO format for electives (`BP607T` vs `BP607T AEC1`).

## Questions put to the owner in each plan
- Phase 9: D53 (the phase split) and the Phase 9 deviations, each with
  cost/risk; snapshot cap per paper (answered: 20).
