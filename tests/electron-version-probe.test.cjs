'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const probe = require('../tools/electron-version-probe.cjs');

const repoRoot = path.resolve(__dirname, '..');

test('Electron version probe requires the exact pinned runtime versions', () => {
    const expected = {
        electron: '44.4.2',
        chrome: '152.0.7977.130',
        node: '24.21.0',
        v8: '15.2.124.28-electron.0'
    };
    assert.deepEqual(probe.evaluateVersions(Object.assign({}, expected), expected), {ok: true, mismatches: []});
    assert.deepEqual(probe.evaluateVersions(Object.assign({}, expected, {node: '24.20.0'}), expected), {
        ok: false,
        mismatches: ['node']
    });
});

test('formal runtime smoke validates the pinned tree and process versions before UI startup', () => {
    const runtimeTest = fs.readFileSync(path.join(repoRoot, 'tools', 'test-runtime.ps1'), 'utf8');
    assert.match(runtimeTest, /electron-runtime-input\.cjs'\) validate-runtime/);
    assert.match(runtimeTest, /electron-version-probe\.cjs/);
    assert.match(runtimeTest, /ELECTRON_RUN_AS_NODE'\] = '1'/);
    assert.match(runtimeTest, /electron-version\.json/);

    const cd2Smoke = fs.readFileSync(path.join(repoRoot, 'tools', 'cd2-runtime-smoke.cjs'), 'utf8');
    assert.match(cd2Smoke, /runtimeIdentities\.electron\.processVersions/);
    assert.doesNotMatch(cd2Smoke, /18\.3\.15|16\.13\.2/);
});
