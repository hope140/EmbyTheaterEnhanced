param(
    [Parameter(Mandatory=$true)][string]$RuntimeName,
    [string]$ProductRoot = '',
    [ValidateSet('hit','direct')][string]$Cd2Mode = 'hit',
    [ValidateRange(0,1000)][int]$Cd2DelayMs = 400
)
$ErrorActionPreference = 'Stop'
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
    settings=[ordered]@{cd2Mode=$Cd2Mode; cd2DelayMs=$Cd2DelayMs; fixtureSeconds=$fixtureSeconds}
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
}
foreach ($entry in $envValues.GetEnumerator()) { $info.EnvironmentVariables[$entry.Key]=[string]$entry.Value }
foreach ($name in @('ELECTRON_RUN_AS_NODE','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy')) { $info.EnvironmentVariables.Remove($name) }
$process = [Diagnostics.Process]::Start($info)
$ownedStarted = $process.StartTime.ToUniversalTime()
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
$exited = $process.WaitForExit(12000)
$ownedIds = @($process.Id)
$owned = @()
$snapshot = @(Get-CimInstance Win32_Process)
do {
    $children = @($snapshot | Where-Object { $_.ParentProcessId -in $ownedIds -and $_.ProcessId -notin $ownedIds })
    $owned += $children
    $ownedIds += @($children | ForEach-Object { $_.ProcessId })
} while ($children.Count)
if (-not $exited) { $exited = $process.WaitForExit(108000) }
if (-not $exited) {
    $current = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    if ($current -and $current.StartTime.ToUniversalTime() -eq $ownedStarted) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
    $process.WaitForExit(5000) | Out-Null
}
[IO.File]::WriteAllText((Join-Path $evidence 'stdout.log'),$stdout.GetAwaiter().GetResult())
[IO.File]::WriteAllText((Join-Path $evidence 'stderr.log'),$stderr.GetAwaiter().GetResult())
$remaining = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($runtime + '\',[StringComparison]::OrdinalIgnoreCase) })
$summary = [ordered]@{ rootPid=$process.Id; timedOut=(-not $exited); exitCode=$process.ExitCode; observedDescendants=$owned.Count; candidateResidual=$remaining.Count; realServiceAccess=$false }
$summary | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence 'runner-result.json') -Encoding UTF8
$evidence | Set-Content -LiteralPath (Join-Path $root '.work/p1-latest-evidence.txt') -Encoding UTF8
$summary | ConvertTo-Json
Write-Output ('Evidence: ' + $evidence.Substring($root.Length + 1))
if (-not $exited -or $process.ExitCode -ne 0 -or $remaining.Count) { throw 'P1 isolated runtime did not pass.' }
& node (Join-Path $root 'tools/verify-p1-diagnostics.cjs') $runtime $evidence
if ($LASTEXITCODE -ne 0) { throw 'P1 product diagnostic records did not pass.' }
