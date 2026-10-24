'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const {spawnSync} = require('node:child_process');
const support = require('../tools/playback-range-windows-smoke.cjs');
const hidden = require('../tools/playback-range-windows-hidden.cjs');
const {createCache} = require('../src/electronapp/enhanced/playback-range-cache');
const {parseContext} = require('../src/electronapp/enhanced/playback-range-session');
async function temporary(t) {
    const dir = fs.realpathSync(await fsp.mkdtemp(path.join(os.tmpdir(), 'ete-hidden-prep-')));
    if (t) t.after(() => fsp.rm(dir, {recursive: true, force: true})); return dir;
}
function zip(body, method = 8, flags = 0) {
    const name = Buffer.from('candidate.exe.provenance.json'), raw = Buffer.from(body), packed = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28);
    const offset = local.length + name.length + packed.length, end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([local, name, packed, central, name, end]);
}
for (const method of [0, 8]) test('bounded ZIP provenance reader accepts archived JSON, method ' + method, async t => {
    const dir = await temporary(t), file = path.join(dir, 'artifact.zip'), body = {sourceCommit: support.CANDIDATE.commit, runtimeManifestSha256: 'a'.repeat(64)};
    fs.writeFileSync(file, zip(JSON.stringify(body), method)); assert.deepEqual(support.zipReceipts(file), [body]);
});
for (const [label, value] of [['encrypted', zip('{}', 8, 1)], ['unsupported codec', zip('{}', 9)], ['oversized', zip(' '.repeat(65537))], ['truncated', Buffer.from('PK')]]) test('ZIP reader refuses ' + label, async t => {
    const dir = await temporary(t), file = path.join(dir, 'bad.zip'); fs.writeFileSync(file, value); assert.throws(() => support.zipReceipts(file));
});
test('source/package gate fails before creating an output or starting any program', async t => {
    const dir = await temporary(t), artifact = path.join(dir, 'artifact.zip'), out = path.join(dir, 'not-created'); fs.writeFileSync(artifact, zip('{}'));
    assert.throws(() => support.prepare({repo: path.resolve(__dirname, '..'), runtime: dir, zip: artifact, out}), /candidate-zip-identity/); assert(!fs.existsSync(out));
});
test('pure generated AVI is deterministic, indexed, partial-cache sized and contains two distinct video fixtures', async t => {
    const dir = await temporary(t), a = support.avi(path.join(dir, 'A.avi'), 'A', 4), b = support.avi(path.join(dir, 'B.avi'), 'B', 4);
    const copy = support.avi(path.join(dir, 'same.avi'), 'A', 4); assert.equal(copy.sha256, a.sha256); assert.notEqual(a.sha256, b.sha256);
    const bytes = fs.readFileSync(path.join(dir, a.file)); assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.readUInt32LE(4), bytes.length - 8);
    assert.equal(bytes.toString('ascii', 8, 12), 'AVI '); assert(bytes.includes(Buffer.from('idx1'))); assert(a.size > 262144); assert.equal(a.etag, '"' + a.sha256 + '"');
    assert.throws(() => support.avi(path.join(dir, 'C.avi'), 'A', 193), /fixture-arguments/); assert(!fs.existsSync(path.join(dir, 'C.avi')));
});
test('child environment isolates profiles/temp and removes inherited proxy and Node injection switches without mutating the parent', () => {
    const original = {APPDATA: 'ordinary', LOCALAPPDATA: 'ordinary', MPV_HOME: 'ordinary', TEMP: 'ordinary', TMP: 'ordinary', PATH: 'system',
        HTTP_PROXY: 'sensitive', https_proxy: 'sensitive', ALL_PROXY: 'sensitive', no_proxy: 'ordinary', NODE_OPTIONS: '--require=ordinary.js', ELECTRON_RUN_AS_NODE: '1', NODE_USE_ENV_PROXY: '1'};
    const out = path.resolve('owned'), child = support.childEnvironment({out}, original);
    assert.equal(child.APPDATA, path.join(out, 'profile')); assert.equal(child.MPV_HOME, path.join(out, 'profile', 'mpv')); assert.equal(child.TMP, path.join(out, 'tmp'));
    assert.equal(child.LOCALAPPDATA, path.join(out, 'profile', 'local')); assert.equal(child.PATH, 'system'); assert.equal(child.NO_PROXY, '127.0.0.1,localhost');
    for (const key of ['HTTP_PROXY', 'https_proxy', 'ALL_PROXY', 'NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE', 'NODE_USE_ENV_PROXY']) assert(!Object.hasOwn(child, key));
    assert.equal(original.APPDATA, 'ordinary'); assert.equal(original.NODE_OPTIONS, '--require=ordinary.js');
});
test('hidden window guard refuses visibility/focus operations and a pre-visible window', () => {
    const w = hidden.protectHiddenWindow({isVisible: () => false});
    for (const method of ['show', 'showInactive', 'focus']) assert.throws(() => w[method](), /visible-window-operation-forbidden/);
    assert.throws(() => hidden.protectHiddenWindow({isVisible: () => true}), /visible-window-forbidden/);
});
test('explicit Windows run is never entered by preparation/import or a Node invocation without the execution flag', async t => {
    const dir = await temporary(t), driver = path.resolve(__dirname, '../tools/playback-range-windows-smoke.cjs'), runner = path.resolve(__dirname, '../tools/playback-range-windows-hidden.cjs');
    assert.deepEqual(support.argumentsOf(['--out=space here', '--execute-hidden-native'], ['--out', '--execute-hidden-native']), {'--out': 'space here', '--execute-hidden-native': true});
    assert.throws(() => support.argumentsOf(['--out=a', '--out=b'], ['--out']), /duplicate/);
    await assert.rejects(support.run(path.join(dir, 'absent.json'), false), /explicit-Windows/);
    const result = spawnSync(process.execPath, [runner, '--execute-hidden-native', '--plan=' + path.join(dir, 'absent.json'), '--phase=populate'], {encoding: 'utf8', windowsHide: true});
    assert.notEqual(result.status, 0); assert.match(result.stderr, /explicit-fixed-Windows-Electron-required/); assert.deepEqual(fs.readdirSync(dir), []);
    const usage = spawnSync(process.execPath, [driver], {encoding: 'utf8', windowsHide: true}); assert.notEqual(usage.status, 0); assert.match(usage.stderr, /Usage/);
});
test('fixture HTTP + real range cache verifies partial bytes, reopen hit, preparation retention, actual replacement and physical cancellation without a helper claim', {timeout: 15000}, async t => {
    const dir = await temporary(null), fixtures = [support.avi(path.join(dir, 'A.avi'), 'A', 4), support.avi(path.join(dir, 'B.avi'), 'B', 4)];
    const origin = await hidden.fixtureServer({out: dir, fixtures}), config = {root: path.join(dir, 'cache'), maxBytes: 262144, minFreeBytes: 0, timeoutMs: 1000};
    let cache, a, b;
    t.after(async () => {try {if (a) await a.stop(); if (b) await b.stop(); if (cache) await cache.close();} finally {await origin.close(); await fsp.rm(dir, {recursive: true, force: true});}});
    function input(item) {const source = origin.origin + '/Videos/' + item + '/stream.avi?Static=true'; return {source, isCurrent: () => true, identity: parseContext({source, serverOrigin: origin.origin,
        serverId: 'fixture', accountId: 'anonymous', itemId: item, mediaSourceId: item, playSessionId: 'fixture', mode: 'DirectPlay', mediaType: 'Video', container: 'avi'}).identity};}
    cache = await createCache(config); a = await cache.open(input('A'));
    const data = Buffer.from(await (await fetch(a.source, {headers: {Range: 'bytes=0-63'}})).arrayBuffer()); assert.deepEqual(data, fs.readFileSync(path.join(dir, 'A.avi')).subarray(0, 64));
    await a.markPlaying(); await a.stop(); a = null; await cache.close(); cache = null;
    const before = hidden.cacheSnapshot(config.root, config.maxBytes), keyA = before.index.lastKey; assert(before.bytes < fixtures[0].size); assert(before.index.entries[keyA].blocks['0']);
    cache = await createCache(config); const count = origin.rows.length; a = await cache.open(input('A'));
    await (await fetch(a.source, {headers: {Range: 'bytes=0-63'}})).arrayBuffer(); assert.equal(origin.rows.length, count + 1, 'fresh probe only after real store reopen');
    b = await cache.open(input('B')); assert.equal(hidden.cacheSnapshot(config.root, config.maxBytes).index.lastKey, keyA, 'preparation is not actual playback');
    await a.stop(); a = null; await b.markPlaying(); assert(!hidden.cacheSnapshot(config.root, config.maxBytes).index.entries[keyA]);
    origin.hold(row => row.item === 'B' && row.end > row.start); const abort = new AbortController();
    const pending = fetch(b.source, {headers: {Range: 'bytes=262144-262159'}, signal: abort.signal}); pending.catch(() => {});
    for (let i = 0; !origin.held() && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 5)); assert(origin.held());
    abort.abort(); await assert.rejects(pending); await b.stop(); b = null; await origin.held().close;
    origin.held().release(); assert.equal(origin.held().row.bytesScheduled, 0); assert(origin.held().row.closed);
});
test('loopback origin refuses sensitive headers and reports invalid or out-of-bounds ranges precisely', async t => {
    const dir = await temporary(null), proof = support.avi(path.join(dir, 'A.avi'), 'A', 1), origin = await hidden.fixtureServer({out: dir, fixtures: [proof]}); t.after(async () => {await origin.close(); await fsp.rm(dir, {recursive: true, force: true});});
    const url = origin.origin + '/Videos/A/stream.avi';
    for (const name of ['Authorization', 'Cookie', 'X-Emby-Token']) {const r = await fetch(url, {headers: {[name]: 'synthetic-unexpected'}}); assert.equal(r.status, 403); await r.arrayBuffer();}
    const invalid = await fetch(url, {headers: {Range: 'bytes=' + proof.size + '-'}}); assert.equal(invalid.status, 416); assert.equal(invalid.headers.get('content-range'), 'bytes */' + proof.size); await invalid.arrayBuffer();
    const mismatch = await fetch(url, {headers: {Range: 'bytes=0-1', 'If-Match': '"other"'}}); assert.equal(mismatch.status, 412); await mismatch.arrayBuffer();
    const exact = await fetch(url, {headers: {Range: 'bytes=0-1', 'If-Match': proof.etag}}); assert.equal(exact.status, 206); assert.equal((await exact.arrayBuffer()).byteLength, 2);
});
async function ownedPlan(t) {
    const out = await temporary(t), profile = path.join(out, 'profile'); fs.mkdirSync(profile); fs.mkdirSync(path.join(out, 'tmp'));
    fs.writeFileSync(path.join(out, 'owner'), 'ETE hidden range smoke v1\n'); fs.writeFileSync(path.join(profile, 'ete-range-cache-trial-owner'), 'ETE range trial v1\n');
    fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(support.LIMITS));
    const harness = path.resolve(__dirname, '../tools/playback-range-windows-hidden.cjs'), driver = path.resolve(__dirname, '../tools/playback-range-windows-smoke.cjs');
    const plan = {schema: 1, out, candidate: support.CANDIDATE, limits: support.LIMITS, phases: ['populate', 'reopen'], harness, harnessSha256: support.hashFile(harness), driver, driverSha256: support.hashFile(driver),
        fixtures: [support.avi(path.join(out, 'A.avi'), 'A', 1), support.avi(path.join(out, 'B.avi'), 'B', 1)]};
    const file = path.join(out, 'plan.json'); fs.writeFileSync(file, JSON.stringify(plan)); return {plan, file, profile};
}
test('owned plan accepts physical private roots and pinned utility/fixture bytes', async t => {
    const {file, plan} = await ownedPlan(t); assert.deepEqual(support.readPlan(file), plan);
});
for (const mutation of ['config', 'fixture', 'owner', 'driver', 'duplicate-fixture']) test('owned plan refuses changed ' + mutation + ' before Electron startup', async t => {
    const {file, plan, profile} = await ownedPlan(t);
    if (mutation === 'config') fs.writeFileSync(path.join(plan.out, 'config.json'), JSON.stringify({...support.LIMITS, maxBytes: 1024 * 1024 * 1024}));
    if (mutation === 'fixture') fs.appendFileSync(path.join(plan.out, 'A.avi'), 'changed');
    if (mutation === 'owner') fs.writeFileSync(path.join(profile, 'ete-range-cache-trial-owner'), 'ordinary-profile');
    if (mutation === 'driver') {plan.driverSha256 = 'a'.repeat(64); fs.writeFileSync(file, JSON.stringify(plan));}
    if (mutation === 'duplicate-fixture') {plan.fixtures[1] = plan.fixtures[0]; fs.writeFileSync(file, JSON.stringify(plan));}
    assert.throws(() => support.readPlan(file)); assert(!fs.existsSync(path.join(plan.out, 'populate.json'))); assert(!fs.existsSync(path.join(profile, 'electron')));
});
