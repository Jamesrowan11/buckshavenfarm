# Putting the portal live — all through the Plesk panel, no terminal

The portal lives at **https://buckshavenfarm.com/portal** — same domain as the
website. Everything below happens in the Plesk web panel with clicks; the only
typing is names, passwords, and two one-word script names.

**How it works:** Plesk's Node.js manager runs the portal app (startup file
`server.js`, already in the repo). Plesk requires the domain's document root
to sit INSIDE the app folder, so the deploy step copies the public website
into `portal/httpdocs` automatically — the domain's Document Root points
there, static pages are served first, and leftover addresses (`/portal/...`)
go to the app. The website's contact form and gallery run inside the app
(`/portal/api/tour-request`, `/portal/api/site-gallery`) — the old PHP files
are not used anymore.

---

## One-time setup

### 1. Create the database

Plesk → **Databases → Add Database**
- Database name: `bhf_portal`
- Related site: buckshavenfarm.com
- Add a database user: `bhf_portal` + a strong password → **OK**
- Keep the password handy for step 3.

### 2. Connect the repository

Plesk → **Websites & Domains → buckshavenfarm.com → Git → Add Repository**
- Remote Git hosting → URL: `https://github.com/Jamesrowan11/buckshavenfarm.git`
- Branch: `main` (or the branch you're using)
- **Deployment path: create/choose a folder that is NOT `httpdocs`**, e.g.
  `bhf-repo` — the repo must not be web-served.
- Deployment mode: Automatic → **OK**. Plesk clones the repo for you.

### 3. Turn on the Node.js app

Plesk → **Websites & Domains → buckshavenfarm.com → Node.js**
- Node.js version: **22** (or newest offered)
- Application Root: `bhf-repo/portal`
- Application Startup File: `server.js`
- Application Mode: `production`
- Document Root: `bhf-repo/portal/httpdocs`  ← MUST be inside the app root;
  this folder is created by the `deploy` script (step 4) and contains a copy
  of the public website, refreshed on every deploy. Change it under
  **Hosting Settings** after step 4 if Plesk won't accept it before the
  folder exists.
- **Custom environment variables** → add these four:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | `mysql://bhf_portal:YOUR-DB-PASSWORD@localhost:3306/bhf_portal` |
| `AUTH_SECRET` | any long random string, 50+ characters — a password generator on its longest setting is perfect |
| `SEED_PASSWORD` | the first-login password for the four family accounts |
| `UPLOADS_DIR` | `/var/www/vhosts/buckshavenfarm.com/bhf-uploads` |

- For `UPLOADS_DIR`, also create that folder once: **Files** → Home directory
  → **+ → Create Directory** → `bhf-uploads`. (Horse documents are stored
  there, outside the web root, so nobody can download them without logging in.)
- Click **Enable Node.js** if it isn't enabled yet.

### 4. Install, build, seed — three buttons

Still on the Node.js screen:
1. **NPM Install** — installs the app's packages (a few minutes).
2. **Run script** → type `deploy` → Run. Builds the app and creates all the
   database tables.
3. **Run script** → type `seed` → Run. Creates the four family logins
   (James + Cynthia as admins, Theresa + Landen as employees).
4. **Restart App**.

### 5. Sign in

Go to **https://buckshavenfarm.com/portal** — log in as
`james@northvaleunified.com` with your `SEED_PASSWORD`. Change passwords,
then add staff and boarders under **Users** / **Boarders**, or bulk-load
everyone from a spreadsheet via **Import**.

---

## Updating the portal later

When new code is pushed to GitHub:
1. **Git** → the repo pulls automatically (or click **Pull Updates**).
2. **Node.js** → **NPM Install** → **Run script:** `deploy` → **Restart App**.

Database changes are included automatically — `deploy` applies them.

*(Optional, to make updates one click: Git → Repository Settings → "Actions
for additional deployment" → paste `cd portal && npm install && npm run deploy`
once. After that, every pull rebuilds itself — you only click Restart App.)*

---

## Barn TVs

Point each TV's browser at (no login needed — refreshes every 60 seconds and
auto-sizes itself to any TV, landscape or portrait, however many horses):

- `https://buckshavenfarm.com/portal/barn-display/log-barn`
- `https://buckshavenfarm.com/portal/barn-display/arena-barn`

---

## Good to know

- **The public website is untouched** — same `httpdocs`, same contact form.
  If the contact form ever stops emailing after enabling Node.js, say so and
  we'll fold it into the portal app.
- **Old portal:** once staff are comfortable here, switch off the old
  Cloudflare Pages project and the Supabase keys.
- **If something looks stuck:** the Node.js screen has the app's log under
  **Show Logs** — send Claude a screenshot of the last lines.
