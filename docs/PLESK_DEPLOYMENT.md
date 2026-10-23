# Deploying Bucks Haven Farm on Plesk

This guide installs the portal on a Plesk server using Plesk's **Node.js**
extension (Phusion Passenger behind nginx) and a **MySQL/MariaDB database
created in Plesk**. Nothing here needs Supabase, Cloudflare, or a developer's
computer to stay online.

Placeholders used below. Replace them with your own values:

| Placeholder | Meaning |
|---|---|
| `portal.example.com` | the domain or subdomain the portal will live on |
| `bhf_portal` | database name |
| `bhf_app` | database user the running website uses (data access only) |
| `bhf_migrate` | database user for schema migrations (can create/alter tables) |
| `/var/www/vhosts/portal.example.com/httpdocs` | the site's home folder (Plesk default) |

---

## 1. Requirements

- Plesk Obsidian with the **Node.js** extension installed
  (*Extensions → Node.js*). Pick **Node.js 22 LTS** (20.9 or newer works).
- MySQL 8.0+ or MariaDB 10.5+ (the database server bundled with Plesk is fine).
- SSH access for the site's system user is strongly recommended. It's needed to
  create the first administrator, because that is deliberately not possible
  from the web. Turn it on under *Websites & Domains → portal.example.com →
  Hosting & DNS → Hosting → SSH access → /bin/bash (chrooted is OK)*.
- An SSL certificate (Let's Encrypt via *SSL/TLS Certificates*). The app sends
  its session cookie only over HTTPS in production.

## 2. Create the database and least-privilege users

The running app only reads and writes rows. Only migrations create or alter
tables. Use two database users so a compromised web process can't change the
schema.

### In the Plesk UI

1. *Websites & Domains → portal.example.com → Databases → Add Database*
   - Database name: `bhf_portal`
   - Database server: the local MySQL/MariaDB server
   - Create a database user: `bhf_migrate`, with a long random password.
     Leave its role at **Read and Write**. That role includes CREATE/ALTER/DROP,
     which migrations need.
2. *Databases → User Management → Add Database User*
   - Username `bhf_app`, another long random password, database `bhf_portal`
   - Role: **Custom**, with only **SELECT, INSERT, UPDATE, DELETE** ticked
   - Access control: *Allow local connections only*
3. Note the host (normally `localhost`) and port (normally `3306`).

> **Simpler, less strict option:** use a single "Read and Write" user for both
> the app and migrations. It works, but the web process can then drop tables.

### Equivalent SQL (for admins with root database access)

```sql
CREATE DATABASE bhf_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'bhf_migrate'@'localhost' IDENTIFIED BY '<long random password 1>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON bhf_portal.* TO 'bhf_migrate'@'localhost';

CREATE USER 'bhf_app'@'localhost' IDENTIFIED BY '<long random password 2>';
GRANT SELECT, INSERT, UPDATE, DELETE ON bhf_portal.* TO 'bhf_app'@'localhost';
```

Generate passwords with e.g. `openssl rand -base64 32`. If a password contains
`@ : / ? #` and you use `DATABASE_URL`, URL-encode it, or use the separate
`DB_*` variables instead, which need no encoding.

## 3. Put the code on the server

Choose one:

- **Plesk Git** (*Websites & Domains → Git*): add the repository
  `https://github.com/Jamesrowan11/buckshavenfarm.git`, branch `main`,
  deployment path `/httpdocs`. Leave deploy actions empty for now. The build
  steps are run below.
- **Upload**: upload the repository files (without `node_modules` and
  `.next`) into `httpdocs` with File Manager or SFTP.

## 4. Configure the Node.js application

*Websites & Domains → portal.example.com → Node.js → Enable Node.js*, then set:

| Setting | Value |
|---|---|
| Node.js version | 22.x (or newer LTS) |
| Package manager | npm |
| Document root | `/httpdocs/public` |
| Application mode | `production` |
| Application root | `/httpdocs` |
| Application startup file | `server.js` |

**Why `server.js`:** Passenger starts the app by running one file, with no
command-line arguments. Pointing it at `node_modules/.bin/next` would start
`next dev`, the development server, because that is Next's default command.
`server.js` starts the standard Next.js **production** server from the
`npm run build` output. Passenger supplies the port itself, so no port
setting is needed.

### Environment variables

Click **Custom environment variables** and add the following (see
`.env.example` for the full list):

| Name | Value |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_NAME` | `bhf_portal` |
| `DB_USER` | `bhf_app` |
| `DB_PASSWORD` | *bhf_app's password* |
| `APP_TIME_ZONE` | `America/New_York` |

Never add a variable starting with `NEXT_PUBLIC_` for secrets. Those are
copied into the JavaScript sent to browsers.

Alternative: put the same lines in `/httpdocs/.env.production`
(`chmod 600 .env.production`). It's outside the document root, so nginx
never serves it, and both the app and the `npm run db:*` scripts read it.
Variables set in the Plesk panel take precedence over the file.

## 5. Install, build, migrate

Run these from the Node.js page buttons or over SSH. Over SSH, first put
Plesk's Node on the PATH (adjust the version number):

```bash
cd /var/www/vhosts/portal.example.com/httpdocs
export PATH=/opt/plesk/node/22/bin:$PATH
node --version                    # v22.x
```

1. **Install dependencies** (Node.js page → *NPM install*, or):
   ```bash
   npm ci                         # installs exactly what package-lock.json lists
   ```
   The build needs the dev dependencies (TypeScript, Tailwind), so don't use
   `--omit=dev` here.
2. **Build** (*Run script* → `build`, or):
   ```bash
   npm run build
   ```
   It should end with a route table and no errors. The build does not need the
   database.
3. **Create the tables.** Migrations should run as `bhf_migrate`. Over SSH, give
   that user's credentials to this one command only. `read -s` keeps the
   password out of shell history:
   ```bash
   read -rs -p "bhf_migrate password: " DB_PASSWORD; echo
   DB_USER=bhf_migrate DB_PASSWORD="$DB_PASSWORD" npm run db:migrate
   unset DB_PASSWORD
   ```
   Expected: `Applying 0001_initial_schema.sql ... done`. Running it again
   prints `Database schema is up to date.` It never drops or overwrites data,
   and the app never runs migrations by itself at startup.
   (If you chose the single-user option, plain `npm run db:migrate` works,
   including from *Run script*.)
4. **Check the database connection** as the app user:
   ```bash
   npm run db:check
   ```
   Expected: the server version, `time zone: +00:00`, `migrations: all 1 applied`,
   and a warning that no administrator exists yet.

## 6. Create the first administrator

Over SSH, in the application folder:

```bash
npm run create-admin -- --email you@example.com --name "Your Name"
```

You'll be asked for the password twice. It's hidden, at least 10 characters,
and never shown or logged. The command:

- refuses to run if an administrator already exists (add more admins from the
  website, or pass `--additional` deliberately);
- if the email already belongs to a user (for example one imported from
  Supabase), promotes that user and sets the password;
- talks to the database directly, so it works before the site is online.

There is no public sign-up page, no default admin, and no default password.

**Without SSH:** you can't create the first admin from the web, by design. Ask
your host to enable SSH for the site user, or have them run the command above
for you.

## 7. Start the site and enable HTTPS

1. Node.js page → **Restart App**. Over SSH, `touch tmp/restart.txt` in the
   application root does the same.
2. *SSL/TLS Certificates* → issue a Let's Encrypt certificate for the domain,
   and turn on **Redirect from HTTP to HTTPS**.
3. Visit `https://portal.example.com/api/health`. It should return
   `{"status":"ok","database":"ok"}`.
4. Visit `https://portal.example.com/`, sign in as the admin, then add staff
   under **Employees → Add user**. Give each person a temporary password
   privately; they can change it under **More → Change password**.

The barn TVs keep using `https://portal.example.com/barn-display`,
`/barn-display/log-barn` and `/barn-display/arena-barn` (no sign-in, as before).

## 8. Updating the site later

```bash
cd /var/www/vhosts/portal.example.com/httpdocs
export PATH=/opt/plesk/node/22/bin:$PATH
git pull                 # or "Pull now" / "Deploy now" in Plesk Git
npm ci
npm run build
# only if the update added files in db/migrations/ (see step 5.3 for the credentials):
npm run db:migrate
touch tmp/restart.txt    # or "Restart App"
```

You can paste the non-interactive part (`npm ci && npm run build && touch
tmp/restart.txt`) into Plesk Git's **additional deployment actions** so that
"Deploy now" does it all.

## 9. Backups

Use *Websites & Domains → Backup Manager* (include databases), or schedule a
dump:

```bash
mysqldump --single-transaction --routines bhf_portal > bhf_portal-$(date +%F).sql
```

## 10. Troubleshooting

| Symptom | Check |
|---|---|
| 502/503 or "Web application could not be started" | Node.js page → logs; usually `npm run build` wasn't run or failed. `server.js` prints "Did you run `npm run build`?" in that case. |
| Site is slow and says it's in development mode | The startup file must be `server.js`, not `next`. Application mode must be `production`. |
| `/api/health` returns 503 | Run `npm run db:check` over SSH. It shows the exact connection problem (wrong password, host, missing grants or pending migrations) without printing secrets. |
| Signing in does nothing, and you're immediately back at the login page | The site is on plain HTTP. Secure cookies need HTTPS. Turn on the certificate and the redirect. For a temporary HTTP-only test you can set `COOKIE_SECURE=false`. |
| "Invalid request origin" on sign-in | The site is reached through a hostname the proxy doesn't forward. Add it to `ALLOWED_ORIGINS` (comma-separated) and restart. |
| "Too many attempts" | 5 wrong passwords lock that account for 15 minutes, and 30 failures lock that IP address for 15 minutes. Wait it out, or run `npm run set-password -- --email ...`, which also clears the lock. |
| Forgot the only admin password | `npm run set-password -- --email admin@example.com` over SSH. |
| Times look off by hours | Set `APP_TIME_ZONE` (an IANA name such as `America/New_York`). Stored timestamps are UTC. |

## Running without Plesk

The same build runs on any Linux host with Node 20.9+:

```bash
npm ci && npm run build && npm run db:migrate
PORT=3000 HOST=127.0.0.1 node server.js     # or: npm start  (next start, honours PORT)
```

Put nginx or Apache in front as a reverse proxy that sets `Host`,
`X-Forwarded-Proto` and `X-Real-IP`. Keep it running with systemd or pm2.
