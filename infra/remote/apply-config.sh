#!/usr/bin/env bash
# Apply .env changes (SITE_URL, CADDY_SITE_ADDRESS, filing numbers, ...) without a new release.
#   sudo bash /opt/research-hub/current/infra/remote/apply-config.sh
# Recreates app (reads env at start) and caddy (site address / TLS), then smoke-tests.
export RH_SCRIPT=apply-config
source "$(dirname "$(readlink -f "$0")")/lib.sh"

write_in_place "$RH_HOME/current/infra/Caddyfile" "$RH_HOME/Caddyfile"
dc up -d --no-deps --force-recreate app caddy
wait_healthy app 60 || die "app not healthy"
sleep 2
bash "$RH_HOME/current/infra/remote/smoke.sh"
