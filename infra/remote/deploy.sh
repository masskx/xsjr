#!/usr/bin/env bash
# Deploy a release tarball on the server. Atomic and reversible.
#   sudo bash deploy.sh /tmp/rh-<id>.tar.gz
#
# 1. unpack into releases/<id> (nothing live changes yet)
# 2. make sure every image is present (pull now, before touching anything)
# 3. start db, run migrations and the content import FROM THE NEW RELEASE
#    (migrations are expand-only, so the running old release keeps working)
# 3b. pre-flight: boot the new release in a temporary container and render /, robots, sitemap
# 4. switch current/previous symlinks, install the Caddyfile, recreate `app`, reload Caddy
# 5. smoke test; on failure roll back automatically to the previous release
# 6. keep the newest 5 releases
#
# First run on a Phase 1 server also performs the static -> server cutover: the new app starts
# and must be healthy while the old static Caddy (Phase 1 service "web") is still serving; only
# then is that container swapped for the new Caddy (about a second without a listener on :80).
# If anything fails after that, the static site is put back (rollback-static.sh); ./site stays.
export RH_SCRIPT=deploy
source "$(dirname "$(readlink -f "$0")")/lib.sh"

tarball=${1:?usage: deploy.sh RELEASE.tar.gz}

# The ingestion fetcher's test-only SSRF exemption must never reach production.
if grep -Eq '^[[:space:]]*INGEST_TEST_ALLOW_PRIVATE_HOSTS=[^[:space:]]' "$RH_HOME/.env" 2>/dev/null; then
  die "INGEST_TEST_ALLOW_PRIVATE_HOSTS is set in $RH_HOME/.env; remove it (test-only setting)"
fi
[ -f "$tarball" ] || die "no such file: $tarball"
[ -f "$RH_HOME/.env" ] || die "$RH_HOME/.env missing: run bootstrap.sh first"
for v in SITE_URL POSTGRES_PASSWORD; do [ -n "$(env_value $v)" ] || die "$v missing in .env"; done

mkdir -p "$RH_HOME/releases" "$RH_HOME/data/uploads" "$RH_HOME/site" "$RH_HOME/backups"
staging=$(mktemp -d "$RH_HOME/releases/.incoming.XXXXXX")
trap 'rm -rf "$staging"' EXIT
tar -xzf "$tarball" -C "$staging"
id=$(release_id "$staging")
[ -n "$id" ] || die "RELEASE.json missing or unreadable in $tarball"
new="$RH_HOME/releases/$id"
if [ -d "$new" ]; then log "release $id already unpacked; reusing it"; else mv "$staging" "$new"; fi
chmod -R a+rX "$new"
# tarballs built on Windows carry no exec bits
chmod 755 "$new"/infra/remote/*.sh
log "release $id unpacked"

old=$(readlink -e "$RH_HOME/current" 2>/dev/null || true)
[ "$old" = "$new" ] && die "$id is already the current release"

export RH_COMPOSE_RELEASE="$new"

log "checking images"
for img in $(dc config --images | sort -u); do
  docker image inspect "$img" >/dev/null 2>&1 || { log "pulling $img"; docker pull -q "$img" >/dev/null || die "cannot pull $img (see infra/README: registry mirror)"; }
done

log "database"
dc up -d db
wait_healthy db 90 || die "database did not become healthy"

log "migrations (from $id)"
RELEASE_DIR="$new" dc run --rm -T migrate || die "migrations failed; nothing was switched"

log "content import (from $id)"
RELEASE_DIR="$new" dc run --rm -T importer || die "content import reported errors; nothing was switched"

# Pre-flight: run the NEW release in a temporary container next to the live one. A release that
# crashes on start or cannot render against the real database is rejected here, before any
# switch, so the live site never serves it.
log "pre-flight: starting $id next to the live release"
preflight=research-hub-preflight
docker rm -f "$preflight" >/dev/null 2>&1 || true
# INGEST_WORKER=0: a release under test must never take ingestion jobs
RELEASE_DIR="$new" dc run -d --rm --no-deps --name "$preflight" -e INGEST_WORKER=0 app >/dev/null
ok=0
for _ in $(seq 1 45); do
  if docker exec "$preflight" wget -qO /dev/null http://127.0.0.1:3000/robots.txt 2>/dev/null; then ok=1; break; fi
  docker inspect "$preflight" >/dev/null 2>&1 || break   # container exited
  sleep 1
done
if [ "$ok" = 1 ]; then
  for p in / /sitemap.xml; do
    docker exec "$preflight" wget -qO /dev/null "http://127.0.0.1:3000$p" 2>/dev/null || { ok=0; log "pre-flight: $p failed"; }
  done
fi
if [ "$ok" != 1 ]; then
  docker logs --tail 30 "$preflight" 2>&1 || true
  docker rm -f "$preflight" >/dev/null 2>&1 || true
  die "pre-flight failed for $id; nothing was switched, the live site is unchanged"
fi
docker rm -f "$preflight" >/dev/null 2>&1 || true
log "pre-flight passed"

log "switching current -> $id"
[ -n "$old" ] && swap_link "$old" "$RH_HOME/previous"
swap_link "$new" "$RH_HOME/current"
write_in_place "$new/infra/Caddyfile" "$RH_HOME/Caddyfile"

legacy=$(docker ps -aq --filter label=com.docker.compose.project=research-hub --filter label=com.docker.compose.service=web)
if [ -n "$legacy" ]; then
  log "Phase 1 static container found: starting the app next to it"
  dc up -d --no-deps app
  if ! wait_healthy app 90; then
    dc logs --tail 40 app || true
    dc stop app || true
    if [ -n "$old" ]; then swap_link "$old" "$RH_HOME/current"; else rm -f "$RH_HOME/current"; fi
    die "new app never became healthy; the Phase 1 static site was not touched"
  fi
  log "app healthy; swapping the Phase 1 Caddy for the new one"
  docker rm -f $legacy >/dev/null
  dc up -d --no-deps caddy
else
  dc up -d --no-deps --force-recreate app
  if [ -n "$(dc ps -q caddy)" ]; then caddy_reload; else dc up -d --no-deps caddy; fi
fi

if wait_healthy app 60 && bash "$RH_HOME/current/infra/remote/smoke.sh"; then
  ls -1dt "$RH_HOME"/releases/rh-* | tail -n +6 | while read -r d; do
    [ "$d" = "$(readlink -f "$RH_HOME/previous" || true)" ] || rm -rf "$d"
  done
  log "DEPLOYED $id"
  exit 0
fi

log "deploy of $id failed health or smoke checks"
dc logs --tail 40 app || true
if [ -n "$old" ]; then
  log "rolling back to $(basename "$old")"
  bash "$old/infra/remote/rollback.sh" --to "$old" || true
elif [ -f "$RH_HOME/site/index.html" ]; then
  log "no previous server release: restoring the Phase 1 static site"
  bash "$RH_HOME/current/infra/remote/rollback-static.sh" || true
fi
exit 1
