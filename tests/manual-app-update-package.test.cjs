'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const {spawnSync} = require('node:child_process');

test('standalone package entry runs offline without application bootstrap or a profile', async t => {
    let realRequests = 0;
    t.mock.method(https, 'get', function () { realRequests++; throw new Error('Real network forbidden in package selftest'); });
    const result = await require('../src/electronapp/enhanced/manual-app-update-selftest').run();
    assert.equal(result.status, 'passed'); assert.equal(result.realNetworkRequests, 0); assert.equal(realRequests, 0);
    assert.equal(result.profileAccess, false); assert.equal(result.appBootstrap, false); assert.equal(result.installerExecuted, false);
    assert.equal(result.temporaryFilesRemoved, true); assert.equal(result.checks.length, 8);
});

test('unpacked-source fixture binds its seven modules to a synthetic manifest and refuses drift', t => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-package-entry-fixture-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const directory = path.join(root, 'electronapp', 'enhanced'); fs.mkdirSync(directory, {recursive: true});
    const names = ['manual-app-update.js', 'maintenance.js', 'maintenance-ipc.js', 'renderer-boundary.js', 'release-note-links.js', 'app-update-preferences.js', 'manual-app-update-selftest.js'];
    const files = names.map(name => {
        const bytes = fs.readFileSync(path.resolve(__dirname, '../src/electronapp/enhanced', name));
        fs.writeFileSync(path.join(directory, name), bytes);
        return {path: 'electronapp/enhanced/' + name, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
    });
    fs.writeFileSync(path.join(root, 'build-manifest.json'), JSON.stringify({sourceCommit: 'a'.repeat(40), files}));
    const entry = path.join(directory, 'manual-app-update-selftest.js');
    const run = () => spawnSync(process.execPath, [entry], {encoding: 'utf8', timeout: 10000});
    const passed = run(); assert.equal(passed.status, 0, passed.stderr);
    assert.deepEqual(JSON.parse(passed.stdout).packageManifestBinding, {status: 'matched', sourceCommit: 'a'.repeat(40)});
    fs.appendFileSync(path.join(directory, 'manual-app-update.js'), '\n// synthetic drift\n');
    const drift = run(); assert.equal(drift.status, 1); assert.match(drift.stderr, /selftest failed/);
    assert.doesNotMatch(drift.stderr, /ete-package-entry-fixture-/);
});

test('standalone entry rejects arguments rather than exposing a network or installation override', () => {
    const entry = path.resolve(__dirname, '../src/electronapp/enhanced/manual-app-update-selftest.js');
    const result = spawnSync(process.execPath, [entry, '--url=https://invalid.example/'], {encoding: 'utf8'});
    assert.equal(result.status, 2); assert.match(result.stderr, /No arguments/); assert.equal(result.stdout, '');
});
