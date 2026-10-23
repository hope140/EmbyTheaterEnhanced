'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {probe} = require('../prototypes/fn-connect/mapped-emby-probe.js');
const base = {enabled: true, pageUrl: 'https://synthetic-nas.example.test/', apiBasePath: '/app/confirmed-service/emby'};
const expected = code => error => error.code === code && error.message === code;

test('probe is disabled by default and performs no request', async () => {
    let calls = 0;
    await assert.rejects(probe({request() { calls++; }}), expected('PROBE_DISABLED'));
    assert.equal(calls, 0);
});

test('probe stays inside a supplied HTTPS app mapping and the normal browser session', async () => {
    let target, options;
    const report = await probe({...base, expectedServerId: 'synthetic-id', request: async (url, init) => {
        target = url; options = init;
        return Response.json({Id: 'synthetic-id', Version: '4.10.0.0', ServerName: 'private-marker'});
    }});
    assert.equal(target, 'https://synthetic-nas.example.test/app/confirmed-service/emby/System/Info/Public');
    assert.equal(options.method, 'GET');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'manual');
    assert.deepEqual(options.headers, {Accept: 'application/json'});
    assert.equal(report.gatewayAccess, 'INFO_REACHABLE');
    assert.equal(report.expectedServerMatch, true);
    assert.equal(report.range, 'NOT_TESTED');
    assert.equal(JSON.stringify(report).includes('private-marker'), false);
    assert.equal(JSON.stringify(report).includes('synthetic-id'), false);
});

test('rejects unregistered paths, query credentials, traversal and insecure pages before requesting', async () => {
    let calls = 0;
    const request = async () => { calls++; };
    for (const apiBasePath of [undefined, '/emby', '//other.test/app/a', '/app/a/../b', '/app/a?token=x', '/app/a%2fb']) {
        await assert.rejects(probe({...base, apiBasePath, request}), expected('REGISTERED_APP_PATH_REQUIRED'));
    }
    await assert.rejects(probe({...base, pageUrl: 'http://synthetic.test', request}), expected('HTTPS_PAGE_REQUIRED'));
    assert.equal(calls, 0);
});

test('login redirect, HTML success, access denial and unrelated JSON never imply Emby connectivity', async () => {
    for (const response of [new Response('', {status: 302}), new Response('<html>Login</html>', {status: 200}),
        new Response('', {status: 403}), Response.json({status: 'ok'})]) {
        const report = await probe({...base, request: async () => response});
        assert.equal(report.embyInfoShape, false);
        assert.notEqual(report.gatewayAccess, 'INFO_REACHABLE');
    }
});

test('incorrect server identity remains a mismatch despite valid info shape', async () => {
    const report = await probe({...base, expectedServerId: 'intended-id',
        request: async () => Response.json({Id: 'other-id', Version: '4.10'})});
    assert.equal(report.expectedServerMatch, false);
});

test('bounded response, invalid JSON and network faults produce fixed errors', async () => {
    await assert.rejects(probe({...base, request: async () => new Response('x'.repeat(65537),
        {headers: {'Content-Type': 'application/json'}})}), expected('RESPONSE_TOO_LARGE'));
    await assert.rejects(probe({...base, request: async () => new Response('{',
        {headers: {'Content-Type': 'application/json'}})}), expected('INVALID_JSON'));
    await assert.rejects(probe({...base, request: async () => { throw new Error('private-url-marker'); }}), expected('PROBE_FAILED'));
});

test('cancel during response streaming terminates the probe without reporting success', async () => {
    const controller = new AbortController();
    let canceled = false;
    const body = new ReadableStream({pull(stream) {
        controller.abort();
        stream.enqueue(new TextEncoder().encode('{'));
    }, cancel() { canceled = true; }});
    await assert.rejects(probe({...base, signal: controller.signal, request: async () =>
        new Response(body, {headers: {'Content-Type': 'application/json'}})}), expected('PROBE_ABORTED'));
    assert.equal(canceled, true);
});

test('browser entry exports a callable probe and cannot override the current origin', async () => {
    const context = {location: {href: base.pageUrl}, URL, AbortController, TextDecoder, setTimeout, clearTimeout,
        fetch: async () => Response.json({Id: 'synthetic-id', Version: '4.10'})};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../prototypes/fn-connect/mapped-emby-probe.js'), 'utf8'), context);
    const browserProbe = context.ETE_FN_MAPPED_EMBY_PROBE.probe;
    await assert.rejects(browserProbe({...base, pageUrl: 'https://other.example.test/'}), expected('SAME_ORIGIN_REQUIRED'));
    const report = await browserProbe({enabled: true, apiBasePath: base.apiBasePath});
    assert.equal(report.embyInfoShape, true);
});

test('timeout aborts an actual pending requester signal and stays distinguishable from cancellation', async t => {
    t.mock.timers.enable({apis: ['setTimeout']});
    let aborts = 0;
    const pending = probe({...base, request: (url, {signal}) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { aborts++; reject(new Error('synthetic-abort')); }, {once: true});
    })});
    const rejection = assert.rejects(pending, expected('PROBE_TIMEOUT'));
    t.mock.timers.tick(5000);
    await rejection;
    assert.equal(aborts, 1);
});
