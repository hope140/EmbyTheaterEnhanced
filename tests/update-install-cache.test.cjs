'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cache = require('../src/electronapp/enhanced/update-install-cache');
const bytes = Buffer.from('inert update-cache fixture, never executed\n');
function asset(version = '9.1.0') {
    const name = 'EmbyTheaterEnhanced-' + version + '-win-x64-setup.exe';
    return {id: 12, name, url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v' + version + '/' + name,
        size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
}
function fixture(t, overrides = {}) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-owned-update-test-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const state = {downloads: 0, prepared: 0, commits: 0, aborts: 0, cleaned: []};
    const handoff = {prepare: async () => { state.prepared++; return {commit() { state.commits++; }, abort() { state.aborts++; }}; },
        cleanup: async record => { state.cleaned.push(record); }};
    const settings = {profileRoot: root, executable: path.join(root, 'installed', 'electron.exe'), handoff,
        downloadInstaller: async (installer, directory, options) => {
            state.downloads++;
            const temporary = path.join(directory, '.ete-download-' + 'a'.repeat(32) + '.part');
            fs.writeFileSync(temporary, bytes, {flag: 'wx'});
            options.onTemporary(path.basename(temporary), fs.statSync(temporary, {bigint: true}));
            fs.renameSync(temporary, path.join(directory, installer.name));
            return {source: 'github'};
        }, ...overrides};
    const store = cache.createStore(settings);
    const request = version => ({currentVersion: '9.0.0', targetVersion: version || '9.1.0', tag: 'v' + (version || '9.1.0'), signal: new AbortController().signal});
    return {root, state, settings, store, request};
}

test('managed cache is fixed below profile; a verified retry reuses only the same official asset', async t => {
    const f = fixture(t), record = await f.store.download(asset(), f.request());
    assert.equal(path.dirname(record.directory), path.join(f.root, 'updates'));
    assert.equal(f.state.downloads, 1); assert.equal(record.state, 'ready');
    assert.equal((await f.store.download(asset(), f.request())).reused, true);
    assert.equal(f.state.downloads, 1);
    const lease = await f.store.prepare(record, f.request().signal);
    await lease.commit(); assert.equal(f.state.commits, 1); assert.equal(f.store.recovery(), true);
    assert.equal((await f.store.reconcile('9.0.0')).removed, 0);
    assert.equal((await f.store.reconcile('invalid')).removed, 0);
    await f.store.reconcile('9.1.0'); assert.equal(f.state.cleaned.length, 1);
    assert.equal(f.state.cleaned[0].files.at(-1).name, 'receipt.json');
});

test('failed preparation, cancellation and failed wizard retain a verified package for explicit retry', async t => {
    const f = fixture(t), record = await f.store.download(asset(), f.request());
    f.settings.handoff.prepare = async () => { throw Error('inert launch refusal'); };
    await assert.rejects(f.store.prepare(record, f.request().signal), /refusal/);
    assert.equal((await f.store.download(asset(), f.request())).reused, true);
    const abort = new AbortController();
    f.settings.handoff.prepare = async () => ({commit() { assert.fail('cancelled commit'); }, abort() { f.state.aborts++; }});
    const lease = await f.store.prepare(record, abort.signal); abort.abort();
    await assert.rejects(lease.commit(), /cancelled/); assert.equal(f.state.aborts, 1);
    assert.equal(fs.existsSync(path.join(record.directory, asset().name)), true);
});

test('newer candidate uses its own directory; old good packages survive until a successful newer startup', async t => {
    const f = fixture(t), old = await f.store.download(asset(), f.request());
    const next = await f.store.download(asset('9.2.0'), f.request('9.2.0'));
    assert.notEqual(old.directory, next.directory);
    await f.store.reconcile('9.0.0'); assert.equal(f.state.cleaned.length, 0);
    await f.store.reconcile('9.2.0'); assert.equal(f.state.cleaned.length, 2);
    assert.equal(fs.readFileSync(path.join(old.directory, asset().name), 'utf8'), bytes.toString());
});

test('another installation location cannot confirm this cache; busy cleanup keeps a retryable verified installer', async t => {
    const f = fixture(t), record = await f.store.download(asset(), f.request());
    const lease = await f.store.prepare(record, f.request().signal); await lease.commit();
    const elsewhere = cache.createStore({...f.settings, executable: path.join(f.root, 'another-install', 'electron.exe')});
    assert.equal((await elsewhere.reconcile('9.1.0')).removed, 0); assert.equal(f.state.cleaned.length, 0);
    f.settings.handoff.cleanup = async () => { throw Error('inert installer still busy'); };
    assert.deepEqual(await f.store.reconcile('9.1.0'), {removed: 0, retained: 1});
    assert.equal((await f.store.download(asset(), f.request())).reused, true);
    assert.equal(fs.existsSync(path.join(record.directory, asset().name)), true);
});

test('disk budget and actual ENOSPC fail without erasing any existing verified package', async t => {
    const f = fixture(t);
    await f.store.download(asset(), f.request());
    const limited = cache.createStore({...f.settings, statfs: () => ({bavail: 0n, bsize: 4096n})});
    assert.equal((await limited.download(asset(), f.request())).reused, true);
    await assert.rejects(limited.download(asset('9.2.0'), f.request('9.2.0')), /disk-full/);
    const full = cache.createStore({...f.settings, downloadInstaller: async () => { throw Object.assign(Error('disk'), {code: 'ENOSPC'}); }});
    await assert.rejects(full.download(asset('9.2.0'), f.request('9.2.0')), {code: 'ENOSPC'});
    assert.equal(f.state.downloads, 1);
});

test('retry after a failed transfer reuses only its empty owned attempt and never resumes partial bytes', async t => {
    const f = fixture(t), original = f.settings.downloadInstaller;
    let first = true;
    const store = cache.createStore({...f.settings, downloadInstaller: async (installer, directory, options) => {
        if (!first) return original(installer, directory, options);
        first = false;
        const temporary = path.join(directory, '.ete-download-' + 'a'.repeat(32) + '.part');
        fs.writeFileSync(temporary, 'incomplete', {flag: 'wx'});
        options.onTemporary(path.basename(temporary), fs.statSync(temporary, {bigint: true}));
        fs.unlinkSync(temporary); throw Object.assign(Error('network'), {code: 'ECONNRESET'});
    }});
    await assert.rejects(store.download(asset(), f.request()), {code: 'ECONNRESET'});
    const before = fs.readdirSync(path.join(f.root, 'updates'));
    const record = await store.download(asset(), f.request());
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'updates')), before);
    assert.deepEqual(fs.readFileSync(path.join(record.directory, asset().name)), bytes);
});

for (const mutation of ['bytes', 'replacement', 'hardlink', 'directory', 'receipt-path']) {
    test('cache refuses ' + mutation + ' replacement without execution or cleanup of user files', async t => {
        const f = fixture(t), record = await f.store.download(asset(), f.request());
        const file = path.join(record.directory, asset().name);
        const downloads = path.join(f.root, 'Downloads'); fs.mkdirSync(downloads);
        const manual = path.join(downloads, asset().name); fs.writeFileSync(manual, 'manual user file');
        if (mutation === 'bytes') fs.writeFileSync(file, Buffer.alloc(bytes.length));
        if (mutation === 'replacement') { fs.renameSync(file, file + '.old'); fs.writeFileSync(file, bytes); }
        if (mutation === 'hardlink') fs.linkSync(file, path.join(record.directory, 'foreign-link'));
        if (mutation === 'directory') { fs.renameSync(record.directory, record.directory + '-moved'); fs.mkdirSync(record.directory); }
        if (mutation === 'receipt-path') {
            const receipt = path.join(record.directory, 'receipt.json'), value = JSON.parse(fs.readFileSync(receipt));
            value.installer.name = '../Downloads/' + asset().name; fs.writeFileSync(receipt, JSON.stringify(value));
        }
        await assert.rejects(f.store.prepare(record, f.request().signal));
        assert.equal(f.state.prepared, 0); assert.equal(f.state.commits, 0);
        assert.equal(fs.readFileSync(manual, 'utf8'), 'manual user file');
    });
}

test('symlinked cache root and orphan or malformed records are preserved, never swept recursively', async t => {
    const f = fixture(t), foreign = path.join(f.root, 'foreign'); fs.mkdirSync(foreign);
    const link = path.join(f.root, 'updates');
    fs.symlinkSync(foreign, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(f.store.download(asset(), f.request()), /cache-unsafe/);
    fs.unlinkSync(link); fs.mkdirSync(link);
    const orphan = path.join(link, 'update-' + 'b'.repeat(32)); fs.mkdirSync(orphan);
    fs.writeFileSync(path.join(orphan, 'receipt.json'), '{}');
    fs.writeFileSync(path.join(orphan, 'manual.exe'), 'leave alone');
    await f.store.reconcile('99.0.0');
    assert.equal(fs.readFileSync(path.join(orphan, 'manual.exe'), 'utf8'), 'leave alone');
});
