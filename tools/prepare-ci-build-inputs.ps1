param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'ci-phase-timing.ps1')
if (-not $IsWindows) { throw 'The manual package preparation requires Windows.' }
& node (Join-Path $PSScriptRoot 'libmpv-input.cjs') validate-archive $root
if ($LASTEXITCODE -ne 0) { throw 'Committed repository libmpv archive validation failed; no network fallback.' }
$planTool = Join-Path $PSScriptRoot 'ci-build-input-plan.cjs'
$planJson = & node $planTool plan $root
if ($LASTEXITCODE -ne 0) { throw 'Locked acquisition plan validation failed.' }
$plan = $planJson | ConvertFrom-Json

function WorkspacePath([string]$relative) {
    $absolute = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $absolute.StartsWith($root + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'CI preparation path must remain inside the checkout.'
    }
    return $absolute
}
function VerifyInput($entry,[string]$file) {
    & node $planTool verify-file $root $file $entry.id
    if ($LASTEXITCODE -ne 0) { throw ('Locked input verification failed: ' + $entry.id) }
}

foreach ($legacy in @('vendor/carnival','vendor/patch')) {
    if (Test-Path -LiteralPath (WorkspacePath $legacy)) { throw 'Old package input directories must be absent from this build.' }
}
$phase = Start-CIPhase 'inputs.acquire-archives'
$phaseSucceeded = $false
try {
    foreach ($entry in $plan.files) {
        $target = WorkspacePath $entry.destination
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        if (Test-Path -LiteralPath $target) { VerifyInput $entry $target; continue }
        $partial = $target + '.partial-' + [guid]::NewGuid().ToString('N')
        try {
            Invoke-WebRequest -Uri $entry.url -OutFile $partial -MaximumRedirection 5 -TimeoutSec 240
        } catch { throw ('Pinned acquisition failed: ' + $entry.id + '; no version or source substitution was attempted.') }
        VerifyInput $entry $partial
        [IO.File]::Move($partial,$target)
    }
    $phaseSucceeded = $true
} finally { Complete-CIPhase $phase $phaseSucceeded }

$work = WorkspacePath ('.work/actions-inputs/extract-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$prefix = WorkspacePath $plan.msysPrefix
$phase = Start-CIPhase 'inputs.msys-extract-verify'
$phaseSucceeded = $false
try {
    if (-not (Test-Path -LiteralPath $prefix)) {
        $msysStage = Join-Path $work 'msys2'
        New-Item -ItemType Directory -Path $msysStage | Out-Null
        foreach ($entry in @($plan.files | Where-Object { $_.id.StartsWith('msys2-') })) {
            & 'C:\Windows\System32\tar.exe' -xf (WorkspacePath $entry.destination) -C $msysStage ucrt64
            if ($LASTEXITCODE -ne 0) { throw 'Fixed MSYS2 package extraction failed.' }
        }
        $stagedPrefix = Join-Path $msysStage 'ucrt64'
        & node $planTool verify-msys $root $stagedPrefix
        if ($LASTEXITCODE -ne 0) { throw 'Fixed MSYS2 prefix verification failed.' }
        New-Item -ItemType Directory -Path (Split-Path -Parent $prefix) -Force | Out-Null
        [IO.Directory]::Move($stagedPrefix,$prefix)
    }
    $phaseSucceeded = $true
} finally { Complete-CIPhase $phase $phaseSucceeded }
$phase = Start-CIPhase 'inputs.native-toolchain'
$phaseSucceeded = $false
try {
    & node (Join-Path $PSScriptRoot 'build-toolchains.cjs') native $root (Join-Path $prefix 'bin/g++.exe')
    if ($LASTEXITCODE -ne 0) { throw 'Prepared Native compiler validation failed.' }
    $phaseSucceeded = $true
} finally { Complete-CIPhase $phase $phaseSucceeded }

$phase = Start-CIPhase 'inputs.inno-prepare-verify'
$phaseSucceeded = $false
try {
    $unpackerRoot = WorkspacePath $plan.unpackerRoot
    if (-not (Test-Path -LiteralPath $unpackerRoot)) {
        $unpackerStage = Join-Path $work 'innounp'
        $archive = $plan.files | Where-Object { $_.id -eq 'innounp' }
        Expand-Archive -LiteralPath (WorkspacePath $archive.destination) -DestinationPath $unpackerStage
        New-Item -ItemType Directory -Path (Split-Path -Parent $unpackerRoot) -Force | Out-Null
        [IO.Directory]::Move($unpackerStage,$unpackerRoot)
    }
    $unpacker = Join-Path $unpackerRoot 'innounp.exe'
    $toolLock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'build-toolchains.lock.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ((Get-FileHash -LiteralPath $unpacker -Algorithm SHA256).Hash.ToLowerInvariant() -ne $toolLock.inno.unpackerSha256) {
        throw 'Pinned unpacker executable identity mismatch.'
    }
    $innoRoot = WorkspacePath $plan.innoRoot
    if (-not (Test-Path -LiteralPath $innoRoot)) {
        $innoStage = Join-Path $work 'inno'
        $archive = $plan.files | Where-Object { $_.id -eq 'inno' }
        & $unpacker -x -b ('-d' + $innoStage) (WorkspacePath $archive.destination) | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Pinned Inno static extraction failed.' }
        [IO.Directory]::Move($innoStage,$innoRoot)
    }
    & node (Join-Path $PSScriptRoot 'build-toolchains.cjs') inno $root (Join-Path $innoRoot '{app}/ISCC.exe')
    if ($LASTEXITCODE -ne 0) { throw 'Prepared Inno toolchain validation failed.' }
    $phaseSucceeded = $true
} finally { Complete-CIPhase $phase $phaseSucceeded }

$phase = Start-CIPhase 'inputs.electron-source'
$phaseSucceeded = $false
try {
    $officialSource = WorkspacePath '.work/actions-inputs/official-electron.git'
    if (-not (Test-Path -LiteralPath $officialSource)) {
        & git init --bare $officialSource
        if ($LASTEXITCODE -ne 0) { throw 'Official source object store creation failed.' }
    }
    & git -C $officialSource cat-file -e ($plan.officialElectronSource.commit + '^{commit}') 2>$null
    if ($LASTEXITCODE -ne 0) {
        & git -C $officialSource fetch --depth=1 --no-tags $plan.officialElectronSource.repository $plan.officialElectronSource.commit
        if ($LASTEXITCODE -ne 0) { throw 'Pinned official Electron source fetch failed.' }
    }
    $phaseSucceeded = $true
} finally { Complete-CIPhase $phase $phaseSucceeded }
$phase = Start-CIPhase 'inputs.materialize'
$phaseSucceeded = $false
try {
    & (Join-Path $PSScriptRoot 'prepare.ps1') -ArchiveRoot (WorkspacePath $plan.archiveRoot) -OfficialElectronSourceRoot $officialSource
    if ($LASTEXITCODE -ne 0) { throw 'Independent component preparation failed.' }
    $phaseSucceeded = $true
} finally { Complete-CIPhase $phase $phaseSucceeded }
$phase = Start-CIPhase 'inputs.final-verify'
$phaseSucceeded = $false
try {
    & node (Join-Path $PSScriptRoot 'validate-build-materials.cjs') $root
    if ($LASTEXITCODE -ne 0) { throw 'Final independent build material validation failed.' }
    $phaseSucceeded = $true
} finally { Complete-CIPhase $phase $phaseSucceeded }
$phase = Start-CIPhase 'inputs.windows-native-media'
$phaseSucceeded = $false
try {
    $nativeArchives = WorkspacePath '.work/windows-native-media-archives'
    $nativeDependencies = WorkspacePath '.work/windows-native-media-dependencies'
    & python (Join-Path $PSScriptRoot 'download-native-preview-deps.py') $root $nativeArchives
    if ($LASTEXITCODE -ne 0) { throw 'Locked official native media acquisition failed.' }
    & node (Join-Path $PSScriptRoot 'windows-native-preview-deps.cjs') prepare $root $nativeArchives $nativeDependencies
    if ($LASTEXITCODE -ne 0) { throw 'Locked native media preparation failed.' }
    $phaseSucceeded = $true
} finally { Complete-CIPhase $phase $phaseSucceeded }
Write-Output 'Independent locked CI build inputs are ready; no old package directory was used.'
