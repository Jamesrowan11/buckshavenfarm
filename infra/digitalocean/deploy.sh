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

as_app() { runuser -u $APP -- env HOME=$DATA_DIR "$@"; }
log() { echo "$(date -u +%FT%TZ) deploy: $*"; }

cd $APP_DIR || exit 1
as_app git fetch -q origin "$BRANCH" || { log "git fetch failed"; exit 1; }
target=$(as_app git rev-parse "origin/$BRANCH")
current=$(cat $STATE 2>/dev/null || true)
if [ "${1:-}" != "--force" ] && [ "$target" = "$current" ]; then exit 0; fi

# A value from site.conf in the repo, used when the server's env file leaves it empty.
conf() { grep -E "^$1=" infra/digitalocean/site.conf 2>/dev/null | tail -1 | cut -d= -f2-; }

build() {
  as_app git reset -q --hard "$1" &&
  set -a && . /etc/$APP/env && set +a &&
  export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$(conf NEXT_PUBLIC_SUPABASE_URL)}" &&
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$(conf NEXT_PUBLIC_SUPABASE_ANON_KEY)}" &&
  # The Supabase key is built into the app, so there's nothing useful to build without it.
  { [ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] || { log "no Supabase anon key yet (site.conf or /etc/$APP/env); not building"; false; }; } &&
  as_app npm ci --no-audit --no-fund &&
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
