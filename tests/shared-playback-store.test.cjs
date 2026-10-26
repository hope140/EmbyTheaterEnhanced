'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const {createStore} = require('../tools/shared-playback-cache/store.cjs');

const identity = (account = 'account-a', resource = 'resource-a') => ({
    server: 'server-a', account, item: 'item-a', mediaSource: 'source-a', resource, representation: 'original'
});
const metadata = values => ({total: 1024, ...values});
async function cleanup(actions, remove) {
    const results = await Promise.allSettled(actions.map(action => Promise.resolve().then(action)));
    results.push(...await Promise.allSettled([Promise.resolve().then(remove)]));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'owned-shared-store-fixture-cleanup-failed');
}

async function fixture(t, limits = {}, overrides = {}) {
    const parent = temporaryRoot('ete-shared-cache-test-', ['cache']);
    const root = path.join(parent, 'cache');
    let store;
    t.after(() => cleanup([() => store?.close()], () => fs.rm(parent, {recursive: true, force: true})));
    const io = new Proxy(fs, {
        get(target, property) {
            if (Object.hasOwn(overrides, property)) return overrides[property];
            const value = target[property];
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    store = await createStore({root, currentBytes: 64, nextBytes: 64, ...limits, io});
    return {parent, root, store};
}

function gate() {
    let release;
    let entered;
    const ready = new Promise(resolve => { entered = resolve; });
    const wait = new Promise(resolve => { release = resolve; });
    return {ready, wait, release, entered};
}

function blockHandleIo({corrupt = () => false, beforeRead = async () => {}} = {}) {
    return {
        async open(file, flags) {
            const handle = await fs.open(file, flags);
            if (!String(file).endsWith('.bin')) return handle;
            return {
                stat: (...args) => handle.stat(...args),
                async read(buffer, offset, length, position) {
                    await beforeRead(file);
                    const result = await handle.read(buffer, offset, length, position);
                    if (corrupt() && result.bytesRead > 0) buffer[offset] ^= 0xff;
                    return result;
                },
                close: (...args) => handle.close(...args),
            };
        },
    };
}

test('same-version same-role open is a guarded lookup without another checkpoint', async t => {
    let denyCheckpoint = false;
    const {store, root} = await fixture(t, {}, {async writeFile(file, ...args) {
        if (denyCheckpoint && path.basename(file).startsWith('.index-')) throw Error('touch-checkpoint-forbidden');
        return fs.writeFile(file, ...args);
    }});
    const a = await store.open(identity('account-a', 'actual-A'), metadata(), 'current');
    await store.actual(a); await store.put(a, 0, Buffer.from('actual'));
    const bIdentity = identity('account-a', 'next-B');
    const b = await store.open(bIdentity, metadata(), 'next'); await store.put(b, 0, Buffer.from('next'));
    const before = store.status(), index = await fs.readFile(path.join(root, 'index.json'));
    const journal = await fs.readFile(path.join(root, 'index.log'));
    denyCheckpoint = true;
    try {
        assert.equal(await store.open(bIdentity, metadata(), 'next'), b);
        assert.equal(store.status().indexMetrics.checkpointWrites, before.indexMetrics.checkpointWrites);
        assert.equal(store.status().currentKey, a, 'preparing B must not retire actual A');
        assert.deepEqual(await store.read(b, 0, 4), Buffer.from('next'));
        assert.deepEqual(await fs.readFile(path.join(root, 'index.json')), index);
        assert.deepEqual(await fs.readFile(path.join(root, 'index.log')), journal, 'touch does not alter committed journal/roles');
    } finally {denyCheckpoint = false;}
});
test('touch lookup still checks physical ownership and disables a substituted path', async t => {
    let denyOwnership = false;
    const {store} = await fixture(t, {}, {async lstat(...args) {
        if (denyOwnership) throw Error('owned-path-unavailable');
        return fs.lstat(...args);
    }});
    await store.open(identity(), metadata(), 'next');
    denyOwnership = true;
    try {await assert.rejects(store.open(identity(), metadata(), 'next')); assert.equal(store.status().faulted, true);}
    finally {denyOwnership = false;}
});
test('role and version changes still checkpoint and retire the old version', async t => {
    const {store} = await fixture(t);
    const key = await store.open(identity(), metadata({etag: 'v1'}), 'next');
    const first = store.status().indexMetrics.checkpointWrites;
    assert.equal(await store.open(identity(), metadata({etag: 'v1'}), 'current'), key);
    assert.ok(store.status().indexMetrics.checkpointWrites > first);
    const second = store.status().indexMetrics.checkpointWrites;
    const changed = await store.open(identity(), metadata({etag: 'v2'}), 'current');
    assert.notEqual(changed, key); assert.ok(store.status().indexMetrics.checkpointWrites > second);
    assert.equal(store.coverage(key).bytes, 0);
});
test('a cancelled queued same-version lookup cannot bypass execution-time ownership', async t => {
    const blocked = gate(); let hold = false;
    const {store} = await fixture(t, {}, {async writeFile(file, ...args) {
        if (hold && path.basename(file).startsWith('.index-')) {hold = false; blocked.entered(); await blocked.wait;}
        return fs.writeFile(file, ...args);
    }});
    const source = identity('account-a', 'next-B'); await store.open(source, metadata(), 'next');
    hold = true; const blocker = store.open(identity('account-a', 'other-C'), metadata(), 'next');
    try {
        await blocked.ready; let live = true;
        const obsolete = store.open(source, metadata(), 'next', {isCurrent: () => live});
        live = false; blocked.release(); await blocker;
        await assert.rejects(obsolete, /retired/);
    } finally {blocked.release(); await blocker.catch(() => {});}
});

test('foreground and preload share one identity and overlapping bytes are stored once', async t => {
    const {store} = await fixture(t);
    const nextKey = await store.open(identity(), metadata(), 'next');
    assert.equal(await store.actual(nextKey), true);
    const currentKey = await store.open(identity(), metadata(), 'current');
    assert.equal(currentKey, nextKey);

    const bytes = Buffer.from('foreground bytes');
    assert.equal(await store.put(currentKey, 10, bytes), true);
    assert.equal(await store.put(nextKey, 10, bytes), false);
    assert.deepEqual(await store.read(currentKey, 10, bytes.length), bytes);
    assert.deepEqual(await store.span(currentKey, 10), {start: 10, end: 10 + bytes.length});
    assert.equal((await store.status()).committed, bytes.length);
});

test('ordinary metadata without an ETag remains cacheable', async t => {
    const {store} = await fixture(t);
    const key = await store.open(identity(), metadata({lastModified: 'origin-time'}), 'current');
    assert.equal(await store.actual(key), true);
    const bytes = Buffer.from('no-etag payload');
    assert.equal(await store.put(key, 0, bytes), true);
    assert.deepEqual(await store.read(key, 0, bytes.length), bytes);
});

test('metadata changes retire prior bytes and issue a different version key', async t => {
    const {store} = await fixture(t);
    const oldKey = await store.open(identity(), metadata({etag: '"v1"'}), 'current');
    assert.equal(await store.actual(oldKey), true);
    assert.equal(await store.put(oldKey, 0, Buffer.from('old version')), true);

    const newKey = await store.open(identity(), metadata({etag: '"v2"'}), 'next');
    assert.notEqual(newKey, oldKey);
    assert.equal(await store.read(oldKey, 0, 11), null);
    assert.equal(await store.put(oldKey, 20, Buffer.from('late old bytes')), false);
    assert.equal(await store.span(newKey, 0), null);
});

test('metadata enrichment transfers actual ownership while preserving the next entry', async t => {
    const {root, store} = await fixture(t);
    const source = identity('account-a', 'resource-current');
    const current = await store.open(source, metadata(), 'next');
    await store.actual(current);
    assert.equal(await store.put(current, 0, Buffer.from('old')), true);
    const next = await store.open(identity('account-a', 'resource-next'), metadata(), 'next');
    assert.equal(await store.put(next, 0, Buffer.from('next')), true);

    const enriched = await store.open(source, metadata({etag: '"learned"'}), 'next', {
        retainActualFrom: current
    });
    assert.notEqual(enriched, current);
    assert.equal(store.status().currentKey, enriched);
    assert.equal(await store.read(current, 0, 3), null);
    assert.equal(await store.span(enriched, 0), null);
    assert.deepEqual(await store.read(next, 0, 4), Buffer.from('next'));
    assert.equal(await store.put(enriched, 0, Buffer.from('new')), true);
    assert.equal(store.status().current, 3);
    assert.equal(store.status().next, 4);

    await store.close();
    const reopened = await createStore({root, currentBytes: 64, nextBytes: 64});
    try {
        assert.equal(reopened.status().currentKey, enriched);
        assert.deepEqual(await reopened.read(enriched, 0, 3), Buffer.from('new'));
    } finally {
        await reopened.close();
    }
});

test('actual ownership retention requires a valid key for the same source identity', async t => {
    const {store} = await fixture(t);
    const current = await store.open(identity(), metadata(), 'next');
    await store.actual(current);
    assert.equal(await store.put(current, 0, Buffer.from('old')), true);
    for (const retainActualFrom of ['', 'invalid-key', 123]) {
        await assert.rejects(store.open(identity(), metadata(), 'next', {retainActualFrom}),
            /retainActualFrom must be a cache key or null/);
    }
    const other = await store.open(identity('account-b'), metadata({etag: '"learned"'}), 'next', {
        retainActualFrom: current
    });
    assert.equal(store.status().currentKey, current);
    assert.deepEqual(await store.read(current, 0, 3), Buffer.from('old'));
    assert.equal(await store.put(other, 0, Buffer.from('next')), true);
    assert.equal(store.status().current, 3);
    assert.equal(store.status().next, 4);
});

test('retired queued metadata enrichment cannot transfer actual ownership', async t => {
    const blocked = gate(); t.after(blocked.release);
    let holdWrite = false;
    const {store} = await fixture(t, {}, {
        async writeFile(file, data, options) {
            if (holdWrite && path.basename(String(file)).startsWith('.block-')) {
                blocked.entered();
                await blocked.wait;
            }
            return fs.writeFile(file, data, options);
        }
    });
    const source = identity('account-a', 'resource-current');
    const current = await store.open(source, metadata(), 'next');
    await store.actual(current);
    assert.equal(await store.put(current, 0, Buffer.from('old')), true);
    const next = await store.open(identity('account-a', 'resource-next'), metadata(), 'next');
    holdWrite = true;
    const blockedPut = store.put(next, 0, Buffer.from('next'));
    await blocked.ready;
    let live = true;
    const enriched = store.open(source, metadata({etag: '"learned"'}), 'next', {
        retainActualFrom: current, isCurrent: () => live
    });
    live = false;
    holdWrite = false;
    blocked.release();

    assert.equal(await blockedPut, true);
    await assert.rejects(enriched, /cache request retired/);
    assert.equal(store.status().currentKey, current);
    assert.deepEqual(await store.read(current, 0, 3), Buffer.from('old'));
    assert.deepEqual(await store.read(next, 0, 4), Buffer.from('next'));
});

test('metadata enrichment cannot reclaim actual ownership from a preceding queued selection', async t => {
    const blocked = gate(); t.after(blocked.release);
    let holdWrite = false;
    const {store} = await fixture(t, {}, {
        async writeFile(file, data, options) {
            if (holdWrite && path.basename(String(file)).startsWith('.block-')) {
                blocked.entered();
                await blocked.wait;
            }
            return fs.writeFile(file, data, options);
        }
    });
    const source = identity('account-a', 'resource-current');
    const current = await store.open(source, metadata(), 'next');
    await store.actual(current);
    const next = await store.open(identity('account-a', 'resource-next'), metadata(), 'next');
    holdWrite = true;
    const blockedPut = store.put(next, 0, Buffer.from('next'));
    await blocked.ready;
    const selectedNext = store.actual(next);
    const enriched = store.open(source, metadata({etag: '"learned"'}), 'next', {
        retainActualFrom: current
    });
    holdWrite = false;
    blocked.release();

    assert.equal(await blockedPut, true);
    assert.equal(await selectedNext, true);
    const enrichedKey = await enriched;
    assert.equal(store.status().currentKey, next);
    assert.deepEqual(await store.read(next, 0, 4), Buffer.from('next'));
    assert.equal(await store.put(enrichedKey, 0, Buffer.from('new')), true);
    assert.equal(store.status().current, 4);
    assert.equal(store.status().next, 3);
});

test('identical resource identities remain isolated across accounts', async t => {
    const {store} = await fixture(t);
    const a = await store.open(identity('account-a'), metadata(), 'next');
    const b = await store.open(identity('account-b'), metadata(), 'next');
    assert.notEqual(a, b);
    assert.equal(await store.put(a, 0, Buffer.from('account a')), true);
    assert.equal(await store.read(b, 0, 9), null);
});

test('open and preload preserve the last actual object until actual playback changes', async t => {
    const {store} = await fixture(t);
    const a = await store.open(identity('account-a', 'resource-a'), metadata(), 'next');
    await store.actual(a);
    assert.equal(await store.put(a, 0, Buffer.from('playing')), true);

    const b = await store.open(identity('account-a', 'resource-b'), metadata(), 'next');
    assert.equal(await store.put(b, 0, Buffer.from('preloaded')), true);
    assert.equal((await store.status()).currentKey, a);
    assert.deepEqual(await store.read(a, 0, 7), Buffer.from('playing'));

    assert.equal(await store.actual(b), true);
    assert.equal(await store.read(a, 0, 7), null);
    assert.deepEqual(await store.read(b, 0, 9), Buffer.from('preloaded'));
});

test('close and reopen recover only the last actual object and discard preload', async t => {
    const parent = temporaryRoot('ete-shared-cache-reopen-', ['cache']);
    const root = path.join(parent, 'cache');
    let store;
    t.after(() => cleanup([() => store?.close()], () => fs.rm(parent, {recursive: true, force: true})));
    store = await createStore({root, currentBytes: 64, nextBytes: 64});
    const a = await store.open(identity('account-a', 'resource-a'), metadata(), 'next');
    await store.actual(a);
    const aBytes = Buffer.from('survives restart');
    assert.equal(await store.put(a, 0, aBytes), true);
    const b = await store.open(identity('account-a', 'resource-b'), metadata(), 'next');
    assert.equal(await store.put(b, 0, Buffer.from('discard preload')), true);
    await store.close();

    store = await createStore({root, currentBytes: 64, nextBytes: 64});
    try {
        assert.equal((await store.status()).currentKey, a);
        assert.equal((await store.status()).entries, 1);
        assert.deepEqual(await store.read(a, 0, aBytes.length), aBytes);
        assert.equal(await store.read(b, 0, 15), null);
    } finally {
        await store.close();
    }
});

for (const currentBytes of [64, 8]) {
    test(`recovery preserves forward spans and holes with out-of-order touches and a ${currentBytes}-byte quota`, async t => {
        const parent = temporaryRoot('ete-shared-cache-recovery-order-', ['cache']);
        const root = path.join(parent, 'cache');
        let store;
        t.after(() => cleanup([() => store?.close()], () => fs.rm(parent, {recursive: true, force: true})));
        store = await createStore({root, currentBytes: 64, nextBytes: 64});
        const key = await store.open(identity(), metadata(), 'current');
        await store.actual(key);
        for (const [start, bytes] of [[0, 'ab'], [2, 'cd'], [4, 'ef'], [8, 'ij'], [12, 'mn']]) {
            assert.equal(await store.put(key, start, Buffer.from(bytes)), true);
        }
        await store.close();

        // Model a persisted access history without relying on clock resolution.
        // The oldest block is beyond a hole; retained adjacent blocks also have
        // reverse access order, even after a smaller quota removes that oldest block.
        const indexPath = path.join(root, 'index.json');
        const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));
        const touchedByStart = new Map([[0, 50], [2, 40], [4, 20], [8, 30], [12, 10]]);
        for (const block of index.entries[0].blocks) {
            if (Array.isArray(block)) block[3] = touchedByStart.get(block[0]);
            else block.touched = touchedByStart.get(block.start); // Legacy v1 fixture.
        }
        await fs.writeFile(indexPath, JSON.stringify(index));

        for (let reopen = 0; reopen < 2; reopen++) {
            store = await createStore({root, currentBytes, nextBytes: 64});
            assert.equal(store.status().current, currentBytes === 8 ? 8 : 10);
            assert.equal(await store.nextOffset(key, 0), 2);
            assert.deepEqual(await store.span(key, 3), {start: 0, end: 6});
            assert.deepEqual(await store.read(key, 1, 4), Buffer.from('bcde'));
            assert.equal(await store.span(key, 6), null);
            assert.equal(await store.nextOffset(key, 6), 8);
            assert.equal(await store.read(key, 5, 4), null);
            assert.deepEqual(await store.span(key, 8), {start: 8, end: 10});
            assert.deepEqual(await store.read(key, 8, 2), Buffer.from('ij'));
            assert.equal(await store.nextOffset(key, 10), currentBytes === 8 ? null : 12);
            assert.deepEqual(await store.span(key, 12), currentBytes === 8 ? null : {start: 12, end: 14});
            assert.deepEqual(await store.read(key, 12, 2), currentBytes === 8 ? null : Buffer.from('mn'));
            assert.equal(await store.nextOffset(key, 14), null);
            await store.close();
        }
    });
}

test('per-role budget rolls out the oldest committed block before retry', async t => {
    const {store} = await fixture(t, {currentBytes: 4, nextBytes: 8});
    const key = await store.open(identity(), metadata(), 'current');
    await store.actual(key);
    assert.equal(await store.put(key, 0, Buffer.from('1111')), true);

    // Admission fails immediately and queues eviction; it never exceeds the cap.
    assert.equal(await store.put(key, 4, Buffer.from('2222')), false);
    await store.actual(key); // queue barrier after the scheduled eviction
    assert.equal((await store.status()).current, 0);
    assert.equal(await store.read(key, 0, 4), null);
    assert.equal(await store.put(key, 4, Buffer.from('2222')), true);
    assert.deepEqual(await store.read(key, 4, 4), Buffer.from('2222'));
    assert((await store.status()).peak <= 4);
});

test('role changes cannot reuse disk budget still charged to leased retired blocks', async t => {
    for (const transition of ['open-current', 'actual']) await t.test(transition, async t => {
        const blocked = gate(); t.after(blocked.release);
        const leasedKeys = new Set();
        let entered = 0;
        const {store} = await fixture(t, {currentBytes: 4, nextBytes: 4}, blockHandleIo({
            beforeRead: async file => {
                if (![...leasedKeys].some(key => path.basename(String(file)).startsWith(key + '-'))) return;
                if (++entered === leasedKeys.size) blocked.entered();
                await blocked.wait;
            }
        }));
        const a = await store.open(identity('account-a', 'pinned-A'), metadata(), 'current');
        await store.actual(a);
        assert.equal(await store.put(a, 0, Buffer.from('AAAA')), true);
        const bIdentity = identity('account-a', 'pinned-B');
        const b = await store.open(bIdentity, metadata(), 'next');
        assert.equal(await store.put(b, 0, Buffer.from('BBBB')), true);
        const c = await store.open(identity('account-a', 'new-C'), metadata(), 'next');
        leasedKeys.add(b);
        if (transition === 'actual') leasedKeys.add(a);
        const reads = [...leasedKeys].map(key => store.read(key, 0, 4));
        try {
            await blocked.ready;
            if (transition === 'actual') assert.equal(await store.actual(b), true);
            else assert.equal(await store.open(bIdentity, metadata(), 'current'), b);
            assert.equal(store.status().current + store.status().next, 8);
            const candidate = transition === 'actual'
                ? await store.open(identity('account-a', 'new-C'), metadata(), 'next') : c;
            // A role change does not free physical files held by old reads.
            assert.equal(await store.put(candidate, 0, Buffer.from('CCCC')), false);
            assert.ok(store.status().current + store.status().next <= 8);
            assert.ok(store.status().peak <= 8);
        } finally {
            blocked.release();
            await Promise.all(reads);
        }
        // actual() retires the old speculative C; reopen after leases drain.
        const next = await store.open(identity('account-a', 'new-C'), metadata(), 'next');
        assert.equal(await store.put(next, 0, Buffer.from('CCCC')), true);
        assert.ok(store.status().current + store.status().next <= 8);
    });
});

test('slow disk admission reserves bounded bytes before queued writes can grow', async t => {
    const blocked = gate(); t.after(blocked.release);
    let hold = true;
    const overrides = {
        async writeFile(file, data, options) {
            if (hold && path.basename(String(file)).startsWith('.block-')) {
                blocked.entered();
                await blocked.wait;
            }
            return fs.writeFile(file, data, options);
        }
    };
    const {store} = await fixture(t, {currentBytes: 32, nextBytes: 32, maxPendingBytes: 4}, overrides);
    const key = await store.open(identity(), metadata(), 'next');
    const first = store.put(key, 0, Buffer.from('1234'));
    await blocked.ready;
    assert.equal(await store.put(key, 4, Buffer.from('5678')), false);
    const during = store.status();
    assert.equal(during.pending, 4);
    assert.equal(during.reserved, 4);
    assert(during.peak <= 4);
    hold = false;
    blocked.release();
    assert.equal(await first, true);
    assert.equal(store.status().pending, 0);
    assert.deepEqual(await store.read(key, 0, 4), Buffer.from('1234'));
});

test('failed partial block write cannot become a readable span', async t => {
    const overrides = {
        async writeFile(file, data, options) {
            if (path.basename(String(file)).startsWith('.block-')) {
                await fs.writeFile(file, Buffer.from(data).subarray(0, 2), options);
                throw new Error('injected partial block write');
            }
            return fs.writeFile(file, data, options);
        }
    };
    const {store} = await fixture(t, {}, overrides);
    const key = await store.open(identity(), metadata(), 'current');
    await store.actual(key);
    assert.equal(await store.put(key, 0, Buffer.from('full block')), false);
    assert.equal(await store.read(key, 0, 4), null);
    assert.equal(await store.span(key, 0), null);
    assert.equal(store.status().faulted, true);
});

test('read rejects a block whose persisted bytes no longer match its hash', async t => {
    let corrupt = false;
    const overrides = blockHandleIo({corrupt: () => corrupt});
    const {store} = await fixture(t, {}, overrides);
    const key = await store.open(identity(), metadata(), 'current');
    await store.actual(key);
    assert.equal(await store.put(key, 0, Buffer.from('integrity')), true);
    corrupt = true;
    assert.equal(await store.read(key, 0, 9), null);
    await store.invalidate(key); // settles the asynchronous corrupt-block retirement
    assert.equal(await store.span(key, 0), null);
});

test('invalidated blocks stay on disk until an in-flight read lease releases', async t => {
    const blocked = gate(); t.after(blocked.release);
    let holdRead = false;
    const unlinkedBlocks = [];
    const overrides = {
        ...blockHandleIo({beforeRead: async file => {
            if (holdRead && String(file).endsWith('.bin')) {
                blocked.entered();
                await blocked.wait;
            }
        }}),
        async unlink(file) {
            if (String(file).endsWith('.bin')) unlinkedBlocks.push(String(file));
            return fs.unlink(file);
        }
    };
    const {store} = await fixture(t, {}, overrides);
    const key = await store.open(identity(), metadata(), 'current');
    await store.actual(key);
    const bytes = Buffer.from('leased bytes');
    assert.equal(await store.put(key, 0, bytes), true);

    holdRead = true;
    const pendingRead = store.read(key, 0, bytes.length);
    await blocked.ready;
    assert.equal(store.status().readers, 1);
    assert.equal(await store.invalidate(key), true);
    assert.equal(unlinkedBlocks.length, 0);
    assert.equal(store.status().readers, 1);

    holdRead = false;
    blocked.release();
    assert.deepEqual(await pendingRead, bytes);
    assert.equal(store.status().readers, 0);
    assert.equal(unlinkedBlocks.length, 1);
});

test('same root is OS-guarded until its current store closes', async t => {
    const parent = temporaryRoot('ete-shared-cache-guard-', ['cache']);
    const root = path.join(parent, 'cache');
    let first, reopened;
    t.after(() => cleanup([() => first?.close(), () => reopened?.close()], () => fs.rm(parent, {recursive: true, force: true})));
    first = await createStore({root, currentBytes: 32, nextBytes: 32});
    await assert.rejects(createStore({root, currentBytes: 32, nextBytes: 32}));
    await first.close();
    first = null;
    reopened = await createStore({root, currentBytes: 32, nextBytes: 32});
    await reopened.close();
});

test('close waits for a live reader and removes next-role blocks', async t => {
    const blocked = gate(); t.after(blocked.release);
    let holdRead = false;
    const {root, store} = await fixture(t, {}, blockHandleIo({beforeRead: async file => {
        if (holdRead && String(file).endsWith('.bin')) {
            blocked.entered();
            await blocked.wait;
        }
    }}));
    const current = await store.open(identity('account-a', 'resource-current'), metadata(), 'next');
    await store.actual(current);
    const next = await store.open(identity('account-a', 'resource-next'), metadata(), 'next');
    const currentBytes = Buffer.from('current');
    assert.equal(await store.put(current, 0, currentBytes), true);
    assert.equal(await store.put(next, 0, Buffer.from('next')), true);

    holdRead = true;
    const pendingRead = store.read(current, 0, currentBytes.length);
    await blocked.ready;
    let closeFinished = false;
    const pendingClose = store.close().then(() => {closeFinished = true;});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closeFinished, false);
    assert.equal(store.status().readers, 1);

    holdRead = false;
    blocked.release();
    assert.deepEqual(await pendingRead, currentBytes);
    await pendingClose;
    assert.equal(closeFinished, true);
    const blockFiles = await fs.readdir(path.join(root, 'blocks'));
    assert.equal(blockFiles.length, 1);
});

test('retired same-name block cannot be replaced until its old read lease releases', async t => {
    const blocked = gate(); t.after(blocked.release);
    let holdRead = false;
    const {store} = await fixture(t, {}, blockHandleIo({beforeRead: async file => {
        if (holdRead && String(file).endsWith('.bin')) {
            blocked.entered();
            await blocked.wait;
        }
    }}));
    const key = await store.open(identity(), metadata(), 'current');
    await store.actual(key);
    const bytes = Buffer.from('same content');
    assert.equal(await store.put(key, 0, bytes), true);

    holdRead = true;
    const pendingRead = store.read(key, 0, bytes.length);
    await blocked.ready;
    assert.equal(await store.invalidate(key), true);
    const reopened = await store.open(identity(), metadata(), 'next');
    assert.equal(reopened, key);
    assert.equal(await store.put(reopened, 0, bytes), false);

    holdRead = false;
    blocked.release();
    assert.deepEqual(await pendingRead, bytes);
    assert.equal(await store.put(reopened, 0, bytes), true);
    assert.equal(await store.actual(reopened), true);
    assert.deepEqual(await store.read(reopened, 0, bytes.length), bytes);
});

test('adjacent blocks form one span even when queried from the middle', async t => {
    const {store} = await fixture(t);
    const key = await store.open(identity(), metadata(), 'current');
    await store.actual(key);
    assert.equal(await store.put(key, 0, Buffer.from('ab')), true);
    assert.equal(await store.put(key, 2, Buffer.from('cd')), true);
    assert.equal(await store.put(key, 4, Buffer.from('ef')), true);
    assert.deepEqual(await store.span(key, 3), {start: 0, end: 6});
    assert.deepEqual(await store.read(key, 1, 4), Buffer.from('bcde'));
});

test('only one capacity reclaim runs while delayed unlink is pending', async t => {
    const blocked = gate(); t.after(blocked.release);
    let holdUnlink = true;
    let blockUnlinks = 0;
    const overrides = {
        async unlink(file) {
            if (String(file).endsWith('.bin')) {
                blockUnlinks++;
                if (holdUnlink) {
                    blocked.entered();
                    await blocked.wait;
                }
            }
            return fs.unlink(file);
        }
    };
    const {store} = await fixture(t, {currentBytes: 8, nextBytes: 4}, overrides);
    const key = await store.open(identity(), metadata(), 'next');
    assert.equal(await store.put(key, 0, Buffer.from('1111')), true);

    assert.equal(await store.put(key, 4, Buffer.from('2222')), false);
    await blocked.ready;
    assert.equal(await store.put(key, 4, Buffer.from('2222')), false);
    assert.equal(await store.put(key, 8, Buffer.from('3333')), false);
    assert.equal(blockUnlinks, 1);

    holdUnlink = false;
    blocked.release();
    assert.equal(await store.actual(key), true); // queue barrier for the single reclaim
    assert.equal(blockUnlinks, 1);
});

test('retired queued open cannot invalidate the current representation or the following entry', async t => {
    const blocked = gate(); t.after(blocked.release);
    let holdWrite = false;
    const overrides = {
        async writeFile(file, data, options) {
            if (holdWrite && path.basename(String(file)).startsWith('.block-')) {
                blocked.entered();
                await blocked.wait;
            }
            return fs.writeFile(file, data, options);
        }
    };
    const {store} = await fixture(t, {}, overrides);
    const source = identity('account-a', 'resource-a');
    const current = await store.open(source, metadata({etag: '"old"'}), 'next');
    await store.actual(current);
    const currentBytes = Buffer.from('still current');
    assert.equal(await store.put(current, 0, currentBytes), true);

    const blocker = await store.open(identity('account-a', 'resource-blocker'), metadata(), 'next');
    holdWrite = true;
    const blockedPut = store.put(blocker, 0, Buffer.from('wait'));
    await blocked.ready;

    let currentRequest = true;
    const obsoleteOpen = store.open(source, metadata({etag: '"new"'}), 'next', {
        isCurrent: () => currentRequest
    });
    const nextIdentity = identity('account-a', 'resource-b');
    const nextKeyPromise = store.open(nextIdentity, metadata(), 'next');
    currentRequest = false;
    holdWrite = false;
    blocked.release();

    assert.equal(await blockedPut, true);
    await assert.rejects(obsoleteOpen, /cache request retired/);
    const nextKey = await nextKeyPromise;
    assert.equal((await store.status()).currentKey, current);
    assert.deepEqual(await store.read(current, 0, currentBytes.length), currentBytes);
    assert.equal(await store.put(nextKey, 0, Buffer.from('new route')), true);
    assert.deepEqual(await store.read(nextKey, 0, 9), Buffer.from('new route'));
});

test('retired queued actual returns false without clearing the following preload', async t => {
    const blocked = gate(); t.after(blocked.release);
    let holdWrite = false;
    const overrides = {
        async writeFile(file, data, options) {
            if (holdWrite && path.basename(String(file)).startsWith('.block-')) {
                blocked.entered();
                await blocked.wait;
            }
            return fs.writeFile(file, data, options);
        }
    };
    const {store} = await fixture(t, {}, overrides);
    const current = await store.open(identity('account-a', 'resource-current'), metadata(), 'next');
    await store.actual(current);
    const blocker = await store.open(identity('account-a', 'resource-blocker'), metadata(), 'next');
    holdWrite = true;
    const blockedPut = store.put(blocker, 0, Buffer.from('wait'));
    await blocked.ready;

    const nextIdentity = identity('account-a', 'resource-next');
    const nextKeyPromise = store.open(nextIdentity, metadata(), 'next');
    let currentRequest = true;
    const obsoleteActual = store.actual(current, {isCurrent: () => currentRequest});
    currentRequest = false;
    holdWrite = false;
    blocked.release();

    assert.equal(await blockedPut, true);
    const nextKey = await nextKeyPromise;
    assert.equal(await obsoleteActual, false);
    assert.equal((await store.status()).currentKey, current);
    assert.equal(await store.put(nextKey, 0, Buffer.from('preload')), true);
    assert.deepEqual(await store.read(nextKey, 0, 7), Buffer.from('preload'));
});
