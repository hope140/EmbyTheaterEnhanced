'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Source selection is confined to the test process for before/after controls.
const sourceRoot = process.env.ETE_NETWORK_TEST_SOURCE_ROOT ||
    path.resolve(__dirname, '../src/electronapp');

function createHarness(moduleName) {
    const state = {
        createCalls: 0,
        allocated: [],
        timers: [],
        clearCalls: [],
        socketTypes: [],
        createError: null,
        closeErrorCount: 0,
        bindError: null
    };

    class FakeSocket extends EventEmitter {
        constructor() {
            super();
            this.bindCalls = 0;
            this.bindError = state.bindError;
            this.addressCalls = 0;
            this.broadcastCalls = 0;
            this.broadcastError = null;
            this.closeAttempts = 0;
            this.closed = false;
            this.successfulCloseCount = 0;
            this.sendCalls = [];
        }
        bind() {
            this.bindCalls++;
            if (this.bindError) throw this.bindError;
        }
        address() {
            this.addressCalls++;
            return {address: '0.0.0.0', port: 7359, family: 'IPv4'};
        }
        setBroadcast(value) {
            this.broadcastCalls++;
            this.broadcastValue = value;
            if (this.broadcastError) throw this.broadcastError;
        }
        send(...args) {
            this.sendCalls.push(args);
        }
        close() {
            this.closeAttempts++;
            if (this.closed) {
                const error = new Error('Socket is closed');
                error.code = 'ERR_SOCKET_DGRAM_NOT_RUNNING';
                throw error;
            }
            if (state.closeErrorCount > 0) {
                state.closeErrorCount--;
                throw new Error('synthetic close failure');
            }
            this.closed = true;
            this.successfulCloseCount++;
        }
    }

    const dgram = {
        createSocket(...args) {
            state.createCalls++;
            if (state.createError) throw state.createError;
            state.socketTypes.push(args);
            const socket = new FakeSocket();
            state.allocated.push(socket);
            return socket;
        }
    };
    const net = {isIPv6(address) { return String(address).includes(':'); }};
    const dependencies = {
        dgram,
        net,
        setTimeout(fn, ms) {
            const timer = {fn, ms, active: true};
            state.timers.push(timer);
            return timer;
        },
        clearTimeout(timer) {
            state.clearCalls.push(timer);
            if (timer) timer.active = false;
        }
    };
    const filename = moduleName === 'discovery'
        ? path.join(sourceRoot, 'serverdiscovery/serverdiscovery-native.js')
        : path.join(sourceRoot, 'wakeonlan/wakeonlan-native.js');
    const module = {exports: {}};
    const sandbox = {
        module,
        exports: module.exports,
        Buffer,
        console: {log() {}, error() {}},
        require(name) {
            if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
            throw new Error('Unexpected module dependency: ' + name);
        },
        setTimeout: dependencies.setTimeout,
        clearTimeout: dependencies.clearTimeout
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
    return {api: module.exports, state, filename};
}

function allocatedSocket(harness, index = 0) {
    assert.equal(harness.state.allocated.length > index, true, 'socket must be allocated by createSocket');
    return harness.state.allocated[index];
}

function emitSafely(socket, event, ...args) {
    try {
        socket.emit(event, ...args);
        return null;
    } catch (error) {
        return error;
    }
}

function fireTimer(timer) {
    timer.active = false;
    timer.fn();
}

function discoveryMessage(name, id, address) {
    return Buffer.from(JSON.stringify({Name: name, Id: id, Address: address}));
}

test('discovery positive path preserves UDP contract and settles once after listening timeout', () => {
    const h = createHarness('discovery');
    const results = [];
    const timeoutMs = 321;
    h.api.findServers(timeoutMs, value => results.push(value));
    const socket = allocatedSocket(h);
    assert.equal(h.state.socketTypes.length, 1);
    assert.equal(h.state.socketTypes[0].length, 1);
    assert.equal(h.state.socketTypes[0][0].type, 'udp4');
    assert.equal(h.state.socketTypes[0][0].reuseAddr, true);
    assert.equal(socket.bindCalls, 1);
    assert.equal(h.state.timers.length, 0, 'receive timeout starts only after listening');

    socket.emit('listening');
    assert.equal(socket.broadcastValue, true);
    assert.equal(socket.sendCalls.length, 1);
    const [packet, offset, length, port, address, sendCallback] = socket.sendCalls[0];
    assert.equal(packet.toString(), 'who is EmbyServer?');
    assert.equal(offset, 0);
    assert.equal(length, packet.length);
    assert.equal(port, 7359);
    assert.equal(address, '255.255.255.255');
    assert.equal(typeof sendCallback, 'function');
    assert.equal(h.state.timers.length, 1);
    assert.equal(h.state.timers[0].ms, timeoutMs);
    sendCallback(new Error('best effort send failure'));

    const response = discoveryMessage('Living Room', 'abc', '10.0.0.2');
    const info = {address: '10.0.0.2', port: 7359};
    socket.emit('message', response, info);
    socket.emit('message', response, info);
    fireTimer(h.state.timers[0]);
    assert.deepEqual(results, [JSON.stringify([
        {Name: 'Living Room', Id: 'abc', Address: '10.0.0.2', EndpointAddress: '10.0.0.2'},
        {Name: 'Living Room', Id: 'abc', Address: '10.0.0.2', EndpointAddress: '10.0.0.2'}
    ])]);
    assert.equal(h.state.timers.filter(timer => timer.active).length, 0);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.successfulCloseCount, 1);
    assert.equal(socket.closed, true);


});

test('discovery createSocket failure returns one empty JSON result without allocating a socket', () => {
    const h = createHarness('discovery');
    h.state.createError = new Error('synthetic create failure');
    const results = [];
    h.api.findServers(100, value => results.push(value));
    assert.equal(h.state.createCalls, 1);
    assert.equal(h.state.allocated.length, 0);
    assert.deepEqual(results, ['[]']);
    assert.equal(h.state.timers.length, 0);
});

test('discovery bind failure settles once, closes once, and ignores later events', () => {
    const h = createHarness('discovery');
    h.state.bindError = new Error('synthetic bind failure');
    const results = [];
    h.api.findServers(100, value => results.push(value));
    const socket = allocatedSocket(h);
    assert.equal(socket.bindCalls, 1);
    assert.deepEqual(results, ['[]']);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.successfulCloseCount, 1);
    socket.emit('listening');
    assert.equal(results.length, 1);
    assert.equal(h.state.timers.length, 0);
});

test('discovery socket error before listening settles empty and keeps an error listener', () => {
    const h = createHarness('discovery');
    const results = [];
    h.api.findServers(100, value => results.push(value));
    const socket = allocatedSocket(h);
    const error = emitSafely(socket, 'error', new Error('before listening'));
    assert.equal(error, null);
    assert.deepEqual(results, ['[]']);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.listenerCount('error'), 1, 'late errors remain absorbed');
    socket.emit('listening');
    socket.emit('message', discoveryMessage('Late', 'late', '10.0.0.2'), {address: '10.0.0.2', port: 7359});
    assert.equal(results.length, 1);
    assert.equal(socket.sendCalls.length, 0);
    assert.equal(h.state.timers.length, 0);
    assert.equal(socket.closeAttempts, 1);
});

test('discovery error after listening returns collected servers, clears timer, and ignores stale timer', () => {
    const h = createHarness('discovery');
    const results = [];
    h.api.findServers(250, value => results.push(value));
    const socket = allocatedSocket(h);
    socket.emit('listening');
    socket.emit('message', discoveryMessage('Office', 'office', '10.0.0.8'), {address: '10.0.0.8', port: 7359});
    const timer = h.state.timers[0];
    assert.ok(timer);
    socket.emit('error', new Error('after listening'));
    assert.deepEqual(results, [JSON.stringify([{Name: 'Office', Id: 'office', Address: '10.0.0.8', EndpointAddress: '10.0.0.8'}])]);
    assert.equal(timer.active, false);
    assert.equal(h.state.clearCalls[0], timer);
    assert.equal(socket.closeAttempts, 1);
    fireTimer(timer);
    socket.emit('error', new Error('repeated error'));
    socket.emit('message', discoveryMessage('Late', 'late', '10.0.0.9'), {address: '10.0.0.9', port: 7359});
    socket.emit('listening');
    assert.equal(results.length, 1);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(h.state.timers.length, 1);
});

test('discovery timeout settles collected servers then ignores late error and messages', () => {
    const h = createHarness('discovery');
    const results = [];
    h.api.findServers(80, value => results.push(value));
    const socket = allocatedSocket(h);
    socket.emit('listening');
    socket.emit('message', discoveryMessage('Den', 'den', '10.0.0.4'), {address: '10.0.0.4', port: 7359});
    const timer = h.state.timers[0];
    fireTimer(timer);
    assert.equal(results.length, 1);
    const lateError = emitSafely(socket, 'error', new Error('after timeout'));
    socket.emit('message', discoveryMessage('Late', 'late', '10.0.0.5'), {address: '10.0.0.5', port: 7359});
    assert.equal(lateError, null);
    assert.equal(results[0], JSON.stringify([{Name: 'Den', Id: 'den', Address: '10.0.0.4', EndpointAddress: '10.0.0.4'}]));
    assert.equal(socket.closeAttempts, 1);
});

test('discovery callback throw still attempts close once and preserves the callback exception', () => {
    const h = createHarness('discovery');
    const expected = new Error('synthetic callback failure');
    h.api.findServers(10, () => { throw expected; });
    const socket = allocatedSocket(h);
    socket.emit('listening');
    const timer = h.state.timers[0];
    assert.throws(() => fireTimer(timer), error => error === expected);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.successfulCloseCount, 1);
    assert.equal(h.state.clearCalls[0], timer);
    const lateError = emitSafely(socket, 'error', new Error('late error'));
    assert.equal(lateError, null);
    assert.equal(socket.closeAttempts, 1);
});

test('discovery callback failure does not skip best-effort close when close throws', () => {
    const h = createHarness('discovery');
    const expected = new Error('synthetic callback failure');
    h.state.closeErrorCount = 1;
    h.api.findServers(10, () => { throw expected; });
    const socket = allocatedSocket(h);
    socket.emit('listening');
    assert.throws(() => fireTimer(h.state.timers[0]), error => error === expected);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.successfulCloseCount, 0);
    assert.equal(socket.closed, false);
});

test('WOL positive path preserves IPv6 selection, packet, callback arguments, and single close', () => {
    const h = createHarness('wake');
    const calls = [];
    h.api.wake('01:23:45:67:89:ab', {address: 'ff02::1', port: 7}, function () {
        calls.push(Array.from(arguments));
        calls.push(['close-state', allocatedSocket(h).closeAttempts]);
    });
    const socket = allocatedSocket(h);
    assert.deepEqual(h.state.socketTypes, [['udp6']]);
    assert.equal(socket.sendCalls.length, 1);
    const [packet, offset, length, port, address, sendCallback] = socket.sendCalls[0];
    assert.equal(offset, 0);
    assert.equal(length, 138);
    assert.equal(packet.length, 138);
    assert.equal(packet.subarray(0, 6).every(byte => byte === 0xff), true);
    const mac = Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab]);
    for (let offset = 6; offset < packet.length; offset += mac.length) {
        assert.deepEqual(packet.subarray(offset, offset + mac.length), mac);
    }
    assert.equal(port, 7);
    assert.equal(address, 'ff02::1');
    assert.equal(typeof sendCallback, 'function');
    assert.equal(h.state.timers.length, 0, 'WOL does not add a timeout');

    socket.emit('listening');
    assert.equal(socket.broadcastValue, true);
    sendCallback(null, packet.length);
    assert.deepEqual(calls, [[null, true], ['close-state', 0]]);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.successfulCloseCount, 1);

});

test('WOL error before send callback calls back once with one argument and makes late events inert', () => {
    const h = createHarness('wake');
    const calls = [];
    h.api.wake('01:23:45:67:89:ab', {address: '255.255.255.255', port: 9}, function () {
        calls.push(Array.from(arguments));
    });
    const socket = allocatedSocket(h);
    const sendCallback = socket.sendCalls[0][5];
    const error = new Error('socket failure');
    socket.emit('error', error);
    socket.emit('error', new Error('repeated socket failure'));
    sendCallback(null, 138);
    socket.emit('listening');
    assert.deepEqual(calls, [[error]]);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.broadcastCalls, 0);
    assert.equal(socket.listenerCount('error'), 1);
    assert.equal(h.state.timers.length, 0);
});

test('WOL successful completion makes later send, socket and listening events inert', () => {
    const h = createHarness('wake');
    const calls = [];
    h.api.wake('01:23:45:67:89:ab', {address: '192.0.2.255', port: 9},
        function () { calls.push(Array.from(arguments)); });
    const socket = allocatedSocket(h);
    socket.emit('listening');
    const [packet, , , , , sendCallback] = socket.sendCalls[0];
    sendCallback(null, packet.length);
    assert.deepEqual(calls, [[null, true]]);
    assert.equal(emitSafely(socket, 'error', new Error('late error')), null);
    sendCallback(null, packet.length);
    socket.emit('listening');
    assert.equal(calls.length, 1);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.broadcastCalls, 1);
});

test('WOL send callback error keeps the two-argument callback shape and settles before late error', () => {
    const h = createHarness('wake');
    const calls = [];
    h.api.wake('01:23:45:67:89:ab', function () { calls.push(Array.from(arguments)); });
    const socket = allocatedSocket(h);
    assert.deepEqual(h.state.socketTypes, [['udp4']]);
    assert.equal(socket.sendCalls[0][3], 9);
    assert.equal(socket.sendCalls[0][4], '255.255.255.255');
    const sendCallback = socket.sendCalls[0][5];
    const sendError = new Error('send failed');
    sendCallback(sendError, 0);
    const lateError = emitSafely(socket, 'error', new Error('late socket failure'));
    sendCallback(null, 138);
    assert.equal(lateError, null);
    assert.deepEqual(calls, [[sendError, false]]);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.successfulCloseCount, 1);
});

test('WOL callback throw still closes and preserves callback exception', () => {
    const h = createHarness('wake');
    const expected = new Error('synthetic WOL callback failure');
    h.api.wake('01:23:45:67:89:ab', {address: '255.255.255.255', port: 9}, () => { throw expected; });
    const socket = allocatedSocket(h);
    const sendCallback = socket.sendCalls[0][5];
    assert.throws(() => sendCallback(null, 138), error => error === expected);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.successfulCloseCount, 1);
});

test('WOL callback/close exceptions keep one callback and one close attempt', () => {
    const h = createHarness('wake');
    const expected = new Error('synthetic WOL callback failure');
    h.state.closeErrorCount = 1;
    let callbackCount = 0;
    h.api.wake('01:23:45:67:89:ab', {address: '255.255.255.255', port: 9}, () => {
        callbackCount++;
        throw expected;
    });
    const socket = allocatedSocket(h);
    const sendCallback = socket.sendCalls[0][5];
    assert.throws(() => sendCallback(null, 138), error => error === expected);
    assert.equal(callbackCount, 1);
    assert.equal(socket.closeAttempts, 1);
    assert.equal(socket.successfulCloseCount, 0);
    assert.equal(socket.closed, false);
    const lateError = emitSafely(socket, 'error', new Error('after failed close'));
    assert.equal(lateError, null);
    assert.equal(callbackCount, 1);
    assert.equal(socket.closeAttempts, 1);
});
