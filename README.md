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

## Step 4 — deploy to Cloudflare Pages

This project ships with `@cloudflare/next-on-pages@1.13.15` (the last version
that supports Next.js 14.2.x). Every server-rendered route is opted into the
Edge runtime via `export const runtime = "edge"`.

### Cloudflare Pages dashboard settings

In the Pages project → **Settings → Builds & deployments**:

| Setting                | Value                                       |
| ---------------------- | ------------------------------------------- |
| Build command          | `npx @cloudflare/next-on-pages@1.13.15`     |
| Build output directory | `.vercel/output/static`                     |
| Root directory         | (leave blank)                               |
| Node version           | env var `NODE_VERSION` = `20.18.1`          |

In **Settings → Functions → Compatibility flags**:
- Add `nodejs_compat` (both Production and Preview).

In **Settings → Environment variables**:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://xtvwxgqrzswsuzouztkt.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (value from `.env.local`)

Bind both vars to **Production** and **Preview**, then trigger a redeploy.

### Local Cloudflare-style build (Linux / macOS / WSL only)

The `next-on-pages` CLI shells out via bash and isn't reliable on raw Windows.
On Linux/macOS/WSL:

```bash
npm run pages:build         # produces .vercel/output/static
npm run pages:preview       # serve locally with wrangler
npm run pages:deploy        # direct wrangler deploy (requires wrangler login)
```

### Post-deploy

Add the Cloudflare Pages URL (e.g. `https://buckshavenfarm.pages.dev`) to the
Supabase **Authentication → URL configuration** Site URL + Redirect URL lists.

### Future: switch to OpenNext (optional)

`@cloudflare/next-on-pages` was deprecated in favor of
[OpenNext for Cloudflare](https://opennext.js.org/cloudflare). The OpenNext
adapter supports the Node.js runtime, so a future migration could remove the
`export const runtime = "edge"` lines and stop relying on `next-on-pages`.

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
