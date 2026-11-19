#!/usr/bin/env bash
# EMERGENCY: serve the Phase 1 static export (/opt/research-hub/site) directly from Caddy,
# bypassing the app and the database. Use when the server stack cannot be recovered quickly.
#   sudo bash /opt/research-hub/current/infra/remote/rollback-static.sh
# Undo with:  sudo bash .../apply-config.sh   (reinstalls the normal Caddyfile)
export RH_SCRIPT=rollback-static
source "$(dirname "$(readlink -f "$0")")/lib.sh"

[ -f "$RH_HOME/site/index.html" ] || die "$RH_HOME/site has no static export to serve"
write_in_place "$RH_HOME/current/infra/Caddyfile.static" "$RH_HOME/Caddyfile"
if [ -n "$(dc ps -q caddy)" ]; then caddy_reload; else dc up -d --no-deps caddy; fi
log "Caddy now serves the static Phase 1 site. Accounts/admin are unavailable in this mode."
