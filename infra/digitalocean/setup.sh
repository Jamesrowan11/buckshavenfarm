#!/usr/bin/env bash
# ============================================================================
# Bucks Haven Farm on DigitalOcean: set up (or update) an Ubuntu 24.04 droplet.
# Installs Node.js 22, MariaDB and Caddy (automatic HTTPS), keeps settings in
# /etc/buckshavenfarm/env (outside the repository), builds and starts the
# website (/) and portal (/portal),
# and turns on automatic deploys from GitHub. The deploy creates the database.
# Safe to run again. Other apps can share the droplet: each one adds its own
# file in /etc/caddy/sites/.
#
#   sudo APP_DOMAIN=buckshavenfarm.com bash infra/digitalocean/setup.sh
#
# Optional: ACME_EMAIL (Let's Encrypt notices), BRANCH (main), REPO_URL,
#           WWW_REDIRECT (1 = also serve www.<domain> as a redirect; default for bare domains).
# ============================================================================
set -euo pipefail
export HOME=${HOME:-/root} DEBIAN_FRONTEND=noninteractive

APP=buckshavenfarm
APP_DIR=/opt/$APP
DATA_DIR=/var/lib/$APP
ENV_FILE=/etc/$APP/env
PORT=3001
REPO_URL=${REPO_URL:-https://github.com/Jamesrowan11/buckshavenfarm.git}
BRANCH=${BRANCH:-main}
: "${APP_DOMAIN:?Set APP_DOMAIN, e.g. APP_DOMAIN=buckshavenfarm.com}"
APP_DOMAIN=$(echo "$APP_DOMAIN" | tr 'A-Z' 'a-z')
[ "$(echo "$APP_DOMAIN" | tr -cd '.' | wc -c)" = 1 ] && WWW_REDIRECT=${WWW_REDIRECT:-1} || WWW_REDIRECT=${WWW_REDIRECT:-0}

say() { printf '\n==> %s\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }

say "Packages"
apt-get update -q
apt-get install -y -q curl git ca-certificates gnupg openssl ufw mariadb-server debian-keyring debian-archive-keyring apt-transport-https

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  say "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi

if ! command -v caddy >/dev/null; then
  say "Caddy"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi
mkdir -p /etc/caddy/sites
if ! grep -q 'import /etc/caddy/sites/' /etc/caddy/Caddyfile 2>/dev/null; then
  [ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)"
  { echo "{"; [ -n "${ACME_EMAIL:-}" ] && echo "	email $ACME_EMAIL"; echo "}"; echo "import /etc/caddy/sites/*.caddy"; } > /etc/caddy/Caddyfile
fi

# Building Next.js needs more memory than a small droplet has.
if ! swapon --show | grep -q /swapfile; then
  say "Swap (2 GB, for builds)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "App user and folders"
id $APP >/dev/null 2>&1 || useradd --system --home-dir $DATA_DIR --create-home --shell /usr/sbin/nologin $APP
mkdir -p $DATA_DIR /etc/$APP
chown -R $APP:$APP $DATA_DIR

if [ ! -f $ENV_FILE ]; then
  say "Settings file $ENV_FILE (created once; the deploy adds the database and login secret)"
  umask 077
  printf '# Bucks Haven Farm settings. Edit, then: sudo /usr/local/sbin/%s-deploy --force\nNODE_ENV=production\nNEXT_TELEMETRY_DISABLED=1\n' "$APP" > $ENV_FILE
  umask 022
fi
chown root:$APP $ENV_FILE && chmod 640 $ENV_FILE

say "Code"
if [ ! -d $APP_DIR/.git ]; then
  git clone -q --branch "$BRANCH" "$REPO_URL" $APP_DIR
fi
chown -R $APP:$APP $APP_DIR
git config --system --add safe.directory $APP_DIR 2>/dev/null || true

say "Service"
# A starting unit; every deploy rewrites it for the code it built (website + portal).
cat > /etc/systemd/system/$APP.service <<UNIT
[Unit]
Description=Bucks Haven Farm (website + portal)
After=network.target mariadb.service

[Service]
User=$APP
WorkingDirectory=$APP_DIR/portal
EnvironmentFile=$ENV_FILE
EnvironmentFile=-/etc/$APP/site.env
EnvironmentFile=-/etc/$APP/portal.env
Environment=NODE_ENV=production
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR $APP_DIR

[Install]
WantedBy=multi-user.target
UNIT
install -m 755 $APP_DIR/infra/digitalocean/deploy.sh /usr/local/sbin/$APP-deploy
install -m 755 $APP_DIR/infra/digitalocean/set-secret.sh /usr/local/sbin/$APP-secret
cat > /etc/systemd/system/$APP-deploy.service <<UNIT
[Unit]
Description=Deploy Bucks Haven Farm from GitHub when $BRANCH changes
[Service]
Type=oneshot
Environment=BRANCH=$BRANCH
ExecStart=/usr/local/sbin/$APP-deploy
UNIT
cat > /etc/systemd/system/$APP-deploy.timer <<UNIT
[Unit]
Description=Check GitHub for Bucks Haven Farm updates every 3 minutes
[Timer]
OnBootSec=2min
OnUnitActiveSec=3min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable $APP

say "First build and start (a few minutes)"
BRANCH=$BRANCH /usr/local/sbin/$APP-deploy --force || echo "WARNING: the first build did not finish (see above). Setup continues; fix the cause, then run: sudo /usr/local/sbin/$APP-deploy --force"

systemctl enable --now $APP-deploy.timer

say "Web address $APP_DOMAIN (HTTPS is automatic)"
{
  echo "$APP_DOMAIN {"
  echo "	encode gzip"
  echo "	request_body {"
  echo "		max_size 30MB"
  echo "	}"
  echo "	reverse_proxy 127.0.0.1:$PORT"
  echo "}"
  [ "$WWW_REDIRECT" = 1 ] && printf 'www.%s {\n\tredir https://%s{uri} 308\n}\n' "$APP_DOMAIN" "$APP_DOMAIN"
} > /etc/caddy/sites/$APP.caddy
caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null
systemctl enable caddy && systemctl reload caddy 2>/dev/null || systemctl restart caddy

say "Firewall"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null

sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/ || true)
echo "App answers locally with HTTP $code."
echo "Done. Point $APP_DOMAIN's A record at this droplet's IP. Updates deploy automatically from $BRANCH."
echo "Website: https://$APP_DOMAIN   Portal: https://$APP_DOMAIN/portal"
echo "First sign-in: open https://$APP_DOMAIN/portal/setup with the setup code."
