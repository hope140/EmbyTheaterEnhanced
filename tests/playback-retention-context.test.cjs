'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http');
const retention = require('../src/electronapp/enhanced/playback-retention-context.js');

const STRONG = '"synthetic-etag"';
function sourceUrl(origin, {apiKey = 'private-api-one', token = 'private-token-one', session = 'private-session-one', path = '/Videos/item/stream.mkv'} = {}) {
    const url = new URL(path, origin); url.searchParams.set('Static', 'true');
    url.searchParams.set('api_key', apiKey); url.searchParams.set('X-Emby-Token', token);
    url.searchParams.set('PlaySessionId', session); url.searchParams.set('quality', 'synthetic'); return url.toString();
}
function context(source = sourceUrl('http://127.0.0.1:43123')) {
    return {source, serverOrigin: new URL(source).origin, serverId: 'synthetic-server-id', accountId: 'synthetic-account-id',
        itemId: 'synthetic-item-id', mediaSourceId: 'synthetic-media-source-id', playSessionId: 'synthetic-session-id',
        mode: 'DirectStream', mediaType: 'Video', container: 'mkv', live: false};
}
function fakeReader({result = {bytes: Buffer.from([0x52]), etag: STRONG, total: 4096}, read} = {}) {
    const calls = []; let closed = 0;
    return {calls, get closed() {return closed;}, async read(request) {calls.push(request); return read ? read(request) : result;}, async close() {closed++;}};
}
function helper(overrides = {}) {
    const properties = {'demuxer-max-bytes': 16777216, 'demuxer-max-back-bytes': 4194304, 'demuxer-donate-buffer': true,
        'cache-on-disk': false, 'demuxer-cache-state': {'fw-bytes': 1024, 'total-bytes': 4096,
            'seekable-ranges': [{start: 0, end: 1}, {start: 1, end: 2}]}};
    const reads = [], writes = [];
    return {properties, reads, writes, currentGenerationId: 7, exited: false, transportTerminated: false,
        async getProperty(name, timeoutMs) {reads.push({name, timeoutMs}); return properties[name];},
        setProperty(name, value) {writes.push({name, value});}, ...overrides};
}
async function setValid(session, value = context(), client = helper(), generation = 7) {await session.setContext(value, client, generation); return value;}
function noRawContext(status, value) {
    const text = JSON.stringify(status);
    for (const secret of [value.source, value.serverId, value.accountId, value.itemId, value.mediaSourceId, value.playSessionId,
        'private-api-one', 'private-token-one', 'private-session-one']) assert.equal(text.includes(secret), false, `status omitted ${secret}`);
}

test('disabled creation returns null without constructing or reading the source', async () => {
    let touched = 0;
    const session = retention.create({enabled: false, reader: {read() {touched++; throw Error('disabled-reader-touched');}, close() {touched++;}}});
    assert.equal(session, null); assert.equal(touched, 0);
});

test('setContext probes only one byte, reports context-only capability, and omits raw identity from status', async () => {
    const reader = fakeReader(), session = retention.create({enabled: true, reader}), client = helper();
    const value = context(); await setValid(session, value, client);
    assert.equal(reader.calls.length, 1);
    const call = reader.calls[0];
    assert.equal(call.source, value.source); assert.equal(call.origin, value.serverOrigin);
    assert.equal(call.start, 0); assert.equal(call.length, 1); assert(call.signal instanceof AbortSignal);
    const status = session.status();
    assert.equal(status.enabled, true); assert.equal(status.canReuse, false); assert.equal(status.reason, 'exact-export-map-unavailable');
    assert.match(status.bindingSha256, /^[a-f0-9]{64}$/); assert.equal(typeof status.state, 'string');
    noRawContext(status, value);
    assert.equal(status.mode, 'context-only');
    assert.deepEqual(Object.keys(status).sort(), ['bindingSha256', 'canReuse', 'enabled', 'mode', 'reason', 'state']);
    await session.close(); assert.equal(reader.closed, 1);
});

test('credential query changes remain in memory and do not alter binding digest or leak to status', async () => {
    const reader = fakeReader(), session = retention.create({enabled: true, reader}), origin = 'https://127.0.0.1:43123', client = helper();
    const first = context(sourceUrl(origin)); await setValid(session, first, client); const digestA = session.status().bindingSha256;
    const second = {...first, source: sourceUrl(origin, {apiKey: 'private-api-two', token: 'private-token-two', session: 'private-session-two'})};
    second.serverOrigin = new URL(second.source).origin; await setValid(session, second, client); const digestB = session.status().bindingSha256;
    assert.equal(digestA, digestB, 'secret-only source query changes do not redefine identity');
    assert.equal(reader.calls[0].source, first.source); assert.equal(reader.calls[1].source, second.source, 'reader receives the in-memory source');
    noRawContext(session.status(), second);
    await session.close();
});

test('unknown, dynamic, cross-origin, live, non-video, and unsupported-mode contexts never become dispatched', async () => {
    const reader = fakeReader(), session = retention.create({enabled: true, reader}), base = context();
    const invalid = [
        {...base, extra: 'unknown-field'},
        {...base, mode: 'Transcode'}, {...base, live: true}, {...base, mediaType: 'Audio'},
        {...base, source: sourceUrl('https://other.invalid')},
        {...base, source: sourceUrl(base.serverOrigin).replace('Static=true', 'Static=false')},
        {...base, mode: 'DirectPlay', source: sourceUrl(base.serverOrigin, {path: '/Videos/item/live.mkv'}).replace('Static=true', 'Static=')}
    ];
    const helperValue = helper();
    for (const [index, candidate] of invalid.entries()) {
        try {await session.setContext(candidate, helperValue, 7);} catch (_) {}
        assert.equal(session.dispatched(candidate.source, helperValue, 7), false, `invalid context case ${index}`);
    }
    assert.equal(reader.calls.length, 0, 'invalid source identity fails before transport probing');
    assert.equal(helperValue.reads.length, 0);
    await session.close();
});

test('dispatch must match the final source and started reads only the current live helper without setting options', async () => {
    const reader = fakeReader(), session = retention.create({enabled: true, reader}), value = context(), current = helper();
    await setValid(session, value, current);
    assert.equal(session.dispatched(sourceUrl(value.serverOrigin, {path: '/Videos/other/stream.mkv'}), current, 7), false);
    assert.equal((await session.started(current, 7)).canReuse, false); assert.equal(current.reads.length, 0);
    await setValid(session, value, current);
    assert.equal(session.dispatched(value.source, current, 6), false, 'stale generation cannot bind');
    await setValid(session, value, current);
    assert.equal(session.dispatched(value.source, current, 7), true);
    current.currentGenerationId = 8;
    assert.equal((await session.started(current, 7)).canReuse, false, 'helper generation must still be current');
    assert.equal(current.reads.length, 0);
    current.currentGenerationId = 7;
    assert.equal(session.dispatched(value.source, current, 7), true);
    const observed = await session.started(current, 7);
    assert.deepEqual(current.reads.map(row => row.name), ['demuxer-max-bytes', 'demuxer-max-back-bytes', 'demuxer-donate-buffer', 'cache-on-disk', 'demuxer-cache-state']);
    assert(current.reads.every(row => row.timeoutMs === 2000)); assert.deepEqual(current.writes, [], 'context observer never changes mpv options');
    assert.equal(observed.canReuse, false); assert.equal(observed.reason, 'exact-export-map-unavailable');
    assert.equal(observed.forwardLimitBytes, 16777216); assert.equal(observed.backwardLimitBytes, 4194304);
    assert.equal(observed.heldForwardBytes, 1024); assert.equal(observed.heldTotalBytes, 4096); assert.equal(observed.rangeCount, 2);
    noRawContext(observed, value);
    current.exited = true; await session.started(current, 7); assert.equal(current.reads.length, 5, 'an exited helper cannot produce a later observation');
    await session.close();
});

test('invalid RAM mode and malformed cache observations are unavailable without exposing raw mpv values', async () => {
    for (const mutate of [
        p => {p['cache-on-disk'] = true;}, p => {p['demuxer-max-bytes'] = Number.MAX_SAFE_INTEGER + 1;},
        p => {p['demuxer-max-back-bytes'] = -1;}, p => {p['demuxer-cache-state']['fw-bytes'] = Infinity;},
        p => {p['demuxer-cache-state']['total-bytes'] = -1;},
        p => {p['demuxer-cache-state']['seekable-ranges'] = [{start: 0, end: NaN}];}
    ]) {
        const reader = fakeReader(), session = retention.create({enabled: true, reader}), value = context(), client = helper();
        mutate(client.properties); await setValid(session, value, client); session.dispatched(value.source, client, 7);
        await session.started(client, 7);
        const status = session.status();
        assert.equal(status.canReuse, false); assert.equal(status.reason, 'exact-export-map-unavailable'); noRawContext(status, value);
        await session.close();
    }
});

test('missing or weak entity tags cannot bind a context, while a changed strong tag changes the digest', async () => {
    for (const proof of [
        {bytes: Buffer.from([1]), total: 4096},
        {bytes: Buffer.from([1]), etag: 'W/"weak"', total: 4096},
        {bytes: Buffer.alloc(0), etag: STRONG, total: 4096},
        {bytes: Buffer.from([1]), etag: STRONG, total: Number.MAX_SAFE_INTEGER + 1}
    ]) {
        const reader = fakeReader({result: proof}), session = retention.create({enabled: true, reader}), value = context(), client = helper();
        await session.setContext(value, client, 7);
        assert.equal(session.status().state, 'unavailable'); assert.equal(session.status().bindingSha256, undefined);
        assert.equal(session.dispatched(value.source, client, 7), false);
        await session.close();
    }
    const reader = fakeReader(), session = retention.create({enabled: true, reader}), value = context(), client = helper();
    await setValid(session, value, client); const first = session.status().bindingSha256;
    reader.read = async request => {reader.calls.push(request); return {bytes: Buffer.from([2]), etag: '"changed-version"', total: 4096};};
    await setValid(session, value, client); const changed = session.status().bindingSha256;
    assert.notEqual(changed, first, 'a new strong validator produces a distinct source binding');
    assert.equal(session.status().canReuse, false); await session.close();
});

test('retire aborts and waits for a pending reader, then ignores its late result', async () => {
    let finishRead, seenSignal;
    const reader = fakeReader({read(request) {seenSignal = request.signal; return new Promise(resolve => {finishRead = resolve;});}});
    const session = retention.create({enabled: true, reader}), client = helper(), value = context(), pending = session.setContext(value, client, 7);
    while (!finishRead) await new Promise(resolve => setImmediate(resolve));
    let settled = false; const retiring = session.retire().then(() => {settled = true;});
    await new Promise(resolve => setImmediate(resolve)); assert.equal(settled, false, 'retire waits for the physical reader promise');
    assert.equal(seenSignal.aborted, true);
    finishRead({bytes: Buffer.from([0x52]), etag: STRONG, total: 4096});
    await Promise.all([pending.catch(() => {}), retiring]);
    assert.equal(session.dispatched(value.source, client, 7), false);
    assert.equal(session.status().canReuse, false);
    await session.close();
});

test('overlapping retires and replacement context join one physical reader settlement', async () => {
    let resolveOld, reads = 0, closed = 0;
    const proof = {bytes: Buffer.from([0x52]), etag: STRONG, total: 4096};
    const reader = {read(request) {reads++; if (reads === 1) return new Promise(resolve => {resolveOld = resolve;}); return Promise.resolve(proof);}, async close() {closed++;}};
    const session = retention.create({enabled: true, reader}), oldValue = context(), newValue = context(sourceUrl(oldValue.serverOrigin, {path: '/Videos/replacement/stream.mkv'}));
    const oldHelper = helper(), newHelper = helper();
    const oldSet = session.setContext(oldValue, oldHelper, 7);
    while (!resolveOld) await new Promise(resolve => setImmediate(resolve));
    const retiredOne = session.retire(), retiredTwo = session.retire(), newSet = session.setContext(newValue, newHelper, 7);
    let retireOneDone = false, retireTwoDone = false, newSetDone = false;
    retiredOne.then(() => {retireOneDone = true;}); retiredTwo.then(() => {retireTwoDone = true;}); newSet.then(() => {newSetDone = true;});
    try {
        for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve));
        assert.equal(reads, 1, 'replacement probe must wait until the prior physical request settles');
        assert.equal(retireOneDone, false); assert.equal(retireTwoDone, false); assert.equal(newSetDone, false);
        resolveOld(proof);
        await Promise.all([retiredOne, retiredTwo, oldSet, newSet]);
        assert.equal(reads, 2, 'only the replacement context starts a new probe after retirement settles');
        assert.equal(session.status().bindingSha256?.length, 64);
        assert.equal(session.dispatched(newValue.source, newHelper, 7), true);
        assert.equal(closed, 0);
    } finally {resolveOld?.(proof); await Promise.allSettled([retiredOne, retiredTwo, oldSet, newSet]);}
    await session.close(); assert.equal(closed, 1);
});

test('late source-context probe cannot replace the newer context digest', async () => {
    const resolves = [];
    const reader = fakeReader({read(request) {return new Promise(resolve => resolves.push({request, resolve}));}});
    const session = retention.create({enabled: true, reader});
    const first = context(), second = {...context(sourceUrl(first.serverOrigin, {path: '/Videos/second/stream.mkv'})), itemId: 'second-item'};
    const client = helper(), pendingFirst = session.setContext(first, client, 7);
    while (resolves.length < 1) await new Promise(resolve => setImmediate(resolve));
    const pendingSecond = session.setContext(second, client, 7);
    assert.equal(resolves[0].request.signal.aborted, true, 'replaced context aborts its pending probe');
    resolves[0].resolve({bytes: Buffer.from([1]), etag: '"first"', total: 4096}); await pendingFirst.catch(() => {});
    while (resolves.length < 2) await new Promise(resolve => setImmediate(resolve));
    resolves[1].resolve({bytes: Buffer.from([2]), etag: '"second"', total: 4096}); await pendingSecond;
    const secondDigest = session.status().bindingSha256;
    assert.equal(session.status().bindingSha256, secondDigest);
    assert.equal(session.dispatched(second.source, client, 7), true);
    await session.close();
});

test('default reader accepts only a one-byte loopback 206 and rejects redirect responses', async t => {
    const bytes = Buffer.from('synthetic loopback source'), requests = [], server = http.createServer((request, response) => {
        requests.push({url: request.url, range: request.headers.range});
        if (request.url.startsWith('/redirect')) {response.writeHead(302, {Location: '/ok'}); response.end(); return;}
        if (request.headers.range !== 'bytes=0-0') {response.writeHead(400); response.end(); return;}
        response.writeHead(206, {'Content-Range': `bytes 0-0/${bytes.length}`, 'Content-Length': '1', ETag: STRONG, 'Accept-Ranges': 'bytes'});
        response.end(bytes.subarray(0, 1));
    });
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`, good = context(sourceUrl(origin));
    const session = retention.create({enabled: true}), client = helper(); await setValid(session, good, client);
    assert.equal(session.status().canReuse, false); await session.close();
    const redirected = context(new URL('/redirect?Static=true', origin).toString()), second = retention.create({enabled: true});
    const redirectClient = helper(), redirectStatus = await second.setContext(redirected, redirectClient, 7);
    assert.equal(redirectStatus.state, 'unavailable'); assert.equal(redirectStatus.bindingSha256, undefined);
    assert.equal(second.dispatched(redirected.source, redirectClient, 7), false);
    await second.close();
    assert.deepEqual(requests, [{url: new URL(good.source).pathname + new URL(good.source).search, range: 'bytes=0-0'},
        {url: '/redirect?Static=true', range: 'bytes=0-0'}], 'default transport does one 1-byte probe and never follows redirects');
    t.diagnostic('The default reader used a local synthetic HTTP source; it issued only the eligibility byte probe, not cache/storage requests.');
});
