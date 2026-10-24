'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {EventEmitter} = require('node:events');
const client = require('../src/electronapp/native-helper/client');

const servicePath = path.resolve(__dirname, '../src/electronapp/native-helper/service.js');
const serviceSource = fs.readFileSync(servicePath, 'utf8');

function deferred() {
    let resolve, reject;
    const promise = new Promise((a, b) => {resolve = a; reject = b;});
    return {promise, resolve, reject};
}

function rangeConfig(name) {
    return {root: path.resolve(path.join(path.sep, 'fixture-range', name)), maxBytes: 16 * 1048576,
        minFreeBytes: 0, blockBytes: 262144, timeoutMs: 1000, bytesPerSecond: 1048576,
        progressPercent: 70, preloadMB: 300};
}

function createHarness(t, initialConfig = null) {
    const sessions = [], helpers = [];
    let providerConfig = initialConfig;
    const requireService = createRequire(servicePath), exported = {exports: {}};
    const sandbox = {module: exported, exports: exported.exports, __dirname: path.dirname(servicePath), process,
        console, Buffer, setTimeout, clearTimeout,
        require(name) {
            if (name === '../enhanced/playback-range-session') {
                return {createSession({config}) {
                    const session = {config: {...config}, closeCalls: 0, retireCalls: 0, closed: false,
                        closeGate: null, failClose: false,
                        async retire() {this.retireCalls++;},
                        async close() {
                            this.closeCalls++;
                            if (this.closeStarted) this.closeStarted.resolve();
                            if (this.closeGate) await this.closeGate.promise;
                            if (this.failClose) throw Error('synthetic-range-close-failure');
                            this.closed = true;
                        },
                        status() {return {enabled: true, root: this.config.root, maxBytes: this.config.maxBytes,
                            progressPercent: this.config.progressPercent, preloadMB: this.config.preloadMB};},
                        async setContext() {return {state: 'ready'};},
                        async select(source) {return {source, canDispatch: () => true, cancel: async () => {}};},
                        async started() {}, async cancelNext() {}, async preload() {return {state: 'ready'};}
                    };
                    sessions.push(session);
                    return session;
                }};
            }
            return requireService(name);
        }};
    vm.runInNewContext(serviceSource, sandbox, {filename: servicePath, timeout: 2000});

    class Window extends EventEmitter {
        constructor() {super(); this.webContents = {isDestroyed: () => false, send() {}}; this.destroyed = false;}
        getBounds() {return {x: 0, y: 0, width: 320, height: 180};}
        setBounds() {}
        getNativeWindowHandle() {return Buffer.from([1, 0, 0, 0]);}
        isDestroyed() {return this.destroyed;}
        isVisible() {return false;}
        isMinimized() {return false;}
        setMenu() {}
        loadURL() {}
        hide() {}
        showInactive() {}
        destroy() {this.destroyed = true; this.emit('closed');}
    }
    const main = new Window();
    class Helper {
        constructor(options) {
            this.options = options;
            this.handshake = {helperVersion: 'fixture-helper', libmpvVersion: 'fixture-libmpv'};
            this.currentGenerationId = null;
            this.generation = 0;
            this.state = {playing: false};
            this.transportTerminated = false;
            this.exited = false;
            this.loaded = [];
            helpers.push(this);
        }
        async start() {return this;}
        beginGeneration() {this.currentGenerationId = ++this.generation; return this.currentGenerationId;}
        retireGeneration() {this.currentGenerationId = null;}
        allocateGenerationId() {return ++this.generation;}
        command() {}
        submitCommand() {}
        setProperty() {}
        async getProperty(name) {return name === 'duration' ? 100 : 0;}
        load(args) {this.loaded.push(args); return {generationId: this.currentGenerationId, promise: Promise.resolve({})};}
        async stop() {this.currentGenerationId = null;}
        async kill() {this.exited = true;}
    }
    const service = exported.exports.createService({electron: {BrowserWindow: Window}, NativeHelperClient: Helper,
        fs: {existsSync: () => true}, getMainWindow: () => main, getWebContents: () => main.webContents,
        runtimeRoot: path.resolve('synthetic-runtime'), getRangeCacheConfig: () => providerConfig});
    t.after(() => service.destroy().catch(() => {}));
    let endpointId = null, requestEpoch = 0;
    async function create() {
        const result = await service.call('create');
        endpointId = result.endpointId;
        return result;
    }
    function begin() {
        return service.call('begin-generation', {requestEpoch: ++requestEpoch}, endpointId);
    }
    return {service, sessions, helpers, main, create, begin,
        setConfig(value) {providerConfig = value;},
        closeGate(session) {const gate = deferred(); session.closeGate = gate; session.closeStarted = deferred(); return {gate, started: session.closeStarted.promise};},
        failClose(session) {session.failClose = true;},
        endpointId: () => endpointId,
        async loadOriginal(generationId, source) {
            return service.call('command', {generationId, data: ['loadfile', source]}, endpointId);
        }};
}

test('disabled startup to enabled next-play config reuses the existing helper', async t => {
    const f = createHarness(t);
    const initial = await f.create();
    assert.equal(initial.rangeCache, null);
    const first = await f.begin();
    assert.equal(first.rangeCache, null);
    assert.equal(f.sessions.length, 0);
    assert.equal(f.helpers.length, 1);

    const selected = rangeConfig('selected-A');
    f.setConfig(selected); // A Save changes only the provider, not this active generation.
    assert.equal(f.service.rangeStatus().enabled, false);
    assert.equal(f.sessions.length, 0);
    const nextPlay = await f.begin();
    assert.equal(nextPlay.rangeCache.root, selected.root);
    assert.equal(f.sessions.length, 1);
    assert.equal(f.helpers.length, 1, 'configuration applies without restarting the helper');
});

test('provider changes during active playback apply only at the next generation safe point', async t => {
    const a = rangeConfig('active-A'), b = rangeConfig('saved-B');
    const f = createHarness(t, a);
    await f.create();
    const active = await f.begin();
    assert.equal(active.rangeCache.root, a.root);
    const sessionA = f.sessions[0];

    f.setConfig(b); // Save itself does not retire or replace the live reader session.
    assert.equal(f.service.rangeStatus().root, a.root);
    assert.equal(sessionA.closeCalls, 0);
    assert.equal(f.sessions.length, 1);

    const next = await f.begin();
    assert.equal(sessionA.closed, true);
    assert.equal(next.rangeCache.root, b.root);
    assert.equal(f.sessions.length, 2);
    assert.equal(f.helpers.length, 1);
});

test('config B superseded by C while old close is held constructs only C', async t => {
    const f = createHarness(t, rangeConfig('active-A'));
    await f.create();
    await f.begin();
    const oldSession = f.sessions[0], {gate, started} = f.closeGate(oldSession);
    f.setConfig(rangeConfig('saved-B'));
    const beginB = f.begin();
    await started;

    const c = rangeConfig('saved-C');
    f.setConfig(c);
    const beginC = f.begin();
    gate.resolve();
    await assert.rejects(beginB, /generation-superseded/);
    const resultC = await beginC;
    assert.equal(resultC.rangeCache.root, c.root);
    assert.deepEqual(f.sessions.map(session => session.config.root), [rangeConfig('active-A').root, c.root]);
});

test('destroy waits for an in-flight close and prevents construction of the pending replacement', async t => {
    const f = createHarness(t, rangeConfig('active-A'));
    await f.create();
    await f.begin();
    const oldSession = f.sessions[0], {gate, started} = f.closeGate(oldSession);
    f.setConfig(rangeConfig('saved-B'));
    const pendingBegin = f.begin();
    await started;
    const destroying = f.service.destroy();
    gate.resolve();
    await destroying;
    await assert.rejects(pendingBegin, /generation-superseded|native-helper-service-destroyed/);
    assert.deepEqual(f.sessions.map(session => session.config.root), [rangeConfig('active-A').root]);
});

test('close failure blocks replacement writer and later playback keeps the original source', async t => {
    const f = createHarness(t, rangeConfig('active-A'));
    await f.create();
    await f.begin();
    const oldSession = f.sessions[0];
    f.failClose(oldSession);
    f.setConfig(rangeConfig('saved-B'));
    const transition = await f.begin();
    assert.equal(transition.rangeCache, null);
    assert.equal(f.sessions.length, 1, 'replacement cache session is not created after failed close');

    f.setConfig(rangeConfig('saved-C'));
    const next = await f.begin();
    assert.equal(next.rangeCache, null);
    assert.equal(f.sessions.length, 1, 'latched close failure prevents another writer from opening');
    const source = 'https://media.example.test/Videos/one/stream.mp4?Static=true';
    await f.loadOriginal(next.generationId, source);
    assert.deepEqual(f.helpers[0].loaded.at(-1), ['loadfile', source]);
});

test('Endpoint begin replies hot-swap range metadata and stale replies cannot restore the old config', async () => {
    const calls = [], first = deferred(), second = deferred(), third = deferred();
    class Ipc extends EventEmitter {
        invoke(_channel, request) {
            calls.push(request);
            if (request.operation === 'create') return Promise.resolve({status: 'ok', mode: 'native-helper',
                endpointId: 'endpoint-1', protocolVersion: 1, rangeCache: null});
            if (request.operation === 'begin-generation') {
                return [first.promise, second.promise, third.promise][calls.filter(call => call.operation === 'begin-generation').length - 1];
            }
            return Promise.resolve({status: 'ok'});
        }
        send() {}
    }
    const ipc = new Ipc(), {endpoint} = await client.create({ipc});
    assert.equal(endpoint.rangeCache, null);
    const older = endpoint.beginGeneration('older');
    const newer = endpoint.beginGeneration('newer');
    second.resolve({status: 'ok', generationId: 2, rangeCache: {enabled: true, root: 'config-C'}});
    await newer;
    assert.equal(endpoint.rangeCache.root, 'config-C');
    first.resolve({status: 'ok', generationId: 1, rangeCache: {enabled: true, root: 'config-B'}});
    await assert.rejects(older, /generation-superseded/);
    assert.equal(endpoint.rangeCache.root, 'config-C');

    const disabled = endpoint.beginGeneration('disabled');
    third.resolve({status: 'ok', generationId: 3, rangeCache: null});
    await disabled;
    assert.equal(endpoint.rangeCache, null, 'null metadata clears the previously enabled config');
    await endpoint.destroy();
});
