# Build a release locally and deploy it to the server (Phase 2: server-rendered stack).
#
# Usage (Windows PowerShell 5.1):
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1                  # build + deploy
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -SkipBuild       # redeploy last build
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -Bootstrap       # first time only
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -Rollback        # previous release
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -ApplyConfig     # after editing .env
#
# The target defaults to the RH_TARGET environment variable so the host is never committed:
#   setx RH_TARGET "ubuntu@203.0.113.10"
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less UTF-8 scripts as ANSI,
# which silently corrupts non-ASCII string literals.
#
# NOTE: native commands print progress on stderr; with ErrorActionPreference=Stop PowerShell
# would abort halfway, so we keep Continue and check $LASTEXITCODE ourselves.

param(
    [switch]$SkipBuild,
    [switch]$Bootstrap,
    [switch]$Rollback,
    [switch]$ApplyConfig,
    [string]$Target = $env:RH_TARGET,
    [string]$SiteUrl = "",
    [string]$RemoteDir = "/opt/research-hub"
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

function Assert-LastExit([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
}

if ([string]::IsNullOrWhiteSpace($Target)) {
    throw "No target host. Pass -Target ubuntu@<host> or set RH_TARGET."
}

if ($Rollback) {
    Write-Host "==> rollback on $Target" -ForegroundColor Yellow
    ssh $Target "sudo RH_HOME=$RemoteDir bash $RemoteDir/current/infra/remote/rollback.sh"
    Assert-LastExit "rollback"
    exit 0
}

if ($ApplyConfig) {
    Write-Host "==> apply .env changes on $Target" -ForegroundColor Cyan
    ssh $Target "sudo RH_HOME=$RemoteDir bash $RemoteDir/current/infra/remote/apply-config.sh"
    Assert-LastExit "apply-config"
    exit 0
}

Push-Location $root
try {
    if ($SkipBuild) {
        node scripts/build-release.mjs --skip-build
    } else {
        node scripts/build-release.mjs
    }
    Assert-LastExit "build-release"
} finally {
    Pop-Location
}

$latest = (Get-Content (Join-Path $root "dist\LATEST") -Raw).Trim()
$tarball = Join-Path $root "dist\$latest.tar.gz"
if (-not (Test-Path $tarball)) { throw "release tarball not found: $tarball" }

Write-Host "==> upload $latest to $Target" -ForegroundColor Cyan
scp -q $tarball "${Target}:/tmp/$latest.tar.gz"
Assert-LastExit "scp"

# Unpack only infra/remote from the tarball and run the server-side script from there, so the
# deploy logic always matches the release being deployed.
$extract = "d=`$(mktemp -d) && tar -xzf /tmp/$latest.tar.gz -C `$d ./infra/remote"

if ($Bootstrap) {
    if ([string]::IsNullOrWhiteSpace($SiteUrl)) { $SiteUrl = "http://" + (($Target -split "@")[-1]) }
    Write-Host "==> bootstrap (site url $SiteUrl)" -ForegroundColor Cyan
    ssh $Target "$extract && sudo RH_HOME=$RemoteDir bash `$d/infra/remote/bootstrap.sh --site-url $SiteUrl"
    Assert-LastExit "bootstrap"
}

Write-Host "==> deploy on server" -ForegroundColor Cyan
ssh $Target "$extract && sudo RH_HOME=$RemoteDir bash `$d/infra/remote/deploy.sh /tmp/$latest.tar.gz; rc=`$?; rm -rf `$d /tmp/$latest.tar.gz; exit `$rc"
Assert-LastExit "deploy"

Write-Host "==> done: $latest" -ForegroundColor Green
