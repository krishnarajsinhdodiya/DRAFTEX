# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-13
- **Current phase:** 13 (code blocks, grouped Advanced LaTeX, View LaTeX; D98-D104). Built and green locally; **not merged**: CI cannot run.
- **Branch:** `phase/13-code-blocks` (pushed). `main` = v0.12.0 + the 13-16 plan. `fix/setup-honest-errors` and `fix/network-restart-windows` are pushed, not merged, also waiting for CI (untouched this session).
- **CI:** GitHub Actions refuses every job ("recent account payments have failed or your spending limit needs to be increased"). Nothing merges until the owner fixes billing.
- **Local gates on the branch tip:** lint, typecheck, format, unit 1280 (latex coverage 99.7% lines), golden 99 passed / 28 visual skipped (Linux only), e2e 64 passed (incl. v0.11.0 upgrade export pixel-identical), commit hygiene.

## Done this session
- Code blocks (D98-D102): `codeBlock` node (`attrs.lines`) and `code` mark in the content JSON; rules in `src/lib/latex/code.ts` (ASCII, conversions with notices, tabs → 4 spaces, ≤ 40 lines, width per paper); fancyvrb `Verbatim` with fixed options, loaded only when used (paper and key); number on its own line before leading code; refused in the objective key table; inline code `\texttt{}`; blocklist + warm-up; bank duplicate key includes code.
- Grouping (D103): `\begingroup … \par\endgroup`, tail inside the group (bold style at normal size); no `\par` before display maths or in a table cell. Only `paper:kitchenSink` changed in the v0.11.0 hash file (documented exception; `packages`/`key-packages` are not in that file). kitchenSink, packages, key-packages and the v0.11.0 upgrade export are pixel-identical to before.
- View LaTeX (D104): `GET /api/papers/[id]/latex` (owner only, reviewed CSRF list), dialog from the header (`{} LaTeX`) and each question's `{}` button, paper/key switch, copy.
- Editor: code block node view (numbers, dashed frame-limit rule, live check), Insert + slash menu entries, toolbar inline-code button (Ctrl/Cmd+E, backticks).
- Tests: `tests/unit/latex/code.test.ts`, `tests/unit/server/paper-latex.test.ts`, `tests/golden/code-security.test.ts` (canary, exploit proof, frame width at every nesting level/body size and in the key, 200-block fuzz, grouped-brace fuzz), fixtures `code`/`key-code`, e2e in papers.spec, `tests/break-ui/worst-code.ts`, guide section + screenshot 19.
- **Two findings that overturned the security review** (addendum §6): fancyvrb ends a block at `\end{Verbatim}` *anywhere* in a line (canary leaked when the rule was skipped), so the rule now refuses it anywhere; the line width depends on the template's body size, not only the class size (formula now from measured label widths per Latin Modern design size).
- SPEC §8, §10 gate 3, §13 amended; memory.md as-built notes; performance after recorded.

## In progress
- Nothing half-done in code. Waiting for CI.

## Next steps
1. Session start per the operating rules.
2. When CI runs again: push nothing new first; run CI on `phase/13-code-blocks`. The ubuntu visual job will lack baselines for `code` and `key-code`: take them from its artifact (D4) in a commit that says why. No existing baseline may change; if one does, stop and ask the owner.
3. Also when CI runs: `fix/network-restart-windows` (rerun its Windows job until it fails once, read the `[WebServer]` lines and restart timings, fix), then merge both `fix/` branches and delete them.
4. Once Phase 13 CI is green: merge `--no-ff` to `main`, bump `package.json` to 0.13.0 in the merge, tag `v0.13.0`, push, delete the branch locally and on GitHub, `git ls-remote --heads origin`.
5. Then Phase 14 (table builder, D105-D107) on `phase/14-table-builder`: measure performance first.

## Owner tasks (not code)
- Fix GitHub billing (Settings → Billing and plans). Blocks every merge.
- On the end user's laptop: delete the copied `draftex.local.json` (it names the Mac folder) or replace the copy with a `git clone` into `C:\DRAFTEX`, and time the install.
- Update the Mac and the father's laptop to v0.12.0 (v0.13.0 after merge; no migration).
- Ask the father to try a Python code block and inline code, and check that ASCII-only is enough (roadmap question 4, default taken).
- Still open from the roadmap: questions 2, 3, 5, 6 (blueprint optional groups, more than one CO per question, blueprint scope, other refused commands).
- Carried: firewall helper and a real `update-windows.bat` once on Windows; a CSV from Windows Excel.

## Failing tests
- None locally. `tests/e2e/network.spec.ts` LAN restart on windows-latest (run 42355929142) is still undiagnosed; see step 3.

## Logged, not fixed
- Long inline code cannot hyphenate (typewriter font) and overflows as a note, like an unbreakable chemical name.
- After a code block, a tail starting with Bloom begins with a small space (from `\dxBloom`'s `\ `).
- In the key, a top-level code block's line numbers sit in the left margin (by design of `numbers=left`).
- Carried: `framed` first in a question prints before its number; Windows engine did not write `\openout` to `C:/`; server start sweeps all job folders in `<OS temp>/DRAFTEX`; admin navigation scrolls sideways on a phone; picker shows the newest 50; `bloom-p1`/`key-bloom-p1` baselines predate D70; stale `draftex.lock` pid checks in restore/move-data/reset-password/update/uninstall; question-text overflow on chemical pieces; ubuntu render drift on three old baselines; four-column choice overflow; papers list not paginated.

## Blockers / risks
- CI billing (above).
- The sanitiser and the code-line rule are the only barriers to file access (the engine reads absolute paths). Any new package or block type needs the same engine review, and the fuzz must be run: it found what the written review missed.
- LAN mode is plain HTTP (D40).

## Decisions made (copied to memory.md)
- D98-D104 as built; fancyvrb end-match anywhere; width formula with body size; Verbatim line marker; inline-code quotes; D103 tail/strut details; View LaTeX route; performance after; break-ui findings; baselines pending CI.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`).
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212, built app, fresh folder each start), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215), `draftex-dev-throwaway` (3216, dev). E2E 3211, restore 3214, server mode 3218, fixture server 3219, upgrade spec 3220. Stop the dev server before `npm run build` (shared `.next`).
- Scripts against a fresh `draftex-e2e`: `node scripts/measure-performance.ts http://127.0.0.1:3212`, `node scripts/guide-screenshots.ts …`, `node tests/break-ui/worst-code.ts …` (each needs its own fresh start).

## Questions for owner
- Later: should the app offer Times at all? Should the picker page through more than 50 matches?

## Phase checklist
- [x] 0-12 (see git tags v0.0.0 … v0.12.0)
- [ ] 13 Code blocks, grouped Advanced LaTeX, View LaTeX: built, gates green locally; CI, baselines, merge and tag pending
- [ ] 14 Table builder
- [ ] 15 CO blueprint check
- [ ] 16 Bank search, pages, near-duplicates

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
