'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');
const {createController} = require('../prototypes/fn-connect/client/controller.cjs');
const {createFixture, createFixtureIO} = require('../prototypes/fn-connect/client/fixture.cjs');
const source = path.join(__dirname, '../prototypes/fn-connect/client/anonymous-media.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(value => { resolve = value; }); return {promise, resolve}; };
function transportFixture({earlyError = false, redirect = false, holdClose = false, requestFailure = false} = {}) {
    const requests = [], requires = createRequire(source), module = {exports: {}};
    const fake = {request(url, options) {
        const req = Object.assign(new EventEmitter(), {closed: false, destroyed: false, url, options});
        req.release = () => { if (!req.closed) { req.closed = true; req.emit('close'); } };
        req.destroy = () => { req.destroyed = true; if (!holdClose) queueMicrotask(req.release); };
        req.end = () => process.nextTick(() => {
            if (requestFailure) { req.emit('error', new Error('PRIVATE_NETWORK_CANARY')); return; }
            const firstRedirect = redirect && requests.indexOf(req) === 0;
            const incoming = Object.assign(new PassThrough(), {statusCode: firstRedirect ? 302 : 206,
                headers: firstRedirect ? {location: '/second'} : {'content-type': 'video/mp4', 'content-length': '3'}, complete: firstRedirect});
            req.incoming = incoming;
            req.emit('response', incoming);
            if (earlyError) process.nextTick(() => incoming.destroy(new Error('PRIVATE_UPSTREAM_CANARY')));
            else if (!firstRedirect) { incoming.complete = true; incoming.end('abc'); }
            if (!holdClose && !firstRedirect) incoming.once('end', req.release);
        });
        requests.push(req); return req;
    }};
    vm.runInNewContext(fs.readFileSync(source, 'utf8'), {module, exports: module.exports, URL, Buffer, setTimeout, clearTimeout,
        process: {env: {}}, require: name => name === 'node:http' ? fake : requires(name)}, {filename: source});
    const consumer = module.exports.createAnonymousMedia({enabled: true, mode: 'fixture', environment: {},
        closeTimeoutMs: 30, resolveProxy: async () => 'DIRECT'});
    const open = () => consumer.open({url: 'http://127.0.0.1:12345/first', allowedOrigins: ['http://127.0.0.1:12345'], headers: {'User-Agent': 'Synthetic/1.0'}});
    return {requests, open};
}
test('response nextTick failure before await continuation is observed and rejects instead of returning a hanging body', async () => {
    const x = transportFixture({earlyError: true});
    await assert.rejects(x.open(), error => error.code === 'ANONYMOUS_MEDIA_STREAM_FAILED' && !error.message.includes('CANARY'));
    assert.equal(x.requests.length, 1); assert.equal(x.requests[0].closed, true);
});
test('redirect does not send the next request before the previous owned request close is confirmed', async () => {
    const x = transportFixture({redirect: true, holdClose: true});
    let settled = false;
    const pending = x.open().finally(() => { settled = true; });
    await tick(); assert.equal(x.requests.length, 1); assert.equal(settled, false);
    x.requests[0].release(); const response = await pending;
    assert.equal(x.requests.length, 2);
    response.dispose();
    let drained = false; const drain = response.drain().then(() => { drained = true; });
    await tick(); assert.equal(drained, false);
    x.requests[1].release(); await drain; assert.equal(drained, true);
});
test('unconfirmed redirect closure is a fixed failure and never dispatches another hop', async () => {
    const x = transportFixture({redirect: true, holdClose: true});
    await assert.rejects(x.open(), error => error.code === 'ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED');
    assert.equal(x.requests.length, 1); x.requests[0].release();
});
test('failed header request does not settle until the owned request has actually closed', async () => {
    const x = transportFixture({requestFailure: true, holdClose: true});
    let settled = false;
    const pending = x.open().finally(() => { settled = true; });
    const rejected = assert.rejects(pending, error => error.code === 'ANONYMOUS_MEDIA_NETWORK_ERROR');
    await tick(); assert.equal(settled, false); assert.equal(x.requests[0].destroyed, true);
    x.requests[0].release(); await rejected; assert.equal(settled, true);
});
for (const forget of [false, true]) test('profile close waits for the anonymous drain before ' + (forget ? 'forgetting' : 'preserving') + ' storage', async t => {
    const fixture = await createFixture(), io = createFixtureIO(), barrier = deferred(), events = [];
    t.after(() => fixture.close());
    const body = new PassThrough(); body.on('error', () => {});
    io.openAnonymousMedia = async () => ({statusCode: 200, headers: {'content-type': 'video/mp4'}, body,
        async drain() { events.push('drain-start'); await barrier.promise; events.push('drain-end'); }});
    io.clearSession = async () => { events.push('clear'); };
    io.preserveSession = async () => { events.push('preserve'); };
    const controller = createController({enabled: true, mode: 'fixture', io, relayExternalMedia: true});
    const id = controller.add(fixture.profile, {storage: {persistent: true, path: '/synthetic-only',
        forget() { events.push('forget'); }, release() { events.push('release'); }}});
    await controller.start(id); await io.authorize(id, fixture.profile); await controller.verify(id);
    await controller.request(id, {path: 'direct', kind: 'media', headers: {'User-Agent': 'Synthetic/1.0'}});
    let closed = false; const closing = controller.close(id, {forget}).then(() => { closed = true; });
    await tick(); assert.equal(closed, false); assert.deepEqual(events, ['drain-start']);
    barrier.resolve(); await closing;
    assert.deepEqual(events, forget ? ['drain-start', 'drain-end', 'clear', 'forget', 'release'] : ['drain-start', 'drain-end', 'preserve', 'release']);
});
test('failed anonymous drain keeps storage and lock ownership instead of reporting a successful forget', async t => {
    const fixture = await createFixture(), io = createFixtureIO(), events = [];
    t.after(() => fixture.close());
    const body = new PassThrough(); body.on('error', () => {});
    io.openAnonymousMedia = async () => ({statusCode: 200, headers: {'content-type': 'video/mp4'}, body,
        async drain() { throw new Error('PRIVATE_DRAIN_CANARY'); }});
    io.clearSession = async () => { events.push('clear'); };
    const controller = createController({enabled: true, mode: 'fixture', io, relayExternalMedia: true});
    const id = controller.add(fixture.profile, {storage: {persistent: true, path: '/synthetic-only',
        forget() { events.push('forget'); }, release() { events.push('release'); }}});
    await controller.start(id); await io.authorize(id, fixture.profile); await controller.verify(id);
    await controller.request(id, {path: 'direct', kind: 'media', headers: {'User-Agent': 'Synthetic/1.0'}});
    await assert.rejects(controller.close(id, {forget: true}), error => error.code === 'ANONYMOUS_MEDIA_CLOSE_UNCONFIRMED' && !error.message.includes('CANARY'));
    assert.deepEqual(events, []);
});
