param([Parameter(Mandatory = $true)][string]$ArchiveRoot)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$tool = Join-Path $PSScriptRoot 'electron-runtime-input.cjs'
$manifestPath = Join-Path $root 'vendor/electron-runtime-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$archiveBase = (Resolve-Path -LiteralPath $ArchiveRoot).Path

& node $tool validate-archive $root $archiveBase
if ($LASTEXITCODE -ne 0) { throw 'Electron archive validation failed.' }

$prepared = Join-Path $root ([string]$manifest.runtime.preparedPath)
if (Test-Path -LiteralPath $prepared) {
    & node $tool validate-prepared $root
    if ($LASTEXITCODE -ne 0) { throw 'Prepared Electron runtime validation failed.' }
    Write-Output 'Pinned Electron runtime is already prepared.'
    return
}

$stagingRoot = Join-Path $root ('.work/prepare-electron-' + [guid]::NewGuid().ToString('N'))
$stagingRuntime = Join-Path $stagingRoot 'runtime'
New-Item -ItemType Directory -Path $stagingRuntime -Force | Out-Null
$archive = Join-Path $archiveBase ([string]$manifest.archive.name)
Expand-Archive -LiteralPath $archive -DestinationPath $stagingRuntime
& node $tool validate-directory $root $stagingRuntime
if ($LASTEXITCODE -ne 0) { throw 'Extracted Electron runtime validation failed.' }

$preparedParent = Split-Path -Parent $prepared
New-Item -ItemType Directory -Path $preparedParent -Force | Out-Null
Copy-Item -LiteralPath $stagingRuntime -Destination $prepared -Recurse
& node $tool validate-prepared $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared Electron runtime post-copy validation failed.' }
Write-Output 'Pinned Electron 44.4.2 Windows x64 runtime is ready.'
