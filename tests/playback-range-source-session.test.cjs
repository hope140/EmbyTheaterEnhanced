'use strict';
// Real loopback HTTP, authority, both stores and budget reader. Helper/clock
// are synthetic: these ownership cases do not assert a cold filesystem SLA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {EventEmitter} = require('node:events');
const {createRequire} = require('node:module');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {createAuthority} = require('../src/electronapp/enhanced/preload-source-authority');
const {createStore} = require('../src/electronapp/enhanced/shared-playback-cache/store');
const {createSourceSession} = require('../src/electronapp/enhanced/playback-range-source-session');
const {createBudgetReader} = require('../src/electronapp/native-helper/shared-cache-budget');
const BLOCK = 262144;
function gate() {let release; const promise = new Promise(resolve => {release = resolve;}); return {release, promise};}
async function waitFor(check) {for (let n = 0; n < 1000; n++) {if (check()) return; await new Promise(resolve => setTimeout(resolve, 2));} assert.fail('owned fixture condition did not settle');}
function functionalSession(options) {
    const filename = require.resolve('../src/electronapp/enhanced/playback-range-session');
    const source = readFileSync(filename, 'utf8'), module = {exports: {}};
    assert.match(source, /const SHARED_PREPARE_TIMEOUT_MS = 50;/);
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', source)(createRequire(filename), module, module.exports,
        (_callback, ms) => {assert.equal(ms, 50); return {};}, () => {});
    return module.exports.createSession({...options, now: () => 0});
}
async function fixture(t, options = {}) {
    const root = temporaryRoot('ete-source-aware-', ['legacy', 'shared']), requests = [], sockets = new Set(), totalBytes = options.bytes || BLOCK;
    const server = http.createServer((req, res) => {
        const item = new URL(req.url, 'http://127.0.0.1').pathname.slice(1, 2), match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        const start = match ? Number(match[1]) : 0, end = match ? Number(match[2]) : totalBytes - 1;
        requests.push({item, start, end});
        res.writeHead(206, {'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${totalBytes}`, ETag: '"' + item + '-v1"'});
        res.end(Buffer.alloc(end - start + 1, item.charCodeAt(0)));
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const authority = createAuthority(), web = new EventEmitter(); web.isDestroyed = () => false;
    const principal = authority.principalFor(web), propertyReads = [], helper = {currentGenerationId: 1};
    helper.getProperty = async (...args) => {propertyReads.push(args); return options.budgetBytes || BLOCK;};
    const budget = createBudgetReader((owned, generation) => owned === helper && generation === helper.currentGenerationId);
    const config = {kind: 'source-aware', root: path.join(root, 'legacy'), sharedRoot: path.join(root, 'shared'), preloadMB: 100, progressPercent: 70, timeoutMs: 1000};
    let cleanupCreates = 0, cleanupCloses = 0;
    const makeSession = () => createSourceSession({config, readCurrentBytes: async (...args) => {
        if (options.budgetGate) await options.budgetGate.promise;
        return budget.read(...args);
    }, authorize(value, role, signal) {
        const prefix = 'g' + helper.currentGenerationId;
        return authority.bind({principal, source: value.source, sourceProof: value.sourceProof, signal,
            ...(role === 'current' ? {requestId: prefix} : {requestPrefix: prefix + '-next-'})});
    }}, {createSession: functionalSession, async createStore(value) {
        cleanupCreates++;
        if (options.cleanupGate) await options.cleanupGate.promise;
        const store = await createStore(value);
        const close = store.close;
        store.close = async () => {await close(); cleanupCloses++; if (options.failClose) throw Error('synthetic-owned-close-failure');};
        return store;
    }});
    let session = makeSession();
    t.after(async () => {
        if (options.budgetGate) options.budgetGate.release(); if (options.cleanupGate) options.cleanupGate.release();
        if (options.failClose) await assert.rejects(session.close(), /synthetic-owned-close-failure/); else await session.close(); authority.close();
        for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
        await fs.rm(root, {recursive: true, force: true});
    });
    function context(item, proof = false) {
        const source = origin + '/' + item + '.mkv?Static=true';
        return {source, serverOrigin: origin, serverId: 'server', accountId: 'account', itemId: item, mediaSourceId: 'media-' + item,
            playSessionId: 'play', mode: 'DirectPlay', mediaType: 'Video', container: 'mkv',
            ...(proof ? {sourceProof: authority.issue({principal, source, requestId: 'g' + helper.currentGenerationId + (proof === 'next' ? '-next-1' : ''),
                sourceKind: 'direct-url', resourceKey: 'resource-' + item, expectedSize: totalBytes})} : {})};
    }
    async function bind(value) {await session.setContext(value, helper, helper.currentGenerationId); return session.select(value.source, helper, helper.currentGenerationId, ['loadfile', value.source]);}
    async function read(selected, item) {
        const response = await fetch(selected.source, {headers: {Range: 'bytes=0-' + (totalBytes - 1)}});
        assert.equal(response.status, 206); assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.alloc(totalBytes, item.charCodeAt(0)));
    }
    return {get session() {return session;}, helper, config, origin, requests, context, bind, read, budget, propertyReads,
        async reopen() {await session.close(); helper.currentGenerationId++; budget.retire(); session = makeSession();},
        nextGeneration() {helper.currentGenerationId++; budget.retire();}, get cleanupCreates() {return cleanupCreates;}, get cleanupCloses() {return cleanupCloses;}};
}

test('ordinary proofless playback preserves legacy next preload without creating a shared root or reading its budget', {timeout:10000}, async t => {
    const f = await fixture(t); assert.equal(f.session.status().timeoutMs, 1000, 'pre-context endpoint retains the original renderer metadata deadline');
    assert.equal(f.session.status().diskBytes, null, 'uninspected persisted bytes are not measured zero');
    const a = f.context('A'), selected = await f.bind(a); assert(selected);
    await f.read(selected, 'A'); await f.session.started(f.helper, 1);
    const next = await f.session.preload(f.context('B'), f.helper, 1);
    assert.equal(next.state, 'ready'); assert.equal(next.bytes, BLOCK); assert.equal(f.session.status().kind, 'next-prefix');
    assert.equal(f.session.status().sharedRetainedBytes, 0); assert.equal(f.cleanupCreates, 0); assert.equal(f.propertyReads.length, 0);
    await assert.rejects(fs.lstat(f.config.sharedRoot), {code: 'ENOENT'});
    f.nextGeneration(); const before = f.requests.length, b = await f.bind(f.context('B')); assert(b);
    await f.read(b, 'B'); await f.session.started(f.helper, 2);
    assert(f.requests.slice(before).every(row => row.start === 0 && row.end === 0), 'natural next revalidates without repeated legacy body');
});

test('branded playback uses shared; invalid supplied proof never falls back to legacy', {timeout:10000}, async t => {
    const f = await fixture(t), a = await f.bind(f.context('A', true)); assert(a); await f.read(a, 'A'); await f.session.started(f.helper, 1);
    assert.equal(f.session.status().kind, 'shared-byte-trial'); await waitFor(() => f.session.status().diskBytes === BLOCK);
    await assert.rejects(fs.lstat(f.config.root), {code: 'ENOENT'});
    f.nextGeneration(); const bad = {...f.context('B'), sourceProof: 'invalid-proof'}, before = f.requests.length;
    assert.equal(await f.bind(bad), null); await f.session.started(f.helper, 2);
    assert.equal(f.session.status().kind, 'shared-byte-trial'); assert.equal(f.session.status().current.route, 'original');
    assert.equal(f.requests.length, before); await assert.rejects(fs.lstat(f.config.root), {code: 'ENOENT'});
});

test('renderer range-context(null) retirement preserves shared next for a newly authorized natural Play', {timeout:10000}, async t => {
    const f = await fixture(t), a = await f.bind(f.context('A', true)); await f.read(a, 'A'); await f.session.started(f.helper, 1);
    assert.equal((await f.session.preload(f.context('B', 'next'), f.helper, 1)).state, 'ready');
    await f.session.setContext(null, f.helper, 1);
    assert.equal(f.session.status().kind, 'shared-byte-trial'); assert.equal(f.session.status().current.route, 'idle');
    assert.equal(f.session.status().diskBytes, 2 * BLOCK); await assert.rejects(fs.lstat(f.config.root), {code: 'ENOENT'});
    f.nextGeneration(); const before = f.requests.length, b = await f.bind(f.context('B', true)); assert(b);
    await f.read(b, 'B'); await f.session.started(f.helper, 2);
    assert(f.requests.slice(before).every(row => row.item === 'B' && row.start === 0 && row.end === 0), 'retired renderer must not destroy B and cause repeated body');
});

test('shared A stays until legacy B actually starts; cleanup finishes before the sole legacy P is admitted', {timeout:10000}, async t => {
    const hold = gate(), f = await fixture(t, {cleanupGate: hold}); t.after(hold.release);
    const a = await f.bind(f.context('A', true)); await f.read(a, 'A'); await f.session.started(f.helper, 1);
    f.nextGeneration(); const b = await f.bind(f.context('B')); assert(b);
    assert.equal(f.session.status().sharedRetainedBytes, BLOCK, 'preparing legacy B preserves actual A');
    const starting = f.session.started(f.helper, 2); await waitFor(() => f.cleanupCreates === 1);
    const before = f.requests.length, next = f.session.preload(f.context('C'), f.helper, 2);
    await new Promise(resolve => setImmediate(resolve)); assert.equal(f.requests.length, before, 'no second P while cleanup is pending');
    hold.release(); await starting; assert.equal((await next).state, 'ready'); assert.equal(f.cleanupCloses, 1);
    assert.equal(f.session.status().sharedRetainedBytes, 0); assert.equal(f.session.status().legacyDiskBytes, BLOCK);
    assert.equal(f.session.status().diskBytes, BLOCK);
    f.nextGeneration(); const c = await f.bind(f.context('C', true)); assert(c);
    assert.equal(f.session.status().kind, 'shared-byte-trial');
    assert.deepEqual((await fs.readdir(f.config.root)).sort(), ['owner'], 'switching to shared closes the legacy P first');
});

test('new session legacy playback restores persisted shared actual, preserves same-media M, then clears a different actual', {timeout:10000}, async t => {
    const f = await fixture(t), a = await f.bind(f.context('A', true)); await f.read(a, 'A'); await f.session.started(f.helper, 1);
    await f.reopen(); await f.bind(f.context('A')); await f.session.started(f.helper, 2);
    assert.equal(f.session.status().sharedRetainedBytes, BLOCK); assert.throws(() => f.budget.beforeWrite(), /budget-in-use/);
    assert.equal((await f.session.preload(f.context('B'), f.helper, 2)).state, 'ready');
    assert.equal(f.session.status().diskBytes, 2 * BLOCK, 'retained M plus one legacy P');
    f.nextGeneration(); await f.bind(f.context('B')); await f.session.started(f.helper, 3);
    assert.equal(f.session.status().sharedRetainedBytes, 0);
});

test('cancel during real budget wait prevents a late legacy preload and joins maintenance on retirement', {timeout:10000}, async t => {
    const f = await fixture(t), a = await f.bind(f.context('A', true)); await f.read(a, 'A'); await f.session.started(f.helper, 1);
    f.nextGeneration(); await f.bind(f.context('B'));
    const hold = gate(); let entered = false; f.helper.getProperty = async () => {entered = true; await hold.promise; return BLOCK;}; t.after(hold.release);
    const starting = f.session.started(f.helper, 2), next = f.session.preload(f.context('C'), f.helper, 2), before = f.requests.length;
    await waitFor(() => entered); await f.session.cancelNext(); f.budget.retire(); const retiring = f.session.retire(); hold.release();
    await assert.rejects(starting, /budget-unavailable/); await retiring;
    assert.equal((await next).state, 'cancelled'); assert.equal(f.requests.length, before); assert.equal(f.cleanupCreates, 0);
});

test('next stays on its current Play engine; later branded Play closes legacy P before shared admission', {timeout:10000}, async t => {
    const f = await fixture(t); await f.bind(f.context('A')); await f.session.started(f.helper, 1);
    assert.equal((await f.session.preload(f.context('B', 'next'), f.helper, 1)).state, 'ready');
    assert.equal(f.session.status().kind, 'next-prefix'); assert.equal(f.propertyReads.length, 0);
    await assert.rejects(fs.lstat(f.config.sharedRoot), {code: 'ENOENT'});
    f.nextGeneration(); assert(await f.bind(f.context('B', true)));
    assert.deepEqual(await fs.readdir(f.config.root), ['owner']); assert.equal(f.session.status().kind, 'shared-byte-trial');
});

test('repeated retirement and a new shared context join the independent maintenance barrier', {timeout:10000}, async t => {
    const hold = gate(), f = await fixture(t, {cleanupGate: hold}); t.after(hold.release);
    const a = await f.bind(f.context('A', true)); await f.read(a, 'A'); await f.session.started(f.helper, 1);
    f.nextGeneration(); await f.bind(f.context('B')); const starting = f.session.started(f.helper, 2);
    await waitFor(() => f.cleanupCreates === 1);
    const first = f.session.setContext(null, f.helper, 2); f.budget.retire();
    let secondDone = false, selectedDone = false;
    const second = f.session.retire().then(() => {secondDone = true;});
    f.nextGeneration(); const before = f.requests.length, selecting = f.bind(f.context('C', true)).then(value => {selectedDone = true; return value;});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(secondDone, false); assert.equal(selectedDone, false); assert.equal(f.requests.length, before);
    hold.release(); await starting; await first; await second; assert(await selecting); assert.equal(f.cleanupCloses, 1);
});

test('restored same-media M is trimmed to its new actual budget before admitting legacy P', {timeout:10000}, async t => {
    const f = await fixture(t, {bytes: 2 * BLOCK});
    // Recovery input is an explicitly seeded real store, not a best-effort
    // foreground tap whose optional writes may legitimately be dropped.
    const seed = await createStore({root: f.config.sharedRoot, currentBytes: 2 * BLOCK, nextBytes: 100 * 1048576});
    try {
        const identity = require('../src/electronapp/enhanced/shared-playback-cache/adapter').uncachedIdentity(f.context('A'));
        const key = await seed.open(identity, {total: 2 * BLOCK, etag: '"A-v1"'}, 'current'); await seed.actual(key);
        assert.equal(await seed.put(key, 0, Buffer.alloc(BLOCK, 65)), true);
        assert.equal(await seed.put(key, BLOCK, Buffer.alloc(BLOCK, 65)), true); assert.equal(seed.status().current, 2 * BLOCK);
    } finally {await seed.close();}
    await f.bind(f.context('A')); await f.session.started(f.helper, 1);
    assert.equal(f.session.status().sharedRetainedBytes, BLOCK);
    assert.equal((await f.session.preload(f.context('B'), f.helper, 1)).state, 'ready');
    assert.equal(f.session.status().diskBytes, 3 * BLOCK); assert(f.session.status().diskBytes <= BLOCK + 100 * 1048576);
});

test('invalid actual budget refuses maintenance and legacy P without interfering with current playback', {timeout:10000}, async t => {
    const f = await fixture(t), a = await f.bind(f.context('A', true)); await f.read(a, 'A'); await f.session.started(f.helper, 1);
    f.nextGeneration(); f.helper.getProperty = async () => 1;
    const b = await f.bind(f.context('B')); assert(b); await f.read(b, 'B');
    await assert.rejects(f.session.started(f.helper, 2), /budget-unavailable/);
    const before = f.requests.length; assert.equal((await f.session.preload(f.context('C'), f.helper, 2)).state, 'unavailable');
    assert.equal(f.requests.length, before); assert.equal(f.cleanupCreates, 0);
});

test('maintenance close failure permanently blocks later cache admission while normal original playback remains available', {timeout:10000}, async t => {
    const f = await fixture(t, {failClose: true}), a = await f.bind(f.context('A', true)); await f.read(a, 'A'); await f.session.started(f.helper, 1);
    f.nextGeneration(); await f.bind(f.context('B')); await assert.rejects(f.session.started(f.helper, 2), /synthetic-owned-close-failure/);
    assert.equal(f.session.status().next.state, 'unavailable');
    const before = f.requests.length; assert.equal((await f.session.preload(f.context('C'), f.helper, 2)).state, 'unavailable');
    f.nextGeneration(); assert.equal(await f.bind(f.context('C', true)), null); assert.equal(f.requests.length, before);
    const response = await fetch(f.context('C').source, {headers: {Range: 'bytes=0-7'}}); assert.equal(response.status, 206);
});

test('existing-only cleanup cannot recreate a missing root or adopt an unowned directory', {timeout:10000}, async t => {
    const root = temporaryRoot('ete-existing-cache-', ['missing', 'unowned']); t.after(() => fs.rm(root, {recursive: true, force: true}));
    const missing = path.join(root, 'missing'), unowned = path.join(root, 'unowned'); await fs.mkdir(unowned, {mode: 0o700});
    for (const target of [missing, unowned]) await assert.rejects(createStore({root: target, currentBytes: BLOCK, nextBytes: BLOCK, existingOnly: true}));
    await assert.rejects(fs.lstat(missing), {code: 'ENOENT'}); assert.deepEqual(await fs.readdir(unowned), []);
});

test('an already downloaded local file remains the original source and is not adopted into the shared cache', {timeout: 10000}, async t => {
    const f = await fixture(t), downloadRoot = temporaryRoot('ete-download-cache-isolation-', []);
    t.after(() => fs.rm(downloadRoot, {recursive: true, force: true}));
    const file = path.join(downloadRoot, 'owned-synthetic.mkv'), bytes = Buffer.from('synthetic downloaded file');
    await fs.writeFile(file, bytes);
    const local = {...f.context('A'), source: file};
    assert.equal(await f.bind(local), null);
    await f.session.started(f.helper, f.helper.currentGenerationId);
    assert.equal(f.session.status().current.route, 'original');
    assert.equal(f.requests.length, 0);
    assert.equal(f.propertyReads.length, 0);
    assert.deepEqual(await fs.readFile(file), bytes);
    await assert.rejects(fs.lstat(f.config.sharedRoot), {code: 'ENOENT'});
});
