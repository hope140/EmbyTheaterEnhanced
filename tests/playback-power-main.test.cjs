'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createOwner} = require('../src/electronapp/enhanced/playback-power-owner');
const appHostCommand = require('../src/electronapp/apphost-command');
const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/main.js'), 'utf8').replace(/\r\n/g, '\n');

function excerpt(begin, end) {
    assert.equal(source.split(begin).length, 2, 'unique main anchor ' + begin);
    const start = source.indexOf(begin);
    const finish = source.indexOf(end, start);
    assert.ok(finish > start, 'main end anchor ' + end);
    return source.slice(start, finish);
}

function pending() {
    let resolve;
    const promise = new Promise(done => {resolve = done;});
    return {promise, resolve};
}

function fixture(refreshShutdown = () => Promise.resolve()) {
    const active = new Set([99]);
    const starts = [];
    const stops = [];
    const calls = [];
    const logs = [];
    let nextId = 0;
    let dispatcher;
    let beforeQuit;
    const native = pending(), kernel = pending(), ready = pending();
    const power = {
        start(reason) {const id = nextId++; active.add(id); starts.push([reason, id]); return id;},
        isStarted(id) {return active.has(id);},
        stop(id) {assert.notEqual(id, 99); active.delete(id); stops.push(id);}
    };
    const context = {
        electron: {protocol: {registerStringProtocol(_name, handler) {dispatcher = handler;}}},
        appHostCommand,
        appIsShuttingDown: false,
        playbackPowerOwner: createOwner(power),
        enhancedLog(entry) {logs.push(entry);},
        app: {once(name, handler) {assert.equal(name, 'before-quit'); beforeQuit = handler;}, quit() {calls.push('quit');}},
        unregisterDiagnosticsIpc() {calls.push('diagnostics');},
        unregisterMaintenanceIpc() {calls.push('maintenance');},
        unregisterStrmConfigIpc() {calls.push('config');},
        unregisterCd2Ipc() {calls.push('cd2');},
        unregisterRefreshRate() {calls.push('refresh'); return refreshShutdown();},
        unregisterNativeHelperIpc() {calls.push('native'); return native.promise;},
        unregisterMpvKernelIpc() {calls.push('kernel'); return kernel.promise;},
        readyStartupPromise: ready.promise,
        Promise
    };
    vm.createContext(context);
    vm.runInContext(excerpt('    function registerAppHost()', '    function onLoaded()') + '\nregisterAppHost();', context);
    vm.runInContext(excerpt("    app.once('before-quit'", "    ipcMain.on('enhanced-diagnostics'"), context);
    return {active, starts, stops, calls, logs, context, power, native, kernel, ready,
        command(name) {let replies = 0; dispatcher({url: 'electronapphost://' + name, method: 'POST'}, () => replies++); assert.equal(replies, 1);},
        quit() {let prevented = 0; beforeQuit({preventDefault() {prevented++;}}); assert.equal(prevented, 1);}};
}

test('real main quit retires power before pending native/kernel/startup drain and completes host callbacks', async () => {
    const f = fixture();
    f.command('video-on'); f.command('audio-on');
    f.quit();
    assert.equal(f.context.appIsShuttingDown, true);
    assert.deepEqual(f.stops, [0, 1]);
    assert.deepEqual([...f.active], [99]);
    for (let i = 0; i < 3; i++) {
        for (const command of ['video-on', 'audio-on', 'video-off', 'audio-off']) f.command(command);
        f.context.playbackPowerOwner.shutdown();
    }
    assert.equal(f.starts.length, 2);
    assert.deepEqual(f.stops, [0, 1]);
    assert.equal(f.calls.includes('quit'), false);
    f.native.resolve(); f.kernel.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.includes('quit'), false, 'startup drain is still pending');
    f.ready.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.filter(call => call === 'quit').length, 1);
});

test('main shutdown keeps async cleanup progressing when one power release fails', async () => {
    const f = fixture();
    f.command('video-on'); f.command('audio-on');
    const originalStop = f.power.stop;
    f.power.stop = id => {if (id === 0) throw new Error('synthetic stop failure'); originalStop(id);};
    f.quit();
    assert.deepEqual(f.stops, [1], 'audio cleanup still runs');
    assert.ok(f.logs.some(entry => entry.event === 'power-cleanup-failed'));
    f.command('video-on'); f.command('audio-on');
    assert.equal(f.starts.length, 2);
    f.native.resolve(); f.kernel.resolve(); f.ready.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.filter(call => call === 'quit').length, 1);
});

for (const mode of ['reject', 'throw']) {
    test('refresh shutdown ' + mode + ' cannot skip the original Native/kernel/startup drain', async () => {
        const failure = new Error('synthetic refresh callback failure');
        const f = fixture(() => {if (mode === 'throw') throw failure; return Promise.reject(failure);});
        f.quit();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.calls.includes('native'), true);
        assert.equal(f.calls.includes('kernel'), true);
        assert.equal(f.calls.includes('quit'), false);
        f.native.resolve(); f.kernel.resolve();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.calls.includes('quit'), false, 'startup still owns its pending completion');
        f.ready.resolve();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.calls.filter(call => call === 'quit').length, 1);
    });
}

test('main quit also waits for bounded refresh cleanup after the original drains finish', async () => {
    const refresh = pending();
    const f = fixture(() => refresh.promise);
    f.quit();
    f.native.resolve(); f.kernel.resolve(); f.ready.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.includes('quit'), false);
    refresh.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.calls.filter(call => call === 'quit').length, 1);
});
