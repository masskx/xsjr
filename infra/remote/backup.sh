#!/usr/bin/env bash
# Nightly backup: PostgreSQL dump (custom format) + uploads volume, with rotation and an
# optional off-box copy. Installed as a cron job by bootstrap.sh (03:30 Asia/Shanghai).
#   sudo bash /opt/research-hub/current/infra/remote/backup.sh
#
# Layout: backups/daily/{db,uploads}-YYYYmmdd-HHMMSS.* (keep 14), backups/weekly/ (Sundays,
# keep 8). Every file gets a .sha256. Off-box: BACKUP_OFFSITE_CMD in .env, with {file}
# replaced by each file's path. Without it the backup lives on the same disk as the database,
# which does NOT protect against losing the disk; this script says so in its log every night.
export RH_SCRIPT=backup
source "$(dirname "$(readlink -f "$0")")/lib.sh"

daily="$RH_HOME/backups/daily"; weekly="$RH_HOME/backups/weekly"
mkdir -p "$daily" "$weekly"
chmod 700 "$RH_HOME/backups"
ts=$(date +%Y%m%d-%H%M%S)

db="$daily/db-$ts.dump"
dc exec -T db pg_dump -U rh -d research_hub -Fc --no-owner > "$db.part"
[ -s "$db.part" ] || die "pg_dump produced no output"
mv "$db.part" "$db"

up="$daily/uploads-$ts.tar.gz"
tar -czf "$up.part" -C "$RH_HOME/data" uploads
mv "$up.part" "$up"

for f in "$db" "$up"; do (cd "$(dirname "$f")" && sha256sum "$(basename "$f")" > "$(basename "$f").sha256"); done
log "wrote $(basename "$db") ($(du -h "$db" | cut -f1)), $(basename "$up") ($(du -h "$up" | cut -f1))"

if [ "$(date +%u)" = 7 ]; then cp -p "$db" "$db.sha256" "$up" "$up.sha256" "$weekly/"; log "weekly copy kept"; fi

prune() { # prune DIR KEEP  (names are ours: db-<ts>.dump, uploads-<ts>.tar.gz)
  local pattern
  for pattern in 'db-*.dump' 'uploads-*.tar.gz'; do
    find "$1" -maxdepth 1 -name "$pattern" -printf '%T@ %p\n' | sort -rn | tail -n +$(($2 + 1)) | cut -d' ' -f2- |
      while read -r f; do rm -f "$f" "$f.sha256"; done
  done
}
prune "$daily" 14
prune "$weekly" 8

offsite=$(env_value BACKUP_OFFSITE_CMD)
if [ -n "$offsite" ]; then
  for f in "$db" "$db.sha256" "$up" "$up.sha256"; do
    cmd=${offsite//\{file\}/$f}
    bash -c "$cmd" || die "off-box copy failed: $cmd"
  done
  log "off-box copy done"
else
  log "WARNING: BACKUP_OFFSITE_CMD not set; backups exist on this disk only"
fi
log "OK"
