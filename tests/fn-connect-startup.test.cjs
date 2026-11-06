'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {prepare, SOURCE_PATHS} = require('../src/electronapp/enhanced/fn-connect/startup.cjs');
const sha = value => createHash('sha256').update(value).digest('hex').toUpperCase();
function fixture(t) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ete-fn-startup-fixture-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const runtimeRoot = path.join(root, 'runtime'), tempParent = path.join(root, 'temp'), formal = path.join(root, 'formal');
    for (const dir of [runtimeRoot, tempParent, formal]) fs.mkdirSync(dir);
    fs.writeFileSync(path.join(formal, 'keep'), 'synthetic-existing-profile');
    function write(relative, text) { const file = path.join(runtimeRoot, relative); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); return sha(Buffer.from(text)); }
    const files = SOURCE_PATHS.map((runtimePath, i) => { const value = write(runtimePath, 'synthetic-source-' + i); return {runtimePath, sourceSha256: value, runtimeSha256: value}; });
    const overlays = ['electronapp/www/startup/manualserver.js', 'electronapp/www/modules/emby-apiclient/connectionmanager.js'].map(runtimePath => {
        const value = write(runtimePath, 'synthetic-overlay'); return {runtimePath, runtimeSha256: value, expectedOutputSha256: value};
    });
    const sourceCommit = 'a'.repeat(40), source = JSON.stringify({sourceCommit, webSnapshot: {overlays}});
    const sourceHash = write('source-provenance.json', source), executableSha = write('x64/electron/electron.exe', 'synthetic-exe-not-executed');
    const preloadSha = write('electronapp/preload.js', 'synthetic-preload');
    write('runtime-provenance.json', JSON.stringify({sourceCommit, validatedProductScope: {sourceCommit, sourceSelection: 'git-commit-blobs', files},
        preparedArtifacts: [{runtimePath: 'electronapp/preload.js', runtimeSha256: preloadSha}], electronRuntime: {electronExeSha256: executableSha},
        sourceProvenance: {path: 'source-provenance.json', sha256: sourceHash}}));
    const changes = [], paths = {appData: formal, userData: formal};
    const app = {isReady: () => false, getPath: key => paths[key], setPath(key, value) { changes.push(key); paths[key] = value; }};
    const options = {app, argv: ['electron.exe', path.join(runtimeRoot, 'electronapp'), '--fn-connect-experiment'],
        execPath: path.join(runtimeRoot, 'x64/electron/electron.exe'), runtimeRoot, platform: 'win32', environment: {}, tempParent};
    return {options, root, formal, changes, tempParent};
}
test('ordinary startup does not inspect the filesystem, environment or existing profiles', () => {
    assert.equal(prepare({argv: ['electron.exe', 'app'], app: new Proxy({}, {get() { throw new Error('UNEXPECTED_APP_ACCESS'); }})}), null);
});
test('explicit FN startup binds current source and isolates every profile path before bootstrap writes', t => {
    const f = fixture(t), trial = prepare(f.options);
    assert.equal(trial.sourceCommit, 'a'.repeat(40)); assert.equal(path.dirname(trial.root), f.tempParent);
    for (const name of ['appData', 'userData', 'sessionData', 'logs', 'temp', 'crashDumps']) assert(f.options.app.getPath(name).startsWith(trial.root + path.sep));
    assert(f.options.environment.APPDATA.startsWith(trial.root)); assert(f.options.environment.LOCALAPPDATA.startsWith(trial.root));
    assert.equal(fs.readFileSync(path.join(f.formal, 'keep'), 'utf8'), 'synthetic-existing-profile');
    assert.deepEqual(fs.readdirSync(f.formal), ['keep']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(trial.root, 'fn-trial.json'))).profileReused, false);
});
test('tampered FN source refuses the trial before profile or environment mutation', t => {
    const f = fixture(t); fs.appendFileSync(path.join(f.options.runtimeRoot, SOURCE_PATHS[3]), 'tampered');
    assert.throws(() => prepare(f.options), /FN_TRIAL_STARTUP_REJECTED/);
    assert.equal(f.changes.length, 0); assert.deepEqual(fs.readdirSync(f.tempParent), []); assert.deepEqual(f.options.environment, {});
});
for (const flag of ['--no-sandbox', '--ignore-certificate-errors', '--remote-debugging-port=9222', '--ete-page-cache-test']) test('FN trial does not accept security bypasses or mixed trial flags: ' + flag.split('=')[0], t => {
    const f = fixture(t); f.options.argv.push(flag);
    assert.throws(() => prepare(f.options), /FN_TRIAL_STARTUP_REJECTED/); assert.equal(f.changes.length, 0);
});
