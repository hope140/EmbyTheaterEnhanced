'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createManager} = require('../src/electronapp/enhanced/advance-download/manager');
const {createStore} = require('../src/electronapp/enhanced/advance-download/task-store');
const {createInspector} = require('../src/electronapp/enhanced/advance-download/file-state');
const {fixture, media, token} = require('./helpers/advance-download-fixture.cjs');
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve};};
async function setup(t, pause = false, extra = {}) {
    const f = await fixture(t); f.state.pauseTransfer = pause;
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-controls-')));
    const profile = path.join(root, 'profile'), directory = path.join(root, 'videos'); fs.mkdirSync(profile); fs.mkdirSync(directory);
    const context = {serverId: 'server', accountId: 'account', itemId: 'item', mediaSourceId: 'source', token, serverAddress: f.emby + '/base'};
    const entered = deferred(); let manager;
    function reopen() {
        manager = createManager({profileRoot: profile, createSession: value => f.session(value), inspector: createInspector({ttl: 0, budget: 500}),
            selectDirectory: async () => ({status: 'selected', directory}), onChange(value) {if (value.bytes >= 1024 && value.state === 'downloading') entered.resolve();}, ...extra});
        return manager;
    }
    reopen();
    t.after(async () => {await manager.close(); fs.rmSync(root, {recursive: true, force: true});});
    return {...f, root, profile, directory, context, entered, reopen, store: createStore(profile), get manager() {return manager;}};
}

test('manual pause checkpoints bytes, survives a new manager/login and resumes only after explicit continue', async t => {
    const f = await setup(t, true), result = await f.manager.enqueue(f.context); await f.entered.promise;
    const paused = await f.manager.control(f.context, {action: 'pause', taskIds: [result.task.id]});
    assert.equal(paused.results[0].status, 'ok');
    const task = f.store.get(result.task.id); assert.equal(task.state, 'paused'); assert.equal(task.reason, 'user-paused');
    assert.equal(task.partial.offset, 1024); assert.equal(fs.statSync(path.join(f.directory, task.partial.name)).size, 1024);
    await f.manager.close(); const next = f.reopen(), before = f.calls.length;
    next.attach(f.context); await next.idle(); assert.equal(f.store.get(task.id).state, 'paused'); assert.equal(f.calls.length, before);
    f.state.pauseTransfer = false; f.state.signature = 'refreshed';
    await next.control(f.context, {action: 'resume', taskIds: [task.id]}); await next.idle();
    const done = f.store.get(task.id); assert.equal(done.state, 'complete'); assert.equal(done.source.kind, 'direct-url');
    assert.ok(f.calls.some(call => call.headers.range === 'bytes=1024-')); assert.deepEqual(fs.readFileSync(path.join(f.directory, done.file.name)), media);
});

test('all-pause prevents a queued second task from starting, then all-continue drains both independently', async t => {
    const f = await setup(t, true), first = await f.manager.enqueue(f.context); await f.entered.promise;
    const second = await f.manager.enqueue({...f.context, itemId: 'item2'});
    assert.equal(f.store.get(second.task.id).state, 'queued');
    await f.manager.control(f.context, {action: 'pause', all: true}); await f.manager.idle();
    assert.deepEqual([first, second].map(value => f.store.get(value.task.id).state), ['paused', 'paused']);
    assert.equal(f.calls.filter(call => call.url.startsWith('/direct') && !call.headers.range).length, 1);
    f.state.pauseTransfer = false;
    await f.manager.control(f.context, {action: 'resume', all: true}); await f.manager.idle();
    for (const value of [first, second]) {const task = f.store.get(value.task.id); assert.equal(task.state, 'complete'); assert.deepEqual(fs.readFileSync(path.join(f.directory, task.file.name)), media);}
});

test('removing an active record waits for transfer shutdown and retains the partial and unrelated files by default', async t => {
    const f = await setup(t, true); fs.writeFileSync(path.join(f.directory, 'user.mkv'), 'user-data');
    const value = await f.manager.enqueue(f.context); await f.entered.promise;
    const part = f.store.get(value.task.id).partial.name;
    const result = await f.manager.control(f.context, {action: 'remove', taskIds: [value.task.id], deleteFiles: false}); await f.manager.idle();
    assert.equal(result.results[0].status, 'ok'); assert.equal(f.store.get(value.task.id), null); assert.deepEqual(f.manager.list(f.context), []);
    assert.equal(fs.statSync(path.join(f.directory, part)).size, 1024); assert.equal(fs.readFileSync(path.join(f.directory, 'user.mkv'), 'utf8'), 'user-data');
    await f.manager.close(); const next = f.reopen(); next.attach(f.context); await next.idle(); assert.deepEqual(next.list(f.context), []);
    assert.ok(fs.existsSync(path.join(f.directory, part)), 'unindexed media is never adopted or cleaned');
});

test('completed record removal retains its usable movie and cannot select another account task', async t => {
    const f = await setup(t), value = await f.manager.enqueue(f.context); await f.manager.idle();
    const task = f.store.get(value.task.id), file = path.join(f.directory, task.file.name);
    assert.throws(() => f.manager.targets({...f.context, accountId: 'other'}, {taskIds: [task.id], action: 'remove'}));
    const retired = await f.manager.control({...f.context, accountId: 'other'}, {taskIds: [task.id], action: 'remove'});
    assert.equal(retired.status, 'cancelled'); assert.ok(f.store.get(task.id));
    await f.manager.control(f.context, {action: 'remove', taskIds: [task.id], deleteFiles: false});
    assert.deepEqual(fs.readFileSync(file), media); assert.equal(await f.manager.localSource(f.context), null);
});

test('file-missing is distinct from an offline directory, reconnect recovers without rewriting or clearing the receipt', async t => {
    const f = await setup(t), value = await f.manager.enqueue(f.context); await f.manager.idle();
    const task = f.store.get(value.task.id), file = path.join(f.directory, task.file.name);
    const receipt = path.join(f.profile, 'advance-downloads', task.id + '.json'), before = fs.readFileSync(receipt);
    assert.equal((await f.manager.status(f.context))[0].fileState, 'available');
    const offline = f.directory + '-offline'; fs.renameSync(f.directory, offline);
    assert.equal((await f.manager.status(f.context))[0].fileState, 'directory-unavailable');
    const refused = await f.manager.control(f.context, {action: 'remove', taskIds: [task.id], deleteFiles: true});
    assert.equal(refused.results[0].reason, 'directory-unavailable'); assert.ok(f.store.get(task.id));
    fs.renameSync(offline, f.directory);
    assert.equal((await f.manager.status(f.context))[0].fileState, 'available');
    // Only the explicit failed deletion may record its fixed error; file state itself never changes the receipt.
    const current = fs.readFileSync(receipt); await f.manager.status(f.context); assert.deepEqual(fs.readFileSync(receipt), current);
    assert.ok(before.length); fs.unlinkSync(file);
    assert.equal((await f.manager.status(f.context))[0].fileState, 'file-missing'); assert.ok(f.store.get(task.id));
    await f.manager.control(f.context, {action: 'remove', taskIds: [task.id], deleteFiles: false}); assert.equal(f.store.get(task.id), null);
});

test('replaced movie is reported changed and preserved, explicit redownload publishes a different path', async t => {
    const f = await setup(t), value = await f.manager.enqueue(f.context); await f.manager.idle();
    const task = f.store.get(value.task.id), file = path.join(f.directory, task.file.name); fs.renameSync(file, file + '.retained'); fs.writeFileSync(file, 'unrelated replacement');
    assert.equal((await f.manager.status(f.context))[0].fileState, 'file-changed');
    const refused = await f.manager.control(f.context, {action: 'remove', taskIds: [task.id], deleteFiles: true});
    assert.equal(refused.results[0].reason, 'file-changed'); assert.ok(f.store.get(task.id));
    await f.manager.control(f.context, {action: 'resume', taskIds: [task.id]}); await f.manager.idle();
    const next = f.store.get(task.id); assert.equal(next.state, 'complete'); assert.notEqual(next.file.name, task.file.name);
    assert.equal(fs.readFileSync(file, 'utf8'), 'unrelated replacement'); assert.deepEqual(fs.readFileSync(path.join(f.directory, next.file.name)), media);
});

test('pause during source preflight keeps a non-authorizing paused attempt and deletion clears it without a receipt', async t => {
    const f = await setup(t); await f.manager.close();
    const entered = deferred(), gate = deferred();
    const manager = createManager({profileRoot: f.profile, selectDirectory: async () => ({status: 'selected', directory: f.directory}), createSession() {return {
        async acquire(signal) {entered.resolve(); await gate.promise; if (signal.aborted) throw require('../src/electronapp/enhanced/advance-download/source-probe').failure('cancelled');}, close() {}
    };}}); t.after(() => manager.close());
    const pending = manager.enqueue(f.context); await entered.promise;
    const id = manager.list(f.context)[0].id;
    const pause = manager.control(f.context, {action: 'pause', taskIds: [id]}); await Promise.resolve(); gate.resolve();
    await pause; assert.equal((await pending).status, 'cancelled'); assert.equal(manager.list(f.context)[0].state, 'paused');
    await manager.control(f.context, {action: 'remove', taskIds: [id], deleteFiles: true}); assert.deepEqual(manager.list(f.context), []);
    assert.deepEqual(f.store.list(), []); assert.deepEqual(fs.readdirSync(f.directory), []);
});

test('account/token retirement, logout and shutdown abort an owned file-delete operation and preserve its receipt', async t => {
    for (const mode of ['account', 'credentials', 'logout', 'shutdown']) {
        const entered = deferred(), gate = deferred(); let signal;
        const f = await setup(t, false, {deleteFiles: async (_task, value) => {
            signal = value; entered.resolve(); await gate.promise;
            if (signal.aborted) throw require('../src/electronapp/enhanced/advance-download/source-probe').failure('file-delete-unconfirmed');
            throw Error('must be aborted before any file mutation');
        }});
        const value = await f.manager.enqueue(f.context); await f.manager.idle();
        const task = f.store.get(value.task.id), file = path.join(f.directory, task.file.name);
        const removing = f.manager.control(f.context, {action: 'remove', taskIds: [task.id], deleteFiles: true}); await entered.promise;
        let retirement;
        if (mode === 'account') f.manager.attach({...f.context, accountId: 'other'});
        else if (mode === 'credentials') f.manager.attach({...f.context, token: 'refreshed'});
        else retirement = mode === 'logout' ? f.manager.pauseAll() : f.manager.close();
        assert.equal(signal.aborted, true, mode); gate.resolve();
        assert.equal((await removing).status, 'cancelled', mode); if (retirement) await retirement;
        assert.ok(f.store.get(task.id), mode); assert.deepEqual(fs.readFileSync(file), media, mode);
    }
});

test('a repeated preflight is retired and deleting the visible attempt cannot let an older preparation recreate a task', async t => {
    const f = await setup(t); await f.manager.close();
    const gates = [deferred(), deferred()], entries = [deferred(), deferred()]; let count = 0;
    const manager = createManager({profileRoot: f.profile, selectDirectory: async () => ({status: 'selected', directory: f.directory}), createSession() {
        const index = count++;
        return {async acquire(signal) {entries[index].resolve(); await gates[index].promise;
            if (signal.aborted) throw require('../src/electronapp/enhanced/advance-download/source-probe').failure('cancelled');
            throw Error('no old source should survive');}, close() {}};
    }}); t.after(() => manager.close());
    const first = manager.enqueue(f.context); await entries[0].promise;
    const second = manager.enqueue(f.context); await entries[1].promise;
    const id = manager.list(f.context)[0].id;
    const removing = manager.control(f.context, {action: 'remove', taskIds: [id], deleteFiles: false});
    await Promise.resolve(); gates.forEach(gate => gate.resolve()); await removing;
    assert.equal((await first).status, 'cancelled'); assert.equal((await second).status, 'cancelled');
    assert.deepEqual(manager.list(f.context), []); assert.deepEqual(f.store.list(), []);
});
