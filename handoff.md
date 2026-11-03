# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-04
- **Current phase:** 6 Answer keys + exports + files: done. Next: Phase 7 Network modes + hardening.
- **Branch:** `main` only (Phase 6 merged with `--no-ff` from `phase/6-keys-exports`, tagged `v0.6.0`; the phase branch is deleted locally and on GitHub)
- **Last green commit:** latest `main`
- **CI:** `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, green on the phase branch before the merge.

## Done this session (Phase 6)
- Deviations D28–D35 approved before the phase (memory.md). D34's "numbering unchanged" is superseded by "Export compaction" (same intent: no gaps).
- About page (owner request mid-session): `/about` with version, engine, who it is made for, the maker's credit; data folder path for admins only; footer link. `package.json` version now follows the phase tag (0.6.0 from this merge).
- Answer keys: `saveSlot` carries `answerKey` + `keyCriteria` (left alone when not sent). Key panel under each written question (`src/app/(app)/papers/[id]/key-panel.tsx`): model answer in the question editor, split-up rows with a running total and mismatch warning; objective questions take the ticked option.
- Key PDF: `src/lib/latex/key.ts` (article, fancyhdr, No. | Answer | Marks for objective groups, Criteria | Marks per question). Preview switch Paper / Answer key (`GET /api/papers/[id]/preview?kind=key`, own queue).
- Export: `POST /api/papers/[id]/export` → `exports/<Program>/<Code>/<YYYY-MM-DD> <title>/` (paper/key pdf+tex, assets, README) and the same as a zip. `src/lib/export/bundle.ts` (compaction, Windows-safe names), `src/server/export.ts`. Warnings → "Export anyway"; errors block.
- Duplicate paper (ATKT flow): dialog in the editor; copies questions and keys, new undated draft, `derivedFromPaperId`. The editor now shows which exam a paper is for.
- Backup/restore: `src/lib/backup/archive.ts` (zip format, checks) and `run.ts` (online SQLite backup, retention, stage, apply with rollback, lock). Admin `/admin/backups` (back up now, download, upload to restore, cancel). Restore is applied at the next start (`src/server/startup.ts`). Scripts `npm run backup [-- --kind before-update]`, `npm run restore -- <zip> [--yes]`.
- fflate 0.8.3 added (only new dependency).
- Tests: unit 710 (was 650), golden 40 + 22 visual on ubuntu (was 36 + 19), e2e 30 (was 22). Gate 9 complete: backup → restore on an empty data folder (both paths) → exported paper.tex/key.tex byte-identical, every PDF page 0 changed pixels. Gate 8 for key preview, export, duplicate and every backup route. Fuzz covers the key. Exported zip compiles standalone (golden).
- `/apple-design` review and `/break-ui` pass on the new screens; findings fixed (see "Review findings").

## Review findings (all fixed unless marked)
- Editor placeholder never rendered (no CSS) → fixed; the answer editor has its own hint.
- Key panel sat between a question and its own notes → moved below them.
- Key summary counted blank rows; long criteria hidden in a one-line field; silent limit at 20 rows → fixed.
- Export success was an information-only modal → inline notice; "Go back" → "Cancel"; failed export lists only the errors.
- Export folder names cut mid-word; two papers with the same title overwrote each other's folder → word-boundary cut; "(2)" folders via `.draftex-paper`.
- Backups: caution style for the confidentiality warning; page promised a Delete it does not have (copy fixed, behaviour is an open question); dates/sizes wrapped on a phone; first daily backup only an hour after setup → now right after setup.
- Logged, not fixed: the Backups list is unpaginated (40 rows tested fine); the restore upload reads the whole file into memory (cap 2 GB).

## In progress
- Nothing half-done.

## Next steps (Phase 7, Network modes + hardening; follow SPEC §13)
1. Session start per the operating rules; branch `phase/7-network-hardening` from `main`.
2. Network modes in `config.json` (local / lan / server), admin switch + restart, LAN banner with URL, Windows Firewall helper (explicit admin action with UAC).
3. Fix client-sent `x-forwarded-for` before LAN mode (memory.md, Next 16 `??=`).
4. Security headers incl. CSP with the documented MathLive exception (D27); explicit CSRF tests for server actions and route handlers (export, restore, previews already check Origin).
5. Audit log review (backups/restores are now logged); security checklist §11 verified item by item in handoff.
6. Decide the "Move data folder" admin action (memory.md "Data dir outside repo").

## Failing tests
- None.

## Blockers / risks
- **Restore needs a restart** (D28). In dev, stop and start the server; Phase 8's start scripts make that one click.
- **Backups and export zips hold unreleased papers in plain zips** (SPEC §11.8); the UI says so; no encryption in v1.
- **Zip bombs**: entry names and declared sizes are checked before unpacking, but a zip that lies about sizes is only caught after inflating (admin-only upload, local mode).
- Carried over: long chemical names in 2/4-column choices overflow; phone layout of the editor is cramped; same question in two windows is last-write-wins; Wi-Fi demo is a throwaway copy only; client-sent `x-forwarded-for` (Phase 7); lockout can be used for denial of service; bundle host `data1b.fullyjustified.net`; Times not offered; `--untrusted` still allows `\input` of absolute paths (always sanitise); first warm-up about 3 minutes; ESLint 10 overrides; `ubuntu-latest` moves to Ubuntu 26; `next telemetry disable` and `npm run db:migrate` in the installer.

## Decisions made (copied to memory.md)
- D28–D35; About page and version rule; export compaction; key saves with the question; split-up rows only for non-objective questions; separate preview queues; `.draftex-paper` folder owner; `draftex.lock`; backup module lint exemption; daily backup timing; audit of backup actions; editor placeholder CSS; restore e2e on port 3214; fflate pinned.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`, git-ignored). No new migration this phase. Backups go to `DRAFTEX-data/backups/`, exports to `DRAFTEX-data/exports/`; the first daily backup is made the next time the app starts.
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212), `draftex-e2e-2` (3213), `draftex-wifi-demo` (0.0.0.0:3215), `draftex-dev-throwaway` (3216, Next dev mode). All use throwaway data folders. The restore e2e uses 3214 for its second server.

## Questions for owner
- Backups made by hand / before an update / before a restore are never pruned and there is no Delete button: keep, prune "before update" to the newest 5, or add Delete?
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
- [ ] 7 Network modes + hardening
- [ ] 8 Installers + docs
- [ ] 9 Polish

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
