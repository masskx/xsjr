#!/usr/bin/env bash
# Bulk upload of skills and modules (docs/RUNBOOK.md section 15). Called by infra/bulk.ps1:
#
#   sudo bash /opt/research-hub/current/infra/remote/bulk.sh /tmp/rh-bulk-<id> --as admin@example.cn \
#        [--apply] [--publish] [--update]
#
# The uploaded folder is copied to ./data/bulk/<id> (readable by the container user), the importer
# runs in the one-off `bulk` container, and the report (plus a suggested 清单.csv) is put in
# /tmp/rh-bulk-<id>/_out for the client to fetch. Nothing of the batch is kept on the server
# afterwards except what was imported (database rows, diagrams in data/uploads).
export RH_SCRIPT=bulk
source "$(dirname "$(readlink -f "$0")")/lib.sh"

src=${1:?usage: bulk.sh /tmp/rh-bulk-<id> --as EMAIL [--apply] [--publish] [--update]}
shift
[[ "$src" =~ ^/tmp/rh-bulk-[A-Za-z0-9_-]+$ ]] || die "unexpected source folder: $src"
[ -d "$src" ] && [ ! -L "$src" ] || die "source folder not found: $src"

email="" flags=()
while [ $# -gt 0 ]; do
  case "$1" in
    --as) email=${2:-}; shift 2 ;;
    --apply|--publish|--update) flags+=("$1"); shift ;;
    *) die "unknown option: $1" ;;
  esac
done
[[ "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || die "--as needs the administrator's email address"

size_mb=$(du -sm "$src" | cut -f1)
[ "$size_mb" -le 200 ] || die "batch is ${size_mb} MB (limit 200 MB)"

id=$(basename "$src")
work="$RH_HOME/data/bulk/$id"
rm -rf "$work"
mkdir -p "$work/out"
# -P: never follow symlinks while copying; then drop them (the importer ignores links anyway)
cp -RP "$src/." "$work/in"
rm -rf "$work/in/_out"
find "$work/in" -type l -delete
chown -R -h 1000:1000 "$work"
mkdir -p "$RH_HOME/data/uploads" && chown 1000:1000 "$RH_HOME/data/uploads"

log "importing $id as $email ${flags[*]:-(check only)}"
set +e
dc run --rm -T bulk node scripts/bulk-import.mjs --dir "/bulk/$id/in" --out "/bulk/$id/out" --as "$email" "${flags[@]}"
rc=$?
set -e

rm -rf "$src/_out"
mkdir -p "$src/_out"
cp -R "$work/out/." "$src/_out/" 2>/dev/null || true
[ -n "${SUDO_USER:-}" ] && chown -R "$SUDO_USER" "$src/_out"
rm -rf "$work"
exit $rc
