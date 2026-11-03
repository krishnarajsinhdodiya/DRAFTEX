# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-03
- **Current phase:** 4 Template library + builder: done. Next: Phase 5 Paper editor.
- **Branch:** `main` only (Phase 4 merged with `--no-ff` from `phase/4-template-library`, tagged `v0.4.0`; the phase branch is deleted locally and on GitHub)
- **Last green commit:** latest `main`
- **CI:** `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, all green on the phase branch.

## Done this session (Phase 4)
- Approved deviations D15–D21 (memory.md). One unapproved choice raised in the report: shadcn/ui is not used through its CLI (see "Questions for owner").
- Data layer
  - `templates.create/update/saveAsNew` run the checker; level-1 errors throw `InvalidTemplateError` with the issues. The rule set follows the program.
  - `templates.list` has `search` and `scope` (ALL / MINE / SHARED / BUILT_IN) and includes the owner's name; `get` does too.
  - `Template.seedKey` (migration `20261103180000_template_seed_key`). `syncBuiltInTemplates` runs at startup and after first-run setup (D15).
  - Bug fixed: Zod 4 fills `.default()` inside `.partial()`. All patches go through `parsePatch`. This also fixed `papers.update`, which reset course, year and status.
- `src/lib/templates/`: `fields.ts` (client-safe schema), `check.ts` (checker plus the `UNPRINTABLE_TEXT` error), `seeds.ts` (12 built-ins), `logos.ts`, `labels.ts`, `preview.ts` (an empty paper with sample header values), `permissions.ts` (which buttons to show).
- Preview: `POST /api/templates/preview` and `GET /api/templates/[id]/preview`, both with an Origin check and an in-memory cache. Code is in `src/server/template-preview.ts`, `previews.ts` and `http.ts`. `src/components/pdf-view.tsx` renders with pdf.js.
- Screens
  - `/templates`: library with search, auto-applying filters, scopes, PCI badges, and "New template" (a copy of the blank built-in).
  - `/templates/[id]`: preview, the PCI differences with printed page numbers, the question outline, and the actions the user is allowed.
  - `/templates/[id]/edit`: the builder. Owner only; it is a 404 for anyone else and for built-ins.
  - Server actions are in `src/server/template-actions.ts` and call `template-commands.ts`.
- The design review and `/break-ui` were both run; all findings were fixed or logged (below).
- Tests:
  - Unit: 479 (was 423). Includes the full §7 permission table through the commands (`tests/unit/server/template-commands.test.ts`), the preview pipeline, the seeds and the sync.
  - Golden: 12 seed previews compile with zero warnings. Visual baselines for them were rendered on CI ubuntu and committed. `practical-p1` changed because the practical fixture now uses the PCI marks (7.5/10/5/7.5).
  - E2E: 16. They cover the library, copying a built-in, the builder (errors, save, undo, unsaved-change warning), stale saves, cross-user 404 on the pages and the preview route, publish/unpublish/delete, and the Origin and sign-in checks on the preview route.
- `tests/break-ui/seed-worst-case.ts` fills a throwaway e2e database with 200 worst-case templates. It refuses paths outside the OS temp folder.

## In progress
- Nothing half-done.

## Next steps (Phase 5, Paper editor; follow SPEC §13)
1. Session start per the operating rules; branch `phase/5-paper-editor` from `main`.
2. Re-verify the planned versions (TipTap, MathLive, sharp, resvg-js) before installing; approve their install scripts in `allowScripts` where needed (sharp).
3. "New paper from this template" on the template page; the paper keeps `templateSnapshot`.
4. Pass the course's lab hours to the checker for practical papers (D18).
5. Asset uploads (Phase 5 item): re-encode, strip EXIF/ICC (memory.md); header logos of user templates must resolve through the template's visibility, not only `BUILT_IN_LOGOS` (`resolveAssets` in `src/server/template-preview.ts`).
6. Per-question numbering (owner decision, memory.md): a group option that numbers each question on its own (Q.1 … Q.10, continuing across groups and sections). Group numbering stays the default. Switch the Pharm.D built-in to it and restore instructions in the "Questions 1 and 6 are compulsory" style. The serializer, checker paths, golden and visual baselines (CI ubuntu, D4) all need updating.
7. Reuse `PdfView` and the preview pattern (debounce, latest wins, last good PDF) for the paper preview with error mapping.

## Failing tests
- None.

## Blockers / risks
- **Numbering**: templates number groups today (Q.1 … Q.4 across two sections). Per-question numbering is decided for Phase 5 (next step 6).
- **Untitled copies**: "New template" creates an "Untitled template" at once. If you leave without editing, it stays in "Mine" until you delete it.
- **No pagination**: the library renders every visible template (212 rows rendered fine). Search and filters are the answer for now.
- **Slow compile**: not simulated in the browser. The 20 s timeout message and the "Making the preview…" state are covered by unit tests and code reading only.
- Unit titles are best effort (34 of 344 have no heading in the PDF).
- Elective codes and CO tags: open questions in memory.md.
- The syllabus PDF contradicts itself (see `discrepancies` in the seed).
- Page numbers: the rules JSON cites printed pages; the catalogue cites PDF pages (printed + 15). The UI says "printed page".
- Carried over:
  - LAN mode must fix the client-sent `x-forwarded-for` before Phase 7.
  - An explicit CSRF/Origin test is still needed for server actions in Phase 7; route handlers now check Origin.
  - Lockout can be used for denial of service and reveals that an account exists (accepted).
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
- D15–D21 as approved.
- `parsePatch` for every patch.
- Class names kept out of "use client" modules.
- `UNPRINTABLE_TEXT` is a level-1 error.
- Builder behaviour (preview timing, undo, unsaved-change warning).
- New template = a copy of the blank built-in.
- The e2e server shares the engine through a link.
- The numbering gap is open.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`, git-ignored). It holds `tools/` (Tectonic) and `data.db`. Run `npm run db:migrate` once for the new `seedKey` migration; the built-ins appear on the next start after the first admin exists.
- Node 24: run `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands.
- `.claude/launch.json` (git-ignored) has a `draftex-e2e` preview on port 3212. It gets a fresh throwaway data folder on every start; the test admin's sign-in is the `ADMIN` entry in `tests/e2e/support.ts` (run `/setup` once per start).

## Questions for owner
- shadcn/ui: keep Radix + our own styles (current), or adopt the shadcn CLI components?
- "New template": create an untitled copy at once (current), or ask for a title first?
- Which code does KSV print on an elective paper: `BP607T` or `BP607T AEC1`?
- How does your father tag COs of elective options? The default is `BP607TAEC1.01`.
- Later: should the app offer Times at all?

## Phase checklist
- [x] 0 Bootstrap
- [x] 1 LaTeX core
- [x] 2 Data + auth
- [x] 3 Rules + course catalogue
- [x] 4 Template library + builder
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
