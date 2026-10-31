'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {matchesStoppedReport} = require('../tools/shared-playback-cache/windows-smoke.cjs');

const helperPath = path.join(__dirname, 'helpers', 'next-prefix-alameda.cjs');
test('Stop report must belong to the actual synthetic item, session and media version', () => {
    const row = {type: 'server-report', method: 'stop', item: 'A', session: 'synthetic-session-A', mediaSource: 'A-avi'};
    assert.equal(matchesStoppedReport(row, 'A'), true);
    for (const changed of [null, {...row, method: 'start'}, {...row, item: 'B'}, {...row, session: 'synthetic-session-B'},
        {...row, mediaSource: 'B-avi'}, {...row, session: undefined}, {...row, mediaSource: undefined}]) {
        assert.equal(matchesStoppedReport(changed, 'A'), false);
    }
    assert.equal(matchesStoppedReport(row, 'B'), false);
});

function actualStopFunctionText(source) {
    const assignment = 'window.prefixStop =';
    const start = source.indexOf(assignment);
    assert.notEqual(start, -1, 'rendererBoot must assign window.prefixStop');
    const arrow = source.indexOf('async () => {', start);
    assert.notEqual(arrow, -1, 'prefixStop must remain an async arrow function');
    const open = source.indexOf('{', arrow);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) {
            const end = source.indexOf(';', i);
            assert.notEqual(end, -1, 'prefixStop assignment must terminate');
            return source.slice(start, end + 1);
        }
    }
    assert.fail('prefixStop function body is unterminated');
}

function setup() {
    const source = fs.readFileSync(helperPath, 'utf8');
    const statement = actualStopFunctionText(source);
    const events = [];
    let resolveStop, rejectStop, resolveDestroy;
    const stopPromise = new Promise((resolve, reject) => {resolveStop = resolve; rejectStop = reject;});
    const destroyPromise = new Promise(resolve => {resolveDestroy = resolve;});
    const manager = {stop: () => stopPromise};
    let destroyCalls = 0;
    const player = {destroy: () => {destroyCalls++; return destroyPromise;}};
    const context = {window: {}, manager, player, report: (type, data) => events.push({type, ...data})};
    vm.runInNewContext(statement, context, {timeout: 1000});
    return {stop: context.window.prefixStop, events, resolveStop, rejectStop, resolveDestroy, destroyCalls: () => destroyCalls};
}

const operations = events => events.filter(event => event.type === 'stop-stage').map(event => event.operation);

test('renderer stop awaits manager stop and player destroy before completion', async () => {
    const state = setup();
    const completion = state.stop();

    assert.deepEqual(operations(state.events), ['manager-start']);
    assert.equal(typeof state.resolveStop, 'function');
    assert.equal(state.destroyCalls(), 0);

    state.resolveStop();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(operations(state.events), ['manager-start', 'manager-done', 'player-destroy-start']);
    assert.equal(state.destroyCalls(), 1);

    let completed = false;
    completion.then(() => {completed = true;});
    await Promise.resolve();
    assert.equal(completed, false, 'completion must wait for player.destroy()');
    assert.deepEqual(operations(state.events), ['manager-start', 'manager-done', 'player-destroy-start']);

    state.resolveDestroy();
    await completion;
    assert.deepEqual(operations(state.events), ['manager-start', 'manager-done', 'player-destroy-start', 'player-destroy-done']);
});

test('rejected manager stop rejects without destroying the player or reporting completion', async () => {
    const state = setup();
    const completion = state.stop();
    const expected = new Error('manager-stop-failed');
    state.rejectStop(expected);

    await assert.rejects(completion, error => error === expected);
    assert.deepEqual(operations(state.events), ['manager-start']);
    assert.equal(state.destroyCalls(), 0);
});
