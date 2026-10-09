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
foreach ($group in @(@{ Root='vendor/carnival'; Files=$manifest.files }, @{ Root='vendor/patch'; Files=$manifest.patchFiles })) {
    $groupRoot = Join-Path $root $group.Root
    $expectedPaths = @($group.Files | ForEach-Object { $_.path })
    $actualFiles = @(Get-ChildItem -LiteralPath $groupRoot -Recurse -File)
    if ($actualFiles.Count -ne $expectedPaths.Count) { throw "Unexpected vendor file count: $($group.Root)" }
    foreach ($actual in $actualFiles) {
        $relative = $actual.FullName.Substring($groupRoot.Length + 1).Replace('\','/')
        if ($relative -notin $expectedPaths) { throw "Unexpected vendor file: $relative" }
    }
    foreach ($entry in $group.Files) {
        $file = Join-Path (Join-Path $root $group.Root) $entry.path
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Vendor file missing: $($entry.path). Run tools/prepare.ps1." }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Vendor hash mismatch: $($entry.path)" }
    }
}
& node (Join-Path $root 'tools/prepare-preload.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared preload generation failed.' }
New-Item -ItemType Directory -Path $destination -Force | Out-Null
$dependencyOwner = & node (Join-Path $root 'tools/copy-runtime-dependencies.cjs') create-owner $root $destination $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Fresh build output ownership failed.' }
Get-ChildItem -LiteralPath (Join-Path $root 'vendor/carnival') | Copy-Item -Destination $destination -Recurse
# The immutable Carnival copy contains the retired bridge input for historical
# provenance only. It must never enter an Enhanced runtime.
& node (Join-Path $root 'tools/runtime-exclusions.cjs') remove $destination
if ($LASTEXITCODE -ne 0) { throw 'Retired runtime exclusion failed.' }
# Carnival Electron remains a historical baseline input. Production uses the
# exact full tree extracted from the pinned official Electron archive.
$electronManifest = Get-Content -LiteralPath (Join-Path $root 'vendor/electron-runtime-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$electronInputTool = Join-Path $root 'tools/electron-runtime-input.cjs'
& node $electronInputTool validate-prepared $root
if ($LASTEXITCODE -ne 0) { throw 'Prepared Electron runtime validation failed.' }
$electronTarget = Join-Path $destination ([string]$electronManifest.runtime.runtimePath)
$electronSource = Join-Path $root ([string]$electronManifest.runtime.preparedPath)
if (Test-Path -LiteralPath $electronTarget) { Remove-Item -LiteralPath $electronTarget -Recurse -Force }
Copy-Item -LiteralPath $electronSource -Destination $electronTarget -Recurse
& node $electronInputTool validate-runtime $root $destination
if ($LASTEXITCODE -ne 0) { throw 'Production Electron runtime replacement validation failed.' }
# Ordinary tracked product sources come from the committed Git blobs, never from checkout bytes.
& node (Join-Path $root 'tools/copy-tracked-product-sources.cjs') $root $sourceCommit $destination
if ($LASTEXITCODE -ne 0) { throw 'Tracked product source materialization failed.' }
# preload.js is an ignored prepared artifact with a tracked generator contract.
Copy-Item -LiteralPath (Join-Path $root 'src/electronapp/preload.js') -Destination (Join-Path $destination 'electronapp/preload.js') -Force
# The frozen Web snapshot has exactly three authoritative overlays. Never copy ignored src/electronapp/www state.
& node (Join-Path $root 'tools/prepare-web-overlays.cjs') $root $destination
if ($LASTEXITCODE -ne 0) { throw 'Web overlay preparation failed.' }
# The legacy External Player frontend is intentionally absent from Enhanced runtime.
# Keep vendor/carnival read-only; exclude the copied path from this fresh output.
$externalPlayerPath = Join-Path $destination 'electronapp/www/modules/externalplayer'
if (Test-Path -LiteralPath $externalPlayerPath) {
    Remove-Item -LiteralPath $externalPlayerPath -Recurse -Force
}
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
