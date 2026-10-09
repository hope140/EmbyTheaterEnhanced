'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Execute the actual smoke watchdog and finish functions without launching Electron.
// Only the renderer inspection and final output are replaced with controlled boundaries.
const smokeSource = fs.readFileSync(path.join(__dirname, '../tools/smoke-electron.cjs'), 'utf8');
const functionStart = smokeSource.indexOf('\nfunction finish(result) {');
const functionEnd = smokeSource.indexOf('\nif (boundedPipeline) {', functionStart);
assert.ok(functionStart >= 0 && functionEnd > functionStart, 'Smoke watchdog function boundaries must exist.');
const watchdogSource = smokeSource.slice(functionStart, functionEnd);

function fakeClock() {
    let now = 0;
    let nextId = 0;
    const timers = new Map();
    return {
        setTimeout(callback, delay) {
            const id = ++nextId;
            timers.set(id, {callback, at: now + delay});
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        advance(milliseconds) {
            now += milliseconds;
            for (const [id, timer] of [...timers]) {
                if (timer.at <= now) {
                    timers.delete(id);
                    timer.callback();
                }
            }
        },
        get pendingCount() { return timers.size; }
    };
}

function harness(executeJavaScript) {
    const clock = fakeClock();
    const results = [];
    const context = vm.createContext({
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        fakeCd2: null,
        pipelineDeadline: {dispose() {}},
        transitionTimelineMode: false,
        mediaRequests: [],
        testCd2Origin: '',
        withSourceUrl: source => source,
        windowOwnership: {getApplicationWindow: () => ({webContents: {executeJavaScript}})},
        writeResultAndExit: result => results.push(JSON.parse(JSON.stringify(result)))
    });
    vm.runInContext('let completed = false; let timeoutFailure = null;\n' + watchdogSource, context,
        {filename: 'smoke-watchdog-under-test.cjs'});
    return {clock, results, finish: context.finish, inspectTimeout: context.inspectTimeout};
}

test('a late pipeline success cannot replace a timeout while renderer evidence is pending', async () => {
    const fixture = harness(() => new Promise(() => {}));
    const deadline = {kind: 'stage', stage: 'nexttrack-2', elapsedMs: 20000, stageElapsedMs: 15000};
    const inspecting = fixture.inspectTimeout(deadline);
    assert.equal(fixture.results.length, 0);

    fixture.finish({ok: true, state: {ready: true}});
    assert.equal(fixture.results.length, 1);
    assert.equal(fixture.results[0].ok, false);
    assert.equal(fixture.results[0].error, 'UI smoke timeout');
    assert.deepEqual(fixture.results[0].deadline, deadline);

    fixture.clock.advance(750);
    await inspecting;
    assert.equal(fixture.results.length, 1, 'The delayed inspection must not write a second result.');
    assert.equal(fixture.clock.pendingCount, 0);
});

test('a renderer destroyed between inspection awaits still produces a failed terminal result', async () => {
    let inspectionCalls = 0;
    const fixture = harness(() => {
        if (++inspectionCalls === 2) throw new Error('Object has been destroyed');
        return Promise.resolve([]);
    });
    await fixture.inspectTimeout({kind: 'total', stage: 'generation-tests'});

    assert.equal(inspectionCalls, 2);
    assert.equal(fixture.results.length, 1);
    assert.equal(fixture.results[0].ok, false);
    assert.equal(fixture.results[0].error, 'UI smoke timeout');
    assert.equal(fixture.results[0].rendererInspection, 'UNAVAILABLE');
    assert.equal(fixture.clock.pendingCount, 0);
});

test('an unresponsive renderer is bounded to 750 ms of timeout evidence collection', async () => {
    const fixture = harness(() => new Promise(() => {}));
    const inspecting = fixture.inspectTimeout({kind: 'startup', stage: null});
    assert.equal(fixture.clock.pendingCount, 1);

    fixture.clock.advance(749);
    await Promise.resolve();
    assert.equal(fixture.results.length, 0);

    fixture.clock.advance(1);
    await inspecting;
    assert.equal(fixture.results.length, 1);
    assert.equal(fixture.results[0].ok, false);
    assert.equal(fixture.results[0].rendererInspection, 'UNAVAILABLE');
    assert.equal(fixture.clock.pendingCount, 0);
});
