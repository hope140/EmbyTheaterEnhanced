'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const probe = require('../src/electronapp/enhanced/advance-download/source-probe');
const {fixture, media, token} = require('./helpers/advance-download-fixture.cjs');

test('main-fetched permissions, real resolver and production CD2 service lead to verified HTTP original bytes', async t => {
    const f = await fixture(t);
    const result = await f.session().acquire();
    assert.equal(result.kind, 'direct-url');
    assert.equal(result.extension, 'mkv');
    assert.equal(result.total, media.length);
    assert.equal(result.resumeVerified, true);
    assert.equal(result.electronResumeEligible, true);
    assert.deepEqual(result.headers, {'User-Agent': 'ETE-Download-Fixture'});
    assert.equal(f.state.closedServices, 1);
    assert.deepEqual(f.services[0], [['find', '/cloud/media/movie.mkv'], ['url', true]]);
    const requests = f.calls.filter(call => call.url.startsWith('/direct'));
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.range, 'bytes=0-65535');
    assert.equal(requests[1].headers['if-range'], '"movie-v1"');
    assert.ok(requests.every(call => !call.headers['x-emby-token'] && !call.url.includes(token)));
    assert.ok(f.calls.every(call => !/Playback|Sessions|Transferred/.test(call.url)));
});

test('refresh reacquires its own CD2 URL and accepts a new signature only for a matching representation', async t => {
    const f = await fixture(t), session = f.session();
    const first = await session.acquire();
    f.state.signature = 'second';
    const second = await session.acquire();
    assert.notEqual(first.url, second.url);
    assert.equal(first.identity, second.identity);
    assert.equal(f.state.closedServices, 2);
    f.state.etag = '"movie-v2-same-length"';
    await assert.rejects(session.acquire(), error => probe.reasonOf(error) === 'representation-changed');
    assert.equal(f.state.closedServices, 3);
});

test('source acquisition retains ownership until its CD2 service has actually finished closing', async t => {
    const f = await fixture(t);
    let releaseClose, enteredClose;
    const entered = new Promise(resolve => {enteredClose = resolve;});
    const gate = new Promise(resolve => {releaseClose = resolve;});
    const session = f.session({}, {createCd2Service() {return {
        resolve: async () => ({status: 'hit', type: 'url', source: f.cdn + '/direct', sourceKind: 'direct-url'}),
        cancel() {}, close() {enteredClose(); return gate;}
    };}});
    let settled = false;
    const pending = session.acquire().then(value => {settled = true; return value;});
    await entered;
    assert.equal(settled, false);
    await assert.rejects(session.acquire(), error => probe.reasonOf(error) === 'request-pending');
    releaseClose();
    assert.equal((await pending).total, media.length);
});

test('failed direct-byte access can use a newly resolved CD2 same-origin source without sharing preload jobs', async t => {
    const f = await fixture(t);
    f.state.directDenied = true;
    const result = await f.session().acquire();
    assert.equal(result.kind, 'cd2-url');
    assert.match(result.url, /\/fallback$/);
    assert.deepEqual(result.headers, {});
    assert.ok(f.services[0].some(call => call[0] === 'url' && call[1] === false));
    assert.equal(f.state.closedServices, 1);
});

test('an ordinary Emby original remains authenticated and bound to the selected media source', async t => {
    const f = await fixture(t);
    f.state.pointer = false;
    const result = await f.session({}, {getConfig: () => ({resolver: {version: 1, enabled: false, rules: []}, runtime: {enabled: false}})}).acquire();
    assert.equal(result.kind, 'emby-original');
    assert.equal(result.headers['X-Emby-Token'], token);
    assert.match(result.url, /mediaSourceId=source/);
    assert.ok(!result.url.includes(token));
    assert.equal(f.services.length, 0);
});

test('a pointer file returned by the original download API never becomes a downloadable movie', async t => {
    const f = await fixture(t);
    f.state.sizeHint = 0;
    await assert.rejects(f.session({}, {getConfig: () => ({resolver: {version: 1, enabled: false, rules: []}, runtime: {enabled: false}})}).acquire(),
        error => probe.reasonOf(error) === 'pointer-response');
});

test('current server and user download permission are rechecked before any media request', async t => {
    const f = await fixture(t), session = f.session();
    f.state.downloadAllowed = false;
    await assert.rejects(session.acquire(), error => probe.reasonOf(error) === 'download-not-permitted');
    assert.equal(f.services.length, 0);
    f.state.downloadAllowed = true;
    f.state.itemDownloadAllowed = false;
    await assert.rejects(session.acquire(), error => probe.reasonOf(error) === 'download-not-permitted');
    f.state.itemDownloadAllowed = true;
    f.state.serverId = 'another-server';
    await assert.rejects(session.acquire(), error => probe.reasonOf(error) === 'server-changed');
    assert.ok(!f.calls.some(call => call.url.startsWith('/direct')));
});

test('401 metadata failures expose only a fixed reason and never fall back using another credential', async t => {
    const f = await fixture(t);
    await assert.rejects(f.session({token: 'invalid-synthetic-token'}).acquire(), error => {
        assert.equal(error.message, 'advance-download-auth-required');
        assert.ok(!error.message.includes('secret-server-message'));
        return true;
    });
    assert.equal(f.calls.length, 1);
    assert.equal(f.services.length, 0);
});

test('multi-version selection is explicit and never silently changes after refresh', async t => {
    const f = await fixture(t);
    f.state.multiple = true;
    await assert.rejects(f.session({mediaSourceId: undefined}).acquire(), error => probe.reasonOf(error) === 'source-selection-required');
    f.state.multiple = false;
    const session = f.session();
    await session.acquire();
    f.state.sourceId = 'replacement-source';
    await assert.rejects(session.acquire(), error => probe.reasonOf(error) === 'source-unavailable');
});

test('a main-fetched HTTP MediaSource can be probed without forwarding Emby authentication', async t => {
    const f = await fixture(t);
    f.state.sourcePath = f.cdn + '/direct';
    f.state.requiredHeaders = {'User-Agent': 'Source-Fixture'};
    const result = await f.session().acquire();
    assert.equal(result.kind, 'media-source-http');
    assert.deepEqual(result.headers, {'User-Agent': 'Source-Fixture'});
    assert.equal(f.state.closedServices, 1);
    f.state.requiredHeaders = {};
    const emptyHeaders = await f.session().acquire();
    assert.equal(emptyHeaders.kind, 'media-source-http');
    assert.deepEqual(emptyHeaders.headers, {});
    const before = f.calls.filter(call => call.url.startsWith('/direct')).length;
    f.state.requiredHeaders = {Authorization: 'synthetic-private-media-header'};
    await assert.rejects(f.session().acquire());
    assert.equal(f.calls.filter(call => call.url.startsWith('/direct')).length, before);
    assert.ok(f.calls.every(call => !call.headers.authorization));
});

test('a cross-origin media redirect strips Emby credentials and does not restore them later', async t => {
    const f = await fixture(t);
    f.state.redirect = true;
    const result = await f.session({}, {getConfig: () => ({resolver: {version: 1, enabled: false, rules: []}, runtime: {enabled: false}})}).acquire();
    assert.equal(result.headers['X-Emby-Token'], undefined);
    assert.ok(f.calls.filter(call => call.url.startsWith('/direct')).every(call => !call.headers['x-emby-token']));
    await assert.rejects(probe.probeSource({url: f.cdn + '/cross', headers: {}}, {}), error => probe.reasonOf(error) === 'auth-required');
    await assert.rejects(probe.probeSource({url: f.cdn + '/bounce', headers: {}}), error => probe.reasonOf(error) === 'redirect-loop');
});

test('a full-response-only source can be downloaded from the beginning without claiming resume', async t => {
    const f = await fixture(t);
    f.state.ranges = false;
    f.state.body = Buffer.alloc(1048576, 9);
    media.subarray(0, 4).copy(f.state.body);
    const result = await probe.probeSource({url: f.cdn + '/direct', headers: {}});
    assert.equal(result.total, 1048576);
    assert.equal(result.rangeSupported, false);
    assert.equal(result.resumeVerified, false);
    assert.equal(result.extension, 'mkv');
});

test('a weak validator never enables byte resume, and a wrong nonzero range is refused', async t => {
    const f = await fixture(t);
    f.state.etag = 'W/"movie-v1"';
    const result = await probe.probeSource({url: f.cdn + '/direct', headers: {}});
    assert.equal(result.resumeVerified, false);
    assert.equal(result.etag, null);
    f.state.etag = '"movie-v1"';
    f.state.badTail = true;
    await assert.rejects(probe.probeSource({url: f.cdn + '/direct', headers: {}}), error => probe.reasonOf(error) === 'resume-probe-invalid');
});

test('HLS, login pages and pointer text are not treated as original movie bodies', async t => {
    const f = await fixture(t);
    for (const [text, reason] of [['#EXTM3U\nsegment.ts\n', 'segmented-source'],
        ['<!doctype html><html>login</html>', 'non-media-response'], ['https://example.invalid/media.mkv', 'pointer-response']]) {
        f.state.body = Buffer.from(text);
        await assert.rejects(probe.probeSource({url: f.cdn + '/direct', headers: {}}), error => probe.reasonOf(error) === reason);
    }
});

test('closing a pending source session aborts its owned HTTP request and retires the result', async t => {
    const f = await fixture(t), session = f.session();
    f.state.stall = true;
    const pending = session.acquire();
    await f.mediaRequested;
    session.close();
    await assert.rejects(pending, error => probe.reasonOf(error) === 'cancelled');
    assert.equal(f.state.closedServices, 1);
    await assert.rejects(session.acquire(), error => probe.reasonOf(error) === 'cancelled');
    for (let index = 0; index < 50 && f.sockets.size; index++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.sockets.size, 0);
});

test('metadata explicitly negotiates JSON and STRM sidecar size cannot reject verified movie bytes', async t => {
    const f = await fixture(t);
    f.state.requireJsonAccept = true;
    f.state.sizeHint = 53;
    const result = await f.session().acquire();
    assert.equal(result.total, media.length);
    assert.ok(f.calls.filter(call => /System\/Info|Users\//.test(call.url)).every(call => call.headers.accept === 'application/json'));
    f.state.itemPath = '/server/movie.mkv';
    f.state.pointer = false;
    await assert.rejects(f.session({}, {getConfig: () => ({resolver: {version: 1, enabled: false, rules: []}, runtime: {enabled: false}})}).acquire(),
        error => probe.reasonOf(error) === 'representation-changed' && error.downloadStage === 'probe-source');
});
