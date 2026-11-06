# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-06
- **Current phase:** 10 Bloom and CO on the printed paper: done. Next: Phase 11 Question bank + CSV import (brief in `docs/ROADMAP-9-12.md`, WP-D and WP-E).
- **Branch:** `main` only (Phase 10 merged with `--no-ff` from `phase/10-bloom-co`, tagged `v0.10.0`; branch deleted locally and on GitHub)
- **Last green commit:** latest `main` (the v0.10.0 merge run 42244287523 failed once on windows-latest, a browser stall in templates.spec; fixed on `fix/e2e-close-contexts`, merged with CI green)
- **CI:** `commit-hygiene`, `checks (ubuntu-24.04)`, `checks (windows-latest)`, `install (windows-latest)` (gate 10), `upgrade (windows-latest)`.

## Done this session (Phase 10, WP-C)
- **D63–D69 approved** and built (memory.md has each one and how it was built).
- **D63 elective CO tags**: `src/lib/paper/co-tag.ts` (`coTag`, `CO_TAG_RE`, `cleanCoTagInput`); `BP607T AEC1` → `BP607T.01 AEC1`; the rule is a superset of the old one, nothing stored was rewritten; prints with a tie (`BP607T.01~AEC1`).
- **Printing** (`src/lib/latex/serialize.ts`): style `showBloom` (default false). `\dxBloom{(Bloom: X)}` right after the text, then the existing `\dxTail` (CO, marks). With Bloom on, the tail goes before the first choices or sub-parts list. With Bloom off, output is byte-identical to v0.9.0 (checked for all 21 fixture, key and built-in outputs against a `main` worktree).
- **Sub-parts (D65–D67)**: optional `attrs {marks, coTag, bloom}` on the `subPart` node (schema, TipTap node, stored form). They print per sub-part only when one differs from the question (`subPartTags`); sub-part marks print with "show marks per question". Unset values follow the question ("As question"), not a copy (D66 as built, reported to the owner).
- **Key (D68)** (`src/lib/latex/key.ts`): Level column in objective tables; `(Bloom: X) [CO]` after the question number, per sub-part when they differ.
- **Per-paper switch (D64)**: `showBloom` in `paperPatchSchema` rewrites the paper's snapshot style (versioned, audited, Final lock); checkbox "Print Bloom levels" in Details; the template builder's Page section has the default.
- **Warnings**: `src/lib/paper/tags.ts` (`subPartMarksNote`, `missingTags`, `tagSummary`); export warns (never blocks) about missing Bloom/CO while Bloom is on, and about sub-part marks that do not add up; the slot card shows the sub-part note.
- **Summary (D69)**: `papers/[id]/tag-summary.tsx`, a folded panel above the questions (works at every width).
- **Editor**: sub-part view in `src/components/editor/views.tsx` (one line of facts, popover with Marks/CO/Bloom; context from `sub-part-fields.tsx`); inserting sub-parts puts the cursor in (a); Bloom labels in one table `src/lib/paper/bloom.ts`.
- **Tests**: unit 872 (was 831), e2e 53 locally (new `tests/e2e/tags.spec.ts`), golden + new fixtures `bloom` and `key-bloom` with visual baselines from the CI ubuntu artifact (D4); structure fuzz has 10 more batches with Bloom, CO tags and sub-part fields; hostile CO tag fuzz in `tests/unit/paper/tags.test.ts`.
- **Break-ui**: `tests/break-ui/worst-tags.ts` (free-text 29-character tags, marks that do not add up, ten tagged questions) at 1366/900/375 px. Found: sub-part fields took four lines in the editor column, fixed with the popover. Everything else held.
- **After the merge (D70, D71, owner answers)**: with Bloom on, every sub-part line carries its Bloom and CO; "On the group" removed (stored values read as Hidden). On `fix/subpart-tags-group-co`, merged with CI green.
- **Docs**: USER_GUIDE §4 (sub-parts, Print Bloom levels, summary), §6 (export warnings), new screenshot `13-bloom.png`, others taken again; README.
- **Performance**: before p50/p95 16 ms, max 24 ms, preview p50 441 ms; after p50/p95 16 ms, max 24 ms, preview p50 415 ms.
- No migration this phase.

## In progress
- Nothing half-done.

## Logged, not fixed
- Stale `draftex.lock` with a reused process id: start is fixed (checks the app answers), but restore, move-data, reset-password, update-check and uninstall-check still trust the pid alone and would refuse until the next clean start replaces the lock.
- Question text (not only choices) overflows on unsplittable chemical pieces such as `(4-isobutylphenyl)propanoic` in one column, with every option off (pre-existing; D61 covers choices only).
- CI ubuntu renders of three old baselines drift 0.02–0.19% (limit 0.5%) with unchanged LaTeX; baselines not touched (memory.md).
- A free-text CO tag keeps at most 20 characters before the suffix space; longer input is cut (rule-conformant).
- Carried from Phase 9: four-column choices overflow on unsplittable pieces; papers list not paginated; admin navigation scrolls sideways on a phone.

## Next steps (Phase 11, follow docs/ROADMAP-9-12.md WP-D and WP-E)
1. Session start per the operating rules; branch `phase/11-question-bank` from `main`.
2. Plan first: D-numbers from D70, each with cost/risk, including the exact sharing rule for bank questions (private by default; per question or per course; admins see no private entries; gate 8). Wait for "go".
3. Bank questions must carry Bloom and a catalogue CO: reuse `bloomSchema`, `coTagSchema` and `coTag()`; the bank's CO check needs the course's outcomes (`coOptions` in `src/server/paper-commands.ts`).
4. Measure performance before (`node scripts/e2e-server.ts 3212`, then `node scripts/measure-performance.ts http://127.0.0.1:3212`).
5. Phase 11 adds migrations: regenerate the upgrade fixture from v0.10.0 or add one; the CI upgrade job installs the previous tag automatically.

## Owner tasks (not code)
- Install on the father's Windows 11 laptop as a `git clone` into `C:\DRAFTEX` (guide §13) and time it.
- Try the firewall helper once (UAC prompt, rule created, rule removed).
- Try one real `update-windows.bat` with the read-only token.

## Failing tests
- None. Watch: e2e on windows-latest stalled once in Chromium "Create page" (run 42244287523); specs now close their browser contexts after each test. `upgrade.spec.ts` once timed out on windows-latest (run 42240032839, server never answered in 90 s); it now prints the server output if it happens again.

## Blockers / risks
- Not tried on a real Windows machine: double-click flow, Git Credential Manager with the token, real `git pull`, UAC firewall step, `reset-password-windows.bat`. CI covers the scripts headless.
- LAN mode is plain HTTP (D40). Server mode locks out direct access (recovery documented).
- The GitHub token on the end user's machine expires; updates then fail (guide explains renewal).
- Carried: restore needs a restart (D28); same question in two windows is last-write-wins; bundle host `data1b.fullyjustified.net`; Times not offered; `--untrusted` still allows `\input` of absolute paths (Phase 12 security review); ESLint 10 overrides; npm warns about `fsevents` install scripts (harmless).

## Decisions made (copied to memory.md)
- D63–D71, D66 as built (follow, not copy), tail placement with Bloom on, sub-part popover, no migration, question-text chemical overflow, "On the group" question, performance before/after.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`). No migration in Phase 10.
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215), `draftex-dev-throwaway` (3216). E2E 3211, restore 3214, server mode 3218, v0.8.0 fixture server 3219, upgrade spec 3220.

## Questions for owner
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
- [x] 9 Polish + paper retrieval (docs/ROADMAP-9-12.md)
- [x] 10 Bloom and CO on the printed paper
- [ ] 11 Question bank + CSV import
- [ ] 12 Advanced LaTeX packages

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
