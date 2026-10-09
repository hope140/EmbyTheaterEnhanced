'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const observerPath = path.join(__dirname, '..', 'tools', 'normal-close-observation.cjs');
const observerSource = fs.readFileSync(observerPath, 'utf8');
const observerModules = [
    ['diagnostics', 'enhanced/diagnostics-ipc.js'],
    ['maintenance', 'enhanced/maintenance-ipc.js'],
    ['strm-config', 'enhanced/strm-config-ipc.js'],
    ['cd2', 'enhanced/cd2-ipc.js'],
    ['native', 'native-helper/service.js']
];
const controllerRelative = 'native-helper/controller.js';
const verify = require(path.join(__dirname, '..', 'tools', 'verify-normal-close.cjs')).verify;

class FakeEmitter {
    constructor() {
        this.listeners = new Map();
    }

    on(name, listener) {
        const listeners = this.listeners.get(name) || [];
        listeners.push(listener);
        this.listeners.set(name, listeners);
        return this;
    }

    emit(name, ...args) {
        return (this.listeners.get(name) || []).map(listener => listener(...args));
    }
}

function createFakeNativeHelperClientClass() {
    return class FakeNativeHelperClient {
        constructor() {
            this.exited = false;
            this.originalKillCalls = 0;
            this.childKillCalls = 0;
            this.childKillArguments = [];
            this.pending = Promise.resolve({code: 0});
            this.child = {
                kill: (...args) => {
                    this.childKillCalls += 1;
                    this.childKillArguments.push(args);
                    return undefined;
                }
            };
        }

        kill(...args) {
            this.originalKillCalls += 1;
            this.child.kill(...args);
            this.pending.then(() => { this.exited = true; });
            return this.pending;
        }
    };
}

function loadObserverFixture() {
    const writes = [];
    const modules = new Map();
    const runtime = 'fixture-runtime';
    const NativeHelperClient = createFakeNativeHelperClientClass();
    for (const [name, relative] of observerModules) {
        modules.set(runtime + '/electronapp/' + relative, {
            register(...args) {
                this.registerCalls = (this.registerCalls || []).concat([args]);
                return this.unregister;
            },
            unregister() {
                this.unregisterCalls = (this.unregisterCalls || 0) + 1;
                return undefined;
            },
            name
        });
    }
    modules.set(runtime + '/electronapp/' + controllerRelative, {NativeHelperClient});
    const mockFs = {
        appendFileSync(file, value) {
            writes.push({file, value});
        }
    };
    const mockPath = {join: (...parts) => parts.join('/')};
    const module = {exports: {}};
    const context = {
        module,
        exports: module.exports,
        process: {env: {ETE_TEST_NORMAL_CLOSE: 'playing'}},
        require(request) {
            if (request === 'node:fs') return mockFs;
            if (request === 'node:path') return mockPath;
            const productModule = modules.get(request);
            if (productModule) return productModule;
            throw new Error('unexpected require: ' + request);
        }
    };
    vm.runInNewContext(observerSource, context, {filename: observerPath});
    return {observer: module.exports, modules, writes, runtime, NativeHelperClient};
}

function parseObserverRows(writes) {
    return writes.map(write => JSON.parse(write.value));
}

test('normal-close observer wraps sync and async unregister without changing ownership', async () => {
    const fixture = loadObserverFixture();
    const app = new FakeEmitter();
    let appExitCalls = 0;
    let appQuitCalls = 0;
    app.exit = () => { appExitCalls += 1; };
    app.quit = () => { appQuitCalls += 1; };
    const window = new FakeEmitter();
    let closeCalls = 0;
    let destroyed = false;
    window.isDestroyed = () => destroyed;
    window.close = () => {
        closeCalls += 1;
        window.emit('close');
        window.emit('closed');
    };
    const server = {
        closeAllConnectionsCalls: 0,
        closeCalls: 0,
        closeAllConnections() { this.closeAllConnectionsCalls += 1; },
        close() { this.closeCalls += 1; }
    };
    const api = fixture.observer.install({
        app,
        runtime: fixture.runtime,
        evidence: 'isolated-evidence',
        getWindow: () => window,
        getServer: () => server
    });
    const diagnostics = fixture.modules.get(fixture.runtime + '/electronapp/enhanced/diagnostics-ipc.js');
    const syncResult = {kind: 'sync-result'};
    const syncUnregister = function () {
        this.syncUnregisterCalls = (this.syncUnregisterCalls || 0) + 1;
        return syncResult;
    };
    diagnostics.unregister = syncUnregister;
    const wrappedSync = diagnostics.register.call(diagnostics, 'sync-arg');
    assert.equal(wrappedSync.call(diagnostics), syncResult);
    assert.equal(diagnostics.syncUnregisterCalls, 1);

    const maintenance = fixture.modules.get(fixture.runtime + '/electronapp/enhanced/maintenance-ipc.js');
    let resolveAsync;
    const asyncResult = new Promise(resolve => { resolveAsync = resolve; });
    const asyncUnregister = function () { return asyncResult; };
    maintenance.unregister = asyncUnregister;
    const wrappedAsync = maintenance.register('async-arg');
    const returned = wrappedAsync();
    assert.strictEqual(returned, asyncResult, 'observer must return the product Promise unchanged');
    resolveAsync('done');
    await returned;

    assert.throws(() => {
        diagnostics.unregister = () => { throw new Error('product cleanup failure'); };
        diagnostics.register.call(diagnostics)();
    }, /product cleanup failure/, 'observer must propagate product cleanup errors');

    api.close({ok: true});
    assert.equal(closeCalls, 1);
    assert.equal(appExitCalls, 0);
    assert.equal(appQuitCalls, 0);
    assert.equal(server.closeAllConnectionsCalls, 0, 'fixture server must stay alive until will-quit');
    app.emit('window-all-closed');
    assert.equal(server.closeCalls, 0, 'window-all-closed must not close fixture server');
    app.emit('before-quit');
    assert.equal(server.closeCalls, 0, 'before-quit must not close fixture server');
    app.emit('will-quit');
    assert.equal(server.closeAllConnectionsCalls, 1);
    assert.equal(server.closeCalls, 1);
    app.emit('quit', {}, 0);

    const rows = parseObserverRows(fixture.writes);
    assert.deepEqual(rows.map(row => row.stage), [
        'diagnostics-unregister-start', 'diagnostics-unregister-complete',
        'maintenance-unregister-start', 'maintenance-unregister-complete',
        'diagnostics-unregister-start', 'diagnostics-unregister-failed',
        'application-close-requested', 'application-window-close',
        'application-window-closed', 'application-close-returned',
        'window-all-closed', 'before-quit', 'will-quit', 'fixture-server-close-requested', 'quit'
    ]);
    assert.equal(rows.at(-1).exitCode, 0);
}
);

test('normal-close observer wraps every registered cleanup module', () => {
    const fixture = loadObserverFixture();
    const app = new FakeEmitter();
    const api = fixture.observer.install({
        app,
        runtime: fixture.runtime,
        evidence: 'isolated-evidence',
        getWindow: () => ({isDestroyed: () => false, close() {}}),
        getServer: () => null
    });
    for (const [name, relative] of observerModules) {
        const module = fixture.modules.get(fixture.runtime + '/electronapp/' + relative);
        const result = {name};
        module.unregister = () => result;
        const wrapped = module.register.call(module);
        assert.strictEqual(wrapped(), result, name + ' cleanup result must pass through');
    }
    assert.deepEqual(parseObserverRows(fixture.writes).map(row => row.stage), observerModules.flatMap(([name]) => [
        name + '-unregister-start', name + '-unregister-complete'
    ]));
    assert.equal(typeof api.close, 'function');
});

test('normal-close observer watches the NativeHelperClient prototype without replacing its Promise or killing twice', async () => {
    const fixture = loadObserverFixture();
    const app = new FakeEmitter();
    fixture.observer.install({
        app,
        runtime: fixture.runtime,
        evidence: 'isolated-evidence',
        getWindow: () => null,
        getServer: () => null
    });
    const client = new fixture.NativeHelperClient();
    let resolveExit;
    client.pending = new Promise(resolve => { resolveExit = resolve; });
    const originalPromise = client.pending;
    const returnedPromise = client.kill();
    assert.strictEqual(returnedPromise, originalPromise, 'prototype observer must return the product Promise unchanged');
    assert.equal(client.originalKillCalls, 1, 'the original kill must run exactly once');
    assert.equal(client.childKillCalls, 1, 'child.kill must be invoked once by the original kill');
    assert.deepEqual(client.childKillArguments, [[]], 'the force-kill observation must wrap the child call');
    assert.deepEqual(parseObserverRows(fixture.writes).map(row => row.stage), [
        'native-client-shutdown-start', 'native-child-force-kill'
    ]);

    resolveExit({code: 0});
    await returnedPromise;
    await new Promise(resolveMicrotask => queueMicrotask(resolveMicrotask));
    const rows = parseObserverRows(fixture.writes);
    assert.equal(rows.at(-1).stage, 'native-client-shutdown-complete');
    assert.equal(rows.at(-1).exited, true);
    assert.equal(client.exited, true);
    app.emit('window-all-closed');
    app.emit('before-quit');
    app.emit('will-quit');
    assert.equal(client.originalKillCalls, 1, 'app lifecycle observations must not call product kill again');
    assert.equal(client.childKillCalls, 1, 'app lifecycle observations must not force-kill again');
});

test('normal-close observer records asynchronous completion after the product Promise settles', async () => {
    const fixture = loadObserverFixture();
    const app = new FakeEmitter();
    const window = new FakeEmitter();
    window.isDestroyed = () => false;
    window.close = () => {};
    const api = fixture.observer.install({
        app,
        runtime: fixture.runtime,
        evidence: 'isolated-evidence',
        getWindow: () => window,
        getServer: () => null
    });
    const module = fixture.modules.get(fixture.runtime + '/electronapp/enhanced/cd2-ipc.js');
    let resolve;
    const pending = new Promise(done => { resolve = done; });
    module.unregister = () => pending;
    const wrapped = module.register();
    const productPromise = wrapped();
    assert.equal(parseObserverRows(fixture.writes).at(-1).stage, 'cd2-unregister-start');
    resolve('cleanup-result');
    await productPromise;
    await new Promise(resolveMicrotask => queueMicrotask(resolveMicrotask));
    assert.equal(parseObserverRows(fixture.writes).at(-1).stage, 'cd2-unregister-complete');
    assert.equal(typeof api.close, 'function');
});

test('normal-close observer fails closed when the close precondition is not met', () => {
    const fixture = loadObserverFixture();
    const app = new FakeEmitter();
    const window = new FakeEmitter();
    let closeCalls = 0;
    window.isDestroyed = () => false;
    window.close = () => { closeCalls += 1; };
    const api = fixture.observer.install({
        app,
        runtime: fixture.runtime,
        evidence: 'isolated-evidence',
        getWindow: () => window,
        getServer: () => null
    });
    api.close({ok: false});
    assert.equal(closeCalls, 0);
    assert.equal(parseObserverRows(fixture.writes).at(-1).stage, 'precondition-failed');
    window.isDestroyed = () => true;
    api.close({ok: true});
    assert.equal(closeCalls, 0);
    assert.equal(parseObserverRows(fixture.writes).at(-1).stage, 'precondition-failed');
});

function validVerificationFixture(scenario = 'playing') {
    const identity = {ItemId: 'fixture-close', PlaySessionId: 'play-fixture-close', MediaSourceId: 'source-fixture-close'};
    const records = scenario === 'idle' ? [] : [{endpoint: '/Sessions/playing/Playing', body: {...identity}}];
    if (scenario === 'stopped') records.push({endpoint: '/Sessions/playing/Stopped', body: {...identity}});
    const cleanupStages = ['diagnostics', 'maintenance', 'strm-config', 'cd2', 'native'].flatMap(name => [
        {stage: name + '-unregister-start'}, {stage: name + '-unregister-complete'}
    ]);
    const nativeShutdownStages = scenario === 'idle' ? [] : [
        {stage: 'native-client-shutdown-start'},
        {stage: 'native-client-shutdown-complete', exited: true}
    ];
    const stages = [
        {stage: 'application-close-requested'},
        {stage: 'application-window-close'},
        {stage: 'application-window-closed'},
        {stage: 'window-all-closed'},
        {stage: 'before-quit'},
        ...cleanupStages,
        ...nativeShutdownStages,
        {stage: 'will-quit'},
        {stage: 'fixture-server-close-requested'},
        {stage: 'quit'}
    ];
    return {
        scenario,
        smoke: {
            ok: true,
            nativeHelperEvents: scenario === 'idle' ? [] : [{event: 'helper-ready'}],
            state: {
                pipeline: {
                    normalClose: {
                        scenario,
                        preconditionsPassed: true,
                        hidden: true,
                        embeddedPlayCount: scenario === 'idle' ? 0 : 1,
                        currentItemId: scenario === 'playing' ? 'fixture-close' : null
                    },
                    records
                }
            }
        },
        runner: {
            exitMode: 'NATURAL', exitCode: 0, timedOut: false, cleanupAttempted: false,
            candidateResidual: 0, outputCapture: 'COMPLETE',
            childExitObservations: [{gone: true, observation: 'GONE_WITHOUT_OUTER_CLEANUP'}]
        },
        marker: {
            appDataIsolated: true, userDataIsolated: true, aboutVersionMatched: true,
            aboutSourceCommitMatched: true, applicationDocumentMatched: true,
            applicationWindowInjected: true, auxiliaryWindowInjected: false
        },
        stages,
        exitStages: [{stage: 'before-quit-observed'}, {stage: 'will-quit-observed'}]
    };
}

test('verify accepts complete idle, playing, and stopped normal-close evidence', () => {
    for (const scenario of ['idle', 'playing', 'stopped']) {
        const result = verify(validVerificationFixture(scenario));
        assert.equal(result.status, 'PASS', scenario + ' should pass: ' + result.failures.join(','));
        assert.deepEqual(result.failures, []);
        assert.equal(result.visibleAcceptance, 'NOT_EXECUTED');
    }
});

test('verify rejects forced cleanup, timeout, unknown exit, residuals, and incomplete output', () => {
    const mutations = [
        ['forced-cleanup', {exitMode: 'FORCED_CLEANUP', cleanupAttempted: true}],
        ['timeout', {timedOut: true}],
        ['unknown-exit', {exitMode: 'TIMEOUT_OWNERSHIP_UNAVAILABLE', exitCode: null}],
        ['residual', {candidateResidual: 1}],
        ['incomplete-output', {outputCapture: 'UNAVAILABLE'}]
    ];
    for (const [label, change] of mutations) {
        const fixture = validVerificationFixture();
        Object.assign(fixture.runner, change);
        const result = verify(fixture);
        assert.equal(result.status, 'FAIL', label + ' must fail even when smoke.ok is true');
        assert.ok(result.failures.includes('os-natural-exit'), label + ' must fail the OS natural-exit gate');
    }
});

test('verify rejects missing cleanup, out-of-order stages, and cleanup errors', () => {
    const missing = validVerificationFixture();
    missing.stages = missing.stages.filter(row => row.stage !== 'cd2-unregister-complete');
    assert.equal(verify(missing).status, 'FAIL');
    assert.ok(verify(missing).failures.includes('cleanup-cd2'));

    const outOfOrder = validVerificationFixture();
    const closeIndex = outOfOrder.stages.findIndex(row => row.stage === 'application-window-close');
    const willQuitIndex = outOfOrder.stages.findIndex(row => row.stage === 'will-quit');
    [outOfOrder.stages[closeIndex], outOfOrder.stages[willQuitIndex]] = [outOfOrder.stages[willQuitIndex], outOfOrder.stages[closeIndex]];
    const orderResult = verify(outOfOrder);
    assert.equal(orderResult.status, 'FAIL');
    assert.ok(orderResult.failures.includes('close-order'));

    const failed = validVerificationFixture();
    failed.stages.splice(5, 0, {stage: 'native-unregister-failed'});
    const failedResult = verify(failed);
    assert.equal(failedResult.status, 'FAIL');
    assert.ok(failedResult.failures.includes('cleanup-failure'));
});

test('verify rejects invalid scenarios, incorrect preconditions, and missing identity', () => {
    const invalidScenario = validVerificationFixture();
    invalidScenario.scenario = 'unexpected';
    const scenarioResult = verify(invalidScenario);
    assert.equal(scenarioResult.status, 'FAIL');
    assert.ok(scenarioResult.failures.includes('scenario'));
    assert.ok(scenarioResult.failures.includes('scenario-preconditions'));

    const preconditions = validVerificationFixture();
    preconditions.smoke.state.pipeline.normalClose.preconditionsPassed = false;
    const preconditionResult = verify(preconditions);
    assert.equal(preconditionResult.status, 'FAIL');
    assert.ok(preconditionResult.failures.includes('scenario-preconditions'));

    const missingIdentity = validVerificationFixture();
    missingIdentity.marker.applicationDocumentMatched = false;
    const identityResult = verify(missingIdentity);
    assert.equal(identityResult.status, 'FAIL');
    assert.ok(identityResult.failures.includes('isolation-and-identity'));
});

test('verify rejects any observed app.exit request even with an otherwise complete smoke result', () => {
    const fixture = validVerificationFixture();
    fixture.exitStages.push({stage: 'app-exit-requested'});
    const result = verify(fixture);
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failures.includes('direct-exit-forbidden'));
});

test('verify rejects native helper failure before close even when later cleanup evidence is complete', () => {
    const failures = [
        {event: 'helper-terminal'},
        {event: 'load-failed'},
        {event: 'helper-ready', failureCode: 'native-start-failed'}
    ];
    for (const failure of failures) {
        const fixture = validVerificationFixture('playing');
        fixture.smoke.nativeHelperEvents.push(failure);
        const result = verify(fixture);
        assert.equal(result.status, 'FAIL', failure.event + ' must remain a hard pre-close failure');
        assert.ok(result.failures.includes('native-preclose-failure'));
    }
});

test('verify requires helper-ready for active playback and real native exit whenever helper-ready is reported', () => {
    for (const scenario of ['playing', 'stopped']) {
        const missingReady = validVerificationFixture(scenario);
        missingReady.smoke.nativeHelperEvents = [];
        const missingReadyResult = verify(missingReady);
        assert.equal(missingReadyResult.status, 'FAIL');
        assert.ok(missingReadyResult.failures.includes('native-helper-ready'));
    }

    const idleReadyWithoutExit = validVerificationFixture('idle');
    idleReadyWithoutExit.smoke.nativeHelperEvents = [{event: 'helper-ready'}];
    const missingExitResult = verify(idleReadyWithoutExit);
    assert.equal(missingExitResult.status, 'FAIL');
    assert.ok(missingExitResult.failures.includes('native-actual-exit'));

    const idleReadyWithExit = validVerificationFixture('idle');
    idleReadyWithExit.smoke.nativeHelperEvents = [{event: 'helper-ready'}];
    idleReadyWithExit.stages.splice(
        idleReadyWithExit.stages.findIndex(row => row.stage === 'will-quit'),
        0,
        {stage: 'native-client-shutdown-start'},
        {stage: 'native-client-shutdown-complete', exited: true}
    );
    assert.equal(verify(idleReadyWithExit).status, 'PASS');
});

test('verify rejects forced native child exit and incomplete native client exit evidence', () => {
    const forced = validVerificationFixture('playing');
    forced.stages.push({stage: 'native-child-force-kill'});
    const forcedResult = verify(forced);
    assert.equal(forcedResult.status, 'FAIL');
    assert.ok(forcedResult.failures.includes('native-forced-exit'));

    const incomplete = validVerificationFixture('playing');
    incomplete.stages = incomplete.stages.filter(row => row.stage !== 'native-client-shutdown-complete');
    const incompleteResult = verify(incomplete);
    assert.equal(incompleteResult.status, 'FAIL');
    assert.ok(incompleteResult.failures.includes('native-actual-exit'));
});
