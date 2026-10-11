param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$Compiler = '',
    [string]$GuardSource = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = [IO.Path]::GetFullPath($RepoRoot)
if (-not $Compiler) {
    $lockPath = Join-Path $RepoRoot 'tools/build-toolchains.lock.json'
    $lock = Get-Content -LiteralPath $lockPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $Compiler = Join-Path (Join-Path $RepoRoot ([string]$lock.inno.compilerRoot)) ([string]$lock.inno.compilerRelativePath)
}
$Compiler = [IO.Path]::GetFullPath($Compiler)
if (-not (Test-Path -LiteralPath $Compiler -PathType Leaf)) { throw 'Pinned Inno compiler is unavailable.' }
if (-not $GuardSource) { $GuardSource = Join-Path $RepoRoot 'installer/installer-guard.iss' }
$GuardSource = [IO.Path]::GetFullPath($GuardSource)
if (-not (Test-Path -LiteralPath $GuardSource -PathType Leaf)) { throw 'Installer guard source is unavailable.' }

# The compiler must match this repository's locked, complete Inno toolchain.
$toolchainJson = & node (Join-Path $RepoRoot 'tools/build-toolchains.cjs') inno $RepoRoot $Compiler
if ($LASTEXITCODE -ne 0) { throw 'Pinned Inno compiler identity check failed.' }
$null = $toolchainJson | ConvertFrom-Json

$fixtureSource = Join-Path (Split-Path -Parent $PSScriptRoot) 'tests/fixtures/installer-guard-probe.iss'
if (-not (Test-Path -LiteralPath $fixtureSource -PathType Leaf)) { throw 'Installer guard probe fixture is missing.' }
$workRoot = Join-Path $RepoRoot '.work'
if (-not (Test-Path -LiteralPath $workRoot -PathType Container)) {
    New-Item -ItemType Directory -Path $workRoot | Out-Null
}
$runRoot = Join-Path $workRoot ('installer-guard-probe-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $runRoot) { throw 'Probe output already exists; no files were changed.' }
New-Item -ItemType Directory -Path $runRoot | Out-Null
$stageRoot = Join-Path $runRoot 'source'
$outputRoot = Join-Path $runRoot 'output'
New-Item -ItemType Directory -Path $stageRoot,$outputRoot | Out-Null
$languageSource = Join-Path $RepoRoot 'installer/languages/ChineseSimplified.isl'
if (-not (Test-Path -LiteralPath $languageSource -PathType Leaf)) { throw 'Committed Simplified Chinese Inno language source is unavailable.' }
New-Item -ItemType Directory -Path (Join-Path $stageRoot 'languages') | Out-Null
Copy-Item -LiteralPath $languageSource -Destination (Join-Path $stageRoot 'languages/ChineseSimplified.isl')
$stagedFixture = Join-Path $stageRoot 'installer-guard-probe.iss'
Copy-Item -LiteralPath $fixtureSource -Destination $stagedFixture
Copy-Item -LiteralPath $GuardSource -Destination (Join-Path $stageRoot 'installer-guard.iss')

# This builds only the deliberately non-installing probe fixture, never the product installer.
& $Compiler '/Qp' ("/O" + $outputRoot) '/Finstaller-guard-probe' $stagedFixture
if ($LASTEXITCODE -ne 0) { throw 'Installer guard probe fixture compilation failed.' }
$probeExe = Join-Path $outputRoot 'installer-guard-probe.exe'
if (-not (Test-Path -LiteralPath $probeExe -PathType Leaf)) { throw 'Compiled guard probe executable is missing.' }

function Invoke-GuardProbe {
    param([string]$TargetDir, [string]$Label, [string]$Mode = 'guard')

    $resultPath = Join-Path $runRoot ($Label + '.result.txt')
    $logPath = Join-Path $runRoot ($Label + '.log')
    if ((Test-Path -LiteralPath $resultPath) -or (Test-Path -LiteralPath $logPath)) {
        throw 'Probe evidence output already exists; no files were overwritten.'
    }
    $previousTarget = $env:ETE_GUARD_TARGET
    $previousResult = $env:ETE_GUARD_RESULT
    $previousMode = $env:ETE_GUARD_MODE
    try {
        $env:ETE_GUARD_TARGET = $TargetDir
        $env:ETE_GUARD_RESULT = $resultPath
        $env:ETE_GUARD_MODE = $Mode
        $process = Start-Process -FilePath $probeExe -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',('/LOG="' + $logPath + '"')) -PassThru -WindowStyle Hidden
        if (-not $process.WaitForExit(15000)) {
            $process.Kill()
            $null = $process.WaitForExit(5000)
            throw 'Guard probe exceeded its bounded 15 second run.'
        }
        if (-not (Test-Path -LiteralPath $resultPath -PathType Leaf)) {
            throw 'Guard probe did not record a result; inspect its bounded local log.'
        }
        return [IO.File]::ReadAllText($resultPath)
    } finally {
        if ($null -eq $previousTarget) { Remove-Item Env:ETE_GUARD_TARGET -ErrorAction SilentlyContinue }
        else { $env:ETE_GUARD_TARGET = $previousTarget }
        if ($null -eq $previousResult) { Remove-Item Env:ETE_GUARD_RESULT -ErrorAction SilentlyContinue }
        else { $env:ETE_GUARD_RESULT = $previousResult }
        if ($null -eq $previousMode) { Remove-Item Env:ETE_GUARD_MODE -ErrorAction SilentlyContinue }
        else { $env:ETE_GUARD_MODE = $previousMode }
    }
}

function Assert-Blocked {
    param([string]$Result, [string]$ExpectedText, [string]$Label)
    if ($Result -eq '<ALLOW>' -or ($ExpectedText -and $Result -notlike ('*' + $ExpectedText + '*'))) {
        throw ('Guard did not reject the ' + $Label + ' probe as expected.')
    }
    Write-Output ('PASS: ' + $Label + ' was blocked.')
}

function Find-CSharpCompiler {
    $command = Get-Command csc.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @(
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
    )) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return ''
}

function Compile-Sleeper {
    param([string]$CscPath, [string]$ExecutablePath)
    $sourcePath = Join-Path $runRoot 'installer-guard-sleeper.cs'
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        $source = 'using System.Threading; internal static class Sleeper { private static void Main() { Thread.Sleep(300000); } }'
        [IO.File]::WriteAllText($sourcePath, $source, (New-Object Text.UTF8Encoding($false)))
    }
    if (Test-Path -LiteralPath $ExecutablePath) { throw 'Self-owned process fixture already exists; no files were overwritten.' }
    & $CscPath '/nologo' '/target:winexe' ('/out:' + $ExecutablePath) $sourcePath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        throw 'Harmless self-owned process fixture compilation failed.'
    }
}

function Wait-ForExactProcessImage {
    param([System.Diagnostics.Process]$Process, [string]$ExecutablePath)
    $expected = [IO.Path]::GetFullPath($ExecutablePath)
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        $Process.Refresh()
        if ($Process.HasExited) { throw 'Self-owned process fixture exited before WMI observation.' }
        $record = Get-CimInstance -ClassName Win32_Process -Filter ('ProcessId = ' + [int]$Process.Id)
        if ($record -and $record.ExecutablePath -and [IO.Path]::GetFullPath([string]$record.ExecutablePath) -eq $expected) {
            return
        }
        Start-Sleep -Milliseconds 100
    }
    throw 'WMI did not report the self-owned process with its exact executable path.'
}

$ownedProcesses = New-Object 'System.Collections.Generic.List[System.Diagnostics.Process]'
try {
    $invalidTargets = @(
        @{Label='empty-target';Value=''},
        @{Label='relative-target';Value='relative\path'},
        @{Label='invalid-drive-target';Value='1:\'},
        @{Label='incomplete-unc-target';Value='\\server'},
        @{Label='unc-root-target';Value='\\'}
    )
    foreach ($case in $invalidTargets) {
        $invalidResult = Invoke-GuardProbe ([string]$case.Value) ([string]$case.Label)
        Assert-Blocked $invalidResult '' ([string]$case.Label)
    }
    $absoluteTargets = @(
        @{Label='drive-root';Value=([string]$env:SystemDrive + '\')},
        @{Label='unc-share-syntax';Value='\\server\share'}
    )
    foreach ($case in $absoluteTargets) {
        $absoluteResult = Invoke-GuardProbe ([string]$case.Value) ('absolute-syntax-' + [string]$case.Label) 'absolute'
        if ($absoluteResult -ne '<ABSOLUTE>') { throw ('IsAbsoluteTargetDir rejected valid ' + [string]$case.Label + ' syntax.') }
        Write-Output ('PASS: ' + [string]$case.Label + ' syntax was classified as absolute without filesystem access.')
    }

    $targetRoot = Join-Path $runRoot '目标 中文 with spaces'
    $siblingRoot = $targetRoot + '-extra'
    New-Item -ItemType Directory -Path $targetRoot,$siblingRoot | Out-Null
    $csc = Find-CSharpCompiler
    if (-not $csc) {
        Write-Output 'SKIP: csc.exe is unavailable; live WMI process path probes were not executed.'
    } else {
        $siblingExe = Join-Path $siblingRoot 'electron.exe'
        Compile-Sleeper $csc $siblingExe
        $sibling = Start-Process -FilePath $siblingExe -WorkingDirectory $siblingRoot -PassThru -WindowStyle Hidden
        $ownedProcesses.Add($sibling)
        Wait-ForExactProcessImage $sibling $siblingExe
        $prefixResult = Invoke-GuardProbe $targetRoot 'sibling-prefix'
        if ($prefixResult -ne '<ALLOW>') { throw 'A same-name process outside the exact target directory was treated as an owned client.' }
        Write-Output 'PASS: a process in the similarly prefixed sibling directory did not block the target.'

        $targetExe = Join-Path $targetRoot 'Emby.Theater.exe'
        Compile-Sleeper $csc $targetExe
        $targetProcess = Start-Process -FilePath $targetExe -WorkingDirectory $targetRoot -PassThru -WindowStyle Hidden
        $ownedProcesses.Add($targetProcess)
        Wait-ForExactProcessImage $targetProcess $targetExe
        $processResult = Invoke-GuardProbe $targetRoot 'owned-process'
        Assert-Blocked $processResult 'owned client' 'exact target process'
        $sibling.Refresh()
        if ($sibling.HasExited) {
            throw 'Guard probe ended the separately owned sibling process.'
        }
        Write-Output 'PASS: the probe left the separately owned sibling process running.'
        $targetProcess.Kill()
        if (-not $targetProcess.WaitForExit(10000)) { throw 'The self-owned target sleeper did not exit.' }
    }

    $lockedExe = Join-Path $targetRoot 'x64/electron/electron.exe'
    New-Item -ItemType Directory -Path (Split-Path -Parent $lockedExe) | Out-Null
    [IO.File]::WriteAllText($lockedExe, 'synthetic harmless test file')
    $exeLock = [IO.File]::Open($lockedExe, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
    try {
        $result = Invoke-GuardProbe $targetRoot 'locked-exe'
        Assert-Blocked $result 'target file' 'locked executable file'
    } finally { $exeLock.Dispose() }

    $lockedDll = Join-Path $targetRoot 'electronapp/libmpv/x64/mpv-1.dll'
    New-Item -ItemType Directory -Path (Split-Path -Parent $lockedDll) | Out-Null
    [IO.File]::WriteAllText($lockedDll, 'synthetic harmless test file')
    $dllLock = [IO.File]::Open($lockedDll, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read)
    try {
        $result = Invoke-GuardProbe $targetRoot 'locked-dll'
        Assert-Blocked $result 'target file' 'locked DLL file'
    } finally { $dllLock.Dispose() }
} finally {
    foreach ($ownedProcess in $ownedProcesses) {
        $ownedProcess.Refresh()
        if (-not $ownedProcess.HasExited) {
            $ownedProcess.Kill()
            $null = $ownedProcess.WaitForExit(10000)
        }
    }
}

Write-Output ('Evidence retained under .work/' + (Split-Path -Leaf $runRoot))
