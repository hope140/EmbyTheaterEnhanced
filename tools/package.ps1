param(
    [string]$RuntimeName = 'EmbyTheaterEnhanced-win-x64',
    [string]$Compiler = '',
    [string]$OutputBaseFilename = '',
    [switch]$VerifyOnly
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($RuntimeName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { throw 'Invalid runtime name.' }
$runtime = Join-Path (Join-Path $root 'dist') $RuntimeName
$sourceCommit = ([string]((& git -C $root rev-parse HEAD 2>$null) | Select-Object -First 1)).Trim()
if ($sourceCommit -notmatch '^[0-9a-fA-F]{40}$') { throw 'Unable to resolve source git commit.' }
$inputContractJson = & node (Join-Path $root 'tools/build-input-contract.cjs') $root $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Package inputs differ from sourceCommit.' }
$inputContract = $inputContractJson | ConvertFrom-Json
& node (Join-Path $root 'tools/build-input-provenance.cjs') validate $root $runtime $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Committed build input or notice validation failed before packaging.' }
& node (Join-Path $root 'tools/copy-runtime-dependencies.cjs') validate $root $runtime $sourceCommit
if ($LASTEXITCODE -ne 0) { throw 'Exact runtime dependency validation failed before packaging.' }
$versionCheck = & node (Join-Path $root 'tools/verify-product-version.cjs') `
    (Join-Path $root 'package.json') `
    (Join-Path $root 'package-lock.json') `
    (Join-Path $runtime 'electronapp/package.json') `
    (Join-Path $runtime 'build-manifest.json')
if ($LASTEXITCODE -ne 0) { throw 'Product version consistency validation failed before packaging.' }
& node (Join-Path $root 'tools/runtime-exclusions.cjs') verify $runtime
if ($LASTEXITCODE -ne 0) { throw 'Retired runtime artifact is present.' }
$sourceProvenanceText = (& node (Join-Path $root 'tools/source-provenance.cjs') validate $root $runtime $sourceCommit 2>$null | Out-String)
$sourceProvenanceExit = $LASTEXITCODE
$sourceProvenance = $null
try { $sourceProvenance = $sourceProvenanceText | ConvertFrom-Json } catch { }
if ($sourceProvenanceExit -ne 0 -or $null -eq $sourceProvenance -or $sourceProvenance.status -ne 'passed') { throw 'Source provenance validation failed before packaging.' }
$provenanceText = (& node (Join-Path $root 'tools/runtime-provenance.cjs') validate $root $runtime $sourceCommit 2>$null | Out-String)
$provenanceExit = $LASTEXITCODE
$provenance = $null
try { $provenance = $provenanceText | ConvertFrom-Json } catch { }
if ($provenanceExit -ne 0 -or $null -eq $provenance -or $provenance.status -ne 'passed') { throw 'Runtime provenance validation failed before packaging.' }
$build = Get-Content -LiteralPath (Join-Path $runtime 'build-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($build.schemaVersion -ne 3) { throw 'Unsupported build manifest schema; rebuild with the committed input contract.' }
if ($build.sourceCommit -ne $sourceCommit.ToLowerInvariant()) { throw 'Build manifest source commit mismatch.' }
if ($build.sourceManifestSha256 -ne ($inputContract.files | Where-Object { $_.path -eq 'vendor/runtime-manifest.json' }).sha256) { throw 'Build manifest vendor source mismatch.' }
if ($build.packageLockSha256 -ne ($inputContract.files | Where-Object { $_.path -eq 'package-lock.json' }).sha256) { throw 'Build manifest package lock mismatch.' }
$listedPaths = @($build.files | ForEach-Object { [string]$_.path })
if ($listedPaths.Count -ne @($listedPaths | Sort-Object -Unique).Count) { throw 'Duplicate path in build manifest.' }
foreach ($listedPath in $listedPaths) {
    if (-not $listedPath -or $listedPath.Contains('\') -or $listedPath.StartsWith('/') -or $listedPath -match '^[A-Za-z]:' -or @($listedPath.Split('/')) -contains '..' -or @($listedPath.Split('/')) -contains '.') {
        throw "Invalid path in build manifest: $listedPath"
    }
    if ($listedPath -eq 'build-manifest.json') { throw 'Build manifest cannot list itself.' }
}
$expectedPaths = @($listedPaths + @('build-manifest.json') | Sort-Object)
$actualFiles = @(Get-ChildItem -LiteralPath $runtime -Recurse -File)
$actualPaths = @($actualFiles | ForEach-Object { $_.FullName.Substring($runtime.Length + 1).Replace('\','/') } | Sort-Object)
$pathDifference = @(Compare-Object -ReferenceObject $expectedPaths -DifferenceObject $actualPaths)
if ($pathDifference.Count -ne 0) { throw 'Runtime payload path set differs from build manifest.' }
foreach ($file in $build.files) {
    $payloadFile = Join-Path $runtime $file.path
    if (-not (Test-Path -LiteralPath $payloadFile -PathType Leaf)) { throw "Runtime file missing: $($file.path)" }
    if ((Get-FileHash -LiteralPath $payloadFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw "Runtime changed since build: $($file.path)" }
}
$payloadSetText = (($build.files | ForEach-Object { $_.path + [char]0 + $_.sha256 + "`n" }) -join '')
$payloadSetAlgorithm = [Security.Cryptography.SHA256]::Create()
try { $payloadSetSha256 = ([BitConverter]::ToString($payloadSetAlgorithm.ComputeHash([Text.Encoding]::UTF8.GetBytes($payloadSetText)))).Replace('-','').ToLowerInvariant() }
finally { $payloadSetAlgorithm.Dispose() }
if ($build.payload.fileCount -ne $build.files.Count -or $build.payload.payloadSetSha256 -ne $payloadSetSha256) { throw 'Build manifest payload digest mismatch.' }
$expectedBindings = @{ inputs='build-input-provenance.json'; source='source-provenance.json'; runtime='runtime-provenance.json' }
foreach ($bindingName in @('inputs','source','runtime')) {
    $binding = $build.provenance.$bindingName
    if (-not $binding.path -or -not $binding.sha256) { throw 'Build manifest provenance binding missing.' }
    if ($binding.path -ne $expectedBindings[$bindingName]) { throw 'Build manifest provenance path mismatch.' }
    if ((Get-FileHash -LiteralPath (Join-Path $runtime $binding.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $binding.sha256) { throw "Build manifest provenance hash mismatch: $($binding.path)" }
}
if ($VerifyOnly) { Write-Output "Runtime payload verified: $($build.files.Count) files"; return }
if (-not $Compiler) {
    $localCompiler = Join-Path $root '.work/toolchain/inno/{app}/ISCC.exe'
    if (Test-Path -LiteralPath $localCompiler) { $Compiler = $localCompiler }
    else { $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue; if ($command) { $Compiler = $command.Source } }
}
if (-not $Compiler -or -not (Test-Path -LiteralPath $Compiler)) { throw 'Inno Setup 6 compiler missing. Provide -Compiler path/to/ISCC.exe; no software is installed automatically.' }
$innoToolchainJson = & node (Join-Path $root 'tools/build-toolchains.cjs') inno $root $Compiler
if ($LASTEXITCODE -ne 0) { throw 'Pinned Inno compiler toolchain identity mismatch.' }
$innoToolchain = $innoToolchainJson | ConvertFrom-Json
if (-not $OutputBaseFilename) { $OutputBaseFilename = "EmbyTheaterEnhanced-$($build.version)-win-x64-setup" }
if ($OutputBaseFilename -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { throw 'Invalid installer output base filename.' }
$output = Join-Path $root ("dist/" + $OutputBaseFilename + '.exe')
if (Test-Path -LiteralPath $output) { throw 'Installer already exists; preserve it before packaging again.' }
if ((Test-Path -LiteralPath ($output + '.provenance.json')) -or (Test-Path -LiteralPath ($output + '.sha256'))) { throw 'Installer companion output already exists.' }
& $Compiler '/Q' "/DAppVersion=$($build.version)" "/DRuntimeDir=$runtime" "/DOutputDir=$(Join-Path $root 'dist')" "/DOutputBaseFilename=$OutputBaseFilename" (Join-Path $root 'installer/EmbyTheaterEnhanced.iss')
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) { throw 'Installer compilation failed.' }
$installerHash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
$receipt = [ordered]@{
    schemaVersion=1
    sourceCommit=$sourceCommit.ToLowerInvariant()
    version=$build.version
    runtimeManifestSha256=(Get-FileHash -LiteralPath (Join-Path $runtime 'build-manifest.json')).Hash.ToLowerInvariant()
    compiler=$innoToolchain
    installer=[ordered]@{ fileName=([IO.Path]::GetFileName($output)); size=(Get-Item -LiteralPath $output).Length; sha256=$installerHash }
}
$utf8 = New-Object Text.UTF8Encoding($false)
function Write-NewCompanion([string]$Path, [string]$Text) {
    $stream = New-Object IO.FileStream($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $bytes = $utf8.GetBytes($Text); $stream.Write($bytes, 0, $bytes.Length) }
    finally { $stream.Dispose() }
}
# Preserve partial artifacts on failure for inspection; never replace a receipt
# that appeared after the preflight check. Retry with a new output basename.
Write-NewCompanion ($output + '.provenance.json') (($receipt | ConvertTo-Json -Depth 12) + "`n")
Write-NewCompanion ($output + '.sha256') ($installerHash + '  ' + [IO.Path]::GetFileName($output) + "`n")
Write-Output ("Installer complete: " + [IO.Path]::GetFileName($output) + ' SHA256=' + $installerHash)
