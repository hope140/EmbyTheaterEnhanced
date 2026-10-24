'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rendererPath = path.join(__dirname, '../src/electronapp/enhanced/playback-range-renderer.js');
const rendererSource = fs.readFileSync(rendererPath, 'utf8');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

function loadRenderer(timerHarness) {
    let renderer;
    const define = (_dependencies, factory) => { renderer = factory(); };
    define.amd = {};
    vm.runInNewContext(rendererSource, {
        define,
        URL,
        AbortController,
        setTimeout(callback, delay) { return timerHarness.setTimeout(callback, delay); },
        clearTimeout(id) { timerHarness.clearTimeout(id); },
        setInterval(callback, delay) { return timerHarness.setInterval(callback, delay); },
        clearInterval(id) { timerHarness.clearInterval(id); },
        fetch() { throw Error('unexpected global fetch'); }
    }, {filename: rendererPath, timeout: 1000});
    return renderer;
}

function timerHarness() {
    let nextId = 1;
    const timeouts = new Map(), intervals = new Map();
    return {
        timeouts,
        intervals,
        setTimeout(callback, delay) { const id = nextId++; timeouts.set(id, {callback, delay}); return id; },
        clearTimeout(id) { timeouts.delete(id); },
        setInterval(callback, delay) { const id = nextId++; intervals.set(id, {callback, delay}); return id; },
        clearInterval(id) { intervals.delete(id); },
        fireTimeout(id) { const entry = timeouts.get(id); assert.ok(entry, 'timeout should be pending'); timeouts.delete(id); entry.callback(); }
    };
}

function createFixture(options = {}) {
    const timers = timerHarness();
    const renderer = loadRenderer(timers);
    const item = {Id: 'current-item', ServerId: 'server-1', Type: 'Episode', MediaType: 'Video', SeriesId: 'series-1'};
    const mediaSource = {Id: 'source-1', Container: 'mp4'};
    const playOptions = {playMethod: 'DirectStream', playSessionId: 'session-1'};
    let api = {
        _identityEpoch: 3,
        serverAddress: () => 'https://emby.example.test',
        serverId: () => 'server-1',
        getCurrentUserId: () => 'account-1',
        getUrl: pathValue => new URL(pathValue, 'https://emby.example.test').href,
        setAuthorizationInfoIntoRequest(request) { request.headers['x-emby-token'] = 'fixture-token-canary'; },
        deviceId: () => 'device-1',
        accessToken: () => 'fixture-token-canary'
    };
    let current = true;
    let candidate = {Id: 'next-B', ServerId: 'server-1', Type: 'Episode', SeriesId: 'series-1'};
    let position = {positionTicks: 0, durationTicks: 100};
    const player = {};
    const playbackManager = {
        getCurrentPlayer: () => player,
        _playQueueManager: {getNextItemInfo: () => candidate ? {item: candidate} : null}
    };
    const statusCalls = [];
    const counters = {cancel: 0, preload: 0, retire: 0, fetch: 0};
    const binding = {
        setContext: async () => {},
        cancelNext: async () => { counters.cancel++; },
        preload: async () => { counters.preload++; return {value: {state: 'ready'}}; },
        retire: async () => { counters.retire++; },
        status() { const entry = statusCalls.shift(); return entry ? entry() : Promise.resolve({value: {enabled: true, next: {state: 'idle'}}}); }
    };
    const endpoint = {
        rangeCache: {enabled: true, progressPercent: 70, timeoutMs: 30000},
        createRangeBinding: () => binding
    };
    const connectionManager = {getApiClient: () => api};
    const signal = new AbortController().signal;
    const fetcher = options.fetch || (async () => {
        counters.fetch++;
        throw Error('unexpected metadata fetch');
    });
    const bindPromise = renderer.bind({
        endpoint, connectionManager, playbackManager, player, item, mediaSource, options: playOptions,
        source: 'https://emby.example.test/Videos/current/stream.mp4?api_key=fixture-token-canary',
        signal, isCurrent: () => current, position: () => position, fetch: fetcher
    }).then(async controller => {controller.started(); await controller.tick(); return controller;});
    return {
        timers, renderer, bindPromise, binding, endpoint, item, mediaSource, playOptions,
        statusCalls, counters, setApi(value) { api = value; }, getApi() { return api; },
        setCurrent(value) { current = value; }, setCandidate(value) { candidate = value; },
        setPosition(value) { position = value; }
    };
}

function readyStatus(state, bytes = 1200000) {
    return {value: {enabled: true, current: {state: 'active', bytes}, next: {state, bytes, targetBytes: 3000000}}};
}

async function flush() {
    for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
}

test('category drops a status reply after API instance, account or token epoch changes', async () => {
    const changes = [
        ['API instance', f => f.setApi(Object.assign({}, f.getApi()))],
        ['account', f => {
            const api = f.getApi();
            f.setApi({...api, getCurrentUserId: () => 'account-2'});
        }],
        ['token epoch', f => {
            const api = f.getApi();
            f.setApi({...api, _identityEpoch: api._identityEpoch + 1});
        }]
    ];
    for (const [label, mutate] of changes) {
        const f = createFixture(), controller = await f.bindPromise, pending = deferred();
        f.statusCalls.push(() => pending.promise);
        const category = controller.category();
        mutate(f);
        pending.resolve(readyStatus('ready'));
        assert.equal(await category, null, label + ' changes invalidate old status');
        await controller.close();
    }
});

test('category reply is invalidated when the playback media source or session owner changes', async () => {
    for (const change of [
        f => { f.mediaSource.Id = 'source-2'; },
        f => { f.playOptions.playSessionId = 'session-2'; }
    ]) {
        const f = createFixture(), controller = await f.bindPromise, pending = deferred();
        f.statusCalls.push(() => pending.promise);
        const category = controller.category();
        change(f);
        pending.resolve(readyStatus('ready'));
        assert.equal(await category, null);
        await controller.close();
    }
});

test('a queue candidate change from B to C prevents B status from being classified', async () => {
    const f = createFixture(), controller = await f.bindPromise, pending = deferred();
    f.statusCalls.push(() => pending.promise);
    const category = controller.category();
    f.setCandidate({Id: 'next-C', ServerId: 'server-1', Type: 'Episode', SeriesId: 'series-1'});
    pending.resolve(readyStatus('ready'));
    assert.equal(await category, null);
    await controller.close();
});

test('canceling a candidate invalidates an outstanding category status read', async () => {
    const f = createFixture(), controller = await f.bindPromise, pending = deferred();
    controller.started();
    await controller.tick(); // observes next-B and records that candidate
    assert.equal(f.counters.cancel, 1);
    f.statusCalls.push(() => pending.promise);
    const category = controller.category();
    f.setCandidate(null);
    await controller.tick(); // candidate cancellation advances ownership
    assert.equal(f.counters.cancel, 2);
    pending.resolve(readyStatus('warming'));
    assert.equal(await category, null);
    await controller.close();
    assert.equal(f.timers.intervals.size, 0);
});

test('newer category query wins when two status replies resolve out of order', async () => {
    const f = createFixture(), controller = await f.bindPromise, older = deferred(), newer = deferred();
    f.statusCalls.push(() => older.promise, () => newer.promise);
    const oldQuery = controller.category(), newQuery = controller.category();
    newer.resolve(readyStatus('ready', 9000000));
    const newest = await newQuery;
    older.resolve(readyStatus('partial', 1000000));
    const stale = await oldQuery;
    assert.match(newest.stats[1].value, /预载完成/);
    assert.equal(stale, null);
    assert.doesNotMatch(JSON.stringify([newest, stale]), /emby\.example\.test|fixture-token-canary/);
    await controller.close();
});

test('metadata timeout aborts the owned request, reports unavailable, and does not retry the candidate', async () => {
    const f = createFixture({fetch(url, init) {
        f.counters.fetch++;
        assert.match(url, /^https:\/\/emby\.example\.test\/Users\/account-1\/Items\/next-B/);
        return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('aborted')), {once: true}));
    }});
    const controller = await f.bindPromise;
    controller.started();
    await controller.tick();
    f.setPosition({positionTicks: 80, durationTicks: 100});
    await controller.tick();
    assert.equal(f.counters.fetch, 1);
    const timer = Array.from(f.timers.timeouts.keys()).at(-1);
    f.timers.fireTimeout(timer);
    await flush();
    await controller.tick();
    assert.equal(f.counters.fetch, 1, 'timed-out candidate is not retried');
    const category = await controller.category();
    assert.match(category.stats[1].value, /当前来源不可预载/);
    assert.doesNotMatch(JSON.stringify(category), /emby\.example\.test|fixture-token-canary|account-1|next-B/);
    await controller.close();
    assert.equal(f.timers.intervals.size, 0);
});

test('a queue changed before tick cannot label old backend progress with the new candidate', async () => {
    const f = createFixture(), controller = await f.bindPromise;
    f.statusCalls.push(() => Promise.resolve(readyStatus('warming')));
    f.setCandidate({Id: 'next-C', ServerId: 'server-1', Type: 'Episode', SeriesId: 'series-1'});
    assert.equal(await controller.category(), null); assert.equal(f.statusCalls.length, 1, 'old state was never queried');
    await controller.close();
});
test('status is suppressed while candidate cancellation is still awaiting its acknowledgement', async () => {
    const f = createFixture(), controller = await f.bindPromise, cancellation = deferred();
    f.binding.cancelNext = () => cancellation.promise;
    f.setCandidate({Id: 'next-C', ServerId: 'server-1', Type: 'Episode', SeriesId: 'series-1'});
    const tick = controller.tick(); f.statusCalls.push(() => Promise.resolve(readyStatus('warming')));
    assert.equal(await controller.category(), null); assert.equal(f.statusCalls.length, 1);
    cancellation.resolve(); await tick; await controller.close();
});
