'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {after, test} = require('node:test');

const {createNativeDiagnostics} = require('../src/electronapp/enhanced/native-diagnostics');
const {createProjector, createReceiver, install} = require('../src/electronapp/enhanced/renderer-errors');
const {createRecorder} = require('../src/electronapp/enhanced/bounded-diagnostics');

test('slow diagnostic storage cannot accumulate more than 32 pending writes', async () => {
    const records = [];
    const completions = [];
    const emit = createRecorder(record => {
        records.push(record);
        return new Promise(resolve => completions.push(resolve));
    }, 'native-helper', 120);
    for (let index = 0; index < 40; index++) emit('start-file', {generationId: index + 1});
    assert.equal(records.length, 32);
    completions.shift()();
    await Promise.resolve();
    emit('file-loaded', {generationId: 40});
    assert.equal(records.length, 33);
    assert.equal(records.at(-1).details.diagnosticPendingDrops, 8);
    for (const complete of completions) complete();
    await Promise.resolve();
});

for (const failure of ['throw', 'false', 'reject']) {
    test(`pending-drop evidence survives a ${failure} before the next successful write`, async () => {
        const completions = [];
        const written = [];
        let mode = 'pending';
        const emit = createRecorder(record => {
            if (mode === 'pending') return new Promise(resolve => completions.push(resolve));
            if (mode === 'throw') throw new Error('disk-error');
            if (mode === 'false') return Promise.resolve(false);
            if (mode === 'reject') return Promise.reject(new Error('disk-error'));
            written.push(record);
            return Promise.resolve(true);
        }, 'native-helper', 120);
        for (let index = 0; index < 40; index++) emit('start-file', {generationId: index + 1});
        for (const complete of completions) complete(true);
        await Promise.resolve();
        mode = failure;
        emit('file-loaded', {generationId: 40});
        await Promise.resolve();
        mode = 'success';
        emit('file-loaded', {generationId: 41});
        await Promise.resolve();
        assert.equal(written.length, 1);
        assert.equal(written[0].details.diagnosticPendingDrops, 8);
    });
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-bounded-observers-'));
const scriptPath = path.join(fixtureRoot, 'modules', 'fixture.js');
const secondScriptPath = path.join(fixtureRoot, 'modules', 'second.cjs');
fs.mkdirSync(path.dirname(scriptPath), {recursive: true});
fs.writeFileSync(scriptPath, "exports.raise = function leakedFunctionName() { return missingRendererIdentifier; };\n");
fs.writeFileSync(secondScriptPath, 'module.exports = true;\n');
after(() => fs.rmSync(fixtureRoot, {recursive: true, force: true}));

function collectingLogger(records) {
    return entry => records.push(entry);
}

function nativeInput(overrides) {
    return Object.assign({
        name: 'start-file',
        disposition: 'ACCEPT',
        helperRun: 7,
        generationId: 1,
        currentGenerationId: 1,
        label: 'play-1-1'
    }, overrides);
}

function fakeWindow(topWindow) {
    const listeners = new Map();
    return {
        top: topWindow,
        listeners,
        addEventListener(name, callback) {
            const values = listeners.get(name) || new Set();
            values.add(callback);
            listeners.set(name, values);
        },
        removeEventListener(name, callback) {
            const values = listeners.get(name);
            if (values) values.delete(callback);
        },
        dispatch(name, event) {
            for (const callback of [...(listeners.get(name) || [])]) callback(event);
        }
    };
}

function onlyRecord(records) {
    assert.equal(records.length, 1);
    return records[0];
}

test('native request association is helper-scoped, bounded to 64 generations, and omits caller fields', () => {
    const records = [];
    const observe = createNativeDiagnostics(collectingLogger(records));
    observe(nativeInput({name: 'generation-begin', disposition: 'BEGIN_GENERATION'}));
    observe(nativeInput({name: 'file-loaded', label: 'must-not-replace-associated-label', url: 'https://private.invalid/token', arbitrary: 'private'}));
    const loaded = records[1].details;
    assert.equal(loaded.requestId, 'play-1-1');
    assert.equal(loaded.association, 'available');
    assert.equal(JSON.stringify(loaded).includes('must-not-replace-associated-label'), false);
    assert.equal(Object.hasOwn(loaded, 'url'), false);
    assert.equal(Object.hasOwn(loaded, 'arbitrary'), false);

    observe(nativeInput({name: 'generation-begin', disposition: 'BEGIN_GENERATION', helperRun: 9, generationId: 3,
        currentGenerationId: 3, label: 'play-private-user-3'}));
    observe(nativeInput({name: 'file-loaded', helperRun: 9, generationId: 3, label: 'play-private-user-3'}));
    assert.equal(records.at(-1).details.requestId, 'UNAVAILABLE');
    assert.equal(JSON.stringify(records.at(-1)).includes('private-user'), false);

    observe(nativeInput({name: 'generation-begin', disposition: 'BEGIN_GENERATION', helperRun: 8, generationId: 1, label: 'play-2-1'}));
    observe(nativeInput({name: 'file-loaded', disposition: 'DROP_STALE_HELPER', helperRun: 7, generationId: 1, label: 'play-1-1'}));
    assert.equal(records.at(-1).details.requestId, 'UNAVAILABLE');
    assert.equal(records.at(-1).details.association, 'UNAVAILABLE');

    const boundedRecords = [];
    const bounded = createNativeDiagnostics(collectingLogger(boundedRecords));
    for (let generationId = 1; generationId <= 65; generationId++) {
        bounded(nativeInput({name: 'generation-begin', disposition: 'BEGIN_GENERATION', generationId, currentGenerationId: generationId, label: `play-${generationId}-1`}));
    }
    bounded(nativeInput({name: 'file-loaded', generationId: 1}));
    bounded(nativeInput({name: 'file-loaded', generationId: 2}));
    assert.equal(boundedRecords.at(-2).details.requestId, 'UNAVAILABLE');
    assert.equal(boundedRecords.at(-1).details.requestId, 'play-2-1');
    assert.equal(boundedRecords.length, 67);
});

test('native recorder admits 120 events, emits one suppression marker, then resets on the next minute', () => {
    const records = [];
    let now = 5000;
    const observe = createNativeDiagnostics(collectingLogger(records), {now: () => now});
    for (let generationId = 1; generationId <= 122; generationId++) {
        observe(nativeInput({name: 'generation-begin', disposition: 'BEGIN_GENERATION', generationId, currentGenerationId: generationId, label: `play-${generationId}-1`}));
    }
    assert.equal(records.length, 121);
    assert.equal(records.slice(0, 120).every(record => record.event === 'generation-begin'), true);
    assert.deepEqual(records[120].details, {reason: 'rate-limit', limitPerMinute: 120});
    now += 60000;
    observe(nativeInput({name: 'generation-retired', disposition: 'RETIRE_GENERATION'}));
    assert.equal(records.length, 122);
    assert.equal(records.at(-1).event, 'generation-retired');
});

test('native logging failures and rejected logger promises do not escape or stop later observations', async () => {
    let attempts = 0;
    const observe = createNativeDiagnostics(() => {
        attempts++;
        if (attempts === 1) throw new Error('logger path should not escape');
        if (attempts === 2) return Promise.reject(new Error('disk should not escape'));
        return undefined;
    });
    assert.doesNotThrow(() => observe(nativeInput()));
    assert.doesNotThrow(() => observe(nativeInput({generationId: 2, currentGenerationId: 2})));
    await new Promise(resolve => setImmediate(resolve));
    assert.doesNotThrow(() => observe(nativeInput({generationId: 3, currentGenerationId: 3})));
    assert.equal(attempts, 3);
});

test('renderer projector accepts existing package JavaScript and resolves a real ReferenceError stack', () => {
    const records = [];
    const window = fakeWindow(null);
    const dispose = install(window, collectingLogger(records), {appRoot: fixtureRoot});
    let error;
    try {
        require(scriptPath).raise();
    } catch (caught) {
        error = caught;
    }
    assert.ok(error instanceof ReferenceError);
    window.dispatch('error', {
        error,
        message: error.message,
        filename: scriptPath,
        lineno: 1,
        colno: 70
    });
    const output = onlyRecord(records);
    assert.equal(output.event, 'global-error');
    assert.equal(output.category, 'renderer');
    assert.equal(output.details.errorType, 'ReferenceError');
    assert.equal(output.details.messageKind, 'reference-not-defined');
    assert.equal(output.details.location.script, 'modules/fixture.js');
    assert.equal(output.details.location.line, 1);
    assert.ok(output.details.frames.length > 0);
    assert.ok(output.details.frames.length <= 8);
    assert.equal(output.details.frames[0].script, 'modules/fixture.js');
    assert.equal(JSON.stringify(output).includes('leakedFunctionName'), false);
    assert.equal(JSON.stringify(output).includes('missingRendererIdentifier'), false);
    dispose();
});

test('renderer projection keeps only bounded enums and in-package script positions', () => {
    const project = createProjector(fixtureRoot);
    const projected = project({
        errorType: 'TypeError',
        messageKind: 'type-error',
        message: 'secret user path C:\\Users\\alice\\token=private',
        token: 'secret-token',
        functionName: 'privateFunctionName',
        location: {script: scriptPath, line: 14, column: 9},
        frames: [
            {script: secondScriptPath, line: 2, column: 4, functionName: 'alsoPrivate'},
            {script: path.join(fixtureRoot, '..', 'outside.js'), line: 3, column: 5},
            {script: 'https://private.invalid/path.js?token=secret', line: 4, column: 6},
            {script: 'file://' + scriptPath.replace(/\\/g, '/') + '?secret=1', line: 5, column: 7},
            {script: 'C:\\Users\\alice\\AppData\\private.js', line: 6, column: 8},
            {script: 'renderer-chunk.js', line: 7, column: 9}
        ]
    });
    const text = JSON.stringify(projected);
    assert.deepEqual(Object.keys(projected).sort(), ['errorType', 'frames', 'location', 'messageKind']);
    assert.equal(projected.errorType, 'TypeError');
    assert.equal(projected.messageKind, 'type-error');
    assert.deepEqual(projected.location, {script: 'modules/fixture.js', line: 14, column: 9});
    assert.deepEqual(projected.frames, [
        {script: 'modules/second.cjs', line: 2, column: 4},
        {script: 'UNAVAILABLE', line: null, column: null},
        {script: 'UNAVAILABLE', line: null, column: null},
        {script: 'UNAVAILABLE', line: null, column: null},
        {script: 'UNAVAILABLE', line: null, column: null},
        {script: 'UNAVAILABLE', line: null, column: null}
    ]);
    const manyFrames = project({frames: Array.from({length: 10}, (_, index) => ({
        script: secondScriptPath, line: index + 1, column: index + 2
    }))});
    assert.equal(manyFrames.frames.length, 8);
    for (const secret of ['alice', 'token=private', 'secret-token', 'privateFunctionName', 'alsoPrivate', 'https://']) {
        assert.equal(text.includes(secret), false, `projected output leaked ${secret}`);
    }
    assert.equal(project({errorType: 'CustomError', messageKind: 'filesystem-path', location: {script: 'electron://private', line: 1, column: 2}}).errorType, 'UNAVAILABLE');
});

test('renderer stack parser accepts an anonymous V8 at-file frame without retaining its prefix', () => {
    const records = [];
    const window = fakeWindow(null);
    const dispose = install(window, collectingLogger(records), {appRoot: fixtureRoot});
    const error = new ReferenceError('missingName is not defined');
    error.stack = `ReferenceError: ${error.message}\n    at ${scriptPath}:1:7`;
    window.dispatch('error', {error, filename: scriptPath, lineno: 1, colno: 7});
    const output = onlyRecord(records);
    assert.equal(output.details.frames[0].script, 'modules/fixture.js');
    assert.equal(output.details.frames[0].line, 1);
    assert.equal(output.details.frames[0].column, 7);
    assert.equal(JSON.stringify(output).includes('at '), false);
    dispose();
});

test('renderer install is inert in subframes and disposal removes every listener', () => {
    const frame = fakeWindow({});
    const frameDispose = install(frame, () => assert.fail('subframe must not report'), {appRoot: fixtureRoot});
    assert.equal([...frame.listeners.values()].reduce((sum, values) => sum + values.size, 0), 0);
    frameDispose();

    const window = fakeWindow(null);
    const records = [];
    const dispose = install(window, collectingLogger(records), {appRoot: fixtureRoot});
    assert.equal(window.listeners.get('error').size, 1);
    assert.equal(window.listeners.get('unhandledrejection').size, 1);
    assert.equal(window.listeners.get('unload').size, 1);
    dispose();
    dispose();
    assert.equal([...window.listeners.values()].reduce((sum, values) => sum + values.size, 0), 0);
    window.dispatch('error', {message: 'late private message'});
    assert.equal(records.length, 0);
});

test('renderer listeners do not suppress errors and safely ignore non-Error rejections or hostile getters', () => {
    const records = [];
    const window = fakeWindow(null);
    const dispose = install(window, collectingLogger(records), {appRoot: fixtureRoot});
    let prevented = false;
    window.dispatch('error', {
        error: new Error('private message with https://private.invalid/token'),
        message: 'private message with https://private.invalid/token',
        filename: 'https://private.invalid/secret.js?token=secret',
        lineno: 3,
        colno: 4,
        preventDefault() { prevented = true; }
    });
    window.dispatch('unhandledrejection', {reason: 'user=C:\\Users\\alice\\token=secret'});
    const broken = {};
    Object.defineProperty(broken, 'reason', {get() { throw new Error('hostile getter'); }});
    assert.doesNotThrow(() => window.dispatch('unhandledrejection', broken));
    const hostileError = {};
    Object.defineProperty(hostileError, 'name', {get() { throw new Error('hostile name'); }});
    assert.doesNotThrow(() => window.dispatch('error', {error: hostileError}));
    assert.equal(prevented, false);
    assert.equal(records.length, 2);
    assert.equal(records[0].details.errorType, 'Error');
    assert.equal(records[0].details.location.script, 'UNAVAILABLE');
    assert.equal(records[1].event, 'unhandled-rejection');
    assert.equal(records[1].details.errorType, 'UNAVAILABLE');
    const text = JSON.stringify(records);
    for (const secret of ['private.invalid', 'token=secret', 'alice', 'hostile', 'user=']) {
        assert.equal(text.includes(secret), false, `reported output leaked ${secret}`);
    }
    dispose();
});

test('main receiver reprojects records, drops arbitrary fields, deduplicates, and caps at 20 plus suppression', () => {
    const records = [];
    let now = 1000;
    const receive = createReceiver(collectingLogger(records), {appRoot: fixtureRoot, now: () => now});
    const baseDetails = {
        errorType: 'Error',
        messageKind: 'UNAVAILABLE',
        location: {script: scriptPath, line: 1, column: 1},
        frames: [],
        message: 'must-not-cross-main-boundary',
        url: 'https://private.invalid/token',
        username: 'alice',
        token: 'secret',
        functionName: 'privateFunctionName',
        stack: 'private stack'
    };
    receive({event: 'global-error', details: baseDetails});
    receive({event: 'global-error', details: baseDetails});
    assert.equal(records.length, 1);
    assert.equal(Object.hasOwn(records[0].details, 'message'), false);
    assert.equal(Object.hasOwn(records[0].details, 'url'), false);
    assert.equal(Object.hasOwn(records[0].details, 'token'), false);
    assert.equal(records[0].details.location.script, 'modules/fixture.js');

    for (let line = 2; line <= 21; line++) {
        receive({event: 'global-error', details: Object.assign({}, baseDetails, {
            location: {script: scriptPath, line, column: 1}
        })});
    }
    assert.equal(records.length, 21);
    assert.equal(records[20].event, 'diagnostics-suppressed');
    assert.deepEqual(records[20].details, {reason: 'rate-limit', limitPerMinute: 20});
    receive({event: 'not-an-allowed-event', details: baseDetails});
    assert.equal(records.length, 21);
    now += 60000;
    receive({event: 'global-error', details: baseDetails});
    assert.equal(records.length, 22);
    assert.equal(records.at(-1).event, 'global-error');
    for (const secret of ['must-not-cross-main-boundary', 'private.invalid', 'alice', 'secret', 'privateFunctionName', 'private stack']) {
        assert.equal(JSON.stringify(records).includes(secret), false, `main receiver leaked ${secret}`);
    }
});

test('main receiver drops malformed projected input without invoking the logger', () => {
    let calls = 0;
    const receive = createReceiver(() => calls++, {appRoot: fixtureRoot});
    const details = {};
    Object.defineProperty(details, 'errorType', {get() { throw new Error('malformed input'); }});
    assert.doesNotThrow(() => receive({event: 'global-error', details}));
    assert.equal(calls, 0);
});

test('main receiver preserves only its fixed projection of a preload suppression marker', () => {
    const records = [];
    const receive = createReceiver(collectingLogger(records), {appRoot: fixtureRoot});
    receive({event: 'diagnostics-suppressed', details: {
        reason: 'private value', limitPerMinute: 1000000, token: 'secret', arbitrary: {path: 'C:\\Users\\alice'}
    }});
    assert.deepEqual(records, [{
        category: 'renderer',
        event: 'diagnostics-suppressed',
        details: {reason: 'rate-limit', limitPerMinute: 20}
    }]);
});
