param([string]$OutputName = 'EmbyTheaterEnhanced-win-x64')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
if ($OutputName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { throw 'OutputName must be a simple directory name.' }
$sourceCommit = ([string]((& git -C $root rev-parse HEAD 2>$null) | Select-Object -First 1)).Trim()
if ($sourceCommit -notmatch '^[0-9a-fA-F]{40}$') { throw 'Unable to resolve source git commit.' }
$inputContractJson = & node (Join-Path $root 'tools/build-input-contract.cjs') $root $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Build inputs differ from sourceCommit.' }
$inputContract = $inputContractJson | ConvertFrom-Json
$destination = Join-Path (Join-Path $root 'dist') $OutputName
if (Test-Path -LiteralPath $destination) { throw 'Output already exists. Choose a new -OutputName; builds never overwrite prior artifacts.' }
$manifest = Get-Content -LiteralPath (Join-Path $root 'vendor/runtime-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
& node (Join-Path $root 'tools/validate-build-materials.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Build material validation failed.' }
& node (Join-Path $root 'tools/prepare-preload.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared preload generation failed.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$dependencyOwner = & node (Join-Path $root 'tools/copy-runtime-dependencies.cjs') create-owner $root $destination $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Fresh build output ownership failed.' }
& node (Join-Path $root 'tools/assemble-runtime-base.cjs') assemble $root $sourceCommit $destination $dependencyOwner
if ($LASTEXITCODE -ne 0) { throw 'Explicit runtime base assembly failed.' }
& node (Join-Path $root 'tools/runtime-exclusions.cjs') verify $destination
if ($LASTEXITCODE -ne 0) { throw 'Retired runtime exclusion verification failed.' }
# Carnival Electron remains a historical baseline input. Production uses the
# exact full tree extracted from the pinned official Electron archive.
$electronManifest = Get-Content -LiteralPath (Join-Path $root 'vendor/electron-runtime-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$electronInputTool = Join-Path $root 'tools/electron-runtime-input.cjs'
& node $electronInputTool validate-prepared $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared Electron runtime validation failed.' }
$electronTarget = Join-Path $destination ([string]$electronManifest.runtime.runtimePath)
$electronSource = Join-Path $root ([string]$electronManifest.runtime.preparedPath)
if (Test-Path -LiteralPath $electronTarget) { throw 'Explicit base assembly unexpectedly copied the retired Electron tree.' }
Copy-Item -LiteralPath $electronSource -Destination $electronTarget -Recurse
& node $electronInputTool validate-runtime $root $destination
if ($LASTEXITCODE -ne 0) { throw 'Production Electron runtime replacement validation failed.' }
# Ordinary tracked product sources come from the committed Git blobs, never from checkout bytes.
& node (Join-Path $root 'tools/copy-tracked-product-sources.cjs') $root $sourceCommit $destination
if ($LASTEXITCODE -ne 0) { throw 'Tracked product source materialization failed.' }
# preload.js is an ignored prepared artifact with a tracked generator contract.
Copy-Item -LiteralPath (Join-Path $root 'src/electronapp/preload.js') -Destination (Join-Path $destination 'electronapp/preload.js') -Force
# Assemble only authoritative Web overlays; ignored src/electronapp/www is never copied.
& node (Join-Path $root 'tools/prepare-web-overlays.cjs') $root $destination
if ($LASTEXITCODE -ne 0) { throw 'Web overlay preparation failed.' }
# The legacy External Player frontend is intentionally absent from Enhanced runtime.
# The explicit base assembler never copies this retired subtree.
$externalPlayerPath = Join-Path $destination 'electronapp/www/modules/externalplayer'
if (Test-Path -LiteralPath $externalPlayerPath) { throw 'External Player frontend exclusion failed.' }
# npm verifies locked tarball integrity into a unique project, never reusing a
# possibly edited node_modules directory from this or an earlier checkout.
$dependencyInput = Join-Path $root ('.work/runtime-dependencies-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dependencyInput | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'package.json'),(Join-Path $root 'package-lock.json') -Destination $dependencyInput
& npm.cmd ci --prefix $dependencyInput --ignore-scripts --omit=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Fresh locked runtime dependency installation failed.' }
& node (Join-Path $root 'tools/copy-runtime-dependencies.cjs') copy $root $destination $dependencyInput $dependencyOwner
if ($LASTEXITCODE -ne 0) { throw 'Runtime dependency copy failed.' }
& node (Join-Path $root 'tools/patch-playbackmanager.cjs') (Join-Path $destination 'electronapp/www/modules/common/playback/playbackmanager.js')
if ($LASTEXITCODE -ne 0) { throw 'PlaybackManager overlay failed.' }
Copy-Item -LiteralPath (Join-Path $root 'vendor/patch/payload/libmpv/mpv-1.dll') -Destination (Join-Path $destination 'electronapp/libmpv/x64/mpv-1.dll') -Force
& (Join-Path $root 'tools/build-native-helper.ps1') -SourceCommit $sourceCommit -RuntimeRoot $destination
if ($LASTEXITCODE -ne 0) { throw 'Native helper build failed.' }
& node (Join-Path $root 'tools/native-helper-provenance.cjs') $root $destination $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Native helper provenance validation failed.' }
# Settings remain at the user's existing values; the optional legacy mpv preset is not applied.
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$packagePath = Join-Path $destination 'electronapp/package.json'
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$package.name = 'emby-theater-enhanced'
$package.productName = 'Emby Theater Enhanced'
$package.version = $version
$utf8 = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($packagePath, ($package | ConvertTo-Json -Depth 10) + "`n", $utf8)
# Copy committed notices and apply the checked base/generator/output config relation.
& node (Join-Path $root 'tools/build-input-provenance.cjs') write $root $destination $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Build input provenance generation failed.' }
& node (Join-Path $root 'tools/source-provenance.cjs') write $root $destination $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Source provenance generation failed.' }
& node (Join-Path $root 'tools/runtime-provenance.cjs') write $root $destination $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Runtime provenance generation failed.' }
$files = @(Get-ChildItem -LiteralPath $destination -Recurse -File | Sort-Object FullName | ForEach-Object {
    [ordered]@{ path=$_.FullName.Substring($destination.Length + 1).Replace('\','/'); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$payloadSetText = (($files | ForEach-Object { $_.path + [char]0 + $_.sha256 + "`n" }) -join '')
$payloadSetBytes = [Text.Encoding]::UTF8.GetBytes($payloadSetText)
$payloadSetAlgorithm = [Security.Cryptography.SHA256]::Create()
try { $payloadSetSha256 = ([BitConverter]::ToString($payloadSetAlgorithm.ComputeHash($payloadSetBytes))).Replace('-','').ToLowerInvariant() }
finally { $payloadSetAlgorithm.Dispose() }
$report = [ordered]@{
    schemaVersion=3
    sourceCommit=$sourceCommit.ToLowerInvariant()
    version=$version
    baseline=$manifest.baseline
    sourceManifestSha256=($inputContract.files | Where-Object { $_.path -eq 'vendor/runtime-manifest.json' }).sha256
    packageLockSha256=($inputContract.files | Where-Object { $_.path -eq 'package-lock.json' }).sha256
    provenance=[ordered]@{
        inputs=[ordered]@{ path='build-input-provenance.json'; sha256=(Get-FileHash -LiteralPath (Join-Path $destination 'build-input-provenance.json')).Hash.ToLowerInvariant() }
        source=[ordered]@{ path='source-provenance.json'; sha256=(Get-FileHash -LiteralPath (Join-Path $destination 'source-provenance.json')).Hash.ToLowerInvariant() }
        runtime=[ordered]@{ path='runtime-provenance.json'; sha256=(Get-FileHash -LiteralPath (Join-Path $destination 'runtime-provenance.json')).Hash.ToLowerInvariant() }
    }
    payload=[ordered]@{ fileCount=$files.Count; payloadSetSha256=$payloadSetSha256 }
    files=$files
}
[IO.File]::WriteAllText((Join-Path $destination 'build-manifest.json'), ($report | ConvertTo-Json -Depth 10) + "`n", $utf8)
Write-Output "Build complete: dist/$OutputName ($($files.Count) files)"
