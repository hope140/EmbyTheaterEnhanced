'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {EventEmitter} = require('node:events');
const probe = require('../tools/playback-buffer-disk-probe.cjs');
const support = require('../tools/playback-range-windows-smoke.cjs');
function directory(t) {const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-disk-probe-test-'))); t.after(() => fs.rmSync(root, {recursive: true, force: true})); return root;}
test('finite option matrix uses experiment values without production config', t => {
    const root = directory(t);
    for (const mode of probe.MODES) {
        const opts = probe.options(mode, root);
        assert.equal(opts['cache-on-disk'], mode !== 'ram');
        assert.equal(opts['demuxer-cache-unlink-files'], mode === 'ram' ? 'whendone' : mode);
        assert.equal(opts['demuxer-max-bytes'], 1048576); assert.equal(opts['demuxer-max-back-bytes'], 524288);
    }
    assert.throws(() => probe.options('anything', root)); assert.throws(() => probe.options('no', 'relative'));
});
test('probe child has isolated profile variables without inherited GitHub tokens', t => {
    const root = directory(t), key = 'GITHUB_TOKEN', before = process.env[key]; process.env[key] = 'synthetic-do-not-forward';
    try {
        const environment = probe.childEnvironment({out: root});
        assert.equal(environment[key], undefined); assert.equal(environment.APPDATA, path.join(root, 'profile'));
        assert.equal(environment.LOCALAPPDATA, path.join(root, 'local')); assert.equal(environment.MPV_HOME, path.join(root, 'mpv'));
    } finally {if (before === undefined) delete process.env[key]; else process.env[key] = before;}
});
test('readback accepts typed mpv booleans but refuses unsupported/missing/changed options', () => {
    assert(probe.sameOption('yes', true)); assert(probe.sameOption(false, false)); assert(probe.sameOption('1048576', 1048576));
    for (const value of [null, undefined, 'unknown', 0, 'no']) assert(!probe.sameOption(value, true));
    assert(!probe.sameOption(524288, 1048576));
});
test('cache-state projection carries numeric cache facts without raw URLs or paths', () => {
    assert.deepEqual(probe.cacheState({'fw-bytes': 4, 'seekable-ranges': [{start: 1, end: 2}, {start: 'bad', end: 3}], secret: 'https://example.invalid/token'}),
        {'fw-bytes': 4, 'seekable-ranges': [{start: 1, end: 2}]});
    assert.throws(() => probe.cacheState(null)); assert.throws(() => probe.cacheState({'fw-bytes': 'unknown'}));
});
test('disk inventory records exact members and rejects non-files', t => {
    const root = directory(t); fs.writeFileSync(path.join(root, 'mpv-1.dat'), 'synthetic cache bytes');
    const row = probe.diskFiles(root); assert.equal(row.files[0].bytes, 21); assert.equal(row.files[0].sha256, support.hashFile(path.join(root, 'mpv-1.dat')));
    fs.mkdirSync(path.join(root, 'sub')); assert.throws(() => probe.diskFiles(root));
});
test('cache directory links cannot redirect probe observations', t => {
    const root = directory(t), real = path.join(root, 'real'), link = path.join(root, 'link'); fs.mkdirSync(real);
    fs.symlinkSync(real, link, 'junction'); assert.throws(() => probe.diskFiles(link));
});
test('retention observations distinguish old files and new reads without asserting restoration', () => {
    const old = {name: 'first.dat', bytes: 4, stable: true, sha256: 'a'.repeat(64)};
    const evidence = probe.retentionEvidence([{label: 'first-stopped', disk: {files: [old]}},
        {label: 'new-helper-reopen-stopped', helperPid: 3, disk: {files: [old, {...old, name: 'second.dat'}]}, sourceRequestsSinceLoad: [{bytesScheduled: 10}]}]);
    assert.equal(evidence.laterLoads[0].oldFilesUnchanged, true); assert.equal(evidence.laterLoads[0].servedBytes, 10);
    assert.deepEqual(evidence.laterLoads[0].newNames, ['second.dat']); assert.match(evidence.interpretation, /NOT_ASSESSED/);
});
test('prepare owns only a fresh external directory and source/tool hashes are enforced', t => {
    const root = directory(t), runtime = path.join(root, 'runtime'), file = path.join(root, 'source.json'); fs.mkdirSync(runtime); fs.writeFileSync(file, '{}');
    const synthetic = {runtime, identity: {synthetic: true}, fixtures: [{size: 4}]};
    const read = support.readPlan, verify = support.verifyPlanRuntime;
    support.readPlan = () => synthetic; support.verifyPlanRuntime = () => synthetic.identity;
    t.after(() => {support.readPlan = read; support.verifyPlanRuntime = verify;});
    assert.throws(() => probe.prepare(file, path.join(runtime, 'inside'), 'no'));
    const out = path.join(root, 'probe'), plan = probe.prepare(file, out, 'no');
    assert.equal(plan.scope, 'mpv-disk-options-observation-only'); assert.equal(probe.readProbe(path.join(out, 'probe.json')).plan.mode, 'no');
    assert.throws(() => probe.prepare(file, out, 'no'));
    fs.appendFileSync(file, ' '); assert.throws(() => probe.readProbe(path.join(out, 'probe.json')));
});
test('native runner always requires explicit execution', async () => {await assert.rejects(probe.run('/not-read', false), /explicit-Windows/);});
test('a live child error keeps ownership until exit and stdio close', async () => {
    const child = new EventEmitter(); child.pid = 42; let killed = 0, settled = false;
    child.kill = () => {killed++;};
    const done = probe.observeChild(child).then(row => {settled = true; return row;});
    child.emit('error', Error('synthetic transport failure')); await Promise.resolve();
    assert.equal(killed, 1); assert.equal(settled, false);
    child.emit('exit', 1, null); await Promise.resolve(); assert.equal(settled, false);
    child.emit('close', 1, null);
    assert.deepEqual(await done, {pid: 42, code: 1, signal: null, streamsClosed: true, processExited: true, spawnError: false, transportError: true});
});
test('spawn failure still waits for close and never becomes an observed process exit', async () => {
    const child = new EventEmitter(); let settled = false;
    const done = probe.observeChild(child).then(row => {settled = true; return row;});
    child.emit('error', Error('synthetic spawn failure')); await Promise.resolve(); assert.equal(settled, false);
    child.emit('close', null, null);
    const exit = await done; assert.equal(exit.spawnError, true); assert.equal(exit.processExited, false); assert.equal(exit.streamsClosed, true);
});
const normal = () => ({streamsClosed: true, processExitCode: 0, processSignaled: false, processSignal: null});
test('helper cleanup records actual closure after kill error but cannot claim a clean observation', async () => {
    const record = {}, owned = {exited: true, exitPromise: Promise.resolve({code: 0, signal: null}), child: {kill() {}}, async kill() {throw Error('synthetic kill failure');}};
    await assert.rejects(probe.collectHelperExit(owned, record, async () => normal()), /exit-unconfirmed/);
    assert.equal(record.outcome, 'EXIT_AND_CLOSE_CONFIRMED'); assert.equal(record.exited, true); assert.equal(record.cleanupError, 'kill-failed');
});
test('helper exit without stdio close remains uncertain', async () => {
    const record = {}, owned = {exited: true, exitPromise: Promise.resolve({code: 0, signal: null}), async kill() {}};
    await assert.rejects(probe.collectHelperExit(owned, record, async () => ({...normal(), streamsClosed: false})), /exit-unconfirmed/);
    assert.equal(record.outcome, 'UNCERTAIN');
});
function observations() {
    const plan = {scope: 'mpv-disk-options-observation-only', mode: 'no', out: path.resolve('synthetic-owned-root'), identity: {synthetic: true}};
    const readback = {...probe.options(plan.mode, path.join(plan.out, 'disk')), 'demuxer-cache-dir': '<isolated-disk>'};
    const report = {schema: 1, scope: plan.scope, status: 'observed', mode: plan.mode, workerPid: 50, identity: plan.identity,
        helpers: [51, 52].map(pid => ({pid, exited: true, outcome: 'EXIT_AND_CLOSE_CONFIRMED', options: {...readback}, diagnostics: normal()})),
        samples: ['first-stopped', 'same-helper-reopen-stopped', 'new-helper-reopen-stopped'].map(label => ({label}))};
    const exit = {pid: 50, code: 0, signal: null, processExited: true, streamsClosed: true, spawnError: false, transportError: false};
    return {plan, report, exit};
}
test('coordinator binds observation to worker PID, identity, readbacks and actual helper closures', () => {
    const {plan, report, exit} = observations(); assert.doesNotThrow(() => probe.validateObservations(report, plan, exit));
    const changes = [r => {r.workerPid++;}, r => {r.mode = 'ram';}, r => {r.identity = {};}, r => {r.helpers[1].pid = r.helpers[0].pid;},
        r => {r.helpers[0].diagnostics.streamsClosed = false;}, r => {r.helpers[0].diagnostics.processExitCode = 23;},
        r => {r.helpers[0].options['cache-on-disk'] = false;}, r => {r.samples.pop();}, r => {r.status = 'UNKNOWN';}];
    for (const change of changes) {const altered = structuredClone(report); change(altered); assert.throws(() => probe.validateObservations(altered, plan, exit));}
    for (const change of [{processExited: false}, {streamsClosed: false}, {transportError: true}, {code: 1}, {signal: 'SIGTERM'}]) {
        assert.throws(() => probe.validateObservations(report, plan, {...exit, ...change}));
    }
});
test('bounded observation input refuses oversized JSON before parsing', t => {
    const root = directory(t), file = path.join(root, 'observations.json'); fs.writeFileSync(file, '{}');
    assert.deepEqual(probe.boundedJson(file, 2), {}); fs.writeFileSync(file, '{"larger":true}');
    assert.throws(() => probe.boundedJson(file, 2), /json-limit/);
});
