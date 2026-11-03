# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-03
- **Current phase:** 5 Paper editor: done. Next: Phase 6 Answer keys + exports + files.
- **Branch:** `main` only (Phase 5 merged with `--no-ff` from `phase/5-paper-editor`, tagged `v0.5.0`; the phase branch is deleted locally and on GitHub)
- **Last green commit:** latest `main`
- **CI:** `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, green on the phase branch before the merge.

## Done this session (Phase 5)
- Deviations D22–D27 approved before the phase (memory.md); D27 amended (MathLive fonts bundled by Next).
- Design direction: role tokens in `src/app/globals.css` (contrast figures in its header), shared classes in `src/components/styles.ts`, paper serif for printed content, the "marks margin" signature, nav with current-section underline. Owner approved from screenshots.
- Per-question numbering (`numbering: "QUESTION"` on a group) in the serializer, builder and editor; Pharm.D built-in switched, instructions "Questions 1 and 6 are compulsory."
- Advanced LaTeX permission per user (`User.allowAdvancedLatex`, migration `20261103200000_user_advanced_latex`, People screen toggle, audited). A revoked user may keep but not add blocks.
- Uploads: `src/server/uploads/` (process, store, verify-pdf), `POST /api/assets`, `GET /api/assets/<sha>.<ext>` (owner only). sharp + resvg; PDFs placed once by the real engine at upload.
- Header logos: templates may only show the owner's uploads; copies and papers get their own Asset row (D22). One resolver for both previews: `src/server/images.ts`.
- Papers: snapshot (`src/lib/paper/snapshot.ts`), places checked against it, pictures must be the writer's own, move/duplicate/clear, lab hours to the checker (D18 closed). Commands `src/server/paper-commands.ts`, actions `paper-actions.ts`.
- Preview: `GET /api/papers/[id]/preview` (D23), problems in `X-DX-Problems`, plain-English mapping in `src/lib/paper/problems.ts`, cache by LaTeX hash, fallback that leaves out refused questions.
- Editor: `/papers`, "New paper" on a template page, `/papers/[id]` with outline, question cards (static until clicked, then TipTap), one shared toolbar, "/" menu, MathLive equations, tables, pictures (button, drag, paste), choices with the correct answer, blanks, sub-parts, units, Advanced LaTeX; autosave 1 s with IndexedDB drafts; preview 1.5 s after the last edit; paper-level undo of 50 (D25); Download PDF.
- Credit line "Made by Krishnarajsinh Hitesh Dodiya" in the app footer and on sign-in/setup (owner request; never on papers).
- Tests: unit 650 (was 479), golden 37 + editor fuzz (200 questions), e2e 22 (5 new: gate 9 editor part, gate 8 at the routes).
- `/apple-design` review and `/break-ui` pass run on the editor; findings fixed or logged below. Worst-case seeder: `tests/break-ui/seed-worst-paper.ts`.

## In progress
- Nothing half-done.

## Next steps (Phase 6, Answer keys + exports + files; follow SPEC §13)
1. Session start per the operating rules; branch `phase/6-keys-exports` from `main`.
2. Answer-key editor per slot (D24 moved it here): TipTap for `Slot.answerKey`, `keyCriteria` (split-up marks); the MCQ `choices.correct` already exists.
3. Key PDF in the house style of the `*Keys.tex` references (booktabs/tabularx: No. | Answer | Marks).
4. Export bundle: `exports/<Program>/<CourseCode>/<YYYY-MM-DD> <title>/` with paper.pdf, paper.tex, key.pdf, key.tex, assets/ that compiles standalone (include fix-cm in the bundle's notes; it is in the Tectonic bundle).
5. Duplicate paper (ATKT flow), backup/restore (+ daily and before update, keep 14), restore round-trip e2e (rest of gate 9, D26).
6. Gate 8 for export/backup routes.

## Failing tests
- None.

## Blockers / risks
- **Long chemical names in 2- or 4-column choices** overflow into the next column (e.g. a 60-character IUPAC name: about 68 pt). Breaks after hyphens did not help; the editor shows a note and Columns → 1 is the workaround. Investigate exam.cls choices + multicols line breaking.
- **Phone layout of the editor** is usable for reading but cramped (header wraps, cards narrow). SPEC is desktop-first; library and PDF viewing work on a phone.
- **Same question in two windows** is last-write-wins (memory.md).
- **Wi-Fi demo**: a throwaway copy can run on `0.0.0.0:3215` (`.claude/launch.json` config `draftex-wifi-demo`, test admin from `tests/e2e/support.ts`). It stops when the app's Browser pane closes and its data is deleted on restart. Real LAN mode is Phase 7.
- No pagination in the template library (search and filters instead).
- Carried over: client-sent `x-forwarded-for` before LAN mode (Phase 7); explicit CSRF test for server actions (Phase 7); lockout can be used for denial of service; bundle host `data1b.fullyjustified.net`; Times not offered; `--untrusted` still allows `\input` of absolute paths (always sanitise); first warm-up about 3 minutes; ESLint 10 overrides; `ubuntu-latest` will move to Ubuntu 26; `next telemetry disable` and `npm run db:migrate` in the installer.

## Decisions made (copied to memory.md)
- Design direction approved; D27 amended; per-question numbering details; snapshot contents; last-write-wins per question; upload rules; fix-cm; literal M/mM units; fuzz policy; preview fallback; credit line; throwaway server modes and the Wi-Fi demo rule; no `next dev` during builds.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`, git-ignored). Run `npm run db:migrate` once for the new user migration. Warm-up was re-run this session (fix-cm cached); `npm run setup:tectonic` again is harmless.
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212), `draftex-e2e-2` (3213), `draftex-wifi-demo` (0.0.0.0:3215), `draftex-dev-throwaway` (3216, Next dev mode). All use throwaway data folders.

## Questions for owner
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
- [ ] 6 Answer keys + exports + files
- [ ] 7 Network modes + hardening
- [ ] 8 Installers + docs
- [ ] 9 Polish

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
