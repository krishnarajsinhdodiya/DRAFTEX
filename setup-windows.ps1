# DRAFTEX setup for Windows. Safe to run again: each step skips what is done.
# Start it by double-clicking setup-windows.bat (D44). Needs no admin rights:
# Node.js is unpacked into this folder (D43), nothing is installed system-wide.
# Keep this file ASCII only: Windows PowerShell 5.1 reads it as ANSI.
param(
  # Do not create the desktop shortcut (CI, a second copy for testing).
  [switch]$NoShortcut
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version 3
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Root = $PSScriptRoot
# Official checksums from https://nodejs.org/dist/v24.22.2/SHASUMS256.txt (checked 2026-11-04).
$NodeVersion = "24.22.2"
$NodeSha256 = @{
  "x64" = "ca1bff5d8ead13c9f2ea404a176db46bd430704d5b5113734049fa365e7799e2"
  "arm64" = "f47968c213105077f64c6510f007632c0ca2574802a0b5067c327c49abe1c468"
}
$Runtime = Join-Path $Root ".runtime"
$NodeDir = Join-Path $Runtime "node"
$NodeExe = Join-Path $NodeDir "node.exe"
$Started = Get-Date

function Say([string]$Message) { Write-Host "[setup] $Message" }
function Stop-Setup([string]$Message) {
  Write-Host ""
  Write-Host "[setup] STOPPED: $Message" -ForegroundColor Red
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

function Get-Arch {
  $a = $env:PROCESSOR_ARCHITEW6432
  if (-not $a) { $a = $env:PROCESSOR_ARCHITECTURE }
  if ($a -eq "AMD64") { return "x64" }
  if ($a -eq "ARM64") { return "arm64" }
  Stop-Setup "DRAFTEX needs 64-bit Windows; this computer reports '$a'."
}

function Install-Node {
  if (Test-Path $NodeExe) {
    $have = "$(& $NodeExe --version)".Trim()
    if ($have -eq "v$NodeVersion") {
      Say "Node.js $NodeVersion is already in place."
      return
    }
    Say "Replacing Node.js $have with $NodeVersion."
  }
  $arch = Get-Arch
  $name = "node-v$NodeVersion-win-$arch"
  $url = "https://nodejs.org/dist/v$NodeVersion/$name.zip"
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("draftex-node-" + [Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $zip = Join-Path $tmp "$name.zip"
    Say "Downloading Node.js $NodeVersion ($arch, about 35 MB)..."
    try {
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    } catch {
      Stop-Setup "Could not download $url. Check the internet connection and run setup again."
    }
    $hash = (Get-FileHash -Algorithm SHA256 -Path $zip).Hash.ToLowerInvariant()
    if ($hash -ne $NodeSha256[$arch]) {
      Stop-Setup "The Node.js download does not match its pinned checksum, so it was not used. Try again later."
    }
    Say "Checksum matches. Unpacking..."
    $tar = Join-Path $env:SystemRoot "System32\tar.exe"
    if (Test-Path $tar) {
      Invoke-Native $tar @("-xf", $zip, "-C", $tmp)
      if ($script:NativeExit -ne 0) { Stop-Setup "Could not unpack $zip." }
    } else {
      Expand-Archive -Path $zip -DestinationPath $tmp -Force
    }
    New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
    if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
    Move-Item -Path (Join-Path $tmp $name) -Destination $NodeDir
  } finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
  Say "Node.js $NodeVersion is in $NodeDir"
}

function New-DesktopShortcut {
  $desktop = [Environment]::GetFolderPath("Desktop")
  if (-not $desktop -or -not (Test-Path $desktop)) {
    Say "No desktop folder found; start DRAFTEX with start-windows.bat in $Root"
    return
  }
  $link = Join-Path $desktop "DRAFTEX.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $s = $shell.CreateShortcut($link)
  $s.TargetPath = Join-Path $Root "start-windows.bat"
  $s.WorkingDirectory = $Root
  $s.Description = "Start DRAFTEX and open it in the browser"
  $icon = Join-Path $Root "assets\draftex.ico"
  if (Test-Path $icon) { $s.IconLocation = "$icon,0" }
  $s.Save()
  Say "Desktop shortcut: $link"
}

Set-Location $Root
Say "Setting up DRAFTEX in $Root"

Say "Part 1 of 3: Node.js"
Install-Node
$env:Path = "$NodeDir;$env:Path"
$env:CHECKPOINT_DISABLE = "1"
$env:NEXT_TELEMETRY_DISABLED = "1"

Say "Part 2 of 3: The app's packages (npm ci; a few minutes the first time)"
Invoke-Native (Join-Path $NodeDir "npm.cmd") @("ci", "--no-audit", "--no-fund")
if ($script:NativeExit -ne 0) { Stop-Setup "The packages could not be installed. The messages above say why; check the internet connection and run setup again." }

Say "Part 3 of 3: Database, LaTeX engine and app"
Invoke-Native $NodeExe @((Join-Path $Root "scripts\install.ts"))
if ($script:NativeExit -ne 0) { Stop-Setup "Setup did not finish. The messages above say why." }

$minutes = [int]((Get-Date) - $Started).TotalMinutes
if ($minutes -lt 1) { $took = "under a minute" } else { $took = "about $minutes min" }
if ($NoShortcut) {
  Say "No desktop shortcut (-NoShortcut)."
  Say "DRAFTEX is set up (took $took). Start it with start-windows.bat in $Root"
} else {
  New-DesktopShortcut
  Say "DRAFTEX is set up (took $took). Double-click DRAFTEX on the desktop to start it."
}
exit 0
