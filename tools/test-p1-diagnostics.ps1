param(
    [Parameter(Mandatory=$true)][string]$RuntimeName,
    [string]$ProductRoot = '',
    [ValidateSet('hit','direct','miss')][string]$Cd2Mode = 'hit',
    [ValidateRange(0,1000)][int]$Cd2DelayMs = 400,
    [ValidateSet('idle','playing','stopped')][string]$NormalClose = ''
)
$ErrorActionPreference = 'Stop'
$Cd2Mode = $Cd2Mode.ToLowerInvariant()
function Read-RunnerOutput {
    param(
        [Parameter(Mandatory=$true)][System.Threading.Tasks.Task]$StdoutTask,
        [Parameter(Mandatory=$true)][System.Threading.Tasks.Task]$StderrTask,
        [ValidateRange(1,180000)][int]$TimeoutMs = 5000
    )
    $tasks = [System.Threading.Tasks.Task[]]@($StdoutTask,$StderrTask)
    try { [void][System.Threading.Tasks.Task]::WaitAll($tasks,$TimeoutMs) }
    catch { }
    $stdoutComplete = $StdoutTask.Status -eq [System.Threading.Tasks.TaskStatus]::RanToCompletion
    $stderrComplete = $StderrTask.Status -eq [System.Threading.Tasks.TaskStatus]::RanToCompletion
    $stdoutText = 'UNAVAILABLE'
    $stderrText = 'UNAVAILABLE'
    if ($stdoutComplete) {
        try { $stdoutText = [string]$StdoutTask.Result }
        catch { $stdoutComplete = $false; $stdoutText = 'UNAVAILABLE' }
    }
    if ($stderrComplete) {
        try { $stderrText = [string]$StderrTask.Result }
        catch { $stderrComplete = $false; $stderrText = 'UNAVAILABLE' }
    }
    $status = if ($stdoutComplete -and $stderrComplete) { 'COMPLETE' } else { 'UNAVAILABLE' }
    return [ordered]@{status=$status; stdout=$stdoutText; stderr=$stderrText}
}
if ($RuntimeName -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { throw 'Invalid runtime name.' }
$root = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
if ([string]::IsNullOrWhiteSpace($ProductRoot)) { $ProductRoot = $root }
if (-not (Test-Path -LiteralPath $ProductRoot -PathType Container)) { throw 'Product root is unavailable.' }
$ProductRoot = (Resolve-Path -LiteralPath $ProductRoot).Path
$runtime = Join-Path (Join-Path $ProductRoot 'dist') $RuntimeName
$evidence = Join-Path $root ('.work/p1-runtime-' + [guid]::NewGuid().ToString('N'))
$profile = Join-Path $evidence 'profile'
$harness = Join-Path $evidence 'harness'
New-Item -ItemType Directory -Force -Path $profile,$harness,(Join-Path $evidence 'appdata/mpv'),(Join-Path $evidence 'localappdata') | Out-Null
$sourceCommit = (Get-Content -LiteralPath (Join-Path $runtime 'runtime-provenance.json') -Raw | ConvertFrom-Json).sourceCommit
if ($sourceCommit -notmatch '^[0-9a-f]{40}$') { throw 'Runtime source commit is unavailable.' }
& node (Join-Path $root 'tools/source-provenance.cjs') validate $ProductRoot $runtime $sourceCommit > (Join-Path $evidence 'source-provenance.log')
if ($LASTEXITCODE -ne 0) { throw 'Source provenance failed before runtime launch.' }
& node (Join-Path $root 'tools/runtime-provenance.cjs') validate $ProductRoot $runtime $sourceCommit > (Join-Path $evidence 'runtime-provenance.log')
if ($LASTEXITCODE -ne 0) { throw 'Runtime provenance failed before runtime launch.' }
& node (Join-Path $root 'tools/native-helper-provenance.cjs') $ProductRoot $runtime $sourceCommit > (Join-Path $evidence 'native-provenance.log')
if ($LASTEXITCODE -ne 0) { throw 'Native provenance failed before runtime launch.' }
& node (Join-Path $root 'tools/electron-runtime-input.cjs') validate-runtime $ProductRoot $runtime > (Join-Path $evidence 'electron-provenance.log')
if ($LASTEXITCODE -ne 0) { throw 'Electron runtime tree failed before runtime launch.' }
$harnessHead = ([string]((& git -C $root rev-parse HEAD 2>$null) | Select-Object -First 1)).Trim().ToLowerInvariant()
if ($harnessHead -notmatch '^[0-9a-f]{40}$') { throw 'Harness HEAD is unavailable.' }
$harnessFilePaths = @(
    'tools/test-p1-diagnostics.ps1',
    'tools/p1-diagnostics-smoke.cjs',
    'tools/smoke-electron.cjs',
    'tools/make-fixture.cjs',
    'tools/verify-p1-diagnostics.cjs',
    'tools/runtime-window-ownership.cjs',
    'tools/transition-stream-capture.cjs',
    'tools/exit-observation.cjs',
    'tools/normal-close-observation.cjs',
    'tools/verify-normal-close.cjs',
    'tests/pipeline-browser.js',
    'tests/generation-fixture-observer.js',
    'tests/fake-cd2-fixture.cjs',
    'tests/pipeline-deadline.cjs',
    'tests/pipeline-condition.js',
    'tests/pipeline-result.cjs'
)
$harnessFiles = @()
foreach ($relativePath in $harnessFilePaths) {
    $file = Join-Path $root ($relativePath.Replace('/',[IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw ('Required harness input missing: ' + $relativePath) }
    $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    $harnessFiles += [ordered]@{path=$relativePath; sha256=$hash}
}
$runtimeProvenancePath = Join-Path $runtime 'runtime-provenance.json'
$runtimeProvenanceSha256 = (Get-FileHash -LiteralPath $runtimeProvenancePath -Algorithm SHA256).Hash.ToLowerInvariant()
$fixtureSeconds = 60
$utf8 = New-Object Text.UTF8Encoding($false)
$identity = [ordered]@{
    schemaVersion=1
    productSourceCommit=$sourceCommit.ToLowerInvariant()
    runtimeProvenanceSha256=$runtimeProvenanceSha256
    harnessHead=$harnessHead
    harnessFiles=$harnessFiles
    settings=[ordered]@{cd2Mode=$Cd2Mode; cd2DelayMs=$Cd2DelayMs; fixtureSeconds=$fixtureSeconds; normalClose=$NormalClose}
}
[IO.File]::WriteAllText((Join-Path $evidence 'harness-identity.json'),($identity | ConvertTo-Json -Depth 8) + [Environment]::NewLine,$utf8)
# Launch a package, so app.getVersion() follows runtime metadata rather than
# Electron's own version when a standalone .cjs entry is used.
$metadata = Get-Content -LiteralPath (Join-Path $runtime 'electronapp/package.json') -Raw | ConvertFrom-Json
[IO.File]::WriteAllText((Join-Path $harness 'package.json'),(@{name='emby-theater-enhanced-p1-test';version=$metadata.version;main='entry.cjs'} | ConvertTo-Json -Compress),$utf8)
$entryLiteral = (Join-Path $root 'tools/p1-diagnostics-smoke.cjs') | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $harness 'entry.cjs'),('require(' + $entryLiteral + ');'),$utf8)
$existing = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($runtime + '\',[StringComparison]::OrdinalIgnoreCase) })
if ($existing.Count) { throw 'Candidate already has running processes; no ownership acquired.' }
$fixture = Join-Path $evidence 'fixture.y4m'
& node (Join-Path $root 'tools/make-fixture.cjs') $fixture $fixtureSeconds
if ($LASTEXITCODE -ne 0) { throw 'Fixture creation failed.' }
[IO.File]::WriteAllText(($fixture + '.strm'), "fixture`n")
[IO.File]::WriteAllText((Join-Path $evidence 'appdata/mpv/mpv.conf'), "vo=gpu-next`ngpu-context=d3d11`nhwdec=no`ndemuxer-max-bytes=3072MiB`n")
$info = New-Object Diagnostics.ProcessStartInfo
$info.FileName = Join-Path $runtime 'x64/electron/electron.exe'
$info.Arguments = '"' + $harness + '" "' + $profile + '"'
$info.WorkingDirectory = $runtime
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
foreach ($name in @($info.EnvironmentVariables.Keys)) {
    if ([string]$name -like 'ETE_*') { $info.EnvironmentVariables.Remove([string]$name) }
}
$envValues = @{
    ETE_TEST_RUNTIME=$runtime; ETE_TEST_EVIDENCE=$evidence; ETE_TEST_PIPELINE='1'; ETE_TEST_MEDIA=$fixture;
    ETE_TEST_CD2_MODE=$Cd2Mode; ETE_TEST_CD2_EXPECT=$Cd2Mode; ETE_TEST_CD2_DELAY_MS=[string]$Cd2DelayMs;
    ETE_TEST_FIXTURE_SECONDS=[string]$fixtureSeconds; ETE_TEST_MOUNT_SIDECAR=($fixture + '.strm');
    ETE_CD2_ENABLED='1'; ETE_CD2_ORIGIN='http://127.0.0.1:19798'; ETE_CD2_TOKEN='fixture-test-token';
    ETE_CD2_LOCAL_PREFIX=$evidence; ETE_CD2_CLOUD_PREFIX='/fixture';
    APPDATA=(Join-Path $evidence 'appdata'); LOCALAPPDATA=(Join-Path $evidence 'localappdata');
    MPV_HOME=(Join-Path $evidence 'appdata/mpv'); NO_PROXY='127.0.0.1,localhost'
    ETE_TEST_EXIT_TRACE='1'
}
foreach ($entry in $envValues.GetEnumerator()) { $info.EnvironmentVariables[$entry.Key]=[string]$entry.Value }
if ($NormalClose) { $info.EnvironmentVariables['ETE_TEST_NORMAL_CLOSE']=$NormalClose }
foreach ($name in @('ELECTRON_RUN_AS_NODE','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy')) { $info.EnvironmentVariables.Remove($name) }
$runnerClock = [Diagnostics.Stopwatch]::StartNew()
$lifecycle = New-Object 'System.Collections.Generic.List[object]'
function Write-ExitStage {
    param([string]$Stage, [object]$Detail = $null)
    try {
        if ($lifecycle.Count -ge 64) { return }
        $row = [ordered]@{stage=$Stage; elapsedMs=$runnerClock.ElapsedMilliseconds; detail=$Detail}
        $lifecycle.Add($row)
        [IO.File]::AppendAllText((Join-Path $evidence 'runner-exit-observation.jsonl'),($row | ConvertTo-Json -Compress -Depth 5) + [Environment]::NewLine,$utf8)
    } catch { }
}
$process = [Diagnostics.Process]::Start($info)
$ownedStarted = $process.StartTime.ToUniversalTime()
Write-ExitStage 'root-started' ([ordered]@{pid=$process.Id; startedUtc=$ownedStarted.ToString('o')})
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
# Two fixed observations discover short-lived children before the prior 12 s checkpoint.
$exited = $process.WaitForExit(2000)
$ownedIds = @($process.Id)
$owned = @()
$snapshot = @(Get-CimInstance Win32_Process)
do {
    $children = @($snapshot | Where-Object { $_.ParentProcessId -in $ownedIds -and $_.ProcessId -notin $ownedIds })
    $owned += $children
    $ownedIds += @($children | ForEach-Object { $_.ProcessId })
} while ($children.Count)
$childIdentities = @($owned | ForEach-Object {
    $role = if ($_.Name -eq 'ete-mpv-helper.exe') { 'native-helper' } elseif ($_.Name -eq 'electron.exe') { 'electron-child' } else { 'other-child' }
    [ordered]@{pid=[int]$_.ProcessId; parentPid=[int]$_.ParentProcessId; startedUtc=$_.CreationDate.ToUniversalTime().ToString('o'); role=$role}
})
Write-ExitStage 'children-observed' $childIdentities
if (-not $exited) { $exited = $process.WaitForExit([Math]::Max(0,12000 - [int]$runnerClock.ElapsedMilliseconds)) }
Write-ExitStage 'checkpoint' ([ordered]@{rootExited=$exited})
# Keep the original absolute 120 s limit; instrumentation does not extend it.
if (-not $exited) { $exited = $process.WaitForExit([Math]::Max(0,120000 - [int]$runnerClock.ElapsedMilliseconds)) }
$cleanupAttempted = $false
$ownershipMatched = $null
Write-ExitStage 'root-wait-complete' ([ordered]@{naturalExitObserved=$exited})
if (-not $exited) {
    $current = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    $ownershipMatched = !!($current -and $current.StartTime.ToUniversalTime() -eq $ownedStarted)
    if ($current -and $current.StartTime.ToUniversalTime() -eq $ownedStarted) {
        $cleanupAttempted = $true
        Write-ExitStage 'outer-cleanup-requested' ([ordered]@{ownershipMatched=$true})
        & taskkill.exe /PID $process.Id /T /F | Out-Null
        Write-ExitStage 'outer-cleanup-returned' ([ordered]@{commandExitCode=$LASTEXITCODE})
    }
    $process.WaitForExit(5000) | Out-Null
}
$outputCapture = Read-RunnerOutput -StdoutTask $stdout -StderrTask $stderr
[IO.File]::WriteAllText((Join-Path $evidence 'stdout.log'),$outputCapture.stdout)
[IO.File]::WriteAllText((Join-Path $evidence 'stderr.log'),$outputCapture.stderr)
$exitCode = $null
try { if ($process.HasExited) { $exitCode = $process.ExitCode } } catch { $exitCode = $null }
$remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($runtime + '\',[StringComparison]::OrdinalIgnoreCase) })
$childExitObservations = @($childIdentities | ForEach-Object {
    $identity = $_
    $child = Get-Process -Id $identity.pid -ErrorAction SilentlyContinue
    # CIM CreationDate truncates 100 ns StartTime ticks to microseconds on Windows.
    # This precision normalization is observation-only; root cleanup still uses exact StartTime.
    $sameProcess = $false
    if ($child) {
        $childTicks = $child.StartTime.ToUniversalTime().Ticks
        $capturedTicks = [datetime]::Parse($identity.startedUtc).ToUniversalTime().Ticks
        $sameProcess = ($childTicks - ($childTicks % 10)) -eq $capturedTicks
    }
    [ordered]@{pid=$identity.pid; role=$identity.role; gone=$(if ($child -and -not $sameProcess) { $null } else { -not $sameProcess }); observation= $(if ($sameProcess) { 'STILL_PRESENT' } elseif ($child) { 'IDENTITY_MISMATCH' } elseif ($cleanupAttempted) { 'GONE_AFTER_FORCED_CLEANUP' } else { 'GONE_WITHOUT_OUTER_CLEANUP' })}
})
Write-ExitStage 'children-final-observation' $childExitObservations
Write-ExitStage 'runner-complete' ([ordered]@{candidateResidual=$remaining.Count; outputCapture=$outputCapture.status})
$summary = [ordered]@{ rootPid=$process.Id; timedOut=(-not $exited); exitCode=$exitCode; outputCapture=$outputCapture.status; observedDescendants=$owned.Count; candidateResidual=$remaining.Count; realServiceAccess=$false;
    exitMode=$(if ($exited) { 'NATURAL' } elseif ($cleanupAttempted) { 'FORCED_CLEANUP' } else { 'TIMEOUT_OWNERSHIP_UNAVAILABLE' });
    cleanupAttempted=$cleanupAttempted; cleanupOwnershipMatched=$ownershipMatched; elapsedMs=$runnerClock.ElapsedMilliseconds;
    childExitObservations=$childExitObservations; childObservationCoverage='FIXED_2S_SNAPSHOT_NOT_EXHAUSTIVE'; lifecycle=$lifecycle.ToArray() }
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence 'runner-result.json') -Encoding UTF8
$evidence | Set-Content -LiteralPath (Join-Path $root '.work/p1-latest-evidence.txt') -Encoding UTF8
$summary | ConvertTo-Json -Depth 8
Write-Output ('Evidence: ' + $evidence.Substring($root.Length + 1))
if (-not $exited -or $outputCapture.status -ne 'COMPLETE' -or $null -eq $exitCode -or $exitCode -ne 0 -or $remaining.Count) { throw 'P1 isolated runtime did not pass.' }
if ($NormalClose) {
    & node (Join-Path $root 'tools/verify-normal-close.cjs') $runtime $evidence $NormalClose
} else {
    & node (Join-Path $root 'tools/verify-p1-diagnostics.cjs') $runtime $evidence
}
if ($LASTEXITCODE -ne 0) { throw 'P1 product diagnostic records did not pass.' }
