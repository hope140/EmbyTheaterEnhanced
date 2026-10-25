'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), {EventEmitter} = require('node:events');
const {create, OWNER} = require('../tools/playback-retention-export-binding.cjs');
const template = require('./fixtures/retention-core-map-v1.json').cases.find(c => c.case === 'raw-nut').report;
const deferred = () => {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};};
function fixture(t) {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-export-binding-'))), root = path.join(base, 'exports');fs.mkdirSync(root);fs.writeFileSync(path.join(root, 'owner'), OWNER);
    t.after(() => fs.rmSync(base, {recursive: true, force: true}));
    const source = 'http://fixture.invalid/owned', controller = new AbortController(), calls = [], client = {currentGenerationId: 41, helperInstanceId: 'owned-helper', child: new EventEmitter(), state: {fileLoaded: true, path: source},
        async getProperty(name) {return {path: source, pause: true, 'cache-on-disk': false, 'demuxer-cache-state': {idle: true, 'total-bytes': 4096, 'seekable-ranges': [{start: 0, end: 8}]}, 'cache-export-report': {schema: 1}}[name];},
        command(method, params, generation) {calls.push({method, params, generation});fs.writeFileSync(params.args[3], Buffer.alloc(32, 7));},
        async request(method, params, options) {assert.equal(method, 'get-property');assert.equal(options.mediaScoped, false);const report = structuredClone(template);report['export-id'] = Number(calls.at(-1).params.args[4]);return {value: report};},
        stop() {throw Error('must-not-stop-any-playback');}};
    const binding = create({client, source, root, signal: controller.signal});t.after(() => binding.retire());
    return {base, root, source, controller, calls, client, binding, run: () => binding.exportWindow({start: 2.3, end: 4.8, format: 'nut'})};
}
test('bounded export keeps one unverified file until release and uses actual source/generation plus physical barrier', async t => {
    const f = fixture(t), first = await f.run();assert.equal(first.state, 'exported-unverified');assert.equal(first.generationId, 41);assert.equal(first.helperInstanceId, 'owned-helper');assert.equal(first.bytes, 32);
    first.assertCurrent();assert.equal((await f.run()).state, 'unavailable');assert.equal(f.calls.length, 1);assert.equal(f.calls[0].params.args[0], 'dump-cache-report');
    await first.dispose();const second = await f.run();assert.equal(second.exportId, 2);await second.dispose();assert.deepEqual(fs.readdirSync(f.root), ['owner']);
    f.binding.retire();assert.equal(f.client.child.listenerCount('close'), 0);
});
test('old core or mismatched actual source performs no dump and safely leaves ordinary playback alone', async t => {
    for (const mode of ['old-core', 'wrong-path']) {
        const f = fixture(t), original = f.client.getProperty;
        f.client.getProperty = async name => {if (mode === 'old-core' && name === 'cache-export-report') throw Error('property-unavailable');if (mode === 'wrong-path' && name === 'path') return 'other';return original(name);};
        const r = await f.run();assert.equal(r.state, 'unavailable');assert.equal(r.cleanupPending, false);assert.equal(f.calls.length, 0);assert.deepEqual(fs.readdirSync(f.root), ['owner']);
    }
});
test('cancellation during export waits the ordered reply before deleting, and never accepts its late report', async t => {
    const f = fixture(t), gate = deferred(), normal = f.client.request;f.client.request = async (...args) => {await gate.promise;return normal(...args);};
    const running = f.run();while (!f.calls.length) await new Promise(resolve => setImmediate(resolve));
    f.controller.abort();assert.equal(fs.readdirSync(f.root).length, 2);gate.resolve();const r = await running;
    assert.equal(r.state, 'unavailable');assert.equal(r.reason, 'retired');assert.equal(r.cleanupPending, false);assert.deepEqual(fs.readdirSync(f.root), ['owner']);
});
test('timed-out physical completion blocks more exports and file deletion until the owned child closes', async t => {
    const f = fixture(t);f.client.request = async () => {throw Error('TIMED_OUT');};
    const r = await f.run();assert.equal(r.cleanupPending, true);assert.equal((await f.run()).state, 'unavailable');assert.equal(f.calls.length, 1);assert.equal((await r.dispose()).cleanupPending, true);
    f.client.child.emit('close');assert.equal((await r.dispose()).cleanupPending, false);assert.deepEqual(fs.readdirSync(f.root), ['owner']);
});
test('returned clip cannot publish after generation replacement, and its active inspector protects deletion', async t => {
    const f = fixture(t), r = await f.run(), gate = deferred(), inspecting = r.verifyClip(async () => {await gate.promise;return {verified: true};});
    assert.equal((await r.dispose()).cleanupPending, true);f.client.currentGenerationId = 42;gate.resolve();await assert.rejects(inspecting, /retention-export-retired/);
    assert.throws(r.assertCurrent, /retention-export-retired/);await r.dispose();assert.deepEqual(fs.readdirSync(f.root), ['owner']);
});
test('unreleased cleanup failure retains the slot and cannot erase a changed owner', async t => {
    const f = fixture(t), r = await f.run(), marker = path.join(f.root, 'owner'), saved = path.join(f.base, 'saved-owner');
    fs.renameSync(marker, saved);fs.writeFileSync(marker, OWNER);await assert.rejects(r.dispose(), /retention-export-owner/);assert.equal((await f.run()).state, 'unavailable');assert.equal(f.calls.length, 1);
    fs.unlinkSync(marker);fs.renameSync(saved, marker);await r.dispose();assert.deepEqual(fs.readdirSync(f.root), ['owner']);
});
test('changed export content is rejected even with the original file identity and length', async t => {
    const f = fixture(t), r = await f.run();fs.writeFileSync(r.path, Buffer.alloc(32, 8));assert.throws(r.assertCurrent, /retention-export-owner/);await r.dispose();
});
test('fstat failure closes the newly opened fd and does not permit accumulated retries', async t => {
    const f = fixture(t), open = fs.openSync, close = fs.closeSync, stat = fs.fstatSync, active = new Set();
    fs.openSync = (...args) => {const fd = open(...args);active.add(fd);return fd;};fs.closeSync = fd => {active.delete(fd);return close(fd);};fs.fstatSync = () => {throw Error('fixture-fstat-failure');};
    try {const r = await f.run();assert.equal(r.state, 'unavailable');assert.equal(r.cleanupPending, true);assert.equal(active.size, 0);assert.equal((await f.run()).state, 'unavailable');}
    finally {fs.openSync = open;fs.closeSync = close;fs.fstatSync = stat;}
});
test('a failed export with foreign owner cleanup pending still blocks accumulation', async t => {
    const f = fixture(t), original = f.client.request, marker = path.join(f.root, 'owner'), saved = path.join(f.base, 'owner-before');
    f.client.request = async (...args) => {const value = await original(...args);fs.renameSync(marker, saved);fs.writeFileSync(marker, OWNER);return value;};
    const r = await f.run();assert.equal(r.state, 'unavailable');assert.equal(r.cleanupPending, true);assert.equal((await f.run()).state, 'unavailable');assert.equal(f.calls.length, 1);
    fs.unlinkSync(marker);fs.renameSync(saved, marker);await r.dispose();assert.deepEqual(fs.readdirSync(f.root), ['owner']);
});
test('a previous successful report cannot be returned for a later export id', async t => {
    const f = fixture(t), first = await f.run();await first.dispose();
    f.client.request = async () => ({value: structuredClone(template)});
    const r = await f.run();assert.equal(r.state, 'unavailable');assert.equal(r.cleanupPending, false);assert.deepEqual(fs.readdirSync(f.root), ['owner']);
});
test('output above the observed original buffer byte bound is discarded without a second cache quota', async t => {
    const f = fixture(t), original = f.client.getProperty;
    f.client.getProperty = async name => name === 'demuxer-cache-state' ? {idle: true, 'total-bytes': 16, 'seekable-ranges': [{start: 0, end: 8}]} : original(name);
    const r = await f.run();assert.equal(r.state, 'unavailable');assert.equal(r.cleanupPending, false);assert.deepEqual(fs.readdirSync(f.root), ['owner']);
});
test('aborting a binding without an export removes its child listener', t => {
    const f = fixture(t);assert.equal(f.client.child.listenerCount('close'), 1);f.controller.abort();assert.equal(f.client.child.listenerCount('close'), 0);
});
test('a previously aborted signal is rejected before attaching any child listener', t => {
    const f = fixture(t);f.binding.retire();f.controller.abort();assert.equal(f.client.child.listenerCount('close'), 0);
    assert.throws(() => create({client: f.client, source: f.source, root: f.root, signal: f.controller.signal}), /retention-export-retired/);
    assert.equal(f.client.child.listenerCount('close'), 0);assert.deepEqual(fs.readdirSync(f.root), ['owner']);
});
