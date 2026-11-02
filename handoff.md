# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-03
- **Current phase:** 0 Bootstrap: done. Next: Phase 1 LaTeX core.
- **Branch:** `main` only (Phase 0 merged with `--no-ff` and tagged `v0.0.0`; `phase/0-bootstrap` deleted locally and on GitHub; post-phase fixes merged from `chore/track-rules-files`, also deleted)
- **Last green commit:** latest `main` (CI green on ubuntu, windows and commit-hygiene)
- **CI:** GitHub Actions `CI` workflow: `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, all green
- **Repo:** github.com/krishnarajsinhdodiya/DRAFTEX, verified **private** on 2026-11-03

## Done this session
- Reviewed SPEC, PCI rules, reference template and reference papers (structure only). The owner accepted every recommendation; all are logged in `memory.md` → Decisions.
- `.gitignore` + `.gitattributes` (LF everywhere; CRLF for .ps1/.bat/.cmd) as the root commit on `main`.
- Commit hygiene: `scripts/commit-hygiene.mjs` holds the rules (forbidden-text regex exactly as the owner specified; author and committer must be the owner). `.githooks/commit-msg` (Node, CommonJS pinned via `.githooks/package.json`) calls it; `git config core.hooksPath .githooks` is set locally. CI job `commit-hygiene` runs `--range <sha>` over all history.
  - Verified live: a commit with a co-author trailer is refused, and the hook also refused one of this session's own messages that quoted the trailer name.
- After Phase 0: the operating-rules file and START_HERE.md are now tracked (exemption in its §4); branch-deletion rule added to its §4/§8 and SPEC §13; runtime-data ignore patterns anchored to the repo root so `src/lib/data/` is not ignored.
- Tool attribution switched off in the local, git-ignored tool settings (empty commit/pr text, session link off; the boolean `false` form needs a newer tool version than the installed one).
- Scaffold: Next.js 16 App Router, TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`), ESLint 10 flat config (next core-web-vitals + typescript), Prettier, Tailwind 4, Vitest 5 with coverage thresholds for `src/lib/{latex,rules,auth}/**` (inert until those dirs exist), Playwright smoke test against `next start` on 127.0.0.1:3210.
- Node 24.22.2 installed on the Mac via Homebrew as a keg-only package; the system default is still Node 22. Use `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands (or `brew link --overwrite node@24`).
- Gates run locally and in CI (ubuntu + windows): format:check, lint (0 warnings), typecheck, unit (22 tests), build, e2e (2 tests).

## In progress
- Nothing half-done.

## Next steps (Phase 1, LaTeX core; follow SPEC §13 and memory.md decisions)
1. Session start per the owner's operating rules; branch `phase/1-latex-core` from `main`.
2. Tectonic manager: download 0.17.0 per OS, verify the SHA-256 values recorded in memory.md, store it under `<dataDir>/tools/`. Pin the bundle explicitly (URL `https://relay.fullyjustified.net/default_bundle_v<N>.tar` + checksum, or a vendored copy); confirm the format version from Tectonic's source before pinning.
3. Compile service: `execFile` with an argument array, `--untrusted`, fresh temp dir per job, 20 s limit, FIFO queue (2 concurrent), cleanup in `finally` + startup sweep.
4. Sanitiser (allow-list) + tests for every forbidden primitive and obfuscated form (gate 7).
5. Serialiser from paper JSON → LaTeX reproducing the reference template structure (`\dxGroupHead`, `\dxQOffset`, single `questions` env); template-level font size/geometry/per-question-marks options; slot-level CO tags.
6. Golden compile tests (gate 3) and visual regression on ubuntu only (gate 4); fuzz 1,000 strings in batches of ~50 per document (gate 6).
7. Gate 5 runs **locally only**. The owner approved `reference_papers/…/BP702T Apr 26.tex` as the fixture source (2026-11-03). Build the fixture under a git-ignored path, record the result here, never commit it or copy its text.
8. Add `src/lib/paths.ts` per memory.md "Data dir outside repo": order `DRAFTEX_DATA_DIR` → `dataDir` in `<repo>/draftex.local.json` (Zod-validated; repo root found from the module location, not `process.cwd()`) → default `%USERPROFILE%\DRAFTEX-data` / `~/DRAFTEX-data` via `os.homedir()`. A configured-but-missing path throws a plain-English error and creates nothing. Unit-test every branch on mac and Windows; add `draftex.local.example.json`. Compile temp dirs stay under the OS temp folder per SPEC §9.
9. Add `tectonic` caching to CI (`actions/cache`, pinned SHA) so goldens don't refetch packages each run.

## Failing tests
- None.

## Blockers / risks
- npm 11.19 blocks dependency install scripts unless approved. Phase 1/2 native deps (better-sqlite3, sharp, @node-rs/argon2) need `npm install-scripts approve <pkg>`, and that approval must also work in CI on both OSes. Check this first when adding them.
- The Prisma CLI's npm `latest` tag points at 8.0.0-rc.29 (a release candidate). Always install `prisma@7.10.1` explicitly.
- `eslint-config-next` pulls three plugins whose peer range stops at ESLint 9; `package.json` `overrides` force ESLint 10. Re-check when eslint-config-next updates, and drop the overrides once peers include 10.
- GitHub will move `ubuntu-latest` to Ubuntu 26 (notice in the CI log). Watch Playwright `--with-deps` after the switch.
- The original prompt pack in `~/Downloads` is gone; git is now the only copy of the operating rules, START_HERE.md, SPEC and the rules. Repo copies are authoritative.
- Data lives outside the repo (default `~/DRAFTEX-data`). The pointer file `draftex.local.json` is git-ignored, so a fresh clone falls back to the default: Phase 8 install/update scripts must preserve or recreate it, and the startup check must never mistake a missing configured folder for a first run.
- `next` collects anonymous telemetry by default; CI disables it via env. The Phase 8 installer must run `next telemetry disable` on the faculty laptop.

## Decisions made (copied to memory.md)
- All accepted review items: local-only gate 5, SQLite-only v1, data dir in `%LOCALAPPDATA%`, Node 24, runtime warnings as notes, per-template style options, slot-level CO tags, pinned Tectonic bundle, ubuntu-only visual diffs, batched fuzz, argon2id via @node-rs/argon2, root commit on `main`, neutral template date.
- Toolchain: TypeScript 6.0.3, ESLint 10 + overrides, Actions pinned to SHAs, Prettier never touches owner docs.
- The local operating-rules file, START_HERE.md and the local tool-settings folder are git-ignored (kept on the owner's disk).

## Machine setup (owner's Mac)
- Data folder: `/Volumes/DRAFTEX/DRAFTEX-data` (exists, empty). Pointer: `draftex.local.json` in the repo root (git-ignored) with `{"dataDir": "/Volumes/DRAFTEX/DRAFTEX-data"}`. Phase 1 `paths.ts` must honour it; do not recreate or overwrite the file.
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands.

## Questions for owner
- None open. (Answered 2026-11-03: data folder outside the repo at `~/DRAFTEX-data` by default, movable via `draftex.local.json`; gate 5 fixture `BP702T Apr 26.tex` approved for local use.)

## Phase checklist
- [x] 0 Bootstrap
- [ ] 1 LaTeX core
- [ ] 2 Data + auth
- [ ] 3 Rules + course catalogue
- [ ] 4 Template library + builder
- [ ] 5 Paper editor
- [ ] 6 Answer keys + exports + files
- [ ] 7 Network modes + hardening
- [ ] 8 Installers + docs
- [ ] 9 Polish

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
