'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const manualStart = workflow.indexOf('\n  manual-windows-test-package:');
const resultsStart = workflow.indexOf('\n  manual-mpv-disk-results:', manualStart);
const manual = workflow.slice(manualStart, resultsStart < 0 ? undefined : resultsStart);

test('package job requires an explicit manual event and the MSBuild17-compatible Windows x64 runner', () => {
    assert.match(workflow, /^  workflow_dispatch:\s*$/m);
    assert.match(manual, /^    if: github\.event_name == 'workflow_dispatch' && \(inputs\.range_smoke == 'off' \|\| inputs\.range_smoke == ''\)$/m);
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
