param([string]$ArchiveRoot = '', [string]$OfficialElectronSourceRoot = '', [string]$LibmpvSnapshotFile = '', [string]$CompatibilitySnapshotRoot = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $root 'vendor/runtime-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$archiveBase = if ($ArchiveRoot) { (Resolve-Path -LiteralPath $ArchiveRoot).Path } else { $root }
# Remaining Carnival assets still have the legacy bootstrap. Only acquire that
# archive when those assets are absent; the old combined patch is never read.
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/carnival'))) {
    $archive = $manifest.archives[0]
    $file = Join-Path $archiveBase $archive.pattern
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Carnival bootstrap archive missing.' }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $archive.sha256) { throw 'Carnival bootstrap archive SHA256 mismatch.' }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules/node-unrar-js'))) { throw 'Run npm ci --ignore-scripts for the Carnival bootstrap first.' }
    $staging = Join-Path $root ('.work/prepare-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    & node (Join-Path $PSScriptRoot 'extract-carnival.cjs') $file (Join-Path $staging 'carnival')
    if ($LASTEXITCODE -ne 0) { throw 'Carnival extraction failed.' }
    Copy-Item -LiteralPath (Join-Path $staging 'carnival/Emby Theater') -Destination (Join-Path $root 'vendor/carnival') -Recurse
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/web-snapshot'))) {
    throw 'Prepare the independent fixed Web snapshot first. Historical one-time import is an explicit separate operation.'
}
& node (Join-Path $PSScriptRoot 'web-snapshot-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'Web snapshot validation failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/windows-host/3.0.20'))) {
    $hostManifest = Get-Content -LiteralPath (Join-Path $root 'vendor/windows-host-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    & (Join-Path $PSScriptRoot 'prepare-windows-host.ps1') -ArchivePath (Join-Path $archiveBase ([string]$hostManifest.archive.name))
    if ($LASTEXITCODE -ne 0) { throw 'Official Windows Host component preparation failed.' }
}
& node (Join-Path $PSScriptRoot 'windows-host-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'Windows Host component validation failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/inherited-npm/emby-electron-3.0.20'))) {
    if (-not $OfficialElectronSourceRoot) { throw 'Provide -OfficialElectronSourceRoot with the pinned official Electron Git commit; inherited npm is never copied from Carnival.' }
    & node (Join-Path $PSScriptRoot 'inherited-npm-input.cjs') prepare $root $OfficialElectronSourceRoot
    if ($LASTEXITCODE -ne 0) { throw 'Official inherited npm component preparation failed.' }
}
& node (Join-Path $PSScriptRoot 'inherited-npm-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'Inherited npm component validation failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/libmpv/20260809'))) {
    if (-not $LibmpvSnapshotFile) { throw 'Provide -LibmpvSnapshotFile with the exact fixed DLL snapshot; online archive recovery remains unresolved.' }
    & node (Join-Path $PSScriptRoot 'libmpv-input.cjs') import $root $LibmpvSnapshotFile
    if ($LASTEXITCODE -ne 0) { throw 'libmpv snapshot preparation failed.' }
}
& node (Join-Path $PSScriptRoot 'libmpv-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'libmpv snapshot validation failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/compatibility-resources/snapshot-v1'))) {
    if (-not $CompatibilitySnapshotRoot) { throw 'Provide -CompatibilitySnapshotRoot with the exact preserved compatibility resources; no automatic legacy fallback.' }
    & node (Join-Path $PSScriptRoot 'compatibility-resources-input.cjs') import $root $CompatibilitySnapshotRoot
    if ($LASTEXITCODE -ne 0) { throw 'Compatibility resource snapshot preparation failed.' }
}
& node (Join-Path $PSScriptRoot 'compatibility-resources-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'Compatibility resource snapshot validation failed.' }
& node (Join-Path $PSScriptRoot 'prepare-preload.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared preload generation failed.' }
& (Join-Path $PSScriptRoot 'prepare-electron-runtime.ps1') -ArchiveRoot $archiveBase
if ($LASTEXITCODE -ne 0) { throw 'Pinned Electron runtime preparation failed.' }
Write-Output 'Vendor inputs and prepared workspace artifacts are ready. build.ps1 checks every input before building.'
