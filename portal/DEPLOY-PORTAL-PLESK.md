# Deploying the portal to your AWS Ubuntu Plesk server

The portal is embedded in the main website: it lives at
**https://buckshavenfarm.com/portal** — same domain as the public site, no
subdomain. The public site stays as static files in `httpdocs`; the portal is
a Node.js app running on a local port, and nginx (managed by Plesk) forwards
every `/portal` request to it. The app is built with `basePath: "/portal"`,
so all of its pages, assets, and cookies already expect that URL.

## 1. Create the database (Plesk → Databases)

1. **Add Database** → name `bhf_portal`.
2. Add a database user `bhf_portal` with a strong password (write it down).
3. Done — tables are created by Prisma migrations on deploy.

## 2. Put the code on the server

Clone the repo somewhere OUTSIDE `httpdocs` (it must not be web-served), e.g.:

```bash
cd /var/www/vhosts/buckshavenfarm.com
git clone https://github.com/Jamesrowan11/buckshavenfarm.git repo
```

## 3. Configure and build

```bash
cd /var/www/vhosts/buckshavenfarm.com/repo/portal
cp .env.example .env
nano .env      # fill in:
#   DATABASE_URL="mysql://bhf_portal:PASSWORD@localhost:3306/bhf_portal"
#   AUTH_SECRET="(openssl rand -base64 48)"
#   SEED_PASSWORD="the initial family password"
#   UPLOADS_DIR="/var/www/vhosts/buckshavenfarm.com/portal-uploads"

mkdir -p /var/www/vhosts/buckshavenfarm.com/portal-uploads
npm install
npm run deploy          # prisma migrate deploy + generate + next build
npm run seed            # creates the four family accounts (safe to re-run)
```

## 4. Run it as a service (port 3001)

Create `/etc/systemd/system/bhf-portal.service` (as root):

```ini
[Unit]
Description=Bucks Haven Farm portal
After=network.target mariadb.service

[Service]
WorkingDirectory=/var/www/vhosts/buckshavenfarm.com/repo/portal
# standalone build output; .env in WorkingDirectory is loaded by Next
ExecStart=/usr/bin/node .next/standalone/server.js
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=HOSTNAME=127.0.0.1
Restart=always
User=buckshavenfarm     # your Plesk subscription's system user

[Install]
WantedBy=multi-user.target
```

```bash
# the standalone server needs the static assets beside it:
cd /var/www/vhosts/buckshavenfarm.com/repo/portal
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

systemctl daemon-reload
systemctl enable --now bhf-portal
curl -I http://127.0.0.1:3001/portal/login    # expect 200
```

## 5. Wire nginx (Plesk UI — no SSH needed for this part)

Plesk → **Websites & Domains → buckshavenfarm.com → Apache & nginx Settings**
→ **Additional nginx directives**, paste:

```nginx
location /portal {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    client_max_body_size 30m;    # document uploads
}
```

Save — Plesk reloads nginx automatically. The public site keeps being served
from `httpdocs` for every other URL; only `/portal/...` reaches the app.

Visit **https://buckshavenfarm.com/portal** → sign in as
`james@northvaleunified.com` with the `SEED_PASSWORD` you set.

## 6. Every update after that

```bash
cd /var/www/vhosts/buckshavenfarm.com/repo
git pull
cd portal && npm install && npm run deploy
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
systemctl restart bhf-portal
```

Database changes ship as migrations and run automatically during deploy.

## 7. Barn TVs

Point each barn TV's browser at (no login needed, auto-refreshes every 60s):

- `https://buckshavenfarm.com/portal/barn-display/log-barn`
- `https://buckshavenfarm.com/portal/barn-display/arena-barn`

## 8. Retiring the old Supabase/Cloudflare portal

Once staff confirm the new portal covers their day, take the old Cloudflare
Pages project offline and remove the Supabase keys. If real data accumulated
there, export it and load boarders/horses via **Import**, or ask Claude for a
one-shot migration script.

## Local development

```bash
cd portal
cp .env.example .env    # point at a local MySQL/MariaDB
npm install
npx prisma migrate dev
npm run seed
npm run dev             # http://localhost:3000/portal
```
