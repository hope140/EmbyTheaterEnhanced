'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {startupFixture, makeDeferred, waitFor} = require('./helpers/startup-route-fixture.cjs');
const nativeClient = require('../src/electronapp/native-helper/client');
const leaseUrl = 'http://127.0.0.1:12345/r/' + 'a'.repeat(48);
function nativeFirst(f) { Object.assign(f.config.rules[0], {strategy: 'custom', order: ['native', 'direct-url', 'cd2-http', 'mount']}); }

test('FN Native attempt preserves original source and retires its capability before the next configured route', async () => {
    const release = makeDeferred(), calls = []; let released = 0;
    const f = startupFixture(undefined, {source: async (api, source, signal) => {
        calls.push({api, source, signal}); return {url: leaseUrl, release() { released++; return release.promise; }};
    }});
    nativeFirst(f);
    const item = f.options.item, media = f.options.mediaSource;
    const play = f.player.play(f.options); play.catch(() => {});
    try {
        await waitFor(() => f.ipc.loadCalls.length === 1);
        assert.equal(calls[0].source, f.options.url);
        assert.equal(f.ipc.loadCalls[0].data[1], leaseUrl);
        assert.equal(f.ipc.loadCalls[0].data.length, 2);
        const old = f.ipc.generationId;
        f.failure(); await waitFor(() => released === 1);
        assert.equal(f.ipc.loadCalls.length, 1); assert.equal(f.resolves.length, 0, 'no next resolution before retirement acknowledgement');
        release.resolve(); await waitFor(() => f.ipc.loadCalls.length === 2);
        f.failure(old); f.property('core-idle', false, old);
        assert.equal(f.counts().started, 0);
        f.property('core-idle', false); await play;
        assert.equal(f.options.item, item); assert.equal(f.options.mediaSource, media);
        assert.equal(calls.length, 1); assert.equal(released, 1);
        assert.equal(f.resolves.length, 1); assert.equal(f.counts().released, 0);
        await f.player.stop(true); assert.equal(released, 1);
    } finally {release.resolve(); await f.player.stop(true);}
});

test('a failed FN retirement acknowledgement never starts another route', async () => {
    const f = startupFixture(undefined, {source: async () => ({url: leaseUrl, release: () => Promise.reject(new Error('synthetic-release-failed'))})});
    nativeFirst(f);
    const play = f.player.play(f.options); play.catch(() => {});
    try { await waitFor(() => f.ipc.loadCalls.length === 1); f.failure();
        await assert.rejects(play, /synthetic-release-failed/);
        assert.equal(f.ipc.loadCalls.length, 1); assert.equal(f.resolves.length, 0);
    } finally {await f.player.stop(true);}
});

// Exercise the actual production acquisition and commit boundary with a controlled
// attempt transition; the renderer loop itself serializes normal route loads.
const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');
const start = source.indexOf('        function assertCurrentLoadAttempt(');
const end = source.indexOf('        function invalidatePlayRequest(', start);
assert.ok(start > 0 && end > start);
function acquisition(fnConnect) {
    let active = true;
    const sandbox = {fnConnect, connectionManager: {getApiClient: id => ({serverId: id})},
        assertCurrentPlayRequest(r) {if (!active || r.controller.signal.aborted) throw Object.assign(new Error('retired'), {playbackSuperseded: true});},
        supersededError: () => Object.assign(new Error('retired-attempt'), {playbackSuperseded: true})};
    vm.runInNewContext(source.slice(start, end) + '\nthis.acquire = acquireFnSource;', sandbox);
    const request = {routeAttempt: 1, controller: new AbortController()};
    return {request, acquire: () => sandbox.acquire(request, 1, {ServerId: 'synthetic-server'}, 'https://media.example.test/original'), retire() {active = false;}};
}
for (const phase of ['availability', 'source']) test('late FN ' + phase + ' from the same request cannot replace a newer attempt lease', async () => {
    const gate = makeDeferred(); let entered = false, requested = 0, released = 0;
    const old = {url: leaseUrl, release() {released++;}}, replacement = {url: 'synthetic-new-attempt'};
    const f = acquisition({available: async () => {if (phase === 'availability') {entered = true; return gate.promise;} return true;},
        source: async () => {requested++; entered = true; return gate.promise;}});
    const pending = f.acquire(); pending.catch(() => {}); await waitFor(() => entered);
    f.request.routeAttempt = 2; f.request.fnSource = replacement;
    gate.resolve(phase === 'availability' ? true : old);
    await assert.rejects(pending, e => e.playbackSuperseded === true);
    assert.equal(f.request.fnSource, replacement); assert.equal(requested, phase === 'source' ? 1 : 0);
    assert.equal(released, phase === 'source' ? 1 : 0);
});
for (const reason of ['stop', 'account-switch']) test('late acquired FN lease is released after ' + reason, async () => {
    const gate = makeDeferred(); let entered = false, released = 0;
    const f = acquisition({source: async () => {entered = true; return gate.promise;}});
    const pending = f.acquire(); pending.catch(() => {}); await waitFor(() => entered);
    if (reason === 'stop') f.request.controller.abort(); else f.retire();
    gate.resolve({url: leaseUrl, release() {released++;}});
    await assert.rejects(pending, e => e.playbackSuperseded === true);
    assert.equal(released, 1); assert.equal(f.request.fnSource, undefined);
});

for (const phase of ['availability', 'source']) test('FN ' + phase + ' pending past the shared startup deadline cannot load or advance', async () => {
    let now = 10000, expire, entered = false, requested = 0, released = 0;
    const gate = makeDeferred();
    const f = startupFixture({Date: {now: () => now}, setTimeout(callback, ms) {
        if (ms === 15000) {expire = callback; return 'startup-timer';} return setTimeout(callback, ms);
    }, clearTimeout(id) {if (id !== 'startup-timer') clearTimeout(id);}}, {
        available: async () => {if (phase === 'availability') {entered = true; return gate.promise;} return true;},
        source: async () => {requested++; entered = true; return gate.promise;}
    });
    nativeFirst(f);
    const play = f.player.play(f.options); play.catch(() => {});
    try {
        await waitFor(() => entered); now += 15001; expire();
        await assert.rejects(play, /startup-route-deadline/);
        gate.resolve(phase === 'availability' ? true : {url: leaseUrl, release() {released++;}});
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(f.ipc.loadCalls.length, 0); assert.equal(f.resolves.length, 0);
        assert.equal(requested, phase === 'source' ? 1 : 0); assert.equal(released, phase === 'source' ? 1 : 0);
    } finally {gate.resolve(null); await f.player.stop(true);}
});
