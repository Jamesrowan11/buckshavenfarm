# Bucks Haven Farm

Two parts on one domain, served by one Node.js process:

| Address | What it is | Code |
| --- | --- | --- |
| `buckshavenfarm.com/` | The **public website**: drone-video hero, boarding, facilities, lessons & trails, self-updating gallery, tour request form. | `website/` (plain HTML/CSS/JS) |
| `buckshavenfarm.com/portal` | The **portal**: admins (James, Cynthia), barn staff and boarders. Horses, boarders, documents, tasks, schedules, feeding charts, time clock, time off, announcements, barn TV displays. | `portal/` (Next.js + Prisma, MariaDB) |

`portal/server.js` serves both: the website's files at `/`, the portal at
`/portal`, and it redirects the previous portal's addresses (`/login`,
`/admin/...`, `/employee/...`, `/barn-display/...`) to their `/portal/...`
equivalents so bookmarks and barn TVs keep working.

- **What it does and where it's going:** [`PORTAL-OVERVIEW.md`](PORTAL-OVERVIEW.md)
- **User manual (staff, boarders, admins):** [`docs/Bucks-Haven-Farm-Portal-Manual.pdf`](docs/Bucks-Haven-Farm-Portal-Manual.pdf)

## Hosting (DigitalOcean)

Same setup as rowancopy.com and rowanheatingandair.com: an Ubuntu droplet
with **Caddy** (automatic HTTPS), **MariaDB** and **automatic deploys**.
Every 3 minutes the server checks GitHub; when `main` has new commits it
installs, migrates the database, builds and restarts. If a build fails it
rolls back to the last commit that built, so the site stays up
(`infra/digitalocean/deploy.sh`).

- **Database:** the portal's own database, `buckshavenfarm_portal`, created by
  the deploy. The first deploy of the website + portal copied the previous
  portal's data (accounts with their passwords, horses, feeding charts,
  tasks, shifts, availability, time off, announcements, clock log, notes) from
  the old `buckshavenfarm` database, which is left untouched as a backup
  (`portal/scripts/import-old-portal.js`).
- **Settings and secrets:** `/etc/buckshavenfarm/env` on the server (never in
  Git). The deploy keeps its own generated settings in
  `/etc/buckshavenfarm/portal.env`. Non-secret settings are in
  `infra/digitalocean/site.conf` (commit a change and it applies on the next
  deploy).
- **Uploads** (horse documents and photos): `/var/lib/buckshavenfarm/uploads`.
- **Website gallery:** photos in `website/assets/img/gallery/` (in Git) and in
  `/var/lib/buckshavenfarm/gallery` on the server both appear automatically.

### Setting a secret (no SSH needed)

DigitalOcean → the droplet → **Access** → **Launch Droplet Console**, then:

```bash
sudo buckshavenfarm-secret ZEPTOMAIL_TOKEN
```

It asks for the value (hidden), saves it and restarts the site.

| Setting | Where | Purpose |
| --- | --- | --- |
| `ZEPTOMAIL_TOKEN` | secret | Sends the website's tour-request emails through ZeptoMail (Zoho). Without it, requests are written to the app log (`journalctl -u buckshavenfarm`) instead of emailed. |
| `ZEPTOMAIL_API_HOST` | secret file | Only for non-US ZeptoMail accounts (`api.zeptomail.eu` etc.). |
| `TOUR_REQUEST_TO` | `site.conf` | Where tour requests go (default james@northvaleunified.com). |
| `MAIL_FROM` | `site.conf` | The sender; its domain must be verified in ZeptoMail. |
| `SETUP_CODE_SHA256` | `site.conf` | Hash of the one-time setup code (below). |

### Signing in

- Accounts brought over from the previous portal keep their passwords.
- Anyone who never set a password: **buckshavenfarm.com/portal/setup** with the
  setup code from the office (the same code as before).
- Admins add staff and boarders under **Users** / **Boarders**, and can reset
  anyone's password there.

### New droplet

1. Ubuntu 24.04 droplet (2 GB RAM or more).
2. **User data**: paste `infra/digitalocean/user-data.sh` with `APP_DOMAIN` filled in.
3. Point the domain's A record at the droplet; HTTPS starts on its own.

### Useful commands

| What | Command |
| --- | --- |
| Deploy now | `sudo /usr/local/sbin/buckshavenfarm-deploy --force` |
| Deploy log | `journalctl -u buckshavenfarm-deploy -n 100` |
| App log (incl. tour requests without email) | `journalctl -u buckshavenfarm -n 100` |
| Restart | `sudo systemctl restart buckshavenfarm` |

## Local development

```bash
cd portal
cp .env.example .env      # DATABASE_URL, AUTH_SECRET
npm install
npx prisma migrate deploy
npm run seed              # four family accounts with SEED_PASSWORD (local only)
npm run dev               # portal at http://localhost:3000/portal
```

To see the website and portal together like on the server:
`npm run build && npm start` (http://localhost:3000/).
