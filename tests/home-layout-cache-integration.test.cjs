'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, storage} = require('./helpers/api-client-amd.cjs');
const layoutModule = require('../src/electronapp/enhanced/page-cache/home-layout-cache.js');
const providerModule = require('../src/electronapp/enhanced/home/server-sections.js');
const safeRows = name => [{Id: 'layout-one', Name: name || 'Library', SectionType: 'latestmedia',
    ParentItem: {Id: 'library-one', CollectionType: 'movies'}}];
function gate() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; }
async function flush() { for (let i = 0; i < 25; i++) await Promise.resolve(); }
function response(data, status = 200) { return {status, headers: {get: () => 'application/json'}, json: async () => data, text: async () => ''}; }
function clock() {
    let now = 1000, id = 0; const timers = new Map();
    return {now: () => now, setTimeout(fn, ms) { timers.set(++id, {fn, at: now + ms}); return id; },
        clearTimeout: id => timers.delete(id), jump: ms => { now += ms; }};
}
function fixture(handler, options = {}, globals = {}) {
    const calls = [], h = harness(async (url, fetchOptions) => {
        calls.push({path: new URL(url).pathname, method: fetchOptions.method});
        if (handler) return handler(url, fetchOptions, calls.length);
        if (url.includes('/HomeSections')) return response(safeRows());
        if (url.includes('/Sections/')) return response({Items: [{Id: 'item-one', UserData: {PlaybackPositionTicks: calls.length}}]});
        return response({Played: true});
    }, globals);
    const events = h.load('events.js').default, Api = h.load('apiclient.js').default;
    const Credentials = h.load('credentials.js').default, Ex = h.load('apiclientex.js').default, cm = h.load('connectionmanager.js').default;
    const store = storage();
    cm.initialize(new Credentials(store), store, Ex, () => Promise.resolve([]), {isSupported: () => false},
        'ETE', 'test', 'Synthetic device', 'synthetic-id', () => Promise.resolve({}), 1);
    cm.setCurrentLocale('zh-CN');
    const info = {Id: 'synthetic-server', UserId: 'synthetic-user', AccessToken: 'synthetic-token',
        ManualAddress: 'http://synthetic.invalid', LastConnectionMode: 2};
    const api = cm.getApiClientFromServerInfo(info); api.setSystemInfo({Version: '4.10.0.40'});
    api.enableAutomaticNetworking = false;
    let active = api;
    // app.js normally supplies this canonical current-client selector.
    cm.currentApiClient = () => active;
    const time = clock();
    const cache = layoutModule.create(cm, {enabled: true, ttlMs: 100, clock: time, ...options}, events);
    const provider = providerModule.createProvider(() => active, {layoutCache: cache.enabled ? cache : null});
    const load = mode => provider.loadSections({displayMode: mode || 'mobile,desktop'});
    return {api, Api, cm, cache, events, h, calls, time, provider, load,
        setActive(value) { active = value; },
        dispose() { provider.dispose(); cache.dispose(); for (const timer of h.timers) clearTimeout(timer); }};
}

test('actual AMD ApiClient GET integrates with provider projection and opt-in layout hit; Items stay fresh', async t => {
    const f = fixture(); t.after(() => f.dispose());
    const first = await f.load(); assert.equal(first.status, 'server');
    assert.equal(f.calls.length, 1); const one = await f.provider.loadItems(first.sections[0]);
    const second = await f.load(); assert.equal(second.status, 'server');
    assert.equal(f.calls.filter(c => c.path.endsWith('/HomeSections')).length, 1);
    const two = await f.provider.loadItems(second.sections[0]);
    assert.notEqual(one.result.Items[0].UserData.PlaybackPositionTicks, two.result.Items[0].UserData.PlaybackPositionTicks);
    assert.equal(f.calls.filter(c => c.path.includes('/Sections/')).length, 2);
    assert.equal((await f.provider.loadItems(first.sections[0])).status, 'cancelled', 'a cache hit creates fresh request-bound section objects');
    assert.ok(Object.isFrozen(second.sections[0])); assert.notEqual(first.sections[0], second.sections[0]);
});
test('default disabled path never installs listeners or retains/uses layout data', async t => {
    const f = fixture(null, {enabled: false}); t.after(() => f.dispose());
    const before = Object.values(f.cm._callbacks || {}).reduce((n, list) => n + list.length, 0);
    await f.load(); await f.load();
    assert.equal(f.calls.length, 2); assert.equal(f.cache.enabled, false);
    assert.equal(Object.values(f.cm._callbacks || {}).reduce((n, list) => n + list.length, 0), before);
    assert.equal((f.api._callbacks || {}).message, undefined);
});
test('enabled without an explicit TTL remains disabled', async t => {
    const f = fixture(null, {ttlMs: undefined}); t.after(() => f.dispose());
    await f.load(); await f.load(); assert.equal(f.cache.enabled, false); assert.equal(f.calls.length, 2);
});
test('real favorite/played/unplayed API writes emit post-write invalidation with unchanged method ownership', async t => {
    const f = fixture(); t.after(() => f.dispose());
    const favorite = f.api.updateFavoriteStatus, played = f.api.markPlayed, unplayed = f.api.markUnplayed;
    for (const write of [() => f.api.updateFavoriteStatus('synthetic-user', 'item-one', true),
        () => f.api.markPlayed('synthetic-user', 'item-one'), () => f.api.markUnplayed('synthetic-user', 'item-one')]) {
        await f.load(); assert.equal(f.cache.stats().entries, 1);
        await write(); assert.equal(f.cache.stats().entries, 0); assert.equal(f.cache.stats().pending, 0);
    }
    assert.equal(f.api.updateFavoriteStatus, favorite); assert.equal(f.api.markPlayed, played); assert.equal(f.api.markUnplayed, unplayed);
    assert.deepEqual(f.calls.filter(c => c.method !== 'GET').map(c => c.method), ['POST', 'POST', 'DELETE']);
});
test('real retained CM logout clears identity; same-user re-login cannot resurrect layout', async t => {
    const f = fixture(); t.after(() => f.dispose()); await f.load();
    await f.cm.logout(); assert.equal(f.api.isLoggedIn(), false); assert.equal(f.cache.stats().entries, 0);
    assert.equal((await f.load()).status, 'cancelled'); // Enabled adapter retires an unauthenticated context before provider fallback.
    f.api.setAuthenticationInfo('synthetic-new-token', 'synthetic-user');
    assert.equal((await f.load()).status, 'server');
    assert.equal(f.calls.filter(c => c.path.endsWith('/HomeSections')).length, 2);
    assert.equal(f.calls.filter(c => c.path.endsWith('/Sessions/Logout')).length, 1);
});
for (const transition of ['user', 'server', 'client', 'reauth']) test('actual API identity change during in-flight read: ' + transition, async t => {
    const old = gate(); let count = 0;
    const f = fixture(url => url.includes('/HomeSections') && ++count === 1 ? old.promise : response(safeRows('New layout'))); t.after(() => f.dispose());
    const pending = f.load(); await flush();
    if (transition === 'user') f.api.setAuthenticationInfo('synthetic-token-b', 'other-user');
    if (transition === 'server') f.api.serverInfo({Id: 'other-server', UserId: 'synthetic-user', AccessToken: 'synthetic-token'});
    if (transition === 'client') {
        const next = Object.create(f.api); next._callbacks = {}; f.setActive(next);
    }
    if (transition === 'reauth') f.api.setAuthenticationInfo('synthetic-token-b', 'synthetic-user');
    old.resolve(response(safeRows('Retired layout')));
    assert.equal((await pending).status, 'cancelled'); assert.equal(f.cache.stats().entries, 0);
    assert.equal((await f.load()).sections[0].Name, 'New layout');
});
test('late old-user response cannot retire a new user cache binding', async t => {
    const old = gate(); let count = 0;
    const f = fixture(() => ++count === 1 ? old.promise : response(safeRows('New user'))); t.after(() => f.dispose());
    const a = f.load(); await flush(); f.api.setAuthenticationInfo('synthetic-token-b', 'user-b');
    const b = await f.load(); assert.equal(b.sections[0].Name, 'New user');
    old.resolve(response(safeRows('Old user'))); assert.equal((await a).status, 'cancelled'); await flush();
    assert.equal(f.cache.stats().entries, 1); assert.equal((await f.load()).sections[0].Name, 'New user'); assert.equal(count, 2);
});
test('failed/schema-invalid layouts never poison cache, explicit empty layout does', async t => {
    for (const invalid of [response(null), response([{Name: 'bad'}]), response({}, 500)]) {
        let count = 0; const f = fixture(() => ++count === 1 ? invalid : response(safeRows()));
        assert.equal((await f.load()).status, 'fallback'); assert.equal(f.cache.stats().entries, 0);
        assert.equal((await f.load()).status, 'server'); assert.equal(count, 2); f.dispose();
    }
    const f = fixture(() => response([])); t.after(() => f.dispose());
    assert.deepEqual((await f.load()).sections, []); await f.load(); assert.equal(f.calls.length, 1);
});
test('projection removes credential/URL/Path/raw QueryOptions and keeps cache stats free of data', async t => {
    const raw = safeRows(); Object.assign(raw[0], {AccessToken: 'synthetic-secret-canary', Path: 'synthetic-private-path',
        Url: 'http://synthetic.invalid/?api_key=synthetic-secret-canary', QueryOptions: {Token: 'synthetic-secret-canary'}, UserData: {Password: 'synthetic-secret-canary'}});
    const f = fixture(() => response(raw)); t.after(() => f.dispose());
    const result = await f.load(); assert.equal(result.status, 'server');
    const hit = await f.load();
    for (const text of [JSON.stringify(result), JSON.stringify(hit), JSON.stringify(f.cache.stats())]) {
        assert.equal(text.includes('synthetic-secret-canary'), false); assert.equal(text.includes('synthetic-private-path'), false);
    }
    assert.equal(f.calls.length, 1); assert.equal(f.cache.stats().entries, 1);
    assert.ok(f.calls.every(c => c.method === 'GET' && c.path.endsWith('/HomeSections')));
});
test('suspicious projected credential query string is rejected rather than cached', async t => {
    const f = fixture(() => response(safeRows('unexpected?api_key=synthetic-secret-canary'))); t.after(() => f.dispose());
    assert.equal((await f.load()).status, 'fallback'); assert.equal(f.cache.stats().entries, 0);
});
test('TTL, display mode and locale/version boundaries use new requests', async t => {
    const f = fixture(); t.after(() => f.dispose());
    await f.load(); await f.load(); assert.equal(f.calls.length, 1);
    await f.load('tv'); assert.equal(f.calls.length, 2);
    f.api.setCurrentLocale('en-US'); await f.load(); assert.equal(f.calls.length, 3);
    f.api.setSystemInfo({Version: '4.10.0.41'}); await f.load(); assert.equal(f.calls.length, 4);
    f.time.jump(100); await f.load(); assert.equal(f.calls.length, 5);
});
test('notifications and reconnect signals invalidate cached/in-flight layouts without inspecting Data', async t => {
    const f = fixture(); t.after(() => f.dispose());
    for (const message of ['UserDataChanged', 'LibraryChanged']) {
        await f.load(); const payload = {MessageType: message}; Object.defineProperty(payload, 'Data', {get() { throw new Error('must not inspect'); }});
        f.events.trigger(f.api, 'message', [payload]); assert.equal(f.cache.stats().entries, 0);
    }
    for (const name of ['websocketopen', 'websocketclose']) { await f.load(); f.events.trigger(f.api, name); assert.equal(f.cache.stats().entries, 0); }
    for (const name of ['localusersignedin', 'connected']) { await f.load(); f.events.trigger(f.cm, name); assert.equal(f.cache.stats().entries, 0); }
});
test('disposing removes only this adapter listeners; inherited method identity is preserved', async t => {
    const f = fixture(); t.after(() => f.dispose()); const own = () => {};
    f.events.on(f.api, 'message', own); await f.load(); const getJSON = f.api.getJSON;
    assert.equal(f.api._callbacks.message.length, 2); f.cache.dispose();
    assert.equal(f.api._callbacks.message.length, 1); assert.equal(f.api._callbacks.message[0], own);
    assert.equal(f.api.getJSON, getJSON); assert.equal(f.cm._callbacks.localusersignedout.length, 0);
});


test('direct auth loss clears cached bytes on provider revalidation without a CM signout event', async t => {
    const f = fixture(); t.after(() => f.dispose()); await f.load();
    f.api.setAuthenticationInfo(null, null);
    assert.equal((await f.load()).status, 'cancelled'); assert.equal(f.cache.stats().entries, 0);
    assert.equal(f.calls.length, 1);
});
test('an actual favorite write settling during layout GET retires its late response', async t => {
    const old = gate(); let layouts = 0;
    const f = fixture(url => url.includes('/HomeSections') && ++layouts === 1 ? old.promise :
        response(url.includes('/HomeSections') ? safeRows('Fresh layout') : {IsFavorite: true})); t.after(() => f.dispose());
    const pending = f.load(); await flush();
    await f.api.updateFavoriteStatus('synthetic-user', 'item-one', true);
    assert.equal((await pending).status, 'cancelled');
    const fresh = await f.load(); assert.equal(fresh.sections[0].Name, 'Fresh layout');
    old.resolve(response(safeRows('Retired layout'))); await flush();
    assert.equal((await f.load()).sections[0].Name, 'Fresh layout'); assert.equal(layouts, 2);
});
test('failed favorite write leaves layout-only cache valid and no user progress/favorite DTO is cached', async t => {
    const f = fixture(url => url.includes('/HomeSections') ? response(safeRows()) : response({}, 500)); t.after(() => f.dispose());
    await f.load(); await assert.rejects(f.api.updateFavoriteStatus('synthetic-user', 'item-one', true));
    assert.equal(f.cache.stats().entries, 1); await f.load();
    assert.equal(f.calls.filter(c => c.path.endsWith('/HomeSections')).length, 1);
});
test('a cancelled external layout subscriber does not seed a hit for the next provider navigation', async t => {
    const old = gate(); let layouts = 0;
    const f = fixture(() => ++layouts === 1 ? old.promise : response(safeRows('Next navigation'))); t.after(() => f.dispose());
    const controller = new AbortController(), pending = f.provider.loadSections({displayMode: 'tv', signal: controller.signal});
    await flush(); controller.abort(); assert.equal((await pending).status, 'cancelled');
    assert.equal((await f.load('tv')).sections[0].Name, 'Next navigation');
    old.resolve(response(safeRows('Cancelled navigation'))); await flush();
    assert.equal((await f.load('tv')).sections[0].Name, 'Next navigation'); assert.equal(layouts, 2);
});
function rendererGraph(f, {nodeSetTimeout = false} = {}) {
    const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
    f.cache.dispose();
    const modules = new Map([['modules/emby-apiclient/events.js', {default: f.events}]]);
    const context = vm.createContext({AbortController, hostSetTimeout: setTimeout, hostClearTimeout: clearTimeout});
    vm.runInContext(`
        function receiver(value) {
            if (value !== undefined && value !== null && value !== globalThis) throw new TypeError('Illegal invocation');
        }
        globalThis.setTimeout = function(fn, ms) { 'use strict'; ${nodeSetTimeout ? '' : 'receiver(this);'} return hostSetTimeout(fn, ms); };
        globalThis.clearTimeout = function(id) { 'use strict'; receiver(this); return hostClearTimeout(id); };
    `, context);
    function load(name) {
        if (modules.has(name)) return modules.get(name);
        const exports = {}; let result;
        const define = (deps, factory) => {
            const args = deps.map(dep => dep === 'exports' ? exports : load(dep.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(name), dep)) : dep));
            result = factory(...args) || exports;
        };
        define.amd = {}; context.define = define;
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/electronapp', name), 'utf8'), context, {filename: name});
        modules.set(name, result); return result;
    }
    const adapter = load('enhanced/page-cache/home-layout-cache.js').default.create(f.cm, {enabled: true, ttlMs: 100});
    const provider = load('enhanced/home/server-sections.js').default.createProvider(() => f.api, {layoutCache: adapter});
    return {adapter, provider, modules};
}

test('enhanced AMD graph uses the default clock with renderer timer receivers and one canonical events identity', async t => {
    const f = fixture(); t.after(() => f.dispose());
    const {adapter, provider, modules} = rendererGraph(f);
    t.after(() => { provider.dispose(); adapter.dispose(); });
    assert.equal((await provider.loadSections({displayMode: 'tv'})).status, 'server');
    assert.equal((await provider.loadSections({displayMode: 'tv'})).status, 'server');
    assert.equal(f.calls.length, 1); assert.equal(modules.size, 4);
    assert.equal(modules.get('modules/emby-apiclient/events.js').default, f.events);
});

test('actual API deferred websocketclose cancels an in-flight renderer layout without a stuck completion', async t => {
    const old = gate(), sockets = [], apiTimers = new Map(); let timerId = 0, reads = 0;
    class Socket {
        constructor() { this.readyState = 1; sockets.push(this); }
        close() { this.readyState = 3; }
        send() {}
    }
    Object.assign(Socket, {OPEN: 1, CONNECTING: 0, CLOSING: 2, CLOSED: 3});
    const f = fixture(() => ++reads === 1 ? old.promise : response(safeRows('Recovered layout')), {}, {
        WebSocket: Socket,
        setTimeout(fn, delay) { apiTimers.set(++timerId, {fn, delay}); return timerId; },
        clearTimeout(id) { apiTimers.delete(id); }
    });
    t.after(() => { f.api.closeWebSocket(); f.dispose(); });
    // The reported renderer permits host setTimeout but rejects a foreign
    // receiver for Window clearTimeout. Keep that distinction in this fixture.
    const {adapter, provider} = rendererGraph(f, {nodeSetTimeout: true});
    t.after(() => { provider.dispose(); adapter.dispose(); });
    f.api.openWebSocket(); const socket = sockets[0];
    const pending = provider.loadSections({displayMode: 'tv'}); await flush();
    assert.equal(adapter.stats().pending, 1); assert.equal(f.calls.length, 1);
    socket.readyState = Socket.CLOSED; socket.onclose({code: 1006});
    const closeEvent = [...apiTimers.entries()].find(([, timer]) => timer.delay === 0);
    assert.ok(closeEvent, 'execute the real API deferred websocketclose notification');
    apiTimers.delete(closeEvent[0]);
    assert.doesNotThrow(() => closeEvent[1].fn());
    assert.equal((await pending).status, 'cancelled');
    assert.equal(adapter.stats().pending, 0); assert.equal(adapter.stats().entries, 0);
    assert.equal((await provider.loadSections({displayMode: 'tv'})).sections[0].Name, 'Recovered layout');
    old.resolve(response(safeRows('Late old layout'))); await flush();
    assert.equal((await provider.loadSections({displayMode: 'tv'})).sections[0].Name, 'Recovered layout');
    assert.equal(f.calls.length, 2);
});


test('queued layout hit rechecks real authentication before delivering section ownership', async t => {
    const f = fixture(); t.after(() => f.dispose()); await f.load();
    const hit = f.load(); f.api.setAuthenticationInfo(null, null);
    assert.equal((await hit).status, 'cancelled'); assert.equal(f.cache.stats().entries, 0);
});
test('dispose retires stalled layout GET and a late body cannot add entries or listeners', async t => {
    const old = gate(), f = fixture(() => old.promise); t.after(() => f.dispose());
    const pending = f.load(); await flush(); f.dispose(); assert.equal((await pending).status, 'cancelled');
    old.resolve(response(safeRows('Late disposed layout'))); await flush();
    assert.equal(f.cache.stats().entries, 0); assert.equal(f.cache.stats().pending, 0);
    assert.equal(f.api._callbacks.message.length, 0);
});
test('same-user auth rotation retires previously issued section owners', async t => {
    const f = fixture(); t.after(() => f.dispose()); const before = await f.load();
    f.api.setAuthenticationInfo('synthetic-next-token', 'synthetic-user');
    assert.equal((await f.provider.loadItems(before.sections[0])).status, 'cancelled');
    assert.equal(f.calls.length, 1);
});
