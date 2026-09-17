'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const libmpvSource = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');
const nativeHelperClient = require('../src/electronapp/native-helper/client');

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
                setImmediate(() => {
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

function makeContext(windowTarget, dom, nativeClient, resolver) {
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
    vm.createContext(context);
    vm.runInContext(libmpvSource, context, {filename: 'libmpv.js'});

    const globalize = {translate(value) { return value; }};
    const playbackManager = {getSubtitleUrl() { return ''; }};
    const pluginManager = {mapPath(_player, value) { return value; }};
    const events = {trigger() { }};
    const embyRouter = {showVideoOsd() { return Promise.resolve(); }, setTransparency() { }};
    const appSettings = {get() { return undefined; }, set() { }};
    const userSettings = {getSubtitleAppearanceSettings() { return {}; }};
    const connectionManager = {};
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
        undefined,
        undefined,
        undefined,
        nativeClient
    );
    const player = {};
    Player.call(player);
    return {player, context};
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

test('ready diagnostics fail open before generation while delayed STRM/CD2 play reaches current-generation core-playing', async () => {
    const server = http.createServer((request, response) => {
        response.writeHead(200, {'content-type': 'video/x-fixture'});
        response.end('fixture');
    });
    let cd2Hits = 0;
    server.on('request', () => { cd2Hits++; });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const cd2Url = `http://127.0.0.1:${address.port}/fixture/diagnostics-delayed.mkv`;
    const resolverGate = makeDeferred();
    const resolverEntered = makeDeferred();
    const resolverCalls = [];
    const resolver = {
        isStrm(info) { return !!(info && info.sidecarPath && info.sidecarPath.endsWith('.strm')); },
        resolveAsync(info) {
            resolverCalls.push(info);
            resolverEntered.resolve();
            return resolverGate.promise.then(async () => {
                await getHttp(cd2Url);
                return {
                    type: 'url',
                    source: cd2Url,
                    sourceKind: 'cd2-url',
                    reason: 'cd2_hit',
                    isStrm: true,
                    localExists: false
                };
            });
        },
        routeForResult(result) { return result && result.sourceKind === 'cd2-url' ? 'cd2-http' : 'native'; }
    };
    const ipc = new FakeIpc();
    const windowTarget = makeEventTarget();
    windowTarget.ipc = ipc;
    windowTarget.platform = 'win32';
    windowTarget.PlayerWindowId = 1;
    const readyDiagnostics = makeDeferred();
    const readyRecords = [];
    const bridgeErrors = [];
    const manager = {currentPlayer: null, diagnosticsCleanupCount: 0};
    windowTarget.addEventListener('native-helper-error', event => {
        bridgeErrors.push(event && event.detail && event.detail.reason);
        manager.currentPlayer = null;
        manager.diagnosticsCleanupCount++;
    });
    windowTarget.enhancedDiagnostics = function (bridge, stage) {
        if (stage !== 'ready') return;
        const optional = bridge.getOptionalDiagnosticCacheBytes();
        const snapshot = diagnostics.collect(bridge, windowTarget, stage, 250);
        Promise.all([optional, snapshot]).then(function (values) {
            readyRecords.push({optional: values[0], snapshot: values[1]});
            readyDiagnostics.resolve(values[0]);
        }, readyDiagnostics.reject);
    };

    try {
        const dom = makeDom();
        const loaded = makeContext(windowTarget, dom, nativeHelperClient, resolver);
        const player = loaded.player;
        manager.play = function (options) {
            manager.currentPlayer = player;
            const pending = player.play(options);
            pending.catch(error => {
                if (!error || !error.playbackSuperseded) manager.currentPlayer = null;
            });
            return pending;
        };
        ipc.on(nativeHelperClient.EVENT_CHANNEL, (_event, message) => {
            if (message && message.type === 'bridge_error') bridgeErrors.push(message.reason);
        });
        const playPromise = manager.play(makePlayOptions(cd2Url));

        await resolverEntered.promise;
        const optionalResult = await readyDiagnostics.promise;

        // A-D: diagnostics ran while the endpoint had no playback generation.
        assert.deepEqual(optionalResult, {status: 'unavailable', reason: 'generation-unavailable'});
        assert.equal(readyRecords.length, 1);
        assert.equal(readyRecords[0].snapshot.stage, 'ready');
        assert.equal(ipc.generationId, null, 'the delayed resolver must still precede beginGeneration');
        assert.equal(ipc.mutationsBeforeGeneration.length, 0, 'ready diagnostics must not submit generation-dependent mutations');
        assert.equal(ipc.generationRequiredErrors.length, 0, 'optional diagnostics must not hit generation-required controller paths');
        assert.equal(bridgeErrors.length, 0, 'optional diagnostics must not produce bridge_error');
        assert.equal(manager.diagnosticsCleanupCount, 0, 'diagnostics must not run playback error cleanup');
        assert.strictEqual(manager.currentPlayer, player, 'manager ownership must survive ready diagnostics');

        // E-F: releasing the delayed resolver is the only gate to generation creation and load.
        resolverGate.resolve();
        await playPromise;
        assert.equal(resolverCalls.length, 1);
        assert.equal(cd2Hits, 1, 'the fake CD2 HTTP source must be hit exactly once');
        assert.equal(ipc.calls.filter(call => call.request.operation === 'begin-generation').length, 1);
        assert.equal(ipc.loadCalls.length, 1);
        assert.equal(ipc.loadCalls[0].data[1], cd2Url);
        assert.equal(ipc.loadCalls[0].generationId, ipc.generationId);
        assert.equal(ipc.corePlayingEvents.length, 1);
        assert.deepEqual(ipc.corePlayingEvents[0], {generationId: ipc.generationId, name: 'core-idle', value: false});
        assert.equal(bridgeErrors.length, 0);
        assert.equal(manager.diagnosticsCleanupCount, 0);
        assert.strictEqual(manager.currentPlayer, player, 'diagnostics must not clear currentPlayer after core-playing');
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
