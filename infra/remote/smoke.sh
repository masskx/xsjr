#!/usr/bin/env bash
# Smoke test through Caddy on this host. Exit 0 = healthy.
#   smoke.sh                 uses SITE_URL from .env, connecting to 127.0.0.1
# Checks: robots.txt, sitemap.xml and EVERY URL in it return 200; an unknown slug returns 404
# with a real HTML page (not an empty error shell); a hashed static asset is served with the
# immutable cache header.
export RH_SCRIPT=smoke
source "$(dirname "$(readlink -f "$0")")/lib.sh"

site=$(env_value SITE_URL)
[ -n "$site" ] || die "SITE_URL missing in .env"
scheme=${site%%://*}
hostport=${site#*://}; hostport=${hostport%%/*}
host=${hostport%%:*}
port=${hostport#*:}; [ "$port" = "$hostport" ] && { [ "$scheme" = https ] && port=443 || port=80; }
CURL=(curl -sS --max-time 15 --resolve "$host:$port:127.0.0.1")

fail=0
check() { # check PATH EXPECTED_STATUS
  local code
  code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$site$1" || echo 000)
  if [ "$code" != "$2" ]; then log "FAIL $1 -> $code (want $2)"; fail=1; fi
}

check /robots.txt 200
sitemap=$("${CURL[@]}" "$site/sitemap.xml" || true)
paths=$(printf '%s' "$sitemap" | grep -o '<loc>[^<]*</loc>' | sed -e 's#<loc>##' -e 's#</loc>##' -e "s#^$site##")
[ -n "$paths" ] || { log "FAIL sitemap.xml empty or unreachable"; fail=1; }
n=0
for p in $paths; do check "${p:-/}" 200; n=$((n + 1)); done

probe="/modules/smoke-missing-$$/"
body=$("${CURL[@]}" -w '\n%{http_code}' "$site$probe" || true)
code=${body##*$'\n'}
if [ "$code" != 404 ]; then log "FAIL $probe -> $code (want 404)"; fail=1; fi
if printf '%s' "$body" | grep -q '__next_error__'; then log "FAIL $probe rendered an empty error shell"; fail=1; fi

asset=$("${CURL[@]}" "$site/" | grep -o '/_next/static/[^"]*\.css' | head -n 1 || true)
if [ -n "$asset" ]; then
  cc=$("${CURL[@]}" -o /dev/null -D - "$site$asset" | tr -d '\r' | sed -n 's/^[Cc]ache-[Cc]ontrol: //p' | head -n 1)
  case "$cc" in *immutable*) ;; *) log "FAIL $asset cache-control: '$cc'"; fail=1 ;; esac
else
  log "FAIL no /_next/static asset referenced from /"; fail=1
fi

if [ "$fail" = 0 ]; then log "OK: $n sitemap URLs, 404 probe, static asset"; else log "SMOKE TEST FAILED"; fi
exit "$fail"
