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
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    temporaryRoots.add(root);
    return root;
}

function config(overrides) {
    return Object.assign({schema: 1, enabled: false, progressPercent: 70, preloadMB: 300}, overrides || {});
}

function ipcFixture(store) {
    const handlers = new Map(), removed = [];
    const ipcMain = {
        handle(channel, handler) { handlers.set(channel, handler); },
        removeHandler(channel) { removed.push(channel); handlers.delete(channel); }
    };
    const trusted = {mainFrame: {url: appUrl}, isDestroyed: () => false};
    const runtime = {active: false};
    const unregister = settings.register({ipcMain, store, getWebContents: () => trusted,
        getRuntimeStatus: () => runtime});
    return {handlers, removed, trusted, runtime, unregister};
}

test('normalize applies only the confirmed four-field defaults and exact choices', () => {
    const normalized = settings.normalize({schema: 1, enabled: false});
    assert.deepEqual(normalized, config());
    assert.deepEqual(Object.keys(normalized).sort(), ['enabled', 'preloadMB', 'progressPercent', 'schema']);
    for (const progressPercent of [50, 60, 70, 80, 90]) {
        assert.equal(settings.normalize(config({progressPercent})).progressPercent, progressPercent);
    }
    for (const preloadMB of [100, 300, 500]) {
        assert.equal(settings.normalize(config({preloadMB})).preloadMB, preloadMB);
    }
});

test('normalize rejects enabled=true until capacity rules are confirmed and rejects unknown/resource fields', () => {
    assert.throws(() => settings.normalize(config({enabled: true})), /capacity-pending/);
    for (const value of [null, undefined, [], 'config', 1]) assert.throws(() => settings.normalize(value));
    for (const field of ['unknown', 'root', 'url', 'cacheRoot', 'profileRoot', 'maxBytes', 'bytesPerSecond']) {
        assert.throws(() => settings.normalize(Object.assign(config(), {[field]: field === 'unknown' ? 1 : '/tmp/canary'})), undefined, field);
    }
    for (const value of [true, '70', 70.5, 0, 100]) {
        assert.throws(() => settings.normalize({schema: 1, enabled: false, progressPercent: value}));
    }
    for (const value of [true, '300', 0, 200, 300.5]) {
        assert.throws(() => settings.normalize({schema: 1, enabled: false, preloadMB: value}));
    }
    for (const value of [{schema: '1', enabled: false}, {schema: 2, enabled: false}, {schema: 1, enabled: 0}]) {
        assert.throws(() => settings.normalize(value));
    }
});

test('legacy f255 settings retain valid choices in memory but are forced off without rewriting the file', () => {
    const profileRoot = temporaryRoot('ete-playback-range-legacy-');
    const directory = path.join(profileRoot, 'config'), file = path.join(directory, 'playback-range.json');
    fs.mkdirSync(directory);
    const oldBytes = JSON.stringify({schema: 1, enabled: true, progressPercent: 80, preloadMB: 500,
        maxBytes: 8388608, bytesPerSecond: 1048576});
    fs.writeFileSync(file, oldBytes);
    const store = settings.createStore({profileRoot});
    assert.deepEqual(store.get(), config({progressPercent: 80, preloadMB: 500}));
    assert.equal(store.runtimeConfig(), null);
    assert.equal(fs.readFileSync(file, 'utf8'), oldBytes, 'loading does not automatically migrate or rewrite old settings');

    const invalidRoot = temporaryRoot('ete-playback-range-legacy-invalid-');
    const invalidDirectory = path.join(invalidRoot, 'config'), invalidFile = path.join(invalidDirectory, 'playback-range.json');
    fs.mkdirSync(invalidDirectory);
    const invalidOldBytes = JSON.stringify({schema: 1, enabled: true, progressPercent: 55, preloadMB: 333,
        maxBytes: 8388608, bytesPerSecond: 1048576});
    fs.writeFileSync(invalidFile, invalidOldBytes);
    assert.deepEqual(settings.createStore({profileRoot: invalidRoot}).get(), config());
    assert.equal(fs.readFileSync(invalidFile, 'utf8'), invalidOldBytes);
});

test('store snapshots are cloned; only disabled selections save and runtime stays unavailable', () => {
    const profileRoot = temporaryRoot('ete-playback-range-settings-');
    const store = settings.createStore({profileRoot});
    const initial = store.get();
    assert.deepEqual(initial, config());
    assert.equal(fs.existsSync(path.join(profileRoot, 'playback-ranges')), false);
    initial.enabled = true;
    assert.equal(store.get().enabled, false);
    assert.equal(store.runtimeConfig(), null);

    const saved = store.save(config({progressPercent: 80, preloadMB: 500}));
    assert.deepEqual(saved, config({progressPercent: 80, preloadMB: 500}));
    saved.progressPercent = 50;
    assert.equal(store.get().progressPercent, 80);
    assert.equal(store.runtimeConfig(), null);
    const file = path.join(profileRoot, 'config', 'playback-range.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), config({progressPercent: 80, preloadMB: 500}));
    assert.deepEqual(settings.createStore({profileRoot}).get(), config({progressPercent: 80, preloadMB: 500}));
    assert.throws(() => store.save(config({enabled: true})), /capacity-pending/);
    assert.deepEqual(store.get(), config({progressPercent: 80, preloadMB: 500}));
});

test('store refuses symlinked profile roots and leaves outside fixture untouched', t => {
    const outside = temporaryRoot('ete-playback-range-outside-');
    const parent = temporaryRoot('ete-playback-range-profile-parent-');
    const alias = path.join(parent, 'profile-link');
    fs.symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => settings.createStore({profileRoot: alias}));
    assert.deepEqual(fs.readdirSync(outside), []);
});

test('failed save leaves snapshot unchanged and rejected input is not reflected', () => {
    const profileRoot = temporaryRoot('ete-playback-range-save-failure-');
    const store = settings.createStore({profileRoot}), previous = store.get();
    const configDir = path.join(profileRoot, 'config');
    fs.mkdirSync(configDir);
    fs.mkdirSync(path.join(configDir, 'playback-range.json'));
    let failure;
    try { store.save(config({progressPercent: 80})); } catch (error) { failure = error; }
    assert.ok(failure, 'save should fail when the target path is a directory');
    assert.deepEqual(store.get(), previous);
    const canary = 'private-range-canary-7f21';
    let rejected;
    try { store.save(Object.assign(config(), {secret: canary})); } catch (error) { rejected = error; }
    assert.ok(rejected);
    assert.doesNotMatch(String(rejected), new RegExp(canary));
});

test('IPC returns next-play capacity-pending state and only admits the trusted main document', async () => {
    const root = temporaryRoot('ete-playback-range-ipc-');
    const store = settings.createStore({profileRoot: root}), fixture = ipcFixture(store);
    const get = fixture.handlers.get(settings.CHANNELS.GET), save = fixture.handlers.get(settings.CHANNELS.SAVE);
    assert.equal(typeof get, 'function');
    assert.equal(typeof save, 'function');
    assert.deepEqual(await get(eventFor(fixture.trusted)), {
        status: 'ok', config: store.get(), runtime: fixture.runtime, capacityPending: true
    });
    assert.deepEqual(await save(eventFor(fixture.trusted), config({progressPercent: 80})), {
        status: 'saved', requiresRestart: false, applyMode: 'next-play', capacityPending: true,
        config: config({progressPercent: 80}), runtime: fixture.runtime
    });

    const foreign = {mainFrame: {url: appUrl}, isDestroyed: () => false}, rejected = [];
    for (const event of [{sender: foreign, senderFrame: foreign.mainFrame}, {sender: fixture.trusted},
        {sender: fixture.trusted, senderFrame: {url: appUrl}}]) rejected.push(await get(event));
    rejected.push(await save({sender: fixture.trusted, senderFrame: {url: appUrl + '#subframe'}}, config()));
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

test('IPC rejects payload-bearing GET and unknown/enabled SAVE without reflecting canaries', async () => {
    const root = temporaryRoot('ete-playback-range-ipc-reject-');
    const store = settings.createStore({profileRoot: root}), fixture = ipcFixture(store), before = store.get();
    const getWithPayload = await fixture.handlers.get(settings.CHANNELS.GET)(eventFor(fixture.trusted), {canary: 'payload-canary'});
    assert.equal(getWithPayload.status, 'error');
    assert.doesNotMatch(JSON.stringify(getWithPayload), /payload-canary/);
    const canary = 'save-canary';
    const badSave = await fixture.handlers.get(settings.CHANNELS.SAVE)(eventFor(fixture.trusted),
        Object.assign(config({enabled: true}), {root: '/sensitive/root', secret: canary}));
    assert.equal(badSave.status, 'error');
    assert.deepEqual(store.get(), before);
    assert.doesNotMatch(JSON.stringify(badSave), /save-canary|sensitive/);

    fixture.unregister();
    assert.equal(fixture.handlers.has(settings.CHANNELS.GET), false);
    assert.equal(fixture.handlers.has(settings.CHANNELS.SAVE), false);
    assert.deepEqual(fixture.removed.sort(), [settings.CHANNELS.GET, settings.CHANNELS.SAVE].sort());
});
