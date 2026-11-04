# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-04
- **Current phase:** 8 Installers + docs: done. Next: Phase 9 Polish.
- **Branch:** `main` only (Phase 8 merged with `--no-ff` from `phase/8-installers-docs`, tagged `v0.8.0`; branch deleted locally and on GitHub)
- **Last green commit:** latest `main`
- **CI:** `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)` + new `install (windows-latest)` (gate 10), green on the phase branch before the merge.

## Done this session (Phase 8)
- Deviations D42–D48 approved before the phase; D43 amended during it (owner chose the portable Node archive: winget has no 24.22.2).
- **Installers** (repo root): `setup-windows.bat` → `setup-windows.ps1`, `start-windows.bat`, `update-windows.bat` → `update-windows.ps1`, `setup-macos.sh`, `start-macos.command`, `update-macos.sh`.
  - Setup: download Node 24.22.2 from nodejs.org, check the pinned SHA-256, unpack into `.runtime/node` (git-ignored, no admin) → `npm ci` → `scripts/install.ts` (data folder + cloud-sync warning, migrations, Tectonic + warm-up, `next build`, telemetry off) → desktop shortcut (`DRAFTEX.lnk` with `assets/draftex.ico`; `~/Desktop/DRAFTEX.command` on macOS). Idempotent.
  - Start: `node scripts/start.ts --open` opens the browser when the app answers, or only the browser if DRAFTEX already runs; `DRAFTEX_NO_BROWSER=1` skips it. Window close (SIGHUP) now stops cleanly.
  - Update: `scripts/update-check.ts` (refuses while running or with edited tracked files) → `backup.ts --kind before-update` → `git pull --ff-only` → the new setup script. Written so `git pull` changing the script mid-run is harmless.
  - `tests/unit/install/scripts.test.ts` keeps the Node pin = `.nvmrc` with the official checksums, the order check → backup → pull, ASCII-only Windows files, line endings and exec bits.
- **Move data folder** (D45): `npm run move-data -- <folder>` (`src/lib/install/move.ts`): app stopped, copy, SHA-256 compare, rewrite `draftex.local.json`, old folder kept.
- Lock helpers moved to `src/lib/lock.ts` (re-exported by `src/lib/backup/run.ts`).
- Setup prints a count of expected warm-up notes instead of hundreds of font lines (`--verbose` lists them).
- **Docs:** `README.md` (developers) and `docs/USER_GUIDE.md` (plain English, 10 screenshots in `docs/user-guide/`, made by `scripts/guide-screenshots.ts` with invented data). The guide says plainly: never open the router/internet, LAN mode is unencrypted, backups and exports hold unreleased papers, how to recover from server mode, and the installer's steps (Git for Windows, read-only fine-grained token, clone, setup) with measured times.
- **Gate 10** (`install (windows-latest)` job): clean checkout → `setup-windows.bat` → shortcut and unchanged checkout checked → `start-windows.bat` → `smoke.spec.ts` + new `installed.spec.ts` (first-run admin, built-in template compiles) against port 3210 via `DRAFTEX_E2E_URL` → stop → `update-windows.bat -NoPull` → before-update backup exists → starts again.
- Tests: unit 768 (was 747), e2e 38 locally + 4 in the install job, golden 40 + 22 visual on ubuntu (unchanged).

## Measured install times (D48)
- macOS (Apple silicon), clean clone, no system Node on PATH: **5.0 min** (LaTeX first download 4.6 min). Update with a real `git pull` from a local clone: 24 s.
- windows-latest, clean checkout: setup **2.8 min** with the LaTeX cache restored (Node download 6 s); update 1.6 min. A first install adds the 4–5 min LaTeX download.
- Father's laptop: **not timed** (owner to do; guide says expect 10–15 min).

## In progress
- Nothing half-done.

## Next steps (Phase 9, Polish; follow SPEC §13)
1. Session start per the operating rules; branch `phase/9-polish` from `main`.
2. `/apple-design` full review and `/break-ui` across all screens; close findings or log them with reasons.
3. Performance: editor input latency < 50 ms, preview < 3 s warm; measure and record.
4. Carried items worth deciding in Phase 9: admin password recovery (open question), admin nav wrapping below ~1100 px, superseded-compile `CompileRejected` stack in the server log, Turbopack tracing warning for `src/lib/backup/run.ts`.
5. Owner tasks before handing the laptop over (not code): install on the real Windows laptop with the guide's §13 and time it; try the firewall helper once (UAC prompt, rule created, rule removed); try one real `update-windows.bat` with the token.

## Failing tests
- None.

## Blockers / risks
- **Not tried on a real Windows machine:** double-click flow (execution policy bypass, console window, `rundll32` browser open, closing the console window → SIGHUP), Git Credential Manager with a fine-grained token, real `git pull` on Windows, and the UAC firewall step. CI covers the scripts headless.
- **Sole-admin password loss is unrecoverable** today (no reset script). Guide advises a second administrator.
- **LAN mode is plain HTTP** (D40). **Server mode locks out direct access**; recovery documented (set `"mode": "local"` in `config.json`).
- The GitHub token on the end user's machine expires; updates then fail with "could not be downloaded" (guide explains renewal).
- Carried over: restore needs a restart; zip bombs only caught after inflating; long chemical names in 2/4-column choices; cramped phone editor; same question in two windows is last-write-wins; bundle host `data1b.fullyjustified.net`; Times not offered; `--untrusted` still allows `\input` of absolute paths (always sanitise); ESLint 10 overrides; `ubuntu-latest` moves to Ubuntu 26; npm warns that `fsevents` has unapproved install scripts (macOS optional dependency, harmless).

## Decisions made (copied to memory.md)
- D42–D48 (D43 amended: portable Node archive), Git not installed by setup, SIGHUP handling, ASCII-only Windows scripts and mid-run-safe update scripts, quiet warm-up notes, CI-only `cache/` from Next telemetry, screenshot script, icon, sole-admin recovery gap.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`, git-ignored). Run `npm run db:migrate` once if not done since Phase 7 (migration `login_locks`).
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands (the dev checkout does not use `.runtime/`; `./setup-macos.sh` would create it).
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215, LAN), `draftex-dev-throwaway` (3216, dev). E2E uses 3211, restore 3214, server mode 3218. Guide screenshots: `node scripts/e2e-server.ts 3210` then `node scripts/guide-screenshots.ts http://127.0.0.1:3210` (only when the real app is not running).
- Throwaway install test leftovers may exist in `/tmp/draftex-install-test`, `/tmp/draftex-install-data`, `/tmp/draftex-moved` (safe to delete).

## Questions for owner
- Phase 9: add an offline admin password reset command?
- Which code does KSV print on an elective paper: `BP607T` or `BP607T AEC1`?
- How does your father tag COs of elective options? The default is `BP607TAEC1.01`.
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
- [ ] 9 Polish

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
