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
- 2026-11-03 · The owner's local operating-rules file, START_HERE.md and the local tool-settings folder (all listed in `.gitignore`) are git-ignored and stay on the owner's disk · rule forbids naming the tool in tracked files; owner accepted
- 2026-11-03 · Commit-msg regex kept exactly as written; commit messages never name those files or quote trailers · owner accepted; the hook rejected one such message on day one
- 2026-11-03 · Gate 5 (BP702T fidelity) runs locally only and is recorded in handoff; CI runs an invented-text fixture of the same structure · the real fixture is confidential paper text
- 2026-11-03 · SQLite only in v1; Postgres later = separate migrations folder, not an env-var switch · Prisma fixes `provider` per schema and migrations are provider-specific
- 2026-11-03 · Data dir: DB, assets, logs in `%LOCALAPPDATA%\DRAFTEX` (macOS `~/Library/Application Support/DRAFTEX`); exports and backups stay in Documents with a warning if it is cloud-synced · OneDrive/iCloud sync of a live SQLite WAL corrupts it and uploads unreleased papers
- 2026-11-03 · Node 24 LTS (24.22.2), not 22 · Node 22 EOL 2027-04-30; 24 supported to 2028-04-30; 26 is too new for native-module prebuilds
- 2026-11-03 · Runtime compile warnings become notes on the slot and the PDF is still produced; golden tests stay zero-warning · a long chemical name must not block an exam paper
- 2026-11-03 · Templates own font size, geometry and a "show marks per question" option; CO tag default is slot-level · reference papers vary (see facts above)
- 2026-11-03 · Tectonic bundle pinned by explicit URL + checksum or a vendored copy (Phase 1) · default relay URL can change contents and break visual baselines
- 2026-11-03 · Visual regression compares PNGs on ubuntu only; windows verifies clean compile · PDF rasterising differs by OS
- 2026-11-03 · Serialiser fuzz compiles ~50 strings per document and bisects on failure · 1,000 separate compiles is too slow for CI
- 2026-11-03 · Password hashing: argon2id via @node-rs/argon2 plugged into Better Auth · Better Auth defaults to scrypt; @node-rs ships prebuilt binaries (no node-gyp on Windows)
- 2026-11-03 · Reference template date is the placeholder DD/MM/YYYY · the previous value was a real upcoming exam date
- 2026-11-03 · TypeScript 6.0.3, not 7 · typescript-eslint 8.72.1 requires TypeScript < 6.1
- 2026-11-03 · ESLint 10 with npm `overrides` for eslint-plugin-react, -jsx-a11y, -import · ESLint 9 is out of support; the three plugins were verified to run on 10 though their peer range says <= 9
- 2026-11-03 · Prettier never touches docs/, memory.md, handoff.md · it once reformatted them; originals were restored byte-for-byte from the owner's pack
- 2026-11-03 · GitHub Actions pinned to commit SHAs · a moved tag cannot change what runs
- 2026-11-03 · npm 11.19 blocks package install scripts unless approved (`npm install-scripts approve <pkg>`); native deps in later phases (better-sqlite3, sharp, @node-rs/argon2) need explicit approval and must be checked in CI · observed during Phase 0 install

## Pinned versions
Verified against the npm registry / nodejs.org / GitHub releases on 2026-11-03.
- Node 24.22.2 (`.nvmrc`, `engines`), npm 11.19.1 (bundled)
- next 16.4.4 · react 19.3.1 · react-dom 19.3.1
- typescript 6.0.3 · @types/node 24.19.2 · @types/react 19.3.0 · @types/react-dom 19.3.0
- eslint 10.14.0 · eslint-config-next 16.4.4 · prettier 3.9.10
- tailwindcss 4.3.3 · @tailwindcss/postcss 4.3.3
- vitest 5.1.0 · @vitest/coverage-v8 5.1.0 · @playwright/test 1.64.1 (Chromium headless shell 156.0.8078.4)
- actions/checkout v7.0.1 (3d3c42e5) · actions/setup-node v7.1.0 (949feb24) · actions/upload-artifact v7.0.2 (cf430e03)
- Planned, re-verify at phase start: @prisma/client + prisma 7.10.1 (CLI `latest` tag points at 8.0.0-rc.29: do not use) · @prisma/adapter-better-sqlite3 7.10.1 · better-sqlite3 12.11.1 (adapter needs ^12) · better-auth 1.7.15 · @node-rs/argon2 2.2.2 · zod 4.6.7 · @tiptap/* 3.32.2 · mathlive 0.111.4 · pdfjs-dist 6.5.438 · sharp 0.35.5 · @resvg/resvg-js 2.6.2 · pixelmatch 8.0.0 · pngjs 7.0.0 · lucide-react 1.66.0 · shadcn 4.23.0
- Tectonic 0.17.0 (2026-07-27), SHA-256: aarch64-apple-darwin a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667 · x86_64-apple-darwin 7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80 · x86_64-pc-windows-msvc f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f · x86_64-unknown-linux-gnu 1a715688baf591e650c8aeb160ae934e181685eecbb38b317de30b269ac5d606

## Open questions for the owner
- New-format KSV external paper header/layout: none issued yet. Built-in PCI 2026 end-sem template uses old KSV header + PCI groups. Revisit when the first new-format paper appears.
