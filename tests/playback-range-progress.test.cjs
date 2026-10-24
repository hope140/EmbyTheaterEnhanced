'use strict';
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createSession} = require('../src/electronapp/enhanced/playback-range-session');
function deferred() {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};}
const flush = async () => {for (let i = 0; i < 20; i++) await Promise.resolve();};
const context = {source: 'https://fixture.invalid/Videos/a/stream.mp4?Static=true', serverOrigin: 'https://fixture.invalid', serverId: 's', accountId: 'a',
    itemId: 'a', mediaSourceId: 'a-source', playSessionId: 'play', mode: 'DirectStream', mediaType: 'Video', container: 'mp4'};
function fixture(t) {
    const jobs = [], helper = {currentGenerationId: 1}; let bytes = 0;
    const cache = {status: () => ({bytes}), discardNext: async () => {}, discardLastUnless: async () => {}, close: async () => {},
        async open() {let job;
            return {source: 'http://127.0.0.1:1/synthetic-only', status: () => ({bytes: 4, total: 32}), markPlaying: async () => {},
                prefetch(options) {job = {...deferred(), options}; jobs.push(job); return job.promise;},
                stop: async () => {if (job) job.resolve({bytes});}};
        }};
    const session = createSession({config: {root: '/unused-synthetic-only', maxBytes: 100, timeoutMs: 1000, bytesPerSecond: 100}, create: async () => cache});
    t.after(() => session.close());
    return {session, helper, jobs, async begin() {await session.setContext(context, helper, 1); await session.select(context.source, helper, 1); await session.started(helper, 1);},
        preload() {return session.preload({...context, itemId: 'b', mediaSourceId: 'b-source', source: context.source.replace('/a/', '/b/')}, helper, 1);},
        progress(job, value) {bytes = value; job.options.onProgress({bytes: value, targetBytes: 32});}};
}
test('progress reports committed next bytes separately from current lease bytes and profile totals', async t => {
    const f = fixture(t); await f.begin(); const pending = f.preload(); await flush();
    assert.equal(f.session.status().next.state, 'warming'); assert.equal(f.session.status().next.bytes, 0);
    f.progress(f.jobs[0], 8); const state = f.session.status();
    assert.equal(state.current.bytes, 4); assert.equal(state.next.bytes, 8); assert.equal(state.diskBytes, 8);
    f.jobs[0].resolve({bytes: 8}); await pending; assert.equal(f.session.status().next.state, 'partial');
    assert(!JSON.stringify(state).includes('fixture.invalid')); assert(!JSON.stringify(state).includes('a-source'));
});
for (const action of ['cancel', 'account-context', 'generation']) test('late prefetch progress cannot restore retired candidate after ' + action, async t => {
    const f = fixture(t); await f.begin(); const pending = f.preload(); await flush(); const job = f.jobs[0];
    if (action === 'cancel') await f.session.cancelNext();
    if (action === 'account-context') await f.session.setContext({...context, accountId: 'other-account'}, f.helper, 1);
    if (action === 'generation') {f.helper.currentGenerationId = 2; await f.session.retire();}
    f.progress(job, 32); await pending;
    assert.equal(f.session.status().next.state, 'idle'); assert.equal(f.session.status().next.bytes, 0);
});
function statsFixture() {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');
    const start = source.indexOf('        self.getStats = function () {'), end = source.indexOf('        function mapRange', start);
    const gates = [deferred(), deferred(), deferred()], category = deferred(); let calls = 0, allowed = true;
    const request = {rangeCache: {category() {calls++; return allowed ? category.promise : Promise.resolve(null);}}};
    const scope = {self: {}, activePlayRequest: request, enhancedRouteState: null, Promise,
        getMediaStats: () => gates[0].promise, getVideoStats: () => gates[1].promise, getAudioStats: () => gates[2].promise};
    vm.runInNewContext(source.slice(start, end), scope);
    return {scope, gates, category, calls: () => calls, revoke() {allowed = false;}};
}
test('playback information obtains range category only after the other stats have settled', async () => {
    const f = statsFixture(), job = f.scope.self.getStats(); assert.equal(f.calls(), 0);
    f.revoke(); for (const gate of f.gates) gate.resolve({name: 'native'});
    const result = await job; assert.equal(f.calls(), 1); assert.equal(result.categories.length, 3);
});
test('a replaced play request cannot append the prior range category while its response is pending', async () => {
    const f = statsFixture(), job = f.scope.self.getStats(); for (const gate of f.gates) gate.resolve({name: 'native'}); await flush();
    assert.equal(f.calls(), 1); f.scope.activePlayRequest = {};
    f.category.resolve({name: 'obsolete-range'}); const result = await job; assert.equal(result.categories.length, 3);
});

test('a pending atomic index write is excluded from committed byte status until it succeeds', async t => {
    const fsp = require('node:fs/promises'), os = require('node:os');
    const root = temporaryRoot('ete-range-commit-status-', ['']);
    const store = await require('../src/electronapp/enhanced/playback-range-store').createStore({root, maxBytes: 8, minFreeBytes: 0, blockBytes: 4});
    const identity = {serverId: 's', serverOrigin: 'https://fixture.invalid', accountId: 'a', itemId: 'i', mediaSourceId: 'm', representation: 'r'};
    const lease = await store.acquire(identity, {etag: '"fixed"', total: 8});
    const original = fsp.rename, entered = deferred(), release = deferred(); let held = false;
    fsp.rename = async function (from, to) {if (to === path.join(root, 'index.json') && !held) {held = true; entered.resolve(); await release.promise;} return original(from, to);};
    t.after(async () => {release.resolve(); fsp.rename = original; await lease.release(); await store.close(); await fsp.rm(root, {recursive: true, force: true});});
    const write = lease.writeBlock(0, Buffer.from('test')); await entered.promise;
    assert.equal(lease.status().bytes, 0); assert.equal(store.status().bytes, 0);
    release.resolve(); await write; assert.equal(lease.status().bytes, 4); assert.equal(store.status().bytes, 4);
});
