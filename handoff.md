# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-03
- **Current phase:** 0, Bootstrap (not started)
- **Branch:** none yet (repo contains only the prompt pack)
- **Last green commit:** n/a
- **CI:** not set up

## Done in last session
- Prompt pack placed in repo: CLAUDE.md, memory.md, handoff.md, docs/SPEC.md,
  docs/pci-rules.json, docs/reference/templates/pci2026-bpharm-endsem-4credit-ksv.tex
  (verified: compiles with pdflatex, 0 warnings), docs/reference/pci/ syllabus PDF,
  assets/logos/ (KSV, KBIPER).
- Owner places real papers in `reference_papers/` (must be git-ignored first).

## Next steps (in order)
1. Phase 0 per SPEC §13: create `.gitignore` **before the first commit**
   (must include `reference_papers/`, `.env*`, `*.db*`, `node_modules/`,
   `.next/`, data/exports/backups dirs, OS junk).
2. Verify git identity = Krishnarajsinh Dodiya <dodiyakh@gmail.com>.
3. Attribution off (`.claude/settings.json`), commit-msg hook, CI hygiene job.
4. Scaffold Next.js + TS strict + lint + Vitest + Playwright; CI matrix ubuntu + windows.
5. First commit on `phase/0-bootstrap`, push, open nothing else.

## Blockers / risks
- None known. Confirm `reference_papers/` is not tracked: `git ls-files reference_papers` must print nothing.

## Phase checklist
- [ ] 0 Bootstrap
- [ ] 1 LaTeX core
- [ ] 2 Data + auth
- [ ] 3 Rules + course catalogue
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
