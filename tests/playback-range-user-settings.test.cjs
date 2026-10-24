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
function config(overrides) {return Object.assign({schema: 1, enabled: false, progressPercent: 70, preloadMB: 300}, overrides || {});}

test('normalize applies defaults and accepts enabled next-prefix settings without user resource fields', () => {
    assert.deepEqual(settings.normalize({schema: 1, enabled: false}), config());
    const enabled = config({enabled: true, progressPercent: 80, preloadMB: 500});
    assert.deepEqual(settings.normalize(enabled), enabled);
    for (const value of [null, undefined, [], 'config', 1]) assert.throws(() => settings.normalize(value));
    for (const field of ['maxBytes', 'minFreeBytes', 'bytesPerSecond', 'root', 'url', 'profileRoot']) {
        assert.throws(() => settings.normalize(Object.assign(config(), {[field]: 1024})));
    }
    for (const value of [49, 55, 100, '80']) assert.throws(() => settings.normalize(config({progressPercent: value})));
    for (const value of [0, 200, 250, '300']) assert.throws(() => settings.normalize(config({preloadMB: value})));
    assert.throws(() => settings.normalize({schema: 2, enabled: true}));
});

test('legacy resource-bearing experiment config preserves choices but cannot restore enabled state', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-old-config-');
    const directory = path.join(profileRoot, 'config'), file = path.join(directory, 'playback-range.json');
    fs.mkdirSync(directory);
    const bytes = JSON.stringify({schema: 1, enabled: true, progressPercent: 90, preloadMB: 100,
        maxBytes: 16777216, minFreeBytes: 67108864, bytesPerSecond: 1048576});
    fs.writeFileSync(file, bytes);
    const store = settings.createStore({profileRoot});
    assert.deepEqual(store.get(), config({progressPercent: 90, preloadMB: 100}));
    assert.equal(store.runtimeConfig(), null);
    assert.equal(fs.readFileSync(file, 'utf8'), bytes, 'loading legacy input does not migrate or rewrite the file');
});

test('store clones snapshots, atomically persists enabled choices, reopens, and exposes only next-prefix policy', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-store-'), store = settings.createStore({profileRoot});
    assert.deepEqual(store.get(), config());
    assert.equal(store.runtimeConfig(), null);
    const saved = config({enabled: true, progressPercent: 60, preloadMB: 100});
    const returned = store.save(saved);
    returned.enabled = false;
    assert.equal(store.get().enabled, true);
    assert.deepEqual(settings.createStore({profileRoot}).get(), saved);
    assert.deepEqual(store.runtimeConfig(), {
        kind: 'next-prefix', root: path.join(profileRoot, 'next-episode-prefix-v1'),
        progressPercent: 60, preloadMB: 100, prefetchBytes: 100000000, timeoutMs: 30000
    });
    assert.equal(fs.existsSync(path.join(profileRoot, 'cache')), false);
    assert.deepEqual(Object.keys(store.runtimeConfig()).sort(),
        ['kind', 'prefetchBytes', 'preloadMB', 'progressPercent', 'root', 'timeoutMs']);
});

test('store refuses a symlinked profile root without touching its target', t => {
    const outside = temporaryRoot('ete-next-prefix-outside-'), parent = temporaryRoot('ete-next-prefix-parent-');
    const alias = path.join(parent, 'profile-link');
    fs.symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => settings.createStore({profileRoot: alias}));
    assert.deepEqual(fs.readdirSync(outside), []);
});

test('failed Save leaves the prior snapshot unchanged and does not echo rejected values', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-save-failure-'), store = settings.createStore({profileRoot});
    const previous = store.get(), directory = path.join(profileRoot, 'config');
    fs.mkdirSync(directory);
    fs.mkdirSync(path.join(directory, 'playback-range.json'));
    let failure;
    try {store.save(config({enabled: true}));} catch (error) {failure = error;}
    assert.ok(failure);
    assert.deepEqual(store.get(), previous);
    let rejected;
    try {store.save(Object.assign(config(), {secret: 'save-canary'}));} catch (error) {rejected = error;}
    assert.ok(rejected);
    assert.doesNotMatch(String(rejected), /save-canary/);
});

test('IPC applies accepted settings on next play, reports effective state separately, and keeps trusted boundary', async () => {
    const profileRoot = temporaryRoot('ete-next-prefix-ipc-'), store = settings.createStore({profileRoot});
    const handlers = new Map(), removed = [], trusted = {mainFrame: {url: appUrl}, isDestroyed: () => false};
    const effective = {enabled: false};
    const unregister = settings.register({ipcMain: {
        handle(channel, handler) {handlers.set(channel, handler);},
        removeHandler(channel) {removed.push(channel); handlers.delete(channel);}
    }, store, getWebContents: () => trusted, getRuntimeStatus: () => effective});
    const get = handlers.get(settings.CHANNELS.GET), save = handlers.get(settings.CHANNELS.SAVE);
    const saved = config({enabled: true, progressPercent: 80, preloadMB: 500});
    assert.deepEqual(await get(eventFor(trusted)), {status: 'ok', config: config(), runtime: effective});
    assert.deepEqual(await save(eventFor(trusted), saved), {
        status: 'saved', requiresRestart: false, applyMode: 'next-play', config: saved, runtime: effective
    });
    assert.deepEqual(store.get(), saved);
    assert.equal(Object.hasOwn(await get(eventFor(trusted)), 'capacityPending'), false);

    const foreign = {mainFrame: {url: appUrl}, isDestroyed: () => false};
    for (const event of [{sender: foreign, senderFrame: foreign.mainFrame}, {sender: trusted},
        {sender: trusted, senderFrame: {url: appUrl}}]) {
        assert.equal((await get(event)).reason, 'untrusted_sender');
    }
    const bad = await save(eventFor(trusted), Object.assign({}, saved, {maxBytes: 1234}));
    assert.equal(bad.status, 'error');
    assert.deepEqual(store.get(), saved);
    unregister();
    assert.equal(handlers.size, 0);
    assert.deepEqual(removed.sort(), [settings.CHANNELS.GET, settings.CHANNELS.SAVE].sort());
});
