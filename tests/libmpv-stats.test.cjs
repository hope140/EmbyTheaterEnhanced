'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');

function makeEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(name, listener, options) {
            const rows = listeners.get(name) || [];
            rows.push({listener, once: !!(options && options.once)});
            listeners.set(name, rows);
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
                parentNode: null,
                children: [],
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

function makeEndpoint(values, errors) {
    const target = makeEventTarget();
    const requests = [];
    const endpoint = Object.assign(target, {
        style: {},
        getProperty(name) {
            requests.push(name);
            if (errors && errors[name]) return Promise.reject(errors[name]);
            return Promise.resolve(Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null);
        },
        observeProperties() {
            return Promise.resolve({status: 'ok'});
        },
        setProperties() {
            return Promise.resolve({status: 'accepted'});
        },
        sendCommand(data) {
            if (Array.isArray(data) && data[0] === 'loadfile') {
                this.dispatchEvent({
                    type: 'message',
                    data: {type: 'property_change', data: {name: 'core-idle', value: false}}
                });
            }
            return Promise.resolve({status: 'accepted'});
        },
        destroy() {
            return Promise.resolve();
        }
    });
    return {endpoint, requests};
}

function loadPlayer(options) {
    const settings = options || {};
    const windowTarget = makeEventTarget();
    windowTarget.platform = 'win32';
    windowTarget.PlayerWindowId = 1;
    windowTarget.enhancedDiagnostics = function () {};
    const dom = makeDom();
    const native = makeEndpoint(settings.values || {}, settings.errors || {});
    let moduleFactory;

    const amdRequire = function (dependencies, callback, errback) {
        if (dependencies[0] === 'css!./libmpv') {
            callback();
            return Promise.resolve();
        }
        if (typeof callback === 'function') callback();
        if (typeof errback === 'function') void errback;
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
        {
            isStrm() { return false; },
            resolveAsync(context) {
                return Promise.resolve({type: 'native', source: context.nativeSource, reason: 'not_strm'});
            }
        },
        undefined,
        undefined,
        undefined,
        {create() { return Promise.resolve({mode: 'native-helper', endpoint: native.endpoint}); }}
    ];
    const Player = moduleFactory(...dependencies);
    const player = {};
    Player.call(player);
    return {player, native};
}

function playOptions() {
    return {
        _etePlayRequestId: 1,
        url: 'fixture://stats',
        item: {MediaType: 'Video', Type: 'Movie', Path: 'fixture.mkv'},
        mediaSource: {MediaStreams: [], RunTimeTicks: 5000000000},
        mediaType: 'Video',
        playMethod: 'DirectPlay',
        playerStartPositionTicks: 0,
        fullscreen: false
    };
}

function category(stats, type) {
    return stats.categories.find(item => item && item.type === type);
}

function statValues(categoryValue) {
    return Object.fromEntries(categoryValue.stats.map(item => [item.label, item.value]));
}

test('getStats resolves around optional chapter and preserves available structured values', async function () {
    const propertyUnavailable = new Error('property-unavailable');
    const loaded = loadPlayer({
        values: {
            'audio-codec-name': 'A-available',
            'audio-out-params': {channels: 6, samplerate: 48000},
            'display-names': ['C-available-display'],
            'display-fps': 59.94,
            'display-sync-active': true,
            'frame-drop-count': '9007199254740993',
            'decoder-frame-drop-count': '9007199254740994',
            'mistimed-drop-count': '9007199254740995',
            'vo-delayed-frame-count': '9007199254740996'
        },
        errors: {chapter: propertyUnavailable}
    });

    await loaded.player.play(playOptions());
    const stats = await loaded.player.getStats();

    assert.ok(loaded.native.requests.includes('chapter'), 'getStats must query the observed unavailable property');
    assert.equal(category(stats, 'media').stats.length, 0, 'unavailable chapter follows the existing omitted-null stats contract');

    const audio = statValues(category(stats, 'audio'));
    assert.equal(audio['音频编码:'], 'A-available');
    assert.equal(audio['音频声道:'], 6);
    assert.equal(audio['音频采样率:'], 48000);

    const video = statValues(category(stats, 'video'));
    assert.equal(Array.isArray(video['显示设备:']), true);
    assert.equal(video['显示设备:'].length, 1);
    assert.equal(video['显示设备:'][0], 'C-available-display');
    assert.equal(video['显示帧率:'], 59.94);
    assert.equal(video['显示同步:'], true);
    assert.equal(video['丢帧统计:'], '9007199254740993，损坏帧: 9007199254740994，时移错误: 9007199254740995，延迟: 9007199254740996');

    await loaded.player.stop(true);
});

test('getStats rejects non-property-unavailable errors from an optional stats lookup', async function () {
    const transportFailure = new Error('transport-closed');
    const loaded = loadPlayer({errors: {chapter: transportFailure}});

    await loaded.player.play(playOptions());
    await assert.rejects(loaded.player.getStats(), error => error === transportFailure);
    await loaded.player.stop(true);
});
