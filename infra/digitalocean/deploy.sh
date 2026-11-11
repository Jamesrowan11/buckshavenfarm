#!/usr/bin/env bash
# ============================================================================
# Bucks Haven Farm: deploy the latest code from GitHub. Runs every 3 minutes from
# buckshavenfarm-deploy.timer and does nothing unless the branch has new commits.
# A failed build rolls back to the last commit that built, so the site stays up.
#   sudo /usr/local/sbin/buckshavenfarm-deploy            # deploy if there are changes
#   sudo /usr/local/sbin/buckshavenfarm-deploy --force    # rebuild now
#
# The repository holds the public website (website/) and the portal (portal/,
# Next.js + Prisma). portal/server.js serves both: the website at / and the
# portal at /portal. The portal has its own database, <app>_portal; the
# previous portal's database is left untouched and its data is copied in once
# (portal/scripts/import-old-portal.js).
# ============================================================================
set -uo pipefail
APP=buckshavenfarm
APP_DIR=/opt/$APP
DATA_DIR=/var/lib/$APP
PORT=3001
BRANCH=${BRANCH:-main}
STATE=$DATA_DIR/last-good-commit
exec 9>/run/$APP-deploy.lock
flock -n 9 || { echo "A deploy is already running."; exit 0; }

# Read KEY=value lines literally (values may contain spaces, & or <>), never as shell code.
load_env() {
  local line key
  [ -f "$1" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|'#'*) continue ;; esac
    key=${line%%=*}
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && export "$key=${line#*=}"
  done < "$1"
}
env_value() { grep -E "^$1=" "$2" 2>/dev/null | tail -1 | cut -d= -f2-; }

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

ensure_mariadb() {
  command -v mariadb >/dev/null || { DEBIAN_FRONTEND=noninteractive apt-get install -y -q mariadb-server >/dev/null && systemctl enable --now mariadb; }
}

# Settings shared by both layouts: login secret and site.conf values.
ensure_common() {
  local env=/etc/$APP/env
  touch "$env"
  grep -q '^AUTH_SECRET=' "$env" || echo "AUTH_SECRET=$(openssl rand -hex 32)" >> "$env"
  sed -i '/^NEXT_PUBLIC_SUPABASE_/d;/^# Supabase/d' "$env"
  umask 077
  { echo "# From infra/digitalocean/site.conf; rewritten on every deploy."
    echo "SETUP_CODE_SHA256=$(conf SETUP_CODE_SHA256)"
    [ -n "$(conf TOUR_REQUEST_TO)" ] && echo "TOUR_REQUEST_TO=$(conf TOUR_REQUEST_TO)"
    [ -n "$(conf MAIL_FROM)" ] && echo "MAIL_FROM=$(conf MAIL_FROM)"
  } > /etc/$APP/site.env
  umask 022
  chown root:$APP /etc/$APP/site.env "$env" && chmod 640 /etc/$APP/site.env "$env"
}

# Previous layout (one Next.js app at the repo root, lowercase tables): only
# used if a rollback ever goes back to a commit from before the website + portal.
ensure_database_old() {
  local env=/etc/$APP/env
  if ! grep -q '^DATABASE_URL=' "$env"; then
    ensure_mariadb
    local pass; pass=$(openssl rand -hex 24)
    mariadb -e "CREATE DATABASE IF NOT EXISTS $APP CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      CREATE USER IF NOT EXISTS '$APP'@'localhost' IDENTIFIED BY '$pass';
      CREATE USER IF NOT EXISTS '$APP'@'127.0.0.1' IDENTIFIED BY '$pass';
      ALTER USER '$APP'@'localhost' IDENTIFIED BY '$pass'; ALTER USER '$APP'@'127.0.0.1' IDENTIFIED BY '$pass';
      GRANT ALL PRIVILEGES ON $APP.* TO '$APP'@'localhost'; GRANT ALL PRIVILEGES ON $APP.* TO '$APP'@'127.0.0.1'; FLUSH PRIVILEGES;" || return 1
    echo "DATABASE_URL=mysql://$APP:$pass@127.0.0.1:3306/$APP" >> "$env"
    log "created the $APP database"
  fi
}

# Website + portal: the portal's own database and settings in /etc/$APP/portal.env
# (read after /etc/$APP/env, so its DATABASE_URL wins for the portal).
ensure_portal() {
  local penv=/etc/$APP/portal.env db=${APP}_portal user=${APP}_portal
  mkdir -p $DATA_DIR/uploads $DATA_DIR/gallery && chown $APP:$APP $DATA_DIR/uploads $DATA_DIR/gallery
  if [ -z "$(env_value DATABASE_URL "$penv")" ]; then
    ensure_mariadb
    local pass old old_db=""
    pass=$(openssl rand -hex 24)
    old=$(env_value DATABASE_URL /etc/$APP/env)
    [[ "$old" =~ /([A-Za-z0-9_]+)(\?.*)?$ ]] && old_db=${BASH_REMATCH[1]}
    local grant_old=""
    if [ -n "$old_db" ] && [ "$old_db" != "$db" ]; then
      grant_old="GRANT SELECT ON \`$old_db\`.* TO '$user'@'localhost'; GRANT SELECT ON \`$old_db\`.* TO '$user'@'127.0.0.1';"
    fi
    mariadb -e "CREATE DATABASE IF NOT EXISTS $db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
      CREATE USER IF NOT EXISTS '$user'@'localhost' IDENTIFIED BY '$pass';
      CREATE USER IF NOT EXISTS '$user'@'127.0.0.1' IDENTIFIED BY '$pass';
      ALTER USER '$user'@'localhost' IDENTIFIED BY '$pass'; ALTER USER '$user'@'127.0.0.1' IDENTIFIED BY '$pass';
      GRANT ALL PRIVILEGES ON $db.* TO '$user'@'localhost'; GRANT ALL PRIVILEGES ON $db.* TO '$user'@'127.0.0.1';
      $grant_old FLUSH PRIVILEGES;" || return 1
    umask 077
    { echo "# Website + portal settings, created by the deploy. Secrets you add go in /etc/$APP/env."
      echo "DATABASE_URL=mysql://$user:$pass@127.0.0.1:3306/$db"
      # The previous portal's data is copied in once from here (read-only).
      [ -n "$grant_old" ] && echo "OLD_DATABASE_URL=mysql://$user:$pass@127.0.0.1:3306/$old_db"
    } > "$penv"
    umask 022
    log "created the $db database"
  fi
  # Non-secret runtime settings, refreshed every deploy.
  sed -i '/^\(PORT\|HOSTNAME\|UPLOADS_DIR\|GALLERY_DIR\|WEBSITE_DIR\)=/d' "$penv"
  { echo "PORT=$PORT"; echo "HOSTNAME=127.0.0.1"; echo "UPLOADS_DIR=$DATA_DIR/uploads"
    echo "GALLERY_DIR=$DATA_DIR/gallery"; echo "WEBSITE_DIR=$APP_DIR/website"; } >> "$penv"
  chown root:$APP "$penv" && chmod 640 "$penv"
}

write_unit() {  # $1 = portal | old
  local unit=/etc/systemd/system/$APP.service tmp; tmp=$(mktemp)
  if [ "$1" = portal ]; then
    cat > "$tmp" <<UNIT
[Unit]
Description=Bucks Haven Farm (website + portal)
After=network.target mariadb.service

[Service]
User=$APP
WorkingDirectory=$APP_DIR/portal
EnvironmentFile=/etc/$APP/env
EnvironmentFile=-/etc/$APP/site.env
EnvironmentFile=/etc/$APP/portal.env
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
  else
    cat > "$tmp" <<UNIT
[Unit]
Description=Bucks Haven Farm (Next.js)
After=network.target

[Service]
User=$APP
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/$APP/env
EnvironmentFile=-/etc/$APP/site.env
ExecStart=$APP_DIR/node_modules/.bin/next start -p $PORT -H 127.0.0.1
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR $APP_DIR

[Install]
WantedBy=multi-user.target
UNIT
  fi
  if ! cmp -s "$tmp" "$unit"; then install -m 644 "$tmp" "$unit" && systemctl daemon-reload; fi
  rm -f "$tmp"
}

LAYOUT=old
build() {
  as_app git reset -q --hard "$1" || return 1
  ensure_common || return 1
  if [ -d "$APP_DIR/portal" ]; then
    LAYOUT=portal
    ensure_portal || return 1
    load_env /etc/$APP/env && load_env /etc/$APP/site.env && load_env /etc/$APP/portal.env
    ( cd $APP_DIR/portal &&
      as_app npm ci --include=dev --no-audit --no-fund &&
      as_app npx prisma generate &&
      as_app npx prisma migrate deploy &&
      as_app node scripts/import-old-portal.js &&
      as_app npm run build )
  else
    LAYOUT=old
    ensure_database_old || return 1
    load_env /etc/$APP/env && load_env /etc/$APP/site.env
    as_app npm ci --include=dev --no-audit --no-fund &&
    as_app node scripts/migrate.mjs &&
    as_app npm run build
  fi
}

# Uploads: portal documents can be up to 25 MB; raise Caddy's old 12 MB cap once.
raise_upload_limit() {
  local site=/etc/caddy/sites/$APP.caddy
  if [ -f "$site" ] && grep -q 'max_size 12MB' "$site"; then
    cp "$site" "$site.bak" && sed -i 's/max_size 12MB/max_size 30MB/' "$site"
    if caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
      systemctl reload caddy && log "upload limit raised to 30 MB"
    else
      mv "$site.bak" "$site" && log "kept the 12 MB upload limit (Caddy config check failed)"
    fi
  fi
}

go_live() {
  write_unit "$LAYOUT"
  systemctl restart $APP
}

log "building ${target:0:7}"
if build "$target"; then
  echo "$target" > $STATE
  go_live
  install -m 755 $APP_DIR/infra/digitalocean/deploy.sh /usr/local/sbin/$APP-deploy
  [ -f $APP_DIR/infra/digitalocean/set-secret.sh ] && install -m 755 $APP_DIR/infra/digitalocean/set-secret.sh /usr/local/sbin/$APP-secret
  raise_upload_limit
  log "live on ${target:0:7} ($LAYOUT layout)"
else
  log "BUILD FAILED for ${target:0:7}"
  if [ -n "$current" ]; then
    log "rolling back to ${current:0:7}"
    build "$current" && go_live && log "rolled back"
  fi
  exit 1
fi
