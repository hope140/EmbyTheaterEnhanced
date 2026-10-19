'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function sourcePath(relativePath) {
    const root = process.env.ETE_TEST_SOURCE_ROOT
        ? path.resolve(process.env.ETE_TEST_SOURCE_ROOT)
        : path.resolve(__dirname, '..');
    return path.join(root, relativePath);
}

function createStream() {
    const stream = new EventEmitter();
    stream.write = () => true;
    stream.end = () => {};
    stream.destroy = () => {};
    stream.pause = () => {};
    stream.resume = () => {};
    return stream;
}

function createChild(pid) {
    const child = new EventEmitter();
    child.pid = pid;
    child.exitCode = null;
    child.signalCode = null;
    child.stdin = createStream();
    child.stdout = createStream();
    child.stderr = createStream();
    child.killCalls = 0;
    child.kill = () => { child.killCalls++; return true; };
    return child;
}

function loadController(spawn) {
    const filename = sourcePath('src/electronapp/native-helper/controller.js');
    const source = fs.readFileSync(filename, 'utf8');
    const module = {exports: {}};
    const context = {
        Buffer,
        TextDecoder,
        clearTimeout() {},
        console,
        exports: module.exports,
        module,
        process,
        require(name) {
            if (name === 'node:child_process') return {spawn};
            if (name === 'node:crypto') return require('node:crypto');
            if (name === 'node:util') return require('node:util');
            throw new Error('unexpected controller dependency: ' + name);
        },
        setTimeout() { return {unref() {}}; }
    };
    vm.runInNewContext(source, context, {filename});
    return module.exports;
}

function clientFor(child, terminalEvents) {
    const {NativeHelperClient} = loadController(() => child);
    return new NativeHelperClient({
        helperPath: 'fake-helper.exe',
        libmpvPath: 'fake-mpv.dll',
        parentWindowHandle: '123',
        helperInstanceId: 'test-helper-instance',
        onTerminal: event => terminalEvents.push(event)
    });
}

test('a child error with a PID terminates transport but waits for the real process exit', async () => {
    const child = createChild(4321);
    const terminalEvents = [];
    const client = clientFor(child, terminalEvents);
    const startup = client.start();
    const startupResult = startup.then(
        () => ({status: 'resolved'}),
        error => ({status: 'rejected', error})
    );
    const exitPromise = client.exitPromise;
    let exitSettled = false;
    exitPromise.then(() => { exitSettled = true; });
    let startupSettled = false;
    startupResult.then(() => { startupSettled = true; });

    child.emit('error', Object.assign(new Error('transient child error'), {code: 'EIO'}));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(client.transportTerminated, true, 'the transport enters its terminal state');
    assert.equal(client.exited, false, 'a PID-bearing child is still an owned live process');
    assert.equal(exitSettled, false, 'exitPromise waits for the exit event');
    assert.equal(startupSettled, false, 'startup failure does not pretend the child has exited');
    assert.equal(terminalEvents.length, 1, 'transport termination is reported once');

    assert.doesNotThrow(() => child.emit('error', new Error('duplicate child error')),
        'a repeated child error must not become an unhandled EventEmitter error');
    child.exitCode = 17;
    child.emit('exit', 17, null);
    child.emit('exit', 17, null);

    const exit = await exitPromise;
    const result = await startupResult;
    assert.equal(exit.code, 17);
    assert.equal(client.exited, true);
    assert.equal(result.status, 'rejected');
    assert.match(result.error.message, /helper-start-failed/);
    assert.equal(terminalEvents.length, 1, 'error and exit do not duplicate terminal notification');
});

test('a spawn error without a PID settles exitPromise and rejects startup', async () => {
    const child = createChild(undefined);
    const terminalEvents = [];
    const client = clientFor(child, terminalEvents);
    const startup = client.start();
    const exitPromise = client.exitPromise;

    child.emit('error', Object.assign(new Error('spawn failed'), {code: 'ENOENT'}));

    await assert.rejects(startup, /helper-start-failed/);
    const exit = await exitPromise;
    assert.equal(exit.error, 'spawn failed');
    assert.equal(client.exited, true);
    assert.equal(terminalEvents.length, 1);
});

test('kill remains joined to the actual process exit after requesting shutdown', async () => {
    const child = createChild(9876);
    const terminalEvents = [];
    const client = clientFor(child, terminalEvents);
    const startup = client.start();
    startup.catch(() => {});
    const exitPromise = client.exitPromise;
    const killPromise = client.kill();
    let killSettled = false;
    killPromise.then(() => { killSettled = true; });

    await new Promise(resolve => setImmediate(resolve));
    assert.equal(killSettled, false, 'kill does not finish while the owned process is alive');
    assert.equal(child.killCalls, 0, 'graceful shutdown first waits for the child exit event');

    child.exitCode = 0;
    child.emit('exit', 0, null);
    await killPromise;
    await exitPromise;
    assert.equal(killSettled, true);
    assert.equal(client.exited, true);
});
