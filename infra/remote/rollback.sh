#!/usr/bin/env bash
# Switch back to the previous release (or a named one). One step, a few seconds.
#   sudo bash /opt/research-hub/current/infra/remote/rollback.sh            -> previous release
#   sudo bash .../rollback.sh --to /opt/research-hub/releases/<id>
#
# Rolls back CODE only. Migrations are expand-only, so the older code runs against the newer
# schema; database content is not rewound (restore a backup for that: see docs/RUNBOOK.md).
export RH_SCRIPT=rollback
source "$(dirname "$(readlink -f "$0")")/lib.sh"

target=""
if [ "${1:-}" = "--to" ]; then target=$(readlink -f "${2:?--to needs a release dir}"); fi
[ -n "$target" ] || target=$(readlink -f "$RH_HOME/previous" 2>/dev/null || true)
[ -n "$target" ] && [ -f "$target/RELEASE.json" ] || die "no previous release to roll back to"

current=$(readlink -f "$RH_HOME/current" 2>/dev/null || true)
[ "$target" = "$current" ] && die "$(basename "$target") is already current"

log "rolling back: $(basename "$current") -> $(basename "$target")"
[ -n "$current" ] && swap_link "$current" "$RH_HOME/previous"
swap_link "$target" "$RH_HOME/current"
write_in_place "$target/infra/Caddyfile" "$RH_HOME/Caddyfile"

export RH_COMPOSE_RELEASE="$target"
dc up -d --no-deps --force-recreate app
if [ -n "$(dc ps -q caddy)" ]; then caddy_reload; else dc up -d --no-deps caddy; fi

wait_healthy app 60 || die "app not healthy after rollback"
bash "$target/infra/remote/smoke.sh" || die "smoke test failed after rollback (see rollback-static.sh)"
log "ROLLED BACK to $(basename "$target")"
