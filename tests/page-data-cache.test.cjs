'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cacheModule = require('../src/electronapp/enhanced/page-cache/page-data-cache.js');
const source = require.resolve('../src/electronapp/enhanced/page-cache/page-data-cache.js');
function gate() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; }
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function clock() {
    let now = 1000, next = 0;
    const timers = new Map();
    return {now: () => now, setTimeout: (fn, delay) => { timers.set(++next, {fn, at: now + delay}); return next; },
        clearTimeout: id => timers.delete(id), jump: ms => { now += ms; },
        fire: () => { for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } },
        count: () => timers.size};
}
function fixture(options = {}) {
    const time = clock();
    const cache = cacheModule.create({enabled: true, policies: {'media-list': {ttlMs: 100}}, clock: time, ...options});
    const context = {client: {}, session: {}, serverId: 'server-a', userId: 'user-a'};
    cache.bindContext(context);
    const request = (load = () => ({Items: [{Id: 'item-a'}]}), params = {}, signal) =>
        cache.load({resource: 'media-list', params, load, signal});
    return {cache, context, time, request};
}
const aborted = promise => assert.rejects(promise, {name: 'AbortError'});

test('defaults bypass storage and deduplication even with an explicit policy', async () => {
    const f = fixture({enabled: undefined}); let calls = 0;
    await Promise.all([f.request(() => ++calls), f.request(() => ++calls)]);
    await f.request(() => ++calls);
    assert.equal(calls, 3); assert.equal(f.cache.stats().entries, 0); assert.equal(f.cache.stats().enabled, false);
});
test('unconfigured resources bypass caching and pending deduplication', async () => {
    const f = fixture({policies: {}}); let calls = 0;
    await Promise.all([f.request(() => ++calls), f.request(() => ++calls)]);
    assert.equal(calls, 2); assert.equal(f.cache.stats().entries, 0);
});
test('only approved page data resources and explicit finite TTL policies are accepted', async () => {
    assert.throws(() => cacheModule.create({policies: {'authenticate': {ttlMs: 10}}}), TypeError);
    for (const ttlMs of [undefined, 0, -1, Infinity, 300001]) assert.throws(() => fixture({policies: {'media-list': {ttlMs}}}), TypeError);
    await assert.rejects(fixture().cache.load({resource: 'authenticate', load: () => ({})}), TypeError);
});
test('authentication context is mandatory and accepts no credentials', async () => {
    const cache = cacheModule.create();
    await aborted(cache.load({resource: 'media-list', load: () => ({})}));
    for (const value of [{}, {client: {}, session: {}, serverId: '', userId: 'x'},
        {client: {}, session: {}, serverId: 's', userId: 'u', accessToken: 'synthetic-canary'}]) assert.throws(() => cache.bindContext(value), TypeError);
});
test('same canonical query shares one in-flight read and isolates consumer DTO mutation', async () => {
    const f = fixture(), work = gate(); let calls = 0;
    const loader = () => { calls++; return work.promise; };
    const first = f.request(loader, {Limit: 2, StartIndex: 0}), second = f.request(loader, {StartIndex: 0, Limit: 2});
    await flush(); assert.equal(calls, 1);
    const dto = {Items: [{Id: 'one'}]}; work.resolve(dto);
    const [a, b] = await Promise.all([first, second]);
    a.Items[0].Id = 'changed'; dto.Items[0].Id = 'also-changed';
    assert.equal(b.Items[0].Id, 'one'); assert.equal((await f.request(loader, {Limit: 2, StartIndex: 0})).Items[0].Id, 'one');
});
test('query pagination, sorting and resource identity remain distinct', async () => {
    const f = fixture({policies: {'media-list': {ttlMs: 100}, 'home-items': {ttlMs: 100}}}); let calls = 0;
    for (const params of [{StartIndex: 0}, {StartIndex: 1}, {StartIndex: 0, SortOrder: 'Descending'}]) await f.request(() => ++calls, params);
    await f.cache.load({resource: 'home-items', params: {StartIndex: 0}, load: () => ++calls});
    assert.equal(calls, 4);
});
test('empty successful results cache; errors and thrown loaders do not', async () => {
    const f = fixture(); let calls = 0;
    await f.request(() => { calls++; throw new Error('fixture'); }).catch(() => {});
    await f.request(() => { calls++; return Promise.reject(new Error('fixture')); }).catch(() => {});
    assert.deepEqual(await f.request(() => { calls++; return {Items: []}; }), {Items: []});
    await f.request(() => { throw new Error('must hit'); }); assert.equal(calls, 3);
    assert.equal(f.time.count(), 0);
});
test('TTL expires exactly at the deadline without stale-on-error fallback', async () => {
    const f = fixture(); await f.request(() => 'old'); f.time.jump(99);
    assert.equal(await f.request(() => 'wrong'), 'old'); f.time.jump(1);
    await assert.rejects(f.request(() => Promise.reject(new Error('offline'))), /offline/);
    assert.equal(f.cache.stats().entries, 0); assert.equal(await f.request(() => 'new'), 'new');
});
test('a hit queued before expiry rechecks TTL in its delivery microtask', async () => {
    const f = fixture(); await f.request(() => 'old');
    const hit = f.request(() => 'new'); f.time.jump(100);
    assert.equal(await hit, 'new');
});
test('entry count uses LRU access and evicts the least recently used DTO', async () => {
    const f = fixture({maxEntries: 2}); let calls = 0;
    const read = n => f.request(() => { calls++; return n; }, {page: n});
    await read(1); await read(2); await read(1); await read(3); await read(2);
    assert.equal(calls, 4); assert.equal(f.cache.stats().entries, 2);
});
test('serialized key/data budget evicts entries and skips oversized values', async () => {
    const f = fixture({maxBytes: 110});
    await f.request(() => 'x'.repeat(10), {page: 1}); await f.request(() => 'y'.repeat(10), {page: 2});
    assert.equal(f.cache.stats().entries, 1); assert.ok(f.cache.stats().retainedBytes <= 110);
    assert.equal(await f.request(() => 'z'.repeat(100)), 'z'.repeat(100));
    assert.ok(f.cache.stats().retainedBytes <= 110);
});
test('one subscriber cancellation keeps the other read alive', async () => {
    const f = fixture(), work = gate(), controller = new AbortController(); let transportSignal;
    const loader = signal => { transportSignal = signal; return work.promise; };
    const a = f.request(loader, {}, controller.signal), b = f.request(loader);
    await flush(); controller.abort(); await aborted(a); assert.equal(transportSignal.aborted, false);
    work.resolve('ok'); assert.equal(await b, 'ok');
});
test('last subscriber cancellation aborts transport, releases capacity and rejects late data', async () => {
    const f = fixture({maxPending: 1}), work = gate(), controller = new AbortController(); let transportSignal;
    const old = f.request(signal => { transportSignal = signal; return work.promise; }, {}, controller.signal);
    await flush(); controller.abort(); await aborted(old); assert.equal(transportSignal.aborted, true);
    assert.equal(await f.request(() => 'new'), 'new'); work.resolve('old'); await flush();
    assert.equal(await f.request(() => 'wrong'), 'new'); assert.equal(f.time.count(), 0);
});
test('already aborted subscription never invokes its loader', async () => {
    const f = fixture(), controller = new AbortController(); controller.abort(); let called = false;
    await aborted(f.request(() => { called = true; }, {}, controller.signal)); assert.equal(called, false);
});
test('pending work has a fixed bound while duplicate subscribers share a slot', async () => {
    const f = fixture({maxPending: 1}), work = gate();
    const a = f.request(() => work.promise), b = f.request(() => 'wrong');
    await assert.rejects(f.request(() => 'other', {page: 2}), {name: 'CacheCapacityError'});
    work.resolve('ok'); assert.deepEqual(await Promise.all([a, b]), ['ok', 'ok']);
});
test('a stalled loader times out even when it ignores abort', async () => {
    const f = fixture({requestTimeoutMs: 10}), work = gate(); let signal;
    const old = f.request(s => { signal = s; return work.promise; }); await flush();
    f.time.jump(10); f.time.fire(); await assert.rejects(old, {name: 'TimeoutError'});
    assert.equal(signal.aborted, true); work.resolve('late'); await flush();
    assert.equal(f.cache.stats().entries, 0); assert.equal(f.cache.stats().pending, 0);
});
test('absolute request deadline rejects replies before a delayed timer executes', async () => {
    const f = fixture({requestTimeoutMs: 10}), work = gate(); const result = f.request(() => work.promise);
    await flush(); f.time.jump(10); work.resolve('late'); await assert.rejects(result, {name: 'TimeoutError'});
    assert.equal(f.cache.stats().entries, 0); assert.equal(f.time.count(), 0);
});
for (const transition of ['serverId', 'userId', 'client', 'session', 'logout']) test(transition + ' transition retires old cache and pending replies', async () => {
    const f = fixture(), work = gate(); await f.request(() => 'cached', {page: 1});
    const old = f.request(() => work.promise); await flush();
    f.cache.bindContext(transition === 'logout' ? null : {...f.context, [transition]: transition.endsWith('Id') ? 'other' : {}});
    await aborted(old); work.resolve('late'); await flush(); assert.equal(f.cache.stats().entries, 0);
    if (transition === 'logout') await aborted(f.request()); else assert.equal(await f.request(() => 'new'), 'new');
});
test('same binding keeps data; logout and re-login as the same user never resurrects data', async () => {
    const f = fixture(); await f.request(() => 'old'); f.cache.bindContext({...f.context});
    assert.equal(await f.request(() => 'wrong'), 'old'); f.cache.bindContext(null); f.cache.bindContext({...f.context, session: {}});
    assert.equal(await f.request(() => 'new'), 'new');
});
test('logout in a queued cache hit rejects before delivery', async () => {
    const f = fixture(); await f.request(() => 'private'); const hit = f.request();
    f.cache.bindContext(null); await aborted(hit);
});
test('invalidation before/after a write retires pre-write and concurrent reads', async () => {
    const f = fixture(), oldRead = gate(), duringWrite = gate(); await f.request(() => 'old', {page: 1});
    const a = f.request(() => oldRead.promise); await flush(); f.cache.invalidate(); await aborted(a);
    const b = f.request(() => duringWrite.promise); await flush(); f.cache.invalidate(); await aborted(b);
    oldRead.resolve('old'); duringWrite.resolve('old'); await flush();
    assert.equal(await f.request(() => 'updated'), 'updated');
});
test('transport abort reentrancy cannot insert work during context retirement', async () => {
    const f = fixture(), work = gate(); let nested;
    const old = f.request(signal => { signal.addEventListener('abort', () => { nested = f.request(() => 'leak'); }); return work.promise; });
    await flush(); f.cache.bindContext(null); await aborted(old); await aborted(nested);
    assert.equal(f.cache.stats().pending, 0); work.resolve('late'); await flush();
});
test('unsafe query/DTO shapes and credential fields never enter cache', async () => {
    const f = fixture(); const cyclic = {}; cyclic.self = cyclic;
    let getterCalled = false; const getter = Object.defineProperty({}, 'Id', {enumerable: true, get() { getterCalled = true; return 1; }});
    for (const value of [{AccessToken: 'synthetic-canary'}, {nested: {Authorization: 'synthetic-canary'}}, {headers: {}},
        {password: 'synthetic-canary'}, {api_key: 'synthetic-canary'}, {url: '/Users/AuthenticateByName'},
        {DirectStreamUrl: '/stream?api_key=synthetic-canary'}, {Path: '/stream?X-Emby-Token=synthetic-canary'},
        {MediaSources: []}, {Items: new Array(2)}, cyclic, new Date(), getter]) {
        await assert.rejects(f.request(() => value), {name: 'CacheDataError'});
        await assert.rejects(f.request(() => 'wrong', value), {name: 'CacheDataError'});
    }
    assert.equal(getterCalled, false); assert.equal(f.cache.stats().entries, 0);
});
test('dispose rejects all work and cannot be rebound', async () => {
    const f = fixture(), work = gate(), old = f.request(() => work.promise);
    await flush(); f.cache.dispose(); await aborted(old); await aborted(f.request());
    assert.throws(() => f.cache.bindContext(f.context), {name: 'AbortError'});
    work.resolve('late'); await flush(); assert.equal(f.time.count(), 0);
});
test('AMD module exports the same factory without external dependencies or side effects', () => {
    let factory;
    const define = (dependencies, fn) => { assert.deepEqual(Array.from(dependencies), ['exports']); const exports = {}; fn(exports); factory = exports.default; };
    define.amd = true;
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), {define});
    assert.equal(typeof factory.create, 'function');
});

test('subscriber fanout is bounded without cancelling existing consumers', async () => {
    const f = fixture({maxSubscribers: 1}), work = gate(), first = f.request(() => work.promise);
    await assert.rejects(f.request(() => 'wrong'), {name: 'CacheCapacityError'});
    work.resolve('ok'); assert.equal(await first, 'ok');
});
test('request/header objects are refused before invoking any loader', async () => {
    const f = fixture(); let calls = 0;
    await assert.rejects(f.cache.load({resource: 'media-list', load: () => ++calls, headers: {Authorization: 'synthetic-canary'}}), TypeError);
    assert.equal(calls, 0);
});
test('a fulfilled transport retired before consumer delivery cannot return old data', async () => {
    const f = fixture(), work = gate(), pending = f.request(() => work.promise);
    await flush(); work.resolve('private'); queueMicrotask(() => f.cache.invalidate());
    await aborted(pending); assert.equal(f.cache.stats().entries, 0);
});
test('late failure from retired work cannot evict a newer result', async () => {
    const f = fixture(), work = gate(), old = f.request(() => work.promise);
    await flush(); f.cache.invalidate(); await aborted(old);
    assert.equal(await f.request(() => 'new'), 'new'); work.reject(new Error('old failure')); await flush();
    assert.equal(await f.request(() => 'wrong'), 'new');
});

test('an invalid replacement context clears the previous account before failing closed', async () => {
    const f = fixture(); await f.request(() => 'private');
    assert.throws(() => f.cache.bindContext({serverId: 'other'}), TypeError);
    await aborted(f.request()); assert.equal(f.cache.stats().entries, 0);
});

test('loader gets a captured query snapshot even if its caller mutates the descriptor', async () => {
    const f = fixture(); const params = {StartIndex: 0}, descriptor = {resource: 'media-list', params, load: (signal, query) => query};
    const result = f.cache.load(descriptor); params.StartIndex = 99; descriptor.load = () => 'wrong';
    assert.deepEqual(await result, {StartIndex: 0});
    assert.deepEqual(await f.request(() => 'wrong', {StartIndex: 0}), {StartIndex: 0});
});
test('already expired queued work never starts its loader', async () => {
    const f = fixture({requestTimeoutMs: 10}); let called = false;
    const work = f.request(() => { called = true; return 'late'; }); f.time.jump(10);
    await assert.rejects(work, {name: 'TimeoutError'}); assert.equal(called, false);
});
