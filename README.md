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
4. **Authentication → URL configuration** → add your Netlify domain (and `http://localhost:3000` for dev) to the **Site URL** + **Redirect URLs** lists.

## Step 3 — local dev

```powershell
cd C:\Users\Administrator\BucksHavenFarm
npm install
npm run dev
```

Open <http://localhost:3000>, sign in as any of the four users.

## Step 4 — deploy to Netlify

Two options — pick one.

### Option A: GitHub + Netlify (recommended)

```powershell
cd C:\Users\Administrator\BucksHavenFarm
git init
git add .
git commit -m "Initial commit"
# create an empty repo on GitHub, then:
git remote add origin https://github.com/<you>/bucks-haven-farm.git
git branch -M main
git push -u origin main
```

Then in Netlify:
1. **Add new site → Import an existing project → GitHub** and pick the repo.
2. Build settings auto-detect from `netlify.toml` (build: `npm run build`, publish: `.next`, plugin: `@netlify/plugin-nextjs`).
3. **Site settings → Environment variables** → add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://xtvwxgqrzswsuzouztkt.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (the anon key from `.env.local`)
4. Trigger a deploy.

### Option B: Netlify CLI direct deploy

```powershell
npm install -g netlify-cli
cd C:\Users\Administrator\BucksHavenFarm
netlify login
netlify init            # create-and-link a new site
netlify env:set NEXT_PUBLIC_SUPABASE_URL "https://xtvwxgqrzswsuzouztkt.supabase.co"
netlify env:set NEXT_PUBLIC_SUPABASE_ANON_KEY "<paste the anon key>"
netlify deploy --build --prod
```

After deploy, add the Netlify URL to Supabase **URL configuration** (Step 2.4).

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
