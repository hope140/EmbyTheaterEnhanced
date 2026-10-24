'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clientModule = require('../src/electronapp/native-helper/client');
const {createService} = require('../src/electronapp/native-helper/service');

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}
function turn() { return new Promise(resolve => setImmediate(resolve)); }
async function waitFor(predicate) {
    for (let count = 0; count < 100; count++) {
        if (predicate()) return;
        await turn();
    }
    throw new Error('fixture-condition-timeout');
}
function eventTarget() {
    const emitter = new EventEmitter();
    return {
        addEventListener(name, listener, options) { emitter[options && options.once ? 'once' : 'on'](name, listener); },
        removeEventListener(name, listener) { emitter.removeListener(name, listener); },
        dispatchEvent(event) { emitter.emit(event.type, event); }
    };
}
function fixture({deferStart = false, deferKill = false} = {}) {
    const ipc = new EventEmitter();
    const calls = [], clients = [], kills = [];
    class Window extends EventEmitter {
        constructor() { super(); this.visible = true; this.destroyed = false; this.webContents = {isDestroyed: () => false, send: (channel, message) => ipc.emit(channel, {}, message)}; }
        getBounds() { return {x: 0, y: 0, width: 800, height: 450}; }
        getNativeWindowHandle() { return Buffer.from([1, 0, 0, 0]); }
        isDestroyed() { return this.destroyed; }
        isVisible() { return this.visible; }
        isMinimized() { return false; }
        setBounds() {}
        setMenu() {}
        loadURL() { return Promise.resolve(); }
        hide() { this.visible = false; }
        showInactive() { this.visible = true; }
        destroy() { this.destroyed = true; this.emit('closed'); }
    }
    let generation = 0;
    class Client {
        constructor(options) {
            this.options = options; this.currentGenerationId = null; this.exited = false;
            this.handshake = {helperVersion: 'fixture', libmpvVersion: 'fixture'};
            this.startGate = deferred(); this.killGate = deferred(); this.killCalls = 0; this.loads = [];
            clients.push(this);
        }
        start() { return deferStart && clients.length === 1 ? this.startGate.promise : Promise.resolve(this); }
        kill() {
            if (this.killCompletion) return this.killCompletion;
            this.killCalls++; kills.push(this);
            this.startGate.reject(new Error('fixture-start-cancelled'));
            this.startGate.promise.catch(() => {});
            this.killCompletion = (deferKill && clients.indexOf(this) === 0 ? this.killGate.promise : Promise.resolve()).then(() => { this.exited = true; return {code: 0}; });
            return this.killCompletion;
        }
        allocateGenerationId() { return ++generation; }
        beginGeneration() { return this.currentGenerationId = ++generation; }
        retireGeneration() { this.currentGenerationId = null; }
        setProperty() {}
        command() {}
        submitCommand() {}
        request() { return Promise.resolve({}); }
        getProperty() { return Promise.resolve(null); }
        stop() { this.retireGeneration(); return Promise.resolve(); }
        load(args) {
            this.loads.push(args);
            const generationId = this.currentGenerationId;
            setImmediate(() => this.options.onEvent({name: 'core-idle', value: false, generationId}));
            return {generationId, promise: Promise.resolve({})};
        }
    }
    const main = new Window();
    const service = createService({electron: {BrowserWindow: Window}, NativeHelperClient: Client,
        fs: {existsSync: () => true}, runtimeRoot: path.resolve('fixture-runtime'),
        getMainWindow: () => main, getWebContents: () => main.webContents,
        execFile: (_file, _args, _options, callback) => { setImmediate(() => callback(null)); return {kill() {}}; }});
    ipc.invoke = (channel, request) => {
        calls.push(request);
        return service.call(request.operation, request.payload, request.endpointId).catch(error => ({status: 'error', reason: error.message}));
    };
    ipc.send = (channel, request) => service.notify(request.operation, request.payload, request.endpointId);
    const target = eventTarget(); target.ipc = ipc; target.platform = 'win32'; target.PlayerWindowId = 1;
    const body = {children: [], get firstChild() { return this.children[0]; }, insertBefore(node) { node.parentNode = this; this.children.push(node); }, removeChild(node) { this.children = this.children.filter(row => row !== node); node.parentNode = null; }};
    const document = {body, querySelector: () => body.children[0] || null, createElement: () => ({style: {}, classList: {add() {}, remove() {}}})};
    let factory;
    const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');
    const context = {window: target, document, Event: class {constructor(type) {this.type = type;}}, CustomEvent: class {constructor(type, options) {this.type = type; this.detail = options && options.detail;}},
        addEventListener: target.addEventListener, removeEventListener: target.removeEventListener, dispatchEvent: target.dispatchEvent,
        AbortController, setTimeout, clearTimeout, console: {log() {}}, define(_deps, value) {factory = value;}};
    vm.runInNewContext(source, context, {filename: 'libmpv.js'});
    const amdRequire = (_deps, callback) => callback();
    const Player = factory({}, {getSubtitleUrl() {return '';}}, {mapPath(_player, value) {return value;}}, {trigger() {}},
        {setTransparency() {}, showVideoOsd() {return Promise.resolve();}}, {get() {}, set() {}}, {getSubtitleAppearanceSettings() {return {};}}, amdRequire, {},
        {isStrm: () => false, resolveAsync: info => Promise.resolve({type: 'native', source: info.nativeSource})}, undefined, undefined, undefined,
        require('../src/electronapp/enhanced/nexttrack-transition'), clientModule);
    const player = {}; Player.call(player);
    return {player, service, clients, calls, kills, body};
}
function playOptions(id) {
    return {_etePlayRequestId: id, url: 'fixture-' + id + '.mkv', mediaType: 'Video', playMethod: 'DirectPlay', fullscreen: false,
        item: {MediaType: 'Video', Type: 'Movie', Path: '/fixture/media.mkv'}, mediaSource: {Path: '/fixture/media.mkv', MediaStreams: [], RunTimeTicks: 5000000000}, playerStartPositionTicks: 0};
}

for (const action of ['stop', 'destroy']) {
    test('pending create ' + action + ' retires only its helper before a new Play', async () => {
        const f = fixture({deferStart: true});
        try {
            const first = f.player.play(playOptions(1)); first.catch(() => {});
            await waitFor(() => f.clients.length === 1);
            const stopping = action === 'stop' ? f.player.stop(true) : f.player.destroy();
            const second = f.player.play(playOptions(2)); second.catch(() => {});
            await turn();
            f.clients[0].startGate.resolve(f.clients[0]);
            await stopping;
            await assert.rejects(first, error => error.playbackSuperseded === true);
            await second;
            assert.equal(f.clients.length, 2);
            assert.equal(f.clients[0].killCalls, 1);
            assert.equal(f.clients[1].killCalls, 0);
            assert.equal(f.clients[1].loads.length, 1);
            assert.equal(f.body.children.length, 1);
            await f.player.stop(true);
            assert.equal(f.clients[1].killCalls, 1);
        } finally { await f.service.destroy(); }
    });
}

test('renderer destroy completion cannot revoke the replacement endpoint', async () => {
    const f = fixture({deferKill: true});
    try {
        const a = await f.service.call('create');
        const destroying = f.service.call('destroy', {}, a.endpointId);
        const b = await f.service.call('create');
        await f.service.call('begin-generation', {label: 'B'}, b.endpointId);
        f.clients[0].killGate.resolve();
        await destroying;
        await f.service.call('begin-generation', {label: 'B-after-old-exit'}, b.endpointId);
        assert.notEqual(a.endpointId, b.endpointId);
        await assert.rejects(f.service.call('destroy', {}, a.endpointId), /stale-endpoint/);
    } finally { f.clients[0].killGate.resolve(); await f.service.destroy(); }
});

test('app shutdown during a pending create and Stop prevents queued Play from starting a helper', async () => {
    const f = fixture({deferStart: true});
    const first = f.player.play(playOptions(1)); first.catch(() => {});
    await waitFor(() => f.clients.length === 1);
    const stopping = f.player.stop(true);
    const second = f.player.play(playOptions(2)); second.catch(() => {});
    await f.service.destroy();
    await stopping;
    await assert.rejects(first);
    await assert.rejects(second);
    assert.equal(f.clients.length, 1);
    assert.equal(f.clients[0].exited, true);
});

test('pending-create Stop keeps the replacement queued until old helper exit is confirmed', async () => {
    const f = fixture({deferStart: true, deferKill: true});
    try {
        const first = f.player.play(playOptions(1)); first.catch(() => {});
        await waitFor(() => f.clients.length === 1);
        let stopSettled = false;
        const stopping = f.player.stop(true).then(() => { stopSettled = true; });
        const duplicateStop = f.player.destroy();
        const second = f.player.play(playOptions(2)); second.catch(() => {});
        f.clients[0].startGate.resolve(f.clients[0]);
        await waitFor(() => f.clients[0].killCalls === 1);
        await turn();
        assert.equal(stopSettled, false);
        assert.equal(f.clients.length, 1, 'replacement must not share the old endpoint while kill waits');
        f.clients[0].killGate.resolve();
        await Promise.all([stopping, duplicateStop]);
        await assert.rejects(first, error => error.playbackSuperseded === true);
        await second;
        assert.equal(f.clients[0].killCalls, 1);
        assert.equal(f.clients[1].loads.length, 1);
        await f.player.stop(true);
    } finally { f.clients[0].killGate.resolve(); await f.service.destroy(); }
});

test('nonterminal Next stop during create keeps the shared helper for the current Play', async () => {
    const f = fixture({deferStart: true});
    try {
        const first = f.player.play(playOptions(1)); first.catch(() => {});
        await waitFor(() => f.clients.length === 1);
        await f.player.stop(false);
        const second = f.player.play(playOptions(2)); second.catch(() => {});
        f.clients[0].startGate.resolve(f.clients[0]);
        await assert.rejects(first, error => error.playbackSuperseded === true);
        await second;
        assert.equal(f.clients.length, 1);
        assert.equal(f.clients[0].killCalls, 0);
        assert.equal(f.clients[0].loads.length, 1);
        await f.player.stop(true);
    } finally { await f.service.destroy(); }
});

test('a second Stop retires a Play waiting for old creation cleanup without resurrecting a helper', async () => {
    const f = fixture({deferStart: true});
    try {
        const first = f.player.play(playOptions(1)); first.catch(() => {});
        await waitFor(() => f.clients.length === 1);
        const stopping = f.player.stop(true);
        const second = f.player.play(playOptions(2)); second.catch(() => {});
        await turn();
        const stoppedAgain = f.player.stop(true);
        f.clients[0].startGate.resolve(f.clients[0]);
        await Promise.all([stopping, stoppedAgain]);
        await assert.rejects(first, error => error.playbackSuperseded === true);
        await assert.rejects(second, error => error.playbackSuperseded === true);
        assert.equal(f.clients.length, 1, 'retired waiting Play must not create a helper after Stop');
        assert.equal(f.clients[0].exited, true);
        assert.equal(f.body.children.length, 0);
    } finally { await f.service.destroy(); }
});

test('the newest Play waiting for cleanup can create after an older waiting Play is superseded', async () => {
    const f = fixture({deferStart: true});
    try {
        const first = f.player.play(playOptions(1)); first.catch(() => {});
        await waitFor(() => f.clients.length === 1);
        const stopping = f.player.stop(true);
        const second = f.player.play(playOptions(2)); second.catch(() => {});
        await turn();
        const third = f.player.play(playOptions(3)); third.catch(() => {});
        f.clients[0].startGate.resolve(f.clients[0]);
        await stopping;
        await assert.rejects(first, error => error.playbackSuperseded === true);
        await assert.rejects(second, error => error.playbackSuperseded === true);
        await third;
        assert.equal(f.clients.length, 2);
        assert.equal(f.clients[1].loads.length, 1);
        assert.equal(f.clients[1].loads[0][1], 'fixture-3.mkv');
        await f.player.stop(true);
    } finally { await f.service.destroy(); }
});
