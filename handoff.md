# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-03
- **Current phase:** 2 Data + auth: done. Next: Phase 3 Rules + course catalogue.
- **Branch:** `main` only (Phase 2 merged with `--no-ff` from `phase/2-data-auth`, tagged `v0.2.0`; the phase branch is deleted locally and on GitHub)
- **Last green commit:** latest `main`
- **CI:** `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, all green. better-sqlite3 builds from source on both runners (install scripts approved); Playwright now runs the auth e2e on both OSes.

## Done this session (Phase 2)
- Approved deviations, logged in `memory.md`:
  - D5: hand-rolled sessions (Lucia pattern), no Better Auth.
  - D6: gate 8 covers the data layer now; route-level tests come in phases 4–6.
  - D7: auth screens skip the `/apple-design` and `/break-ui` reviews until Phase 4.
  - Asset primary key is (ownerId, sha256).
- Dependencies (pinned, see memory.md): Prisma 7.10.1 with the better-sqlite3 12.11.1 adapter, @node-rs/argon2 2.2.2. `allowScripts` approves install scripts for better-sqlite3, prisma and @prisma/engines only.
- `prisma/schema.prisma`: SPEC §6 models with these additions:
  - `User`: `failedLogins`, `lockedUntil`, `mustChangePassword`.
  - `InviteCode`: hashed id, role, expiry, used/revoked fields.
  - `Template.builtIn`; `Asset` keyed by (ownerId, sha256).
  - `CompileJob.id` is an autoincrement integer.
  - One migration, `prisma/migrations/*_init`.
  - `prisma.config.ts` reads the database path from the data folder and never creates anything.
  - `npm run db:migrate` (`scripts/db-migrate.ts`) applies migrations.
- `src/lib/db/client.ts`: `openDatabase(file)` turns on WAL and foreign keys, and opens with `fileMustExist`. `getDb()` is the process-wide client.
- `src/lib/data/`: the one data-access layer.
  - `templates`, `papers` (slots, compile history capped at 20), `assets`, `users` (admin only, keeps at least one active admin), `auth-store` (sessions, lockout counters, first-run admin, invites), `audit`.
  - Every scoped call takes an `Actor`. Other people's private records come back "not found".
  - ESLint `no-restricted-imports` blocks the Prisma client outside `src/lib/data` and `src/lib/db`.
- `src/lib/auth/`:
  - argon2id (19 MiB, t=2, p=1) with a dummy hash for unknown emails; passwords 10–256 characters.
  - 160-bit session tokens, stored as SHA-256; 7-day idle expiry, slid at most once an hour.
  - 5 failures → 15-minute lockout; 20 sign-ins and 10 invite attempts per address per 15 minutes.
  - Invite codes: 60 bits, Crockford base32, `XXXX-XXXX-XXXX`, single use, 7 days, stored hashed.
  - First-run admin only in `local` mode, inside one transaction.
- `src/lib/config.ts`: reads `mode` from `<dataDir>/config.json` (default `local`).
- `src/server/`:
  - `auth.ts`: session for the request; `requireSession`, `requireUser` and `requireAdmin` (404 for faculty).
  - `cookie.ts`, `actions.ts` (server actions), `startup.ts`, `compile.ts` (the app's `CompileService`).
  - `src/proxy.ts` re-sends the cookie on GET page loads.
  - `src/instrumentation.ts` runs the startup checks: data folder, config, database present, compile temp sweep, expired-session prune.
- Screens: `/setup`, `/login`, `/join`, `/change-password`, `/` (placeholder home), `/admin/users` ("People": add person, set password, unlock, role, deactivate, invite codes). Shared form parts are in `src/components/form.tsx`.
- Tests: 355 unit tests.
  - Gate 8: `tests/unit/data/authorization.test.ts`, 54 cases with guessed IDs for another faculty member and for an admin. A mutation check (loosening the ownership filters) made 20 of them fail.
  - Coverage: `src/lib/auth` 100% lines / 98.4% branches; `src/lib/data` 99.5% / 97% (a threshold now applies to it too).
  - E2E: `tests/e2e/auth.spec.ts` covers the admin bootstrap end to end, 8 tests, plus 2 smoke tests. It runs the built app on port 3211 against a throwaway data folder.
- Gates run locally: lint, typecheck, format, unit + coverage, build (no warnings), golden (11 passed, 7 Linux-only skipped), e2e 10/10. CI green on both OSes.

## In progress
- Nothing half-done.

## Next steps (Phase 3, Rules + course catalogue; follow SPEC §13)
1. Session start per the operating rules; branch `phase/3-rules-catalogue` from `main`.
2. Load `docs/pci-rules.json` into `src/lib/rules/` with Zod. The checker needs 100% branch coverage (gate 2).
3. Parse the B.Pharm syllabus PDF into a seed: courses, credits, L-T-P, COs, units with hours. Verify it against Tables X-a…X-h. `Course`, `CourseOutcome` and `CourseUnit` already exist in the schema.
4. Add read functions for courses to `src/lib/data` (any signed-in user), with gate 8-style tests if anything there is ever scoped.
5. A seed script goes through `src/lib/data` or a system-only module in it. Never import the Prisma client elsewhere; lint will reject it.

## Failing tests
- None.

## Blockers / risks
- **LAN mode (Phase 7):** Next 16 trusts a client-sent `x-forwarded-for`, so the per-address limits can be dodged on a LAN. Per-account lockout still works. Fix this before LAN mode ships, for example with a custom server that reads the socket address.
- **CSRF:** this relies on Next.js's built-in Origin check for server actions. Phase 7 should add an explicit test that a forged Origin is refused, and reconsider when `server` mode sits behind a proxy (`serverActions.allowedOrigins`).
- **Lockout as denial of service:** anyone who knows an email can lock that account for 15 minutes. An admin can unlock it on the People page. This is accepted for v1 (SPEC §11.3).
- **Lockout reveals accounts:** the "locked" message shows that an account exists after 5 failures. Accepted; the per-address limit slows enumeration.
- **No route tests yet:** gate 8 has no route-level tests because no template, paper or asset routes exist. Phases 4–6 must add them as those routes appear (D6).
- Carried over:
  - Bundle host `data1b.fullyjustified.net`.
  - Times font not offered.
  - `--untrusted` still allows `\input` of absolute paths (always sanitise).
  - EXIF and ICC stripping in Phase 5.
  - First warm-up takes about 3 minutes.
  - ESLint 10 overrides.
  - `ubuntu-latest` will move to Ubuntu 26.
  - `next telemetry disable` in the installer.
- The installer (Phase 8) must run `npm run db:migrate` after `npm ci`. The app refuses to start without a database.

## Decisions made (copied to memory.md)
- D5–D7, the Asset key, the first-run admin rule, the Prisma generate/migrate layout, `fileMustExist`, force-dynamic pages, the integer `CompileJob.id`, the cookie refresh in the proxy, the x-forwarded-for finding, must-change-password for admin-set passwords, read-only built-ins, 404 for admin pages, and the e2e server on port 3211.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`, git-ignored). It holds `tools/` (Tectonic) and now `data.db` (migrated, no users yet). The first visit to http://127.0.0.1:3210 after `npm run build && npm run start` shows the first-run setup.
- Node 24: run `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands.
- `.claude/launch.json` (git-ignored) has a `draftex-e2e` preview on port 3212 with a throwaway data folder.

## Questions for owner
- None blocking. Later: should the app offer Times at all (two of your papers use it), given that it needs extra work to compile without warnings?

## Phase checklist
- [x] 0 Bootstrap
- [x] 1 LaTeX core
- [x] 2 Data + auth
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
