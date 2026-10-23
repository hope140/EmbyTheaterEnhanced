'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createScheduler} = require('../tools/prototypes/playback-cache/prefetch.cjs');
const {createStore} = require('../tools/prototypes/playback-cache/store.cjs');

const policy = {bytesPerSecond: 4, burstBytes: 4, maxBytes: 8, maxDurationMs: 10000};
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function gate() { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; }
function fixture(t, options = {}) {
    let time = 1000, nextTimer = 0;
    const timers = new Map(), waits = [];
    const scheduler = createScheduler({enabled: true, policy, now: () => time,
        setTimer(callback, ms) { const id = ++nextTimer; timers.set(id, {callback, due: time + ms}); return id; },
        clearTimer(id) { timers.delete(id); },
        async delay(ms, signal) { assert.equal(signal.aborted, false); waits.push(ms); time += ms; },
        ...options});
    t.after(() => scheduler.close());
    return {scheduler, waits, timers, now: () => time,
        advance(ms) { time += ms; for (const [id, timer] of [...timers]) if (timer.due <= time) { timers.delete(id); timer.callback(); } }};
}
const candidate = (run, change = {}) => ({confirmed: true, owner: 'current-owner', nextKey: 'confirmed-next',
    confirmedUntil: 20000, run, ...change});
const expectCode = (fn, code) => assert.throws(fn, error => error.code === code && error.message === code);

test('scheduler is inert by default and needs every explicit limit', () => {
    assert.deepEqual(createScheduler(), {enabled: false});
    expectCode(() => createScheduler({enabled: true}), 'prefetch-policy-required');
    expectCode(() => createScheduler({enabled: true, policy: {...policy, bytesPerSecond: 0}}), 'prefetch-policy-required');
});

test('only an explicit confirmed next item can run; repeated confirmation is deduplicated', async t => {
    const {scheduler} = fixture(t); let calls = 0;
    assert.equal(scheduler.update(candidate(() => { calls++; }, {confirmed: false})), 'unconfirmed');
    await scheduler.whenIdle(); assert.equal(calls, 0);
    const job = candidate(() => { calls++; });
    assert.equal(scheduler.update(job), 'queued'); assert.equal(scheduler.update(job), 'duplicate');
    await scheduler.whenIdle(); assert.equal(calls, 1); assert.equal(scheduler.update(job), 'duplicate');
    assert.equal(scheduler.status().lastOutcome, 'completed');
});

test('token grants precede writes, bound total bytes and wait for the configured sustained rate', async t => {
    const f = fixture(t); const writes = [];
    f.scheduler.update(candidate(async budget => {
        const writer = {append(offset, bytes) { writes.push({offset, bytes: bytes.toString(), time: f.now()}); return offset + bytes.length; }};
        expectCode(() => budget.append(writer, 0, Buffer.from('a')), 'prefetch-unbudgeted-write');
        for (let offset = 0; offset < 8; offset += 4) {
            await budget.claim(4); budget.append(writer, offset, Buffer.from('abcd'));
        }
        await assert.rejects(budget.claim(1), {code: 'prefetch-byte-limit'});
        await assert.rejects(budget.claim(5), {code: 'prefetch-claim-invalid'});
    }));
    await f.scheduler.whenIdle();
    assert.deepEqual(f.waits, [1000, 1000]); assert.deepEqual(writes.map(value => value.time), [2000, 3000]);
    assert.equal(f.scheduler.status().lastOutcome, 'completed'); assert.equal(f.timers.size, 0);
});

test('concurrent claims cannot overbook the byte limit', async t => {
    const f = fixture(t); let results;
    f.scheduler.update(candidate(async budget => {
        results = await Promise.allSettled([budget.claim(4), budget.claim(4), budget.claim(4)]);
    }));
    await f.scheduler.whenIdle();
    assert.equal(results.filter(value => value.status === 'fulfilled').length, 2);
    assert.equal(results.find(value => value.status === 'rejected').reason.code, 'prefetch-byte-limit');
});

test('foreground priority cancels an active job and forbids late cached writes', async t => {
    const f = fixture(t); const paused = gate(), entered = gate(); let writes = 0, signal, denied;
    f.scheduler.update(candidate(async budget => {
        signal = budget.signal; await budget.claim(4); entered.resolve(); await paused.promise;
        try { budget.append({append() { writes++; }}, 0, Buffer.from('abcd')); } catch (error) { denied = error.code; }
    }));
    await entered.promise; f.scheduler.setForegroundBusy(true);
    assert.equal(signal.aborted, true); paused.resolve(); await f.scheduler.whenIdle();
    assert.equal(denied, 'prefetch-cancelled');
    assert.equal(writes, 0); assert.equal(f.scheduler.status().lastOutcome, 'cancelled');
    f.scheduler.setForegroundBusy(false); await f.scheduler.whenIdle(); assert.equal(writes, 0);
});

test('replacement waits for cancellation to settle, then runs only the latest confirmation', async t => {
    const f = fixture(t); const entered = gate(), paused = gate(); const calls = [];
    f.scheduler.update(candidate(async () => { calls.push('A'); entered.resolve(); await paused.promise; }));
    await entered.promise;
    f.scheduler.update(candidate(() => calls.push('B'), {nextKey: 'B'}));
    f.scheduler.update(candidate(() => calls.push('C'), {nextKey: 'C', owner: 'new-owner'}));
    await tick(); assert.deepEqual(calls, ['A']);
    assert.equal(f.scheduler.status().active, true); assert.equal(f.scheduler.status().pending, true);
    paused.resolve(); await f.scheduler.whenIdle(); assert.deepEqual(calls, ['A', 'C']);
});

test('loss of next-item confirmation retires an old job rather than leaving it active', async t => {
    const f = fixture(t); const entered = gate(), paused = gate(); let signal;
    f.scheduler.update(candidate(async budget => { signal = budget.signal; entered.resolve(); await paused.promise; }));
    await entered.promise; assert.equal(f.scheduler.update(null), 'unconfirmed');
    assert.equal(signal.aborted, true); paused.resolve(); await f.scheduler.whenIdle();
    assert.equal(f.scheduler.status().lastOutcome, 'cancelled');
});

test('confirmation expiry is checked when a queued job obtains its slot', async t => {
    const f = fixture(t); let calls = 0;
    f.scheduler.setForegroundBusy(true);
    f.scheduler.update(candidate(() => { calls++; }, {confirmedUntil: 1100}));
    f.advance(100); f.scheduler.setForegroundBusy(false); await f.scheduler.whenIdle();
    assert.equal(calls, 0); assert.equal(f.scheduler.status().lastOutcome, 'expired');
});

test('absolute deadline rejects late writes even before an overdue timer callback runs', async t => {
    let time = 1000;
    const {scheduler} = fixture(t, {now: () => time, delay: async ms => { time += ms; },
        setTimer: () => 1, clearTimer() {}});
    let writes = 0, denied;
    scheduler.update(candidate(async budget => {
        await budget.claim(1); time = 11000;
        try { budget.append({append() { writes++; }}, 0, Buffer.from('a')); } catch (error) { denied = error.code; }
    }));
    await scheduler.whenIdle(); assert.equal(denied, 'prefetch-expired');
    assert.equal(writes, 0); assert.equal(scheduler.status().lastOutcome, 'cancelled');
});

test('the real abortable wait releases its timer immediately when cancelled', async t => {
    const entered = gate(); let denied;
    const scheduler = createScheduler({enabled: true,
        policy: {...policy, bytesPerSecond: 1}});
    t.after(() => scheduler.close());
    scheduler.update(candidate(async budget => {
        entered.resolve();
        try { await budget.claim(1); } catch (error) { denied = error.code; }
    }, {confirmedUntil: Date.now() + 20000}));
    await entered.promise; scheduler.cancel(); await scheduler.whenIdle();
    assert.equal(denied, 'prefetch-cancelled'); assert.equal(scheduler.status().lastOutcome, 'cancelled');
});

test('deadline timer signals stalled work; shutdown waits for that owned work to settle', async t => {
    const f = fixture(t); const entered = gate(), paused = gate(); let signal;
    f.scheduler.update(candidate(async budget => { signal = budget.signal; entered.resolve(); await paused.promise; }));
    await entered.promise; f.advance(10000); assert.equal(signal.aborted, true);
    let closed = false; const closing = f.scheduler.close().then(() => { closed = true; });
    await tick(); assert.equal(closed, false);
    paused.resolve(); await closing; assert.equal(f.scheduler.status().active, false);
    expectCode(() => f.scheduler.update(candidate(() => {})), 'prefetch-closed');
});

test('worker failure is contained and raw sensitive errors do not enter public status', async t => {
    const {scheduler} = fixture(t);
    scheduler.update(candidate(() => { throw Error('https://private.invalid/?token=secret'); }));
    await scheduler.whenIdle(); assert.equal(scheduler.status().lastOutcome, 'failed');
    assert.equal(/private|secret|token/.test(JSON.stringify(scheduler.status())), false);
    scheduler.update(candidate(() => {}, {nextKey: 'reconfirmed'})); await scheduler.whenIdle();
    assert.equal(scheduler.status().lastOutcome, 'completed');
});

test('an update at the task completion boundary is drained without losing the latest job', async t => {
    const {scheduler} = fixture(t); const calls = [];
    scheduler.update(candidate(() => {
        calls.push('A'); queueMicrotask(() => scheduler.update(candidate(() => calls.push('B'), {nextKey: 'B'})));
    }));
    await scheduler.whenIdle(); assert.deepEqual(calls, ['A', 'B']);
});

test('a completed task cannot retain a budget that writes after its ownership ends', async t => {
    const {scheduler} = fixture(t); let retained, writes = 0;
    scheduler.update(candidate(async budget => { retained = budget; await budget.claim(1); }));
    await scheduler.whenIdle();
    expectCode(() => retained.append({append() { writes++; }}, 0, Buffer.from('a')), 'prefetch-cancelled');
    await assert.rejects(retained.claim(1), {code: 'prefetch-cancelled'});
    assert.equal(writes, 0); assert.equal(retained.signal.aborted, true);
});

test('job completion cancels an abandoned claim and its real wait timer', async t => {
    const scheduler = createScheduler({enabled: true, policy: {...policy, bytesPerSecond: 1}});
    t.after(() => scheduler.close()); let abandoned;
    scheduler.update(candidate(budget => { abandoned = budget.claim(1); }, {confirmedUntil: Date.now() + 20000}));
    await scheduler.whenIdle();
    await assert.rejects(abandoned, {code: 'prefetch-cancelled'});
    assert.equal(scheduler.status().lastOutcome, 'completed');
});

test('a newer confirmation submitted from an abort listener wins over the outer update', async t => {
    const {scheduler} = fixture(t); const entered = gate(), paused = gate(), calls = [];
    scheduler.update(candidate(async budget => {
        calls.push('A');
        budget.signal.addEventListener('abort', () => scheduler.update(candidate(() => calls.push('C'), {nextKey: 'C'})), {once: true});
        entered.resolve(); await paused.promise;
    }));
    await entered.promise;
    assert.equal(scheduler.update(candidate(() => calls.push('B'), {nextKey: 'B'})), 'superseded');
    paused.resolve(); await scheduler.whenIdle(); assert.deepEqual(calls, ['A', 'C']);
});

test('offline prefetch can populate the same byte store; the following explicit authorized reader reuses it', async t => {
    const f = fixture(t);
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-prefetch-test-')));
    const store = createStore({enabled: true, parent, now: f.now,
        policy: {maxBytes: 8, maxEntries: 1, ttlMs: 10000, minFreeBytes: 0}});
    t.after(() => { store.close(); fs.rmSync(parent, {recursive: true, force: true}); });
    const identity = {serverId: 'test-server', accountId: 'test-account', itemId: 'next-episode',
        mediaSourceId: 'source', versionId: 'version', representationId: 'original'};
    const proof = {authorized: true, mode: 'direct-file', rangeSupported: true,
        contentLength: 8, strongETag: '"test-version"', validUntil: 20000};
    f.scheduler.update(candidate(async budget => {
        const writer = store.begin(identity, proof);
        try {
            for (const [offset, text] of [[0, 'next'], [4, 'data']]) {
                await budget.claim(4); budget.append(writer, offset, Buffer.from(text));
            }
        } finally { writer.release(); }
    }));
    await f.scheduler.whenIdle(); assert.equal(f.scheduler.status().lastOutcome, 'completed');
    assert.equal(store.status().pinnedEntries, 0);
    const reader = store.acquireComplete(identity, proof);
    assert.equal(reader.read(0, 8).toString(), 'nextdata'); reader.release();
});
