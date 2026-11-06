'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const records = require('../src/electronapp/enhanced/advance-download/task-store');
const {createManager} = require('../src/electronapp/enhanced/advance-download/manager');

function fixture(t, options = {}) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-local-first-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const data = Buffer.alloc(2 * 1024 * 1024 + 31, 37), file = path.join(root, 'complete.mkv');
    fs.writeFileSync(file, data);
    const stat = fs.statSync(file, {bigint: true}), store = records.createStore(root);
    const context = {serverId: 'server', accountId: 'account', itemId: 'item', mediaSourceId: 'edition',
        serverAddress: 'https://synthetic.invalid/base', token: 'synthetic-token'};
    const task = store.save({schemaVersion: 1, id: randomUUID(), serverId: context.serverId, accountId: context.accountId,
        itemId: context.itemId, mediaSourceId: context.mediaSourceId, serverAddress: context.serverAddress,
        directory: root, state: 'complete', reason: null, partial: null,
        source: {identity: 'a'.repeat(64), total: data.length, etag: '"synthetic"', extension: 'mkv', title: 'Synthetic', prefixSha256: null, prefixBytes: null},
        file: {name: path.basename(file), fileId: records.identity(stat), rootId: records.identity(fs.statSync(root, {bigint: true})),
            size: data.length, mtimeNs: String(stat.mtimeNs), sha256: createHash('sha256').update(data).digest('hex')}});
    if (options.change) options.change({store, task, file, data});
    let remoteCalls = 0;
    const manager = createManager({store, profileRoot: root, createSession() {remoteCalls++; throw Error('remote-must-not-run');}});
    manager.attach(context); t.after(() => manager.close());
    const diagnostics = [];
    return {root, file, data, store, task, context, manager, diagnostics, remoteCalls: () => remoteCalls,
        lookup: (value = context, signal) => manager.localSource(value, signal, d => diagnostics.push(d))};
}

test('a persisted complete file is locally hashed and reused without any remote session, even across a new process manager', async t => {
    const f = fixture(t);
    for (let i = 0; i < 2; i++) assert.equal((await f.lookup()).source, f.file);
    assert.equal(f.remoteCalls(), 0);
    assert.deepEqual(f.diagnostics.at(-1), {reason: 'local-verified', stage: 'verified'});
    assert.deepEqual(fs.readFileSync(f.file), f.data);
    assert.equal(f.store.get(f.task.id).state, 'complete');
});

test('local receipts require exact current server, account, server address, item and selected media version', async t => {
    const f = fixture(t);
    for (const key of ['serverId', 'accountId', 'serverAddress', 'itemId', 'mediaSourceId']) {
        assert.equal(await f.lookup({...f.context, [key]: 'other'}), null, key);
    }
    assert.equal(await f.lookup({...f.context, token: ''}), null);
    assert.equal(await f.lookup({...f.context, mediaSourceId: null}), null);
    assert.equal(f.remoteCalls(), 0);
    assert.equal((await f.lookup()).source, f.file);
});

test('incomplete receipts and absent files miss without remote calls or deleting the receipt', async t => {
    const partial = fixture(t, {change({store, task}) {store.save({...task, state: 'paused', file: null});}});
    assert.equal(await partial.lookup(), null);
    assert.equal(partial.diagnostics.at(-1).reason, 'not-complete');
    const missing = fixture(t); fs.renameSync(missing.file, missing.file + '.retained');
    assert.equal(await missing.lookup(), null);
    assert.equal(missing.diagnostics.at(-1).reason, 'file-missing');
    assert.equal(missing.store.get(missing.task.id).state, 'complete');
    assert.ok(fs.existsSync(missing.file + '.retained'));
    assert.equal(partial.remoteCalls() + missing.remoteCalls(), 0);
});

test('replaced and changed files are rejected and preserved; a same-size forged timestamp still needs the receipt hash', async t => {
    const replaced = fixture(t); fs.renameSync(replaced.file, replaced.file + '.retained'); fs.writeFileSync(replaced.file, replaced.data);
    assert.equal(await replaced.lookup(), null);
    assert.equal(replaced.diagnostics.at(-1).reason, 'file-changed');
    assert.deepEqual(fs.readFileSync(replaced.file), replaced.data);
    assert.ok(fs.existsSync(replaced.file + '.retained'));
    const corrupt = fixture(t, {change({store, task, file, data}) {
        const changed = Buffer.from(data); changed[12345] ^= 1; fs.writeFileSync(file, changed);
        const stat = fs.statSync(file, {bigint: true});
        // Keep a syntactically valid receipt whose SHA still describes the original completed bytes.
        store.save({...task, file: {...task.file, mtimeNs: String(stat.mtimeNs), fileId: records.identity(stat)}});
    }});
    assert.equal(await corrupt.lookup(), null);
    assert.equal(corrupt.diagnostics.at(-1).reason, 'integrity-mismatch');
    assert.equal(fs.readFileSync(corrupt.file)[12345], corrupt.data[12345] ^ 1);
    assert.equal(corrupt.store.get(corrupt.task.id).state, 'complete');
    assert.equal(corrupt.remoteCalls() + replaced.remoteCalls(), 0);
});

test('cached verification is invalidated by a later write rather than adopting the changed local movie', async t => {
    const f = fixture(t); assert.equal((await f.lookup()).source, f.file);
    fs.writeFileSync(f.file, Buffer.alloc(f.data.length, 8));
    assert.equal(await f.lookup(), null);
    assert.equal(f.diagnostics.at(-1).reason, 'file-changed');
    assert.ok(fs.existsSync(f.file)); assert.equal(f.remoteCalls(), 0);
});

test('an invalid newest complete copy does not hide another valid copy of the exact selected media', async t => {
    for (const change of ['missing', 'changed']) {
        let newest;
        const f = fixture(t, {change({store, task, file, data}) {
            newest = path.join(path.dirname(file), 'newest.mkv'); fs.writeFileSync(newest, data);
            const later = new Date(Date.now() + 10000); fs.utimesSync(newest, later, later);
            const stat = fs.statSync(newest, {bigint: true});
            store.save({...task, id: randomUUID(), file: {...task.file, name: path.basename(newest), fileId: records.identity(stat), mtimeNs: String(stat.mtimeNs)}});
            if (change === 'missing') fs.renameSync(newest, newest + '.retained');
            else fs.writeFileSync(newest, Buffer.alloc(data.length, 9));
        }});
        assert.equal((await f.lookup()).source, f.file);
        assert.equal(f.remoteCalls(), 0);
        assert.deepEqual(f.diagnostics.at(-1), {reason: 'local-verified', stage: 'verified', changedCopySkipped: true});
        assert.equal(f.diagnostics[0].reason, change === 'missing' ? 'file-missing' : 'file-changed');
        assert.ok(fs.existsSync(change === 'missing' ? newest + '.retained' : newest));
        assert.equal(f.store.list().length, 2, 'neither download receipt is deleted');
    }
});

test('slow local hashing can exceed the former five-second network budget without a miss and remains asynchronous', {timeout: 10000}, async t => {
    const f = fixture(t), originalOpen = fs.promises.open;
    let entered, release, delayed = false, settled = false;
    const started = new Promise(r => {entered = r;}), gate = new Promise(r => {release = r;});
    fs.promises.open = async (...args) => {
        const handle = await originalOpen(...args), read = handle.read.bind(handle);
        if (args[0] === f.file) handle.read = async (...values) => {
            if (!delayed) {delayed = true; entered(); await gate;}
            return read(...values);
        };
        return handle;
    };
    try {
        const pending = f.lookup().then(value => {settled = true; return value;}); await started;
        await new Promise(r => setTimeout(r, 5200));
        assert.equal(settled, false, 'the event loop remains responsive without timing out local integrity verification');
        release(); assert.equal((await pending).source, f.file); assert.equal(f.remoteCalls(), 0);
    } finally {release(); fs.promises.open = originalOpen;}
});

test('abort, account changes and manager shutdown during hashing cannot publish a local source and close the handle', async t => {
    for (const action of ['abort', 'account', 'close']) {
        const f = fixture(t), controller = new AbortController();
        const originalOpen = fs.promises.open;
        let entered, release, closed = false;
        const started = new Promise(r => {entered = r;}), gate = new Promise(r => {release = r;});
        fs.promises.open = async (...args) => {
            const handle = await originalOpen(...args);
            if (args[0] !== f.file) return handle;
            const read = handle.read.bind(handle), close = handle.close.bind(handle);
            handle.read = async (...values) => {entered(); await gate; return read(...values);};
            handle.close = async () => {await close(); closed = true;};
            return handle;
        };
        try {
            const pending = f.lookup(f.context, controller.signal); await started;
            let shutdown;
            if (action === 'abort') controller.abort();
            if (action === 'account') f.manager.attach({...f.context, accountId: 'other', token: 'other'});
            if (action === 'close') shutdown = f.manager.close();
            release(); assert.equal(await pending, null); if (shutdown) await shutdown;
            assert.equal(closed, true); assert.equal(f.diagnostics.at(-1).reason, 'cancelled');
            assert.deepEqual(fs.readFileSync(f.file), f.data); assert.equal(f.remoteCalls(), 0);
        } finally {release(); fs.promises.open = originalOpen;}
    }
});

test('cancellation while the verified file handle is closing still retires the completed lookup', async t => {
    const f = fixture(t), controller = new AbortController(), originalOpen = fs.promises.open;
    fs.promises.open = async (...args) => {
        const handle = await originalOpen(...args), close = handle.close.bind(handle);
        if (args[0] === f.file) handle.close = async () => {controller.abort(); await close();};
        return handle;
    };
    try {
        assert.equal(await f.lookup(f.context, controller.signal), null);
        assert.deepEqual(f.diagnostics.at(-1), {reason: 'cancelled', stage: 'context'});
        assert.ok(fs.existsSync(f.file)); assert.equal(f.remoteCalls(), 0);
    } finally {fs.promises.open = originalOpen;}
});
