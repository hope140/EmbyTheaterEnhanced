param([string]$ArchiveRoot = '', [string]$OfficialElectronSourceRoot = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $root 'vendor/runtime-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$archiveBase = if ($ArchiveRoot) { (Resolve-Path -LiteralPath $ArchiveRoot).Path } else { $root }
foreach ($archive in $manifest.archives) {
    $file = Join-Path $archiveBase $archive.pattern
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Input archive missing: $($archive.pattern)" }
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $archive.sha256) { throw 'Input archive SHA256 mismatch.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'node_modules/node-unrar-js'))) { throw 'Run npm ci --ignore-scripts first.' }
$staging = Join-Path $root ('.work/prepare-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/carnival'))) {
    & node (Join-Path $PSScriptRoot 'extract-carnival.cjs') (Join-Path $archiveBase $manifest.archives[0].pattern) (Join-Path $staging 'carnival')
    if ($LASTEXITCODE -ne 0) { throw 'Carnival extraction failed.' }
    Copy-Item -LiteralPath (Join-Path $staging 'carnival/Emby Theater') -Destination (Join-Path $root 'vendor/carnival') -Recurse
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/patch'))) {
    Expand-Archive -LiteralPath (Join-Path $archiveBase $manifest.archives[1].pattern) -DestinationPath (Join-Path $root 'vendor/patch')
}
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/web-snapshot'))) {
    & node (Join-Path $PSScriptRoot 'web-snapshot-input.cjs') import $root (Join-Path $root 'vendor/carnival') (Join-Path $root 'vendor/patch')
    if ($LASTEXITCODE -ne 0) { throw 'One-time Web snapshot import failed.' }
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
& node (Join-Path $PSScriptRoot 'prepare-preload.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared preload generation failed.' }
& (Join-Path $PSScriptRoot 'prepare-electron-runtime.ps1') -ArchiveRoot $archiveBase
if ($LASTEXITCODE -ne 0) { throw 'Pinned Electron runtime preparation failed.' }
Write-Output 'Vendor inputs and prepared workspace artifacts are ready. build.ps1 checks every input before building.'
