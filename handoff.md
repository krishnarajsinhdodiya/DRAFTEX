# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-15
- **Current phase:** 14 merged to `main` and tagged v0.14.0 on local gates only (D118; owner: "Merge on local gates"). Next: Phase 15.
- **Branch:** `main` (v0.14.0). `phase/14-table-builder` deleted locally and on GitHub. `fix/setup-honest-errors` and `fix/network-restart-windows` untouched, still waiting for CI.
- **CI:** GitHub Actions still refuses every job (billing).
- **Local gates on the branch tip:** lint, typecheck, format, unit 1328, golden 114 passed / 30 visual skipped (Linux only), e2e 65 passed (v0.8.0, v0.10.0, v0.11.0 upgrades included), commit hygiene.

## Done this session
- Performance before (memory.md).
- Security review `docs/SECURITY-REVIEW-PHASE14.md` with engine probes. Main finding: `\multirow` lets long text run over the rows below silently; fixed with an engine check `\dxMerged` (a cell over n rows holds n lines, refused beyond with a note on the question). The roadmap's one-line fallback was not needed.
- D105/D106: table attrs `columns` (align, width %), `borders` (GRID), cell `colspan`/`rowspan`; `src/lib/latex/table.ts` (grid map, checks, LaTeX); old tables keep `tabularx` byte for byte (all 27 existing fixtures identical to main); `multirow` loaded only for row merges.
- D107: 10 × 30, widths add to 100, ≥ 5% of table and ≥ 4% of line per column, engine guard for narrow pages (`DXNARROWTABLE`), maths `&`/`\\`/`\hline` refused in all cells, row merge may not cross the booktabs header rule, not in the objective key table.
- Editor: Table bar (rows, columns, merge/split, header row, Lines/Grid, Columns popover with table width, alignment, widths, equal widths, live problems); editor tables drawn as printed; read-only view shows merges/alignment/grid.
- Tests: `tests/unit/latex/table.test.ts` (43), `tests/golden/tables-security.test.ts` (canary in every cell kind in paper and key, width measured, merged check vs multirow, narrow guard, 120-table fuzz), fixtures `tables`/`key-tables`, e2e table test in papers.spec, `tests/break-ui/worst-tables.ts`, guide section + screenshot 20.
- SPEC §8 amended; memory.md as-built notes; performance after.

## In progress
- Nothing half-done in code.

## Next steps
1. Session start per the operating rules.
2. Owner: update the Mac and the father's laptop to v0.14.0 (no migration).
3. When CI runs again: run CI on main; take ubuntu baselines for `code`, `key-code`, `tables`, `key-tables` from the visual job artifact (D4) in a commit that says why; no existing baseline may change. Then `fix/network-restart-windows`, merge both `fix/` branches.
4. Owner: try a merged-header table on the father's laptop (Windows check, as D117).
5. Then Phase 15 (CO blueprint, D108+) on `phase/15-co-blueprint`: measure performance first.

## Owner tasks (not code)
- Fix GitHub billing. Blocks every merge with CI.
- Carried: delete the copied `draftex.local.json` on the father's laptop or re-clone into `C:\DRAFTEX`; update both machines; ask the father about ASCII-only code and the backtick shortcut (Ctrl+E works; if still broken, a small `fix/inline-code-windows` branch, plus hiding the code block's horizontal scrollbar on Windows unless a line overflows); roadmap questions 2, 3, 5, 6; firewall helper and real `update-windows.bat`; CSV from Windows Excel.

## Failing tests
- None locally.

## Logged, not fixed
- A table directly followed by choices (old and new tables alike) has no space between the bottom rule and the choices.
- No `\cmidrule` under a merged booktabs header cell; use Grid for a ruled two-level header.
- Tab in the last cell adds a row past 30 (TipTap); the live check then names the limit for tables with options.
- A model answer's table sits directly on the criteria table in the key (no gap).
- Carried from Phase 13: long inline code overflows; small space before Bloom after a code block; key code numbers in the margin; `framed` before the number; Windows `\openout`; server start sweeps all job folders; admin navigation scrolls sideways on a phone; picker shows newest 50; `bloom-p1` baselines predate D70; stale lock pid checks; chemical-name overflow; ubuntu drift on three baselines; four-column choice overflow; papers list not paginated.

## Blockers / risks
- CI billing.
- The sanitiser, the code-line rule and now the table generator (fixed specs, escaped cells) are the barriers to file access; any new block type needs an engine review plus fuzz.
- LAN mode is plain HTTP (D40).

## Decisions made (copied to memory.md)
- D105-D107 as built, merged-cell check, narrow-table rules and guard, cell-maths refusal, header/merge rule, limits apply to option tables only, empty-row normalisation, editor rendering, byte identity, break-ui findings, baselines pending CI, performance before/after.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`).
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212, built app, fresh folder each start), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215), `draftex-dev-throwaway` (3216, dev). E2E 3211, restore 3214, server mode 3218, fixture server 3219, upgrade spec 3220. Stop the dev server before `npm run build`.
- Scripts against a fresh `draftex-e2e`: `node scripts/measure-performance.ts http://127.0.0.1:3212`, `node scripts/guide-screenshots.ts …` (rewrites every guide PNG; keep only the new one), `node tests/break-ui/worst-tables.ts …` (each needs its own fresh start).

## Questions for owner
- Grid header row prints bold, Lines header does not (as before). Keep?
- Later: should the app offer Times at all? Should the picker page through more than 50 matches?

## Phase checklist
- [x] 0-13 (see git tags v0.0.0 … v0.13.0)
- [x] 14 Table builder (v0.14.0, local gates only, D118; CI run and ubuntu baselines `tables`/`key-tables` owed)
- [ ] 15 CO blueprint check
- [ ] 16 Bank search, pages, near-duplicates

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
