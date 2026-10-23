'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createStore} = require('../tools/prototypes/playback-cache/store.cjs');

const identity = {serverId: 'server-canary', accountId: 'account-canary', itemId: 'episode-canary',
    mediaSourceId: 'source-canary', versionId: 'version-canary', representationId: 'original-canary'};
const policy = {maxBytes: 16, maxEntries: 2, ttlMs: 1000, minFreeBytes: 0};
const proof = (change = {}) => ({authorized: true, mode: 'direct-file', rangeSupported: true,
    contentLength: 8, strongETag: '"validator-canary"', validUntil: 1800, ...change});
const code = (action, expected) => assert.throws(action, error => error.code === expected && error.message === expected);

function fixture(t, options = {}) {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-cache-test-')));
    const root = path.join(parent, 'playback-cache-prototype-v1');
    let time = 1000;
    const config = {enabled: true, parent, policy: {...policy}, now: () => time, ...options};
    let store = createStore(config);
    t.after(() => { try { store.close(); } finally { fs.rmSync(parent, {recursive: true, force: true}); } });
    return {parent, root, get store() { return store; }, config,
        time: value => { time = value; }, reopen() { store.close(); store = createStore(config); return store; }};
}
function fill(store, id = identity, value = 'abcdefgh') {
    const writer = store.begin(id, proof());
    writer.append(writer.offset, Buffer.from(value).subarray(writer.offset)); writer.release();
}

test('disabled is inert, even with invalid policies and an unusable filesystem', () => {
    const io = new Proxy({}, {get() { throw Error('filesystem touched'); }});
    assert.deepEqual(createStore({fs: io}), {enabled: false});
    assert.deepEqual(createStore({enabled: 'true', fs: io}), {enabled: false});
    code(() => createStore({enabled: true}), 'policy-required');
});

test('real bytes persist; only a complete validated file has a bounded reader', t => {
    const f = fixture(t);
    const writer = f.store.begin(identity, proof());
    writer.append(0, Buffer.from('abcd'));
    assert.deepEqual(f.store.inspect(identity, proof()), {committed: 4, length: 8, complete: false});
    assert.equal(f.store.acquireComplete(identity, proof()), null);
    code(() => writer.append(0, Buffer.from('x')), 'append-invalid');
    code(() => writer.append(4, Buffer.alloc(5)), 'append-invalid');
    code(() => f.store.close(), 'leases-active');
    writer.release(); writer.release();
    code(() => writer.append(4, Buffer.from('efgh')), 'lease-released');
    f.reopen();
    const resumed = f.store.begin(identity, proof());
    assert.equal(resumed.offset, 4); resumed.append(4, Buffer.from('efgh')); resumed.release();
    const reader = f.store.acquireComplete(identity, proof());
    assert.equal(reader.read(0, 8).toString(), 'abcdefgh');
    assert.equal(reader.read(2, 3).toString(), 'cde');
    code(() => reader.read(0, 65537), 'read-invalid'); reader.release();
    code(() => reader.read(0, 1), 'lease-released');
});

test('every server/account/item/source/version/representation and validator separates reuse', t => {
    const {store} = fixture(t); fill(store);
    for (const field of Object.keys(identity)) assert.equal(store.inspect({...identity, [field]: 'different'}, proof()), null);
    assert.equal(store.inspect(identity, proof({strongETag: '"different"'})), null);
    assert.equal(store.inspect(identity, proof({contentLength: 7})), null);
});

test('authorization is fresh and temporary; unsupported response types cannot be reused', t => {
    const f = fixture(t); fill(f.store);
    for (const change of [{authorized: false}, {validUntil: 1000}, {strongETag: 'W/"weak"'},
        {rangeSupported: false}, {mode: 'transcode'}, {mode: 'hls'}, {contentLength: 0},
        {url: 'https://secret.invalid/?token=canary'}, {headers: {Authorization: 'canary'}}]) {
        code(() => f.store.inspect(identity, proof(change)), 'proof-invalid');
    }
    const grant = proof({validUntil: 1100});
    const reader = f.store.acquireComplete(identity, grant);
    grant.validUntil = 9000; f.time(1100);
    code(() => reader.read(0, 1), 'lease-expired'); reader.release();
    // A renewed grant can reuse identical verified bytes, without storing URLs.
    const renewed = f.store.acquireComplete(identity, proof({validUntil: 1500}));
    assert.equal(renewed.read(0, 1).toString(), 'a'); renewed.release();
});

test('disk metadata contains hashes and numeric lifecycle data, no raw identities, validator or credentials', t => {
    const f = fixture(t); fill(f.store);
    for (const name of fs.readdirSync(f.root).filter(name => name.endsWith('.json'))) {
        const text = fs.readFileSync(path.join(f.root, name), 'utf8');
        assert.equal(/canary|https?:|authorization|token|password|url/i.test(text), false);
        assert.match(name, /^[0-9a-f]{64}\.json$/);
    }
});

test('quota reserves whole representations, evicts idle LRU, and never evicts a pinned current reader', t => {
    const f = fixture(t); fill(f.store);
    const current = f.store.acquireComplete(identity, proof());
    const second = {...identity, itemId: 'second'}; fill(f.store, second);
    const third = {...identity, itemId: 'third'}; fill(f.store, third);
    assert.equal(f.store.inspect(second, proof()), null);
    assert.equal(current.read(0, 1).toString(), 'a');
    const other = f.store.acquireComplete(third, proof());
    code(() => f.store.begin({...identity, itemId: 'fourth'}, proof()), 'quota-pinned');
    code(() => f.store.begin({...identity, itemId: 'large'}, proof({contentLength: 17})), 'quota-exceeded');
    other.release(); current.release();
    assert.deepEqual(f.store.status(), {entries: 2, reservedBytes: 16, committedBytes: 16, pinnedEntries: 0});
});

test('expiry is enforced at use, even if cleanup timer never runs; expired leases remain pinned until release', t => {
    const f = fixture(t); const writer = f.store.begin(identity, proof({validUntil: 3000}));
    writer.append(0, Buffer.from('a')); f.time(2000);
    code(() => writer.append(1, Buffer.from('b')), 'lease-expired');
    code(() => f.store.inspect(identity, proof({validUntil: 3000})), 'entry-expired');
    f.store.prune(); assert.equal(f.store.status().entries, 1);
    writer.release(); f.store.prune(); assert.equal(f.store.status().entries, 0);
});

test('recovery discards orphan/temp bytes, truncates an uncommitted tail, and drops corruption', t => {
    const f = fixture(t);
    const writer = f.store.begin(identity, proof()); writer.append(0, Buffer.from('abcd')); writer.release();
    f.store.close();
    const name = fs.readdirSync(f.root).find(name => name.endsWith('.bytes'));
    fs.appendFileSync(path.join(f.root, name), 'uncommitted-tail');
    fs.writeFileSync(path.join(f.root, 'f'.repeat(64) + '.bytes'), 'orphan');
    fs.writeFileSync(path.join(f.root, name.slice(0, 64) + '.json.tmp'), 'interrupted checkpoint');
    f.reopen(); assert.equal(fs.statSync(path.join(f.root, name)).size, 4);
    assert.equal(f.store.inspect(identity, proof()).committed, 4);
    assert.equal(fs.readdirSync(f.root).some(name => name.endsWith('.tmp') || name.startsWith('f'.repeat(64))), false);
    f.store.close(); fs.writeFileSync(path.join(f.root, name), 'bad!');
    f.reopen(); assert.equal(f.store.inspect(identity, proof()), null);
});

test('short files and malformed metadata fail closed, rather than becoming reusable media', t => {
    const f = fixture(t); fill(f.store); f.store.close();
    const name = fs.readdirSync(f.root).find(name => name.endsWith('.bytes'));
    fs.truncateSync(path.join(f.root, name), 1);
    f.reopen(); assert.equal(f.store.inspect(identity, proof()), null);
    fill(f.store); f.store.close();
    const meta = fs.readdirSync(f.root).find(name => name.endsWith('.json'));
    fs.writeFileSync(path.join(f.root, meta), '{}');
    code(() => createStore(f.config), 'store-open-failed');
});

test('space preflight and disk-full write failures do not invent committed bytes', t => {
    let available = 100;
    let diskFull = false;
    const io = Object.create(fs);
    io.statfsSync = () => ({bavail: available, bsize: 1});
    io.writeSync = (...args) => { if (diskFull) { const error = Error('private path'); error.code = 'ENOSPC'; throw error; } return fs.writeSync(...args); };
    const f = fixture(t, {fs: io, policy: {...policy, minFreeBytes: 10}});
    const writer = f.store.begin(identity, proof());
    available = 13; code(() => writer.append(0, Buffer.from('abcd')), 'space-low');
    assert.equal(f.store.inspect(identity, proof()).committed, 0);
    available = 100; diskFull = true;
    code(() => writer.append(0, Buffer.from('abcd')), 'store-io-failed');
    code(() => f.store.status(), 'store-reopen-required'); writer.release(); diskFull = false;
    f.reopen(); assert.equal(f.store.inspect(identity, proof()).committed, 0);
});

test('failed atomic checkpoint recovers the previous committed prefix after reopening', t => {
    let broken = false;
    const io = Object.create(fs);
    io.renameSync = (...args) => { if (broken) { const error = Error('secret path'); error.code = 'EIO'; throw error; } return fs.renameSync(...args); };
    const f = fixture(t, {fs: io});
    const writer = f.store.begin(identity, proof()); writer.append(0, Buffer.from('abcd'));
    broken = true; code(() => writer.append(4, Buffer.from('efgh')), 'store-io-failed'); writer.release();
    broken = false; f.reopen();
    assert.deepEqual(f.store.inspect(identity, proof()), {committed: 4, length: 8, complete: false});
});

test('exclusive lock, unknown files, symlinks and hard links fail closed without deleting outside data', t => {
    const f = fixture(t);
    code(() => createStore(f.config), 'store-busy');
    f.store.close();
    fs.writeFileSync(path.join(f.root, 'unowned'), 'keep');
    code(() => createStore(f.config), 'store-open-failed');
    assert.equal(fs.readFileSync(path.join(f.root, 'unowned'), 'utf8'), 'keep');
    fs.unlinkSync(path.join(f.root, 'unowned'));
    const outside = path.join(f.parent, 'outside'); fs.writeFileSync(outside, 'keep');
    const target = path.join(f.root, 'a'.repeat(64) + '.bytes');
    fs.symlinkSync(outside, target); code(() => createStore(f.config), 'store-open-failed'); fs.unlinkSync(target);
    fs.linkSync(outside, target); code(() => createStore(f.config), 'store-open-failed'); fs.unlinkSync(target);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'keep');
    f.reopen();
});

test('synthetic bytes survive distinct processes; an exited writer lock requires explicit verified recovery', t => {
    const f = fixture(t); f.store.close();
    const source = `
        const {createStore} = require(process.argv[1]);
        const store = createStore({enabled: true, parent: process.argv[2],
            policy: ${JSON.stringify(policy)}, now: () => 1000});
        const writer = store.begin(${JSON.stringify(identity)}, ${JSON.stringify(proof())});
        writer.append(writer.offset, Buffer.from(process.argv[3] === 'close' ? 'abcd' : 'efgh'));
        writer.release();
        if (process.argv[3] === 'close') store.close();
        process.exit(0);
    `;
    function run(mode) {
        const child = spawnSync(process.execPath, ['-e', source,
            require.resolve('../tools/prototypes/playback-cache/store.cjs'), f.parent, mode], {encoding: 'utf8', timeout: 5000});
        assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
        return child;
    }
    run('close'); f.reopen();
    assert.deepEqual(f.store.inspect(identity, proof()), {committed: 4, length: 8, complete: false});
    f.store.close();
    const exited = run('crash');
    code(() => createStore(f.config), 'store-busy');
    // spawnSync has confirmed this exact owned child's exit. This explicit test
    // cleanup is not an automatic stale-lock policy in the prototype.
    assert.equal(fs.readFileSync(path.join(f.root, 'lock'), 'utf8'), String(exited.pid));
    fs.unlinkSync(path.join(f.root, 'lock'));
    f.reopen();
    const reader = f.store.acquireComplete(identity, proof());
    assert.equal(reader.read(0, 8).toString(), 'abcdefgh'); reader.release();
});
