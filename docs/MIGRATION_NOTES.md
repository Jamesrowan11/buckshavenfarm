# Supabase/Cloudflare → Plesk migration notes

## 1. Inventory of the original application

Everything below was found in the repository before the migration and still
works afterwards, now backed by MySQL/MariaDB.

| Feature | Routes | Data (old Supabase → new MySQL) | Access rule (old RLS → now enforced in `lib/services`) |
|---|---|---|---|
| Sign-in / sign-out / sessions | `/login`, `POST /logout`, `/` (role redirect), `middleware.ts` | `auth.users` + `profiles` → `users`, `sessions`, `login_attempts` | public sign-in; everything else requires a session |
| Admin dashboard | `/admin` | tasks, shifts, announcements, clock_logs, time_off_requests | admin |
| Employee home | `/employee` | tasks, shifts, announcements | signed in (own data) |
| Tasks & assignments | `/admin/tasks`, `/employee/tasks` | `tasks` | admin: all; employee: read own + unassigned, complete/comment |
| Work schedule | `/admin/schedule`, `/employee/schedule` | `shifts` | admin manages; employee reads own |
| Availability | `/admin/availability`, `/employee/availability` | `availability` (jsonb → JSON) | employee submits/reads own; admin reads all |
| Time-off requests | `/employee/time-off`, `/admin/availability` | `time_off_requests` | employee requests/reads own; admin reviews |
| Horses & feeding charts | `/admin/feeding-charts` | `horses`, `feeding_charts` | admin writes |
| Daily feeding checklist | `/employee/feeding-charts` | `feeding_logs` | any signed-in user marks AM/PM |
| Barn TV displays | `/barn-display`, `/barn-display/log-barn`, `/barn-display/arena-barn` | horses, charts, logs, announcements, responsible names | public read |
| Announcements | `/admin/announcements`, `/employee/announcements` | `announcements` | admin writes; signed-in users read (barn display shows the latest 3) |
| Clock in/out | `/employee/clock`, `/admin/clock-log` | `clock_logs` | own insert/read; admin reads all |
| Employee management | `/admin/employees` | `profiles` → `users` | admin |
| Admin notes | `/admin/notes` | `admin_notes` | admin only |
| More menu | `/employee/more` | — | signed in |

Nothing was removed. Design, navigation, mobile layouts and routes are
unchanged. New pages and endpoints are listed in §3.

## 2. Architecture

- **Database:** `mysql2/promise` with parameterized queries, in
  [`lib/db.ts`](../lib/db.ts), which imports `server-only` so it can't be bundled
  for the browser. Connection settings come from `DATABASE_URL` or
  `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` (plus optional `DB_SOCKET`,
  `DB_SSL`, `DB_POOL_SIZE`). Nothing is prefixed `NEXT_PUBLIC_`. Every
  connection runs with `time_zone = '+00:00'`. Driver errors are mapped to safe
  messages; connection failures become "database temporarily unavailable"
  (HTTP 503) without leaking hosts or credentials.
- **Why plain SQL, not an ORM:** the app has 13 small tables and simple
  queries. Parameterized SQL keeps the dependency count low and the generated
  SQL obvious, and the same `.sql` migration file works on MySQL and MariaDB.
- **Schema:** [`db/migrations/0001_initial_schema.sql`](../db/migrations/0001_initial_schema.sql).
  It uses UUID primary keys (`CHAR(36)`, so imported Supabase IDs are kept),
  foreign keys with the same cascade/set-null behaviour as before, unique keys
  (user email, one chart per horse, one feeding log per horse/type/day),
  indexes for every list query, `CHECK`/`ENUM` constraints and UTC
  `DATETIME(3)` timestamps. Migrations run only through `npm run db:migrate`.
  That command is checksummed and locked, and it never runs at app startup and
  never drops data.
- **Service layer:** `lib/services/*.ts` has one module per feature. Every function
  takes the signed-in *actor* (loaded from the database via the session) and
  enforces the rules that Supabase Row Level Security used to enforce. Server
  Actions are thin wrappers: `requireUser()`/`requireAdmin()` and then a
  service call. IDs bound into actions are validated as UUIDs because the
  browser can tamper with them.
- **Authentication:** see §4.
- **Barn displays:** Supabase Realtime is replaced by
  [`/api/barn-display`](../app/api/barn-display/route.ts), a public, read-only
  endpoint returning only what the screens show. The screens poll it every 15
  seconds.
- **Time zones:** stored timestamps are UTC. "Today", the week view, feeding
  log dates and displayed times use `APP_TIME_ZONE` (default
  `America/New_York`), see [`lib/time.ts`](../lib/time.ts). Previously "today"
  was the UTC date, which rolled over at 8 pm local time.
- **Hosting:** OpenNext, Wrangler and the Cloudflare config were removed.
  `npm run build` is a plain `next build`. [`server.js`](../server.js) starts the
  standard Next.js production server for Plesk/Passenger, which needs a
  startup file and can't pass `start`; `npm start` (`next start`) also works.

## 3. Behaviour changes (intentional)

| Change | Why |
|---|---|
| **User management moved into the app:** Admin → Employees now has *Add user* and *Set/Reset password*; everyone has **More → Change password** (`/employee/account`, linked from the admin sidebar too). | Accounts used to be created in the Supabase dashboard, which no longer exists. |
| First admin is created with `npm run create-admin` over SSH. | No public admin registration and no default password, as required. |
| Removing an employee deletes the whole account (sessions, shifts, availability, time off, clock logs cascade; tasks, charts, announcements and notes are kept but unlinked). | Previously only the profile row was deleted and the Supabase login stayed alive. |
| Admins can't demote or remove themselves, and the last admin can't be demoted or removed. | Prevents locking the farm out of the admin portal. |
| Unassigned ("All") tasks can be completed and commented on by any employee. | The employee page always showed these buttons, but Supabase RLS silently rejected the update. This makes the existing UI work as intended. Tasks assigned to someone else are still blocked. |
| Task comments are appended on the server inside a transaction. | The old code sent the full current notes from the browser, so two comments at once overwrote each other, and a crafted request could replace the notes entirely. |
| Pressing *Clock in* twice records one clock-in. | The UI only ever offers the opposite action; a double tap no longer creates two rows. |
| Barn displays refresh every 15 s (previously push updates plus a 60 s poll). | No Supabase Realtime. Changes appear within 15 s. |
| Barn display data no longer exposes employee emails or IDs. | The old `profiles` table was readable by anyone (`using (true)`), emails included. |
| Sign-in errors are generic ("Invalid email or password."), and repeated failures are throttled. | Doesn't reveal which accounts exist; brute-force protection. |
| Failed form actions show a "Something went wrong" page instead of silently doing nothing. | Supabase errors used to be ignored. |
| Feeding chart form no longer posts a hidden chart ID. | The server finds the horse's chart itself (one chart per horse). |
| Security headers (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy`); `X-Powered-By` removed; `robots.txt` disallows indexing. | Hardening for a private staff portal. |

## 4. Authentication and security design

- **Passwords:** Argon2id via `@node-rs/argon2` (m=19 MiB, t=2, p=1, OWASP
  baseline). It ships prebuilt binaries for Linux glibc/musl, so nothing
  compiles on the server. Minimum length is 10. Passwords are never stored,
  logged, printed or accepted on a command line.
- **Sessions:** 256-bit random tokens from `crypto.randomBytes`. The database
  stores only the SHA-256 of the token, and the session is validated against
  the database on every request. Idle timeout is 7 days (sliding) and absolute
  lifetime 30 days (`SESSION_IDLE_HOURS`, `SESSION_MAX_HOURS`). Logout, password
  change (other devices), admin password reset and account deletion revoke
  sessions server-side.
- **Cookie:** `bhf_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in
  production (override with `COOKIE_SECURE`).
- **Throttling** (database-backed, so it works across processes and restarts):
  5 failures per account in 15 min locks that account for 15 min; 30 failures
  per IP in 15 min locks that IP. Unknown emails still run one Argon2 verify,
  so timing doesn't reveal which accounts exist.
- **Authorization:** roles are read from the database through the session and
  never from the browser. Every page calls `requireUser`/`requireAdmin`, and
  every service function re-checks with `assertSignedIn`/`assertAdmin` plus
  ownership checks. `middleware.ts` is only a fast first gate based on cookie
  presence.
- **CSRF:** Server Actions use Next.js's built-in Origin/Host check, and the
  `SameSite=Lax` cookie isn't sent on cross-site POSTs. The two route handlers
  that change state (`POST /api/auth/login`, `POST /logout`) check `Origin`
  against `Host`/`X-Forwarded-Host` (plus optional `ALLOWED_ORIGINS`).
- **Input validation:** zod schemas for UUIDs, dates, times, emails and enums,
  plus length limits on all text. All SQL is parameterized.

## 5. Remaining references to Supabase / Cloudflare

`grep -ri "supabase\|cloudflare\|opennext\|wrangler"` (excluding
`node_modules` and the lockfile) now finds only:

| Where | Why it stays |
|---|---|
| `scripts/import-supabase.mjs`, `tests/integration/import-supabase.test.ts`, `tests/fixtures/supabase-export/` | The optional one-time importer and its test. It reads exported files only. The app never imports it, and it needs no Supabase package or connection. |
| `docs/legacy/supabase-schema.sql` | The old Postgres schema, kept as reference for mapping exported data. It's marked as unused. |
| `docs/DATA_MIGRATION.md`, this file, `README.md` links | Documentation of the migration. |
| Comments in `db/migrations/0001_initial_schema.sql`, `lib/services/users.ts`, `lib/auth/authorize.ts`, `components/BarnDisplayClient.tsx`, `scripts/users.mjs` | Explain what the code replaced. |
| `.gitignore` (`/supabase-export/`) | Keeps exported personal data out of git. |
| `tests/unit/db-config.test.ts` | Checks that a leftover Postgres URL is rejected. |

Removed: `@supabase/ssr`, `@supabase/supabase-js`, `@opennextjs/cloudflare`,
`wrangler`, `@cloudflare/workers-types`, `lib/supabase/*`,
`open-next.config.ts`, `wrangler.toml`, `.mcp.json` (Supabase MCP server
config), and the `NEXT_PUBLIC_SUPABASE_*` variables.

## 6. Verification performed (development container)

Environment: Ubuntu 24.04, Node.js 22.22, **MariaDB 10.11.14** (the version
family Plesk ships), with the test database user granted only
`SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES` on
its own database.

| Check | Result |
|---|---|
| `npm ci` from the lockfile | ✅ clean install |
| `npm run lint` | ✅ no warnings or errors |
| `npm run typecheck` | ✅ |
| `npm run build` | ✅ all 29 routes built; no database needed at build time |
| `npm test` (with `TEST_DATABASE_URL`) | ✅ **108 / 108 passed** across 12 files (unit 45, integration 52, end-to-end 11) |
| `npm run db:migrate` twice, `db:status`, `db:check` | ✅ applies once, second run "up to date" |
| `create-admin` (weak password rejected, second admin refused), `set-password` | ✅ |
| `import:supabase --dry-run` and the real import on fixture data | ✅ (also covered by tests) |
| `db:seed-demo` (refuses without `--yes`, no-op when horses exist) | ✅ |
| `node server.js` and `next start` honour `PORT` and serve `/api/health` | ✅ |
| Redirects behind a reverse proxy use the public `Host` / `X-Forwarded-Proto` | ✅ (found and fixed during testing) |

What the tests cover:

- **Authentication:** sign-in, generic errors, accounts without passwords,
  account and IP throttling, idle and absolute session expiry, sliding
  renewal, logout revocation, forged and malformed tokens, password change and
  admin reset revoking sessions, role changes taking effect immediately.
- **Authorization:** every admin-only service rejects employees and anonymous
  callers. End to end, the real admin Server Actions are POSTed directly as an
  employee and as an anonymous user, with no row written; the same request as
  an admin writes a row (positive control). Employees are redirected away from
  `/admin`. Anonymous API calls get 401.
- **CRUD:** tasks, shifts, availability, time off, horses, charts (including the
  barn sync), feeding logs, announcements, notes, clock and users.
- **Validation:** invalid UUIDs, dates, times, enums, lengths and missing
  foreign keys.
- **Transactions and duplicates:** rollback on error, rollback of a failed chart
  save, duplicate emails, PKs and logs, concurrent comments, concurrent
  clock-ins, concurrent feeding upserts.
- **Database failures:** unreachable or unconfigured database gives safe 503s
  and a failing `/api/health`, while `/login` still renders and no secrets are
  leaked.
- **Production server:** `node server.js` with static assets, cookie flags and
  public barn display data.

## 7. Still to verify on the Plesk server

These depend on the real server and couldn't be exercised here:

1. **Passenger startup:** Plesk Node.js with startup file `server.js` boots, and
   *Restart App* / `tmp/restart.txt` restarts it. Passenger isn't available in
   the dev container; `node server.js` itself is tested.
2. **Database grants:** `npm run db:migrate` as `bhf_migrate` and `npm run db:check`
   as `bhf_app` (SELECT/INSERT/UPDATE/DELETE only) against Plesk's MySQL or
   MariaDB version.
3. **HTTPS:** the session cookie is set over HTTPS and sign-in works through
   Plesk's nginx proxy. The proxy must forward `Host`/`X-Forwarded-Host` for
   the Origin check; Plesk does by default.
4. **Client IPs:** `X-Real-IP` reaches the app for per-IP throttling. If it
   doesn't, account-level throttling still applies.
5. **Barn TVs:** the displays load from the new domain, and the browser can
   still reach the Open-Meteo weather API (unchanged, called from the TV's
   browser).
6. **Data import:** run it with the real export, if one is still obtainable.

## 8. Known issues and follow-ups

- **`npm audit`:** after `npm audit fix` (Next 15.5.18 → 15.5.28, which fixed
  a critical advisory and several high ones that were already present before
  the migration), one advisory remains: the copy of PostCSS bundled inside
  Next.js 15. It only processes this repository's own CSS at build time, and
  the fix requires Next 16 (a major upgrade), which is not part of this
  migration.
- **`next lint`** is deprecated in Next 15.5 (it still works). Migrating to the
  ESLint CLI can happen together with a future Next 16 upgrade.
- **React 18 with Next 15:** kept as it was in the repository. The App Router
  uses Next's bundled React, and the build and tests pass.
- **Old passwords:** Supabase password hashes aren't imported, so every user
  needs a new password (set by an admin) after the move. This is deliberate:
  it avoids carrying a bcrypt verification path just for migration.
