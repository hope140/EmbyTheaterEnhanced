'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const cd2 = require('../src/electronapp/enhanced/cd2-service');
const strmResolver = require('../src/electronapp/resolvers/strm-resolver');

const CANDIDATE = 'X:\\Media\\Show\\Episode.mkv';

function readyConfig(overrides) {
    return Object.assign({
        enabled: true,
        origin: cd2.parseOrigin('http://127.0.0.1:19798'),
        token: 'placeholder',
        localPrefix: cd2.normalizeLocalPath('X:\\Media'),
        cloudPrefix: cd2.normalizeCloudPath('/cloud/media'),
        directUrlEnabled: true,
        totalBudgetMs: 1200
    }, overrides || {});
}

function createClock(start) {
    let current = start || 0;
    let sequence = 0;
    const timers = [];

    function setTimeoutFn(callback, delay) {
        const timer = {
            at: current + Math.max(0, Number(delay) || 0),
            callback: callback,
            sequence: sequence++,
            cancelled: false
        };
        timers.push(timer);
        return timer;
    }

    function clearTimeoutFn(timer) {
        if (timer) timer.cancelled = true;
    }

    function advance(milliseconds) {
        current += milliseconds;
        while (true) {
            const next = timers
                .filter(timer => !timer.cancelled && timer.at <= current)
                .sort((left, right) => left.at - right.at || left.sequence - right.sequence)[0];
            if (!next) return;
            next.cancelled = true;
            next.callback();
        }
    }

    return {
        now: () => current,
        setTimeout: setTimeoutFn,
        clearTimeout: clearTimeoutFn,
        advance
    };
}

async function flushMicrotasks() {
    for (let index = 0; index < 8; index++) await Promise.resolve();
}

function makeTransport(clock, downloadPlan, phasePlan) {
    const calls = [];
    const phases = phasePlan || {};
    const client = {
        waitForReady(deadline, callback) {
            calls.push({method: 'waitForReady', deadline});
            if (phases.readyDelay !== undefined) {
                clock.setTimeout(() => callback(null), phases.readyDelay);
            } else {
                callback(null);
            }
        },
        FindFileByPath(request, metadata, options, callback) {
            calls.push({method: 'FindFileByPath', request, metadata, options});
            const response = {
                fullPathName: request.path,
                size: '10',
                fileType: 'File',
                isDirectory: false
            };
            if (phases.findDelay !== undefined) {
                clock.setTimeout(() => callback(null, response), phases.findDelay);
            } else {
                callback(null, response);
            }
        },
        GetDownloadUrlPath(request, metadata, options, callback) {
            const call = {method: 'GetDownloadUrlPath', request, metadata, options, cancelled: false};
            calls.push(call);
            const plan = downloadPlan(call);
            if (plan) {
                clock.setTimeout(() => callback(null, plan.response), plan.delay);
            }
            return {cancel() { call.cancelled = true; }};
        },
        close() {}
    };

    return {
        client,
        metadata: {},
        status: {CANCELLED: 1, NOT_FOUND: 5, DEADLINE_EXCEEDED: 4, UNAVAILABLE: 14},
        calls
    };
}

function createService(clock, transport, overrides) {
    return cd2.createService({
        config: readyConfig(overrides),
        now: clock.now,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        transportFactory: () => transport
    });
}

function request(mode, requestId, deadlineAt) {
    return {
        mode,
        requestId,
        deadlineAt,
        candidates: [CANDIDATE]
    };
}

test('320ms DirectUrl download succeeds with the 500ms stage budget', async () => {
    const clock = createClock(1000);
    const transport = makeTransport(clock, call => ({
        delay: 320,
        response: {directUrl: 'https://cdn.example.test/episode.mkv'}
    }));
    const service = createService(clock, transport);

    try {
        const pending = service.resolve(request('direct', 'budget-direct'));
        await flushMicrotasks();
        await (async () => { clock.advance(320); await flushMicrotasks(); })();
        const response = await pending;

        assert.equal(response.status, 'hit');
        assert.equal(response.sourceKind, 'direct-url');
        assert.equal(transport.calls.find(call => call.method === 'waitForReady').deadline.getTime(), 1200);
        assert.equal(transport.calls.find(call => call.method === 'FindFileByPath').options.deadline.getTime(), 1350);
        assert.equal(transport.calls.find(call => call.method === 'GetDownloadUrlPath').options.deadline.getTime(), 1500);
    } finally {
        service.close();
    }
});

test('late DirectUrl start uses the full 500ms Same-Origin reserve in its RPC deadline', async () => {
    const clock = createClock(1000);
    const transport = makeTransport(clock, () => ({
        delay: 10,
        response: {directUrl: 'https://cdn.example.test/late-start.mkv'}
    }), {readyDelay: 150, findDelay: 180});
    const service = createService(clock, transport);

    try {
        const pending = service.resolve(request('direct', 'budget-reserve', 2200));
        await flushMicrotasks();
        clock.advance(150);
        await flushMicrotasks();
        clock.advance(180);
        await flushMicrotasks();

        const downloadCall = transport.calls.find(call => call.method === 'GetDownloadUrlPath');
        assert.equal(downloadCall.options.deadline.getTime(), 1700);
        clock.advance(10);
        await flushMicrotasks();
        assert.equal((await pending).status, 'hit');
    } finally {
        service.close();
    }
});

test('Direct timeout still gives Same-Origin a 320ms window under one 1200ms deadline', async () => {
    const clock = createClock(1000);
    const deadlineAt = clock.now() + 1200;
    const transport = makeTransport(clock, call => call.request.get_direct_url
        ? null
        : {delay: 320, response: {downloadUrlPath: '/fallback/episode.mkv'}});
    const service = createService(clock, transport);

    try {
        const directPending = service.resolve(request('direct', 'budget-fallback', deadlineAt));
        await flushMicrotasks();
        clock.advance(500);
        await flushMicrotasks();
        const direct = await directPending;
        assert.equal(direct.status, 'miss');
        assert.equal(direct.reason, 'timeout');

        const sameOriginPending = service.resolve(request('same-origin', 'budget-fallback', deadlineAt));
        await flushMicrotasks();
        clock.advance(320);
        await flushMicrotasks();
        const sameOrigin = await sameOriginPending;

        assert.equal(sameOrigin.status, 'hit');
        assert.equal(sameOrigin.sourceKind, 'cd2-url');
        const sameOriginCall = transport.calls.filter(call => call.method === 'GetDownloadUrlPath').at(-1);
        assert.equal(sameOriginCall.options.deadline.getTime(), 2000);
    } finally {
        service.close();
    }
});

test('download latency beyond 500ms still times out and cancels the RPC', async () => {
    const clock = createClock(1000);
    const transport = makeTransport(clock, () => ({
        delay: 501,
        response: {directUrl: 'https://cdn.example.test/late.mkv'}
    }));
    const service = createService(clock, transport);

    try {
        const pending = service.resolve(request('direct', 'budget-too-slow'));
        await flushMicrotasks();
        clock.advance(500);
        await flushMicrotasks();
        const response = await pending;

        assert.equal(response.status, 'miss');
        assert.equal(response.reason, 'timeout');
        const downloadCall = transport.calls.find(call => call.method === 'GetDownloadUrlPath');
        assert.equal(downloadCall.cancelled, true);
        clock.advance(1);
        await flushMicrotasks();
        assert.equal(response.reason, 'timeout');
    } finally {
        service.close();
    }
});

test('a smaller total budget keeps the Direct deadline within the overall window', async () => {
    const clock = createClock(1000);
    const transport = makeTransport(clock, () => null);
    const service = createService(clock, transport, {totalBudgetMs: 430});

    try {
        const pending = service.resolve(request('direct', 'budget-small-total'));
        await flushMicrotasks();
        const downloadCall = transport.calls.find(call => call.method === 'GetDownloadUrlPath');
        assert.equal(downloadCall.options.deadline.getTime(), 1430);
        clock.advance(430);
        await flushMicrotasks();
        assert.equal((await pending).reason, 'timeout');
    } finally {
        service.close();
    }
});

test('STRM resolver passes one 1200ms absolute deadline to every Enhanced CD2 stage', async () => {
    const start = 5000;
    const observedDeadlines = [];
    const result = await strmResolver.resolveAsync({
        item: {Path: 'X:\\Media\\Show\\Episode.strm'},
        mediaSource: {Path: CANDIDATE, Container: 'strm'},
        url: 'https://emby.example.test/native',
        playMethod: 'DirectPlay'
    }, {
        fs: {existsSync: () => false},
        now: () => start,
        requestId: 'resolver-budget',
        config: {
            version: 1,
            enabled: true,
            rules: [{
                id: 'budget-rule',
                sourcePrefix: 'X:\\Media',
                cloudPrefix: '/cloud/media',
                strategy: 'cloud-first',
                order: ['direct-url', 'cd2-http', 'mount', 'native'],
                originState: 'USER',
                enabled: true
            }]
        },
        cd2Transport: {
            resolve: async requestValue => {
                observedDeadlines.push(requestValue.deadlineAt);
                return {status: 'miss', reason: 'timeout'};
            }
        }
    });

    assert.equal(result.type, 'native');
    assert.equal(result.reason, 'native_fallback');
    assert.deepEqual(observedDeadlines, [6200, 6200]);
});
