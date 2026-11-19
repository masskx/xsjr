#!/usr/bin/env bash
# Linux/macOS/CI equivalent of infra/deploy.ps1.
#   RH_TARGET=ubuntu@203.0.113.10 infra/deploy.sh [--skip-build] [--bootstrap] [--rollback] [--apply-config]
set -euo pipefail
cd "$(dirname "$0")/.."

target=${RH_TARGET:?set RH_TARGET=user@host}
remote=${RH_REMOTE_DIR:-/opt/research-hub}
skip=""; bootstrap=0
for a in "$@"; do
  case "$a" in
    --skip-build) skip=--skip-build ;;
    --bootstrap) bootstrap=1 ;;
    --rollback) exec ssh "$target" "sudo RH_HOME=$remote bash $remote/current/infra/remote/rollback.sh" ;;
    --apply-config) exec ssh "$target" "sudo RH_HOME=$remote bash $remote/current/infra/remote/apply-config.sh" ;;
    *) echo "unknown option $a" >&2; exit 2 ;;
  esac
done

node scripts/build-release.mjs $skip
id=$(cat dist/LATEST)
scp -q "dist/$id.tar.gz" "$target:/tmp/$id.tar.gz"
extract="d=\$(mktemp -d) && tar -xzf /tmp/$id.tar.gz -C \$d ./infra/remote"
if [ "$bootstrap" = 1 ]; then
  ssh "$target" "$extract && sudo RH_HOME=$remote bash \$d/infra/remote/bootstrap.sh --site-url http://${target#*@}"
fi
ssh "$target" "$extract && sudo RH_HOME=$remote bash \$d/infra/remote/deploy.sh /tmp/$id.tar.gz; rc=\$?; rm -rf \$d /tmp/$id.tar.gz; exit \$rc"
echo "==> done: $id"
