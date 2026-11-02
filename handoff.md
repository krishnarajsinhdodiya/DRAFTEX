# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-03
- **Current phase:** 0 Bootstrap: done. Next: Phase 1 LaTeX core.
- **Branch:** `main` (Phase 0 merged with `--no-ff` from `phase/0-bootstrap`, tagged `v0.0.0`)
- **Last green commit:** the `docs: update handoff` commit on `phase/0-bootstrap`, merged into `main`
- **CI:** GitHub Actions `CI` workflow: `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, all green
- **Repo:** github.com/krishnarajsinhdodiya/DRAFTEX, verified **private** on 2026-11-03

## Done this session
- Reviewed SPEC, PCI rules, reference template and reference papers (structure only). The owner accepted every recommendation; all are logged in `memory.md` → Decisions.
- `.gitignore` + `.gitattributes` (LF everywhere; CRLF for .ps1/.bat/.cmd) as the root commit on `main`.
- Commit hygiene: `scripts/commit-hygiene.mjs` holds the rules (forbidden-text regex exactly as the owner specified; author and committer must be the owner). `.githooks/commit-msg` (Node, CommonJS pinned via `.githooks/package.json`) calls it; `git config core.hooksPath .githooks` is set locally. CI job `commit-hygiene` runs `--range <sha>` over all history.
  - Verified live: a commit with a co-author trailer is refused, and the hook also refused one of this session's own messages that quoted the trailer name.
- Tool attribution switched off in the local, git-ignored tool settings (empty commit/pr text, session link off; the boolean `false` form needs a newer tool version than the installed one).
- Scaffold: Next.js 16 App Router, TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`), ESLint 10 flat config (next core-web-vitals + typescript), Prettier, Tailwind 4, Vitest 5 with coverage thresholds for `src/lib/{latex,rules,auth}/**` (inert until those dirs exist), Playwright smoke test against `next start` on 127.0.0.1:3210.
- Node 24.22.2 installed on the Mac via Homebrew as a keg-only package; the system default is still Node 22. Use `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands (or `brew link --overwrite node@24`).
- Gates run locally and in CI (ubuntu + windows): format:check, lint (0 warnings), typecheck, unit (22 tests), build, e2e (2 tests).

## In progress
- Nothing half-done.

## Next steps (Phase 1, LaTeX core; follow SPEC §13 and memory.md decisions)
1. Session start per the owner's operating rules; branch `phase/1-latex-core` from `main`.
2. Tectonic manager: download 0.17.0 per OS, verify the SHA-256 values recorded in memory.md, keep it outside the repo (data dir `tools/`). Pin the bundle explicitly (URL `https://relay.fullyjustified.net/default_bundle_v<N>.tar` + checksum, or a vendored copy); confirm the format version from Tectonic's source before pinning.
3. Compile service: `execFile` with an argument array, `--untrusted`, fresh temp dir per job, 20 s limit, FIFO queue (2 concurrent), cleanup in `finally` + startup sweep.
4. Sanitiser (allow-list) + tests for every forbidden primitive and obfuscated form (gate 7).
5. Serialiser from paper JSON → LaTeX reproducing the reference template structure (`\dxGroupHead`, `\dxQOffset`, single `questions` env); template-level font size/geometry/per-question-marks options; slot-level CO tags.
6. Golden compile tests (gate 3) and visual regression on ubuntu only (gate 4); fuzz 1,000 strings in batches of ~50 per document (gate 6).
7. Gate 5 runs **locally only** (confidential fixture). Record its result here, never commit the fixture.
8. Add `tectonic` caching to CI (`actions/cache`, pinned SHA) so goldens don't refetch packages each run.

## Failing tests
- None.

## Blockers / risks
- npm 11.19 blocks dependency install scripts unless approved. Phase 1/2 native deps (better-sqlite3, sharp, @node-rs/argon2) need `npm install-scripts approve <pkg>`, and that approval must also work in CI on both OSes. Check this first when adding them.
- The Prisma CLI's npm `latest` tag points at 8.0.0-rc.29 (a release candidate). Always install `prisma@7.10.1` explicitly.
- `eslint-config-next` pulls three plugins whose peer range stops at ESLint 9; `package.json` `overrides` force ESLint 10. Re-check when eslint-config-next updates, and drop the overrides once peers include 10.
- GitHub will move `ubuntu-latest` to Ubuntu 26 (notice in the CI log). Watch Playwright `--with-deps` after the switch.
- The owner's original prompt pack is at `~/Downloads/DRAFTEX-pack/` (the source used to restore docs once). `docs/SPEC.md` now differs from it in two neutral-wording lines (§12, §13) and `memory.md` in three lines; the repo copy is authoritative.
- `next` collects anonymous telemetry by default; CI disables it via env. The Phase 8 installer must run `next telemetry disable` on the faculty laptop.

## Decisions made (copied to memory.md)
- All accepted review items: local-only gate 5, SQLite-only v1, data dir in `%LOCALAPPDATA%`, Node 24, runtime warnings as notes, per-template style options, slot-level CO tags, pinned Tectonic bundle, ubuntu-only visual diffs, batched fuzz, argon2id via @node-rs/argon2, root commit on `main`, neutral template date.
- Toolchain: TypeScript 6.0.3, ESLint 10 + overrides, Actions pinned to SHAs, Prettier never touches owner docs.
- The local operating-rules file, START_HERE.md and the local tool-settings folder are git-ignored (kept on the owner's disk).

## Questions for owner
- macOS data location: memory.md assumes `~/Library/Application Support/DRAFTEX` by analogy with the accepted Windows choice. Confirm, or say if you prefer Documents on the Mac.
- Before Phase 1 gate 5: approve `BP702T Apr 26.tex` by filename for the **local-only** fidelity fixture (it is never committed).

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
