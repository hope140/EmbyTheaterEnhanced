'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {LOCK, additionFor, compareInventories, assertComparisonData} = require('../tools/playback-range-loader-trial.cjs');
const {summarize, capture, isLoaderFailure} = require('../tools/playback-range-helper-diagnostics.cjs');
const {sha} = require('../tools/playback-range-windows-smoke.cjs');
function maps() {
    const row = {sha256: sha('synthetic-loader'), size: 16}, lock = {...LOCK, sha256: row.sha256};
    const base = new Map([['build-manifest.json', {sha256: sha('unaltered original manifest'), size: 27}], [lock.sourcePath, {...row}], ['electronapp/libmpv/x64/mpv-1.dll', {sha256: sha('synthetic-mpv'), size: 13}]]);
    const addition = additionFor(base, lock), derived = new Map([...base].map(([name, data]) => [name, {...data}])); derived.set(lock.targetPath, {...row});
    return {base, derived, addition, lock};
}
test('loader lock matches the reviewed Native reference and the exact candidate Electron archive', () => {
    const repo = path.resolve(__dirname, '..'), electron = JSON.parse(execFileSync('git', ['show', '162dc69f9c3438d99508c90321a889b693b6b10a:vendor/electron-runtime-manifest.json'], {cwd: repo, encoding: 'utf8'}));
    assert.equal(LOCK.referenceCommit, '6aebd6595bdb9a9a4765309f3160f9a65206b7f2'); assert.equal(LOCK.archiveSha256, electron.archive.sha256); assert.equal(LOCK.version, electron.version);
    assert.equal(LOCK.sha256, '7611034fc1bc24fa103b4c6bf923974cdec46fa506952d6f82cfef836db99fd1'); assert(!Object.hasOwn(LOCK, 'size'));
});
test('one immutable source copy is allowed and size is derived from the actual baseline row', () => {
    const f = maps(); compareInventories(f.base, f.derived, f.addition); assert.equal(f.addition.size, f.base.get(LOCK.sourcePath).size); assert.equal(f.derived.get('build-manifest.json').sha256, f.base.get('build-manifest.json').sha256);
});
for (const mutation of ['extra-file', 'missing-base', 'changed-base', 'changed-manifest', 'wrong-loader-hash', 'wrong-loader-size', 'missing-loader']) test('derived complete inventory refuses ' + mutation, () => {
    const f = maps();
    if (mutation === 'extra-file') f.derived.set('other.dll', {size: 1, sha256: sha('x')});
    if (mutation === 'missing-base') f.derived.delete('electronapp/libmpv/x64/mpv-1.dll');
    if (mutation === 'changed-base') f.derived.get('electronapp/libmpv/x64/mpv-1.dll').sha256 = sha('edited');
    if (mutation === 'changed-manifest') f.derived.get('build-manifest.json').sha256 = sha('pretend new manifest');
    if (mutation === 'wrong-loader-hash') f.derived.get(LOCK.targetPath).sha256 = sha('wrong');
    if (mutation === 'wrong-loader-size') f.derived.get(LOCK.targetPath).size++;
    if (mutation === 'missing-loader') f.derived.delete(LOCK.targetPath);
    assert.throws(() => compareInventories(f.base, f.derived, f.addition));
});
for (const mutation of ['source-missing', 'source-wrong', 'target-exists']) test('addition refuses invalid baseline: ' + mutation, () => {
    const f = maps(); if (mutation === 'source-missing') f.base.delete(LOCK.sourcePath); if (mutation === 'source-wrong') f.base.get(LOCK.sourcePath).sha256 = sha('wrong'); if (mutation === 'target-exists') f.base.set(LOCK.targetPath, {...f.base.get(LOCK.sourcePath)});
    assert.throws(() => additionFor(f.base, f.lock));
});
test('stderr summary publishes only recognized tags/numbers and never raw paths, URLs or tokens', () => {
    const raw = 'helper-fatal:dll-load-failed\nhttps://private.invalid/video?api_key=synthetic-secret\nC:\\private\\secret\nhelper-fatal:option-failed:synthetic-secret\nhelper-fatal:unrecognized-synthetic-secret\n';
    const result = summarize([Buffer.from(raw)], Buffer.byteLength(raw), {code: 23}, true);
    assert.deepEqual(result.labels, ['dll-load-failed', 'option-failed']); assert(result.unknownFatal); assert.equal(result.processExitCode, 23); assert.equal(result.systemCodeAvailable, false); assert(!JSON.stringify(result).includes('synthetic-secret')); assert(!JSON.stringify(result).includes('private'));
});
test('numeric system codes are reported only when explicitly emitted, distinct from process exit23', () => {
    const bare = summarize([Buffer.from('helper-fatal:dll-load-failed\n')], 29, {code: 23}, true); assert.deepEqual(bare.systemCodes, []);
    const extended = summarize([Buffer.from('helper-fatal:dll-load-failed:win32-126:target-file-1:absolute-1:chars-90:forward-slashes-0\n')], 90, {code: 23}, true);
    assert.deepEqual(extended.labels, ['dll-load-failed']); assert.deepEqual(extended.systemCodes, [126]); assert.equal(extended.processExitCode, 23);
});
test('diagnostics wait for actual exit and trailing stdio close before reading the stderr buffer', async () => {
    let resolveExit, resolveClose, settled = false;
    const client = {stderrChunks: [], stderrObservedBytes: 0, exitPromise: new Promise(resolve => {resolveExit = resolve;}), smokeClosePromise: new Promise(resolve => {resolveClose = resolve;})};
    const result = capture(client).then(value => {settled = true; return value;}); resolveExit({code: 23}); await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false);
    const line = Buffer.from('helper-fatal:dll-load-failed\n'); client.stderrChunks.push(line); client.stderrObservedBytes = line.length; resolveClose();
    const value = await result; assert.equal(value.streamsClosed, true); assert.deepEqual(value.labels, ['dll-load-failed']);
});
test('unconfirmed stdio close is not promoted into complete diagnostics', async () => {
    const value = await capture({exitPromise: Promise.resolve({code: 23}), smokeClosePromise: new Promise(() => {}), stderrChunks: []}, 5); assert.equal(value.streamsClosed, false);
});
function proof() {
    const baseIdentity = {sourceCommit: 'fixed-base'}, identity = {runtimeKind: 'derived-loader-trial-NOT-original-package', baseIdentity};
    const baseline = {ready: false, exit: {pid: 101, code: 1, timedOut: false, streamsClosed: true}, receipt: {pid: 101, phase: 'startup', status: 'failed', identity: baseIdentity,
        helpers: [{pid: 201, exited: true, handshake: null, diagnostics: {labels: ['dll-load-failed'], unknownFatal: false, processExitCode: 23, processSignaled: false, streamsClosed: true}}]}};
    const derived = {ready: true, exit: {pid: 102, code: 0, timedOut: false, streamsClosed: true}, receipt: {pid: 102, phase: 'startup', status: 'passed', identity,
        checks: {helperReady: true, ownedHelperExit: true}, helpers: [{pid: 202, exited: true, handshake: {protocolVersion: 1}, diagnostics: {streamsClosed: true, processExitCode: 0, processSignaled: false, processSignal: null}}]}};
    return {baseline, derived, identity};
}
test('cache acceptance requires explicit tagged baseline failure and derived actual-ready/owned-exit proof', () => {
    const f = proof(); assert(isLoaderFailure(f.baseline.receipt)); assertComparisonData(f.baseline, f.derived, f.identity);
});
for (const mutation of ['exit23-only', 'different-fatal', 'mixed-fatal', 'unknown-fatal', 'baseline-live', 'stdio-open', 'baseline-ready', 'derived-not-ready', 'derived-live', 'derived-error-code', 'derived-signal', 'electron-close-unconfirmed', 'wrong-pid', 'wrong-identity']) test('A/B gate refuses ' + mutation, () => {
    const f = proof(), before = f.baseline.receipt.helpers[0], after = f.derived.receipt.helpers[0];
    if (mutation === 'exit23-only') before.diagnostics.labels = [];
    if (mutation === 'different-fatal') before.diagnostics.labels = ['mpv-initialize-failed'];
    if (mutation === 'mixed-fatal') before.diagnostics.labels.push('mpv-initialize-failed');
    if (mutation === 'unknown-fatal') before.diagnostics.unknownFatal = true;
    if (mutation === 'baseline-live') before.exited = false;
    if (mutation === 'stdio-open') before.diagnostics.streamsClosed = false;
    if (mutation === 'baseline-ready') f.baseline.ready = true;
    if (mutation === 'derived-not-ready') f.derived.receipt.checks.helperReady = false;
    if (mutation === 'derived-live') after.exited = false;
    if (mutation === 'derived-error-code') after.diagnostics.processExitCode = 23;
    if (mutation === 'derived-signal') after.diagnostics.processSignaled = true;
    if (mutation === 'electron-close-unconfirmed') f.derived.exit.streamsClosed = false;
    if (mutation === 'wrong-pid') f.derived.exit.pid++;
    if (mutation === 'wrong-identity') f.derived.receipt.identity = {sourceCommit: 'other'};
    assert.throws(() => assertComparisonData(f.baseline, f.derived, f.identity));
});
test('new route is explicit, retains immutable c9 baseline tools and collects separate derived evidence', () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/public-ci.yml'), 'utf8'), ci = fs.readFileSync(path.resolve(__dirname, '../tools/ci-playback-range-smoke.cjs'), 'utf8');
    assert.match(workflow, /- loader-trial/); assert.match(workflow, /ref: c9cd9bacf81445c9c10befd121951b1c63c86faa/); assert.match(ci, /plan.mode === 'loader-trial'/); assert.match(ci, /loader-derivation.json/);
});
// Full sidecar orchestration with a synthetic pinned base verifier. It uses real
// files/copy/hash operations; it is not an actual fixed candidate/native run.
function imageFixture(t) {
    const os = require('node:os'), Module = require('node:module');
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-loader-image-'))); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const repo = path.join(root, 'controls'), baseTools = path.join(root, 'base-tools'), baseline = path.join(root, 'baseline');
    for (const dir of [repo, baseTools, baseline]) fs.mkdirSync(dir);
    const payload = {'build-manifest.json': Buffer.from('immutable-original-manifest'), [LOCK.sourcePath]: Buffer.from('synthetic-loader-bytes'), 'electronapp/libmpv/x64/mpv-1.dll': Buffer.from('synthetic-mpv')};
    for (const [name, body] of Object.entries(payload)) {const file = path.join(baseline, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, body);}
    const inv = require('../tools/verify-installer-runtime.cjs').inventory, original = inv(baseline), identity = {sourceCommit: 'synthetic-base-only', physicalPayload: require('../tools/playback-range-windows-smoke.cjs').physicalPayloadProof(original)};
    const lock = {...LOCK, sha256: sha(payload[LOCK.sourcePath])}, controlsCommit = 'a'.repeat(40); let verifications = 0;
    const baseVerifier = {verifyRuntime(_repo, runtime) {
        verifications++; const actual = inv(runtime); assert.deepEqual(actual, original, 'base verification never bypassed'); return identity;
    }};
    const file = path.resolve(__dirname, '../tools/playback-range-loader-trial.cjs'), mod = new Module(file, module), actualRequire = Module.createRequire(file);
    mod.filename = file; mod.paths = module.paths;
    mod.require = name => {
        if (name === './playback-range-loader-lock.json') return lock;
        if (name === path.join(baseTools, 'tools/playback-range-windows-smoke.cjs')) return baseVerifier;
        if (name === 'node:child_process') return {execFileSync(_command, args, options) {
            if (args[0] === 'rev-parse') return options.cwd === repo ? controlsCommit + '\n' : 'c9cd9bacf81445c9c10befd121951b1c63c86faa\n';
            if (args[0] === 'status') return '';
            if (args[0] === 'show') return JSON.stringify({version: LOCK.version, archive: {sha256: LOCK.archiveSha256}});
            throw Error('unexpected synthetic git request');
        }};
        return actualRequire(name);
    };
    mod._compile(fs.readFileSync(file, 'utf8'), file);
    const image = mod.exports.derive(repo, baseline, baseTools, path.join(root, 'candidate.zip'), path.join(root, 'derived'), controlsCommit);
    return {root, repo, baseline, image, api: mod.exports, controlsCommit, verifications: () => verifications};
}
test('derived sidecar performs real complete copy validation and preserves original manifest bytes', t => {
    const f = imageFixture(t), before = fs.readFileSync(path.join(f.baseline, 'build-manifest.json'));
    const result = f.api.verifyRuntime(f.repo, f.image.runtime, path.join(f.root, 'candidate.zip'), f.image.descriptor);
    assert.equal(result.runtimeKind, 'derived-loader-trial-NOT-original-package'); assert.equal(result.derivation.addition.size, Buffer.byteLength('synthetic-loader-bytes'));
    assert(fs.readFileSync(path.join(f.image.runtime, 'build-manifest.json')).equals(before)); assert(f.verifications() >= 3);
});
for (const change of ['sidecar-lock', 'sidecar-base', 'sidecar-addition', 'sidecar-proof', 'source-bytes', 'destination-bytes', 'extra-derived', 'original-manifest', 'original-base']) test('full sidecar verifier refuses ' + change, t => {
    const f = imageFixture(t), sidecar = JSON.parse(fs.readFileSync(f.image.descriptor.sidecar));
    if (change === 'sidecar-lock') sidecar.lock.sha256 = '0'.repeat(64);
    if (change === 'sidecar-base') sidecar.baseIdentity = {sourceCommit: 'different'};
    if (change === 'sidecar-addition') sidecar.addition.size++;
    if (change === 'sidecar-proof') sidecar.derivedProof.sha256 = '0'.repeat(64);
    fs.writeFileSync(f.image.descriptor.sidecar, JSON.stringify(sidecar));
    if (change === 'source-bytes') fs.appendFileSync(path.join(f.image.runtime, LOCK.sourcePath), 'changed');
    if (change === 'destination-bytes') fs.appendFileSync(path.join(f.image.runtime, LOCK.targetPath), 'changed');
    if (change === 'extra-derived') fs.writeFileSync(path.join(f.image.runtime, 'extra.dll'), 'not allowed');
    if (change === 'original-manifest') fs.appendFileSync(path.join(f.image.runtime, 'build-manifest.json'), 'cannot pretend same');
    if (change === 'original-base') fs.appendFileSync(path.join(f.baseline, 'build-manifest.json'), 'cannot bypass base');
    assert.throws(() => f.api.verifyRuntime(f.repo, f.image.runtime, path.join(f.root, 'candidate.zip'), f.image.descriptor));
});
