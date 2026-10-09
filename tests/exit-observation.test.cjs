'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const observerPath = path.join(__dirname, '..', 'tools', 'exit-observation.cjs');
const observer = require(observerPath);
const smokePath = path.join(__dirname, '..', 'tools', 'smoke-electron.cjs');
const smokeSource = fs.readFileSync(smokePath, 'utf8');

class FakeEmitter {
    constructor() { this.listeners = new Map(); }
    on(name, listener) {
        const list = this.listeners.get(name) || [];
        list.push(listener);
        this.listeners.set(name, list);
        return this;
    }
    emit(name, ...args) {
        return (this.listeners.get(name) || []).map(listener => listener(...args));
    }
}

test('exit observer is bounded, allowlisted, and ignores writer failures', () => {
    const app = new FakeEmitter();
    const processObject = new FakeEmitter();
    const rows = [];
    const api = observer.createExitObservation({
        app,
        processObject,
        evidence: 'C:\\private\\evidence',
        write: row => rows.push(row),
        now: (() => { let value = 100; return () => value++; })()
    });

    assert.equal(typeof api.record, 'function');
    for (let index = 0; index < 40; index++) {
        api.record('app-exit-requested', index === 0 ? 0 : 999, 'C:\\private\\raw-data');
    }
    api.record('not-allowlisted', 1);
    app.emit('before-quit');
    app.emit('will-quit');
    app.emit('quit', 1);
    processObject.emit('exit', 1);

    assert.ok(rows.length <= 32);
    const parsed = rows.map(row => JSON.parse(row));
    const allowedStages = new Set([
        'observer-installed', 'result-persist-begin', 'result-persisted',
        'harness-cleanup-complete', 'app-exit-requested', 'app-exit-returned',
        'before-quit-observed', 'will-quit-observed', 'quit-observed', 'process-exit-observed'
    ]);
    assert.ok(parsed.every(row => allowedStages.has(row.stage)));
    assert.ok(parsed.every(row => Number.isInteger(row.sequence) && row.sequence >= 1 && row.sequence <= 32));
    assert.ok(parsed.every(row => !Object.prototype.hasOwnProperty.call(row, 'error')));
    assert.ok(parsed.every(row => !JSON.stringify(row).includes('C:\\private')));
    assert.ok(parsed.every(row => !JSON.stringify(row).includes('http')));
    assert.ok(parsed.every(row => row.exitCode === undefined || [0, 1, 255].includes(row.exitCode)));

    const throwing = observer.createExitObservation({
        app: new FakeEmitter(), processObject: new FakeEmitter(), evidence: 'ignored',
        write: () => { throw new Error('writer-failure'); }
    });
    assert.doesNotThrow(() => {
        throwing.record('process-exit-observed', 1);
    });
});

test('observer lifecycle listeners never prevent exit and do not own app.exit', () => {
    const app = new FakeEmitter();
    const processObject = new FakeEmitter();
    const rows = [];
    observer.createExitObservation({app, processObject, evidence: 'ignored', write: row => rows.push(row)});

    assert.deepEqual(app.emit('before-quit', {preventDefault() { throw new Error('must not be called'); }}), [undefined]);
    assert.deepEqual(app.emit('will-quit'), [undefined]);
    assert.deepEqual(app.emit('quit', 0), [undefined]);
    assert.deepEqual(processObject.emit('exit', 0), [undefined]);
    assert.equal(Object.prototype.hasOwnProperty.call(app, 'exit'), false);
    assert.ok(rows.length >= 1);
});

test('observer keeps only boundary exit codes and preserves monotonic sequence', () => {
    const rows = [];
    const api = observer.createExitObservation({
        app: new FakeEmitter(), processObject: new FakeEmitter(), evidence: 'ignored',
        write: row => rows.push(JSON.parse(row)), now: (() => { let value = 10; return () => value += 2; })()
    });
    for (const code of [0, 1, 255, -1, 256, NaN, '1']) api.record('app-exit-requested', code);
    assert.deepEqual(rows.map(row => row.exitCode), [undefined, 0, 1, 255, undefined, undefined, undefined, undefined]);
    assert.deepEqual(rows.map(row => row.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.ok(rows.every((row, index) => row.elapsedMs >= (index === 0 ? 0 : rows[index - 1].elapsedMs)));
});

function extractWriteResultAndExit() {
    const start = smokeSource.indexOf('function writeResultAndExit(result) {');
    const tail = smokeSource.slice(start);
    const match = /\r?\n\}\r?\nfunction finish\(result\)/.exec(tail);
    assert.ok(start >= 0 && match, 'writeResultAndExit excerpt must remain extractable');
    return tail.slice(0, match.index + match[0].match(/\r?\n\}/)[0].length);
}

test('actual writeResultAndExit excerpt orders persistence, cleanup, and original app.exit call', () => {
    const excerpt = extractWriteResultAndExit();
    const trace = [];
    const context = {
        process: {env: {}},
        evidence: 'isolated-evidence',
        mediaRequests: [], resolverEvents: [], nativeHelperEvents: [], diagnosticEvents: [],
        transitionTimelineMode: false,
        transitionActionListener: null,
        fixtureServer: null,
        fakeCd2: null,
        pipelineDeadline: null,
        applicationPipelineInjectionCount: 0,
        auxiliaryPipelineInjectionCount: 0,
        windowOwnership: {snapshot: () => ({})},
        path: {join: (...parts) => parts.join('/')},
        fs: {
            writeFileSync: (_file, _value) => trace.push({kind: 'persist'})
        },
        exitObservation: {record: (stage, exitCode) => trace.push({kind: 'stage', stage, exitCode})},
        app: {exit: code => trace.push({kind: 'app-exit', code})},
        Object
    };
    const writeResultAndExit = vm.runInNewContext(`(${excerpt})`, context);
    writeResultAndExit({ok: true});

    assert.deepEqual(trace, [
        {kind: 'stage', stage: 'result-persist-begin', exitCode: undefined},
        {kind: 'persist'},
        {kind: 'stage', stage: 'result-persisted', exitCode: undefined},
        {kind: 'stage', stage: 'harness-cleanup-complete', exitCode: undefined},
        {kind: 'stage', stage: 'app-exit-requested', exitCode: 0},
        {kind: 'app-exit', code: 0},
        {kind: 'stage', stage: 'app-exit-returned', exitCode: undefined}
    ]);
    assert.match(excerpt, /app\.exit\(result\.ok \? 0 : 1\);/);
    assert.doesNotMatch(excerpt, /app\.quit\(/);

    trace.length = 0;
    writeResultAndExit({ok: false});
    assert.equal(trace.find(item => item.kind === 'app-exit').code, 1);
    assert.equal(trace.find(item => item.kind === 'stage' && item.stage === 'app-exit-requested').exitCode, 1);
});

test('smoke exit tracing is opt-in and does not add a second product quit path', () => {
    assert.match(smokeSource, /process\.env\.ETE_TEST_EXIT_TRACE === '1'/);
    assert.match(smokeSource, /exitObservation\.record\('harness-cleanup-complete'\)/);
    assert.match(smokeSource, /exitObservation\.record\('app-exit-requested', result\.ok \? 0 : 1\)/);
    assert.match(smokeSource, /app\.exit\(result\.ok \? 0 : 1\);/);
    assert.doesNotMatch(smokeSource, /app\.quit\(/);
});
