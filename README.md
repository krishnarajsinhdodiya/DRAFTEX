# DRAFTEX

A local-first question-paper builder for pharmacy faculty. Papers are written
in a structured editor, checked against the PCI 2026 B.Pharm rules, and
compiled to PDF (paper and answer key) through LaTeX in the KSV/KBIPER house
style. Everything runs on one computer; other computers on the same network
can be let in (LAN mode).

- Product and build contract: [docs/SPEC.md](docs/SPEC.md)
- For the person who writes papers: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- Decisions and their reasons: [memory.md](memory.md)

## Stack

Node.js 24.22.2 · Next.js 16 (App Router, custom server `server.ts`) ·
TypeScript strict · Prisma 7 on SQLite (WAL) · TipTap + MathLive ·
pdf.js · Tectonic 0.17.0 (pinned bundle) · Vitest · Playwright.
Exact versions are pinned in `package.json` and listed in `memory.md`.

## Repository layout

| Path                                      | What is there                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/app`                                 | Pages and route handlers                                                                          |
| `src/lib/data`                            | The only data-access layer (ownership enforced here; ESLint blocks the database client elsewhere) |
| `src/lib/latex`                           | Sanitiser, serialiser, Tectonic manager and compile service                                       |
| `src/lib/rules`, `src/lib/catalogue`      | PCI rules checker and the B.Pharm course catalogue                                                |
| `src/lib/backup`, `src/lib/install`       | Backups/restore; install helpers (cloud-sync check, move data folder)                             |
| `server.ts`, `scripts/start.ts`           | The HTTP server with its request guard, and the supervisor `npm start` runs                       |
| `scripts/`                                | Node scripts (TypeScript run by Node's type stripping, no build step)                             |
| `setup-*`, `start-*`, `update-*`          | End-user installers for Windows and macOS                                                         |
| `tests/unit`, `tests/golden`, `tests/e2e` | Unit, LaTeX golden/visual/fuzz, and browser tests                                                 |
| `prisma/`                                 | Schema and migrations                                                                             |

## Data folder

All runtime data (database, pictures, exports, backups, logs, `config.json`,
the LaTeX engine) lives outside the repository:

1. `DRAFTEX_DATA_DIR` if set (the folder must exist),
2. else `dataDir` in `draftex.local.json` at the repo root (git-ignored; see
   `draftex.local.example.json`),
3. else `%USERPROFILE%\DRAFTEX-data` (Windows) or `~/DRAFTEX-data` (macOS),
   created on first use.

To move it: stop DRAFTEX, then `npm run move-data -- "<new folder>"`. It
copies, compares every file by SHA-256, rewrites `draftex.local.json` and
leaves the old folder for you to delete.

Never put the data folder or this repository in OneDrive, iCloud Drive,
Dropbox or Google Drive: syncing a live SQLite database can corrupt it, and
the folder holds unreleased exam papers. Setup warns when it sees one.

## Developer setup (macOS)

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"   # Node 24.22.2, see .nvmrc
npm ci
npm run db:migrate
npm run setup:tectonic    # downloads the pinned engine, warms the package cache (~3 min once)
npm run dev               # http://127.0.0.1:3210, live reload
```

`./setup-macos.sh` does the same with its own Node in `.runtime/` and also
builds the app; use it to test the end-user path.

Useful scripts:

| Command                                                       | Does                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run lint` · `npm run typecheck` · `npm run format:check` | Gate 1                                                                                     |
| `npm test`                                                    | Unit tests with coverage thresholds (gate 2)                                               |
| `npm run test:golden`                                         | Compile, visual regression and fuzz (gates 3–7; needs Tectonic)                            |
| `npm run test:e2e`                                            | Playwright on a throwaway data folder, port 3211 (gate 9)                                  |
| `npm run build` · `npm start`                                 | Production build; the supervisor that restarts on exit code 75                             |
| `npm run backup` · `npm run restore -- <zip>`                 | Backup now; restore into a stopped app or empty folder                                     |
| `npm run move-data -- <folder>`                               | Move the data folder                                                                       |
| `npm run reset-password -- <email>`                           | New temporary password from the DRAFTEX computer (app stopped; applied at next start, D49) |
| `npm run catalogue:parse` · `catalogue:check`                 | Rebuild / verify the catalogue from the syllabus PDF                                       |
| `node scripts/e2e-server.ts [port] [local\|lan] [start\|dev]` | Run the built app on a throwaway data folder                                               |

Do not run `next dev` while building or running e2e: both use `.next`.

## End-user install (what the scripts do)

|                                   | Windows                                           | macOS                                                      |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Set up                            | `setup-windows.bat` → `setup-windows.ps1`         | `setup-macos.sh`                                           |
| Start                             | `start-windows.bat` (desktop shortcut `DRAFTEX`)  | `start-macos.command` (`~/Desktop/DRAFTEX.command`)        |
| Update                            | `update-windows.bat` → `update-windows.ps1`       | `update-macos.sh`                                          |
| Reset a password                  | `reset-password-windows.bat`                      | `.runtime/node/bin/node scripts/reset-password.ts <email>` |
| Uninstall (keeps the data folder) | `uninstall-windows.bat` → `uninstall-windows.ps1` | `uninstall-macos.sh`                                       |

Setup: download Node.js 24.22.2 from nodejs.org, check its pinned SHA-256,
unpack into `.runtime/node` (no admin rights, nothing system-wide) →
`npm ci` → `scripts/install.ts` (data folder, migrations, Tectonic + warm-up,
`next build`, Next telemetry off) → desktop shortcut. Every step can be run
again safely.

Start: `node scripts/start.ts --open` opens the browser once the app answers;
if DRAFTEX is already running it only opens the browser. The console window
must stay open (closing it stops DRAFTEX).

Update: refuse if DRAFTEX is running or tracked files were edited →
`npm run backup -- --kind before-update` → `git pull --ff-only` → run the
(new) setup script. The update scripts are written so that `git pull`
changing them mid-run is harmless.

The end user's copy is a git clone that pulls with a fine-grained, read-only
GitHub token for this repository only, stored by Git Credential Manager
(see the user guide, "For the person who installs DRAFTEX").

## Rules for contributors

- `docs/SPEC.md` is the contract; deviations are agreed first and logged in `memory.md`.
- Conventional Commits, small commits, tests in the same commit as the code.
- `reference_papers/` is confidential and git-ignored; fixtures use invented questions.
- Child processes use `execFile` with argument arrays, never a shell string.
- A LaTeX warning in a golden test is a failure.
