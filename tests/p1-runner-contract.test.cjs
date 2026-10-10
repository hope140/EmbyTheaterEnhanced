'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const runnerPath = path.join(__dirname, '..', 'tools', 'test-p1-diagnostics.ps1');
const runner = fs.readFileSync(runnerPath, 'utf8');

test('P1 bootstrap checks the child MPV_HOME and Electron paths before product modules load', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'p1-diagnostics-smoke.cjs'), 'utf8');
    const prefix = source.slice(0, source.indexOf('const appRoot ='));
    const evidence = path.resolve('isolated-fixture');
    const mpvHome = path.join(evidence, 'appdata', 'mpv');
    function boot(value, exists = true, wrongElectronPath = false) {
        const paths = {};
        const required = [];
        const app = {setPath(key, value) { paths[key] = value; }, getPath(key) { return wrongElectronPath ? 'wrong-path' : paths[key]; }};
        vm.runInNewContext(prefix, {process: {env: {ETE_TEST_RUNTIME: 'fixture-runtime', ETE_TEST_EVIDENCE: evidence, MPV_HOME: value}},
            require(name) {
                required.push(name);
                if (name === 'electron') return {app};
                if (name === 'node:fs') return {mkdirSync() {}, existsSync() { return exists; }};
                return require(name);
            }});
        assert.equal(paths.appData, path.join(evidence, 'appdata'));
        assert.equal(paths.userData, path.join(evidence, 'profile'));
        assert.ok(required.every(name => ['node:fs', 'node:path', 'node:url', 'electron'].includes(name)));
    }
    boot(mpvHome);
    for (const value of [undefined, '', path.resolve('unrelated-mpv-profile')]) {
        assert.throws(() => boot(value), /MPV_HOME isolation failed before product bootstrap/);
    }
    assert.throws(() => boot(mpvHome, false), /MPV_HOME isolation failed before product bootstrap/);
    assert.throws(() => boot(mpvHome, true, true), /profile isolation failed before product bootstrap/);
});

test('ProductRoot resolves the candidate and all product provenance gates use it', () => {
    assert.match(runner, /\[string\]\$ProductRoot\s*=\s*''/);
    assert.match(runner, /if \(\[string\]::IsNullOrWhiteSpace\(\$ProductRoot\)\) \{ \$ProductRoot = \$root \}/);
    assert.match(runner, /\$ProductRoot = \(Resolve-Path -LiteralPath \$ProductRoot\)\.Path/);
    assert.match(runner, /\$runtime = Join-Path \(Join-Path \$ProductRoot 'dist'\) \$RuntimeName/);
    assert.doesNotMatch(runner, /\$runtime\s*=\s*Join-Path\s+\(Join-Path\s+\$root\s+'dist'\)/);
    for (const command of [
        /source-provenance\.cjs'\) validate \$ProductRoot \$runtime \$sourceCommit/,
        /runtime-provenance\.cjs'\) validate \$ProductRoot \$runtime \$sourceCommit/,
        /native-helper-provenance\.cjs'\) \$ProductRoot \$runtime \$sourceCommit/,
        /electron-runtime-input\.cjs'\) validate-runtime \$ProductRoot \$runtime/
    ]) assert.match(runner, command);
});

test('harness identity lists fixed inputs and stores only commits, hashes and run settings', () => {
    const paths = [
        'tools/test-p1-diagnostics.ps1', 'tools/p1-diagnostics-smoke.cjs', 'tools/smoke-electron.cjs',
        'tools/make-fixture.cjs', 'tools/verify-p1-diagnostics.cjs', 'tools/runtime-window-ownership.cjs',
        'tools/transition-stream-capture.cjs', 'tools/exit-observation.cjs', 'tests/pipeline-browser.js', 'tests/generation-fixture-observer.js',
        'tests/fake-cd2-fixture.cjs', 'tests/pipeline-deadline.cjs', 'tests/pipeline-condition.js',
        'tests/pipeline-result.cjs'
    ];
    const identityBlock = runner.match(/\$identity\s*=\s*\[ordered\]@\{([\s\S]*?)\r?\n\}/);
    assert.ok(identityBlock, 'runner must build a schema-versioned harness identity');
    for (const field of ['schemaVersion=1', 'productSourceCommit=$sourceCommit', 'runtimeProvenanceSha256=',
        'harnessHead=$harnessHead', 'harnessFiles=$harnessFiles', 'cd2Mode=$Cd2Mode',
        'cd2DelayMs=$Cd2DelayMs', 'fixtureSeconds=$fixtureSeconds']) {
        assert.ok(identityBlock[1].includes(field), 'missing identity field ' + field);
    }
    for (const file of paths) assert.ok(runner.includes("'" + file + "'"), 'missing harness input ' + file);
    assert.match(runner, /Required harness input missing:/);
    assert.doesNotMatch(identityBlock[1], /\$ProductRoot|\$productRoot|\$runtime\b|\$evidence\b|AbsolutePath/);
});

test('runner keeps fixed 2-second snapshot, absolute 12-second checkpoint, and 120-second owned-process deadline', () => {
    assert.match(runner, /\[ValidateSet\('hit','direct','miss'\)\]\[string\]\$Cd2Mode = 'hit'/);
    assert.match(runner, /\[ValidateRange\(0,1000\)\]\[int\]\$Cd2DelayMs = 400/);
    assert.match(runner, /ETE_TEST_CD2_MODE=\$Cd2Mode; ETE_TEST_CD2_EXPECT=\$Cd2Mode; ETE_TEST_CD2_DELAY_MS=\[string\]\$Cd2DelayMs/);
    assert.match(runner, /\$fixtureSeconds\s*=\s*60/);
    assert.match(runner, /make-fixture\.cjs'\) \$fixture \$fixtureSeconds/);
    assert.match(runner, /ETE_TEST_FIXTURE_SECONDS=\[string\]\$fixtureSeconds/);
    assert.match(runner, /WaitForExit\(2000\)/);
    assert.match(runner, /WaitForExit\(\[Math\]::Max\(0,12000 - \[int\]\$runnerClock\.ElapsedMilliseconds\)\)/);
    assert.match(runner, /WaitForExit\(\[Math\]::Max\(0,120000 - \[int\]\$runnerClock\.ElapsedMilliseconds\)\)/);
    assert.doesNotMatch(runner, /WaitForExit\(108000\)/);
    assert.match(runner, /ETE_TEST_EXIT_TRACE='1'/);
    assert.match(runner, /'tools\/exit-observation\.cjs'/);
    assert.match(runner, /Write-ExitStage 'checkpoint'/);
    assert.match(runner, /Write-ExitStage 'root-wait-complete'/);
    assert.match(runner, /if \(\$current -and \$current\.StartTime\.ToUniversalTime\(\) -eq \$ownedStarted\)\s*\{[\s\S]*?taskkill\.exe \/PID \$process\.Id \/T \/F/);
    assert.match(runner, /\$ownershipMatched = !!\(\$current -and \$current\.StartTime\.ToUniversalTime\(\) -eq \$ownedStarted\)/);
    assert.match(runner, /startedUtc=\$_\.CreationDate\.ToUniversalTime\(\)\.ToString\('o'\)/);
    assert.match(runner, /# CIM CreationDate truncates 100 ns StartTime ticks to microseconds on Windows\./);
    assert.match(runner, /\$childTicks = \$child\.StartTime\.ToUniversalTime\(\)\.Ticks/);
    assert.match(runner, /\$capturedTicks = \[datetime\]::Parse\(\$identity\.startedUtc\)\.ToUniversalTime\(\)\.Ticks/);
    assert.match(runner, /\(\$childTicks - \(\$childTicks % 10\)\) -eq \$capturedTicks/);
    assert.doesNotMatch(runner, /\$child\.StartTime\.ToUniversalTime\(\)\.ToString\('o'\) -eq \$identity\.startedUtc/);
    assert.match(runner, /exitMode=\$\(if \(\$exited\) \{ 'NATURAL' \} elseif \(\$cleanupAttempted\) \{ 'FORCED_CLEANUP' \} else \{ 'TIMEOUT_OWNERSHIP_UNAVAILABLE' \}\)/);
    assert.match(runner, /cleanupAttempted=\$cleanupAttempted; cleanupOwnershipMatched=\$ownershipMatched/);
    assert.match(runner, /childObservationCoverage='FIXED_2S_SNAPSHOT_NOT_EXHAUSTIVE'/);
});

test('PowerShell child identity normalization keeps same-microsecond identity and rejects distinct timestamps', t => {
    const scriptPath = path.join(os.tmpdir(), 'ete-child-identity-' + process.pid + '-' + Date.now() + '.ps1');
    const script = String.raw`
param()
function Test-ObservedChildIdentity {
    param([datetime]$ChildStart, [datetime]$CapturedStart)
    $childTicks = $ChildStart.ToUniversalTime().Ticks
    $capturedTicks = $CapturedStart.ToUniversalTime().Ticks
    return ($childTicks - ($childTicks % 10)) -eq $capturedTicks
}
$child = [datetime]::Parse('2026-10-09T07:52:41.5521137Z')
$sameMicrosecond = [datetime]::Parse('2026-10-09T07:52:41.5521130Z')
$distinctMicrosecond = [datetime]::Parse('2026-10-09T07:52:41.5521120Z')
[ordered]@{
    sameMicrosecond = Test-ObservedChildIdentity $child $sameMicrosecond
    distinctMicrosecond = Test-ObservedChildIdentity $child $distinctMicrosecond
} | ConvertTo-Json -Compress
`;
    t.after(() => { try { fs.rmSync(scriptPath, {force: true}); } catch (_) {} });
    fs.writeFileSync(scriptPath, script, 'utf8');
    const result = childProcess.spawnSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath
    ], {encoding: 'utf8', windowsHide: true, timeout: 10000});
    assert.equal(result.status, 0, result.stderr || result.error);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.sameMicrosecond, true);
    assert.equal(report.distinctMicrosecond, false);
});


test('Read-RunnerOutput bounds both streams and preserves only completed task results', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-runner-output-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const psTest = path.join(root, 'extract-runner-helper.ps1');
    const psSource = String.raw`param([string]$RunnerPath)
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($RunnerPath,[ref]$tokens,[ref]$parseErrors)
if ($parseErrors.Count) { throw 'runner-parse-failed' }
$functionAst = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Read-RunnerOutput' },$true)
if (-not $functionAst) { throw 'output-helper-missing' }
$helper = $functionAst.Body.GetScriptBlock()
$outTask = New-Object 'System.Threading.Tasks.TaskCompletionSource[string]'
$errTask = New-Object 'System.Threading.Tasks.TaskCompletionSource[string]'
$outTask.SetResult('stdout-ready')
$errTask.SetResult('stderr-ready')
$complete = & $helper $outTask.Task $errTask.Task 100
$pendingTask = New-Object 'System.Threading.Tasks.TaskCompletionSource[string]'
$clock = [System.Diagnostics.Stopwatch]::StartNew()
$pending = & $helper $outTask.Task $pendingTask.Task 10
$clock.Stop()
$faultTask = New-Object 'System.Threading.Tasks.TaskCompletionSource[string]'
$faultTask.SetException([System.Exception]::new('secret-fault'))
$fault = & $helper $faultTask.Task $errTask.Task 10
[ordered]@{
    completeStatus=$complete.status; completeStdout=$complete.stdout; completeStderr=$complete.stderr;
    pendingStatus=$pending.status; pendingStdout=$pending.stdout; pendingStderr=$pending.stderr; pendingElapsedMs=$clock.ElapsedMilliseconds;
    faultStatus=$fault.status; faultStdout=$fault.stdout; faultStderr=$fault.stderr
} | ConvertTo-Json -Compress
`;
    fs.writeFileSync(psTest, psSource, 'utf8');
    const result = childProcess.spawnSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psTest, runnerPath
    ], {encoding: 'utf8', windowsHide: true, timeout: 10000});
    assert.equal(result.status, 0, result.stderr || result.error);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.completeStatus, 'COMPLETE');
    assert.equal(report.completeStdout, 'stdout-ready');
    assert.equal(report.completeStderr, 'stderr-ready');
    assert.equal(report.pendingStatus, 'UNAVAILABLE');
    assert.equal(report.pendingStdout, 'stdout-ready');
    assert.equal(report.pendingStderr, 'UNAVAILABLE');
    assert.ok(report.pendingElapsedMs < 2000, 'incomplete output wait must stay bounded');
    assert.equal(report.faultStatus, 'UNAVAILABLE');
    assert.equal(report.faultStdout, 'UNAVAILABLE');
    assert.equal(report.faultStderr, 'stderr-ready');
});

test('runner fails when output capture or process exit status is unavailable', () => {
    assert.ok(runner.includes('$outputCapture = Read-RunnerOutput -StdoutTask $stdout -StderrTask $stderr'));
    assert.ok(runner.includes('if ($process.HasExited) { $exitCode = $process.ExitCode }'));
    assert.ok(runner.includes('exitCode=$exitCode; outputCapture=$outputCapture.status'));
    assert.ok(runner.includes("$outputCapture.status -ne 'COMPLETE' -or $null -eq $exitCode"));
    assert.equal(runner.includes('GetAwaiter().GetResult()'), false);
});
