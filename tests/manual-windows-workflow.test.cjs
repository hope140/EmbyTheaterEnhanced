'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8').replace(/\r\n/g, '\n');
const manual = workflow.slice(workflow.indexOf('\n  manual-windows-test-package:'));

test('package job requires an explicit manual event and the MSBuild17-compatible Windows x64 runner', () => {
    assert.match(workflow, /^  workflow_dispatch:\s*$/m);
    assert.match(manual, /^    if: github\.event_name == 'workflow_dispatch'$/m);
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
    const uses = [...manual.matchAll(/uses: ([^@\n]+)@([^\s]+)/g)].map(match => [match[1],match[2]]);
    assert.deepEqual(uses,[
        ['actions/checkout','11d5960a326750d5838078e36cf38b85af677262'],
        ['actions/setup-node','49933ea5288caeca8642d1e84afbd3f7d6820020'],
        ...Array(4).fill(['actions/upload-artifact','cf430e030ddbb5b0abf93d22962f4752f3646cd9'])
    ]);
});

test('native preview failure diagnostics are separate, explicitly scoped and never an acceptance package', () => {
    const diagnostics=manual.slice(manual.indexOf('      - name: Preserve native preview failure diagnostics'));
    assert.match(diagnostics,/if: failure\(\) && inputs.native_preview_trial/);
    assert.match(diagnostics,/path: test-output\/native-preview-diagnostics-\*\/\*/);
    assert.match(diagnostics,/name: ete-native-preview-diagnostics-\$\{\{ github.sha \}\}-\$\{\{ github.run_id \}\}-\$\{\{ github.run_attempt \}\}/);
    assert.match(diagnostics,/retention-days: 1/);assert.match(diagnostics,/if-no-files-found: warn/);
    assert.doesNotMatch(diagnostics,/native-owner-|manual-windows-package|profiles|\.work|dist\//);
});

test('artifact upload is restricted to the staged package and the shortest supported retention', () => {
    assert.match(manual, /run: \.\/tools\/ci-windows-test-package\.ps1/);
    assert.match(manual, /path: test-output\/manual-windows-package\/\*/);
    assert.match(manual, /if-no-files-found: error/);
    assert.match(manual, /retention-days: 1/);
    assert.match(manual, /include-hidden-files: false/);
    assert.doesNotMatch(manual, /path: (?:\.|dist|vendor|\.work)(?:\/\*\*|$)/m);
});
