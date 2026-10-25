'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const diagnostics = require('../src/electronapp/enhanced/playback-range-diagnostics');
const {createReader} = require('../src/electronapp/enhanced/playback-range-http');
const canary = 'https://private.invalid/secret-media?api_key=private-token';

test('diagnostics has the same narrow API in AMD and Node', () => {
    let amd;
    function define(dependencies, factory) {assert.equal(dependencies.length, 0); amd = factory();}
    define.amd = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/electronapp/enhanced/playback-range-diagnostics.js'), 'utf8'), {define});
    assert.deepEqual(Object.keys(amd).sort(), ['error', 'fromError', 'snapshot', 'text']);
    assert.equal(JSON.stringify(amd.snapshot({stage: 'next-probe', reason: 'redirect', httpStatus: 302})), JSON.stringify(diagnostics.snapshot({stage: 'next-probe', reason: 'redirect', httpStatus: 302})));
});

test('diagnostics projects only fixed enums and bounded status, never arbitrary details', () => {
    assert.deepEqual(diagnostics.snapshot({stage: 'next-probe', reason: 'redirect', httpStatus: 302, url: canary}), {stage: 'next-probe', reason: 'redirect', httpStatus: 302});
    for (const value of [undefined, null, canary, 'toString', '__proto__']) {
        const record = diagnostics.snapshot({stage: value, reason: value, httpStatus: canary});
        assert.deepEqual(record, {stage: 'lifecycle', reason: 'unexpected'});
        assert.equal(diagnostics.text(record), '预载暂不可用 [lifecycle/unexpected]');
    }
    for (const status of [99, 600, 206.5, '206', NaN, Infinity]) assert.equal(diagnostics.snapshot({httpStatus: status}).httpStatus, undefined);
    for (const status of [100, 206, 599]) assert.equal(diagnostics.snapshot({httpStatus: status}).httpStatus, status);
});

test('errors retain legacy messages while rendering only allowlisted metadata or exact legacy codes', () => {
    const error = diagnostics.error('etag-weak', 'range-response-invalid', 206);
    assert.equal(error.message, 'range-response-invalid');
    assert.deepEqual(diagnostics.fromError(error, 'current-probe'), {stage: 'current-probe', reason: 'etag-weak', httpStatus: 206});
    assert.deepEqual(diagnostics.fromError(Error('range-network-failed'), 'next-prefix'), {stage: 'next-prefix', reason: 'network-failed'});
    assert.deepEqual(diagnostics.fromError(Error('range-timeout'), 'next-metadata'), {stage: 'next-metadata', reason: 'timeout'});
    assert.deepEqual(diagnostics.fromError({message: 'range-response-invalid'}, 'next-probe'), {stage: 'next-probe', reason: 'range-invalid'});
    for (const error of [Error(canary), {message: canary, preloadReason: canary, stack: canary, cause: Error(canary)}, {message: 'range-timeout ' + canary}, {get message() {throw Error(canary);}}]) {
        const record = diagnostics.fromError(error, 'next-probe');
        assert.deepEqual(record, {stage: 'next-probe', reason: 'unexpected'});
        assert(!JSON.stringify(record).includes(canary));
        assert(!diagnostics.text(record).includes(canary));
    }
    assert.deepEqual(diagnostics.fromError(Error(canary), 'next-prefix', 'cache-io'), {stage: 'next-prefix', reason: 'cache-io'});
    assert.deepEqual(diagnostics.fromError(Error(canary), canary, canary), {stage: 'lifecycle', reason: 'unexpected'});
});

async function fixture(t, respond, timeoutMs = 1000) {
    const rows = [], sockets = new Set();
    const server = http.createServer((req, res) => {rows.push(req.headers); respond(req, res);});
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const origin = 'http://127.0.0.1:' + server.address().port, reader = createReader({timeoutMs});
    t.after(async () => {
        await reader.close();
        const closed = [...sockets].map(socket => new Promise(resolve => socket.once('close', resolve)));
        server.closeAllConnections();
        await Promise.all(closed.concat(new Promise(resolve => server.close(resolve))));
        assert.equal(sockets.size, 0);
        assert.equal(reader.status().requests, 0);
    });
    return {origin, reader, rows, read: (value = {}) => reader.read({source: origin + '/media?synthetic-grant=local', origin, start: 0, length: 4, ...value})};
}
const validHeaders = () => ({'Content-Range': 'bytes 0-3/8', 'Content-Length': '4', ETag: '"v1"'});
async function refusal(promise, reason, status, message = 'range-response-invalid') {
    await assert.rejects(promise, error => {
        assert.equal(error.message, message);
        assert.deepEqual(diagnostics.fromError(error, 'next-probe'), {stage: 'next-probe', reason, ...(status === undefined ? {} : {httpStatus: status})});
        assert(!JSON.stringify(diagnostics.fromError(error, 'next-probe')).includes(canary));
        return true;
    });
}

for (const [status, reason] of [[301, 'redirect'], [302, 'redirect'], [307, 'redirect'], [401, 'auth-required'], [403, 'auth-required'], [412, 'validator-changed'], [416, 'range-invalid'], [200, 'status-not-206'], [404, 'status-not-206'], [500, 'status-not-206']]) {
    test('HTTP refusal preserves status without following Location or forwarding headers: ' + status, async t => {
        const f = await fixture(t, (_req, res) => {res.writeHead(status, {Location: canary, 'Set-Cookie': 'private-cookie=secret', 'Content-Length': 0}); res.end();});
        await refusal(f.read({headers: {Authorization: canary, Cookie: canary, 'X-Emby-Token': canary}}), reason, status);
        assert.equal(f.rows.length, 1);
        for (const key of ['authorization', 'cookie', 'x-emby-token']) assert.equal(f.rows[0][key], undefined);
        assert.equal(f.reader.status().requests, 0, 'rejection waits for physical request close');
    });
}

const cases = [
    ['missing-range', h => {delete h['Content-Range'];}, 'range-invalid'],
    ['offset', h => {h['Content-Range'] = 'bytes 1-4/8';}, 'range-invalid'],
    ['end', h => {h['Content-Range'] = 'bytes 0-2/8';}, 'range-invalid'],
    ['total', h => {h['Content-Range'] = 'bytes 0-3/3';}, 'range-invalid'],
    ['unsafe-total', h => {h['Content-Range'] = 'bytes 0-3/9999999999999999999';}, 'range-invalid'],
    ['missing-etag', h => {delete h.ETag;}, 'etag-missing'],
    ['weak-etag', h => {h.ETag = 'W/"v1"';}, 'etag-weak'],
    ['invalid-etag', h => {h.ETag = 'unquoted';}, 'etag-invalid'],
    ['length', h => {h['Content-Length'] = '5';}, 'length-mismatch'],
    ['missing-length', h => {delete h['Content-Length'];}, 'length-mismatch'],
    ['encoding', h => {h['Content-Encoding'] = 'gzip';}, 'encoding-unsupported']
];
for (const [name, change, reason] of cases) test('strict proof refusal identifies ' + name, async t => {
    const f = await fixture(t, (_req, res) => {const headers = validHeaders(); change(headers); res.writeHead(206, headers); res.end('0123');});
    await refusal(f.read(), reason, 206);
    assert.equal(f.reader.status().requests, 0);
});

for (const [expected, reason] of [[{etag: '"v0"', total: 8}, 'validator-changed'], [{etag: '"v1"', total: 9}, 'representation-changed']]) {
    test('expected proof mismatch: ' + reason, async t => {
        const f = await fixture(t, (_req, res) => {res.writeHead(206, validHeaders()); res.end('0123');});
        await refusal(f.read({expected}), reason, 206);
        assert.equal(f.rows[0]['if-match'], expected.etag);
    });
}

test('valid response and conditional reads retain exact bytes and request contract', async t => {
    const f = await fixture(t, (_req, res) => {res.writeHead(206, validHeaders()); res.end('0123');});
    const proof = await f.read();
    assert.deepEqual(proof, {bytes: Buffer.from('0123'), etag: '"v1"', total: 8});
    await f.read({expected: proof});
    assert.equal(f.rows[0].range, 'bytes=0-3');
    assert.equal(f.rows[0]['accept-encoding'], 'identity');
    assert.equal(f.rows[1]['if-match'], '"v1"');
});

test('source eligibility failures send no request and retain their fixed diagnostic', async t => {
    const f = await fixture(t, (_req, res) => {res.end();});
    for (const [options, reason] of [
        [{source: canary}, 'source-cross-origin'], [{source: 'file:///private/movie'}, 'source-not-http'],
        [{source: 'invalid'}, 'source-invalid'], [{source: f.origin.replace('http://', 'http://name:secret@') + '/media'}, 'source-credentials'],
        [{source: f.origin + '/media#private'}, 'source-invalid'], [{start: -1}, 'range-invalid'], [{length: 1048577}, 'range-invalid']
    ]) await refusal(f.read(options), reason, undefined, 'range-request-invalid');
    assert.equal(f.rows.length, 0);
});

test('timeout and cancellation settle only after request close', async t => {
    const f = await fixture(t, () => {}, 50);
    await refusal(f.read(), 'timeout', undefined, 'range-timeout');
    assert.equal(f.reader.status().requests, 0);
    const controller = new AbortController(), pending = f.read({signal: controller.signal});
    controller.abort();
    await refusal(pending, 'request-cancelled', undefined, 'range-cancelled');
    assert.equal(f.reader.status().requests, 0);
    await refusal(f.read({signal: controller.signal}), 'request-cancelled', undefined, 'range-cancelled');
});

test('interrupted responses and transport failures keep fixed classifications', async t => {
    const f = await fixture(t, (_req, res) => {res.writeHead(206, validHeaders()); res.flushHeaders(); res.write('0'); res.destroy();});
    await assert.rejects(f.read(), error => {
        assert(['response-interrupted', 'network-failed'].includes(error.preloadReason));
        assert.equal(f.reader.status().requests, 0);
        return true;
    });
    const g = await fixture(t, (req) => {req.socket.destroy();});
    await refusal(g.read(), 'network-failed', undefined, 'range-network-failed');
});
