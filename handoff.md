# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-06
- **Current phase:** 9 Polish + paper retrieval: done. Next: Phase 10 Bloom and CO on the printed paper (brief in `docs/ROADMAP-9-12.md`, WP-C).
- **Branch:** `main` only (Phase 9 merged with `--no-ff` from `phase/9-polish`, tagged `v0.9.0`; branch deleted locally and on GitHub)
- **Last green commit:** latest `main` (CI green on the v0.9.0 merge, run 42208639526)
- **CI:** `commit-hygiene`, `checks (ubuntu-24.04)`, `checks (windows-latest)`, `install (windows-latest)` (gate 10) and the new `upgrade (windows-latest)`.

## Done this session (Phase 9)
- **D53**: roadmap extended to Phases 10–12; the owner's brief is `docs/ROADMAP-9-12.md` (every later phase reads it); SPEC §4, §6, §13, §14 amended.
- **D54–D62 approved** (snapshot cap 20; YEAR_END in End-semester by default).
- **WP-B paper retrieval**
  - Additive migration `20261106090000_paper_snapshots`: `PaperStatus.PRINTED`, `Paper.printedAt`, table `PaperSnapshot` (cascade with the paper).
  - Data layer `src/lib/data/papers.ts`: `list(actor, filter)` (search in JS, filters in SQL), `recent`, `filterOptions`, `findEditable` lock on every write (`PAPER_LOCKED`), `update` handles reopen/Final (version on Final), `markPrinted` (export), `listVersions` / `getVersion` / `restoreVersion`, `duplicate` with `academicYear`.
  - Version data: `src/lib/paper/version.ts`; PDF: `src/server/version-pdf.ts` + `GET /api/papers/[id]/versions/[versionId]` (`?kind=key`, `?download=1`).
  - UI: `papers/page.tsx` (search + filters in the URL), `papers/paper-list.tsx` (shared with home Recent papers), editor `status.tsx` (Mark as Final, read-only banner + Edit confirmation, Versions dialog with restore), `export-duplicate.tsx` (Duplicate as…: next year / ATKT / another).
  - Labels: `EXAM_GROUPS`, `PAPER_STATUS_LABEL` in `src/lib/templates/labels.ts`; `nextAcademicYear` in `src/lib/paper/academic-year.ts`.
- **WP-A polish**
  - Performance measured before and after (`scripts/measure-performance.ts`, figures in memory.md).
  - D61 long chemical names in column choices (LaTeX and the editor's HTML).
  - D62 phone pass on the editor; ubuntu runners pinned to 24.04.
  - Design review + break-ui: findings below.
- **Upgrade tests**: `tests/e2e/upgrade.spec.ts` with `tests/fixtures/upgrade/v0.8.0-*` (rows unchanged, export pixel-identical to v0.8.0's); CI job `upgrade (windows-latest)` (previous tag → its setup → update-windows.bat → `upgraded.spec.ts`).
- Docs: USER_GUIDE §3, §4 (Final and Printed, Versions), §6, §7 (Duplicate as…, Finding a paper), screenshots regenerated (new 11-papers, 12-versions); README scripts and upgrade testing.
- Tests: unit 831 (was 787), e2e 50 locally (+ upgrade spec) + 4 in the install job + 2 in the upgrade job, golden 42 + 22 visual on ubuntu (no baseline changed).

## Design review and break-ui (Phase 9)
- Fixed: disabled fields in a Final paper looked editable; Activity had no words for print / reopen / restore-version; Versions dialog pushed Close off-screen with 20 versions; copy names lost their suffix at 200 characters; phone filters one per row; editor title collapsed at 900 px; phone editor cramped (title, columns, icon-only header below 640 px); editor choice columns let long names overflow.
- Checked and fine: every colour token pair WCAG AA in light and dark (lowest 4.78:1 tertiary text on sunk); 250 papers render without pagination; long titles, course codes at 40 characters, one-letter titles, odd academic-year text.
- Logged, not fixed: four-column choices still overflow on unsplittable pieces (use two columns); the papers list is not paginated (a teacher makes tens of papers a year; revisit past ~1,000); admin top navigation scrolls sideways on a phone (unchanged since Phase 7).

## In progress
- Nothing half-done.

## Next steps (Phase 10, follow docs/ROADMAP-9-12.md WP-C)
1. Session start per the operating rules; branch `phase/10-bloom-co` from `main`.
2. Plan first: D-numbers from D63, each with cost/risk; wait for "go". D63 = elective CO tag format (two-digit CO number, confirmed) `BP607T.01 AEC1` / `BP212P.01 SEC1` (coTag helper, slot tag rule allows one space before the AEC/SEC suffix, CO picker, tests); no real elective papers exist yet, so no stored tags need rewriting unless the owner has made some. Bloom wording is decided: names (Remember … Create, "Analyse" spelling), from one label table shared with the editor's `BLOOM_LABEL` (memory.md).
3. Measure performance before (`node scripts/e2e-server.ts 3212` then `node scripts/measure-performance.ts http://127.0.0.1:3212`).
4. The upgrade fixture for Phase 10 should be regenerated from v0.9.0 (`scripts/make-upgrade-fixture.ts` against a v0.9.0 worktree build) or kept at v0.8.0 and a v0.9.0 one added; the CI upgrade job picks the previous tag automatically.

## Owner tasks (not code)
- Install on the father's Windows 11 laptop as a `git clone` into `C:\DRAFTEX` (guide §13) and time it.
- Try the firewall helper once (UAC prompt, rule created, rule removed).
- Try one real `update-windows.bat` with the read-only token.
- Note: papers he marked Final before this update now open read-only; Edit puts them back to Draft.

## Failing tests
- None.

## Blockers / risks
- Not tried on a real Windows machine: double-click flow, Git Credential Manager with the token, real `git pull`, UAC firewall step, `reset-password-windows.bat`. CI covers the scripts headless.
- LAN mode is plain HTTP (D40). Server mode locks out direct access (recovery documented).
- The GitHub token on the end user's machine expires; updates then fail (guide explains renewal).
- Carried: restore needs a restart (D28); same question in two windows is last-write-wins (the Final lock is server-enforced, editing is not merged); bundle host `data1b.fullyjustified.net`; Times not offered; `--untrusted` still allows `\input` of absolute paths (Phase 12 security review); ESLint 10 overrides; npm warns about `fsevents` install scripts (harmless).

## Decisions made (copied to memory.md)
- D53–D62, upgrade testing approach, performance before/after, D61 as built and its 4-column limit, JS-side search, Final papers read-only after update, version PDF route, CI upgrade job, phone header, worst-case retrieval seed.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`). `npm run db:migrate` done for `paper_snapshots` (owner, 2026-11-06).
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215), `draftex-dev-throwaway` (3216). E2E 3211, restore 3214, server mode 3218, v0.8.0 fixture server 3219, upgrade spec 3220.
- A v0.8.0 worktree may remain at `/tmp/draftex-v080` (`git worktree remove /tmp/draftex-v080` to drop it).

## Questions for owner
- Later: should the app offer Times at all?

## Phase checklist
- [x] 0 Bootstrap
- [x] 1 LaTeX core
- [x] 2 Data + auth
- [x] 3 Rules + course catalogue
- [x] 4 Template library + builder
- [x] 5 Paper editor
- [x] 6 Answer keys + exports + files
- [x] 7 Network modes + hardening
- [x] 8 Installers + docs
- [x] 9 Polish + paper retrieval (docs/ROADMAP-9-12.md)
- [ ] 10 Bloom and CO on the printed paper
- [ ] 11 Question bank + CSV import
- [ ] 12 Advanced LaTeX packages

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
