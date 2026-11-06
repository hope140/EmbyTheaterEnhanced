'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {harness, storage} = require('./helpers/api-client-amd.cjs');

function client(h, address = 'http://127.0.0.1') {
    const Api = h.load('apiclient.js');
    return new Api(storage(), null, address, 'test', '1', 'test', 'test', 1);
}
function clock() {
    const jobs = new Map(); let id = 0;
    return {jobs, setTimeout(fn, ms) { jobs.set(++id, {fn, ms}); return id; },
        clearTimeout(id) { jobs.delete(id); },
        fire() { const [id, job] = jobs.entries().next().value; jobs.delete(id); job.fn(); }};
}
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
for (const stopped of [false, true]) {
    for (const stage of ['headers', 'body']) {
        test(`${stopped ? 'stopped' : 'PlaybackInfo'} deadline bounds stalled ${stage}`, async () => {
            const c = clock();
            const h = harness((_url, {signal}) => {
                const pending = () => new Promise((_resolve, reject) => signal.addEventListener('abort',
                    () => reject(new DOMException('aborted', 'AbortError')), {once: true}));
                return stage === 'headers' ? pending() : {status: 200, json: pending, text: pending};
            }, c);
            const api = client(h);
            const options = {ItemId: 'A', PlaySessionId: 'session-A'};
            const promise = stopped ? api.reportPlaybackStopped(options) : api.getPlaybackInfo('A', {}, {});
            const outcome = assert.rejects(promise, {name: 'TimeoutError'});
            options.ItemId = 'B';
            await flush();
            assert.equal([...c.jobs.values()][0].ms, stopped ? 10000 : 30000);
            if (stopped) assert.equal(JSON.parse(h.requests[0].options.body).ItemId, 'A');
            c.fire(); await outcome;
            assert.equal(c.jobs.size, 0);
            assert.equal(h.requests.length, 1, 'POST is never retried');
        });
    }
}
for (const winner of ['cancel', 'timeout']) {
    test(`first abort cause wins: ${winner}; bridge and timer cleaned`, async () => {
        const c = clock(), external = new AbortController(); let listeners = 0;
        const signal = {get aborted() { return external.signal.aborted; },
            addEventListener(...args) { listeners++; external.signal.addEventListener(...args); },
            removeEventListener(...args) { listeners--; external.signal.removeEventListener(...args); }};
        const h = harness((_url, {signal}) => new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), {once: true})), c);
        const p = client(h).getPlaybackInfo('A', {}, {}, signal);
        const outcome = assert.rejects(p, {name: winner === 'cancel' ? 'AbortError' : 'TimeoutError'});
        await flush();
        if (winner === 'cancel') { external.abort(); c.fire(); } else { c.fire(); external.abort(); }
        await outcome;
        assert.equal(listeners, 0); assert.equal(c.jobs.size, 0);
    });
}
test('success, delayed body within deadline, and network failure clean deadlines', async () => {
    for (const mode of ['success', 'slow', 'network']) {
        const c = clock(); let release;
        const h = harness(async () => {
            if (mode === 'network') throw new TypeError('synthetic network failure');
            return {status: 200, json: () => mode === 'slow' ? new Promise(r => { release = r; }) : {MediaSources: []}};
        }, c);
        const p = client(h).getPlaybackInfo('A', {}, {});
        if (mode === 'network') await assert.rejects(p, {name: 'TypeError'});
        else { await flush(); if (release) release({MediaSources: []}); assert.deepEqual(await p, {MediaSources: []}); }
        assert.equal(c.jobs.size, 0);
    }
});
test('already cancelled request never reaches fetch or allocates deadline', async () => {
    const c = clock(), h = harness(undefined, c), abort = new AbortController(); abort.abort();
    await assert.rejects(client(h).getPlaybackInfo('A', {}, {}, abort.signal), {name: 'AbortError'});
    assert.equal(h.requests.length, 0); assert.equal(c.jobs.size, 0);
});
test('real local HTTP: absent headers and unfinished 200 bodies are aborted', async t => {
    const server = http.createServer((req, res) => {
        if (req.url === '/body') { res.writeHead(200, {'Content-Type': 'application/json'}); res.write('{'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const h = harness(fetch), transport = h.load('transport.js');
    for (const route of ['headers', 'body']) {
        await assert.rejects(transport.send({url: `http://127.0.0.1:${server.address().port}/${route}`,
            type: 'POST', dataType: 'json', timeout: 150, timeoutError: true}), {name: 'TimeoutError'});
        assert.equal(h.timers.size, 0);
    }
});

test('external cancellation during body consumption is AbortError and removes its bridge', async () => {
    const c = clock(), external = new AbortController(); let listeners = 0;
    const signal = {get aborted() { return external.signal.aborted; },
        addEventListener(...args) { listeners++; external.signal.addEventListener(...args); },
        removeEventListener(...args) { listeners--; external.signal.removeEventListener(...args); }};
    const h = harness((_url, {signal}) => ({status: 200, json: () => new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {once: true}))}), c);
    const p = client(h).getPlaybackInfo('A', {}, {}, signal);
    const outcome = assert.rejects(p, {name: 'AbortError'});
    await flush(); external.abort(); await outcome;
    assert.equal(listeners, 0); assert.equal(c.jobs.size, 0);
});

test('successful acknowledgement drains any body type and preserves progress reset', async () => {
    const c = clock(); let consumed = false;
    const h = harness(() => ({status: 200, text: async () => { consumed = true; return ''; }}), c);
    const api = client(h); api.lastPlaybackProgressReport = 123; api.lastPlaybackProgressReportTicks = 456;
    await api.reportPlaybackStopped({ItemId: 'A', PlaySessionId: 'session-A'});
    assert.equal(consumed, true); assert.equal(api.lastPlaybackProgressReport, 0);
    assert.equal(api.lastPlaybackProgressReportTicks, null); assert.equal(c.jobs.size, 0);
});

test('legacy transport timeouts remain AbortError; targeted deadline is opt-in', async () => {
    const c = clock();
    const h = harness((_url, {signal}) => new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), {once: true})), c);
    const transport = h.load('transport.js');
    const pending = transport.send({type: 'GET', url: 'http://127.0.0.1', timeout: 30000});
    const outcome = assert.rejects(pending, {name: 'AbortError'});
    await flush(); c.fire(); await outcome;
    assert.equal(c.jobs.size, 0);
});

test('successful and invalid JSON bodies both remove external cancellation listeners', async () => {
    for (const invalid of [false, true]) {
        const c = clock(), external = new AbortController(); let listeners = 0;
        const signal = {get aborted() { return external.signal.aborted; },
            addEventListener(...args) { listeners++; external.signal.addEventListener(...args); },
            removeEventListener(...args) { listeners--; external.signal.removeEventListener(...args); }};
        const h = harness(() => ({status: 200, json: async () => {
            if (invalid) throw new SyntaxError('synthetic invalid JSON');
            return {MediaSources: []};
        }}), c);
        const p = client(h).getPlaybackInfo('A', {}, {}, signal);
        if (invalid) await assert.rejects(p, {name: 'SyntaxError'}); else await p;
        assert.equal(listeners, 0); assert.equal(c.jobs.size, 0);
        external.abort();
    }
});
