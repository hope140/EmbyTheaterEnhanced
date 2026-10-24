'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {appUrl, eventFor} = require('./helpers/trusted-renderer.cjs');

const settings = require('../src/electronapp/enhanced/playback-range-user-settings');

const temporaryRoots = new Set();
test.after(() => {for (const root of temporaryRoots) fs.rmSync(root, {recursive: true, force: true});});
function temporaryRoot(prefix) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix))); temporaryRoots.add(root); return root;
}

function enabledConfig(overrides) {
    return Object.assign({
        schema: 1,
        enabled: true,
        progressPercent: 70,
        preloadMB: 300,
        maxBytes: 104857600,
        bytesPerSecond: 5242880
    }, overrides || {});
}

function disabledConfig(overrides) {
    return Object.assign({
        schema: 1,
        enabled: false,
        progressPercent: 70,
        preloadMB: 300,
        maxBytes: null,
        bytesPerSecond: null
    }, overrides || {});
}

function ipcFixture(store) {
    const handlers = new Map();
    const removed = [];
    const ipcMain = {
        handle(channel, handler) { handlers.set(channel, handler); },
        removeHandler(channel) { removed.push(channel); handlers.delete(channel); }
    };
    const trusted = {mainFrame: {url: appUrl}, isDestroyed: () => false};
    const runtime = {active: true};
    const unregister = settings.register({
        ipcMain,
        store,
        getWebContents: () => trusted,
        getRuntimeStatus: () => runtime
    });
    return {handlers, removed, ipcMain, trusted, runtime, unregister};
}

test('normalize applies documented defaults and accepts the exact closed schema', () => {
    const normalized = settings.normalize({schema: 1, enabled: false});
    assert.equal(normalized.schema, 1);
    assert.equal(normalized.enabled, false);
    assert.equal(normalized.progressPercent, 70);
    assert.equal(normalized.preloadMB, 300);

    for (const progressPercent of [50, 60, 70, 80, 90]) {
        assert.equal(settings.normalize({schema: 1, enabled: false, progressPercent}).progressPercent,
            progressPercent);
    }
    for (const preloadMB of [100, 300, 500]) {
        assert.equal(settings.normalize({schema: 1, enabled: false, preloadMB}).preloadMB, preloadMB);
    }
    assert.deepEqual(settings.normalize(disabledConfig()), disabledConfig());
    assert.deepEqual(settings.normalize(enabledConfig()), enabledConfig());
});

test('normalize rejects non-objects, unknown or path-like fields, invalid choices and numeric coercion', () => {
    for (const value of [null, undefined, [], 'config', 1]) assert.throws(() => settings.normalize(value));
    for (const field of ['unknown', 'root', 'url', 'cacheRoot', 'profileRoot']) {
        const value = disabledConfig();
        value[field] = '/tmp/canary';
        assert.throws(() => settings.normalize(value), undefined, field);
    }
    for (const value of [true, '70', 70.5, 0, 100]) {
        assert.throws(() => settings.normalize({schema: 1, enabled: false, progressPercent: value}));
    }
    for (const value of [true, '300', 0, 200, 300.5]) {
        assert.throws(() => settings.normalize({schema: 1, enabled: false, preloadMB: value}));
    }
    for (const config of [
        {schema: '1', enabled: false},
        {schema: 2, enabled: false},
        {schema: 1, enabled: 0},
        {schema: 1, enabled: false, maxBytes: '1024'},
        {schema: 1, enabled: false, bytesPerSecond: {}},
        {schema: 1, enabled: false, maxBytes: -1},
        {schema: 1, enabled: false, bytesPerSecond: 0}
    ]) assert.throws(() => settings.normalize(config));
});

test('enabled resources require bounded safe integers; disabled accepts null or valid values only', () => {
    for (const maxBytes of [262143, 17179869185, 1.5, Number.MAX_SAFE_INTEGER + 1, null]) {
        assert.throws(() => settings.normalize(enabledConfig({maxBytes})));
    }
    for (const bytesPerSecond of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, null]) {
        assert.throws(() => settings.normalize(enabledConfig({bytesPerSecond})));
    }
    assert.equal(settings.normalize(enabledConfig({maxBytes: 262144})).maxBytes, 262144);
    assert.equal(settings.normalize(enabledConfig({maxBytes: 17179869184})).maxBytes, 17179869184);
    assert.equal(settings.normalize(enabledConfig({bytesPerSecond: 1})).bytesPerSecond, 1);
    assert.deepEqual(settings.normalize(disabledConfig({maxBytes: null, bytesPerSecond: null})), disabledConfig());
    assert.throws(() => settings.normalize(disabledConfig({maxBytes: 1})));
    assert.throws(() => settings.normalize(disabledConfig({bytesPerSecond: -1})));
});

test('store starts disabled without creating cache data, clones reads, saves atomically and reopens', () => {
    const profileRoot = temporaryRoot('ete-playback-range-settings-');
    const store = settings.createStore({profileRoot});
    const initial = store.get();
    assert.equal(initial.schema, 1);
    assert.equal(initial.enabled, false);
    assert.equal(initial.maxBytes, null);
    assert.equal(initial.bytesPerSecond, null);
    assert.equal(fs.existsSync(path.join(profileRoot, 'playback-ranges')), false);
    initial.enabled = true;
    assert.equal(store.get().enabled, false);

    const saved = store.save(enabledConfig());
    assert.deepEqual(saved, enabledConfig());
    saved.enabled = false;
    assert.equal(store.get().enabled, true);
    const file = path.join(profileRoot, 'config', 'playback-range.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), enabledConfig());
    const reopened = settings.createStore({profileRoot});
    assert.deepEqual(reopened.get(), enabledConfig());

    const runtime = reopened.runtimeConfig();
    assert.equal(runtime.root, path.join(profileRoot, 'playback-ranges'));
    assert.equal(runtime.maxBytes, enabledConfig().maxBytes);
    assert.equal(runtime.bytesPerSecond, enabledConfig().bytesPerSecond);
    assert.equal(runtime.minFreeBytes, 0);
    assert.equal(runtime.timeoutMs, 30000);
    assert.equal(runtime.progressPercent, 70);
    assert.equal(runtime.preloadMB, 300);
    assert.equal(runtime.prefetchBytes, 300000000);
    assert.equal(settings.createStore({profileRoot: temporaryRoot('ete-playback-range-disabled-')}).runtimeConfig(), null);
});

test('store refuses symlinked profile roots and leaves outside fixture untouched', t => {
    const outside = temporaryRoot('ete-playback-range-outside-');
    const parent = temporaryRoot('ete-playback-range-profile-parent-');
    const alias = path.join(parent, 'profile-link');
    fs.symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => settings.createStore({profileRoot: alias}));
    assert.deepEqual(fs.readdirSync(outside), []);
});

test('failed save leaves in-memory snapshot unchanged and does not echo rejected input', () => {
    const profileRoot = temporaryRoot('ete-playback-range-save-failure-');
    const store = settings.createStore({profileRoot});
    const previous = store.get();
    const configDir = path.join(profileRoot, 'config');
    fs.mkdirSync(configDir);
    fs.mkdirSync(path.join(configDir, 'playback-range.json'));
    const canary = 'private-range-canary-7f21';
    let failure;
    try { store.save(enabledConfig()); } catch (error) { failure = error; }
    assert.ok(failure, 'save should fail when the target path is a directory');
    assert.deepEqual(store.get(), previous);

    let rejected;
    try { store.save(enabledConfig({unexpected: canary})); } catch (error) { rejected = error; }
    assert.ok(rejected);
    assert.doesNotMatch(String(rejected), new RegExp(canary));
});

test('IPC GET and SAVE expose only the trusted main application frame and fixed responses', async () => {
    const root = temporaryRoot('ete-playback-range-ipc-');
    const store = settings.createStore({profileRoot: root});
    const fixture = ipcFixture(store);
    const get = fixture.handlers.get(settings.CHANNELS.GET);
    const save = fixture.handlers.get(settings.CHANNELS.SAVE);
    assert.equal(typeof get, 'function');
    assert.equal(typeof save, 'function');
    assert.deepEqual(await get(eventFor(fixture.trusted)), {
        status: 'ok', config: store.get(), runtime: fixture.runtime
    });
    assert.deepEqual(await save(eventFor(fixture.trusted), enabledConfig()), {
        status: 'saved', requiresRestart: true, config: enabledConfig(), runtime: fixture.runtime
    });

    const foreign = {mainFrame: {url: appUrl}, isDestroyed: () => false};
    const rejected = [];
    for (const event of [
        {sender: foreign, senderFrame: foreign.mainFrame},
        {sender: fixture.trusted},
        {sender: fixture.trusted, senderFrame: {url: appUrl}}
    ]) {
        rejected.push(await get(event));
    }
    const subframe = {sender: fixture.trusted, senderFrame: {url: appUrl + '#subframe'}};
    rejected.push(await save(subframe, enabledConfig()));
    for (const url of ['https://foreign.invalid/?secret=renderer-url-canary', 'about:blank']) {
        fixture.trusted.mainFrame.url = url;
        rejected.push(await get(eventFor(fixture.trusted)));
    }
    fixture.trusted.mainFrame.url = appUrl;
    fixture.trusted.isDestroyed = () => true;
    rejected.push(await get(eventFor(fixture.trusted)));
    fixture.trusted.isDestroyed = () => false;
    assert.ok(rejected.every(result => result.status === 'error'));
    assert.ok(rejected.every(result => result.reason === rejected[0].reason));
    assert.doesNotMatch(JSON.stringify(rejected), /renderer-url-canary|foreign\.invalid|subframe/);
    fixture.unregister();
});

test('IPC rejects GET payloads, unknown SAVE fields, and failed saves without reflecting canaries', async () => {
    const root = temporaryRoot('ete-playback-range-ipc-reject-');
    const store = settings.createStore({profileRoot: root});
    const fixture = ipcFixture(store);
    const before = store.get();
    const getWithPayload = await fixture.handlers.get(settings.CHANNELS.GET)(eventFor(fixture.trusted), {
        canary: 'payload-canary'
    });
    assert.equal(getWithPayload.status, 'error');
    assert.doesNotMatch(JSON.stringify(getWithPayload), /payload-canary/);
    const badSave = await fixture.handlers.get(settings.CHANNELS.SAVE)(eventFor(fixture.trusted),
        enabledConfig({root: '/sensitive/root', secret: 'save-canary'}));
    assert.equal(badSave.status, 'error');
    assert.deepEqual(store.get(), before);
    assert.doesNotMatch(JSON.stringify(badSave), /save-canary|sensitive/);

    fixture.unregister();
    assert.equal(fixture.handlers.has(settings.CHANNELS.GET), false);
    assert.equal(fixture.handlers.has(settings.CHANNELS.SAVE), false);
    assert.deepEqual(fixture.removed.sort(), [settings.CHANNELS.GET, settings.CHANNELS.SAVE].sort());
});

test('lowering below retained indexed bytes refuses the save without deleting or altering cache data', () => {
    const root = temporaryRoot('ete-range-budget-retained-'), store = settings.createStore({profileRoot: root});
    store.save(enabledConfig({maxBytes: 2000000}));
    const cache = path.join(root, 'playback-ranges'); fs.mkdirSync(cache); fs.writeFileSync(path.join(cache, 'owner'), 'ETE byte ranges v2\n');
    const index = JSON.stringify({schema: 1, lastKey: 'synthetic', entries: {synthetic: {blocks: {0: {size: 1000000}}}}});
    fs.writeFileSync(path.join(cache, 'index.json'), index);
    assert.throws(() => store.save(enabledConfig({maxBytes: 262144})), /budget-below-retained-cache/);
    assert.equal(store.get().maxBytes, 2000000); assert.equal(fs.readFileSync(path.join(cache, 'index.json'), 'utf8'), index);
    assert.equal(store.save(enabledConfig({maxBytes: 1000000})).maxBytes, 1000000);
});
test('an active run refuses a smaller enabled budget until disabled and restarted', async () => {
    const root = temporaryRoot('ete-range-budget-active-'), store = settings.createStore({profileRoot: root}); store.save(enabledConfig({maxBytes: 2000000}));
    const main = {mainFrame: {url: appUrl}}, handlers = new Map(); let active = true;
    const unregister = settings.register({ipcMain: {handle: (c, f) => handlers.set(c, f), removeHandler: c => handlers.delete(c)}, store, getWebContents: () => main,
        getRuntimeStatus: () => ({enabled: active, maxBytes: 2000000})});
    assert.equal(handlers.get(settings.CHANNELS.SAVE)(eventFor(main), enabledConfig({maxBytes: 1000000})).reason, 'active-budget-reduction');
    assert.equal(store.get().maxBytes, 2000000); active = false;
    assert.equal(handlers.get(settings.CHANNELS.SAVE)(eventFor(main), enabledConfig({maxBytes: 1000000})).status, 'saved'); unregister();
});
