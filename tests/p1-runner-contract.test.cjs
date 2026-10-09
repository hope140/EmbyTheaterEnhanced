'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    assert.match(runner, /\[ValidateSet\('hit','direct'\)\]\[string\]\$Cd2Mode = 'hit'/);
    assert.match(runner, /\[ValidateRange\(0,1000\)\]\[int\]\$Cd2DelayMs = 400/);
    assert.match(runner, /ETE_TEST_CD2_MODE=\$Cd2Mode; ETE_TEST_CD2_EXPECT=\$Cd2Mode; ETE_TEST_CD2_DELAY_MS=\[string\]\$Cd2DelayMs/);
    assert.match(runner, /\$fixtureSeconds\s*=\s*60/);
    assert.match(runner, /make-fixture\.cjs'\) \$fixture \$fixtureSeconds/);
    assert.match(runner, /ETE_TEST_FIXTURE_SECONDS=\[string\]\$fixtureSeconds/);
    assert.match(runner, /WaitForExit\(12000\)/);
    assert.match(runner, /WaitForExit\(108000\)/);
    assert.match(runner, /if \(\$current -and \$current\.StartTime\.ToUniversalTime\(\) -eq \$ownedStarted\).*taskkill\.exe \/PID \$process\.Id \/T \/F/);
});
