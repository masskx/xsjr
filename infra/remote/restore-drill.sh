#!/usr/bin/env bash
# Prove that the latest (or a given) dump restores: restore it into a scratch database inside the
# db container, compare every table's row count and a checksum of the content tables with
# production, then drop the scratch database. Production is never written to.
#   sudo bash /opt/research-hub/current/infra/remote/restore-drill.sh [path/to/db-*.dump]
# Appends the result to backups/restore-drill.log. Exit 0 = restore verified.
#
# Note: counts are compared against production *now*, so writes made after the dump was taken
# show up as differences; run it right after backup.sh (cron does) for a clean comparison.
export RH_SCRIPT=restore-drill
source "$(dirname "$(readlink -f "$0")")/lib.sh"

dump=${1:-$(ls -1t "$RH_HOME"/backups/daily/db-*.dump 2>/dev/null | head -n 1)}
[ -n "$dump" ] && [ -f "$dump" ] || die "no dump found"
if [ -f "$dump.sha256" ]; then (cd "$(dirname "$dump")" && sha256sum -c --quiet "$(basename "$dump").sha256") || die "checksum mismatch: $dump"; fi

scratch=rh_restore_drill
psql_db() { dc exec -T db psql -U rh -v ON_ERROR_STOP=1 -qAt "$@"; }

psql_db -d postgres -c "DROP DATABASE IF EXISTS $scratch" -c "CREATE DATABASE $scratch"
trap 'psql_db -d postgres -c "DROP DATABASE IF EXISTS '"$scratch"'" >/dev/null 2>&1 || true' EXIT

start=$(date +%s)
dc exec -T db pg_restore -U rh -d "$scratch" --no-owner --exit-on-error < "$dump"
secs=$(( $(date +%s) - start ))

counts_sql="SELECT string_agg(format('%s=%s', t, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', t), false, true, '')))[1]::text), ' ' ORDER BY t) FROM unnest(ARRAY(SELECT tablename::text FROM pg_tables WHERE schemaname = 'public')) AS t"
sum_sql="SELECT md5(coalesce(string_agg(r::text, '|' ORDER BY r.id), '')) FROM (SELECT id, slug, title, summary, body_md, status FROM resources) r UNION ALL SELECT md5(coalesce(string_agg(f::text, '|' ORDER BY f.id), '')) FROM (SELECT id, resource_id, path, content FROM resource_files) f"

prod_counts=$(psql_db -d research_hub -c "$counts_sql")
rest_counts=$(psql_db -d "$scratch" -c "$counts_sql")
prod_sum=$(psql_db -d research_hub -c "$sum_sql" | tr '\n' ' ')
rest_sum=$(psql_db -d "$scratch" -c "$sum_sql" | tr '\n' ' ')

result=PASS
[ "$prod_counts" = "$rest_counts" ] || result=FAIL
[ "$prod_sum" = "$rest_sum" ] || result=FAIL

line="$(date '+%F %T') $result dump=$(basename "$dump") restore=${secs}s tables: $rest_counts content-md5: $rest_sum"
echo "$line" >> "$RH_HOME/backups/restore-drill.log"
log "$line"
if [ "$result" != PASS ]; then
  log "production: $prod_counts content-md5: $prod_sum"
  exit 1
fi
