# DRAFTEX uninstall for Windows (D52). Removes the app's own pieces: the desktop
# shortcut, Node.js in .runtime, node_modules and the build. The data folder
# (papers, backups, settings) is never touched. DRAFTEX must be closed.
# Start it by double-clicking uninstall-windows.bat (D44).
# Keep this file ASCII only: Windows PowerShell 5.1 reads it as ANSI.
param(
  # Do not ask before uninstalling (CI). The GitHub token is kept unless -RemoveToken.
  [switch]$Yes,
  [switch]$RemoveToken
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 3

$Root = $PSScriptRoot
$NodeExe = Join-Path $Root ".runtime\node\node.exe"

function Say([string]$Message) { Write-Host "[uninstall] $Message" }
function Ask([string]$Question) {
  if ($Yes) { return $true }
  $answer = Read-Host "[uninstall] $Question (y/N)"
  return $answer -match "^(y|yes)$"
}

Set-Location $Root
$dataDir = "(unknown)"
if (Test-Path $NodeExe) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $out = & $NodeExe (Join-Path $Root "scripts\uninstall-check.ts")
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  if ($code -ne 0) { exit 1 }
  $dataDir = "$out".Trim()
}

Say "This removes DRAFTEX's program files from $Root and the desktop shortcut."
Say "Your papers, backups and settings in $dataDir are KEPT."
if (-not (Ask "Uninstall DRAFTEX now?")) {
  Say "Nothing was changed."
  exit 0
}

$desktop = [Environment]::GetFolderPath("Desktop")
$link = Join-Path $desktop "DRAFTEX.lnk"
if (Test-Path $link) {
  $target = (New-Object -ComObject WScript.Shell).CreateShortcut($link).TargetPath
  if ($target -eq (Join-Path $Root "start-windows.bat")) {
    Remove-Item -Force $link
    Say "Removed the desktop shortcut."
  } else {
    Say "Left $link alone: it belongs to another copy of DRAFTEX."
  }
}

$old = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& netsh advfirewall firewall show rule name=DRAFTEX | Out-Null
$hasRule = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $old
if ($hasRule) {
  if (Ask "Remove the Windows Firewall rule that lets other computers reach DRAFTEX? Windows asks for permission.") {
    try {
      Start-Process -FilePath "netsh.exe" -ArgumentList "advfirewall", "firewall", "delete", "rule", "name=DRAFTEX" -Verb RunAs -Wait -WindowStyle Hidden
      Say "Removed the firewall rule."
    } catch {
      Say "The firewall rule was not removed (permission was not given)."
    }
  }
}

foreach ($name in @(".next", "node_modules", "cache", ".runtime")) {
  $path = Join-Path $Root $name
  if (Test-Path $path) {
    Say "Removing $name ..."
    Remove-Item -Recurse -Force $path
  }
}

if ($RemoveToken -or ((-not $Yes) -and (Ask "Also remove the saved GitHub token used for updates?"))) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    "protocol=https`nhost=github.com`n" | & git credential reject
    Say "Removed the saved GitHub sign-in for github.com."
  } catch {
    Say "Git is not installed, so there was no saved GitHub sign-in to remove."
  }
  $ErrorActionPreference = $old
}

Say "DRAFTEX is uninstalled. Your papers are still in $dataDir"
Say "To finish, close this window and delete the folder $Root"
Say "To use DRAFTEX again later, set it up again; it finds the papers in that folder."
exit 0
