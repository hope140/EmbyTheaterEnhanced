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

function makeDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

function makeNativeEndpoint() {
    const target = makeEventTarget();
    let destroyed = 0;
    let nextGenerationId = 0;
    const endpoint = Object.assign(target, {
        style: {},
        operations: [],
        preparePresentation(token) {
            endpoint.operations.push({type: 'preparePresentation', token});
            if (endpoint.preparePresentationHandler) return endpoint.preparePresentationHandler(token);
            return Promise.resolve({ready: true});
        },
        cancelPresentation(token) {
            endpoint.operations.push({type: 'cancelPresentation', token});
            return Promise.resolve({status: 'ok'});
        },
        stopForPresentation(token) {
            endpoint.operations.push({type: 'stopForPresentation', token});
            return Promise.resolve({status: 'accepted'});
        },
        beginGeneration(label, presentationToken) {
            endpoint.operations.push({type: 'beginGeneration', label, presentationToken});
            return Promise.resolve({generationId: ++nextGenerationId});
        },
        retireGeneration(reason) { endpoint.operations.push({type: 'retireGeneration', reason}); },
        observeProperties() { return Promise.resolve({status: 'ok'}); },
        setProperties() { return Promise.resolve({status: 'accepted'}); },
        getProperty() { return Promise.resolve(null); },
        sendCommand(data) {
            endpoint.operations.push({type: 'command', data});
            if (Array.isArray(data) && data[0] === 'loadfile') {
                endpoint.operations.push({type: 'load', url: data[1]});
                setImmediate(() => endpoint.dispatchEvent({type: 'message', data: {type: 'property_change', data: {name: 'core-idle', value: false}}}));
            }
            return Promise.resolve({status: 'accepted'});
        },
        destroy() { destroyed++; return Promise.resolve(); },
        destroyedCount() { return destroyed; }
    });
    return endpoint;
}

function loadPlayer(nativeClient, managerSetup, resolverOverride) {
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
    const strmResolver = resolverOverride || {
        resolveAsync(info) { return Promise.resolve({type: 'native', source: info.nativeSource, reason: 'native_fallback'}); }
    };
    const Player = moduleFactory(globalize, playbackManager, pluginManager, events, embyRouter, appSettings, userSettings,
        amdRequire, connectionManager, strmResolver, undefined, undefined, undefined,
        require('../src/electronapp/enhanced/nexttrack-transition'), nativeClient);
    const player = {};
    if (managerSetup) managerSetup(playbackManager, player);
    Player.call(player);
    return {player, dom, windowTarget, playbackManager};
}

function playOptions(id) {
    return {
        _etePlayRequestId: id,
        url: 'fixture://native-' + id,
        item: {Id: 'item-' + id, MediaType: 'Video', Type: 'Movie', Path: 'fixture.strm'},
        mediaSource: {MediaStreams: [], RunTimeTicks: 5000000000},
        mediaType: 'Video', playMethod: 'DirectPlay', playerStartPositionTicks: 0, fullscreen: false
    };
}

function transitionManagerSetup(items) {
    return function (manager, player) {
        let currentIndex = 0;
        manager._etePlayRequestSequence = 1;
        manager.getCurrentPlayer = function () { return player; };
        manager.getCurrentPlaylistIndex = function () { return currentIndex; };
        manager._playQueueManager = {
            getNextItemInfo() { return {item: items[currentIndex + 1]}; },
            getPlaylist() { return items; }
        };
        async function selectAndPlay(index) {
            currentIndex = index;
            const requestId = ++manager._etePlayRequestSequence;
            await player.stop(false);
            // Mirror PlaybackManager's stale-request check after an awaited stop.
            if (requestId !== manager._etePlayRequestSequence) return;
            return player.play(playOptions(requestId));
        }
        manager.nextTrack = function (current) {
            return selectAndPlay(currentIndex + 1);
        };
        manager.previousTrack = function (current) {
            return selectAndPlay(currentIndex - 1);
        };
        manager.stop = function () {
            // Mirrors tools/patch-playbackmanager.cjs terminal-stop invalidation.
            ++manager._etePlayRequestSequence;
            return player.stop(true);
        };
    };
}

async function waitFor(predicate, message) {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail(message || 'timed out waiting for lifecycle operation');
}

function item(id) {
    return {Id: 'item-' + id, MediaType: 'Video', Type: 'Movie', Path: id + '.strm'};
}

function operationIndex(endpoint, type, predicate) {
    return endpoint.operations.findIndex(row => row.type === type && (!predicate || predicate(row)));
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

test('next and previous retire before prepare, then stop and begin with the same presentation token', async () => {
    const endpoint = makeNativeEndpoint();
    const preparations = new Map();
    endpoint.preparePresentationHandler = token => {
        const pending = makeDeferred();
        preparations.set(token, pending);
        return pending.promise;
    };
    const nativeClient = {create() { return Promise.resolve({mode: 'native-helper', endpoint}); }};
    const {player, playbackManager} = loadPlayer(nativeClient, transitionManagerSetup([item('A'), item('B')]));
    await player.play(playOptions(1));

    const nextStart = endpoint.operations.length;
    const next = playbackManager.nextTrack(player);
    await waitFor(() => preparations.size === 1, 'next preparation did not begin');
    const nextToken = Array.from(preparations.keys())[0];
    const nextOps = endpoint.operations.slice(nextStart);
    assert.ok(operationIndex({operations: nextOps}, 'retireGeneration') >= 0, 'retire must be synchronous before prepare');
    assert.ok(operationIndex({operations: nextOps}, 'retireGeneration') < operationIndex({operations: nextOps}, 'preparePresentation'));
    assert.equal(operationIndex({operations: nextOps}, 'stopForPresentation'), -1, 'prepare must gate the special stop');
    assert.equal(operationIndex({operations: nextOps}, 'command', row => row.data === 'stop'), -1, 'prepare must gate ordinary stop too');
    preparations.get(nextToken).resolve({ready: true});
    await next;
    const nextStopIndex = operationIndex(endpoint, 'stopForPresentation', row => row.token === nextToken);
    const nextBeginIndex = operationIndex(endpoint, 'beginGeneration', row => row.presentationToken === nextToken);
    assert.ok(nextStopIndex >= 0 && nextBeginIndex > nextStopIndex);
    assert.match(endpoint.operations[nextBeginIndex].label, /^play-2-/);
    assert.ok(operationIndex(endpoint, 'load', row => row.url === 'fixture://native-2') >= 0);

    const previousStart = endpoint.operations.length;
    const previous = playbackManager.previousTrack(player);
    await waitFor(() => preparations.size === 2, 'previous preparation did not begin');
    const previousToken = Array.from(preparations.keys())[1];
    const previousOps = endpoint.operations.slice(previousStart);
    assert.ok(operationIndex({operations: previousOps}, 'retireGeneration') >= 0);
    assert.ok(operationIndex({operations: previousOps}, 'retireGeneration') < operationIndex({operations: previousOps}, 'preparePresentation'));
    assert.equal(operationIndex({operations: previousOps}, 'stopForPresentation'), -1);
    preparations.get(previousToken).resolve({ready: true});
    await previous;
    const previousStopIndex = operationIndex(endpoint, 'stopForPresentation', row => row.token === previousToken);
    const previousBeginIndex = operationIndex(endpoint, 'beginGeneration', row => row.presentationToken === previousToken);
    assert.ok(previousStopIndex >= 0 && previousBeginIndex > previousStopIndex);
    assert.match(endpoint.operations[previousBeginIndex].label, /^play-3-/);
    assert.ok(operationIndex(endpoint, 'load', row => row.url === 'fixture://native-3') >= 0);
    await playbackManager.stop(player);
});

test('terminal stop while prepare is pending prevents a late presentation stop and load', async () => {
    const endpoint = makeNativeEndpoint();
    const pending = makeDeferred();
    endpoint.preparePresentationHandler = () => pending.promise;
    const nativeClient = {create() { return Promise.resolve({mode: 'native-helper', endpoint}); }};
    const {player, playbackManager} = loadPlayer(nativeClient, transitionManagerSetup([item('A'), item('B')]));
    await player.play(playOptions(1));
    const next = playbackManager.nextTrack(player);
    await waitFor(() => operationIndex(endpoint, 'preparePresentation') >= 0);
    await playbackManager.stop(player);
    assert.equal(endpoint.destroyedCount(), 1);
    assert.ok(operationIndex(endpoint, 'cancelPresentation') >= 0);
    const opsAtDestroy = endpoint.operations.length;
    pending.resolve({ready: true});
    await next;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(operationIndex(endpoint, 'stopForPresentation'), -1);
    assert.equal(operationIndex(endpoint, 'load', row => row.url === 'fixture://native-2'), -1);
    assert.equal(endpoint.operations.slice(opsAtDestroy).some(row => row.type === 'command' && Array.isArray(row.data) && row.data[0] === 'loadfile'), false);
});

test('a stale B preparation cannot replace newer C playback', async () => {
    const endpoint = makeNativeEndpoint();
    const preparations = new Map();
    endpoint.preparePresentationHandler = token => {
        const pending = makeDeferred();
        preparations.set(token, pending);
        return pending.promise;
    };
    const nativeClient = {create() { return Promise.resolve({mode: 'native-helper', endpoint}); }};
    const {player, playbackManager} = loadPlayer(nativeClient,
        transitionManagerSetup([item('A'), item('B'), item('C')]));
    await player.play(playOptions(1));
    const playB = playbackManager.nextTrack(player);
    await waitFor(() => preparations.size === 1, 'B preparation did not begin');
    const bToken = Array.from(preparations.keys())[0];
    const playC = playbackManager.nextTrack(player);
    await waitFor(() => preparations.size === 2, 'C preparation did not begin');
    const cToken = Array.from(preparations.keys())[1];

    preparations.get(cToken).resolve({ready: true});
    await playC;
    preparations.get(bToken).resolve({ready: true});
    await playB;
    assert.ok(operationIndex(endpoint, 'stopForPresentation', row => row.token === cToken) >= 0);
    assert.ok(operationIndex(endpoint, 'beginGeneration', row => row.presentationToken === cToken) >= 0);
    assert.ok(operationIndex(endpoint, 'load', row => row.url === 'fixture://native-3') >= 0);
    assert.equal(operationIndex(endpoint, 'load', row => row.url === 'fixture://native-2'), -1);
    await player.stop(true);
});

test('prepare rejection fails open through the ordinary stop path', async () => {
    const endpoint = makeNativeEndpoint();
    const pending = makeDeferred();
    endpoint.preparePresentationHandler = () => pending.promise;
    const nativeClient = {create() { return Promise.resolve({mode: 'native-helper', endpoint}); }};
    const {player, playbackManager} = loadPlayer(nativeClient, transitionManagerSetup([item('A'), item('B')]));
    await player.play(playOptions(1));
    const next = playbackManager.nextTrack(player);
    await waitFor(() => operationIndex(endpoint, 'preparePresentation') >= 0);
    pending.reject(new Error('prepare unavailable'));
    await next;
    assert.equal(operationIndex(endpoint, 'stopForPresentation'), -1);
    assert.ok(operationIndex(endpoint, 'command', row => row.data === 'stop') >= 0);
    const nextBegin = endpoint.operations.find(row => row.type === 'beginGeneration' && /^play-2-/.test(row.label));
    assert.ok(nextBegin);
    assert.equal(nextBegin.presentationToken, null);
    assert.ok(operationIndex(endpoint, 'load', row => row.url === 'fixture://native-2') >= 0);
    await player.stop(true);
});
