# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-03
- **Current phase:** 3 Rules + course catalogue: done. Next: Phase 4 Template library + builder.
- **Branch:** `main` only (Phase 3 merged with `--no-ff` from `phase/3-rules-catalogue`, tagged `v0.3.0`; the phase branch is deleted locally and on GitHub)
- **Last green commit:** latest `main`
- **CI:** `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, all green on the phase branch. CI now also runs `npm run catalogue:check`.

## Done this session (Phase 3)
- Approved deviations D8–D14, logged in `memory.md`. D11 changed during the phase: the catalogue is synced at app startup, not by `db:migrate` (scripts cannot resolve `@/` imports).
- `src/lib/rules/`
  - `rule-set.ts`: imports `docs/pci-rules.json`, validates it with Zod, resolves `$ref` (1 credit → 2-credit pattern), checks its arithmetic, `pciRuleSet()`, `ruleSetById()`.
  - `check.ts`: `checkTemplate(structure, meta, ruleSet)` → `{ errors, warnings, pci, notice? }`.
    - Errors: duplicate part/group keys, empty heading, attempt < 1, attempt > slots, compulsory group with choice, marks ≤ 0, total ≠ max marks.
    - Warnings (each with the printed syllabus page): no pattern for the credits, max marks, duration, missing/extra/repeated group, group shape (variants such as 20 × 1 or 10 × 2 accepted), practical components (synopsis, two perform items, viva), practical credits and the 3 h / 4 h rule.
    - Neutral "No PCI 2026 rule set loaded" for M.Pharm, Pharm.D, projects, internships, synopsis, custom and year-end exams.
  - Coverage: `check.ts` 100% branches, enforced in `vitest.config.ts`; `rule-set.ts` 100%.
- `src/lib/paper/schema.ts`: groups gain an optional `compulsory` flag (D9).
- Prisma migration `20261103120000_catalogue`: new Course fields and `INTERNSHIP` (D10). Applied to the Mac data folder.
- `scripts/parse-syllabus.ts` (`npm run catalogue:parse`, `npm run catalogue:check`):
  - pdf.js reads the PDF; table cells are split on the drawn table rules, so wrapped and page-crossing cells stay whole.
  - Writes `src/lib/catalogue/bpharm-2026.json` (113 courses: 80 plain + 33 elective options; 545 COs; 344 units) and `src/lib/catalogue/table-x.json` (88 rows).
  - The seed carries the PDF's SHA-256 and a `discrepancies` list (11 entries, all confirmed against the PDF).
- `src/lib/catalogue/index.ts`: Zod schema, `bpharmCatalogue()`, `coTag(code, n)`.
- `src/lib/data/courses.ts`: `courses.list/get/getByCode` for any signed-in user; `syncCatalogue` (system only, `data.system.syncCatalogue()`). It adds missing courses, rewrites changed ones in place and never deletes. `src/server/startup.ts` runs it on every start and logs only when something changed.
- Tests: 423 unit tests (was 355).
  - `tests/unit/rules/` (48): rule file, broken-file cases, every checker branch, fixture templates (reference 4-credit = compliant, legacy 75 = Non-PCI, old practical fixture = Non-PCI).
  - `tests/unit/catalogue/` (12): every Table X row present with matching credits, marks and durations; Table IX semester totals; rule-set agreement for theory and practical; hours consistency; numbering; hand spot-checks.
  - `tests/unit/data/courses.test.ts` (8).
- Verified by hand:
  - Every CO's words appear in order in the PDF text (545/545).
  - Unit titles were read through and are reasonable.
  - The built app seeds 113/545/344 on a fresh data folder.
- Gates run locally: format, lint, typecheck, unit + coverage, build (no warnings), golden (11 passed, 7 Linux-only skipped), e2e 10/10, catalogue check.

## In progress
- Nothing half-done.

## Next steps (Phase 4, Template library + builder; follow SPEC §13)
1. Session start per the operating rules; branch `phase/4-template-library` from `main`.
2. Re-verify the planned UI dependency versions (memory.md "Planned"); try layouts with `/prototype`; build with `/apple-design-web` + `/emil-design-eng`.
3. Seed the built-in templates (SPEC §7 list). Run `checkTemplate` on save: errors block saving, warnings show the "Non-PCI" badge with page citations. Pass `labHoursPerWeek` from the course when one is chosen.
4. Fix the old practical fixture in `tests/fixtures/papers/templates.ts` when the PCI practical seed is made: it gives synopsis 5 and two 10-mark perform items, PCI wants 7.5 / 10 / 5 / 7.5.
5. Route-level gate 8 tests for template routes (D6); test the permission table in §7 fully.
6. End with `/apple-design` and `/break-ui` (first full review, D7).

## Failing tests
- None.

## Blockers / risks
- **Unit titles are best effort**:
  - 34 of 344 units have no heading in the PDF and keep an empty title.
  - A few titles carry an appended bold sub-heading (e.g. BP503T units 2 and 4, BP501T unit 5).
  - COs were verified word for word; unit titles were not.
- **Elective codes**: options use the printed code with a space (`BP607T AEC1`). Slot `coTag` allows no spaces, so `coTag()` drops them. Open question for the owner.
- **The syllabus PDF contradicts itself**. See `discrepancies` in the seed and memory.md. Table IX is consistent with Tables I–VIII and X; the "Curricular Structure" page is not.
- **Page numbers**: the rules JSON cites printed pages; the catalogue cites PDF pages (printed + 15). Say which one in any UI text.
- **The catalogue JSON is bundled into the server build** (~210 KB) through `@/lib/data`. This is harmless, but don't import `@/lib/catalogue` from client components.
- Carried over:
  - LAN mode must fix the client-sent `x-forwarded-for` before Phase 7 ships.
  - An explicit CSRF/Origin test is needed in Phase 7.
  - Lockout can be used for denial of service and reveals that an account exists (accepted).
  - No route-level gate 8 tests yet (D6).
  - Bundle host `data1b.fullyjustified.net`.
  - Times font not offered.
  - `--untrusted` still allows `\input` of absolute paths (always sanitise).
  - EXIF and ICC stripping in Phase 5.
  - First warm-up takes about 3 minutes.
  - ESLint 10 overrides.
  - `ubuntu-latest` will move to Ubuntu 26.
  - `next telemetry disable` in the installer.
  - The installer must run `npm run db:migrate` after `npm ci`.

## Decisions made (copied to memory.md)
- D8–D14 as approved, with D11 moved to startup sync.
- Catalogue files, `catalogue:check` in CI, the page-number convention, the PDF contradictions, best-effort unit titles, and the `coTag` format.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`, git-ignored). It holds `tools/` (Tectonic) and `data.db`, migrated to `20261103120000_catalogue` with no users yet. The courses are added the first time the app starts.
- Node 24: run `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands.
- `.claude/launch.json` (git-ignored) has a `draftex-e2e` preview on port 3212 with a throwaway data folder.

## Questions for owner
- Which code does KSV print on an elective paper: `BP607T` or `BP607T AEC1`?
- How does your father tag COs of elective options? The default is `BP607TAEC1.01`.
- Later: should the app offer Times at all, given that it needs extra work to compile without warnings?

## Phase checklist
- [x] 0 Bootstrap
- [x] 1 LaTeX core
- [x] 2 Data + auth
- [x] 3 Rules + course catalogue
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
