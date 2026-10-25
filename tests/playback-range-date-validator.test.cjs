'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {createHash} = require('node:crypto');
const {httpDate, dateRefusal, validator, MIN_DATE_GAP_MS} = require('../src/electronapp/enhanced/playback-range-validator');
const {identityKey} = require('../src/electronapp/enhanced/playback-range-identity');
const {createReader} = require('../src/electronapp/enhanced/playback-range-http');
const BASE = Date.UTC(2024, 0, 1), stamp = seconds => new Date(BASE + seconds * 1000).toUTCString();
const LM = stamp(0), DATE = stamp(60), identity = {serverId: 'server', serverOrigin: 'https://emby.invalid', accountId: 'account', itemId: 'episode', mediaSourceId: 'source', representation: 'main-resource-representation'};
const proof = changes => ({lastModified: LM, date: DATE, total: 64, ...changes});

test('HTTP dates require canonical IMF-fixdate and preserve exact seconds', () => {
    assert.equal(httpDate(LM), BASE);
    assert.equal(httpDate('Thu, 01 Jan 1970 00:00:00 GMT'), 0);
    assert.equal(httpDate(stamp(61)), BASE + 61000);
});

test('strict dates refuse invalid February, weekday, loose parsing, duplicate values and non-GMT text', () => {
    for (const value of ['Wed, 31 Feb 2021 00:00:00 GMT', 'Tue, 01 Jan 2024 00:00:00 GMT', '2024-01-01T00:00:00Z',
        'Mon, 1 Jan 2024 00:00:00 GMT', 'Mon, 01 Jan 2024 00:00:00 UTC', 'Mon, 01 Jan 2024 00:00:60 GMT',
        LM + ', ' + LM, ' ' + LM, LM + ' ', undefined, null, BASE]) assert.equal(httpDate(value), null, String(value));
});

test('the conservative strong-date qualification rejects 59 seconds and accepts 60', () => {
    assert.equal(MIN_DATE_GAP_MS, 60000);
    assert.equal(dateRefusal(LM, stamp(59), BASE + 60000), 'date-validator-unsafe');
    assert.equal(dateRefusal(LM, stamp(60), BASE + 60000), null);
    assert.equal(dateRefusal(stamp(61), stamp(60), BASE + 60000), 'date-validator-unsafe');
});

test('missing Last-Modified and Date keep distinct fixed refusal reasons', () => {
    assert.equal(dateRefusal(undefined, DATE, BASE + 60000), 'last-modified-missing');
    assert.equal(dateRefusal('', DATE, BASE + 60000), 'last-modified-missing');
    assert.equal(dateRefusal(LM, undefined, BASE + 60000), 'response-date-missing');
    assert.equal(dateRefusal(LM, '', BASE + 60000), 'response-date-missing');
    assert.equal(dateRefusal('PRIVATE_CANARY', DATE, BASE + 60000), 'date-validator-invalid');
});

test('future response dates have a finite five-minute skew bound and invalid clocks fail closed', () => {
    assert.equal(dateRefusal(LM, stamp(300), BASE), null);
    assert.equal(dateRefusal(LM, stamp(301), BASE), 'date-validator-unsafe');
    for (const now of [NaN, Infinity, '2024', 1.5]) assert.equal(dateRefusal(LM, DATE, now), 'date-validator-unsafe');
});

test('strong ETag remains preferred without requiring usable date metadata', () => {
    assert.deepEqual(validator({etag: '"v1"', lastModified: 'bad', date: 'bad'}), {kind: 'etag', value: '"v1"'});
    assert.deepEqual(validator(proof()), {kind: 'last-modified', value: LM});
});

test('present weak, empty or malformed ETag cannot downgrade to otherwise qualified dates', () => {
    for (const etag of ['W/"v1"', '', 'unquoted', '""', null]) assert.equal(validator(proof({etag})), null, String(etag));
});

test('typed identity isolates date values and validator kinds, while Date itself is not a version key', () => {
    const dateKey = identityKey(identity, proof());
    assert.equal(identityKey(identity, proof({date: stamp(120)})), dateKey);
    assert.notEqual(identityKey(identity, proof({lastModified: stamp(1), date: stamp(120)})), dateKey);
    assert.notEqual(identityKey(identity, {etag: '"last-modified"', total: 64}), dateKey);
    assert.notEqual(identityKey(identity, proof({total: 65})), dateKey);
    assert.throws(() => identityKey(identity, proof({etag: ''})), /range-identity-invalid/);
});

test('the existing strong ETag identity bytes stay unchanged', () => {
    const fields = ['serverId', 'serverOrigin', 'accountId', 'itemId', 'mediaSourceId', 'representation'];
    const expected = createHash('sha256').update(JSON.stringify(fields.map(field => identity[field]).concat('"v1"', 64))).digest('hex');
    assert.equal(identityKey(identity, {etag: '"v1"', total: 64}), expected);
});

async function fixture(t) {
    const rows = [], sockets = new Set(), mode = {headers: {}, status: 206};
    const server = http.createServer((req, res) => {
        rows.push(req.headers); res.sendDate = false;
        const headers = {'Content-Range': 'bytes 0-3/64', 'Content-Length': '4', 'Last-Modified': LM, Date: DATE, ...mode.headers};
        for (const key of Object.keys(headers)) if (headers[key] === undefined) delete headers[key];
        res.writeHead(mode.status, headers); res.end('0123');
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    const origin = 'http://127.0.0.1:' + server.address().port, reader = createReader({timeoutMs: 1000});
    t.after(async () => {
        await reader.close();
        const closes = [...sockets].map(socket => new Promise(resolve => socket.once('close', resolve)));
        server.closeAllConnections(); await Promise.all(closes.concat(new Promise(resolve => server.close(resolve))));
        assert.equal(sockets.size, 0); assert.equal(reader.status().requests, 0);
    });
    return {mode, rows, reader, read: changes => reader.read({source: origin + '/synthetic-media', origin, start: 0, length: 4, allowLastModified: true, expectedTotal: 64, ...changes})};
}
async function refused(f, reason, changes) {
    await assert.rejects(f.read(changes), error => {
        assert.equal(error.message, 'range-response-invalid'); assert.equal(error.preloadReason, reason); assert.equal(error.httpStatus, f.mode.status);
        assert.doesNotMatch(error.message, /synthetic-media|private|GMT/); return true;
    });
    assert.equal(f.reader.status().requests, 0, 'refusal waits for physical request close');
}

test('date-only 206 returns a real typed proof and sends both date conditions, never If-Match', async t => {
    const f = await fixture(t), first = await f.read();
    assert.deepEqual(first, {bytes: Buffer.from('0123'), lastModified: LM, date: DATE, total: 64});
    assert.equal(Object.hasOwn(first, 'etag'), false);
    f.mode.headers.Date = stamp(120); const second = await f.read({expected: first});
    assert.equal(second.date, stamp(120)); assert.equal(second.lastModified, LM);
    assert.equal(identityKey(identity, first), identityKey(identity, second));
    assert.equal(f.rows[0]['if-range'], undefined); assert.equal(f.rows[0]['if-unmodified-since'], undefined);
    assert.equal(f.rows[1]['if-range'], LM); assert.equal(f.rows[1]['if-unmodified-since'], LM); assert.equal(f.rows[1]['if-match'], undefined);
    assert.equal(f.rows[1].range, 'bytes=0-3'); assert.equal(f.rows[1]['accept-encoding'], 'identity');
});

test('ordinary reader callers still refuse no ETag even when dates and size are usable', async t => {
    const f = await fixture(t); await refused(f, 'etag-missing', {allowLastModified: false});
});

test('explicit date permission without main-proven safe positive total remains unavailable', async t => {
    const f = await fixture(t);
    for (const expectedTotal of [undefined, 0, -1, 64.5, '64', Number.MAX_SAFE_INTEGER + 1]) await refused(f, 'file-size-unavailable', {expectedTotal});
});

test('Find expected size must match the actual Content-Range total', async t => {
    const f = await fixture(t); await refused(f, 'representation-changed', {expectedTotal: 65});
});

test('strong ETag retains its original path, even with date permission but no size and bad dates', async t => {
    const f = await fixture(t); f.mode.headers = {ETag: '"v1"', Date: 'bad', 'Last-Modified': 'bad'};
    const first = await f.read({expectedTotal: undefined});
    assert.deepEqual(first, {bytes: Buffer.from('0123'), etag: '"v1"', total: 64});
    await f.read({expected: first, expectedTotal: undefined});
    assert.equal(f.rows[1]['if-match'], '"v1"'); assert.equal(f.rows[1]['if-range'], undefined); assert.equal(f.rows[1]['if-unmodified-since'], undefined);
});

test('HTTP weak, empty and invalid ETag responses never enter the date branch', async t => {
    const f = await fixture(t);
    for (const [etag, reason] of [['W/"v1"', 'etag-weak'], ['', 'etag-invalid'], ['unquoted', 'etag-invalid']]) {
        f.mode.headers.ETag = etag; await refused(f, reason);
    }
});

test('missing Last-Modified response remains refused with usable Date and size', async t => {
    const f = await fixture(t); f.mode.headers['Last-Modified'] = undefined; await refused(f, 'last-modified-missing');
});

test('missing Date response remains refused with usable Last-Modified and size', async t => {
    const f = await fixture(t); f.mode.headers.Date = undefined; await refused(f, 'response-date-missing');
});

test('malformed or same-second response dates do not qualify', async t => {
    const f = await fixture(t);
    f.mode.headers.Date = 'Tue, 01 Jan 2024 00:01:00 GMT'; await refused(f, 'date-validator-invalid');
    f.mode.headers.Date = LM; await refused(f, 'date-validator-unsafe');
    f.mode.headers.Date = stamp(59); await refused(f, 'date-validator-unsafe');
});

test('a future-date anomaly is rejected without relying on local clock mutation', async t => {
    const f = await fixture(t); f.mode.headers.Date = new Date(Date.now() + 600000).toUTCString();
    await refused(f, 'date-validator-unsafe');
});

test('an origin ignoring date conditions still cannot change Last-Modified', async t => {
    const f = await fixture(t), first = await f.read();
    f.mode.headers = {'Last-Modified': stamp(1), Date: stamp(120)};
    await refused(f, 'validator-changed', {expected: first});
});

test('an origin ignoring date conditions still cannot change representation size', async t => {
    const f = await fixture(t), first = await f.read(); f.mode.headers['Content-Range'] = 'bytes 0-3/65';
    await refused(f, 'representation-changed', {expected: first});
});

test('an active date proof cannot silently change into an ETag proof', async t => {
    const f = await fixture(t), first = await f.read(); f.mode.headers.ETag = '"new-etag"';
    await refused(f, 'validator-changed', {expected: first});
});

test('an active ETag proof cannot silently downgrade into a qualified date proof', async t => {
    const f = await fixture(t); f.mode.headers.ETag = '"v1"'; const first = await f.read(); delete f.mode.headers.ETag;
    await refused(f, 'validator-changed', {expected: first});
});

test('If-Range mismatch full responses remain rejected instead of mixing bytes', async t => {
    const f = await fixture(t), first = await f.read(); f.mode.status = 200;
    await refused(f, 'status-not-206', {expected: first});
});

test('If-Unmodified-Since precondition failures remain rejected', async t => {
    const f = await fixture(t), first = await f.read(); f.mode.status = 412;
    await refused(f, 'validator-changed', {expected: first});
});

test('date validators do not relax exact range, length or content encoding requirements', async t => {
    const f = await fixture(t);
    for (const [headers, reason] of [[{'Content-Range': 'bytes 1-4/64'}, 'range-invalid'], [{'Content-Length': '5'}, 'length-mismatch'], [{'Content-Encoding': 'gzip'}, 'encoding-unsupported']]) {
        f.mode.headers = headers; await refused(f, reason);
    }
});

test('duplicate physical singleton dates are refused instead of trusting Node header de-duplication', async t => {
    const f = await fixture(t);
    for (const name of ['Date', 'Last-Modified']) {
        const old = name === 'Date' ? DATE : LM;
        f.mode.headers[name] = [old, old];
        await refused(f, 'date-validator-invalid');
        delete f.mode.headers[name];
    }
});
