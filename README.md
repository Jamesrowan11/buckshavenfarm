# Bucks Haven Farm

Farm operations portal: Next.js (App Router) + Tailwind, with its own MariaDB
database and built-in logins. No outside services: everything runs on the
DigitalOcean apps server.

## How it works

- **Data:** MariaDB tables in `db/schema.sql`, created and updated on every deploy by
  `scripts/migrate.mjs`.
- **Permissions:** `lib/db/policies.ts` decides who may read and change each table
  (employees see their own shifts and clock log, only admins manage horses, charts,
  announcements, schedules and notes, and so on). Every query goes through
  `lib/db/query.ts`, which applies those rules, so a page can't skip them.
- **Logins:** `lib/auth.ts`. Passwords are bcrypt hashes; a signed, httpOnly cookie
  keeps people signed in for 14 days. Changing a password signs that person out everywhere.
- **Barn display** (`/barn-display`, `/barn-display/log-barn`, `/barn-display/arena-barn`):
  public, read-only, refreshes every 15 seconds from `/api/barn-display`.

## First sign-in

The four farm accounts are created automatically (James and Cynthia as admins,
Theresa and Landen as employees). Each person opens **/setup**, enters their email,
the **setup code** (from the owner) and a new password. The code only works for
accounts that don't have a password yet; its SHA-256 hash is in
`infra/digitalocean/site.conf`.

After that, admins add people and reset passwords on **Admin → Employees**.

## Local development

```bash
npm install
# A local MariaDB/MySQL database:
export DATABASE_URL=mysql://user:pass@127.0.0.1:3306/buckshavenfarm
export AUTH_SECRET=$(openssl rand -hex 32)
export SETUP_CODE_SHA256=$(printf %s 'LOCAL-CODE' | sha256sum | cut -d' ' -f1)
npm run migrate
npm run dev
```

Open <http://localhost:3000/setup> and use `LOCAL-CODE`.

## Deploying (DigitalOcean)

The app runs on the same apps server as RowanHVAC, the same way as rowancopy.com:
Node.js (`next start` on 127.0.0.1:3001) behind **Caddy** with automatic HTTPS,
settings in `/etc/buckshavenfarm/env` (outside the repository), and **automatic
deploys**: every 3 minutes the server checks GitHub and, when `main` has new
commits, creates the database if needed, migrates, rebuilds and restarts. A failed
build rolls back to the last commit that built.

### New droplet (no SSH needed)

1. Create an Ubuntu 24.04 droplet (2 GB RAM or more), or reuse one running another app.
2. In **User data**, paste `infra/digitalocean/user-data.sh` with `APP_DOMAIN` filled in.
3. Point the domain's **A record** at the droplet. HTTPS starts once DNS points there.

Or, on an existing droplet: `sudo APP_DOMAIN=buckshavenfarm.com bash infra/digitalocean/setup.sh`

### Useful commands

| What | Command |
|---|---|
| Deploy now | `sudo /usr/local/sbin/buckshavenfarm-deploy --force` |
| Deploy log | `journalctl -u buckshavenfarm-deploy -n 100` |
| App log | `journalctl -u buckshavenfarm -n 100` |

## Project layout

```
app/
  login/  setup/           # sign-in and first-time password
  admin/                   # admin portal (sidebar nav)
    tasks/ schedule/ availability/ feeding-charts/
    announcements/ employees/ clock-log/ notes/
  employee/                # employee portal (bottom nav)
    tasks/ schedule/ feeding-charts/ availability/
    time-off/ clock/ announcements/ more/
  barn-display/            # public barn screens
  api/barn-display/        # their data
components/                # AdminSidebar, EmployeeBottomNav, BarnDisplayClient, etc.
db/schema.sql              # tables + the farm's accounts
lib/auth.ts                # logins and sessions
lib/db/                    # database pool, permission rules, query builder
middleware.ts              # sends signed-out visitors to /login
infra/digitalocean/        # server setup and automatic deploys
```

## Roles & access
- **admin**: full access (sidebar nav on desktop, bottom nav on phone)
- **employee**: own tasks/schedule, feed checklist, availability, time off, clock, announcements

Change roles and passwords from `/admin/employees`.
