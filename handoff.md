# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-07
- **Current phase:** 11 Question bank + CSV import: done. Next: Phase 12 Advanced LaTeX packages (brief in `docs/ROADMAP-9-12.md`, WP-F; security review gate first).
- **Branch:** `main` only (Phase 11 merged with `--no-ff` from `phase/11-question-bank`, tagged `v0.11.0`; branch deleted locally and on GitHub)
- **Last green commit:** the v0.11.0 merge on `main` (see CI)
- **CI:** `commit-hygiene`, `checks (ubuntu-24.04)`, `checks (windows-latest)`, `install (windows-latest)` (gate 10), `upgrade (windows-latest)` (installs v0.10.0, then updates).

## Done this session (Phase 11, WP-D and WP-E)
- **Decisions D72-D85** approved and built (memory.md has each, with "as built" notes). D72 was amended twice by the owner: the bank takes every programme, and **D85**: the 2026 syllabus gives defaults and suggestions, never rules (the father: colleges have not fully moved to the new syllabus).
- **D85 across the app**: choosing a syllabus course on a paper fills code, title and semester into editable fields (typed values win on the server, `courseFacts` in `src/server/paper-commands.ts`); every CO field (question, sub-part, bank) is free text with syllabus COs as suggestions (`src/components/editor/co-tag-input.tsx`, a datalist).
- **Migration** `20261106200000_question_bank` (additive: optional Question columns, tables `QuestionUse`, `BankCourseShare`).
- **Bank rules** `src/lib/bank/question.ts` (fields, `courseCodeSchema` with base ≤ 17, `coNote`, `bankCheck` errors vs warnings, `plainText`, `dupSource`); **data layer** `src/lib/data/bank.ts` (visibility D73/D74, per-user uses D75, dup key D76, add from paper D77, insert D78, Trash D82); **commands/actions** `src/server/bank-commands.ts`, `bank-actions.ts`.
- **CSV** `src/lib/bank/csv.ts` (decode UTF-8 BOM / UTF-8 / Windows-1252, RFC 4180 parser, caps, header checks, row mapping incl. choices, formula-guarded writer, template) and `src/server/bank-import.ts` (preview/save/report, stateless); route `src/app/api/bank/import/route.ts` (Origin check), template GET `src/app/api/bank/template/route.ts` (added to the reviewed GET list in csrf.test).
- **Screens**: `/bank` (URL filters, pages of 50, course shares), `/bank/new`, `/bank/[id]` (form for the author, read-only + Copy to my bank for colleagues, own uses), `/bank/import`; paper editor: header **Add to bank** + report, slot buttons "Use a bank question" (picker) and "Add … to the question bank"; Trash lists bank questions; nav link **Bank**.
- **Tests**: unit 960 (bank rules, CSV incl. Windows-1252/BOM/quotes/hostile cells/caps, data layer + gate 8 with guessed IDs for a colleague and an admin, commands gate 8, import end to end); golden `tests/golden/fuzz-csv.test.ts` (200 hostile CSV rows compiled); e2e 61 locally (`tests/e2e/bank.spec.ts`; restore checks the bank; `upgrade.spec.ts` runs v0.8.0 and the new v0.10.0 fixture and adds the old paper's question to the bank; `upgraded.spec.ts` (Windows job) saves a bank question after the update).
- **Break-ui** `tests/break-ui/worst-bank.ts`: ten findings fixed (memory.md 2026-11-07 line).
- **Docs**: USER_GUIDE new §8 The question bank (later sections renumbered: install is now §14), four new screenshots (14-17), editor/new-paper text for D85; README; SPEC §6 amended.
- **Performance**: before p50/p95 16 ms, max 24 ms, preview p50 429 ms; after p50/p95 16 ms, max 24 ms, preview p50 434 ms.

## In progress
- Nothing half-done.

## Logged, not fixed
- The admin navigation scrolls sideways on a phone (now 7 links; carried since Phase 9). Faculty (3 links) fit.
- The picker shows the newest 50 matches and says "narrow them with the filters"; no paging inside the dialog.
- A shared question with Advanced LaTeX can be inserted only by someone allowed Advanced LaTeX (same rule as typing it).
- `bloom-p1.png` / `key-bloom-p1.png` show the layout before D70 (under the 0.5% limit; refresh at the next baseline change).
- Stale `draftex.lock` with a reused pid: restore, move-data, reset-password, update and uninstall checks still trust the pid alone.
- Question text overflows on unsplittable chemical pieces in one column (pre-existing; D61 covers choices only).
- CI ubuntu renders of three old baselines drift 0.02-0.19% (limit 0.5%).
- Four-column choices overflow on unsplittable pieces; papers list not paginated.

## Next steps (Phase 12, follow docs/ROADMAP-9-12.md WP-F)
1. Session start per the operating rules; branch `phase/12-advanced-latex` from `main`.
2. Security review gate first (WP-F): `--untrusted` still lets `\input` read absolute paths (memory.md); the allow-list sanitiser is the only barrier.
3. Plan first: D-numbers from D86, each with cost/risk; wait for "go".
4. Measure performance before (`node scripts/e2e-server.ts 3212`, then `node scripts/measure-performance.ts http://127.0.0.1:3212`).
5. If Phase 12 adds migrations, make a v0.11.0 upgrade fixture (`scripts/make-upgrade-fixture.ts … v0.11.0`; the v0.10.0 branch of the script fits v0.11.0 too) and add it to `upgrade.spec.ts`.

## Owner tasks (not code)
- Run `npm run db:migrate` on the Mac data folder (`/Volumes/DRAFTEX/DRAFTEX-data`) before starting v0.11.0 there (the start also applies migrations; a backup is taken first by the update scripts).
- Install on the father's Windows 11 laptop as a `git clone` into `C:\DRAFTEX` (guide §14) and time it.
- Try the firewall helper once; try one real `update-windows.bat` with the read-only token.
- Ask the father to try a CSV import from his own Excel file (Windows-1252 path) and tell us how the preview reads.

## Failing tests
- None known. Local: lint, typecheck, unit 960, golden (full), e2e 61 green before the merge.

## Blockers / risks
- Not tried on a real Windows machine: double-click flow, Git Credential Manager with the token, real `git pull`, UAC firewall step, `reset-password-windows.bat`, a CSV saved by Windows Excel. CI covers the scripts headless.
- D85 means a wrong CO number on any course is a warning only; the bank cannot catch it.
- LAN mode is plain HTTP (D40). Carried: restore needs a restart (D28); same question in two windows is last-write-wins; bundle host `data1b.fullyjustified.net`; Times not offered; ESLint 10 overrides.

## Decisions made (copied to memory.md)
- D72 (amended twice), D73-D85, bank course-code length, Add to bank on Final papers, no revalidate in editor bank actions, combobox role for CO fields, v0.10.0 fixture, break-ui findings, performance before/after.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`). Phase 11 adds a migration (see Owner tasks).
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215), `draftex-dev-throwaway` (3216). E2E 3211, restore 3214, server mode 3218, fixture server 3219, upgrade spec 3220.
- A v0.10.0 worktree was made at `/tmp/draftex-v0100` for the fixture; remove it with `git worktree remove /tmp/draftex-v0100` if it is still there.

## Questions for owner
- Later: should the app offer Times at all?
- Should the picker page through more than 50 matches, or are filters enough?

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
- [x] 10 Bloom and CO on the printed paper
- [x] 11 Question bank + CSV import
- [ ] 12 Advanced LaTeX packages

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
