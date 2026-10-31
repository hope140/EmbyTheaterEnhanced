'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {appUrl, eventFor} = require('./helpers/trusted-renderer.cjs');

const settings = require('../src/electronapp/enhanced/playback-range-user-settings');
const controllerPath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/preload-settings.js');
const htmlPath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/video.html');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');
const temporaryRoots = new Set();
test.after(() => {for (const root of temporaryRoots) fs.rmSync(root, {recursive: true, force: true});});

function temporaryRoot(prefix) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    temporaryRoots.add(root);
    return root;
}

function config(overrides) {
    const value = Object.assign({schema: 1, enabled: false, progressPercent: 70, preloadMB: 300}, overrides || {});
    return {...value, retainPlayback: value.retainPlayback ?? value.enabled};
}

function ipcFixture(store) {
    const handlers = new Map(), trusted = {mainFrame: {url: appUrl}, isDestroyed: () => false};
    const runtime = {enabled: false};
    const unregister = settings.register({ipcMain: {
        handle(channel, handler) {handlers.set(channel, handler);},
        removeHandler(channel) {handlers.delete(channel);}
    }, store, getWebContents: () => trusted, getRuntimeStatus: () => runtime});
    return {handlers, trusted, runtime, unregister};
}

test('normalize allows the confirmed schema only and accepts enabled state without resource fields', () => {
    assert.deepEqual(settings.normalize(config({enabled: true, progressPercent: 80, preloadMB: 500})),
        config({enabled: true, progressPercent: 80, preloadMB: 500}));
    for (const value of [null, undefined, [], 'config', 1]) assert.throws(() => settings.normalize(value));
    for (const field of ['maxBytes', 'minFreeBytes', 'bytesPerSecond', 'root', 'url', 'profileRoot']) {
        assert.throws(() => settings.normalize(Object.assign(config({enabled: true}), {[field]: 1024})));
    }
    for (const value of [49, 55, 100, '80']) assert.throws(() => settings.normalize(config({progressPercent: value})));
    for (const value of [0, 200, 250, '300']) assert.throws(() => settings.normalize(config({preloadMB: value})));
    assert.throws(() => settings.normalize({schema: 2, enabled: true}));
});

test('enabled preferences persist across reopen; old resource-bearing experiment settings do not restore enable', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-settings-');
    const store = settings.createStore({profileRoot});
    assert.deepEqual(store.get(), config());
    const enabled = config({enabled: true, progressPercent: 80, preloadMB: 500});
    assert.deepEqual(store.save(enabled), enabled);
    assert.deepEqual(settings.createStore({profileRoot}).get(), enabled);

    const oldRoot = temporaryRoot('ete-next-prefix-old-experiment-');
    const directory = path.join(oldRoot, 'config'), file = path.join(directory, 'playback-range.json');
    fs.mkdirSync(directory);
    const oldBytes = JSON.stringify({schema: 1, enabled: true, progressPercent: 90, preloadMB: 100,
        maxBytes: 16777216, minFreeBytes: 67108864, bytesPerSecond: 1048576});
    fs.writeFileSync(file, oldBytes);
    const reopenedOld = settings.createStore({profileRoot: oldRoot});
    assert.deepEqual(reopenedOld.get(), config({enabled: false, progressPercent: 90, preloadMB: 100}));
    assert.equal(fs.readFileSync(file, 'utf8'), oldBytes, 'loading the old experiment does not auto-rewrite it');
});

test('runtime config stays default-off and exposes fixed owned roots for source-aware routing', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-runtime-');
    const store = settings.createStore({profileRoot});
    assert.equal(store.runtimeConfig(), null);
    store.save(config({enabled: true, progressPercent: 60, preloadMB: 100}));
    assert.deepEqual(store.runtimeConfig(), {
        kind: 'source-aware',
        root: path.join(profileRoot, 'next-episode-prefix-v1'),
        sharedRoot: path.join(profileRoot, 'shared-playback-byte-cache-v2'),
        progressPercent: 60,
        preloadMB: 100,
        prefetchBytes: (100 * 1024 * 1024),
        preparedHandoff: true, preloadEnabled: true, retainPlayback: true,
        timeoutMs: 30000
    });
    assert.equal(fs.existsSync(path.join(profileRoot, 'cache')), false, 'configuration lookup creates no cache');
    assert.deepEqual(Object.keys(store.runtimeConfig()).sort(),
        ['kind', 'prefetchBytes', 'preloadEnabled', 'preloadMB', 'preparedHandoff', 'progressPercent', 'retainPlayback', 'root', 'sharedRoot', 'timeoutMs']);
});

test('IPC supports explicit enabled settings with next-play application and no restart gate', async () => {
    const root = temporaryRoot('ete-next-prefix-ipc-');
    const store = settings.createStore({profileRoot: root}), fixture = ipcFixture(store);
    const get = fixture.handlers.get(settings.CHANNELS.GET), save = fixture.handlers.get(settings.CHANNELS.SAVE);
    assert.deepEqual(await get(eventFor(fixture.trusted)), {status: 'ok', config: config(), runtime: fixture.runtime});
    const saved = config({enabled: true, progressPercent: 90, preloadMB: 500});
    assert.deepEqual(await save(eventFor(fixture.trusted), saved), {
        status: 'saved', requiresRestart: false, applyMode: 'next-play', config: saved,
        runtime: fixture.runtime
    });
    assert.deepEqual(store.get(), saved);
    assert.equal(Object.hasOwn(await get(eventFor(fixture.trusted)), 'capacityPending'), false);
    fixture.unregister();
});

test('video settings contain the preload controls and use the existing next-play IPC contract', () => {
    assert.match(htmlSource, /启用下一集预载/);
    assert.doesNotMatch(htmlSource, /下次播放生效/);
    assert.doesNotMatch(htmlSource, /rangeRuntimeState|btnSaveRange|当前运行/);
    assert.match(controllerSource, /enhanced-playback-range-settings-get/);
    assert.match(controllerSource, /enhanced-playback-range-settings-save/);
    assert.doesNotMatch(controllerSource, /txtRangeBudget|txtRangeRate|maxBytes|bytesPerSecond/);
});
