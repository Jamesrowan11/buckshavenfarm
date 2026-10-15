# Bucks Haven Farm

Farm operations portal: Next.js 15 (App Router) + MySQL/MariaDB + Tailwind,
self-hosted on Plesk with its Node.js extension.

- **Deploying to Plesk:** [docs/PLESK_DEPLOYMENT.md](docs/PLESK_DEPLOYMENT.md)
- **Bringing over data from the old Supabase project:** [docs/DATA_MIGRATION.md](docs/DATA_MIGRATION.md)
- **What changed in the Supabase → Plesk migration, and test results:** [docs/MIGRATION_NOTES.md](docs/MIGRATION_NOTES.md)

## Features

| Area | Admin | Employee |
|---|---|---|
| Dashboard | open tasks, today's shifts, who's clocked in, pending time off | today's shift, my tasks, announcements |
| Tasks | create / assign / complete / delete | complete, comment (own or "everyone" tasks) |
| Schedule | create / delete shifts for the week | my week |
| Availability & time off | review availability, approve/deny requests | submit availability, request time off |
| Feeding charts | horses, AM/PM charts, supplements, barn assignment | today's checklist, mark fed |
| Barn displays | `/barn-display`, `/barn-display/log-barn`, `/barn-display/arena-barn`: public TV screens with clock, weather, feeding status and announcements | |
| Announcements | post / delete | read |
| Clock | full clock log | clock in / out |
| Employees | add users, set roles, rename, reset passwords, remove | change own password |
| Admin notes | private notes | |

## Local development

Requirements: Node.js 20.9+ (22 LTS recommended) and a local MySQL 8 or
MariaDB 10.5+ database.

```bash
npm install
cp .env.example .env.local        # then fill in DB_* for your local database
npm run db:migrate                # create the tables
npm run create-admin -- --email you@example.com --name "Your Name"
npm run dev                       # http://localhost:3000
```

Locally over plain HTTP, `npm run dev` works as-is; `next dev` doesn't mark
cookies Secure.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build (`next build`) |
| `npm start` | production server via `next start` (honours `PORT`) |
| `npm run start:plesk` | production server via `server.js` (what Plesk/Passenger runs) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | all tests (integration and e2e tests need `TEST_DATABASE_URL`, see below) |
| `npm run db:migrate` | apply pending SQL migrations in `db/migrations` (never drops data) |
| `npm run db:status` | list applied/pending migrations |
| `npm run db:check` | database health check (connection, time zone, migrations, admin exists) |
| `npm run create-admin -- --email … --name …` | create the first administrator (server-side only) |
| `npm run set-password -- --email …` | set a user's password from the server (account recovery) |
| `npm run import:supabase -- --dir … [--dry-run]` | one-time import of exported Supabase data |
| `npm run db:seed-demo -- --yes` | optional sample horses + announcement for an empty test install |

## Tests

```bash
npm run test:unit                                   # no database needed

# Integration + end-to-end tests use a throwaway database whose name contains
# "test". They DROP and recreate its tables.
export TEST_DATABASE_URL='mysql://bhf_test:<password>@localhost:3306/bhf_test'
npm run build                                       # e2e tests start the production build
npm test
```

## Project layout

```
app/                    # routes (admin/, employee/, barn-display/, login/, logout/, api/)
  api/auth/login/       # sign-in endpoint (sets the session cookie)
  api/barn-display/     # public read-only data for the barn TVs
  api/health/           # health check for monitoring
components/             # sidebar, bottom nav, barn display, badges
lib/
  db.ts                 # server-only MySQL pool, queries, transactions
  auth/                 # sessions, login throttling, CSRF/origin checks, current user
  services/             # one module per feature; every function authorizes its caller
  shared/               # DB config + Argon2id hashing (shared with the CLI scripts)
  time.ts               # UTC storage / farm-time-zone display
  validation.ts         # input validation
db/migrations/          # versioned SQL schema
scripts/                # migrate, db-check, create-admin/set-password, Supabase import, demo seed
server.js               # production entry point for Plesk/Passenger
middleware.ts           # redirects visitors without a session cookie to /login
tests/                  # unit, integration (MariaDB) and e2e (production server) tests
docs/                   # deployment, data migration, migration notes; legacy Supabase schema
```

## Roles & access

- **admin**: full access (sidebar on desktop, bottom nav on phones). Admins can
  also open the employee portal.
- **employee**: own tasks and tasks for everyone, own schedule, feeding checklist,
  availability, time off, clock, announcements.

Roles are stored in the database and checked on the server for every page,
form action and API call; hiding a button is never the only protection.
Change roles from `/admin/employees`.
