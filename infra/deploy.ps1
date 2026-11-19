# Build and publish the static site to the server.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -Target ubuntu@203.0.113.10
#   powershell -ExecutionPolicy Bypass -File infra/deploy.ps1 -Target ubuntu@203.0.113.10 -SkipBuild
#
# The target defaults to the RH_TARGET environment variable so the real host does
# not have to be committed to the repository:
#   setx RH_TARGET "ubuntu@203.0.113.10"
#
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less UTF-8
# scripts as ANSI, which silently corrupts non-ASCII string literals.
#
# NOTE: docker prints progress on stderr, and PowerShell turns native stderr into
# an error record. With ErrorActionPreference=Stop that aborts the deploy halfway,
# so we keep it on Continue and check $LASTEXITCODE ourselves.

param(
    [switch]$SkipBuild,
    [string]$Target = $env:RH_TARGET,
    [string]$SiteUrl = "",
    [string]$RemoteDir = "/opt/research-hub"
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($Target)) {
    throw "No target host. Pass -Target ubuntu@<host> or set RH_TARGET."
}

if ([string]::IsNullOrWhiteSpace($SiteUrl)) {
    $hostPart = ($Target -split "@")[-1]
    $SiteUrl = "http://$hostPart"
}

function Assert-LastExit([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
}

if (-not $SkipBuild) {
    Write-Host "==> build (SITE_URL=$SiteUrl)" -ForegroundColor Cyan
    Push-Location $root
    $env:NEXT_PUBLIC_SITE_URL = $SiteUrl
    npm.cmd run build
    Pop-Location
    Assert-LastExit "build"
}

$outDir = Join-Path $root "out"
if (-not (Test-Path $outDir)) { throw "out/ not found, run a build first" }

$archive = Join-Path $env:TEMP "rh-site.tar.gz"
Write-Host "==> pack out/ -> $archive" -ForegroundColor Cyan
if (Test-Path $archive) { Remove-Item $archive -Force }
tar -czf $archive -C $outDir .
Assert-LastExit "tar"

Write-Host "==> upload to $Target" -ForegroundColor Cyan
scp -q $archive "${Target}:/tmp/rh-site.tar.gz"
Assert-LastExit "scp"
scp -q (Join-Path $PSScriptRoot "Caddyfile") "${Target}:/tmp/rh-Caddyfile"
scp -q (Join-Path $PSScriptRoot "compose.yaml") "${Target}:/tmp/rh-compose.yaml"
Assert-LastExit "scp"

Write-Host "==> swap on server" -ForegroundColor Cyan
$remoteScript = @"
set -euo pipefail
sudo mkdir -p $RemoteDir
sudo mv /tmp/rh-Caddyfile $RemoteDir/Caddyfile
sudo mv /tmp/rh-compose.yaml $RemoteDir/compose.yaml
sudo rm -rf $RemoteDir/site.new
sudo mkdir -p $RemoteDir/site.new
sudo tar -xzf /tmp/rh-site.tar.gz -C $RemoteDir/site.new
sudo rm -rf $RemoteDir/site
sudo mv $RemoteDir/site.new $RemoteDir/site
rm -f /tmp/rh-site.tar.gz
cd $RemoteDir && sudo docker compose up -d --force-recreate
sudo docker compose -f $RemoteDir/compose.yaml ps
"@

# CRLF -> LF and write without BOM, otherwise remote bash chokes.
# Ship it with scp and run via bash: piping through PowerShell injects a BOM.
$tmpScript = Join-Path $env:TEMP "rh-remote.sh"
$lf = ($remoteScript -replace "`r`n", "`n")
[System.IO.File]::WriteAllText($tmpScript, $lf, (New-Object System.Text.UTF8Encoding($false)))

scp -q $tmpScript "${Target}:/tmp/rh-remote.sh"
Assert-LastExit "scp"
ssh $Target "bash /tmp/rh-remote.sh; rm -f /tmp/rh-remote.sh"
Assert-LastExit "remote script"

Remove-Item $archive -Force -ErrorAction SilentlyContinue
Write-Host "==> done: $SiteUrl/" -ForegroundColor Green
