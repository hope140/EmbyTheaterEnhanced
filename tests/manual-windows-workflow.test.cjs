'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const manual = workflow.slice(workflow.indexOf('\n  manual-windows-test-package:'));

test('package job requires an explicit manual event and the MSBuild17-compatible Windows x64 runner', () => {
    assert.match(workflow, /^  workflow_dispatch:\s*$/m);
    assert.match(manual, /^    if: github\.event_name == 'workflow_dispatch' && \(inputs\.range_smoke == 'off' \|\| inputs\.range_smoke == '' \|\| inputs\.range_smoke == 'offline-regression'\)$/m);
    assert.match(manual, /^    runs-on: windows-2022$/m);
    assert.doesNotMatch(manual, /self-hosted|windows-latest|larger|workflow_run|pull_request_target/);
    assert.match(manual, /cancel-in-progress: false/);
});

test('manual build keeps read-only token permissions and binds checkout to its event commit', () => {
    assert.match(workflow, /^permissions:\n  contents: read\n/m);
    assert.doesNotMatch(workflow, /(?:contents|actions|id-token): write|write-all|secrets\./);
    assert.match(manual, /ref: \$\{\{ github\.sha \}\}/);
    assert.match(manual, /persist-credentials: false/);
    assert.match(manual, /node-version: 24\.18\.1/);
    assert.doesNotMatch(manual, /gh release|release\/|releases|git (?:push|tag)|npm publish/);
    const uses = [...manual.matchAll(/uses: [^@\n]+@([^\s]+)/g)].map(match => match[1]);
    assert.equal(uses.length, 3);
    assert.ok(uses.every(ref => /^[0-9a-f]{40}$/.test(ref)));
});

test('artifact upload is restricted to the staged package and the shortest supported retention', () => {
    assert.match(manual, /run: \.\/tools\/ci-windows-test-package\.ps1/);
    assert.match(manual, /path: test-output\/manual-windows-package\/\*/);
    assert.match(manual, /if-no-files-found: error/);
    assert.match(manual, /retention-days: 1/);
    assert.match(manual, /include-hidden-files: false/);
    assert.doesNotMatch(manual, /path: (?:\.|dist|vendor|\.work)(?:\/\*\*|$)/m);
});


test('next settings check is a short exact-source Windows serial regression with no package or helper launch', () => {
    const job = workflow.slice(workflow.indexOf('  manual-next-prefix-settings:'), workflow.indexOf('  manual-next-prefix-result:'));
    assert.match(job, /inputs.range_smoke == 'next-settings-check' && !inputs.release_package/);
    assert.match(job, /github.ref == 'refs\/heads\/verify\/next-episode-auto-20261024'/);
    assert.match(job, /runs-on: windows-2022/);
    assert.match(job, /timeout-minutes: 5/);
    assert.match(job, /ref: \$\{\{ github.sha \}\}/);
    assert.match(job, /node --test --test-concurrency=1 tests\/ci-windows-path-diagnostics.test.cjs tests\/playback-prefix-alameda-auto.test.cjs/);
    assert.doesNotMatch(job, /npm ci|build.ps1|package.ps1|execute-native|actions: write|secrets\.|GITHUB_TOKEN|upload-artifact/);
});


test('full offline regression reuses complete prepared package tests and returns before runtime/installer build', () => {
    const script = fs.readFileSync(path.join(__dirname, '../tools/ci-windows-test-package.ps1'), 'utf8');
    assert.match(manual, /ETE_REGRESSION_ONLY: \$\{\{ inputs.range_smoke == 'offline-regression' \}\}/);
    assert.match(manual, /-RegressionOnly:\(\$env:ETE_REGRESSION_ONLY -eq 'true'\)/);
    assert.match(manual, /if: inputs.range_smoke != 'offline-regression'/);
    const gate = script.indexOf('if ($RegressionOnly) {');
    assert(gate > script.indexOf("RunNode @('tests/windows-host-material-selftest.cjs')"));
    assert(gate > script.indexOf('node --test --test-reporter=tap --test-concurrency=1 @tests'));
    assert(gate < script.indexOf("'build.ps1') -OutputName"));
    assert.match(script.slice(gate, gate + 250), /FULL_WINDOWS_REGRESSION_PASSED[\s\S]*?return/);
    assert.match(script, /Regression-only cannot stage release files/);
    assert.match(script, /-Filter '\*.test.cjs'/);
});
