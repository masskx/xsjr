# Upload a folder of skills and modules (code + structure diagrams) to the server.
# Folder layout and the batch list are described in docs/RUNBOOK.md section 15.
#
# Usage (Windows PowerShell 5.1):
#   powershell -ExecutionPolicy Bypass -File infra/bulk.ps1 -New D:\my-batch          # example folder to start from
#   powershell -ExecutionPolicy Bypass -File infra/bulk.ps1 -Folder D:\my-batch       # check only (nothing saved)
#   powershell -ExecutionPolicy Bypass -File infra/bulk.ps1 -Folder D:\my-batch -Apply            # save as drafts
#   powershell -ExecutionPolicy Bypass -File infra/bulk.ps1 -Folder D:\my-batch -Apply -Publish   # save and publish
#   add -Update to overwrite resources that already exist with the same URL slug
#
# The check writes its report (and, the first time, a batch list to fill in with Excel) back
# into the folder. The server and admin account default to environment variables:
#   setx RH_TARGET "ubuntu@203.0.113.10"
#   setx RH_ADMIN_EMAIL "admin@example.cn"
#
# NOTE: keep this file ASCII-only (Windows PowerShell 5.1 reads BOM-less scripts as ANSI).
# NOTE: native commands print progress on stderr, so ErrorActionPreference stays Continue and
# $LASTEXITCODE is checked by hand.

param(
    [string]$Folder = "",
    [string]$New = "",
    [switch]$Apply,
    [switch]$Publish,
    [switch]$Update,
    [string]$As = $env:RH_ADMIN_EMAIL,
    [string]$Target = $env:RH_TARGET,
    [string]$RemoteDir = "/opt/research-hub"
)

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
# show the server's UTF-8 report (Chinese) correctly in this console
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Assert-LastExit([string]$step) {
    if ($LASTEXITCODE -ne 0) { throw "$step failed with exit code $LASTEXITCODE" }
}

if ($New -ne "") {
    if (Test-Path $New) { throw "$New already exists; choose a new folder name" }
    Copy-Item -Recurse (Join-Path $root "tools\bulk-template") $New
    Write-Host "==> example batch created in $New" -ForegroundColor Green
    Write-Host "    Replace the examples with your own skills/modules, then run: -Folder $New"
    exit 0
}

if ($Folder -eq "") { throw "Pass -Folder <batch folder> (or -New <folder> for an example)." }
if (-not (Test-Path $Folder -PathType Container)) { throw "Folder not found: $Folder" }
$Folder = (Resolve-Path $Folder).Path
if ([string]::IsNullOrWhiteSpace($Target)) { throw "No target host. Pass -Target ubuntu@<host> or set RH_TARGET." }
if ([string]::IsNullOrWhiteSpace($As)) { throw "No admin email. Pass -As admin@example.cn or set RH_ADMIN_EMAIL." }
if ($As -notmatch '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$') { throw "Not an email address: $As" }
if ($Publish -and -not $Apply) { throw "-Publish only makes sense together with -Apply." }

$id = "rh-bulk-" + (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + (Get-Random -Maximum 10000)
$stage = Join-Path $env:TEMP $id
$back = Join-Path $env:TEMP "$id-out"

try {
    # Copy without dependency folders, VCS data and build output (robocopy handles any file name).
    robocopy $Folder $stage /E /XD node_modules .git .venv venv __pycache__ dist build .idea .vscode .ipynb_checkpoints /XF *.pyc *.pyo Thumbs.db desktop.ini /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "copying the folder failed (robocopy exit $LASTEXITCODE)" }
    $bytes = (Get-ChildItem $stage -Recurse -File | Measure-Object -Property Length -Sum).Sum
    if ($bytes -gt 200MB) { throw ("batch is {0:N0} MB after skipping dependencies (limit 200 MB); split it" -f ($bytes / 1MB)) }

    Write-Host ("==> upload {0} ({1:N1} MB) to {2}" -f $Folder, ($bytes / 1MB), $Target) -ForegroundColor Cyan
    scp -r -q $stage "${Target}:/tmp/"
    Assert-LastExit "scp"

    $flags = ""
    if ($Apply) { $flags += " --apply" }
    if ($Publish) { $flags += " --publish" }
    if ($Update) { $flags += " --update" }
    if ($Apply) { $mode = "import" } else { $mode = "check (nothing is saved)" }
    Write-Host "==> $mode on server" -ForegroundColor Cyan
    ssh $Target "sudo RH_HOME=$RemoteDir bash $RemoteDir/current/infra/remote/bulk.sh /tmp/$id --as $As$flags"
    $rc = $LASTEXITCODE

    # Bring back the report (always) and the suggested batch list (only if the folder has none).
    New-Item -ItemType Directory -Force $back | Out-Null
    scp -q "${Target}:/tmp/$id/_out/*" $back 2>$null
    foreach ($f in Get-ChildItem $back -File) {
        $dest = Join-Path $Folder $f.Name
        if ($f.Extension -eq ".csv" -and (Test-Path $dest)) { continue }
        Copy-Item $f.FullName $dest -Force
        Write-Host "    saved $dest"
    }
} finally {
    ssh $Target "rm -rf /tmp/$id" 2>$null
    Remove-Item -Recurse -Force $stage, $back -ErrorAction SilentlyContinue
}

if ($rc -eq 0) {
    if ($Apply) { Write-Host "==> done" -ForegroundColor Green } else { Write-Host "==> check passed; run again with -Apply to save" -ForegroundColor Green }
} else {
    Write-Host "==> see the report above (also saved in the folder); fix the items marked and run again" -ForegroundColor Yellow
}
exit $rc
