'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');

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
        querySelector(selector) {
            return selector === '.mpv-videoPlayerContainer' && dialog && dialog.parentNode ? dialog : null;
        },
        createElement() {
            const node = {
                classList: {add() {}, remove() {}},
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
    let destroyed = 0;
    const endpoint = Object.assign(target, {
        style: {},
        beginGeneration() { return Promise.resolve({generationId: 1}); },
        retireGeneration() {},
        observeProperties() { return Promise.resolve({status: 'ok'}); },
        setProperties() { return Promise.resolve({status: 'accepted'}); },
        getProperty() { return Promise.resolve(null); },
        sendCommand(data) {
            if (Array.isArray(data) && data[0] === 'loadfile') {
                setImmediate(() => endpoint.dispatchEvent({type: 'message', data: {type: 'property_change', data: {name: 'core-idle', value: false}}}));
            }
            return Promise.resolve({status: 'accepted'});
        },
        destroy() { destroyed++; return Promise.resolve(); },
        destroyedCount() { return destroyed; }
    });
    return endpoint;
}

function loadPlayer(nativeClient) {
    let moduleFactory;
    const amdRequire = function (_dependencies, callback) {
        if (typeof callback === 'function') callback();
        return Promise.resolve();
    };
    const windowTarget = makeEventTarget();
    windowTarget.platform = 'win32';
    windowTarget.enhancedDiagnostics = function () {};
    const dom = makeDom();
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

    const globalize = {};
    const playbackManager = {getSubtitleUrl() { return ''; }};
    const pluginManager = {mapPath(_player, value) { return value; }};
    const events = {trigger() { }};
    const embyRouter = {showVideoOsd() { return Promise.resolve(); }, setTransparency() { }};
    const appSettings = {get() { return undefined; }, set() { }};
    const userSettings = {getSubtitleAppearanceSettings() { return {}; }};
    const connectionManager = {};
    const strmResolver = {
        resolveAsync(info) { return Promise.resolve({type: 'native', source: info.nativeSource, reason: 'native_fallback'}); }
    };
    const Player = moduleFactory(globalize, playbackManager, pluginManager, events, embyRouter, appSettings, userSettings,
        amdRequire, connectionManager, strmResolver, undefined, undefined, undefined, nativeClient);
    const player = {};
    Player.call(player);
    return {player, dom, windowTarget};
}

function playOptions(id) {
    return {
        _etePlayRequestId: id,
        url: 'fixture://native-' + id,
        item: {MediaType: 'Video', Type: 'Movie', Path: 'fixture.strm'},
        mediaSource: {MediaStreams: [], RunTimeTicks: 5000000000},
        mediaType: 'Video', playMethod: 'DirectPlay', playerStartPositionTicks: 0, fullscreen: false
    };
}

test('concurrent first plays share one native helper creation', async () => {
    const endpoint = makeNativeEndpoint();
    let createCalls = 0;
    let release;
    const nativeClient = {create() {
        createCalls++;
        return new Promise(resolve => { release = () => resolve({mode: 'native-helper', endpoint}); });
    }};
    const {player} = loadPlayer(nativeClient);
    const first = player.play(playOptions(1));
    for (let index = 0; index < 10 && createCalls === 0; index++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(createCalls, 1);
    const second = player.play(playOptions(2));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(createCalls, 1);
    release();
    await assert.rejects(first, error => error && error.playbackSuperseded === true);
    await second;
    assert.equal(createCalls, 1);
    await player.stop(true);
});

test('failed native helper creation removes stale DOM and can retry', async () => {
    const endpoint = makeNativeEndpoint();
    let createCalls = 0;
    const nativeClient = {create() {
        createCalls++;
        return createCalls === 1 ? Promise.reject(new Error('handshake-failed')) : Promise.resolve({mode: 'native-helper', endpoint});
    }};
    const {player, dom} = loadPlayer(nativeClient);
    await assert.rejects(player.play(playOptions(1)), /handshake-failed/);
    assert.equal(dom.body.children.length, 0);
    await player.play(playOptions(2));
    assert.equal(createCalls, 2);
    await player.stop(true);
});
