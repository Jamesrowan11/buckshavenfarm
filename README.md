# Bucks Haven Farm

Farm operations portal — Next.js 14 (App Router) + Supabase + Tailwind.

## Step 1 — install Node.js

This machine doesn't have Node yet. Install **Node.js 20 LTS** from <https://nodejs.org/en/download>.
After installing, open a **new** PowerShell window so the PATH refreshes, then verify:

```powershell
node --version   # expect v20.x
npm --version
```

## Step 2 — Supabase setup

1. Open the SQL editor at <https://supabase.com/dashboard/project/xtvwxgqrzswsuzouztkt/sql/new>
2. Paste the contents of `supabase/schema.sql` and run it. This creates every table, RLS policy, and a trigger that auto-creates a profile row on user signup.
3. In **Authentication → Users → Add user** create one user for each of the four people, using email + a temporary password (uncheck "auto-confirm" only if you want them to confirm by email):
   - `james@northvaleunified.com`
   - `cynthiarowan777@gmail.com`
   - `theresarowan777@gmail.com`
   - `landenrowan@gmail.com`
   The trigger inserts a `profiles` row for each. The `update` blocks at the bottom of `schema.sql` then promote James + Cynthia to `admin` and fix display names. Re-run those two `update` statements after creating the users (the trigger uses lowercase emails, the seed expects lowercase — already matched).
4. **Authentication → URL configuration** → add your Cloudflare Pages domain (and `http://localhost:3000` for dev) to the **Site URL** + **Redirect URLs** lists.

## Step 3 — local dev

```powershell
cd C:\Users\Administrator\BucksHavenFarm
npm install
npm run dev
```

Open <http://localhost:3000>, sign in as any of the four users.

## Step 4 — deploy to DigitalOcean

The app runs on a DigitalOcean droplet the same way as rowancopy.com: Node.js
(`next start`) behind **Caddy** with automatic HTTPS, settings in
`/etc/buckshavenfarm/env` (outside the repository), and **automatic deploys**:
every 3 minutes the server checks GitHub and rebuilds when `main` has new
commits. A failed build rolls back to the last commit that built. All data
stays in Supabase.

### New droplet (no SSH needed)

1. Create an Ubuntu 24.04 droplet (2 GB RAM or more), or reuse one running another app.
2. In **User data**, paste `infra/digitalocean/user-data.sh` with `APP_DOMAIN` and
   `SUPABASE_ANON_KEY` filled in (Supabase → Project Settings → API → the
   **anon public** key; never the `service_role` key).
3. Point the domain's **A record** at the droplet. HTTPS starts once DNS points there.
4. In Supabase → **Authentication → URL configuration**, add `https://<your domain>`
   to **Site URL** and **Redirect URLs**.

Or, on an existing droplet:
`sudo APP_DOMAIN=buckshavenfarm.com SUPABASE_ANON_KEY=eyJ... bash infra/digitalocean/setup.sh`

The app listens on `127.0.0.1:3001`, so it can share a droplet with other apps
(each adds its own site file in `/etc/caddy/sites/`).

### Useful commands

| What | Command |
|---|---|
| Deploy now | `sudo /usr/local/sbin/buckshavenfarm-deploy --force` |
| Deploy log | `journalctl -u buckshavenfarm-deploy -n 100` |
| App log | `journalctl -u buckshavenfarm -n 100` |
| Change settings | edit `/etc/buckshavenfarm/env`, then deploy with `--force` (the Supabase values are built into the app) |

### Cloudflare (older option)

The Cloudflare Workers build still works: `npm run cf:build`, `npm run cf:deploy`
(see `wrangler.toml` and `open-next.config.ts`).

## Project layout

```
app/
  login/                   # public sign-in
  admin/                   # admin portal (sidebar nav)
    page.tsx               # dashboard
    tasks/ schedule/ availability/ feeding-charts/
    announcements/ employees/ clock-log/ notes/
  employee/                # employee portal (bottom-nav)
    page.tsx               # home
    tasks/ schedule/ feeding-charts/ availability/
    time-off/ clock/ announcements/ more/
components/                # AdminSidebar, EmployeeBottomNav, etc.
lib/supabase/              # browser/server/middleware clients
supabase/schema.sql        # tables, RLS, trigger, seed
middleware.ts              # auth refresh + route protection
```

## Roles & access
- **admin** — full access (sidebar nav on desktop, bottom nav on phone)
- **employee** — own tasks/schedule, feed checklist, availability, time off, clock, announcements

Toggle roles from `/admin/employees`.
