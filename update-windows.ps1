# DRAFTEX update for Windows: check -> backup -> git pull -> setup again.
# Start it by double-clicking update-windows.bat (D44). DRAFTEX must be closed.
# Keep this file ASCII only: Windows PowerShell 5.1 reads it as ANSI.
param(
  # Skip git pull (CI: its checkout is not on a branch). Everything else runs.
  [switch]$NoPull,
  [switch]$NoShortcut
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3

$Root = $PSScriptRoot
$NodeDir = Join-Path $Root ".runtime\node"
$NodeExe = Join-Path $NodeDir "node.exe"

function Say([string]$Message) { Write-Host "[update] $Message" }
function Stop-Update([string]$Message) {
  Write-Host ""
  Write-Host "[update] STOPPED: $Message" -ForegroundColor Red
  exit 1
}

# Runs a program and leaves its exit code in $script:NativeExit. Output goes
# straight to the window; stderr is not treated as a PowerShell error.
function Invoke-Native([string]$File, [string[]]$Arguments) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $File @Arguments
    $script:NativeExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $old
  }
}

Set-Location $Root
if (-not (Test-Path $NodeExe)) { Stop-Update "DRAFTEX is not set up yet. Double-click setup-windows.bat first." }
$env:Path = "$NodeDir;$env:Path"
$env:CHECKPOINT_DISABLE = "1"
$env:NEXT_TELEMETRY_DISABLED = "1"

Say "Step 1 of 4: Checking that DRAFTEX is closed"
Invoke-Native $NodeExe @((Join-Path $Root "scripts\update-check.ts"))
if ($script:NativeExit -ne 0) { exit 1 }

Say "Step 2 of 4: Backing up your papers"
Invoke-Native $NodeExe @((Join-Path $Root "scripts\backup.ts"), "--kind", "before-update")
if ($script:NativeExit -ne 0) { Stop-Update "The backup failed, so nothing was updated." }

Say "Step 3 of 4: Downloading the new version"
if ($NoPull) {
  Say "Skipped (-NoPull)."
} else {
  Invoke-Native "git" @("-C", $Root, "pull", "--ff-only")
  if ($script:NativeExit -ne 0) { Stop-Update "The new version could not be downloaded. Check the internet connection. Nothing was changed." }
}

Say "Step 4 of 4: Installing the new version"
# A new powershell reads the setup script as it is after the pull.
$setupArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $Root "setup-windows.ps1"))
if ($NoShortcut) { $setupArgs += "-NoShortcut" }
Invoke-Native "powershell.exe" $setupArgs
if ($script:NativeExit -ne 0) { Stop-Update "The new version is downloaded but not installed. Run update-windows.bat again; your backup is in the Backups screen." }
Say "DRAFTEX is up to date."
exit 0
