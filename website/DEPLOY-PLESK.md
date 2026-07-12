# Deploying to your AWS Ubuntu Plesk server

The site is 100% static HTML/CSS/JS plus two small PHP endpoints — it runs on
any stock Plesk install with PHP enabled. No Node, no build step.

## 1. Create the domain in Plesk

1. Log into Plesk → **Websites & Domains → Add Domain**.
2. Enter `buckshavenfarm.com` (or the domain you're using) and keep the
   default document root (`httpdocs`).
3. Point the domain's DNS **A record** at your AWS server's Elastic IP
   (do this at your registrar, or in Plesk's DNS if it hosts your zone).
4. Make sure AWS **Security Group** for the instance allows inbound
   ports **80** and **443**.

## 2. Upload the site

Everything inside this `website/` folder goes into `httpdocs/`:

**Option A — Plesk File Manager:** zip the contents of `website/`, upload the
zip in **Files**, and extract into `httpdocs`.

**Option B — Git (recommended):** Plesk → the domain → **Git** →
add this repository, branch `main` (or your branch), and set
**deployment path** to `httpdocs` with "deploy files from" `website/`
(Plesk Git supports a subdirectory via the deployment actions; simplest is
`rsync -a --delete website/ /var/www/vhosts/buckshavenfarm.com/httpdocs/`
as an "additional deployment action"). Every push then auto-deploys.

**Option C — SCP/SFTP:**
```bash
scp -r website/* website/.htaccess user@YOUR-SERVER:/var/www/vhosts/buckshavenfarm.com/httpdocs/
```

## 3. Enable HTTPS

Plesk → the domain → **SSL/TLS Certificates → Install a free certificate
(Let's Encrypt)** — tick "Secure the www subdomain" and "redirect from HTTP".
The `.htaccess` in this folder also force-redirects to HTTPS.

## 4. Make the contact form send email

The form posts to `api/contact.php`, which uses PHP `mail()`.

1. Plesk → **Mail → Mail Settings** → make sure mail service is ON for the domain.
2. Create the mailbox `noreply@buckshavenfarm.com` (Plesk → Mail → Create
   Email Address), or edit `FROM_EMAIL` at the top of `api/contact.php`.
3. Requests are delivered to `james@northvaleunified.com` — change `TO_EMAIL`
   in `api/contact.php` if you'd rather use a different inbox.
4. AWS blocks outbound port 25 by default. Either:
   - Request the port-25 restriction removal from AWS (form in the AWS docs), or
   - Better: relay through **Amazon SES** or any SMTP relay — Plesk →
     **Tools & Settings → Mail Server Settings → External SMTP** (or install
     the free "SMTP relay" extension) and point it at SES's SMTP endpoint.
5. To improve deliverability, add **SPF/DKIM** for the domain
   (Plesk → Mail → the domain → DKIM on; SPF record in DNS).

Test: submit the form on the live site; you should get the request email and
the visitor gets a branded auto-confirmation.

## 5. Drop in the aerial footage (Monday)

No code changes needed — the hero auto-detects the media:

- **Photo:** upload your drone shot as `httpdocs/assets/img/aerial-hero.jpg`
- **Video:** upload it as `httpdocs/assets/img/aerial-hero.mp4`
  (video wins if both exist; keep it under ~15 MB, 1920×1080, no audio)

Refresh the site — the placeholder illustration is replaced instantly.

Other drop-in slots that work the same way:
- `assets/img/about.jpg` — the photo beside "Our Farm"
- `assets/img/riding.jpg` — the photo beside "Lessons & Trails"
- `assets/img/gallery/*.jpg` — every image dropped here appears in the
  gallery automatically (alphabetical order — prefix with 01-, 02-, …)

## 6. Optional polish

- Update the Open Graph/canonical URLs in `index.html` if the final domain
  differs from `buckshavenfarm.com`.
- Replace the sample testimonials in `index.html` with real boarder quotes.
- Office-hours badge: the hero shows "Barn office is open/closed" computed
  live in the visitor's browser — adjust the hours in `js/main.js`
  (`OFFICE_HOURS`, currently 8am–8pm).
- The footer "Staff Portal" link points at the existing operations portal
  (`buckshavenfarm.pages.dev`) — update it if that URL changes.
