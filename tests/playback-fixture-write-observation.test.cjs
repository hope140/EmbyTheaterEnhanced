'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const {EventEmitter} = require('node:events');
const hidden = require('../tools/playback-range-windows-hidden.cjs');
const edl = require('../tools/playback-buffer-edl-probe.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function settle(server) {const end = Date.now() + 3000; while (!edl.physicalClosed(server.snapshot()) || server.pendingWrites()) {if (Date.now() >= end) throw Error('owned-write-observation-timeout'); await delay(10);}}
test('close does not fabricate missing callbacks and late callbacks cannot rewrite the at-close snapshot', () => {
    const response = new EventEmitter(), callbacks = []; response.write = (chunk, encoding, callback) => {callbacks.push(callback); return false;};
    const row = {}; hidden.measureWrites(response, row); let forwarded = 0;
    assert.equal(response.write(Buffer.alloc(3), () => {forwarded++;}), false);
    response.write(Buffer.alloc(5), () => {forwarded++;}); callbacks[0]();
    response.emit('close'); const atClose = JSON.stringify(row.closedWriteSnapshot);
    assert.equal(row.pendingWriteCallbacks, 1); assert.deepEqual(row.flushedRanges, [[0, 3]]);
    assert.deepEqual(row.pendingWriteRanges, [[3, 8]]); assert.equal(row.failedWriteCallbacks, 0);
    callbacks[1](Error('synthetic-cancel')); callbacks[1](); response.emit('close');
    assert.equal(forwarded, 2); assert.equal(row.pendingWriteCallbacks, 0); assert.equal(row.lateFailedCallbacks, 1);
    assert.equal(JSON.stringify(row.closedWriteSnapshot), atClose); assert.deepEqual(row.flushedRanges, [[0, 3]]);
});
test('only a real late success adds a confirmed range, preserving closed unknown history', () => {
    const response = new EventEmitter(); let complete; response.write = (chunk, encoding, callback) => {complete = callback; return true;};
    const row = {}; hidden.measureWrites(response, row); response.write(Buffer.alloc(8)); response.emit('close');
    const before = JSON.stringify(row.closedWriteSnapshot); assert.deepEqual(row.flushedRanges, []);
    complete(); complete(); assert.deepEqual(row.flushedRanges, [[0, 8]]); assert.equal(row.lateSuccessfulCallbacks, 1);
    assert.equal(row.pendingWriteCallbacks, 0); assert.equal(JSON.stringify(row.closedWriteSnapshot), before);
});
test('owned loopback aborted response can flush nonzero body while finish remains false', {timeout: 5000}, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-write-observation-'));
    const size = 32 * 1024 * 1024; fs.writeFileSync(path.join(root, 'A.avi'), Buffer.alloc(size, 0x5a));
    const server = await hidden.fixtureServer({out: root, fixtures: [{file: 'A.avi', size, etag: '"synthetic-transport"'}]}, 0, {measureWrites: true});
    t.after(async () => {await server.close(); await fs.promises.rm(root, {recursive: true, force: true, maxRetries: 3, retryDelay: 10});});
    let received = 0, aborted = false;
    await new Promise((resolve, reject) => {
        const request = http.get(server.origin + '/Videos/A/stream.avi', response => {
            response.on('data', chunk => {received += chunk.length; if (received >= 262144) {aborted = true; response.destroy();}});
            response.once('close', resolve); response.once('error', error => {if (error.code !== 'ECONNRESET') reject(error);});
        }); request.once('error', error => {if (!aborted || error.code !== 'ECONNRESET') reject(error);});
    });
    await settle(server); const partial = server.rows[0];
    assert(received > 0 && received < size); assert.equal(partial.finished, false);
    assert(partial.flushedRanges.length > 0); assert.equal(partial.pendingWriteCallbacks, 0);
    const result = edl.network([partial], [[0, 65536]], size);
    assert.equal(result.completedSavedPayloadBytes, 0); assert(result.callbackFlushedSavedPayloadBytes > 0);
    assert.equal(result.transferAssessment, 'SAVED_PAYLOAD_FLUSHED_TO_UNDERLYING_SYSTEM');
    assert.equal(result.clientConsumption, 'NOT_MEASURED');
    t.diagnostic(JSON.stringify({scope: 'owned-HTTP-test-client-NOT-mpv', received, scheduled: partial.bytesScheduled, submitted: partial.bytesSubmitted,
        callbackFlushed: partial.flushedRanges.reduce((n, [a, b]) => n + b - a, 0), responseFinished: partial.finished}));
    await new Promise((resolve, reject) => {const request = http.get(server.origin + '/Videos/A/stream.avi', {headers: {Range: 'bytes=0-131071'}}, response => {
        response.resume(); response.once('end', resolve); response.once('error', reject);
    }); request.once('error', reject);});
    await settle(server); const full = server.rows[1]; assert(full.finished);
    assert.equal(full.flushedRanges.reduce((n, [a, b]) => n + b - a, 0), 131072);
});
test('failed or pending write callbacks are never counted as confirmed payload', () => {
    const base = {method: 'GET', start: 80, bytesScheduled: 40, finished: false, writeMeasurement: true,
        bytesSubmitted: 40, pendingWriteCallbacks: 0, failedWriteCallbacks: 1, flushedRanges: [], writeMeasurementOverflow: false};
    const result = edl.network([base], [[80, 120]], 200);
    assert.equal(result.callbackFlushedSavedPayloadBytes, 0); assert.equal(result.failedWriteCallbacks, 1);
    assert.equal(result.transferAssessment, 'NO_SAVED_PAYLOAD_SUCCESSFUL_CALLBACK_OBSERVED');
    assert.throws(() => edl.network([{...base, pendingWriteCallbacks: 1}], [[80, 120]], 200), /export-edl-input/);
    assert.throws(() => edl.network([{...base, writeMeasurementOverflow: true}], [[80, 120]], 200), /export-edl-input/);
    const old = edl.network([{method: 'GET', start: 80, bytesScheduled: 40, finished: false}], [[80, 120]], 200);
    assert.equal(old.writeCallbacksMeasured, false); assert.equal(old.callbackFlushedSavedPayloadBytes, null);
});
test('closed missing callback retains unknown payload while open missing callback remains a failure', () => {
    const row = {method: 'GET', start: 80, bytesScheduled: 40, finished: false, writeMeasurement: true, closed: true,
        bytesSubmitted: 40, pendingWriteCallbacks: 1, failedWriteCallbacks: 0, flushedRanges: [], pendingWriteRanges: [[0, 40]], writeMeasurementOverflow: false};
    const result = edl.network([row], [[80, 120]], 200);
    assert.equal(result.callbackUnknownSavedPayloadBytes, 40); assert.equal(result.callbackObservationsComplete, false);
    assert.equal(result.transferAssessment, 'SAVED_PAYLOAD_DELIVERY_UNKNOWN_AFTER_CLOSE');
    assert.equal(result.failedWriteCallbacks, 0); assert.equal(result.callbackFlushedSavedPayloadBytes, 0);
    assert.throws(() => edl.network([{...row, closed: false}], [[80, 120]], 200), /export-edl-input/);
});
