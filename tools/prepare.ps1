param([string]$ArchiveRoot = '', [string]$OfficialElectronSourceRoot = '', [string]$LibmpvSnapshotFile = '', [string]$CompatibilitySnapshotRoot = '', [string]$SmallRuntimeSnapshotRoot = '', [string]$ModelSnapshotRoot = '', [string]$WebSnapshotRoot = '')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$archiveBase = if ($ArchiveRoot) { (Resolve-Path -LiteralPath $ArchiveRoot).Path } else { $root }
# All component restoration is explicit; no old installer or combined-patch bootstrap.
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/web-snapshot'))) {
    if (-not $WebSnapshotRoot) { throw 'Provide -WebSnapshotRoot with the independent verified Web snapshot; no legacy fallback.' }
    & node (Join-Path $PSScriptRoot 'web-snapshot-input.cjs') restore $root $WebSnapshotRoot
    if ($LASTEXITCODE -ne 0) { throw 'Independent Web restoration failed.' }
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
    if ($LibmpvSnapshotFile) {
        & node (Join-Path $PSScriptRoot 'libmpv-input.cjs') import $root $LibmpvSnapshotFile
    } else {
        & node (Join-Path $PSScriptRoot 'prepare-libmpv.cjs') $root
    }
    if ($LASTEXITCODE -ne 0) { throw 'Pinned libmpv preparation failed.' }
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
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/small-runtime/snapshot-v1'))) {
    if (-not $SmallRuntimeSnapshotRoot) { throw 'Provide -SmallRuntimeSnapshotRoot with the exact four preserved small runtime files; no automatic legacy fallback.' }
    & node (Join-Path $PSScriptRoot 'small-runtime-input.cjs') import $root $SmallRuntimeSnapshotRoot
    if ($LASTEXITCODE -ne 0) { throw 'Small runtime snapshot preparation failed.' }
}
& node (Join-Path $PSScriptRoot 'small-runtime-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'Small runtime snapshot validation failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'vendor/model-compatibility/snapshot-v1'))) {
    if ($ModelSnapshotRoot) {
        # Compatibility parameter name retained; only the pinned official bytes pass.
        & node (Join-Path $PSScriptRoot 'model-compatibility-input.cjs') import $root $ModelSnapshotRoot
    } else {
        $modelManifest = Get-Content -LiteralPath (Join-Path $root 'vendor/model-compatibility-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        & (Join-Path $PSScriptRoot 'prepare-model-compatibility.ps1') -ArchivePath (Join-Path $archiveBase ([string]$modelManifest.archive.name))
    }
    if ($LASTEXITCODE -ne 0) { throw 'Official Model component preparation failed.' }
}
& node (Join-Path $PSScriptRoot 'model-compatibility-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'Model snapshot validation failed.' }
& node (Join-Path $PSScriptRoot 'prepare-preload.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared preload generation failed.' }
& (Join-Path $PSScriptRoot 'prepare-electron-runtime.ps1') -ArchiveRoot $archiveBase
if ($LASTEXITCODE -ne 0) { throw 'Pinned Electron runtime preparation failed.' }
Write-Output 'Vendor inputs and prepared workspace artifacts are ready. build.ps1 checks every input before building.'
