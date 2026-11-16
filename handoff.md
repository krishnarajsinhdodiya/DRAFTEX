# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-16
- **Current phase:** 16 (bank search, pages, near-duplicates) on `phase/16-bank-search`, pushed. Before it, the owner's exam-kind decision (D131-D136) was built and committed on the same branch.
- **Branch:** `phase/16-bank-search` (tip 4efe24b). `main` = v0.15.0. Local-only `fix/setup-honest-errors` and `fix/network-restart-windows` untouched.
- **CI:** GitHub Actions still refuses every job (billing). Merging needs the owner's explicit OK ("merge on local gates"); D124 covered Phase 15 only.
- **Local gates on the branch tip:** lint, typecheck, format, unit 1381, golden 121 passed / 30 visual skipped, e2e 71 passed (upgrades v0.8.0, v0.10.0, v0.11.0, v0.14.0, v0.15.0).

## Done this session
- Session start; performance before Phase 16 (memory.md).
- D115 before: `tests/perf/seed-bank.ts` (5,000 invented questions, ties every 25 rows, a course share, Trash) and `tests/perf/bank-search.test.ts` (`npx vitest run --config vitest.perf.config.ts`, `SEED_COUNT` env). Finding: today's `bank.list` fails with Prisma P2029 once ~1,000 questions are visible (942 works); figures at 942 in memory.md.
- FTS5 probe: SQLite 3.53.2 has FTS5; unicode61 misses `butyl` in `isobutylphenyl`, trigram finds it. D125-D130 approved (trigram, columns, query rules, visibility in SQL, order, keyset pages).
- Exam kinds (owner decision, D131-D136): migration `20261116180000_exam_kinds` (PRACTICAL_SESSIONAL → PRACTICAL_SESSIONAL_1 in rows and JSON copies; PRACTICAL_SESSIONAL_2 added; `Blueprint.examGroup` → `examKind` with the D134 mapping); `EXAM_KINDS` order; rules, filter group, seeds; blueprint form/list/panel per exact exam; migration unit test; e2e exact-exam test; v0.15.0 upgrade fixture with a practical paper and a blueprint; guide, SPEC.
- Equation flake in fixture/guide scripts: wait for the field value before Enter (likely cause).

## In progress
- Phase 16 code has not started beyond the seed. Next is D112/D126 FTS5.

## Next steps
1. Session start per the operating rules.
2. FTS5 migration (D125/D126): `CREATE VIRTUAL TABLE question_fts USING fts5(question_id UNINDEXED, body, tokenize='trigram remove_diacritics 1')` (or separate columns); body = searchText + answer text (`json_tree(answerKey)` where key='text') + tags (`json_each`) + courseCode + courseTitle + coTag; insert/update/delete triggers on "Question"; fill from existing rows in the migration. Do not rely on Question's rowid (it is a TEXT primary key table; rowid may change on VACUUM).
3. `src/lib/bank/search.ts` (pure): query → safe MATCH string (D127), queries under 3 characters → `instr()`; cursor encode/decode with Zod (D130). Unit tests: hostile input, `%` `_`, emoji, non-Latin, 100 characters.
4. Rewrite `bank.list` as one raw SQL (visibility D73 with EXISTS on BankCourseShare, Trash, filters, MATCH, ORDER BY COALESCE(updatedAt, createdAt) DESC, id DESC, LIMIT 51), then load those ≤ 50 rows with Prisma. Compare with the old JS filter on the seed for plain words in question text and tags. Update `/bank` screen and picker to Older/Newer links; papers list keyset too (D59 URL filters stay).
5. D114 near-duplicates; worst-search break-ui; guide section + screenshots; performance after; D115 after figures; restore/backup index checks (an index built by migration on restore; v0.16.0 backup restores with a working index).

## Owner tasks (not code)
- Fix GitHub billing.
- Carried: delete the old `C:\draftex-main`; ASCII-only code and the backtick shortcut; roadmap question 6; firewall helper and real `update-windows.bat`; CSV from Windows Excel.

## Failing tests
- None locally.

## Logged, not fixed
- Bloom near-full-line overflow (~20 pt); proposed ragged break changes every Bloom paper's LaTeX; waiting for the owner.
- Two CO tags both at the schema maximum overflow the key heading with Bloom on.
- `PaperSnapshot.sha256` is not recomputed by the exam_kinds migration (one extra version may be stored later; harmless).
- Admin navigation scrolls sideways on a phone; plus the Phase 14 carried list (see git history of this file).

## Blockers / risks
- CI billing.
- FTS5 triggers during restore and migration of an existing backup (roadmap's riskiest item).

## Decisions made (copied to memory.md)
- D125-D130 (search design), D131-D136 (exam kinds, blueprints per exact exam) and their as-built notes; D136 answered (keep the title); P2029 finding; FTS5 probe; equation flake cause.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`); not migrated past Phase 14 (no Blueprint table): run `npm run db:migrate` before using the real app.
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json`: `draftex-e2e` (3212) etc. as before. Stop preview servers before `npm run build`. Never start a server while goldens run.
- v0.15.0 worktree at `/tmp/dx-v0.15.0` (built); fixture runner `/tmp/fixture-run.sh` (temporary, not tracked).

## Questions for owner
- Bloom near-full-line overflow fix? Grid header bold? Times font? Picker beyond 50 (D130 fixes)?

## Phase checklist
- [x] 0-15 (see git tags v0.0.0 … v0.15.0)
- [ ] 16 Bank search, pages, near-duplicates (exam-kind change D131-D136 rides with it)

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
