param([switch]$ReleasePackage, [switch]$NativePreviewTrial, [switch]$NativeLoaderOnly, [switch]$NativeHelperOnly, [switch]$NativePreviewPacingOnly)
if ($NativePreviewPacingOnly -and ($ReleasePackage -or $NativePreviewTrial -or $NativeLoaderOnly -or $NativeHelperOnly)) { throw 'Preview pacing must be selected alone.' }
if ($ReleasePackage -and $NativePreviewTrial) { throw 'Native preview trial cannot be a release package.' }
if ($NativeLoaderOnly -and ($ReleasePackage -or $NativePreviewTrial -or $NativeHelperOnly)) { throw 'Loader diagnostic must be selected alone.' }
if ($NativeHelperOnly -and ($ReleasePackage -or $NativePreviewTrial -or $NativeLoaderOnly)) { throw 'Helper startup must be selected alone.' }
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
if (-not $IsWindows) { throw 'This test package job requires Windows.' }
$source = ([string](& git rev-parse HEAD)).Trim()
if ($LASTEXITCODE -ne 0 -or $source -notmatch '^[a-f0-9]{40}$') { throw 'Cannot resolve exact source commit.' }
if ($env:GITHUB_SHA -and $source -ne $env:GITHUB_SHA) { throw 'Checkout differs from workflow source commit.' }
# A package test starts from Git inputs, never a pre-populated Work cache.
foreach ($unexpected in @('.work','dist','node_modules','vendor/libmpv/20260809')) {
    if (Test-Path -LiteralPath (Join-Path $root $unexpected)) { throw ('Manual package requires a fresh checkout; unexpected prepared input: ' + $unexpected) }
}
$archiveIdentity = & node (Join-Path $PSScriptRoot 'libmpv-input.cjs') validate-archive $root
if ($LASTEXITCODE -ne 0) { throw 'Original repository archive does not match the committed identity.' }
$archiveIdentity = $archiveIdentity | ConvertFrom-Json
$output = Join-Path $root 'test-output/manual-windows-package'
if (Test-Path -LiteralPath $output) { throw 'Preserve existing artifact output; use a fresh checkout.' }
$run = if ($env:GITHUB_RUN_ID) { $env:GITHUB_RUN_ID + '-' + $env:GITHUB_RUN_ATTEMPT } else { [guid]::NewGuid().ToString('N') }
if ($run -notmatch '^[a-zA-Z0-9-]+$') { throw 'Invalid run identity.' }
$runtimeName = 'ETE-test-' + $source.Substring(0,12) + '-' + $run
$runtime = Join-Path $root ('dist/' + $runtimeName)

# A short, separately selected cloud diagnostic. It does not invoke helper or
# window construction and stops before Host, regression or assembly. DLL DllMain
# code does execute; this mode is never a Work/background-client entry point.
if ($NativeLoaderOnly) {
    & (Join-Path $PSScriptRoot 'prepare-native-loader-probe.ps1')
    if (-not $?) { throw 'Native loader diagnostic failed.' }
    return
}
if ($NativePreviewPacingOnly) {
    & (Join-Path $PSScriptRoot 'prepare-native-loader-probe.ps1') -HelperStartup -PreviewPacing
    if (-not $?) { throw 'Native preview pacing comparison failed.' }
    return
}
if ($NativeHelperOnly) {
    & (Join-Path $PSScriptRoot 'prepare-native-loader-probe.ps1') -HelperStartup
    if (-not $?) { throw 'Native helper startup verification failed.' }
    return
}

# Fail before dependency acquisition on an unknown/unsigned Framework; do not
# repeatedly allocate full builds hoping for a different hosted image.
& node (Join-Path $PSScriptRoot 'host-verifier-input.cjs') $root
if ($LASTEXITCODE -ne 0) { throw 'Reviewed Framework preflight source identity mismatch.' }
. (Join-Path $PSScriptRoot 'windows-host-verifier/Framework-Implementation.ps1')
$entryFramework = Get-RunnerFrameworkPreflight
Write-Output ('FRAMEWORK_PREFLIGHT ' + ($entryFramework | ConvertTo-Json -Depth 8 -Compress))

function RunNode([string[]]$Arguments) {
    & node @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('Node validation failed: ' + $Arguments[0]) }
}
& npm ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Locked JavaScript dependency installation failed.' }
& (Join-Path $PSScriptRoot 'prepare-ci-build-inputs.ps1')
if (-not $?) { throw 'Independent CI input preparation failed.' }
& (Join-Path $PSScriptRoot 'ci-source-built-host.ps1')
if (-not $?) { throw 'This runner must compile and verify its own source-built Host before packaging.' }
$libmpvIdentity = & node (Join-Path $PSScriptRoot 'libmpv-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'Restored repository libmpv identity is invalid.' }
$libmpvIdentity = $libmpvIdentity | ConvertFrom-Json
$libmpvFileSha256 = (Get-FileHash -LiteralPath (Join-Path $root 'vendor/libmpv/20260809/mpv-1.dll') -Algorithm SHA256).Hash.ToLowerInvariant()
if (Test-Path -LiteralPath (Join-Path $root '.work/libmpv-download')) { throw 'Repository recovery unexpectedly created a libmpv download cache.' }
$officialModel = & node (Join-Path $PSScriptRoot 'model-compatibility-input.cjs') validate $root
if ($LASTEXITCODE -ne 0) { throw 'Official Model component identity is invalid.' }
$officialModel = $officialModel | ConvertFrom-Json
$modelArchive = & node (Join-Path $PSScriptRoot 'model-compatibility-input.cjs') validate-archive $root (Join-Path $root '.work/actions-inputs/archives/emby-theater-x64.zip')
if ($LASTEXITCODE -ne 0) { throw 'Official Model source ZIP differs from its pinned identity.' }
$modelArchive = $modelArchive | ConvertFrom-Json
$modelFileSha256 = (Get-FileHash -LiteralPath (Join-Path $root 'vendor/model-compatibility/snapshot-v1/MediaBrowser.Model.dll') -Algorithm SHA256).Hash.ToLowerInvariant()

# Prepare generates the pinned preload before any material-dependent regression.
$tests = @(Get-ChildItem -LiteralPath (Join-Path $root 'tests') -Filter '*.test.cjs' -File | Sort-Object Name | ForEach-Object { 'tests/' + $_.Name })
if ($tests.Count -eq 0) { throw 'No regression tests found.' }
$testLog = Join-Path $root ('test-output/manual-tests-' + $run + '.tap')
New-Item -ItemType Directory -Path (Split-Path -Parent $testLog) -Force | Out-Null
& node --test --test-reporter=tap --test-concurrency=1 @tests | Tee-Object -FilePath $testLog
if ($LASTEXITCODE -ne 0) { throw 'Full regression failed; no package will be uploaded.' }
RunNode @('tools/ci-syntax.cjs')
& (Join-Path $PSScriptRoot 'ci-powershell-syntax.ps1')
if (-not $?) { throw 'PowerShell syntax validation failed.' }
RunNode @('tools/ci-secret-scan.cjs')
RunNode @('tests/windows-host-material-selftest.cjs')
if ($ReleasePackage) {
    $materialTests = @(Get-ChildItem -LiteralPath (Join-Path $root 'tests') -Filter '*-material-selftest.cjs' -File | Sort-Object Name | ForEach-Object { 'tests/' + $_.Name })
    if ($materialTests.Count -eq 0) { throw 'No explicit material regressions found.' }
    & node --test --test-reporter=tap --test-concurrency=1 @materialTests
    if ($LASTEXITCODE -ne 0) { throw 'Explicit material regressions failed; no release package will be uploaded.' }
}

& (Join-Path $PSScriptRoot 'build.ps1') -OutputName $runtimeName
if (-not $?) { throw 'Runtime build failed.' }
& (Join-Path $PSScriptRoot 'package.ps1') -RuntimeName $runtimeName -VerifyOnly
if (-not $?) { throw 'Runtime verification failed.' }
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$installerName = 'EmbyTheaterEnhanced-' + $version + '-test-' + $source.Substring(0,12) + '-' + $run + '-win-x64-setup'
if ($ReleasePackage) { $installerName = 'EmbyTheaterEnhanced-' + $version + '-win-x64-setup' }
& (Join-Path $PSScriptRoot 'package.ps1') -RuntimeName $runtimeName -OutputBaseFilename $installerName
if (-not $?) { throw 'Installer compilation failed.' }
$installer = Join-Path $root ('dist/' + $installerName + '.exe')
$unpacker = Join-Path $root '.work/toolchain/innounp/innounp.exe'
& $unpacker -t $installer
if ($LASTEXITCODE -ne 0) { throw 'Installer archive integrity test failed.' }
$extract = Join-Path $root ('.work/actions-installer-check-' + $run)
if (Test-Path -LiteralPath $extract) { throw 'Extraction target already exists.' }
& $unpacker -x -b ('-d' + $extract) $installer | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Installer extraction failed.' }
$verification = & node (Join-Path $PSScriptRoot 'verify-installer-runtime.cjs') $runtime (Join-Path $extract '{app}') $source
if ($LASTEXITCODE -ne 0) { throw 'Extracted installer differs from the verified runtime.' }

# A separate, opt-in test overlay; never mutate the verified standard payload.
$previewZip = $null
$previewReceipt = $null
if ($NativePreviewTrial) {
    $previewArchives = Join-Path $root ('.work/native-preview-archives-' + $run)
    $previewDependencies = Join-Path $root ('.work/native-preview-dependencies-' + $run)
    & python (Join-Path $PSScriptRoot 'download-native-preview-deps.py') $root $previewArchives
    if ($LASTEXITCODE -ne 0) { throw 'Pinned official FFI acquisition failed.' }
    RunNode @('tools/windows-native-preview-deps.cjs','prepare',$root,$previewArchives,$previewDependencies)
    $preview = Join-Path $root ('dist/ETE-native-preview-' + $source.Substring(0,12) + '-' + $run)
    RunNode @('tools/windows-native-preview-trial.cjs',$root,$runtime,$previewDependencies,$preview,$source)
    $previewZip = $preview + '.zip'
    if (Test-Path -LiteralPath $previewZip) { throw 'Preserve existing preview ZIP.' }
    [IO.Compression.ZipFile]::CreateFromDirectory($preview,$previewZip)
    $previewExtract = Join-Path $root ('.work/native-preview-extracted-' + $run)
    if (Test-Path -LiteralPath $previewExtract) { throw 'Preserve existing preview extraction.' }
    [IO.Compression.ZipFile]::ExtractToDirectory($previewZip,$previewExtract)
    $ownerOutput = Join-Path $root ('test-output/native-owner-' + $run)
    $previewDiagnostics = Join-Path $root ('test-output/native-preview-diagnostics-' + $run)
    # Node owns and waits for child close/stdout/stderr; GUI-subsystem Electron
    # must not be accepted using a stale PowerShell LASTEXITCODE.
    $previewReceipt = & node (Join-Path $PSScriptRoot 'windows-native-preview-process.cjs') $previewExtract $ownerOutput $source $previewDiagnostics
    if ($LASTEXITCODE -ne 0) { throw 'Trial acceptance failed; preserve native-preview-diagnostics files.' }
    $ownerLines = @(Get-Content -LiteralPath (Join-Path $ownerOutput 'owner-probe.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
    $ownerEnd = @($ownerLines | Where-Object { $_.event -eq 'end' })
    if ($ownerEnd.Count -ne 1 -or $ownerEnd[0].result -ne 'PASS' -or -not $ownerEnd[0].ownedExitConfirmed) { throw 'Owner probe did not confirm completion and exit.' }
}

# Only explicitly selected distributable files enter the Actions artifact.
New-Item -ItemType Directory -Path $output | Out-Null
if ($NativePreviewTrial) {
    Copy-Item -LiteralPath $previewZip -Destination $output
    Copy-Item -LiteralPath (Join-Path $preview 'native-preview-trial.json') -Destination $output
    Copy-Item -LiteralPath (Join-Path $ownerOutput 'owner-probe.jsonl') -Destination $output
    Copy-Item -LiteralPath (Join-Path $previewDiagnostics 'acceptance.json') -Destination (Join-Path $output 'native-preview-acceptance.json')
    [IO.File]::WriteAllText((Join-Path $output 'native-preview-selfcheck.json'), ($previewReceipt | Out-String), [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $output 'native-preview-zip.sha256'), ((Get-FileHash -LiteralPath $previewZip -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + [IO.Path]::GetFileName($previewZip) + "`n"), [Text.UTF8Encoding]::new($false))
}
foreach ($suffix in @('', '.provenance.json', '.sha256')) {
    Copy-Item -LiteralPath ($installer + $suffix) -Destination $output
}
if ($ReleasePackage) {
    # Preserve the exact source blob, including its encoding and final newline.
    & node -e "require('node:fs').writeFileSync(process.argv[2], require('node:child_process').execFileSync('git', ['show', process.argv[1] + ':docs/RELEASE_NOTES.md']));" $source (Join-Path $output 'RELEASE_NOTES.md')
    if ($LASTEXITCODE -ne 0) { throw 'Committed release notes could not be staged.' }
    $releaseFiles = @(([IO.Path]::GetFileName($installer)), ([IO.Path]::GetFileName($installer) + '.provenance.json'), ([IO.Path]::GetFileName($installer) + '.sha256'), 'RELEASE_NOTES.md')
    $sums = @($releaseFiles | ForEach-Object { (Get-FileHash -LiteralPath (Join-Path $output $_) -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $_ })
    [IO.File]::WriteAllText((Join-Path $output 'SHA256SUMS.txt'), (($sums -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
}
foreach ($file in @('build-manifest.json','build-input-provenance.json','source-provenance.json','runtime-provenance.json','native-helper-provenance.json')) {
    Copy-Item -LiteralPath (Join-Path $runtime $file) -Destination $output
}
Copy-Item -LiteralPath (Join-Path $root '.work/source-built-host') -Destination (Join-Path $output 'host-build-evidence') -Recurse
$frameworkReceipt = Join-Path $root '.work/runner-framework-profile.json'
$frameworkFile = Get-Item -LiteralPath $frameworkReceipt -ErrorAction Stop
if ($frameworkFile.PSIsContainer -or ($frameworkFile.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Physical Framework preflight receipt required.' }
Copy-Item -LiteralPath $frameworkReceipt -Destination (Join-Path $output 'runner-framework-profile.json')
[IO.File]::WriteAllText((Join-Path $output 'installer-verification.json'), ($verification | Out-String), [Text.UTF8Encoding]::new($false))
$libmpvReceipt = [ordered]@{
    schemaVersion=1; sourceCommit=$source; acquisition='repository-archive'
    archive=$archiveIdentity; componentTreeSha256=$libmpvIdentity.treeSha256; dllSha256=$libmpvFileSha256
    preparedInputPresentAtStart=$false; workCachePresentAtStart=$false
    archiveDownloadCachePresentAfterPreparation=$false; productionRecoveryNetworkEnabled=$false
}
[IO.File]::WriteAllText((Join-Path $output 'libmpv-repository-input.json'), (($libmpvReceipt | ConvertTo-Json -Depth 6) + "`n"), [Text.UTF8Encoding]::new($false))
$summary = [ordered]@{
    schemaVersion=1; sourceCommit=$source; componentsCommit='ad14a95bfe2122d45508bbb21ea88cfc4f71ee77'
    status='passed'; testFiles=$tests.Count; tests=(Get-Content -LiteralPath $testLog | Where-Object { $_ -match '^# (tests|pass|fail|skipped|duration_ms) ' })
    runId=$env:GITHUB_RUN_ID; runAttempt=$env:GITHUB_RUN_ATTEMPT
    runnerOS=$env:RUNNER_OS; runnerArch=$env:RUNNER_ARCH; imageOS=$env:ImageOS; imageVersion=$env:ImageVersion
    node=([string](& node --version)); installer=[IO.Path]::GetFileName($installer)
    releasePackage=[bool]$ReleasePackage; nativePreviewTrial=[bool]$NativePreviewTrial; version=$version
    installerFileVersion=(Get-Item -LiteralPath $installer).VersionInfo.FileVersion
    installerProductVersion=(Get-Item -LiteralPath $installer).VersionInfo.ProductVersion
    installerSignatureStatus=[string](Get-AuthenticodeSignature -LiteralPath $installer).Status
    officialModel=[ordered]@{
        provenanceMode=$officialModel.provenance.mode; sourceUrl=$officialModel.archive.sourceUrl
        archiveSha256=$modelArchive.archiveSha256; archiveBytes=$modelArchive.archiveBytes
        member='MediaBrowser.Model.dll'; memberSha256=$modelFileSha256; memberBytes=$officialModel.bytes
    }
    releasePublished=$false; installedOrLaunched=[bool]$NativePreviewTrial; fullClientLaunched=$false; installed=$false; nativeOwnerProbeLaunched=[bool]$NativePreviewTrial
}
[IO.File]::WriteAllText((Join-Path $output 'test-build-summary.json'), (($summary | ConvertTo-Json -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
if ($ReleasePackage) {
    $releaseRows = @(@($releaseFiles) + @('SHA256SUMS.txt') | ForEach-Object {
        $file = Get-Item -LiteralPath (Join-Path $output $_) -ErrorAction Stop
        if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Ordinary release attachment required.' }
        [ordered]@{name=$_.ToString();size=[int64]$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
    })
    $expectedSums = (($releaseRows[0..3] | ForEach-Object { $_.sha256 + '  ' + $_.name }) -join "`n") + "`n"
    if ([IO.File]::ReadAllText((Join-Path $output 'SHA256SUMS.txt')) -cne $expectedSums) { throw 'Release attachment checksum list changed.' }
    $packageReceipt = Get-Content -LiteralPath (Join-Path $output $releaseRows[1].name) -Raw | ConvertFrom-Json
    if ($packageReceipt.sourceCommit -cne $source -or $packageReceipt.version -cne $version -or $packageReceipt.installer.fileName -cne $releaseRows[0].name -or $packageReceipt.installer.size -ne $releaseRows[0].size -or $packageReceipt.installer.sha256 -cne $releaseRows[0].sha256) { throw 'Release installer source/identity mismatch.' }
    if ([IO.File]::ReadAllText((Join-Path $output $releaseRows[2].name)) -cne ($releaseRows[0].sha256 + '  ' + $releaseRows[0].name + "`n")) { throw 'Release installer checksum changed.' }
    $notesHash = & node -e "process.stdout.write(require('node:crypto').createHash('sha256').update(require('node:child_process').execFileSync('git',['show',process.argv[1]+':docs/RELEASE_NOTES.md'])).digest('hex'));" $source
    if ($LASTEXITCODE -ne 0 -or $notesHash -cne $releaseRows[3].sha256) { throw 'Release notes differ from the source Git blob.' }
    $releaseEvidence = [ordered]@{schemaVersion=1;status='passed';sourceCommit=$source;version=$version;runId=$env:GITHUB_RUN_ID;runAttempt=$env:GITHUB_RUN_ATTEMPT;files=$releaseRows;releasePublished=$false}
    Write-Output ('RELEASE_FILE_EVIDENCE ' + ($releaseEvidence | ConvertTo-Json -Depth 6 -Compress))
}
Write-Output ('Verified manual test package ready: ' + [IO.Path]::GetFileName($installer))
