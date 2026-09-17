'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');
const TOAST_TEXT = '增强播放源不可用，已回退 Emby 原生播放';

function makeEventTarget() {
    const listeners = new Map();
    return {
        registrations: [],
        addEventListener(name, listener, options) {
            const row = {listener, once: !!(options && options.once)};
            if (!listeners.has(name)) listeners.set(name, []);
            listeners.get(name).push(row);
            this.registrations.push({name, listener});
        },
        removeEventListener(name, listener) {
            const rows = listeners.get(name) || [];
            listeners.set(name, rows.filter(row => row.listener !== listener));
        },
        dispatchEvent(event) {
            const rows = (listeners.get(event.type) || []).slice();
            for (const row of rows) {
                row.listener.call(this, event);
                if (row.once) this.removeEventListener(event.type, row.listener);
            }
            return true;
        }
    };
}

function makeClassList() {
    return {add() {}, remove() {}};
}

function makeDom() {
    const body = {
        children: [],
        get firstChild() { return this.children[0] || null; },
        insertBefore(node) {
            node.parentNode = this;
            node.isConnected = true;
            this.children.unshift(node);
        },
        removeChild(node) {
            this.children = this.children.filter(child => child !== node);
            node.parentNode = null;
            node.isConnected = false;
        }
    };
    let dialog = null;
    const document = {
        body,
        documentElement: {animate() {}},
        querySelector(selector) {
            return selector === '.mpv-videoPlayerContainer' ? dialog : null;
        },
        createElement(name) {
            const node = {
                classList: makeClassList(),
                style: {},
                children: [],
                parentNode: null,
                get firstChild() { return this.children[0] || null; },
                insertBefore(child) {
                    child.parentNode = this;
                    child.isConnected = true;
                    this.children.unshift(child);
                },
                removeChild(child) {
                    this.children = this.children.filter(item => item !== child);
                    child.parentNode = null;
                    child.isConnected = false;
                }
            };
            dialog = node;
            return node;
        }
    };
    return {document, body};
}

function makeNativeEndpoint() {
    const target = makeEventTarget();
    const commands = [];
    let generationId = 0;
    return Object.assign(target, {
        style: {},
        commands,
        beginGeneration() { return Promise.resolve({generationId: ++generationId}); },
        retireGeneration() {},
        observeProperties() { return Promise.resolve({status: 'ok'}); },
        setProperties() { return Promise.resolve({status: 'accepted'}); },
        getProperty(name) { return Promise.resolve(name === 'core-idle' ? false : null); },
        sendCommand(data) {
            commands.push(data);
            if (Array.isArray(data) && data[0] === 'loadfile') {
                setImmediate(() => target.dispatchEvent({type: 'message', data: {type: 'property_change', data: {name: 'core-idle', value: false}}}));
            }
            return Promise.resolve({status: 'accepted'});
        },
        destroy() { return Promise.resolve(); }
    });
}

function routeForResult(result) {
    if (result && result.sourceKind === 'direct-url') return 'direct-url';
    if (result && result.type === 'url' && result.sourceKind === 'cd2-url') return 'cd2-http';
    if (result && result.type === 'local' && result.reason === 'mount_hit') return 'mount';
    if (result && result.type === 'native') return 'native';
    return 'unknown';
}

function makeOptions(overrides) {
    return Object.assign({
        _etePlayRequestId: 1,
        url: 'https://emby.example.test/native',
        item: {MediaType: 'Video', Type: 'Movie', Path: 'episode.strm'},
        mediaSource: {MediaStreams: [], RunTimeTicks: 5000000000},
        mediaType: 'Video',
        playMethod: 'DirectPlay',
        playerStartPositionTicks: 0,
        fullscreen: false
    }, overrides || {});
}

function loadPlayer(options) {
    const settings = options || {};
    const windowTarget = makeEventTarget();
    windowTarget.platform = 'win32';
    windowTarget.enhancedDiagnostics = function () {};
    const dom = makeDom();
    const requireCalls = [];
    const toastCallbacks = [];
    const toastCalls = [];
    let moduleFactory;
    const hasToastModule = Object.prototype.hasOwnProperty.call(settings, 'toastModule');

    const toast = settings.toast || function (text) {
        toastCalls.push(text);
        return Promise.resolve();
    };
    const amdRequire = function (dependencies, callback, errback) {
        const names = Array.isArray(dependencies) ? dependencies.slice() : [];
        requireCalls.push(names);
        if (names[0] === 'toast') {
            if (settings.toastLoader) return settings.toastLoader(callback, errback, toastCallbacks);
            callback(hasToastModule ? settings.toastModule : toast);
            return Promise.resolve();
        }
        if (typeof callback === 'function') callback();
        return Promise.resolve();
    };
    const context = {
        window: windowTarget,
        addEventListener: windowTarget.addEventListener.bind(windowTarget),
        removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
        dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
        document: dom.document,
        XMLHttpRequest: class {
            open(_method, url) { this.url = url; }
            send() {
                this.response = this.url.includes('list_possible') ? '30;60' : 'Current Refresh Rate -: 60';
                if (this.onload) this.onload();
            }
        },
        Event: class { constructor(type) { this.type = type; } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
        AbortController,
        Promise,
        Date,
        Math,
        Array,
        Object,
        String,
        Number,
        RegExp,
        JSON,
        setTimeout,
        clearTimeout,
        console: {log() {}},
        define(_dependencies, factory) { moduleFactory = factory; }
    };
    vm.createContext(context);
    vm.runInContext(source, context, {filename: 'libmpv.js'});

    const result = settings.resolverResult || {
        type: 'native',
        source: 'https://emby.example.test/native',
        reason: 'native_fallback',
        isStrm: true,
        localExists: false,
        fallback: true
    };
    const strmResolver = {
        isStrm() { return settings.isStrm !== undefined ? settings.isStrm : result.isStrm === true; },
        routeForResult,
        resolveAsync() { return Promise.resolve(result); }
    };
    const endpoint = makeNativeEndpoint();
    const dependencies = [
        {translate() { return ''; }},
        {getSubtitleUrl() { return ''; }},
        {mapPath(_player, value) { return value; }},
        {trigger() {}},
        {showVideoOsd() { return Promise.resolve(); }, setTransparency() {}},
        {get() { return undefined; }, set() {}},
        {getSubtitleAppearanceSettings() { return {}; }},
        amdRequire,
        {},
        strmResolver,
        undefined,
        undefined,
        undefined,
        {create() { return Promise.resolve({mode: 'native-helper', endpoint}); }}
    ];
    const Player = moduleFactory(...dependencies);
    const player = {};
    Player.call(player);
    return {player, dom, endpoint, requireCalls, toastCallbacks, toastCalls, toast};
}

async function playAndFlush(player, options) {
    const outcome = await Promise.race([
        player.play(options).then(() => 'resolved'),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 250))
    ]);
    assert.equal(outcome, 'resolved', 'native playback must continue through Toast handling');
    await Promise.resolve();
}

const noToastCases = [
    ['DirectUrl HIT', {type: 'url', source: 'https://cdn.example.test/file', reason: 'direct_url_hit', sourceKind: 'direct-url', isStrm: true}, true],
    ['CD2 HTTP HIT', {type: 'url', source: 'http://127.0.0.1:19798/file', reason: 'cd2_hit', sourceKind: 'cd2-url', isStrm: true}, true],
    ['CD2 timeout then Mount HIT', {type: 'local', source: 'X:\\Media\\file.mkv', reason: 'mount_hit', isStrm: true}, true],
    ['ordinary non-STRM Native', {type: 'native', source: 'https://emby.example.test/native', reason: 'native_fallback', isStrm: false, fallback: true}, false],
    ['resolver_disabled', {type: 'native', source: 'https://emby.example.test/native', reason: 'resolver_disabled', isStrm: true, fallback: true}, true],
    ['no_matching_rule', {type: 'native', source: 'https://emby.example.test/native', reason: 'no_matching_rule', isStrm: true, fallback: true}, true],
    ['transcode_skip', {type: 'native', source: 'https://emby.example.test/native', reason: 'transcode_skip', isStrm: true, fallback: true}, true],
    ['invalid_context', {type: 'native', source: 'https://emby.example.test/native', reason: 'invalid_context', isStrm: true, fallback: true}, true]
];

test('native fallback Toast only triggers for a final STRM native_fallback result', async () => {
    for (const [name, resolverResult, isStrm] of noToastCases) {
        const loaded = loadPlayer({resolverResult, isStrm});
        await playAndFlush(loaded.player, makeOptions());
        assert.equal(loaded.toastCalls.length, 0, name);
        assert.equal(loaded.endpoint.commands.some(message => message[0] === 'loadfile'), true, name);
        await loaded.player.stop(true);
    }

    const fallback = loadPlayer({isStrm: true});
    await playAndFlush(fallback.player, makeOptions());
    assert.deepEqual(fallback.toastCalls, [TOAST_TEXT]);
    const toastLoads = fallback.requireCalls.filter(names => names[0] === 'toast');
    assert.equal(toastLoads.length, 1);
    assert.equal(toastLoads[0][0], 'toast');
    await fallback.player.stop(true);
});

test('a late fallback result from superseded request cannot show a Toast', async () => {
    const loaded = loadPlayer({
        resolverResult: {
            type: 'native',
            source: 'https://emby.example.test/native',
            reason: 'native_fallback',
            isStrm: true,
            fallback: true
        },
        isStrm: true,
        toastLoader(callback, _errback, callbacks) {
            callbacks.push(callback);
        }
    });

    await playAndFlush(loaded.player, makeOptions({_etePlayRequestId: 1}));
    assert.equal(loaded.toastCallbacks.length, 1);
    await playAndFlush(loaded.player, makeOptions({
        _etePlayRequestId: 2,
        item: {MediaType: 'Video', Type: 'Movie', Path: 'next.mkv'},
        mediaSource: {MediaStreams: [], RunTimeTicks: 5000000000, Container: 'mkv'},
        playMethod: 'DirectPlay'
    }));
    loaded.toastCallbacks[0](loaded.toast);
    assert.equal(loaded.toastCalls.length, 0);
    await loaded.player.stop(true);
});

test('one request invokes the native Toast at most once and stop blocks a late loader', async () => {
    const loaded = loadPlayer({
        isStrm: true,
        toastLoader(callback, _errback, callbacks) {
            callbacks.push(callback);
        }
    });

    await playAndFlush(loaded.player, makeOptions());
    assert.equal(loaded.toastCallbacks.length, 1);
    loaded.toastCallbacks[0](loaded.toast);
    loaded.toastCallbacks[0](loaded.toast);
    assert.deepEqual(loaded.toastCalls, [TOAST_TEXT]);

    const late = loadPlayer({
        isStrm: true,
        toastLoader(callback, _errback, callbacks) {
            callbacks.push(callback);
        }
    });
    await playAndFlush(late.player, makeOptions());
    await late.player.stop(true);
    late.toastCallbacks[0](late.toast);
    assert.equal(late.toastCalls.length, 0);
});

test('Toast load, missing API, throw and reject are fail-open for Native playback', async () => {
    const cases = [
        {
            name: 'load failure',
            toastLoader(_callback, errback) { errback(new Error('module unavailable')); }
        },
        {
            name: 'missing API',
            toastModule: undefined
        },
        {
            name: 'API throws',
            toast() { throw new Error('toast failed'); }
        },
        {
            name: 'API rejects',
            toast() { return Promise.reject(new Error('toast rejected')); }
        }
    ];

    for (const settings of cases) {
        const loaded = loadPlayer(settings);
        await playAndFlush(loaded.player, makeOptions());
        assert.equal(loaded.endpoint.commands.some(message => message[0] === 'loadfile'), true, settings.name);
        await loaded.player.stop(true);
    }
});
