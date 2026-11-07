'use strict';

const {EventEmitter} = require('node:events');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const libmpvSource = fs.readFileSync(path.join(__dirname, '../../src/electronapp/plugins/libmpv.js'), 'utf8');
const nativeHelperClient = require('../../src/electronapp/native-helper/client');

function makeDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return {promise, resolve, reject};
}

function waitFor(predicate, timeoutMs = 1000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        function poll() {
            if (predicate()) return resolve();
            if (Date.now() - started >= timeoutMs) return reject(new Error('condition-timeout'));
            setImmediate(poll);
        }
        poll();
    });
}

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

class FakeIpc extends EventEmitter {
    constructor() {
        super();
        this.calls = [];
        this.notifications = [];
        this.generationId = null;
        this.nextGenerationId = 163;
        this.bridgeErrors = [];
        this.generationRequiredErrors = [];
        this.mutationsBeforeGeneration = [];
        this.loadCalls = [];
        this.corePlayingEvents = [];
        this.destroyCalls = [];
    }

    invoke(channel, request) {
        this.calls.push({channel, request});
        const operation = request && request.operation;
        const payload = request && request.payload || {};
        if (operation === 'create') {
            return Promise.resolve({
                status: 'ok',
                mode: 'native-helper',
                endpointId: 'diagnostics-regression-endpoint',
                protocolVersion: 1,
                helperVersion: 'fixture-helper',
                libmpvVersion: 'fixture-mpv'
            });
        }
        if (operation === 'observe') return Promise.resolve({status: 'ok'});
        if (operation === 'begin-generation') {
            this.generationId = ++this.nextGenerationId;
            return Promise.resolve({status: 'ok', generationId: this.generationId});
        }
        if (operation === 'set-properties' || operation === 'command') {
            const generationId = payload.generationId;
            if (generationId == null) {
                const error = 'generation-required';
                this.generationRequiredErrors.push({operation, payload});
                this.mutationsBeforeGeneration.push({operation, payload});
                return Promise.resolve({status: 'error', reason: error});
            }
            if (generationId !== this.generationId) return Promise.resolve({status: 'error', reason: 'stale-generation'});
            if (operation === 'command' && Array.isArray(payload.data) && payload.data[0] === 'loadfile') {
                const entry = {generationId, data: payload.data.slice(), emitted: false};
                this.loadCalls.push(entry);
                if (!this.suppressCorePlaying) setImmediate(() => {
                    entry.emitted = true;
                    this.corePlayingEvents.push({generationId, name: 'core-idle', value: false});
                    this.emit(nativeHelperClient.EVENT_CHANNEL, {}, {
                        type: 'property_change',
                        generationId,
                        data: {name: 'core-idle', value: false}
                    });
                });
            }
            return Promise.resolve({status: operation === 'command' ? 'accepted' : 'ok'});
        }
        if (operation === 'get-property') {
            const generationId = payload.generationId;
            if (generationId != null && generationId !== this.generationId) {
                return Promise.resolve({status: 'error', reason: 'stale-generation'});
            }
            return Promise.resolve({status: 'ok', value: null});
        }
        if (operation === 'destroy') {
            this.destroyCalls.push(payload);
            return Promise.resolve({status: 'ok'});
        }
        return Promise.resolve({status: 'ok'});
    }

    send(channel, request) {
        this.notifications.push({channel, request});
    }
}

function makeContext(windowTarget, dom, nativeClient, resolver, downloads, configClient, runtime, fnConnect) {
    let moduleFactory;
    const amdRequire = function (dependencies, callback, errback) {
        if (dependencies && dependencies[0] === 'css!./libmpv') {
            if (typeof callback === 'function') callback();
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
        console: {log() { }},
        define(_dependencies, factory) { moduleFactory = factory; }
    };
    Object.assign(context, runtime || {});
    vm.createContext(context);
    vm.runInContext(libmpvSource, context, {filename: 'libmpv.js'});

    const globalize = {translate(value) { return value; }};
    const playbackManager = {getSubtitleUrl() { return ''; }};
    const pluginManager = {mapPath(_player, value) { return value; }};
    const eventCalls = [];
    const events = {trigger(...args) { eventCalls.push(args); }};
    const embyRouter = {showVideoOsd() { return Promise.resolve(); }, setTransparency() { }};
    const appSettings = {get() { return undefined; }, set() { }};
    const userSettings = {getSubtitleAppearanceSettings() { return {}; }};
    const connectionManager = {getApiClient() {return {};}};
    const Player = moduleFactory(
        globalize,
        playbackManager,
        pluginManager,
        events,
        embyRouter,
        appSettings,
        userSettings,
        amdRequire,
        connectionManager,
        resolver,
        configClient || {begin: async () => ({config: {version: 1, enabled: true, cd2: {enabled: true}, rules: []},
            lease: 'synthetic-playback-config', release() {}})},
        undefined,
        undefined,
        require('../../src/electronapp/enhanced/nexttrack-transition'),
        nativeClient,
        downloads,
        fnConnect
    );
    const player = {};
    Player.call(player);
    return {player, context, eventCalls};
}

function makePlayOptions(url) {
    return {
        _etePlayRequestId: 1,
        url,
        item: {MediaType: 'Video', Type: 'Movie', Path: '/fixture/diagnostics-delayed.strm'},
        mediaSource: {
            Path: '/fixture/diagnostics-delayed.strm',
            MediaStreams: [],
            RunTimeTicks: 5000000000
        },
        mediaType: 'Video',
        playMethod: 'DirectPlay',
        playerStartPositionTicks: 0,
        fullscreen: false
    };
}

function getHttp(url) {
    return new Promise((resolve, reject) => {
        const request = http.get(url, response => {
            response.resume();
            response.on('end', resolve);
        });
        request.on('error', reject);
    });
}

function startupFixture(runtime, fnConnect) {
    const ipc = new FakeIpc(), target = makeEventTarget();
    ipc.suppressCorePlaying = true;
    Object.assign(target, {ipc, platform: 'win32', PlayerWindowId: 1, fs: {existsSync: () => false}});
    const realResolver = require('../../src/electronapp/resolvers/strm-resolver');
    const resolves = [], cancellations = [], controls = {};
    const resolver = Object.assign({}, realResolver, {createSequence(info, dependencies) {
        return realResolver.createSequence(info, {...dependencies, cd2Transport: {
            resolve: async request => {resolves.push(request); if (controls.resolve) await controls.resolve(request); return {status: 'hit', type: 'url',
                source: 'https://synthetic.invalid/' + request.mode,
                sourceKind: request.mode === 'direct' ? 'direct-url' : 'cd2-url',
                requestOptions: {userAgent: 'Synthetic-Agent'}};},
            cancel: id => cancellations.push(id)
        }});
    }});
    const config = {version: 1, enabled: true, rules: [{id: 'rule', enabled: true, strategy: 'cloud-first',
        sourcePrefix: '/fixture', cloudPrefix: '/cloud', mountPrefix: 'X:\\Fixture'}]};
    let released = 0, started = 0;
    const fixture = makeContext(target, makeDom(), nativeHelperClient, resolver, null,
        {begin: async () => ({config, lease: 'same-lease', release() {released++;}, started() {started++;}})}, runtime, fnConnect);
    const options = makePlayOptions('https://synthetic.invalid/native');
    options.mediaSource.Path = '/fixture/movie.mkv';
    options.item.Id = 'synthetic'; options.item.ServerId = 'synthetic-server'; options.mediaSource.Id = 'synthetic-source';
    options.playerStartPositionTicks = 2460000000;
    options.mediaSource.MediaStreams = [{Type: 'Audio', Index: 0}];
    options.mediaSource.DefaultAudioStreamIndex = 0;
    function property(name, value, generationId = ipc.generationId) {
        ipc.emit(nativeHelperClient.EVENT_CHANNEL, {}, {type: 'property_change', generationId, data: {name, value}});
    }
    function failure(generationId = ipc.generationId, failureKind = 'media-load') {
        ipc.emit(nativeHelperClient.EVENT_CHANNEL, {}, {type: 'bridge_error', generationId,
            reason: 'load-failed', failureKind, endReason: 4, mpvErrorCode: -13});
    }
    return {...fixture, ipc, options, resolves, cancellations, config, controls, property, failure,
        counts: () => ({released, started})};
}

module.exports = {makeDeferred, waitFor, makeEventTarget, makeDom, FakeIpc, makeContext, makePlayOptions, getHttp, startupFixture};
