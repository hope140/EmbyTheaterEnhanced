'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const stages = ['diagnostics', 'maintenance', 'strm', 'cd2', 'refresh', 'native', 'kernel', 'startup'];
const callbackStages = stages.slice(0, 7);
const diagnosticSteps = {
    diagnostics: 'diagnostics',
    maintenance: 'maintenance',
    strm: 'strm-config',
    cd2: 'cd2',
    refresh: 'refresh-rate',
    native: 'native-helper',
    kernel: 'mpv-kernel',
    startup: 'startup'
};

function sourcePath(relativePath) {
    const root = process.env.ETE_TEST_SOURCE_ROOT
        ? path.resolve(process.env.ETE_TEST_SOURCE_ROOT)
        : path.resolve(__dirname, '..');
    return path.join(root, relativePath);
}

const source = fs.readFileSync(sourcePath('src/electronapp/main.js'), 'utf8').replace(/\r\n/g, '\n');

function excerpt(begin, end) {
    assert.equal(source.split(begin).length, 2, 'unique main anchor ' + begin);
    const start = source.indexOf(begin);
    const finish = source.indexOf(end, start);
    assert.ok(finish > start, 'main end anchor ' + end);
    return source.slice(start, finish);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

function fixture(failure = null) {
    const calls = [];
    const logs = [];
    const gates = Object.fromEntries(stages.map(stage => [stage, deferred()]));
    let listener = null;
    let quitCount = 0;
    let preventedCount = 0;

    function runStage(stage) {
        calls.push(stage);
        if (!failure || failure.stage !== stage) return gates[stage].promise;
        const error = new Error('PRIVATE shutdown payload must not be logged');
        if (failure.mode === 'throw') throw error;
        const rejected = Promise.reject(error);
        // Keep the RED baseline run free of process-level unhandled-rejection noise.
        rejected.catch(() => {});
        return rejected;
    }

    const app = {
        once(name, handler) {
            assert.equal(name, 'before-quit');
            assert.equal(listener, null, 'the source registers one before-quit handler');
            listener = handler;
        },
        quit() { quitCount++; }
    };
    const context = {
        app,
        appIsShuttingDown: false,
        enhancedLog(entry) { logs.push(entry); },
        playbackPowerOwner: {shutdown() { calls.push('power'); }},
        unregisterDiagnosticsIpc() { return runStage('diagnostics'); },
        unregisterMaintenanceIpc() { return runStage('maintenance'); },
        unregisterStrmConfigIpc() { return runStage('strm'); },
        unregisterCd2Ipc() { return runStage('cd2'); },
        unregisterRefreshRate() { return runStage('refresh'); },
        unregisterNativeHelperIpc() { return runStage('native'); },
        unregisterMpvKernelIpc() { return runStage('kernel'); },
        Promise
    };
    Object.defineProperty(context, 'readyStartupPromise', {
        get() {
            return runStage('startup');
        }
    });
    vm.createContext(context);
    vm.runInContext(excerpt("    app.once('before-quit'", "    ipcMain.on('enhanced-diagnostics'"), context,
        {filename: sourcePath('src/electronapp/main.js')});

    return {
        calls,
        context,
        gates,
        logs,
        get quitCount() { return quitCount; },
        emitBeforeQuit() {
            if (!listener) return {registered: false, prevented: false};
            const handler = listener;
            listener = null; // Match EventEmitter.once before invoking the callback.
            let prevented = false;
            handler({preventDefault() { prevented = true; preventedCount++; }});
            return {registered: true, prevented};
        },
        get preventedCount() { return preventedCount; }
    };
}

function turn() {
    return new Promise(resolve => setImmediate(resolve));
}

test('before-quit schedules every cleanup and quits once after all returned work settles', async () => {
    const f = fixture();
    const first = f.emitBeforeQuit();
    assert.deepEqual(first, {registered: true, prevented: true});
    assert.equal(f.context.appIsShuttingDown, true);
    assert.equal(f.quitCount, 0, 'quit waits while cleanup promises are pending');
    await turn();
    assert.deepEqual(f.calls, ['power', ...stages]);
    assert.equal(f.quitCount, 0);

    const duplicate = f.emitBeforeQuit();
    assert.deepEqual(duplicate, {registered: false, prevented: false}, 'before-quit handler is one-shot');
    assert.deepEqual(f.calls, ['power', ...stages], 'a duplicate event does not schedule another drain');

    for (const stage of [...stages].reverse()) {
        f.gates[stage].resolve();
        await turn();
        if (stage !== 'diagnostics') {
            assert.equal(f.quitCount, 0, 'quit waits for every remaining cleanup stage');
        }
    }
    await turn();
    assert.equal(f.quitCount, 1);
    assert.equal(f.preventedCount, 1);
});

for (const stage of callbackStages) {
    for (const mode of ['throw', 'reject']) {
        test(`before-quit continues after ${stage} ${mode} and reports only its fixed stage`, async () => {
            const f = fixture({stage, mode});
            assert.doesNotThrow(() => f.emitBeforeQuit(), 'one cleanup failure must not escape the handler');
            await turn();
            assert.deepEqual(f.calls, ['power', ...stages], 'all cleanup stages are scheduled after a failure');
            assert.equal(f.quitCount, 0, 'other pending cleanup remains part of the drain');

            const heldStage = stage === 'native' ? 'kernel' : 'native';
            for (const other of stages.filter(item => item !== heldStage && item !== stage)) f.gates[other].resolve();
            await turn();
            assert.equal(f.quitCount, 0, 'quit waits for a different cleanup stage still in progress');
            f.gates[heldStage].resolve();
            await turn();
            assert.equal(f.quitCount, 1, 'quit follows settlement of every cleanup stage');

            const failures = f.logs.filter(entry => entry.event === 'shutdown-cleanup-failed');
            assert.equal(failures.length, 1);
            assert.equal(failures[0].category, 'app');
            assert.equal(failures[0].details.step, diagnosticSteps[stage]);
            assert.deepEqual(Object.keys(failures[0].details).sort(), ['step']);
            assert.equal(JSON.stringify(f.logs).includes('PRIVATE shutdown payload'), false);
        });
    }
}

test('before-quit contains a rejected startup drain and keeps the diagnostic payload private', async () => {
    const f = fixture({stage: 'startup', mode: 'reject'});
    assert.doesNotThrow(() => f.emitBeforeQuit());
    assert.equal(f.quitCount, 0);
    await turn();
    assert.deepEqual(f.calls, ['power', ...stages]);

    for (const stage of callbackStages.filter(stage => stage !== 'native')) f.gates[stage].resolve();
    await turn();
    assert.equal(f.quitCount, 0, 'startup rejection does not skip a different pending cleanup stage');
    f.gates.native.resolve();
    await turn();
    assert.equal(f.quitCount, 1);

    const failures = f.logs.filter(entry => entry.event === 'shutdown-cleanup-failed');
    assert.equal(failures.length, 1);
    assert.equal(failures[0].details.step, diagnosticSteps.startup);
    assert.deepEqual(Object.keys(failures[0].details), ['step']);
    assert.equal(JSON.stringify(f.logs).includes('PRIVATE shutdown payload'), false);
});

test('before-quit also drains the optional native Windows media owner', async () => {
    const f=fixture(), media=deferred();
    f.context.disposeWindowsNativeMedia=()=>media.promise;
    f.emitBeforeQuit();
    for(const stage of stages)f.gates[stage].resolve();
    await turn();assert.equal(f.quitCount,0);
    media.resolve();await turn();assert.equal(f.quitCount,1);
});
