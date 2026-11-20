#!/usr/bin/env bash
# Shared helpers for the server-side scripts. Sourced, not executed.
set -euo pipefail

RH_HOME=${RH_HOME:-/opt/research-hub}

log() { printf '%s [%s] %s\n' "$(date '+%F %T')" "${RH_SCRIPT:-rh}" "$*"; }
die() { log "ERROR: $*"; exit 1; }

# Compose always runs from RH_HOME with the compose file of the given release dir
# (default: the current release).
dc() {
  local release=${RH_COMPOSE_RELEASE:-$RH_HOME/current}
  docker compose --project-directory "$RH_HOME" -f "$release/infra/compose.yaml" "$@"
}

env_value() { # env_value NAME -> value from .env (last assignment wins)
  sed -n "s/^$1=//p" "$RH_HOME/.env" | tail -n 1
}

release_id() { # release_id DIR
  sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' "$1/RELEASE.json"
}

# Replace a symlink atomically (rename(2) over the old link).
swap_link() { # swap_link TARGET LINKNAME
  ln -sfn "$1" "$2.tmp.$$"
  mv -Tf "$2.tmp.$$" "$2"
}

# Write a file's content in place, keeping its inode, so a single-file bind mount
# (the Caddyfile) sees the new content without recreating the container.
write_in_place() { # write_in_place SRC DEST
  if [ -e "$2" ]; then cat "$1" > "$2"; else install -m 0644 "$1" "$2"; fi
}

caddy_reload() {
  dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
}

# Wait until Caddy answers HTTP on this host (any status). A freshly created Caddy container
# needs a moment before it listens; smoke-testing earlier fails a perfectly good deploy.
wait_caddy() { # wait_caddy [SECONDS]
  local limit=${1:-30} code
  for _ in $(seq 1 "$limit"); do
    code=$(curl -s --noproxy '*' -o /dev/null --max-time 2 -w '%{http_code}' http://127.0.0.1/ 2>/dev/null || true)
    [ -n "$code" ] && [ "$code" != 000 ] && return 0
    sleep 1
  done
  log "WARNING: Caddy did not answer on :80 within ${limit}s"
  return 1
}

wait_healthy() { # wait_healthy SERVICE [SECONDS]
  local svc=$1 limit=${2:-60} cid status
  for _ in $(seq 1 "$limit"); do
    cid=$(dc ps -q "$svc" 2>/dev/null || true)
    if [ -n "$cid" ]; then
      status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)
      [ "$status" = healthy ] && return 0
    fi
    sleep 1
  done
  return 1
}
