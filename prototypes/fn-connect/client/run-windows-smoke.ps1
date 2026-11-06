[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$prototypeRoot = $PSScriptRoot
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $prototypeRoot '../../..'))
$outputRoot = Join-Path $sourceRoot 'test-output/fn-connect-fixture'
if (Test-Path -LiteralPath $outputRoot) { throw 'FN_FIXTURE_OUTPUT_ALREADY_EXISTS' }
$null = New-Item -ItemType Directory -Path $outputRoot
. (Join-Path $prototypeRoot 'runner-preparation.ps1')
$runId = [Guid]::NewGuid().ToString('N')
$statusPath = Join-Path $outputRoot 'runner-status.json'
$resultFile = Join-Path $outputRoot 'result.json'
try { Write-FnAtomicJson $statusPath ([ordered]@{schemaVersion=1; runId=$runId; sourceCommit='UNKNOWN';
    stage='RUNNER_STARTED'; elapsedMs=0; downloadBytes=0; terminal=$false; reason=$null}) }
catch {
    Write-FnRunnerFailure $resultFile ([ordered]@{runId=$runId; sourceCommit='UNKNOWN'; stage='RUNNER_STARTED';
        elapsedMs=0; processExited=$true; reason='PREPARATION_FAILED'})
    throw 'FN_FIXTURE_PREPARATION_FAILED'
}
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('ete-fn-runner-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temporaryRoot
$stdoutFile = Join-Path $temporaryRoot 'runtime-stdout.txt'
$profilesRoot = Join-Path $temporaryRoot 'profiles'
$resultFile = Join-Path $outputRoot 'result.json'
$archiveHash = 'UNVERIFIED'
$launchState = 'HARNESS_FAILED'
$runtimeExit = -1
$sourceCommit = 'UNKNOWN'
$child = $null
$childStarted = $false
$terminationAttempted = $false
$processExited = $true
$profileCleanupVerified = $false
$rawOutput = ''
$preparation = $null
$preparationChild = $null
$preparationStarted = $false
try {
    if (-not $IsWindows) { $launchState = 'PLATFORM_UNSUPPORTED'; throw 'FN_FIXTURE_WINDOWS_REQUIRED' }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $progressPath = Join-Path $temporaryRoot 'preparation-progress.json'
    $prepareStart = [Diagnostics.ProcessStartInfo]::new()
    $prepareStart.FileName = Join-Path $PSHOME 'pwsh.exe'
    $prepareStart.WorkingDirectory = $sourceRoot
    $prepareStart.UseShellExecute = $false
    $prepareStart.CreateNoWindow = $true
    $prepareStart.RedirectStandardOutput = $true
    $prepareStart.RedirectStandardError = $true
    foreach ($argument in @('-NoProfile', '-File', (Join-Path $prototypeRoot 'prepare-runner-worker.ps1'),
        '-SourceRoot', $sourceRoot, '-TemporaryRoot', $temporaryRoot, '-ProgressPath', $progressPath, '-RunId', $runId)) {
        $prepareStart.ArgumentList.Add($argument)
    }
    $preparationChild = [Diagnostics.Process]::new(); $preparationChild.StartInfo = $prepareStart
    if (-not $preparationChild.Start()) { throw 'FN_PREPARATION_START_FAILED' }
    $preparationStarted = $true
    $null = $preparationChild.StandardOutput.ReadToEndAsync()
    $null = $preparationChild.StandardError.ReadToEndAsync()
    $preparation = Wait-FnPreparation -Child $preparationChild -Watch $watch -RunId $runId -ProgressPath $progressPath `
        -StatusPath $statusPath -ResultPath $resultFile -ExpectedCommit $env:GITHUB_SHA `
        -ArchivePath (Join-Path $temporaryRoot 'electron-v44.5.0-win32-x64.zip')
    if (-not $preparation.ready) { throw 'FN_PREPARATION_FAILED' }
    $sourceCommit = $preparation.sourceCommit
    $null = New-Item -ItemType Directory -Path $profilesRoot
    $electronInput = Get-Content -LiteralPath (Join-Path $prototypeRoot 'electron-input.json') -Raw | ConvertFrom-Json
    $archiveHash = $electronInput.sha256
    $runtimeRoot = Join-Path $temporaryRoot 'electron'
    Write-FnAtomicJson $statusPath ([ordered]@{schemaVersion=1; runId=$runId; sourceCommit=$sourceCommit;
        stage='ELECTRON_START'; elapsedMs=[long]$watch.ElapsedMilliseconds; downloadBytes=0; terminal=$false; reason=$null})
    $launchState = 'PROCESS_START_FAILED'
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = Join-Path $runtimeRoot 'electron.exe'
    $start.WorkingDirectory = $sourceRoot
    $start.UseShellExecute = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.ArgumentList.Add((Join-Path $prototypeRoot 'electron-main.cjs'))
    $start.ArgumentList.Add('--fn-connect-prototype')
    $start.ArgumentList.Add('--fixture-smoke')
    $start.Environment['ETE_FN_FIXTURE_PROFILE_ROOT'] = $profilesRoot
    # Normal sandbox. No proxy, certificate, port or system permission changes.
    $child = [Diagnostics.Process]::new()
    $child.StartInfo = $start
    if (-not $child.Start()) { throw 'FN_FIXTURE_START_FAILED' }
    $childStarted = $true
    $processExited = $false
    $stdoutTask = $child.StandardOutput.ReadToEndAsync()
    $stderrTask = $child.StandardError.ReadToEndAsync()
    $launchState = 'TIMEOUT'
    if (-not $child.WaitForExit(90000)) {
        $terminationAttempted = $true
        $child.Kill($true)
        $processExited = $child.WaitForExit(5000)
    } else { $launchState = 'COMPLETED' }
    $processExited = $child.HasExited
    if ($processExited) { $runtimeExit = $child.ExitCode } else { $launchState = 'PROCESS_EXIT_UNCONFIRMED' }
    $pipes = [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($stdoutTask, $stderrTask))
    if (-not $pipes.Wait(5000) -and $launchState -eq 'COMPLETED') { $launchState = 'PIPE_EOF_TIMEOUT' }
    if ($stdoutTask.IsCompletedSuccessfully) { $rawOutput = $stdoutTask.GetAwaiter().GetResult() }
} catch {
    # Only fixed result states leave the runner; no exception text, URLs, paths,
    # environment values or raw Chromium stderr are printed or uploaded.
    if ($launchState -eq 'COMPLETED') { $launchState = 'HARNESS_FAILED' }
} finally {
    if (-not $preparation -and $preparationStarted) {
        # A supervisor/receipt I/O exception is also fail closed. Stop only the
        # worker owned by this invocation; never leave it eligible to launch.
        try {
            if (-not $preparationChild.HasExited) { $preparationChild.Kill($true); $null = $preparationChild.WaitForExit(5000) }
        } catch { } # An unconfirmed worker and all its files are retained.
    }
    if ($child) {
        if ($childStarted) {
            try {
                if (-not $child.HasExited -and -not $terminationAttempted) {
                    $terminationAttempted = $true
                    $child.Kill($true)
                    $null = $child.WaitForExit(5000)
                }
                $processExited = $child.HasExited
            } catch { $processExited = $false }
            if (-not $processExited) { $launchState = 'PROCESS_EXIT_UNCONFIRMED' }
        }
        $child.Dispose()
    }
}
if (-not $preparation -or -not $preparation.ready) {
    if (-not [IO.File]::Exists($resultFile)) {
        $preparationExited = -not $preparationStarted
        if ($preparationStarted) { try { $preparationExited = $preparationChild.HasExited } catch { $preparationExited = $false } }
        $failureReason = if ($preparationExited) { 'PREPARATION_FAILED' } else { 'PREPARATION_EXIT_UNCONFIRMED' }
        $outcome = [ordered]@{runId=$runId; sourceCommit=$sourceCommit; stage='RUNNER_STARTED'; elapsedMs=0;
            processExited=$preparationExited; reason=$failureReason}
        try { Write-FnAtomicJson $statusPath ([ordered]@{schemaVersion=1; runId=$runId; sourceCommit=$sourceCommit;
            stage='RUNNER_STARTED'; elapsedMs=0; downloadBytes=0; terminal=$true; reason=$failureReason}) } catch {}
        Write-FnRunnerFailure $resultFile $outcome
    }
    # Keep all preparation evidence, including partial archives. Never retry or
    # allow Electron after a failed/unconfirmed preparation worker.
    throw 'FN_FIXTURE_PREPARATION_FAILED'
}
if ($preparationChild.HasExited) { $preparationChild.Dispose() }
if ($processExited) {
    try {
        if (Test-Path -LiteralPath $profilesRoot) { Remove-Item -LiteralPath $profilesRoot -Recurse -Force }
        $profileCleanupVerified = -not (Test-Path -LiteralPath $profilesRoot)
    } catch { $profileCleanupVerified = $false }
}
[IO.File]::WriteAllText($stdoutFile, $rawOutput, [Text.UTF8Encoding]::new($false))
try {
    & node (Join-Path $prototypeRoot 'smoke-report.cjs') $stdoutFile $resultFile $sourceCommit $archiveHash $launchState ([string]$runtimeExit) ([string]$processExited).ToLowerInvariant() ([string]$profileCleanupVerified).ToLowerInvariant()
    $reportExit = $LASTEXITCODE
} finally {
    if ($processExited -and $profileCleanupVerified) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue }
}
if ($reportExit -ne 0) { throw 'FN_FIXTURE_VALIDATION_FAILED' }
