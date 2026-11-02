# memory.md: durable project memory

Append-only log of facts and decisions that must survive across sessions.
One line each: `YYYY-MM-DD · decision · reason`. Supersede, never delete.

## Project facts
- 2026-11-03 · App name DRAFTEX; repo github.com/krishnarajsinhdodiya/DRAFTEX (private) · owner choice
- 2026-11-03 · Owner: Krishnarajsinh Dodiya (dev, macOS). End user: his father, pharmacy faculty at KBIPER (constituent college of Kadi Sarva Vishwavidyalaya, Gandhinagar), on Windows · context
- 2026-11-03 · Internal (sessional) papers use KBIPER header; external (end-sem) papers use KSV header · from reference papers
- 2026-11-03 · Father already writes papers in LaTeX (`exam` class, 12pt, A4, CM). Those sources in `reference_papers/` define house style · from reference papers
- 2026-11-03 · He writes answer keys for external papers, synopsis quizzes before practicals, ATKT copies of papers, and tags COs like `[BP604T.01]` · from reference papers
- 2026-11-03 · PCI 2026 rules exist only for B.Pharm (docs/pci-rules.json, cited pages). M.Pharm and Pharm.D: templates allowed, no rule set · syllabus PDF covers B.Pharm only

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

## Pinned versions
(Phase 0/1 fills this: Node, Next.js, Prisma, auth lib, TipTap, MathLive, Tectonic + SHA-256 per OS.)

## Open questions for the owner
- New-format KSV external paper header/layout: none issued yet. Built-in PCI 2026 end-sem template uses old KSV header + PCI groups. Revisit when the first new-format paper appears.
