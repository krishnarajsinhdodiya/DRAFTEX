# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-03
- **Current phase:** 1 LaTeX core: done. Next: Phase 2 Data + auth.
- **Branch:** `main` only (Phase 1 merged with `--no-ff` from `phase/1-latex-core`, tagged `v0.1.0`; the phase branch is deleted locally and on GitHub)
- **Last green commit:** latest `main`
- **CI:** `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, all green. Each OS job now also installs Tectonic, warms the cache (restored by `actions/cache`) and runs `npm run test:golden`.

## Done this session (Phase 1)
- Approved deviations D1–D4 logged in `memory.md`: bundle pinned by direct archive URL + digest; pdflatex fallback deferred to Phase 8; gate 5 reference compiled from the original source; visual baselines come from CI ubuntu.
- `src/lib/paths.ts`: data folder resolved from `DRAFTEX_DATA_DIR` → `draftex.local.json` → `~/DRAFTEX-data`. A configured folder that is missing is an error and nothing gets created. `draftex.local.example.json` added. 100% covered.
- `src/lib/latex/`:
  - `pins.ts`: Tectonic 0.17.0 assets + SHA-256; bundle URL and digest.
  - `tectonic.ts`: download, verify and install (system tar; `System32\tar.exe` on Windows); install marker; upstream bundle digest read by HTTP range request; offline cache check.
  - `engine.ts`: `execFile` with `--untrusted --keep-logs --bundle <pin> [--only-cached]`, minimal environment.
  - `compile.ts`: temp folder per job under `os.tmpdir()/DRAFTEX/<user>/<job>`, FIFO queue (2 at a time), per-user rate limit, 20 s and 20 MB limits, cleanup in `finally` plus `sweep()`. Compiles offline first and retry online once on a cache miss. `supersedeKey` lets a newer compile cancel a queued older one; diagnostics map to slots by line.
  - `log.ts`: parses stderr (`file:line`, `caused by:`) and the .log (LaTeX/package warnings, missing characters). `goldenFailures` allows only overfull boxes of 1 pt or less.
  - `sanitize.ts`: allow-list for maths and Advanced LaTeX (gate 7).
  - `escape.ts` + `serialize.ts`: paper JSON → house-style LaTeX (single `questions` env, `\dxGroupHead`/`\dxGroupHeadAt`, `\dxQOffset`, `%% DX-SLOT` markers, parts, KSV/KBIPER headers, logo, CO tags and marks via `\dxTail`).
  - `warmup.ts`: warm-up documents (packages, fancyhdr in article, every font size, papers for every class size).
- `src/lib/paper/schema.ts`: Zod schemas for template structure/header/style and TipTap-shaped slot content. Phase 4/5 should reuse them.
- `scripts/setup-tectonic.ts` (`npm run setup:tectonic [-- --skip-remote-check]`): installs into `<dataDir>/tools`, checks the bundle digest, warms online, verifies the cache came from the pinned bundle, recompiles offline. Already run on the owner's Mac (`/Volumes/DRAFTEX/DRAFTEX-data/tools`).
- Tests: 246 unit tests (src/lib/latex 99.6% lines / ~96.6% branches). `npm run test:golden` covers:
  - gate 3: 7 compiles with zero warnings, offline;
  - gate 4: baselines in `tests/golden/baselines/`, compared on Linux only;
  - phase exit check: regenerated vs hand-written reference at 0.139% / 0.259% (limit 0.5%);
  - gate 6: fuzz, 809 compiled + 191 refused out of 1,000, plus a self-check of the detector;
  - gate 5: local only.
- Gate 5 (local, `tests/golden/house-style.test.ts`): BP702T re-encoded into the legacy layout differs from the original by **2.11% / 1.42% / 0.78%** (limit 3%). Paper text is read at test time only; renders go to `$TMPDIR/draftex-gate5`. Verified that no paper text is in any tracked file.
- Serialiser bugs found and fixed while tuning against the real paper:
  - group headings could be orphaned at the bottom of a page;
  - space before a heading survived at the top of a page;
  - lengths were rounded to 2 decimals;
  - part titles were not centred;
  - a logo header touched the date row;
  - a long group heading ran into its marks.
- Visual baselines (13 pages, 1.8 MB) rendered by CI ubuntu run 41582044094 and reviewed before commit. Final CI run 41582467802 is green on all three jobs, and the ubuntu baseline comparisons ran (not skipped).

## In progress
- Nothing half-done.

## Next steps (Phase 2, Data + auth; follow SPEC §13 and memory.md)
1. Session start per the operating rules; branch `phase/2-data-auth` from `main`.
2. Re-verify the planned versions (prisma/@prisma/client 7.10.1, never the `latest` tag, which points at 8.0.0-rc; adapter-better-sqlite3; better-sqlite3 12.x; better-auth; @node-rs/argon2). npm 11.19 blocks install scripts: run `npm install-scripts approve <pkg>` for native deps and confirm it works in CI on both OSes first.
3. Prisma schema per SPEC §6 (SQLite, WAL), the database at `dataPaths(getDataDir()).database`; migrations; one data-access layer that enforces ownership; gate 8 authorization tests; first-run admin; invites; sessions; rate limits; admin bootstrap e2e.
4. The paper editor's slot content must keep validating with `docSchema` / `validateSlotContent` from Phase 1. Store `templateSnapshot` using `templateSchema`.
5. When the app starts (Phase 2+), call `CompileService.sweep()` once, and treat `DataDirError` as a plain-English startup failure.

## Failing tests
- None.

## Blockers / risks
- Bundle host: if `data1b.fullyjustified.net` disappears, fresh installs cannot warm up (installed machines keep working offline). Open question for Phase 8: self-host a minimal bundle.
- Times font (newtx) is not offered; two reference sources use it. Needs a warning-free XeTeX setup later.
- `--untrusted` still allows `\input` of absolute paths: never add a code path where user text skips `sanitizeLatex`/`escapeText`.
- Upload re-encoding (Phase 5) must strip EXIF resolution data and ICC v4 profiles, or xdvipdfmx warns.
- First warm-up downloads for about 3 minutes (the fonts document is about 60 s). The Phase 8 installer must run `npm run setup:tectonic` and must show progress.
- Carried over: npm install-script approvals for native deps; Prisma `latest` tag is an RC; ESLint 10 `overrides` for three plugins; `ubuntu-latest` moving to Ubuntu 26; `next telemetry disable` in the installer.
- A visual baseline changes only in a commit that says why. Get new ones from the `golden-ubuntu-latest` artifact (rendered automatically when the Linux golden step fails) and review them before committing.

## Decisions made (copied to memory.md)
- D1–D4 as above; Tectonic is XeTeX + Latin Modern, with the Unicode policy recorded in memory.md; Times dropped for now; fancyhdr warmed in an article document; warm-up covers every font design size; headings keep with the next question; per-group spacing and `ownLeading` header lines; scripts are TypeScript run with Node type stripping.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`, git-ignored). It now holds `tools/tectonic/` and `tools/tectonic-cache/` (about 60 MB).
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands.
- `npm run test:golden` needs `npm run setup:tectonic` to have run once.

## Questions for owner
- None blocking. Later: should the app offer Times at all (two of your papers use it), given that it needs extra work to compile without warnings?

## Phase checklist
- [x] 0 Bootstrap
- [x] 1 LaTeX core
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
