# Deploying the portal to your AWS Ubuntu Plesk server

The portal is Next.js + Prisma + MariaDB — the same shape as the HVAC system,
same deploy routine. It lives in this repo under `portal/`.

## 1. Create the database (Plesk → Databases)

1. **Add Database** → name `bhf_portal`.
2. Add a database user `bhf_portal` with a strong password (write it down).
3. That's it — tables are created by Prisma migrations on deploy.

## 2. Create the site & Node.js app

1. **Websites & Domains → Add Subdomain** → `portal.buckshavenfarm.com`
   (or use a subfolder domain if you prefer). Point DNS A record at the server
   like the main site, and issue a Let's Encrypt cert for it.
2. Pull the repo onto the server (Plesk → Git, or clone by SSH) so the app
   code is at e.g. `/var/www/vhosts/buckshavenfarm.com/repo/portal`.
3. **Websites & Domains → portal subdomain → Node.js**:
   - Node version: **22** (or 20+)
   - Document root: `/repo/portal/public`
   - Application root: `/repo/portal`
   - Application startup file: `server.js` *(created by the build — see step 4)*
4. **Environment variables** (same Node.js screen):
   - `DATABASE_URL` = `mysql://bhf_portal:PASSWORD@localhost:3306/bhf_portal`
   - `AUTH_SECRET` = long random string (`openssl rand -base64 48`)
   - `SEED_PASSWORD` = the initial family password you want
   - `NODE_ENV` = `production`
   - `UPLOADS_DIR` = `/var/www/vhosts/buckshavenfarm.com/portal-uploads`
     (create the folder; it holds Coggins/vaccine documents OUTSIDE the web root
     so they survive redeploys and are only served through the access-checked route)

## 3. First deploy (SSH as the subscription user)

```bash
cd /var/www/vhosts/buckshavenfarm.com/repo/portal
npm install
npm run deploy          # prisma migrate deploy + prisma generate + next build
npm run seed            # creates the four family accounts (safe to re-run)

# Passenger needs the standalone server as the startup file:
cp -r .next/standalone/* .        # puts server.js at the app root
cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
mkdir -p tmp && touch tmp/restart.txt
```

> **Note on `output: "standalone"`:** the build creates `.next/standalone/server.js`.
> Passenger's startup file should be that `server.js` (either copy it up as above
> or point the startup file directly at `.next/standalone/server.js` and set
> the app root accordingly). Static assets: also copy `.next/static` into
> `.next/standalone/.next/` and `public/` into `.next/standalone/public/` if you
> run from the standalone folder.

## 4. Every update after that

```bash
cd /var/www/vhosts/buckshavenfarm.com/repo
git pull
cd portal && npm install && npm run deploy
touch tmp/restart.txt
```

Database changes ship as migrations and run automatically during deploy —
same two-command routine as the HVAC portal.

## 5. First login

- Sign in at `https://portal.buckshavenfarm.com` with
  `james@northvaleunified.com` / the `SEED_PASSWORD` you set.
- Change passwords, then add staff and boarders under **Users** /
  **Boarders**, or bulk-load everyone via **Import** (CSV format is shown
  on the page).

## 6. Barn TVs

Point each barn TV's browser at (no login needed, auto-refreshes every 60s):

- `https://portal.buckshavenfarm.com/barn-display/log-barn`
- `https://portal.buckshavenfarm.com/barn-display/arena-barn`

## 7. Retiring the old Supabase/Cloudflare portal

Once staff confirm the new portal covers their day (tasks, shifts, feeding,
clock), take the old Cloudflare Pages project offline and remove the Supabase
keys. If any real data accumulated there, export it and load it via the CSV
import (boarders/horses) or ask Claude to write a one-shot migration script
against the Supabase API.

## Local development

```bash
cd portal
cp .env.example .env    # fill in a local MySQL/MariaDB and any secret
npm install
npx prisma migrate dev
npm run seed
npm run dev             # http://localhost:3000
```
