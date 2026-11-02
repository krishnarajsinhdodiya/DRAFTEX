# START HERE: how to use this pack (for Krishnaraj)

## One-time setup on your Mac
1. Clone the empty repo and copy everything in this pack into it, keeping the structure:
   ```
   git clone https://github.com/krishnarajsinhdodiya/DRAFTEX.git
   cd DRAFTEX
   # copy: CLAUDE.md memory.md handoff.md START_HERE.md docs/ assets/
   ```
2. Set your identity **in this repo** (do this before Claude Code runs):
   ```
   git config user.name  "Krishnarajsinh Dodiya"
   git config user.email "dodiyakh@gmail.com"
   ```
3. Create `.gitignore` yourself **before adding the papers**:
   ```
   echo "reference_papers/" > .gitignore
   ```
4. Create `reference_papers/` and copy your father's folders into it
   (KSV externals, KB internals, logos). Then check that git ignores it:
   `git status` must not list `reference_papers/`.
5. Make the repo **private** on GitHub (Settings → General → Danger zone → visibility).
6. Install Node 22 LTS if missing (`brew install node@22`).

## Run Claude Code
Open a terminal in the repo, run `claude`, and paste **Prompt A** (below) for the
first session. For every later session, paste **Prompt B**. One phase per session.
After each phase, check the report, open the app if it has a UI, then start the next session.

---

### Prompt A: first session (paste exactly)
```
Read CLAUDE.md, memory.md, handoff.md, then docs/SPEC.md completely,
docs/pci-rules.json, and docs/reference/templates/pci2026-bpharm-endsem-4credit-ksv.tex.
Then skim reference_papers/ (structure and LaTeX style only; it's confidential
and git-ignored, so never copy question text anywhere).

Before writing any code, reply with:
1. Anything in SPEC.md you think is wrong, risky or contradictory, using the
   "I disagree because… / instead… / the risk…" format from CLAUDE.md §3.
2. Every assumption you'd have to make that SPEC.md doesn't settle.
3. The exact library versions you plan to pin, checked against current
   official docs (not memory), with confidence tags.
4. Your Phase 0 plan as a checklist.

Then stop and wait for my answers. After I reply, execute Phase 0 only,
following CLAUDE.md §2 and §4 exactly, and stop with the report.
```

### Prompt B: every later session
```
Follow CLAUDE.md §1. Continue with the next unchecked phase in handoff.md.
Plan first: list the steps and any SPEC deviations you want, then wait for my
"go". Execute that phase only, meet every gate in SPEC §10 that applies, do
CLAUDE.md §2, then stop with the report.
```

### Prompt C: if a session runs out of context midway
```
Follow CLAUDE.md §1. handoff.md shows an in-progress phase. Verify the
current state by running the tests, then finish that phase. Don't redo
finished work.
```

## Rules for you
- If Claude Code asks a question, answer it; don't say "do what you think" on
  anything about exam format. Ask your father instead.
- Never paste question text from current or future papers into the chat.
- If you change a decision, say "log this in memory.md".
- When the first new-format KSV paper comes out, drop it in `reference_papers/`
  and tell Claude Code to update the KSV PCI 2026 templates.
