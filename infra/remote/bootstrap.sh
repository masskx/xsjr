#!/usr/bin/env bash
# One-time (idempotent) server preparation for the Phase 2 stack.
#   sudo bash bootstrap.sh [--site-url http://129.204.142.223]
#
# - directory layout under /opt/research-hub (keeps the Phase 1 ./site for emergency rollback)
# - 2 GB swapfile if the host has no swap (safety net; the stack itself needs ~1.4 GB)
# - .env with generated secrets (chmod 600), created only if absent
# - cron: nightly backup 03:30, monthly restore drill (04:10 on the 1st), Asia/Shanghai time
# It does NOT touch the firewall, SSH configuration or Docker daemon settings; see
# docs/RUNBOOK.md for those manual steps.
export RH_SCRIPT=bootstrap
source "$(dirname "$(readlink -f "$0")")/lib.sh"

[ "$(id -u)" = 0 ] || die "run as root (sudo)"
site_url=http://129.204.142.223
[ "${1:-}" = "--site-url" ] && site_url=${2:?}

mkdir -p "$RH_HOME"/{releases,data/uploads,backups/daily,backups/weekly,site}
chmod 700 "$RH_HOME/backups"
# uploads are written by the app container (user node, uid 1000) from slice 5 on
chown 1000:1000 "$RH_HOME/data/uploads"

if [ -z "$(swapon --show --noheadings)" ]; then
  log "creating 2G swapfile"
  if { [ -f /swapfile ] || fallocate -l 2G /swapfile; } && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile; then
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -q vm.swappiness=10 && echo 'vm.swappiness=10' > /etc/sysctl.d/90-research-hub.conf
  else
    log "WARNING: could not enable swap (continuing; add it manually, see docs/RUNBOOK.md)"
  fi
else
  log "swap already present: $(swapon --show --noheadings | awk '{print $1, $3}' | tr '\n' ' ')"
fi

env_file="$RH_HOME/.env"
if [ -f "$env_file" ]; then
  log ".env exists; leaving it unchanged"
else
  log "writing $env_file with generated secrets"
  umask 077
  cat > "$env_file" <<EOF
SITE_URL=$site_url
CADDY_SITE_ADDRESS=:80
POSTGRES_PASSWORD=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -hex 32)
ICP_RECORD=
PSB_RECORD=
DEEPSEEK_API_KEY=
BACKUP_OFFSITE_CMD=
EOF
  umask 022
fi
chown root:root "$env_file"; chmod 600 "$env_file"

cat > /etc/cron.d/research-hub <<EOF
# Research Hub maintenance (installed by infra/remote/bootstrap.sh)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 3 * * * root bash $RH_HOME/current/infra/remote/backup.sh >> $RH_HOME/backups/backup.log 2>&1
10 4 1 * * root bash $RH_HOME/current/infra/remote/restore-drill.sh >> $RH_HOME/backups/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/research-hub
log "cron installed (/etc/cron.d/research-hub)"

if [ ! -f /etc/docker/daemon.json ] || ! grep -q registry-mirrors /etc/docker/daemon.json; then
  log "NOTE: no Docker registry mirror configured. Docker Hub is slow or blocked from mainland"
  log "      China; see docs/RUNBOOK.md 'Registry mirror' before the first deploy."
fi
log "OK"
