'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const entry = require('../tools/verify-managed-update-windows.cjs');
const sha = 'a'.repeat(40), environment = {GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: 'hope140/EmbyTheaterEnhanced'};

test('short validation fails before execution on a source mismatch, Work/local host or unrecognized argument', () => {
    assert.equal(entry.requireInvocation(['--expected-source', sha], 'win32', environment, sha), sha);
    for (const [args, platform, env, actual] of [
        [['--expected-source', sha], 'linux', environment, sha],
        [['--expected-source', sha], 'win32', {}, sha],
        [['--expected-source', sha], 'win32', {...environment, RUNNER_ENVIRONMENT: 'self-hosted'}, sha],
        [['--expected-source', sha], 'win32', environment, 'b'.repeat(40)],
        [['--expected-source', sha, '--skip-security'], 'win32', environment, sha]
    ]) assert.throws(() => entry.requireInvocation(args, platform, env, actual));
});

test('short receipt requires a unique complete test summary and includes actual Windows tests', () => {
    assert.deepEqual(entry.summary('# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n'), {tests: 2, pass: 2, fail: 0, cancelled: 0, skipped: 0});
    assert.throws(() => entry.summary('# tests 2\n# pass 2\n'));
    assert.ok(entry.TESTS.includes('tests/update-install-controlled-wizard.test.cjs'));
    assert.ok(entry.TESTS.includes('tests/update-install-windows.test.cjs'));
});

test('independent short job has exact checkout, read-only permissions, no package or dependency installation', () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/managed-update-validation.yml'), 'utf8').replace(/\r/g, '');
    const job = workflow.split('\n  windows-managed-update-short:\n')[1];
    assert.doesNotMatch(workflow, /workflow_dispatch:|pull_request_target:|workflow_run:/); assert.match(job, /feature\/managed-app-update-install/);
    assert.match(workflow, /permissions:\n  contents: read/);
    assert.match(job, /runs-on: windows-2022/); assert.match(job, /timeout-minutes: 8/);
    assert.match(job, /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/);
    assert.match(job, /persist-credentials: false/); assert.match(job, /node-version: 24\.18\.1/);
    assert.match(job, /--expected-source \$env:ETE_EXPECTED_SOURCE/);
    assert.doesNotMatch(job, /npm (?:ci|install)|ci-windows-test-package|contents: write|secrets\.|workflow_dispatch:/);
});
