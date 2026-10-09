'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the real fixture helper; neither Electron nor a packaged runtime is needed.
const source = fs.readFileSync(path.join(__dirname, 'pipeline-browser.js'), 'utf8');
const start = source.indexOf('    let lastRemoteStopAt = 0;');
const end = source.indexOf('\n    try {', start);
assert.ok(start >= 0 && end > start, 'The fixture Stop helper boundaries must exist.');
const stopSource = source.slice(start, end);

function harness() {
    let now = 10000;
    let currentItem = 'a';
    const reports = new Set();
    const waits = new Set();
    const sleepers = [];
    const sleepDurations = [];
    const commands = [];
    const context = vm.createContext({
        Date: {now: () => now},
        sleep: milliseconds => {
            sleepDurations.push(milliseconds);
            return new Promise(resolve => sleepers.push({at: now + milliseconds, resolve}));
        },
        send: command => commands.push({command, at: now}),
        reported: (itemId, endpoint) => reports.has(itemId + endpoint),
        manager: {currentItem: () => currentItem},
        sync: {
            wait(name, predicate) {
                assert.equal(name, 'stopped-report');
                if (predicate()) return Promise.resolve();
                return new Promise((resolve, reject) => waits.add({predicate, resolve, reject}));
            }
        }
    });
    vm.runInContext(stopSource + '\nglobalThis.stopCurrent = stopCurrent;', context,
        {filename: 'pipeline-stop-under-test.js'});

    function notify() {
        for (const waiter of [...waits]) {
            if (waiter.predicate()) {
                waits.delete(waiter);
                waiter.resolve();
            }
        }
    }
    return {
        stopCurrent: context.stopCurrent,
        commands,
        sleepDurations,
        setCurrentItem(itemId) { currentItem = itemId; notify(); },
        reportStopped(itemId) { reports.add(itemId + '/Stopped'); notify(); },
        advance(milliseconds) {
            now += milliseconds;
            for (let index = sleepers.length - 1; index >= 0; index--) {
                if (sleepers[index].at <= now) sleepers.splice(index, 1)[0].resolve();
            }
        },
        expireReportWaits() {
            for (const waiter of waits) waiter.reject(new Error('stopped-report-timeout'));
            waits.clear();
        },
        get pendingReports() { return waits.size; }
    };
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
}

test('a second remote Stop waits beyond the existing one-second input cooldown', async () => {
    const fixture = harness();
    const first = fixture.stopCurrent('a');
    assert.deepEqual(fixture.commands, [{command: 'Stop', at: 10000}]);
    fixture.reportStopped('a');
    fixture.setCurrentItem(null);
    await first;

    fixture.advance(600);
    fixture.setCurrentItem('b');
    const second = fixture.stopCurrent('b');
    assert.deepEqual(fixture.sleepDurations, [401]);
    assert.equal(fixture.commands.length, 1);

    fixture.advance(400);
    await flushMicrotasks();
    assert.equal(fixture.commands.length, 1, 'The second Stop must not be sent at the one-second boundary.');
    fixture.advance(1);
    await flushMicrotasks();
    assert.equal(fixture.commands.length, 2);
    assert.equal(fixture.commands[1].command, 'Stop');
    assert.equal(fixture.commands[1].at - fixture.commands[0].at, 1001);
    assert.equal(fixture.pendingReports, 1, 'Cooldown completion must not imply playback stopped.');
    fixture.reportStopped('b');
    fixture.setCurrentItem(null);
    await second;
});

test('a wrong report or an uncleared current item cannot satisfy Stop completion', async () => {
    const fixture = harness();
    fixture.setCurrentItem('b');
    let settlement = 'pending';
    const stopped = fixture.stopCurrent('b').then(
        () => { settlement = 'resolved'; },
        error => { settlement = 'rejected'; return error; }
    );

    fixture.reportStopped('a');
    fixture.setCurrentItem(null);
    await flushMicrotasks();
    assert.equal(settlement, 'pending', 'Another item\'s report must not satisfy the expected Stop.');

    fixture.setCurrentItem('b');
    fixture.reportStopped('b');
    await flushMicrotasks();
    assert.equal(settlement, 'pending', 'A report alone must not substitute for clearing the current item.');

    fixture.expireReportWaits();
    const error = await stopped;
    assert.equal(settlement, 'rejected');
    assert.match(error.message, /stopped-report-timeout/);
});

test('a Stop after the cooldown has elapsed is sent without an extra sleep', async () => {
    const fixture = harness();
    const first = fixture.stopCurrent('a');
    fixture.reportStopped('a');
    fixture.setCurrentItem(null);
    await first;

    fixture.advance(1500);
    fixture.setCurrentItem('b');
    const second = fixture.stopCurrent('b');
    assert.deepEqual(fixture.sleepDurations, []);
    assert.deepEqual(fixture.commands, [{command: 'Stop', at: 10000}, {command: 'Stop', at: 11500}]);
    fixture.reportStopped('b');
    fixture.setCurrentItem(null);
    await second;
});
