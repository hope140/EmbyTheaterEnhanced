'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {createManager} = require('../src/electronapp/enhanced/advance-download/manager');
const {createStore} = require('../src/electronapp/enhanced/advance-download/task-store');
const {fixture, media, token} = require('./helpers/advance-download-fixture.cjs');

async function paused(t, overrides = {}) {
    const f = await fixture(t);
    Object.assign(f.state, overrides, {pauseTransfer: true});
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-persist-download-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const profile = path.join(root, 'profile'), directory = path.join(root, 'videos'), nextDirectory = path.join(root, 'next');
    for (const folder of [profile, directory, nextDirectory]) fs.mkdirSync(folder);
    const context = {serverId: 'server', accountId: 'account', itemId: 'item', mediaSourceId: 'source', serverAddress: f.emby + '/base', token};
    let manager, stop, stopped;
    const done = new Promise(resolve => {stopped = resolve;});
    const options = {profileRoot: profile, createSession: ctx => f.session(ctx), selectDirectory: async () => ({status: 'selected', directory})};
    manager = createManager({...options, onChange(value) {if (value.bytes >= 1024 && !stop) {stop = manager.close(); stop.then(stopped);}}});
    const queued = await manager.enqueue(context);
    assert.equal(queued.status, 'queued');
    await done;
    const store = createStore(profile), task = store.get(queued.task.id);
    assert.equal(task.state, 'paused');
    assert.equal(task.partial.offset, 1024);
    assert.equal(task.partial.messageComplete, false);
    assert.equal(fs.statSync(path.join(directory, task.partial.name)).size, 1024);
    const metadata = fs.readFileSync(path.join(profile, 'advance-downloads', task.id + '.json'), 'utf8');
    assert.ok(!metadata.includes(token) && !metadata.includes('signature=') && !metadata.includes('X-Emby-Token'));
    f.state.pauseTransfer = false;
    function reopen(extra = {}) {
        const value = createManager({...options, selectDirectory: async () => ({status: 'selected', directory: nextDirectory}), ...extra});
        t.after(() => value.close());
        return value;
    }
    return {...f, root, profile, directory, nextDirectory, context, task, store, reopen};
}

test('shutdown checkpoints owned bytes and a new manager reauthorizes then resumes in the original directory', async t => {
    const f = await paused(t);
    const next = f.reopen();
    // Changing the default affects future tasks; it must not move this one.
    next.attach(f.context);
    await next.idle();
    const task = f.store.get(f.task.id);
    assert.equal(task.state, 'complete');
    assert.equal(task.directory, f.directory);
    assert.deepEqual(fs.readFileSync(path.join(f.directory, task.file.name)), media);
    assert.deepEqual(fs.readdirSync(f.nextDirectory), []);
    assert.ok(f.calls.some(call => call.headers.range === 'bytes=1024-'));
    assert.equal((await next.localSource(f.context)).source, path.join(f.directory, task.file.name));
    f.state.etag = '"another-version"';
    assert.equal(await next.localSource(f.context), null);
    assert.ok(fs.existsSync(path.join(f.directory, task.file.name)), 'a server change does not delete the completed user file');
    const newer = await next.enqueue(f.context); await next.idle();
    assert.equal(newer.status, 'queued');
    const newTask = f.store.get(newer.task.id);
    assert.equal(newTask.directory, f.nextDirectory);
    assert.equal(newTask.state, 'complete');
    assert.equal((await next.localSource(f.context)).source, path.join(f.nextDirectory, newTask.file.name));
    assert.ok(fs.existsSync(path.join(f.directory, task.file.name)), 'changing the default does not move the old complete file');
});

test('missing validators cause an explicit fresh download after reopening instead of unsafe appending', async t => {
    const f = await paused(t, {etag: null});
    const reasons = [], next = f.reopen({onChange: value => {if (value.reason) reasons.push(value.reason);}});
    next.attach(f.context); await next.idle();
    assert.equal(f.store.get(f.task.id).state, 'complete');
    assert.ok(reasons.includes('resume-unavailable-restarting'));
    assert.ok(!f.calls.some(call => /^bytes=\d+-$/.test(call.headers.range || '')));
});

test('changed source content and same-inode corrupt partial bytes are restarted explicitly', async t => {
    for (const change of ['source', 'partial']) {
        const f = await paused(t);
        if (change === 'source') {f.state.etag = '"new-version"'; f.state.body = Buffer.from(media); f.state.body[1200] ^= 1;}
        else fs.writeFileSync(path.join(f.directory, f.task.partial.name), Buffer.alloc(1024));
        const reasons = [], next = f.reopen({onChange: value => {if (value.reason) reasons.push(value.reason);}});
        next.attach(f.context); await next.idle();
        const task = f.store.get(f.task.id);
        assert.equal(task.state, 'complete');
        assert.deepEqual(fs.readFileSync(path.join(f.directory, task.file.name)), f.state.body);
        assert.ok(reasons.includes(change === 'source' ? 'source-changed-restarting' : 'partial-corrupt-restarting'));
        assert.ok(!f.calls.some(call => call.headers.range === 'bytes=1024-'));
    }
});

test('an exchanged partial file is not overwritten, deleted or accepted on restore', async t => {
    const f = await paused(t), temporary = path.join(f.directory, f.task.partial.name);
    fs.renameSync(temporary, path.join(f.directory, 'original-app-partial'));
    fs.writeFileSync(temporary, 'unrelated replacement');
    const next = f.reopen(); next.attach(f.context); await next.idle();
    assert.equal(f.store.get(f.task.id).state, 'failed');
    assert.equal(f.store.get(f.task.id).reason, 'temporary-changed');
    assert.equal(fs.readFileSync(temporary, 'utf8'), 'unrelated replacement');
    assert.ok(!fs.readdirSync(f.directory).some(name => name.endsWith('.mkv')));
});

test('another account cannot resume or discover this task through the manager', async t => {
    const f = await paused(t), next = f.reopen();
    next.attach({...f.context, accountId: 'other'}); await next.idle();
    assert.deepEqual(next.list({...f.context, accountId: 'other'}), []);
    assert.equal(f.store.get(f.task.id).state, 'paused');
    assert.equal(await next.localSource({...f.context, accountId: 'other'}), null);
});

test('a completed local copy still requires current permission, and denied lookup leaves the user file intact', async t => {
    const f = await paused(t), next = f.reopen(); next.attach(f.context); await next.idle();
    const task = f.store.get(f.task.id), file = path.join(f.directory, task.file.name);
    f.state.downloadAllowed = false;
    const count = f.calls.filter(call => call.url.startsWith('/direct')).length;
    assert.equal(await next.localSource(f.context), null);
    assert.deepEqual(fs.readFileSync(file), media);
    assert.equal(f.calls.filter(call => call.url.startsWith('/direct')).length, count, 'denied permission is checked before remote video probes');
});

test('replacing or removing a completed file causes immediate local miss without adopting or modifying the replacement', async t => {
    const f = await paused(t), next = f.reopen(); next.attach(f.context); await next.idle();
    const task = f.store.get(f.task.id), file = path.join(f.directory, task.file.name), retained = file + '.retained';
    fs.renameSync(file, retained);
    const count = f.calls.length;
    assert.equal(await next.localSource(f.context), null);
    fs.writeFileSync(file, media);
    assert.equal(await next.localSource(f.context), null);
    assert.equal(f.calls.length, count, 'an invalid local index does not delay the normal playback path with network probes');
    assert.deepEqual(fs.readFileSync(retained), media); assert.deepEqual(fs.readFileSync(file), media);
});

test('a crash window after file publication can finish the receipt without duplicating or replacing the video', async t => {
    const f = await paused(t);
    const originalSave = f.store.save;
    let failed = false;
    const guarded = {...f.store, save(task) {
        if (!failed && task.state === 'complete') {failed = true; throw Error('synthetic failure after publication');}
        return originalSave(task);
    }};
    const first = f.reopen({store: guarded}); first.attach(f.context); await first.idle(); await first.close();
    const partial = f.store.get(f.task.id).partial;
    assert.ok(partial.publishing);
    assert.ok(fs.existsSync(path.join(f.directory, partial.publishing)));
    const next = f.reopen(); next.retry(f.context, f.task.id); await next.idle();
    const task = f.store.get(f.task.id);
    assert.equal(task.state, 'complete');
    assert.equal(task.file.name, partial.publishing);
    assert.deepEqual(fs.readFileSync(path.join(f.directory, task.file.name)), media);
    assert.equal(fs.readdirSync(f.directory).filter(name => name.endsWith('.mkv')).length, 1);
});

test('persisted tasks reject secret-bearing fields and preserve malformed receipts and foreign files', async t => {
    const f = await paused(t);
    assert.throws(() => f.store.save({...f.task, token: 'never-persist-this'}));
    assert.throws(() => f.store.save({...f.task, source: {...f.task.source, url: 'https://invalid/?secret=never'}}));
    const receipt = path.join(f.profile, 'advance-downloads', f.task.id + '.json');
    fs.writeFileSync(receipt, 'malformed-user-data');
    assert.deepEqual(f.store.list(), []);
    assert.throws(() => f.store.save(f.task));
    assert.equal(fs.readFileSync(receipt, 'utf8'), 'malformed-user-data');
});

test('switching accounts during source acquisition or an open folder dialog retires the old preparation', async t => {
    for (const stage of ['source', 'directory']) {
        const f = await fixture(t);
        const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-account-download-')));
        t.after(() => fs.rmSync(root, {recursive: true, force: true}));
        const directory = path.join(root, 'videos'); fs.mkdirSync(directory);
        const context = {serverId: 'server', accountId: 'account', itemId: 'item', mediaSourceId: 'source', serverAddress: f.emby + '/base', token};
        let release, entered;
        const blocked = new Promise(resolve => {entered = resolve;}), held = new Promise(resolve => {release = resolve;});
        const manager = createManager({profileRoot: root, createSession(ctx) {
            const session = f.session(ctx);
            return {async acquire(signal) {
                if (stage === 'source') {entered(); await held;}
                return session.acquire(signal);
            }, close: () => session.close()};
        }, async selectDirectory() {
            if (stage === 'directory') {entered(); await held;}
            return {status: 'selected', directory};
        }});
        t.after(() => manager.close());
        const pending = manager.enqueue(context); await blocked;
        manager.attach({...context, accountId: 'other'}); release();
        const result = await pending; await manager.idle();
        assert.equal(result.status, 'cancelled', stage);
        assert.deepEqual(manager.list(context), []);
        assert.deepEqual(fs.readdirSync(directory), []);
    }
});

test('cancel in settings then original download selects directory before failed preflight, leaves diagnostics and allows retry', async t => {
    const {createStore: preferences, createSelector} = require('../src/electronapp/enhanced/advance-download/directory-preferences');
    const probe = require('../src/electronapp/enhanced/advance-download/source-probe');
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-preflight-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const directory = path.join(root, 'videos'); fs.mkdirSync(directory);
    const events = [];
    const prefs = preferences(root);
    const selector = createSelector({store: prefs, dialog: {async showOpenDialog() {
        events.push('picker'); return events.length === 1 ? {canceled: true, filePaths: []} : {canceled: false, filePaths: [directory]};
    }}});
    assert.equal((await selector.select({force: true})).status, 'cancelled');
    assert.equal(prefs.read(), null);
    const manager = createManager({profileRoot: root, selectDirectory: value => selector.select(value), createSession() {return {
        async acquire() {events.push('source'); const error = probe.failure('invalid-metadata'); error.downloadStage = 'permission-check'; throw error;}, close() {}
    };}});
    t.after(() => manager.close());
    const context = {serverId: 'server', accountId: 'account', itemId: 'item', token: 'synthetic', serverAddress: 'http://127.0.0.1', displayTitle: 'Fixture video'};
    const result = await manager.enqueue(context);
    assert.equal(result.reason, 'invalid-metadata');
    assert.deepEqual(events, ['picker', 'picker', 'source']);
    assert.equal(prefs.read(), directory);
    const failed = manager.list(context)[0];
    assert.equal(failed.directory, directory); assert.equal(failed.stage, 'permission-check');
    assert.equal(failed.title, 'Fixture video'); assert.equal(failed.state, 'failed');
    assert.ok(!JSON.stringify(failed).includes('synthetic'));
    assert.deepEqual(fs.readdirSync(directory), []);
    assert.equal((await manager.retry(context, failed.id)).reason, 'invalid-metadata');
    assert.deepEqual(events, ['picker', 'picker', 'source', 'source']);
    assert.equal(manager.list(context).length, 1);
    assert.deepEqual(manager.list({...context, accountId: 'other'}), []);
});

test('closing during first native picker does not wait and cannot start source work after late selection', async t => {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-picker-close-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    let release, entered, sourceCalls = 0;
    const held = new Promise(resolve => {release = resolve;}), gate = new Promise(resolve => {entered = resolve;});
    const manager = createManager({profileRoot: root, selectDirectory() {entered(); return held;}, createSession() {sourceCalls++; throw Error('must not start');}});
    const pending = manager.enqueue({serverId: 'server', accountId: 'account', token: 'synthetic'});
    await gate; await manager.close();
    release({status: 'selected', directory: root});
    assert.equal((await pending).status, 'cancelled'); assert.equal(sourceCalls, 0);
});
