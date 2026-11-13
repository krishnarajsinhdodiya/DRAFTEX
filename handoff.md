# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-13
- **Current phase:** planning Phases 13-16 (`docs/ROADMAP-13-16.md`, not approved). Nothing is built until the owner replies "Go".
- **Branches:** `main` (v0.12.0 + docs); `chore/plan-13-16` (this plan); `fix/setup-honest-errors` and `fix/network-restart-windows` pushed, **not merged**: CI cannot run.
- **CI:** GitHub Actions refuses to start any job ("recent account payments have failed or your spending limit needs to be increased"; runs 43379586908, 43379840241). Nothing can be merged until the owner fixes billing.

## Done this session
- Session start: baseline green locally (lint, typecheck, unit 1182).
- `fix/setup-honest-errors`: setup checks `draftex.local.json` before `npm ci` and names a copied pointer; it retries `npm ci` only when npm's log (kept with `--logs-dir`) shows a network error. `src/lib/install/preflight.ts`, `scripts/setup-check.ts`, tests (14), a Windows CI step. Found on the end user's laptop, where a folder copied from the Mac failed inside npm and setup blamed the network.
- `fix/network-restart-windows`: Playwright now keeps the e2e server's output, the server logs prepare/listen times, the network spec logs each restart's duration (Mac: about 1.8 s). The cause of the Windows timeout is still unknown; the next CI run will show it.
- Engine probes for Phase 13 and `docs/SECURITY-REVIEW-PHASE13.md` (fancyvrb is in the bundle, zero warnings; overlong code lines overflow with no warning; a closing `\end{Verbatim}` line ends the block; a leading code block's line number overprints the question number; `\begingroup ... \par\endgroup` stops `\large` leaking with correct spacing; FTS5 available in SQLite 3.53.2).
- `docs/ROADMAP-13-16.md`: D98-D116, six questions for the owner, SPEC amendments, contradictions with the brief.

## In progress
- Waiting for the owner: billing (to run CI), answers to the six questions in ROADMAP-13-16, and "Go".

## Logged, not fixed
- Advanced LaTeX blocks are not grouped: `\large` carries into later questions (D97; the guide tells users to use braces).
- On windows-latest the engine did not write `\openout` to an absolute `C:/` path; macOS does. Refusal is enforced everywhere; cause unknown.
- A `framed` box first in a question prints before its number.
- Starting a DRAFTEX server sweeps every job folder in `<OS temp>/DRAFTEX` (breaks goldens running at the same time on one machine).
- Carried: admin navigation scrolls sideways on a phone; picker shows the newest 50 only; `bloom-p1`/`key-bloom-p1` baselines predate D70; stale `draftex.lock` pid checks in restore/move-data/reset-password/update/uninstall; question text overflow on unsplittable chemical pieces; ubuntu render drift 0.02-0.19% on three old baselines; four-column choice overflow; papers list not paginated.

## Next steps
1. Session start per the operating rules.
2. When CI runs again: rerun `fix/network-restart-windows` (rerun its windows job until it fails once, read the `[WebServer]` lines and `restart to` timings, fix the cause on that branch), then merge both `fix/` branches and delete them.
3. On "Go": merge `chore/plan-13-16`, record D98-D116 in memory.md with the owner's answers, branch `phase/13-code-blocks`, measure performance first.

## Owner tasks (not code)
- Fix GitHub billing (Settings, Billing and plans): no CI job starts until then.
- On the end user's laptop: delete the copied `draftex.local.json` (it names the Mac data folder) or replace the copy with a `git clone`.
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
