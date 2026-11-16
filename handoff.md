# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-16
- **Current phase:** 15 merged to `main` and tagged v0.15.0 on local gates only (D124; owner: "Merge on local gates"). Next: Phase 16.
- **Branch:** `main` (v0.15.0). `phase/15-co-blueprint` deleted locally and on GitHub. `fix/setup-honest-errors` and `fix/network-restart-windows` untouched, still waiting for CI.
- **CI:** GitHub Actions still refuses every job (billing).
- **Local gates on the branch tip:** lint, typecheck, format, unit 1378, golden 121 passed / 30 visual skipped (Linux only), e2e 69 passed (v0.8.0, v0.10.0, v0.11.0, v0.14.0 upgrades), commit hygiene (hook).

## Done this session
- Performance before and after (memory.md).
- D119-D123 (owner: "Approve, build it"): two CO tags per question/sub-part, stored as `A, B` in the existing `coTag` (as built: no `coTag2` column, reported to the owner); one bracket on paper and key; equal split; bank filter matches either tag; CSV `co 2`; editor second box.
- `fix(latex)`: Bloom after a table or picture starts its own line (owner's screenshot: it overflowed beside the table). Only Bloom papers ending a question in a table/picture change, and those had an overfull line.
- D108-D111: `Blueprint` model + additive migration, data layer (gate 8), pure `coverage()`, Blueprints screens (list, new, edit, share, delete), editor summary check, export warnings.
- Tests: `tests/unit/paper/two-cos.test.ts`, `tests/unit/blueprint/coverage.test.ts`, `tests/unit/data/blueprints.test.ts`, export test, `tests/golden/two-cos.test.ts`, `tests/golden/bloom-after-table.test.ts`, e2e `blueprints.spec.ts` + second CO in `tags.spec.ts`, upgrade fixture v0.14.0, `tests/break-ui/worst-blueprint.ts`.
- Guide: two-CO note, "CO blueprints" section, screenshots 21-22. SPEC §6 and §8 amended.

## In progress
- Nothing half-done in code.

## Next steps
1. Session start per the operating rules.
2. Done 2026-11-16: Phase 15 merged (D124), v0.15.0 tagged and pushed. Update the father's laptop with `update-windows.bat` and check two COs and Blueprints on Windows (D124 relies on it, as D117/D118 did).
3. Owner decision: fix the Bloom overflow when a question's last line is nearly full (see "Logged"); it changes `\dxBloom` in every Bloom paper's LaTeX, so it needs an explicit OK and a byte-identity exception.
4. When CI runs again: CI on main; ubuntu baselines for `code`, `key-code`, `tables`, `key-tables` from the visual artifact (D4); then the two `fix/` branches.
5. Then Phase 16 (D112-D115) on `phase/16-bank-search`: measure performance first.

## Owner tasks (not code)
- Fix GitHub billing.
- Ask the father: do real papers print two COs, and in what form? (Built as `[A, B]`.)
- Carried: delete the copied `draftex.local.json` on the father's laptop or re-clone into `C:\DRAFTEX`; ASCII-only code and the backtick shortcut (his screenshot showed a stray backtick in "`its applications"); roadmap question 6; firewall helper and real `update-windows.bat`; CSV from Windows Excel.

## Failing tests
- None locally.

## Logged, not fixed
- With Bloom on, a question whose last line is nearly full overflows ~20 pt (any CO count, exists on main): `\dxBloom`'s `\ ` break is too loose. Proposed fix: a ragged break before Bloom (`\hfil\penalty50\hskip… \hfilneg`); changes every Bloom paper's LaTeX.
- Two CO tags both at the schema maximum overflow the key heading with Bloom on; real codes fit.
- `scripts/guide-screenshots.ts` fails ~2 runs in 3 at the equation step (dev script).
- Admin navigation scrolls sideways on a phone (carried; one link more).
- Carried from Phase 14: table followed by choices has no gap; no `\cmidrule` under merged booktabs headers; Tab past 30 rows; key answer table on criteria table; long inline code; small space before Bloom after a code block; key code numbers in margin; `framed` before the number; Windows `\openout`; server start sweeps all job folders; picker shows newest 50; `bloom-p1` baselines predate D70; stale lock pid checks; chemical-name overflow; ubuntu drift on three baselines; four-column choice overflow; papers list not paginated.

## Blockers / risks
- CI billing.
- The sanitiser, code-line rule and table generator are the barriers to file access; CO tags reach LaTeX only through `CO_TAGS_RE` (letters, digits, dots, single spaces, ", ").
- LAN mode is plain HTTP (D40).

## Decisions made (copied to memory.md)
- D119-D123 and D119 as built; Bloom-after-table fix; Bloom overflow and max-pair limit found; D108-D111 as built; matching rule; coverage statuses; break-ui; upgrade fixture; guide-script flake; performance before/after with a same-day v0.14.0 comparison.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`).
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212, built app, fresh folder each start), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215), `draftex-dev-throwaway` (3216, dev). E2E 3211, restore 3214, server mode 3218, fixture server 3219, upgrade spec 3220. Stop preview servers before `npm run build`.
- Scripts against a fresh `draftex-e2e` (each needs its own fresh start): `node scripts/measure-performance.ts http://127.0.0.1:3212`, `node scripts/guide-screenshots.ts …` (rewrites every PNG; keep only new ones), `node tests/break-ui/worst-blueprint.ts …`.
- Old-version fixtures: `git worktree add /tmp/dx-vX vX`, `npm ci`, `npm run build`, then `DRAFTEX_DATA_DIR=/Volumes/DRAFTEX/DRAFTEX-data node scripts/e2e-server.ts 3219` inside it (links the engine only), then `node scripts/make-upgrade-fixture.ts http://127.0.0.1:3219 <os tmp>/draftex-e2e-3219 vX` here.

## Questions for owner
- Fix the Bloom near-full-line overflow (changes LaTeX of Bloom papers)?
- Grid header row prints bold, Lines header does not. Keep?
- Later: Times font? Picker beyond 50 matches?

## Phase checklist
- [x] 0-15 (see git tags v0.0.0 … v0.15.0)
- [x] 15 Two COs + CO blueprint check (v0.15.0, local gates only, D124; CI run owed)
- [ ] 16 Bank search, pages, near-duplicates

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
