param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows -or $env:GITHUB_ACTIONS -ne 'true') { throw 'Explicit cloud Windows diagnostic required.' }
$root = Split-Path -Parent $PSScriptRoot
& node (Join-Path $PSScriptRoot 'electron-runtime-input.cjs') validate-manifest $root
if ($LASTEXITCODE -ne 0) { throw 'Pinned Electron manifest invalid.' }
$archives = Join-Path $root '.work/native-loader-electron-archive'
if (Test-Path -LiteralPath $archives) { throw 'Preserve existing loader input.' }
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $root 'vendor/electron-runtime-manifest.json') | ConvertFrom-Json
if ($manifest.archive.sourceUrl -cne 'https://github.com/electron/electron/releases/download/v44.4.2/electron-v44.4.2-win32-x64.zip') { throw 'Pinned official Electron source required.' }
New-Item -ItemType Directory -Path $archives -Force | Out-Null
Invoke-WebRequest -Uri $manifest.archive.sourceUrl -OutFile (Join-Path $archives $manifest.archive.name) -TimeoutSec 120
& (Join-Path $PSScriptRoot 'prepare-electron-runtime.ps1') -ArchiveRoot $archives
if (-not $?) { throw 'Pinned Electron validation failed.' }
& node (Join-Path $PSScriptRoot 'prepare-libmpv.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Pinned libmpv recovery failed.' }
& node (Join-Path $PSScriptRoot 'windows-native-loader-probe.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Loader diagnostic failed; retain its bounded records.' }
