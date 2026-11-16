# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-17
- **Current phase:** 16 done: merged to `main` on local gates (D137), version 0.16.0, tag v0.16.0, branch deleted. Next phase not started.
- **Branch:** `main` = v0.16.0 (merge 097c16e). Local-only `fix/setup-honest-errors` and `fix/network-restart-windows` untouched.
- **CI:** GitHub Actions still refuses every job (billing). D137 covered Phase 16 only; a full CI run is owed once Actions runs.
- **Local gates on the branch tip (Mac):** lint, typecheck, format, unit 1412, golden 121 passed / 30 visual skipped, e2e 73 passed (upgrades v0.8.0, v0.10.0, v0.11.0, v0.14.0, v0.15.0).

## Done this phase
- Exam kinds D131-D136 (two practical sessionals, blueprints per exact exam); D136 answered: keep "Practical Sessional Examination".
- FTS5 index `question_fts` (migration `20261117090000_question_search`, triggers, fill, keyed by id).
- `src/lib/bank/search.ts` (safe search terms), `src/lib/paging.ts` (cursors, `msSql`, `pageOf`).
- `bank.list` = one SQL query per page (visibility, Trash, filters, search); no more P2029 above ~1,000 visible questions. /bank and picker use Older/Newer.
- Papers list pages 50 at a time (`data.papers.page`).
- Near-duplicates D114 (`src/lib/bank/similar.ts`): note after save, on the question page, in CSV import; `/bank/duplicates`; template phrases skipped (COMMON_SHINGLE 200).
- Backup → restore keeps a working index (unit test).
- Worst-case data `tests/break-ui/worst-search.ts`; fixes (50 pairs, 240-character summaries).
- Guide: Finding questions, pages, Questions that read almost the same, shot `23-duplicates.png`; guide script fixed (blueprint label, CSV kept until Save).
- SPEC §6 amended; memory.md as-built lines, D115 after figures, performance after.

## In progress
- Nothing half-done.

## Next steps
1. Session start per the operating rules.
2. Done: merge, 0.16.0, tag, branch deleted.
3. Add a v0.16.0 upgrade fixture (`scripts/make-upgrade-fixture.ts` against a v0.16.0 worktree; include a bank question so the index is checked after restore) and add v0.16.0 to `FROMS` in tests/e2e/upgrade.spec.ts, as the first Phase 17 step.
4. Owner's father's laptop: `update-windows.bat`, then try search, Older/Newer and Possible duplicates; the data folder gets the two new migrations.

## Owner tasks (not code)
- Fix GitHub billing.
- Update the father's laptop to v0.16.0 and report (Windows check for D137).
- Answer the near-duplicate question below.
- Carried: delete the old `C:\draftex-main`; ASCII-only code and the backtick shortcut; roadmap question 6; firewall helper and real `update-windows.bat`; CSV from Windows Excel.

## Failing tests
- None locally.

## Logged, not fixed
- Short search words (1-2 characters) fold ASCII case only and no accents.
- Bloom near-full-line overflow (~20 pt); waiting for the owner.
- Two CO tags both at the schema maximum overflow the key heading with Bloom on.
- `PaperSnapshot.sha256` not recomputed by the exam_kinds migration (harmless).
- Admin navigation scrolls sideways on a phone (579 px at 375); plus the Phase 14 carried list.
- `prisma migrate diff/dev` would drop the FTS5 shadow tables; never run them, edit generated migrations by hand.

## Blockers / risks
- CI billing; Windows not checked for Phase 16 yet (FTS5 trigram is in the bundled SQLite on every OS, likely fine).

## Decisions made (copied to memory.md)
- D125-D136 and as-built notes; DateTime text format finding (ms comparison); D114 threshold 0.35 and COMMON_SHINGLE; papers list keeps its count; worst-case fixes.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`); not migrated past Phase 14: run `npm run db:migrate` before using the real app.
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json`: `draftex-e2e` (3212), `draftex-guide` (3210, fresh folder for scripts/guide-screenshots.ts) etc. Stop preview servers before `npm run build`. Never start a server while goldens run.
- Perf: `npx vitest run --config vitest.perf.config.ts --silent=false` (SEED_COUNT env).

## Questions for owner
- Near-duplicates: keep 3-word shingles (every rewording caught; 3 of 8 alike-but-different test pairs also flagged) or 2-word shingles at 0.50 (1 of 8 flagged)? It changes only which notes appear.
- Carried: Bloom near-full-line overflow fix? Grid header bold? Times font?

## Phase checklist
- [x] 0-15 (see git tags v0.0.0 … v0.15.0)
- [x] 16 Bank search, pages, near-duplicates (v0.16.0, merged on local gates, D137)

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
