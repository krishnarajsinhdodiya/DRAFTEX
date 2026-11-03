# memory.md: durable project memory

Append-only log of facts and decisions that must survive across sessions.
One line each: `YYYY-MM-DD · decision · reason`. Supersede, never delete.

## Project facts
- 2026-11-03 · App name DRAFTEX; repo github.com/krishnarajsinhdodiya/DRAFTEX (private) · owner choice
- 2026-11-03 · Owner: Krishnarajsinh Dodiya (dev, macOS). End user: his father, pharmacy faculty at KBIPER (constituent college of Kadi Sarva Vishwavidyalaya, Gandhinagar), on Windows · context
- 2026-11-03 · Internal (sessional) papers use KBIPER header; external (end-sem) papers use KSV header · from reference papers
- 2026-11-03 · Father already writes papers in LaTeX (`exam` class, 12pt, A4, CM). Those sources in `reference_papers/` define house style · from reference papers [SUPERSEDED 2026-11-03 → see "House style varies" below]
- 2026-11-03 · He writes answer keys for external papers, synopsis quizzes before practicals, ATKT copies of papers, and tags COs like `[BP604T.01]` · from reference papers
- 2026-11-03 · PCI 2026 rules exist only for B.Pharm (docs/pci-rules.json, cited pages). M.Pharm and Pharm.D: templates allowed, no rule set · syllabus PDF covers B.Pharm only
- 2026-11-03 · House style varies: `exam` class at 11/11.7/11.9/12pt (internal papers 11pt), ~30 different geometry settings, newtx (Times) in 2 files, CM elsewhere · counted across 56 reference sources
- 2026-11-03 · CO tags sit on individual questions, right-aligned via hand-tuned `\makebox[..][r]`, never on group heading lines (0 of ~45) · counted across reference sources
- 2026-11-03 · 11 sources print per-question marks (`\question[N]` + `\pointsdroppedatright` + `\droppoints`); the date row uses `\uline` (ulem, ULthickness 1pt, ULdepth 1.3ex) · counted across reference sources
- 2026-11-03 · Page-number bug in sources is mostly `\pageref{2}` (3 files), LastPage without the package in 1 · counted across reference sources

## Decisions
- 2026-11-03 · Local-first; modes local / lan / server; secure as if LAN from day one · may be shared on college network later
- 2026-11-03 · SQLite (WAL) via Prisma; Postgres-compatible schema · Windows laptop install simplicity
- 2026-11-03 · Tectonic as LaTeX engine, pinned, warm-up at install · avoids multi-GB TeX Live on Windows
- 2026-11-03 · Vocabulary: Part = KSV "SECTION I/II" halves; Group = PCI question types · avoids "Section" clash
- 2026-11-03 · Validation: broken paper = error (blocks save); non-PCI = warning + "Non-PCI" badge · legacy KSV 75-mark papers are real and needed for ATKT
- 2026-11-03 · Template rules: owner edits/deletes/toggles global; others "Save as new"; delete is soft and papers keep a snapshot · owner requirement
- 2026-11-03 · Live preview: debounce 1.5 s + manual Recompile button; last good PDF stays visible · owner requirement
- 2026-11-03 · Images: PNG/JPG/PDF/SVG upload; SVG converted to PNG; structures come from CorelDRAW exports · owner workflow
- 2026-11-03 · No approval workflow · owner: papers are approved offline after PDF export
- 2026-11-03 · English only · owner
- 2026-11-03 · Commits by owner only; zero tool attribution (settings + hook + CI) · owner requirement
- 2026-11-03 · reference_papers/ is git-ignored (contains unreleased future papers) · exam confidentiality
- 2026-11-03 · Single `questions` environment per paper with per-group number offset · avoids exam.cls duplicate-label warnings seen in hand-written papers
- 2026-11-03 · The owner's local operating-rules file, START_HERE.md and the local tool-settings folder (all listed in `.gitignore`) are git-ignored and stay on the owner's disk · rule forbids naming the tool in tracked files; owner accepted [SUPERSEDED 2026-11-03 → see "Rules files tracked"]
- 2026-11-03 · Commit-msg regex kept exactly as written; commit messages never name those files or quote trailers · owner accepted; the hook rejected one such message on day one
- 2026-11-03 · Gate 5 (BP702T fidelity) runs locally only and is recorded in handoff; CI runs an invented-text fixture of the same structure · the real fixture is confidential paper text
- 2026-11-03 · SQLite only in v1; Postgres later = separate migrations folder, not an env-var switch · Prisma fixes `provider` per schema and migrations are provider-specific
- 2026-11-03 · Data dir: DB, assets, logs in `%LOCALAPPDATA%\DRAFTEX` (macOS `~/Library/Application Support/DRAFTEX`); exports and backups stay in Documents with a warning if it is cloud-synced · OneDrive/iCloud sync of a live SQLite WAL corrupts it and uploads unreleased papers [SUPERSEDED 2026-11-03 → see "Data dir in repo"]
- 2026-11-03 · Node 24 LTS (24.22.2), not 22 · Node 22 EOL 2027-04-30; 24 supported to 2028-04-30; 26 is too new for native-module prebuilds
- 2026-11-03 · Runtime compile warnings become notes on the slot and the PDF is still produced; golden tests stay zero-warning · a long chemical name must not block an exam paper
- 2026-11-03 · Templates own font size, geometry and a "show marks per question" option; CO tag default is slot-level · reference papers vary (see facts above)
- 2026-11-03 · Tectonic bundle pinned by explicit URL + checksum or a vendored copy (Phase 1) · default relay URL can change contents and break visual baselines [SUPERSEDED 2026-11-03 → see "Bundle pin (D1)"]
- 2026-11-03 · Visual regression compares PNGs on ubuntu only; windows verifies clean compile · PDF rasterising differs by OS
- 2026-11-03 · Serialiser fuzz compiles ~50 strings per document and bisects on failure · 1,000 separate compiles is too slow for CI
- 2026-11-03 · Password hashing: argon2id via @node-rs/argon2 plugged into Better Auth · Better Auth defaults to scrypt; @node-rs ships prebuilt binaries (no node-gyp on Windows) [SUPERSEDED 2026-11-03 → see "Auth (D5)"]
- 2026-11-03 · Reference template date is the placeholder DD/MM/YYYY · the previous value was a real upcoming exam date
- 2026-11-03 · TypeScript 6.0.3, not 7 · typescript-eslint 8.72.1 requires TypeScript < 6.1
- 2026-11-03 · ESLint 10 with npm `overrides` for eslint-plugin-react, -jsx-a11y, -import · ESLint 9 is out of support; the three plugins were verified to run on 10 though their peer range says <= 9
- 2026-11-03 · Prettier never touches docs/, memory.md, handoff.md · it once reformatted them; originals were restored byte-for-byte from the owner's pack
- 2026-11-03 · GitHub Actions pinned to commit SHAs · a moved tag cannot change what runs
- 2026-11-03 · npm 11.19 blocks package install scripts unless approved (`npm install-scripts approve <pkg>`); native deps in later phases (better-sqlite3, sharp, @node-rs/argon2) need explicit approval and must be checked in CI · observed during Phase 0 install
- 2026-11-03 · Data dir in repo: all runtime data (DB, assets, exports, backups, logs, config.json) lives in `<repo>/data/` on every OS, git-ignored; code resolves it from the project root at runtime, `DRAFTEX_DATA_DIR` still overrides. Safeguards: no script ever runs `git clean`, update/install scripts never touch `data/`, the app warns if the repo folder is inside OneDrive/iCloud, and docs tell the user that deleting the app folder deletes papers · owner decision: data always stays with the app folder, one dynamic path in code; advisor flagged the deletion and sync risks [SUPERSEDED 2026-11-03 → see "Data dir outside repo"]
- 2026-11-03 · Data dir outside repo: one folder holds all runtime data (DB, assets, exports, backups, logs, config.json, tools). Default `%USERPROFILE%\DRAFTEX-data` on Windows, `~/DRAFTEX-data` on macOS. Resolution order: `DRAFTEX_DATA_DIR` env → `dataDir` in `<repo>/draftex.local.json` (git-ignored pointer file) → OS default. A configured path that does not exist is a startup error (plain-English message, nothing created); the default is created only when no path is configured. Moving: stop app → move folder → update `draftex.local.json` → start; Phase 7 adds an admin "Move data folder" action (copy, verify, then switch). Compile temp dirs stay in the OS temp folder (SPEC §9) · owner reversed the in-repo choice; home folder is outside OneDrive/iCloud Desktop & Documents sync, visible in File Explorer, needs no admin rights, and survives deleting or re-cloning the app folder
- 2026-11-03 · Owner's Mac (dev): data folder is `/Volumes/DRAFTEX/DRAFTEX-data` (sibling of the repo on the external APFS volume), set through `<repo>/draftex.local.json`; folder and pointer created 2026-11-03. Keep until the Phase 7 "Move data folder" action exists. If the volume is not mounted the app must refuse to start · owner choice
- 2026-11-03 · Rules files tracked: the operating-rules file and START_HERE.md are committed and exempt from the no-tool-mention rule (exemption written in the rules file §4); the local tool-settings folder stays git-ignored · owner decision
- 2026-11-03 · Gate 5 fixture approved: `BP702T Apr 26.tex` may be used for the local-only house-style fidelity test; it is never committed and never copied into tracked files · owner approval by filename in chat
- 2026-11-03 · After each merge to `main`, the merged branch is deleted locally and on GitHub; between-phase fixes use short-lived `chore/` or `fix/` branches · owner requirement (operating rules §4, §8; SPEC §13)
- 2026-11-03 · Bundle pin (D1): Tectonic gets `--bundle https://data1b.fullyjustified.net/tlextras-2022.0r0.tar` (the target of the relay's `default_bundle_v33.tar` redirect; format 33, TeX Live 2022) and the app checks the bundle's internal SHA256SUM `6ffe055852f8faf66c0acbe1a7fb27f87b869a90bad1204f3bf4d9683f597c7c` before use; a mismatch is a hard failure. Not vendored · the relay is only a 302, the archive is 2.9 GB and was re-uploaded 2026-08-26; a self-hosted minimal bundle is an open question for Phase 8
- 2026-11-03 · pdflatex fallback deferred to Phase 8 (D2); Phase 1 ships one engine interface with Tectonic only · no TeX Live on the Mac or CI runners, so the path could not be tested
- 2026-11-03 · Gate 5 reference image = the owner's original `BP702T Apr 26.tex` compiled with the pinned Tectonic (D3) · no original PDF exists in reference_papers/
- 2026-11-03 · Visual baselines (gate 4) are rendered by a CI ubuntu job and committed from its artifact (D4) · owner's Mac has no Docker; comparisons run on ubuntu only
- 2026-11-03 · Goldens treat every LaTeX warning, including underfull boxes, as a failure; overfull boxes > 1 pt fail · strict reading of SPEC §10 gate 3
- 2026-11-03 · Tectonic --untrusted blocks shell escape but still lets \input read absolute paths (verified with /etc/hosts); the allow-list sanitiser is the only barrier, so user text never reaches a file primitive unsanitised · security
- 2026-11-03 · Tectonic runs XeTeX with Latin Modern OpenType by default (same look as CM). Text policy: LaTeX specials escaped, listed symbols/Greek mapped to LaTeX, Latin-1 + Latin Extended-A letters pass through, any other character is a named validation error · fuzz-tested (gate 6)
- 2026-11-03 · Times (newtx) is not offered: under XeTeX it emits fontspec/font-size warnings on every compile, which breaks the zero-warning rule; only 2 of 56 reference sources use it · open question for a later phase
- 2026-11-03 · fancyhdr clashes with exam.cls in the pinned bundle ("\lhead already defined"); the generator uses exam's own header/footer commands; warm-up loads fancyhdr in an article document · verified
- 2026-11-03 · Package warm-up must touch every Latin Modern and CM maths design size (4.5-25 pt, all families/series/shapes), every class size and both date-row styles; runtime compiles run offline first and retry online once only on a cache miss · a single 11.7 pt warm-up left lmmono10 and cmmi10 uncached
- 2026-11-03 · Phase 5 upload re-encoding must strip EXIF resolution data and ICC v4 profiles · xdvipdfmx warns on both (seen with sips-made fixtures)
- 2026-11-03 · Group and part headings keep with the next question (\@nobreaktrue, not before the first question), their space-before sits outside exam's \uplevel box so it vanishes at a page top, and the box starts with zero glue · found by gate 5; regenerated reference still matches the hand-written one (0.14%/0.26%)
- 2026-11-03 · Templates may set per-group spaceBefore/spaceAfterHead, negative spacing and header lines whose leading follows their size (ownLeading) · the hand-written papers space long/short groups differently and use unbraced \large
- 2026-11-03 · Gate 5 passes locally: BP702T re-encoded into the legacy layout differs from the original by 2.11% / 1.42% / 0.78% (limit 3%); tuned values live in tests/golden/house-style.test.ts (layout only, no paper text); the original's fancyhdr lines are stripped before compiling it (they print nothing under \pagestyle{empty}) · owner approval of the fixture 2026-11-03
- 2026-11-03 · Setup and other Node scripts are TypeScript run with Node 24 type stripping (`node scripts/x.ts`); modules they import use relative `.ts` imports, no `@/` alias, erasable syntax only (tsconfig allowImportingTsExtensions + erasableSyntaxOnly) · no tsx dependency
- 2026-11-03 · Auth (D5): hand-rolled sessions on the Lucia pattern (random 20-byte token in the cookie, SHA-256 of it as `Session.id`, 7-day idle sliding expiry), argon2id via @node-rs/argon2 (m=19456 KiB, t=2, p=1), `User.passwordHash` as SPEC §6 says; no Better Auth · Better Auth lacks per-account lockout, invites and first-run admin, keeps passwords on its own Account table and pulls telemetry and unused adapters; owner approved
- 2026-11-03 · Gate 8 scope (D6): Phase 2 tests every data-access function with guessed IDs; phases 4–6 add route-level gate 8 tests as template/paper/asset/compile/export routes appear · those routes do not exist in Phase 2; owner approved
- 2026-11-03 · Phase 2 auth screens follow SPEC §12 rules but skip the /apple-design and /break-ui reviews; the first full review is Phase 4 (D7) · five small forms; owner approved
- 2026-11-03 · First-run admin is allowed only when no user exists and the network mode is `local`; the check and insert run in one transaction · stops a LAN client from claiming admin first
- 2026-11-03 · Asset primary key is (ownerId, sha256), not sha256 alone; files on disk stay `assets/<sha256>.<ext>`, stored once · a shared sha256 key lets one teacher's upload collide with or reveal another's (gate 8); owner approved
- 2026-11-03 · Prisma client is generated to `src/generated/prisma` (git-ignored) by `postinstall`; `prisma.config.ts` resolves the database with `peekDataDir()` (never creates a folder); `npm run db:migrate` creates the default data folder, then runs `migrate deploy`; CI sets `CHECKPOINT_DISABLE=1` · no stray folders or files from `prisma generate`; no CLI telemetry
- 2026-11-03 · The database is opened with `fileMustExist`; only migrations create it, and startup refuses to run without it (plain-English message) · a build once created an empty data.db in the owner's data folder before this was added
- 2026-11-03 · Every page renders per request (`dynamic = "force-dynamic"` in the root layout) · pages depend on the signed-in user; prerendering touched the database at build time
- 2026-11-03 · `CompileJob.id` is an autoincrement integer · "keep newest 20" was wrong when two jobs shared a millisecond (found by test)
- 2026-11-03 · Session cookie `draftex_session` (httpOnly, SameSite=Lax, Secure in server mode, Max-Age 7 d) is re-sent by `src/proxy.ts` on GET page loads; the database row is the authority on idle expiry · server components cannot set cookies
- 2026-11-03 · Next 16 fills `x-forwarded-for` from the socket only when the client sent none (`??=` in base-server.js), so the per-address sign-in/invite limits trust a client header; harmless while only local mode exists, Phase 7 must fix it before LAN mode ships · verified in node_modules/next
- 2026-11-03 · Admin-created accounts and admin password resets set `mustChangePassword`; the user is sent to /change-password until they choose their own · the admin knows the temporary password
- 2026-11-03 · Built-in templates cannot be edited, toggled or deleted through the data layer, by anyone; Phase 4 seeds them directly · SPEC §7 "read-only"
- 2026-11-03 · Admin pages answer 404 to faculty; private records of others answer "not found" to everyone, admins included · SPEC §7 (404 not 403)
- 2026-11-03 · E2E runs the built app on port 3211 with a throwaway data folder (`scripts/e2e-server.ts`), one worker, serial · never touches the real data folder or a running copy on 3210

## Pinned versions
Verified against the npm registry / nodejs.org / GitHub releases on 2026-11-03.
- Node 24.22.2 (`.nvmrc`, `engines`), npm 11.19.1 (bundled)
- next 16.4.4 · react 19.3.1 · react-dom 19.3.1
- typescript 6.0.3 · @types/node 24.19.2 · @types/react 19.3.0 · @types/react-dom 19.3.0
- eslint 10.14.0 · eslint-config-next 16.4.4 · prettier 3.9.10
- tailwindcss 4.3.3 · @tailwindcss/postcss 4.3.3
- vitest 5.1.0 · @vitest/coverage-v8 5.1.0 · @playwright/test 1.64.1 (Chromium headless shell 156.0.8078.4)
- actions/checkout v7.0.1 (3d3c42e5) · actions/setup-node v7.1.0 (949feb24) · actions/upload-artifact v7.0.2 (cf430e03)
- Phase 1 (installed): zod 4.6.7 · pdfjs-dist 6.5.438 (dev for now; preview needs it in Phase 5) · @napi-rs/canvas 1.1.0 · pixelmatch 8.0.0 · pngjs 7.0.0 · @types/pngjs 6.0.5 · actions/cache v6.1.0 (55cc8345)
- Phase 2 (installed, verified 2026-11-03): @prisma/client 7.10.1 · prisma 7.10.1 (CLI `latest` tag points at 8.0.0-rc.29: do not use) · @prisma/adapter-better-sqlite3 7.10.1 · better-sqlite3 12.11.1 (not 13.x: the adapter needs ^12.6) · @types/better-sqlite3 9.6.0 · @node-rs/argon2 2.2.2 · install scripts approved in package.json `allowScripts` for better-sqlite3, prisma, @prisma/engines only
- Planned, re-verify at phase start: @tiptap/* 3.32.2 · mathlive 0.111.4 · sharp 0.35.5 · @resvg/resvg-js 2.6.2 · lucide-react 1.66.0 · shadcn 4.23.0
- Tectonic 0.17.0 (2026-07-27), SHA-256: aarch64-apple-darwin a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667 · x86_64-apple-darwin 7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80 · x86_64-pc-windows-msvc f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f · x86_64-unknown-linux-gnu 1a715688baf591e650c8aeb160ae934e181685eecbb38b317de30b269ac5d606

## Open questions for the owner
- New-format KSV external paper header/layout: none issued yet. Built-in PCI 2026 end-sem template uses old KSV header + PCI groups. Revisit when the first new-format paper appears.
