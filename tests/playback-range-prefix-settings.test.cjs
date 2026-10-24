'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {appUrl, eventFor} = require('./helpers/trusted-renderer.cjs');

const settings = require('../src/electronapp/enhanced/playback-range-user-settings');
const controllerPath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/cache.js');
const htmlPath = path.join(__dirname, '../src/electronapp/plugins/mpvplayer/cache.html');
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
    return Object.assign({schema: 1, enabled: false, progressPercent: 70, preloadMB: 300}, overrides || {});
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

test('runtime config is default-off and otherwise exposes only the isolated next-prefix policy', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-runtime-');
    const store = settings.createStore({profileRoot});
    assert.equal(store.runtimeConfig(), null);
    store.save(config({enabled: true, progressPercent: 60, preloadMB: 100}));
    assert.deepEqual(store.runtimeConfig(), {
        kind: 'next-prefix',
        root: path.join(profileRoot, 'next-episode-prefix-v1'),
        progressPercent: 60,
        preloadMB: 100,
        prefetchBytes: 100000000,
        timeoutMs: 30000
    });
    assert.equal(fs.existsSync(path.join(profileRoot, 'cache')), false, 'configuration lookup creates no cache');
    assert.deepEqual(Object.keys(store.runtimeConfig()).sort(),
        ['kind', 'prefetchBytes', 'preloadMB', 'progressPercent', 'root', 'timeoutMs']);
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

class FakeNode {
    constructor() {
        this.value = '';
        this.checked = false;
        this.disabled = false;
        this.hidden = false;
        this.textContent = '';
        this.listeners = Object.create(null);
    }
    addEventListener(name, callback) {this.listeners[name] = callback;}
}

function pageFixture() {
    const selectors = ['form', '.chkRangeEnabled', '.selectRangeProgress', '.selectRangePreload',
        '.rangeSettingsState', '.rangeRuntimeState'];
    const nodes = Object.fromEntries(selectors.map(selector => [selector, new FakeNode()]));
    const controls = [nodes['.chkRangeEnabled'], nodes['.selectRangeProgress'], nodes['.selectRangePreload'], new FakeNode()];
    const view = {
        querySelector(selector) {
            if (!nodes[selector]) throw Error('unexpected selector ' + selector);
            return nodes[selector];
        },
        querySelectorAll(selector) {
            assert.equal(selector, 'input,select,button');
            return controls;
        }
    };
    return {view, nodes, controls};
}

function loadController(invoke) {
    let Controller;
    function BaseView() {}
    BaseView.prototype.onResume = function () {};
    BaseView.prototype.onPause = function () {};
    BaseView.prototype.destroy = function () {};
    const define = (_dependencies, factory) => {Controller = factory({hide() {}}, BaseView);};
    define.amd = {};
    vm.runInNewContext(controllerSource, {define, window: {ipc: {invoke}}}, {filename: controllerPath, timeout: 1000});
    return Controller;
}

test('settings page exposes only next-episode controls, an enabled toggle, and strict source-boundary copy', () => {
    assert.doesNotMatch(htmlSource, /最后一次实际播放|另一视频实际开始|最后播放缓存|maxBytes|bytesPerSecond|总磁盘预算|后台预载限速/);
    assert.match(htmlSource, /class="chkRangeEnabled"/);
    assert.doesNotMatch(htmlSource, /chkRangeEnabled[^>]*(?:disabled|hidden)/s);
    assert.match(htmlSource, /下一集/);
    assert.match(htmlSource, /同源|仅限.*来源|来源.*校验|不得.*URL/i);
    assert.doesNotMatch(controllerSource, /txtRangeBudget|txtRangeRate|maxBytes|bytesPerSecond/);
});

test('page loads and saves an enabled next-prefix preference without restart or capacity fields', async () => {
    const calls = [];
    const Controller = loadController(async (channel, value) => {
        calls.push([channel, value]);
        if (channel === settings.CHANNELS.GET) return {status: 'ok', config: config(), runtime: null};
        return {status: 'saved', requiresRestart: false, applyMode: 'next-play',
            config: value, runtime: {enabled: false}};
    });
    const fixture = pageFixture(), page = new Controller(fixture.view);
    page.onResume();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.nodes['.chkRangeEnabled'].disabled, false);
    assert.equal(fixture.nodes['.chkRangeEnabled'].hidden, false);
    assert.equal(fixture.nodes['.selectRangeProgress'].value, '70');
    assert.equal(fixture.nodes['.selectRangePreload'].value, '300');
    fixture.nodes['.chkRangeEnabled'].checked = true;
    fixture.nodes['.selectRangeProgress'].value = '80';
    fixture.nodes['.selectRangePreload'].value = '500';
    await page.save({preventDefault() {}});
    assert.equal(calls[1][0], settings.CHANNELS.SAVE);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), {
        schema: 1, enabled: true, progressPercent: 80, preloadMB: 500
    });
    assert.equal(fixture.nodes['.rangeSettingsState'].textContent.includes('重启'), false);
    assert.match(fixture.nodes['.rangeSettingsState'].textContent, /下次播放/);
    assert.equal(fixture.nodes['.rangeRuntimeState'].textContent, '本次运行未启用。');
});
