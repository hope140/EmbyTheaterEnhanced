param([switch]$HelperStartup, [switch]$PreviewPacing)
if ($PreviewPacing -and -not $HelperStartup) { throw 'Preview pacing requires helper startup.' }
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
if ($HelperStartup) {
    & node (Join-Path $PSScriptRoot 'windows-native-helper-startup.cjs') prepare $root
    if ($LASTEXITCODE -ne 0) { throw 'Isolated helper runtime preparation failed.' }
    & (Join-Path $PSScriptRoot 'prepare-ci-build-inputs.ps1') -NativeOnly
    if (-not $?) { throw 'Pinned Native toolchain preparation failed.' }
    $runtime = Join-Path $root '.work/native-helper-startup/runtime'
    & (Join-Path $PSScriptRoot 'build-native-helper.ps1') -SourceCommit $env:GITHUB_SHA -RuntimeRoot $runtime
    if (-not $?) { throw 'Production helper compilation failed.' }
    & node (Join-Path $PSScriptRoot 'windows-native-helper-startup.cjs') run $root
    if ($LASTEXITCODE -ne 0) { throw 'Production helper startup failed; inspect its isolated records.' }
}

if ($PreviewPacing) {
    & node (Join-Path $PSScriptRoot 'windows-native-helper-startup.cjs') pacing $root
    if ($LASTEXITCODE -ne 0) { throw 'Production helper pacing comparison failed; inspect isolated records.' }
}
