'use strict';
// No currently attested date capability exists. Dates are not production validators.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createReader} = require('../src/electronapp/enhanced/playback-range-http');
const {identityKey} = require('../src/electronapp/enhanced/playback-range-identity');
const identity = {serverId: 'server', serverOrigin: 'https://emby.invalid', accountId: 'account', itemId: 'episode', mediaSourceId: 'source', representation: 'mapped-file'};
const LM = 'Mon, 01 Jan 2024 00:00:00 GMT', DATE = 'Mon, 01 Jan 2024 00:01:00 GMT';
async function fixture(t, settings = {}) {
    const rows = [], sockets = new Set(), mode = {status: 206, headers: {}};
    const server = http.createServer((req, res) => {
        rows.push(req.headers); res.sendDate = false;
        const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        const start = match ? +match[1] : 0, end = match ? +match[2] : 3;
        const body = Buffer.alloc(16, rows.length < 3 ? 'A' : 'B');
        const headers = {'Content-Range': `bytes ${start}-${end}/16`, 'Content-Length': end-start+1,
            'Last-Modified': settings.lastModified || LM, Date: settings.date || DATE, ...mode.headers};
        for (const key of Object.keys(headers)) if (headers[key] === undefined) delete headers[key];
        res.writeHead(mode.status, headers); res.end(body.subarray(start, end+1));
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const origin = 'http://127.0.0.1:' + server.address().port, reader = createReader({timeoutMs: 1000});
    t.after(async () => {
        await reader.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
        assert.equal(sockets.size, 0); assert.equal(reader.status().requests, 0);
    });
    return {rows, mode, read: options => reader.read({source: origin+'/synthetic', origin, start: 0, length: 4, ...options})};
}
async function refused(f, reason, options) {
    await assert.rejects(f.read(options), error => {
        assert.equal(error.preloadReason, reason); assert.doesNotMatch(error.message, /GMT|synthetic|PRIVATE_CANARY/); return true;
    });
}
test('date-only HTTP metadata is refused even with an old date gap, matching size and the former enable flag', async t => {
    const f = await fixture(t);
    await refused(f, 'date-capability-unproven', {allowLastModified: true, expectedTotal: 16, dateCapabilityVerified: true});
    assert.equal(f.rows.length, 1);
    assert.equal(f.rows[0]['if-range'], undefined); assert.equal(f.rows[0]['if-unmodified-since'], undefined);
});
test('the two-clock/second-resolution mutation counterexample stops at the first probe', async t => {
    const now = Math.floor(Date.now()/1000)*1000;
    const f = await fixture(t, {lastModified: new Date(now).toUTCString(), date: new Date(now+120000).toUTCString()});
    let supplied = 0;
    await assert.rejects((async () => {
        const proof = await f.read({start: 0, length: 1, allowLastModified: true, expectedTotal: 16}); supplied += proof.bytes.length;
        supplied += (await f.read({start: 0, length: 8, expected: proof})).bytes.length;
        supplied += (await f.read({start: 8, length: 8, expected: proof})).bytes.length;
    })(), error => error.preloadReason === 'date-capability-unproven');
    assert.equal(supplied, 0); assert.equal(f.rows.length, 1, 'no second response can be joined to the first');
});
test('a synthetic date proof cannot acquire a cache identity or start conditional range reads', async t => {
    const dateProof = {lastModified: LM, date: DATE, total: 16};
    assert.throws(() => identityKey(identity, dateProof), /range-identity-invalid/);
    const f = await fixture(t);
    await refused(f, 'date-capability-unproven', {expected: dateProof, allowLastModified: true, expectedTotal: 16});
    assert.equal(f.rows.length, 0);
});
test('strong ETag still works with dates present, and missing ETag cannot be upgraded by a signed identity', async t => {
    const f = await fixture(t); f.mode.headers.ETag = '"v1"';
    const proof = await f.read(); assert.equal(proof.etag, '"v1"'); assert(identityKey(identity, proof));
    await f.read({expected: proof}); assert.equal(f.rows[1]['if-match'], '"v1"');
    delete f.mode.headers.ETag; await refused(f, 'date-capability-unproven', {expected: proof, allowLastModified: true});
});
for (const [status, reason] of [[200, 'status-not-206'], [412, 'validator-changed']]) test('unusable full/precondition response is refused: '+status, async t => {
    const f = await fixture(t); f.mode.status = status; await refused(f, reason, {allowLastModified: true});
});
test('weak and malformed entity tags do not become date capabilities', async t => {
    const f = await fixture(t);
    for (const [etag, reason] of [['W/"v1"', 'etag-weak'], ['invalid', 'etag-invalid']]) {
        f.mode.headers.ETag = etag; await refused(f, reason, {allowLastModified: true, expectedTotal: 16});
    }
});
test('no ETag and no date still reports the original missing-validator reason', async t => {
    const f = await fixture(t); f.mode.headers['Last-Modified'] = undefined;
    await refused(f, 'etag-missing', {allowLastModified: true, expectedTotal: 16});
});
