#!/usr/bin/env bash
# ============================================================================
# Bucks Haven Farm: deploy the latest code from GitHub. Runs every 3 minutes from
# buckshavenfarm-deploy.timer and does nothing unless the branch has new commits.
# A failed build rolls back to the last commit that built, so the site stays up.
#   sudo /usr/local/sbin/buckshavenfarm-deploy            # deploy if there are changes
#   sudo /usr/local/sbin/buckshavenfarm-deploy --force    # rebuild now
# ============================================================================
set -uo pipefail
APP=buckshavenfarm
APP_DIR=/opt/$APP
DATA_DIR=/var/lib/$APP
BRANCH=${BRANCH:-main}
STATE=$DATA_DIR/last-good-commit
exec 9>/run/$APP-deploy.lock
flock -n 9 || { echo "A deploy is already running."; exit 0; }

# Read KEY=value lines literally (values may contain spaces, & or <>), never as shell code.
load_env() {
  local line key
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && export "$key=${line#*=}"
  done < "$1"
}

as_app() { runuser -u $APP -- env HOME=$DATA_DIR "$@"; }
log() { echo "$(date -u +%FT%TZ) deploy: $*"; }

cd $APP_DIR || exit 1
as_app git fetch -q origin "$BRANCH" || { log "git fetch failed"; exit 1; }
# Use the newest deploy script from GitHub before doing anything else, so a fix
# to this script always reaches the server (even if the last build failed).
new=$(mktemp)
if as_app git show "origin/$BRANCH:infra/digitalocean/deploy.sh" > "$new" 2>/dev/null && [ -s "$new" ] \
   && ! cmp -s "$new" /usr/local/sbin/$APP-deploy; then
  install -m 755 "$new" /usr/local/sbin/$APP-deploy && rm -f "$new"
  log "deploy script updated from GitHub; running the new version"
  exec /usr/local/sbin/$APP-deploy "$@"
fi
rm -f "$new"
target=$(as_app git rev-parse "origin/$BRANCH")
current=$(cat $STATE 2>/dev/null || true)
if [ "${1:-}" != "--force" ] && [ "$target" = "$current" ]; then exit 0; fi

# A value from site.conf in the repo.
conf() { grep -E "^$1=" infra/digitalocean/site.conf 2>/dev/null | tail -1 | cut -d= -f2-; }

# The app's own database and login secret. Created once (no Supabase), kept in
# /etc/$APP/env. Also gives the app the setup-code hash from site.conf.
ensure_database() {
  local env=/etc/$APP/env
  if ! grep -q '^DATABASE_URL=' "$env"; then
    command -v mariadb >/dev/null || { DEBIAN_FRONTEND=noninteractive apt-get install -y -q mariadb-server >/dev/null && systemctl enable --now mariadb; }
    local pass; pass=$(openssl rand -hex 24)
    mariadb -e "CREATE DATABASE IF NOT EXISTS $APP CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      CREATE USER IF NOT EXISTS '$APP'@'localhost' IDENTIFIED BY '$pass';
      CREATE USER IF NOT EXISTS '$APP'@'127.0.0.1' IDENTIFIED BY '$pass';
      ALTER USER '$APP'@'localhost' IDENTIFIED BY '$pass'; ALTER USER '$APP'@'127.0.0.1' IDENTIFIED BY '$pass';
      GRANT ALL PRIVILEGES ON $APP.* TO '$APP'@'localhost'; GRANT ALL PRIVILEGES ON $APP.* TO '$APP'@'127.0.0.1'; FLUSH PRIVILEGES;" || return 1
    echo "DATABASE_URL=mysql://$APP:$pass@127.0.0.1:3306/$APP" >> "$env"
    log "created the $APP database"
  fi
  grep -q '^AUTH_SECRET=' "$env" || echo "AUTH_SECRET=$(openssl rand -hex 32)" >> "$env"
  # Old Supabase settings are no longer used.
  sed -i '/^NEXT_PUBLIC_SUPABASE_/d;/^# Supabase/d' "$env"
  # Settings from site.conf (non-secret), in their own file the service also reads.
  umask 077
  { echo "# From infra/digitalocean/site.conf; rewritten on every deploy."; echo "SETUP_CODE_SHA256=$(conf SETUP_CODE_SHA256)"; } > /etc/$APP/site.env
  chown root:$APP /etc/$APP/site.env /etc/$APP/env && chmod 640 /etc/$APP/site.env /etc/$APP/env
  umask 022
  local unit=/etc/systemd/system/$APP.service
  if [ -f "$unit" ] && ! grep -q "site.env" "$unit"; then
    sed -i "s#^EnvironmentFile=.*#&\nEnvironmentFile=/etc/$APP/site.env#" "$unit"
    systemctl daemon-reload
  fi
}

build() {
  as_app git reset -q --hard "$1" &&
  ensure_database &&
  load_env /etc/$APP/env &&
  as_app npm ci --include=dev --no-audit --no-fund &&
  as_app node scripts/migrate.mjs &&
  as_app npm run build
}

log "building ${target:0:7}"
if build "$target"; then
  echo "$target" > $STATE
  systemctl restart $APP
  install -m 755 $APP_DIR/infra/digitalocean/deploy.sh /usr/local/sbin/$APP-deploy
  log "live on ${target:0:7}"
else
  log "BUILD FAILED for ${target:0:7}"
  if [ -n "$current" ]; then
    log "rolling back to ${current:0:7}"
    build "$current" && systemctl restart $APP && log "rolled back"
  fi
  exit 1
fi
