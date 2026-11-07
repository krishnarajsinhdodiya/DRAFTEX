# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-07
- **Current phase:** 12 Advanced LaTeX packages: done. All phases in docs/ROADMAP-9-12.md are complete; no next phase is planned.
- **Branch:** `main` only (Phase 12 merged with `--no-ff` from `phase/12-advanced-latex`, tagged `v0.12.0`; branch deleted locally and on GitHub)
- **Last green commit:** phase branch tip `f2a4aa6` green in CI run 42355063346 (all five jobs); the merge on `main` runs the same jobs
- **CI:** `commit-hygiene`, `checks (ubuntu-24.04)`, `checks (windows-latest)`, `install (windows-latest)` (gate 10), `upgrade (windows-latest)` (installs v0.11.0, then updates).

## Done this session
- **Baseline fix first:** `tests/unit/server/template-commands.test.ts` picked "the first built-in" from a list with no fixed order and failed ~1 run in 5 since D50; it now picks the blank built-in by key (merged to main via `fix/builtin-test-order` before the phase).
- **Security review gate:** `docs/SECURITY-REVIEW-PHASE12.md` (tested with the pinned engine: `--untrusted` allows absolute reads AND `\openout` writes on macOS; tikz `plot file`, pgfplots `\addplot table/graphics`, `\lstinputlisting`, `\includegraphics` and chemfig bond options reach files with no forbidden name). Owner approved D86-D97 with "Go".
- **Packages (D86-D91):** mhchem (`\ce`; `\pu` not offered, the bundle lacks it), chemfig (bond options: numbers/angles only), mathtools subset, multirow, enumitem (key allow-list, no hooks), xcolor (`\textcolor` with named colours), framed, tfrupee (`\rupee`). Excluded: tikz, pgfplots, tcolorbox, listings, longtable, caption, float. Allow-list in `src/lib/latex/sanitize.ts`, preamble lines in `src/lib/latex/packages.ts` (loaded only when used, D87; chemfig under Latin-1 input to avoid nine engine warnings).
- **D92 withdrawn:** plain `₹` already printed "Rs."; unchanged. Open question below.
- **Editor:** the Advanced LaTeX box names the packages a block loads and lists the commands; long names in check messages wrap (break-ui finding).
- **Tests:** byte identity of every fixture's LaTeX vs v0.11.0 (D94, `tests/fixtures/latex/v0.11.0-hashes.json`); gate 7 unit (`sanitize-packages.test.ts`) and real engine with a canary (`tests/golden/packages-security.test.ts`); gate 6 package fuzz (`fuzz-packages.test.ts`); new fixtures `packages` / `key-packages` with new ubuntu baselines (no existing baseline changed); e2e for the Advanced LaTeX flow in `papers.spec.ts`; v0.11.0 upgrade fixture with an Advanced LaTeX block, pixel-identical after update (D95).
- **Docs:** USER_GUIDE §4 Advanced LaTeX + screenshot 18; SPEC §8 amended; README; memory.md.
- **Measured:** performance after (targets met; see memory.md); fresh `setup:tectonic` 279 s on the Mac (D96).

## In progress
- Nothing half-done.

## Logged, not fixed
- Advanced LaTeX blocks are not grouped: `\large` carries into later questions (D97; the guide tells users to use braces).
- On windows-latest the engine did not write `\openout` to an absolute `C:/` path; macOS does. Refusal is enforced everywhere; cause unknown.
- A `framed` box first in a question prints before its number.
- Starting a DRAFTEX server sweeps every job folder in `<OS temp>/DRAFTEX` (breaks goldens running at the same time on one machine).
- Carried: admin navigation scrolls sideways on a phone; picker shows the newest 50 only; `bloom-p1`/`key-bloom-p1` baselines predate D70; stale `draftex.lock` pid checks in restore/move-data/reset-password/update/uninstall; question text overflow on unsplittable chemical pieces; ubuntu render drift 0.02-0.19% on three old baselines; four-column choice overflow; papers list not paginated.

## Next steps
1. Session start per the operating rules (no phase is planned after 12).
2. Ask the owner the open questions below; any new work needs its own plan and D-numbers from D98.

## Owner tasks (not code)
- Update the Mac and the father's laptop to v0.12.0 (no migration in this phase).
- Install on the father's Windows 11 laptop as a `git clone` into `C:\DRAFTEX` (guide §14) and time it.
- Try the firewall helper once; try one real `update-windows.bat` with the read-only token.
- Ask the father to try a CSV import from his own Excel file, and to try `\ce{...}` and `\chemfig{...}` in Advanced LaTeX (an admin must allow it for him under People).

## Failing tests
- `tests/e2e/network.spec.ts` "LAN mode: the admin switches, restarts…" timed out on windows-latest in the v0.12.0 merge run 42355929142 ("Saved, not yet in use" still shown after 90 s); it passed on the branch run 42355063346 and on macOS. Cause not found: the spec does not keep the restarted server's output. Next step: capture the supervisor/server output in that spec (as upgrade.spec does), then fix the cause. Repro: `npm run test:e2e` on windows-latest; not reproduced locally.
- The same run's Trash test failure was a race in the test (a page load started before the "Move to Trash" redirect landed); fixed on `fix/trash-e2e-race`.
- Otherwise none known. Local: lint, typecheck, format, unit 1182, golden (80 passed, visual skipped off Linux), e2e 63 green; CI run 42355063346 green.

## Blockers / risks
- The sanitiser stays the only barrier between user text and file access (the engine allows absolute reads, and writes on macOS). Any future package must go through the same review: a name allow-list cannot see file paths given as plain strings.
- Not tried on a real Windows machine: double-click flow, Git Credential Manager with the token, real `git pull`, UAC firewall step, `reset-password-windows.bat`, a CSV saved by Windows Excel.
- LAN mode is plain HTTP (D40).

## Decisions made (copied to memory.md)
- D86-D91, D93-D97; D92 withdrawn; as-built notes (`\pu`, chemfig encoding, framed placement, temp sweep, Windows write, install time, performance, break-ui).

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`).
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215), `draftex-dev-throwaway` (3216). E2E 3211, restore 3214, server mode 3218, fixture server 3219, upgrade spec 3220.
- Making an upgrade fixture: `git worktree add /tmp/dx-vX <tag>`, `npm ci && npm run build` there, `node scripts/e2e-server.ts 3219` from that folder, then here `node scripts/make-upgrade-fixture.ts http://127.0.0.1:3219 "$(node -e 'console.log(require("os").tmpdir())')/draftex-e2e-3219" <tag>`.

## Questions for owner
- Is TikZ/pgfplots needed at all? If graphs matter, a structured graph builder (numbers in, no user LaTeX) is the safe route, not raw pgfplots.
- Later: should the app offer Times at all? Should the picker page through more than 50 matches?

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
- [x] 12 Advanced LaTeX packages

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
