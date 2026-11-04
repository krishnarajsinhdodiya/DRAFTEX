# handoff.md: where the last session stopped

Replace this whole file at the end of every session. A fresh session with
no chat history must be able to continue from this file alone.

## Status
- **Date:** 2026-11-04
- **Current phase:** 7 Network modes + hardening: done. Next: Phase 8 Installers + docs.
- **Branch:** `main` only (Phase 7 merged with `--no-ff` from `phase/7-network-hardening`, tagged `v0.7.0`; branch deleted locally and on GitHub)
- **Last green commit:** latest `main`
- **CI:** `commit-hygiene` + `checks (ubuntu-latest)` + `checks (windows-latest)`, green on the phase branch before the merge.

## Done this session (Phase 7)
- Deviations D36–D41 approved before the phase (memory.md); "Move data folder" moved to Phase 8.
- **Custom server** `server.ts` (D36) replaces `next start`/`next dev`. `npm start` / `npm run dev` run `scripts/start.ts`, a supervisor that starts the server again on exit code 75 (D37). `config.json` now holds `mode`, `port`, `hostNames`, `bindAddress`, `trustedProxies` (`src/lib/config.ts`, atomic writes).
- **Request guard** (`src/lib/net/guard.ts`, run by server.ts before Next): Host allow-list (DNS rebinding → 421), same-origin `Origin` required on every non-GET (→ 403), server mode needs `X-Forwarded-Proto: https` from a trusted proxy (→ 403), client-sent `x-forwarded-*`/`forwarded`/`x-real-ip` replaced, so the rate limits see the real address. The memory.md `x-forwarded-for` issue is closed.
- **Headers** (`src/lib/net/headers.ts`): X-Frame-Options DENY, nosniff, Referrer-Policy same-origin, Permissions-Policy, COOP, CORP, HSTS in server mode; CSP with a per-request nonce from `src/proxy.ts`, `style-src 'unsafe-inline'` as the documented exception (D41), no `unsafe-eval` outside dev. pdf.js and MathLive work under it (e2e fails on any CSP console violation).
- **Lockout per (account, address)** (D38): new `LoginLock` table, `User.failedLogins/lockedUntil` dropped (migration `20261104034756_login_locks`). Failed sign-ins and lockouts are audited with the address in the new `AuditLog.detail` column.
- **Network screen** `/admin/network`: mode cards, port, server-mode fields, "Saved, not yet in use" + Restart now, LAN addresses, Windows firewall helper (D39: elevated netsh via PowerShell `Start-Process -Verb RunAs`, Private profile, LocalSubnet, the port; only from the DRAFTEX computer), macOS note, Restart. LAN banner on every app page (D40). Backups screen offers Restart when a restore waits.
- **Activity screen** `/admin/activity`: audit log, newest first, 50 per page, filter by person/action, names the account a row is about. Restore applied at startup is now audited.
- **Log safety**: Prisma error messages repeated query arguments (question text, hashes); a client extension now rethrows them without values (`src/lib/db/client.ts`), test `tests/unit/data/no-content-in-errors.test.ts`.
- Tests: unit 747 (was 712), e2e 38 (was 30; new `tests/e2e/network.spec.ts`), golden 40 + 22 visual on ubuntu (unchanged). `/apple-design` review and `/break-ui` on the new screens, findings fixed.

## Security checklist (SPEC §11), verified item by item
1. **Network modes** — local binds 127.0.0.1, lan 0.0.0.0, server the configured address (server.ts; e2e LAN round trip and server-mode spec). LAN banner with URLs (e2e). Firewall rule only by an explicit admin action with UAC (unit-tested command; **UAC step not tested: needs one manual try on Windows**). Mode change needs admin + restart (gate 8 unit, e2e). "Never open the router/internet" is in the UI copy; the user guide (Phase 8) must say it plainly.
2. **No public sign-up** — unchanged since Phase 2: first-run admin only in local mode with no users (e2e checks server mode shows "Set up DRAFTEX on its own computer"); admin-made accounts and 7-day single-use invites (unit + auth e2e).
3. **Auth** — argon2id, min 10, per-address limit 20/15 min now keyed on the real address, lockout 5 → 15 min per (account, address) (D38, unit), cookie httpOnly + SameSite=Lax + Secure in server mode, 7-day idle. CSRF: server guard (unit + e2e on /login, /api/assets, /api/admin/restore, /api/templates/preview with no/foreign Origin), every mutating route handler calls `sameOrigin` and every server action module signs the caller in (`tests/unit/server/csrf.test.ts`), Next's own action check.
4. **One data-access layer** — ESLint rule unchanged; new audit list and lockouts are in `src/lib/data`.
5. **Uploads** — unchanged since Phase 5 (magic bytes, 10 MB, sharp re-encode, SVG → PNG, PDF 1 page ≤ A3).
6. **Security headers** — all present on every response; CSP as above (unit + e2e: nonce on every script, new nonce per request, no CSP violations in editor/MathLive/previews).
7. **Logs** — app log lines name files and counts only; Prisma errors scrubbed (new); audit rows hold codes, ids and short tokens only (unit checks columns and detail format).
8. **Backups are plain zips** — Backups screen says so (caution); user guide (Phase 8) must repeat it.
9. **Confidentiality** — `.gitignore` unchanged; no paper text in fixtures; this phase added none.

## In progress
- Nothing half-done.

## Next steps (Phase 8, Installers + docs; follow SPEC §13)
1. Session start per the operating rules; branch `phase/8-installers-docs` from `main`.
2. `setup-windows.ps1`, `start-windows.bat` (+ desktop shortcut, runs `npm start`, the supervisor), `update-windows.ps1` (`npm run backup -- --kind before-update` first), macOS equivalents; `npm run db:migrate`, `npm run setup:tectonic`, `next build`, `next telemetry disable`.
3. Decide and build "Move data folder" (memory.md "Data dir outside repo"; moved here from Phase 7).
4. README (developers) and `docs/USER_GUIDE.md` (plain English, screenshots): say plainly never to open the router/internet, that LAN mode is unencrypted, that backups and exports hold unreleased papers, how to recover from server mode (edit `config.json`).
5. Gate 10: Windows CI job runs the install script, starts the app, passes the e2e smoke test.
6. Try the firewall helper once on a real Windows machine (UAC prompt, rule created, rule removed).

## Failing tests
- None.

## Blockers / risks
- **LAN mode is plain HTTP** (D40): passwords and papers cross the network unencrypted. Only on a trusted network; server mode behind HTTPS for wider use.
- **Server mode locks out direct access**: after switching, DRAFTEX answers only through the HTTPS proxy; recovery = set `"mode": "local"` in `<data>/config.json` and restart.
- **Restoring a backup also restores its `config.json`** (D30), so a backup made in LAN mode turns LAN mode on at the next restart after the restore. See questions.
- **Owner's Mac needs `npm run db:migrate`** once (new migration `login_locks`); startup refuses to run until then.
- Carried over: restore needs a restart (now one click when started with `npm start`); zip bombs only caught after inflating; long chemical names in 2/4-column choices; cramped phone editor; same question in two windows is last-write-wins; lockout DoS now limited to one address per account; bundle host `data1b.fullyjustified.net`; Times not offered; `--untrusted` still allows `\input` of absolute paths (always sanitise); first warm-up about 3 minutes; ESLint 10 overrides; `ubuntu-latest` moves to Ubuntu 26.
- Logged, not fixed: a superseded preview compile sometimes prints a `CompileRejected` stack to the server log (no content in it; Phase 9); Turbopack warns "Dynamic filesystem access causes tracing of the whole project" for `src/lib/backup/run.ts` (since Phase 6); the admin header nav wraps below ~1100 px wide now that it has six links.

## Decisions made (copied to memory.md)
- D36–D41; Move data folder → Phase 8; Prisma error scrubbing; supervisor and e2e server ports; server-mode e2e on port 3218.

## Machine setup (owner's Mac)
- Data folder `/Volumes/DRAFTEX/DRAFTEX-data` (pointer `draftex.local.json`, git-ignored). **Run `npm run db:migrate` once** (new migration). Its `config.json` may not exist; the default is local mode on 127.0.0.1:3210.
- Node 24: `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` before npm commands.
- `.claude/launch.json` (git-ignored): `draftex-e2e` (3212), `draftex-e2e-2` (3213), `draftex-wifi-demo` (3215, LAN mode; the old `0.0.0.0` argument still means lan), `draftex-dev-throwaway` (3216, dev mode). All use throwaway data folders and the supervisor, so Restart works there. E2E uses 3211, restore 3214, server mode 3218.

## Questions for owner
- Should restoring a backup keep this computer's network settings (`config.json`) instead of the backup's? Recommended: keep this computer's; it changes D30.
- Which code does KSV print on an elective paper: `BP607T` or `BP607T AEC1`?
- How does your father tag COs of elective options? The default is `BP607TAEC1.01`.
- Later: should the app offer Times at all?

## Phase checklist
- [x] 0 Bootstrap
- [x] 1 LaTeX core
- [x] 2 Data + auth
- [x] 3 Rules + course catalogue
- [x] 4 Template library + builder
- [x] 5 Paper editor
- [x] 6 Answer keys + exports + files
- [x] 7 Network modes + hardening
- [ ] 8 Installers + docs
- [ ] 9 Polish

## Template for future handoffs
Status (date, phase, branch, last green commit, CI) · Done this session ·
In progress (file + what's half-done) · Next steps (numbered, concrete) ·
Failing tests (name + repro) · Decisions made (also copied to memory.md) ·
Questions for owner.
