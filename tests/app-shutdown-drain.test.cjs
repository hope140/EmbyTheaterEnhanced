'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const stages = ['diagnostics', 'maintenance', 'http-cache', 'strm', 'cd2', 'refresh', 'native', 'kernel', 'startup'];
const callbackStages = stages.slice(0, -1);
const diagnosticSteps = {
    diagnostics: 'diagnostics',
    maintenance: 'maintenance',
    'http-cache': 'http-cache',
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

function fixture(failure = null, settings = {}) {
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
        unregisterCacheManagementIpc() { return runStage('http-cache'); },
        unregisterStrmConfigIpc() { return runStage('strm'); },
        unregisterCd2Ipc() { return runStage('cd2'); },
        unregisterRefreshRate() { return runStage('refresh'); },
        unregisterNativeHelperIpc() { return runStage('native'); },
        unregisterMpvKernelIpc() { return runStage('kernel'); },
        Promise,
        setTimeout: settings.setTimeout || setTimeout,
        clearTimeout: settings.clearTimeout || clearTimeout
    };
    context.enhancedLog.flush = settings.flush || (() => Promise.resolve());
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

function logDeadline(flush) {
    const timers = new Map();
    let next = 0;
    const f = fixture(null, {
        flush,
        setTimeout(fn, ms) { const id = ++next; timers.set(id, {fn, ms}); return id; },
        clearTimeout(id) { timers.delete(id); }
    });
    return {f, timers, expire() {
        for (const [id, timer] of [...timers]) {
            assert.ok(timer.ms > 0 && timer.ms <= 250, 'logging wait has a finite 250ms maximum');
            timers.delete(id); timer.fn();
        }
    }};
}

test('shutdown log flush starts after all owned cleanups and delays quit only until its completion', async () => {
    const log = deferred(); let flushCalls = 0;
    const {f, timers} = logDeadline(() => { flushCalls++; return log.promise; });
    f.emitBeforeQuit(); await turn(); assert.equal(flushCalls, 0);
    for (const stage of stages.filter(stage => stage !== 'native')) f.gates[stage].resolve();
    await turn(); assert.equal(flushCalls, 0, 'pending native ownership still drains first');
    f.gates.native.resolve(); await turn();
    assert.equal(flushCalls, 1); assert.equal(f.quitCount, 0); assert.equal(timers.size, 1);
    log.resolve(); await turn(); assert.equal(f.quitCount, 1); assert.equal(timers.size, 0);
    assert.equal(f.emitBeforeQuit().registered, false);
});

for (const mode of ['throw', 'reject']) test('shutdown log flush '+mode+' cannot block or repeat quit', async () => {
    const {f, timers} = logDeadline(() => {
        const error = new Error('PRIVATE filesystem failure');
        if (mode === 'throw') throw error;
        return Promise.reject(error);
    });
    f.emitBeforeQuit(); for (const stage of stages) f.gates[stage].resolve();
    await turn(); assert.equal(f.quitCount, 1); assert.equal(timers.size, 0);
    assert.equal(JSON.stringify(f.logs).includes('PRIVATE filesystem failure'), false);
});

test('shutdown log flush timeout releases quit and ignores a late rejection', async () => {
    const log = deferred(); const {f, timers, expire} = logDeadline(() => log.promise);
    f.emitBeforeQuit(); for (const stage of stages) f.gates[stage].resolve();
    await turn(); assert.equal(f.quitCount, 0); assert.equal(timers.size, 1);
    expire(); await turn(); assert.equal(f.quitCount, 1); assert.equal(timers.size, 0);
    log.reject(new Error('PRIVATE late filesystem failure')); await turn();
    assert.equal(f.quitCount, 1); assert.equal(JSON.stringify(f.logs).includes('PRIVATE late filesystem failure'), false);
});

test('shutdown log using the actual asynchronous logger reaches disk before quit when the write completes in budget', async t => {
    const os = require('node:os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-shutdown-log-test-'));
    t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
    const write = deferred(), entered = deferred();
    const logger = require('../src/electronapp/enhanced/diagnostics').createLogger(dir, {fs: {promises: {
        ...fs.promises,
        async appendFile(...args) { entered.resolve(); await write.promise; return fs.promises.appendFile(...args); }
    }}});
    const {f, timers} = logDeadline(() => logger.flush());
    f.context.enhancedLog = logger;
    try {
        f.emitBeforeQuit(); for (const stage of stages) f.gates[stage].resolve();
        await entered.promise;
        assert.equal(f.quitCount, 0, 'actual shutdown append is still pending');
        assert.equal(timers.size, 1);
        write.resolve(); await logger.flush(); await turn();
        assert.equal(f.quitCount, 1); assert.equal(timers.size, 0);
        const events = (await logger.readRecords()).records;
        assert.equal(events.filter(e => e.category === 'app' && e.event === 'shutdown').length, 1);
    } finally { write.resolve(); await logger.flush(); }
});
