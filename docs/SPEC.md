# DRAFTEX — Product & Build Specification

Version 1.0 · 2026-11-03 · Owner: Krishnarajsinh Dodiya
This is the build contract. If code and this file disagree, this file wins
until a decision in `memory.md` changes it. Never silently deviate.

---

## 0. One-paragraph summary

DRAFTEX is a local-first web app for pharmacy faculty to build question-paper
**templates** and fill them into **papers** that compile to PDF through LaTeX.
Its first user is a pharmacy faculty member at K. B. Institute of Pharmaceutical
Education & Research (KBIPER, Gandhinagar), a constituent college of Kadi Sarva
Vishwavidyalaya (KSV). It runs on his Windows laptop and on the developer's Mac.
Later it may be shared with colleagues on the college LAN or moved to a server
with no code changes. Papers must match the house style of the real papers in
`reference_papers/` and the PCI 2026 B.Pharm rules in `docs/pci-rules.json`.

## 1. Users and the jobs they do

| Who | Job |
|---|---|
| Faculty (primary) | Pick a template → click empty question slots → type questions with equations, tables, images → see the PDF update → export PDF + `.tex` + answer key |
| Faculty | Create a template (header, instructions, parts, question groups, marks) and keep it personal or make it global |
| Faculty | Reuse a paper: duplicate it (e.g. regular → ATKT version) and edit |
| Admin (first account) | Create faculty accounts or invite codes, switch network mode, run backup/restore |

The primary user is not a programmer and should never need to see LaTeX.
LaTeX knowledge is optional ("Advanced" panels only).

## 2. What the real papers show (read `reference_papers/` before Phase 1)

The faculty member already writes every paper by hand in LaTeX. His sources
are the ground truth for house style. Observed facts:

- Class `exam`, 12pt, A4, Computer Modern, body at `\fontsize{11.7}{13.9}`.
- **External (KSV)**: centred bold university name → exam title → program +
  semester → `Course Title [CODE]`; one underlined row
  `Date … \hfill Duration … \hfill Max marks …`; small instructions; "Exam No:"
  with a blank at the top right; "Best wishes" + a row of asterisks at the end.
  Some external papers show the KSV logo on the left.
- **Internal (KBIPER)**: KBIPER logo left, "K B Institute of Pharm Education &
  Research / A Constituent College of KSV", program + semester, course
  `(CODE)`, sessional name; "Roll No:" instead of "Exam No:"; page `x/y`
  footer.
- **Course-outcome tags already in use**: group headings carry tags like
  `[BP604T.01]` between the heading and the marks. CO tagging is a current
  habit, not a future feature. Support it in Phase 4 (as a slot/group field).
- Group headings: `Q.1 Answer the following questions.` … `\hfill Marks: 10`.
  Marks style varies: `Marks: 10`, `(10)`, `[10]`. Numbering style varies:
  `Q.1`, `Q:1`.
- MCQs use `\begin{choices}` inside `multicols{2}` (A,B left · C,D right).
  True/False and fill-in-the-blank (`\underline{\hspace{2cm}}`) are mixed with MCQs.
- Practical papers: Q.1 Synopsis · Q.2 "Perform the following practical"
  (numbered experiment list, some with 4 inline sub-options) · Q.3 another
  perform list · Q.4 Viva-voce. No choice rules; examiner allots.
- **Synopsis sheets**: a separate 10-minute, 10-mark MCQ quiz before practicals.
- **Answer keys / marking schemes**: written for every external paper as a
  separate `article` document (booktabs/tabularx tables: No. | Answer | Marks,
  plus split-up criteria per question). Answer keys are in scope for v1.
- **ATKT (supplementary) papers** are made by copying a regular paper.
- **Legacy pattern**: old-scheme KSV externals are out of 75, split into
  SECTION I / SECTION II (separate answer sheets), each with its own objective,
  long and short groups. Old-scheme students sit ATKT exams for years, so the
  legacy pattern must stay supported. It just isn't PCI-2026-compliant.
- Pharm.D (year-end, 70 marks) and M.Pharm papers exist too. They are templates
  like any other. No PCI 2026 rule set is loaded for them.
- Known bug in one source: `\pageref{LastPage}` without `\usepackage{lastpage}`
  prints "??". The generator always loads `lastpage` when it uses it.
- Images in existing papers are logos only. Structure images (CorelDRAW
  exports) are a new capability; make them easy and reliable.

`docs/reference/templates/pci2026-bpharm-endsem-4credit-ksv.tex` is a verified
reference (compiles with pdflatex, 0 warnings). It shows how one `questions`
environment per paper plus a per-group offset avoids exam.cls
"multiply-defined label" warnings that the hand-written papers have. The
generator must produce this structure.

## 3. Vocabulary (use these words in code and UI, never mix them)

- **Template**: reusable structure + header + style. No question text.
- **Paper**: a template snapshot + metadata + filled slots. Compiles to PDF.
- **Part**: optional top level, e.g. KSV's "SECTION I / SECTION II" halves.
  A template has ≥1 part; a single untitled part is the default.
- **Group**: a question block inside a part, e.g. "Q.2 Short answers (any 5)".
  Has type, slot count, attempt count, marks each. PCI's "Section I/II/III"
  map to *groups*, not parts. This naming resolves the clash between PCI's
  and KSV's use of the word "Section".
- **Slot**: one question position inside a group. Holds rich content.
- **Component**: a fixed-mark item in a practical paper (Synopsis, Major,
  Minor, Viva). Modelled as a group with `attempt = slots = 1`, or a list of
  experiments the examiner allots from.
- **Rule set**: machine-readable PCI rules (`docs/pci-rules.json`).

## 4. Scope

### In v1
- Programs: B_PHARM, M_PHARM, PHARM_D (all three selectable; only B_PHARM has a
  PCI 2026 rule set).
- Exam kinds: `SESSIONAL_1`, `SESSIONAL_2`, `SESSIONAL_IMPROVEMENT`,
  `END_SEMESTER`, `YEAR_END` (Pharm.D), `SUPPLEMENTARY_ATKT`,
  `PRACTICAL_SESSIONAL`, `PRACTICAL_END`, `SYNOPSIS`, `CUSTOM`.
- Template library, template builder, paper editor with live PDF preview,
  answer key, exports, backup/restore, accounts, network modes, installers.
- B.Pharm course catalogue seeded from the syllabus PDF (code, title, semester,
  credits, L-T-P, course outcomes, units with hours).
- CO tag and Bloom level as optional fields on every slot. They are stored and
  displayed, with no analytics yet.

### Not in v1 (design for, don't build)
Question bank with reuse/search, auto-generation, old-paper import from `.tex`,
CO-attainment analytics, M.Pharm/Pharm.D PCI rule sets, multilingual papers,
approval workflow (explicitly not wanted), research project / internship
evaluation sheets.

## 5. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js 22 LTS | Same on Windows/macOS/Linux |
| Framework | Next.js (App Router, current stable) + TypeScript strict | Server Actions + route handlers; Zod on every input |
| UI | Tailwind CSS + shadcn/ui + Lucide | Design rules in §12 |
| Editor | TipTap (ProseMirror) | Custom nodes, §8 |
| Math input | MathLive | Outputs LaTeX; passes the sanitiser |
| PDF preview | pdf.js | Keeps last good PDF on screen |
| DB | SQLite via Prisma, WAL mode | `DATABASE_URL` can switch to Postgres in `server` mode; no SQLite-only SQL |
| Auth | Better Auth (email + password, DB sessions), or hand-rolled sessions per the Lucia guide if Better Auth doesn't fit | argon2id hashes; verify current versions before choosing and record the decision |
| LaTeX | **Tectonic** (per-OS binary, version pinned) | Self-contained; fetches packages once, then works offline from its cache. Fallback: system `pdflatex` if configured |
| Images | sharp (raster), resvg-js (SVG → PNG at 300 DPI) | PDF images included as-is after validation |
| Tests | Vitest (unit), Playwright (e2e), golden PDF tests (§10) | |
| CI | GitHub Actions: ubuntu + windows matrix | lint, typecheck, unit, compile goldens, e2e smoke |

### Data directory (outside the repo)
- Windows: `%USERPROFILE%\Documents\DRAFTEX\` · macOS: `~/Documents/DRAFTEX/`
- Override with `DRAFTEX_DATA_DIR`.

```
DRAFTEX/
  data.db              SQLite (WAL)
  assets/<sha256>.<ext> uploaded images, content-addressed
  exports/<Program>/<CourseCode>/<YYYY-MM-DD> <Paper title>/
      paper.pdf  paper.tex  key.pdf  key.tex  assets/   ← compiles standalone
  backups/DRAFTEX-backup-<timestamp>.zip
  logs/
  config.json          network mode, port, admin settings
```
The faculty member must be able to find his PDFs in File Explorer without the app.

## 6. Data model (Prisma, normalised from day one)

Names are binding; fields may be added.

- `User` id, name, email (unique), passwordHash, role (`ADMIN`|`FACULTY`),
  institution, isActive, createdAt.
- `Session`, `InviteCode` (per auth library).
- `Course` code (unique), title, program, semesterOrYear, courseKind
  (`THEORY`|`PRACTICAL`|`PROJECT`), credits, lectureHrs, tutorialHrs,
  practicalHrs, maxMarks, sessionalMarks, endSemMarks, endSemMinutes, ruleSetId?.
- `CourseOutcome` courseId, number, text → tag renders as `BP604T.01`
  (format configurable).
- `CourseUnit` courseId, number, title, hours.
- `Template` id, title, description, ownerId, visibility (`PRIVATE`|`GLOBAL`),
  program, examKind, courseKind, creditTier?, ruleSetId?, durationMinutes,
  maxMarks, `structure` (JSON, §7, Zod-validated), `style` (JSON),
  `header` (JSON), derivedFromId?, deletedAt?, createdAt, updatedAt, version.
- `Paper` id, ownerId, templateId? (nullable; the template may be deleted),
  `templateSnapshot` (JSON copy of structure+style+header at creation),
  title, courseId?, courseCode, courseTitle, program, semesterOrYear,
  examKind, academicYear, examDate?, instructions override, status
  (`DRAFT`|`FINAL`), derivedFromPaperId?, createdAt, updatedAt, version.
- `Slot` id, paperId, partKey, groupKey, position, content (TipTap JSON),
  marks (default from group), coTag?, bloomLevel? (`REMEMBER`…`CREATE`),
  answerKey (TipTap JSON)?, keyCriteria (JSON)?, `questionId?` (future bank).
- `Question` (empty in v1: the future bank; Slot can reference it later).
- `Asset` sha256 (pk), ownerId, mime, bytes, width, height, originalName.
- `CompileJob` id, paperId, kind (`PAPER`|`KEY`), status, durationMs,
  errorSummary, createdAt (keep last 20 per paper).
- `AuditLog` actorId, action, entity, entityId, at.

Optimistic concurrency: `version` on Template and Paper; saves with a stale
version are rejected with a clear message.

## 7. Template structure and validation

```ts
structure = {
  numbering: { prefix: "Q.", separator: "" } ,      // "Q.1" | "Q:1"
  marksStyle: "MARKS_COLON" | "PARENS" | "BRACKETS",
  parts: [{
    key, title?: "SECTION I", separateAnswerSheet: boolean,
    groups: [{
      key, type: "OBJECTIVE"|"SHORT"|"LONG"|"SHORT_NOTE"|"PRACTICAL_PERFORM"
                 |"SYNOPSIS"|"VIVA"|"FREE",
      heading: "Answer the following questions (Any five).",
      slots: 7, attempt: 5, marksEach: 4,             // marks may be 7.5
      objectiveLayout?: "TWO_COLUMN" | "ONE_COLUMN" | "FOUR_COLUMN",
      showCoTag: "NONE"|"GROUP"|"SLOT"
    }]
  }],
  footer: { text: "Best wishes", ornament: "ASTERISKS" | "NONE" }
}
header = { lines: [...placeholders: {{university}} {{institute}} {{examTitle}}
  {{programLine}} {{courseTitle}} {{courseCode}} {{date}} {{duration}}
  {{maxMarks}}], logoLeft?: assetId, logoRight?: assetId,
  candidateField: "EXAM_NO"|"ROLL_NO"|"SEAT_NO"|"NONE", instructions: string[],
  pageNumbers: "NONE"|"X_OF_Y" }
```

**Validation has two levels (decided):**
1. **Errors block saving** because the paper itself would be wrong:
   `attempt > slots`, `attempt < 1`, marks ≤ 0, Σ(attempt × marksEach) ≠
   `maxMarks`, empty heading, duplicate keys, a compulsory group whose
   attempt ≠ slots.
2. **Warnings allow saving**: the paper is valid but differs from the PCI
   rule set for (program, examKind, credits). Examples: wrong max marks,
   group counts, duration. The template then shows a **Non-PCI** badge with
   a list of differences and the cited page. M.Pharm/Pharm.D show
   "No PCI 2026 rule set loaded" (neutral, not a warning).

Group order is **not** enforced. PCI lists types, not order, and KSV papers
put long answers before short.

The checker is a pure function `checkTemplate(structure, meta, ruleSet) →
{errors[], warnings[]}` with 100% branch coverage, reading only
`docs/pci-rules.json` (copied to `src/rules/` at build).

### Template permissions (decided)
| Action | Owner | Other user | Admin |
|---|---|---|---|
| View / use GLOBAL | ✓ | ✓ | ✓ |
| View / use PRIVATE | ✓ | ✗ (404, not 403) | ✗ |
| Edit in place | ✓ | ✗ → must "Save as new" (new owner, `derivedFromId` set, PRIVATE by default) | ✗ (same as other user) |
| Toggle PRIVATE/GLOBAL | ✓ | ✗ | ✓ (can unpublish only) |
| Delete | ✓ (soft delete; papers keep their snapshot) | ✗ | ✓ |

Papers are always private to their owner in v1.

### Seed templates (GLOBAL, owner = system admin, marked "Built-in", read-only)
1. PCI 2026 · B.Pharm · Theory · End-Semester · 4 / 3 / 2-1 credits (KSV header). Use
   the reference `.tex` as the visual target.
2. PCI 2026 · B.Pharm · Theory · Sessional · 4 / 3 / 2-1 credits (KBIPER header).
3. PCI 2026 · B.Pharm · Practical · Sessional (10) and End-Semester (30).
4. PCI 2026 · B.Pharm · Synopsis (10 × 1, 10 minutes).
5. KSV Legacy · External · 75 marks · Section I/II (from `reference_papers/`).
6. KSV Pharm.D · Year-End · 70 marks (from `reference_papers/`).
7. Blank template.
Built-ins can't be edited; "Save as new" is the way to change them.

## 8. Paper editor

- Layout: left = outline (parts → groups → slots with filled/empty state and
  running marks total); centre = the paper as editable cards in print order;
  right = PDF preview (resizable, collapsible).
- Clicking an empty slot focuses a TipTap editor in place. Toolbar + slash
  menu: **Equation** (inline/display, MathLive), **Table** (rows/cols,
  header row, booktabs style), **Image** (upload/drag/paste; PNG, JPG, PDF,
  SVG; CorelDRAW exports PNG or PDF best), **Choices** (A–D, 2/4 column),
  **Blank line**, **Sub-parts** (a)(b)(c), **Bold/Italic/Sub/Superscript**,
  **Units** (siunitx), **Advanced LaTeX** (off by default, admin-enabled per
  user, sanitised).
- Per slot: marks (defaults from group; overriding shows a warning if the
  group total changes), CO tag dropdown (from the course's COs), Bloom level,
  answer-key editor (collapsible), "Move", "Duplicate", "Clear".
- Autosave 1 s after typing stops, with an undoable history (at least 50 steps).
  Never lose text: draft also kept in IndexedDB until the server confirms.
- **Live preview (decided)**: recompile 1.5 s after the last edit (debounced,
  latest-wins: a newer edit cancels a queued older compile); a
  **Recompile** button always works; show "Compiling…", the last good PDF
  stays visible; errors map to the slot that caused them (via `%% DX-SLOT`
  markers and the log's line numbers) and appear on that slot in plain
  English ("Equation in Q.2(3) has an unmatched brace") with the raw log
  behind a disclosure.
- MCQ answer: a radio on the choices sets the key automatically.

### TipTap → LaTeX serialiser (most error-prone component)
- Pure, deterministic, unit-tested per node type; escapes `\ { } $ & # ^ _ % ~`
  and smart quotes (`"x"` → ``` ``x'' ```); keeps Unicode safe for pdfTeX/Tectonic
  (map °, µ, ±, ×, →, ≤, ≥, α–ω to LaTeX). Unknown character → error, never garbage.
- Math and Advanced LaTeX pass a **sanitiser** that rejects:
  `\input \include \openin \openout \read \write \immediate \catcode \def
  \let \csname \usepackage \documentclass \special \directlua \write18
  \loop \jobname \endinput \makeatletter`, `^^` escapes, and anything over
  4 KB per snippet. Allow-list approach for math commands.
- Output must reproduce the reference template's structure (single
  `questions` environment, `\dxGroupHead`, `\dxQOffset`).

## 9. LaTeX compile service

- Tectonic invoked with `execFile` (never a shell), arguments as an array,
  `--untrusted` (disables shell-escape and insecure features), `-Z
  continue-on-errors` OFF, in a fresh temp dir per job under the OS temp
  folder: `DRAFTEX/<userId>/<jobId>/`. Only the generated `.tex` and the
  referenced assets (copied by hash) are in that dir.
- Limits: 20 s wall clock (first run may need longer to fetch packages;
  warm-up at install), output ≤ 20 MB, max 2 concurrent jobs (configurable),
  FIFO queue, per-user rate limit.
- Cleanup temp dirs always (finally-block + startup sweep).
- Package warm-up at install compiles a document that loads every package
  used: exam, geometry, graphicx, multicol, amsmath, amssymb, siunitx, booktabs,
  tabularx, array, enumitem, fancyhdr, lastpage, ulem, xcolor, tikz,
  tcolorbox, newtx. After warm-up the app works offline.
- `pdflatex` fallback path uses `-no-shell-escape -interaction=nonstopmode
  -halt-on-error` and `openin_any=p`/`openout_any=p` env.

## 10. Quality gates ("zero errors" means these all pass)

A phase is **done** only when every gate below that applies is green locally
**and** in CI, and the phase checklist in §13 is ticked in `handoff.md`.

1. `npm run lint` and `npm run typecheck`: zero errors, zero warnings.
2. Unit tests pass; coverage ≥ 90% for `src/lib/latex/**`, `src/lib/rules/**`,
   `src/lib/auth/**`; 100% branch coverage for the PCI checker.
3. **Golden compile tests**: every seed template + fixture papers compile with
   Tectonic with **zero LaTeX errors and zero warnings** (overfull boxes
   > 1 pt count as failures).
4. **Visual regression**: render generated PDFs to PNG (pdf.js or pdftoppm),
   compare to committed baselines with pixelmatch; >0.5% changed pixels =
   fail. A baseline only changes in a commit whose message says why.
5. **House-style fidelity**: a fixture that encodes
   `reference_papers/…/BP702T Apr 26.tex` content into the Legacy template
   must render visually close to the original PDF (≤ 3% pixel diff at 100 DPI).
   Tune spacing until it passes, then lock as baseline. (Fixture lives in
   `tests/fixtures/`. Ask before committing any paper text; see §11 rule 9.)
6. **Serialiser fuzz**: 1,000 random strings incl. every special char and
   emoji → output always compiles or yields a clean validation error.
7. **Sanitiser tests**: every forbidden primitive is rejected, including
   obfuscated forms (`\csname input\endcsname`, `^^5cinput`).
8. **Authorization tests**: user A cannot read, list, compile, export, edit
   or delete B's private templates/papers/assets by any route (IDs guessed).
9. **E2E (Playwright)**: first-run admin setup → create user → login →
   duplicate built-in template → fill 4-credit end-sem paper incl. equation,
   table, image → PDF downloads → backup → restore on empty data dir →
   paper still compiles identically.
10. Windows CI job runs the install script, starts the app, and passes the
    e2e smoke test.

## 11. Security (assume LAN mode is on, even on the laptop)

1. Network modes in `config.json`: `local` (bind 127.0.0.1, default),
   `lan` (bind 0.0.0.0, banner in UI showing the URL, Windows Firewall rule
   added by an explicit admin action with UAC), `server` (behind reverse
   proxy, HTTPS required, secure cookies). Changing mode requires admin +
   restart. Never open the router/internet; docs say so plainly.
2. No public sign-up. First run creates the admin; then admin-created
   accounts or single-use invite codes (expiry 7 days).
3. argon2id, min password length 10, login rate limit + lockout
   (5 fails → 15 min), session cookie httpOnly + SameSite=Lax (+Secure in
   server mode), session expiry 7 days idle, CSRF protection on mutations.
4. Every query scoped by `ownerId` or visibility through one data-access
   layer. No direct Prisma calls from routes/components.
5. Uploads: magic-byte check, max 10 MB, re-encode rasters with sharp
   (strips metadata), SVG → PNG only (never embed raw SVG), PDF images
   validated by page count = 1 and size.
6. Security headers (CSP without unsafe-eval except where MathLive needs a
   documented exception, X-Frame-Options DENY, no-sniff, Referrer-Policy).
7. Logs never contain question text or passwords.
8. Backups are plain zips in the user's Documents; document that they hold
   unreleased exam papers.
9. **Exam confidentiality**: question papers, answer keys and anything from
   `reference_papers/` are confidential. `reference_papers/`, data dirs,
   `*.db`, exports and backups are in `.gitignore` from the first commit.
   Never commit paper text; test fixtures use invented questions unless the
   owner explicitly approves a specific past paper.

## 12. Design (UI quality)

Installed design skills on the developer's Mac:
`apple-design-web`, `emil-design-eng`, `apple-design` (HIG review),
`break-ui`, `prototype`, `animate`, `animation-performance`, `mobile-native`.

- Build every UI phase with `/apple-design-web` + `/emil-design-eng`.
  Explore alternatives for the editor layout and template builder with
  `/prototype` before committing to one.
- End every UI phase with `/apple-design` review and `/break-ui` (long course
  titles, 20 MCQs with long options, 7.5 marks, empty states, 200 templates,
  slow compile, compile error, offline). Fix or log every finding.
- Character: calm, document-first, like Pages/Preview. Quiet chrome, the
  paper is the hero. System font stack in the UI; light and dark mode;
  WCAG AA contrast; full keyboard use; visible focus.
- Motion: short (≤ 200 ms), only for feedback and spatial continuity;
  honour `prefers-reduced-motion`; no motion while typing; no animation that
  delays the PDF preview. Performance beats flourish.
- Desktop-first (laptop 1366×768 minimum must fit editor + preview); the
  library and PDF viewing must still work on a phone over LAN.
- Copy is plain English for a pharmacy teacher: "Make global", not
  "Set visibility to GLOBAL".

## 13. Build phases (one phase per session, in order)

Each phase: branch `phase/<n>-<name>` → work in small conventional commits →
all gates green → update `memory.md` + `handoff.md` → merge `--no-ff` into
`main` → tag `v0.<n>.0` → push → **stop and report to the owner**.

| # | Phase | Done when |
|---|---|---|
| 0 | **Bootstrap**: repo hygiene, `.gitignore`, git identity check, commit-msg hook, tool attribution off (local settings), Next.js + TS strict + lint + Vitest + Playwright + CI matrix, `memory.md`/`handoff.md` | CI green on an empty app; a test commit containing a `Co-Authored-By` line is rejected by the hook |
| 1 | **LaTeX core**: Tectonic manager (download/verify/pin per OS), compile service, sanitiser, serialiser for paper JSON (no editor yet), the reference template as generator output | Gates 3, 4, 6, 7 green; reference template regenerated from JSON matches the hand-written one |
| 2 | **Data + auth**: Prisma schema, migrations, data-access layer, first-run admin, users, invites, sessions, rate limits | Gate 8 green; admin bootstrap e2e |
| 3 | **Rules + course catalogue**: load `pci-rules.json`, checker; parse the syllabus PDF into a seed (courses, credits, L-T-P, COs, units); verify against Tables X-a…X-h | Every Table X course present with matching credits/marks/durations; checker 100% branch coverage |
| 4 | **Template library + builder**: list (global + mine, search, filter by program/exam kind), create/edit/save-as/visibility/delete, live preview of an empty template, seed templates | Permission table §7 fully tested; all seeds compile; Non-PCI badge correct for legacy seeds |
| 5 | **Paper editor**: slots, TipTap nodes, MathLive, tables, images (CorelDRAW PNG/PDF, SVG→PNG), choices, CO/Bloom, autosave, live preview with error mapping | Gate 9 editor part; `/break-ui` pass logged |
| 6 | **Answer keys + exports + files**: key editor → key PDF in the house style of the `*Keys.tex` references; export bundle; exports folder; duplicate paper (ATKT flow); backup/restore (+ auto backup daily and before update, keep 14) | Exported zip compiles standalone; restore round-trip e2e |
| 7 | **Network modes + hardening**: local/lan/server, firewall helper, headers, CSRF, audit log, LAN banner | Security checklist §11 verified item by item in `handoff.md` |
| 8 | **Installers + docs**: `setup-windows.ps1`, `start-windows.bat` (+ desktop shortcut), `update-windows.ps1`, `setup-macos.sh`, `start-macos.command`, `update-macos.sh`; README for developers; `docs/USER_GUIDE.md` for the faculty member (plain English, screenshots) | Gate 10 green; fresh-machine install documented step by step and timed |
| 9 | **Polish**: `/apple-design` full review, `/break-ui`, performance (editor input latency < 50 ms, preview < 3 s warm) | Review findings closed or logged with reasons |

Installer requirements: check/install Node 22 LTS (winget on Windows,
Homebrew or the official pkg on macOS), `npm ci`, `prisma migrate deploy`,
download pinned Tectonic + verify SHA-256, package warm-up, `next build`,
create data dir, create shortcut that starts the server and opens the
browser at `http://127.0.0.1:3210`. Scripts are idempotent (safe to re-run)
and print plain-English progress. `update` = backup → `git pull` → `npm ci`
→ migrate → build.

## 14. Future hooks (keep the door open, build nothing)

`Question` table + `Slot.questionId`; `CourseOutcome` relations; Bloom enum;
rule-set registry keyed by `ruleSetId` so M.Pharm/Pharm.D sets can be added
as JSON; importer interface for legacy `.tex` (the `exam`-class structure is
regular enough to parse later).
