'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const runnerPath = path.join(__dirname, '..', 'tools', 'test-p1-diagnostics.ps1');
const runner = fs.readFileSync(runnerPath, 'utf8');

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
        'tools/transition-stream-capture.cjs', 'tests/pipeline-browser.js', 'tests/generation-fixture-observer.js',
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

test('runner passes bounded CD2 and fixture settings and keeps a 120-second owned-process deadline', () => {
    assert.match(runner, /\[ValidateSet\('hit','direct','miss'\)\]\[string\]\$Cd2Mode = 'hit'/);
    assert.match(runner, /\[ValidateRange\(0,1000\)\]\[int\]\$Cd2DelayMs = 400/);
    assert.match(runner, /ETE_TEST_CD2_MODE=\$Cd2Mode; ETE_TEST_CD2_EXPECT=\$Cd2Mode; ETE_TEST_CD2_DELAY_MS=\[string\]\$Cd2DelayMs/);
    assert.match(runner, /\$fixtureSeconds\s*=\s*60/);
    assert.match(runner, /make-fixture\.cjs'\) \$fixture \$fixtureSeconds/);
    assert.match(runner, /ETE_TEST_FIXTURE_SECONDS=\[string\]\$fixtureSeconds/);
    assert.match(runner, /WaitForExit\(12000\)/);
    assert.match(runner, /WaitForExit\(108000\)/);
    assert.match(runner, /if \(\$current -and \$current\.StartTime\.ToUniversalTime\(\) -eq \$ownedStarted\).*taskkill\.exe \/PID \$process\.Id \/T \/F/);
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
