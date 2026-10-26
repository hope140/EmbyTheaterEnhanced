'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {Readable} = require('node:stream');
const fixtures = require('../tools/shared-playback-cache/windows-fixtures.cjs');

test('paced source preserves the exact prefix when async iteration coalesces across its boundary', {timeout: 10000}, async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-paced-boundary-'));
    let server;
    t.after(async () => {await server?.close(); await fs.rm(root, {recursive: true, force: true});});
    const prefixBytes = 2097152, requestStart = 1288, requestBytes = prefixBytes + 65536;
    const source = Buffer.alloc(requestStart + requestBytes);
    for (let i = 0; i < source.length; i++) source[i] = i & 255;
    await fs.writeFile(path.join(root, 'A.bin'), source);
    const events = [];
    const coalescingReadStream = (_file, {start, end}) => {
        async function* chunks() {
            for (let at = start; at <= end; at += 10000) yield source.subarray(at, Math.min(end + 1, at + 10000));
        }
        return Readable.from(chunks(), {objectMode: false, highWaterMark: 16384});
    };
    server = await fixtures.__testOnlyCreateMediaServer(root, {A: {file: 'A.bin', size: source.length, etag: '"synthetic"'}},
        fixtures.USER_AGENT, (type, row) => events.push({type, ...row}),
        {chunkBytes: 16384, chunkDelayMs: 8, firstByteDelayMs: 20, prefixBytes, gapBytes: 262144}, coalescingReadStream);
    const controller = new AbortController();
    t.signal.addEventListener('abort', () => controller.abort(), {once: true});
    const response = await fetch(server.origin + '/Videos/A/stream.avi', {
        headers: {'User-Agent': fixtures.USER_AGENT, Range: `bytes=${requestStart}-${requestStart + requestBytes - 1}`}, signal: controller.signal
    });
    assert.equal(response.status, 206);
    const received = [];
    const reader = response.body.getReader();
    try {
        let receivedBytes = 0;
        while (receivedBytes < prefixBytes) {
            const result = await reader.read();
            assert.equal(result.done, false, 'paced response must remain available until the complete bounded prefix arrives');
            const part = Buffer.from(result.value); received.push(part); receivedBytes += part.length;
        }
        assert.equal(receivedBytes, prefixBytes);
    } finally {
        controller.abort();
        await reader.cancel().catch(() => {});
    }
    const closeDeadline = Date.now() + 1000;
    while (!events.some(row => row.type === 'media-close') && Date.now() < closeDeadline) await new Promise(resolve => setTimeout(resolve, 5));
    const body = Buffer.concat(received);
    assert.equal(body.length, prefixBytes, 'the paced prefix should include bytes up to its exact boundary');
    assert.deepEqual(body, source.subarray(requestStart, requestStart + prefixBytes));
    const closed = events.find(row => row.type === 'media-close');
    assert(closed && !closed.complete, 'a request beyond the paced prefix remains open until cancellation');
    assert.equal(closed.streamReadBytes, prefixBytes, 'source-read accounting stops at the actual bounded read end');

    const short = await fetch(server.origin + '/Videos/A/stream.avi', {
        headers: {'User-Agent': fixtures.USER_AGENT, Range: 'bytes=0-999'}
    });
    assert.equal(short.status, 206);
    assert.deepEqual(Buffer.from(await short.arrayBuffer()), source.subarray(0, 1000));
    const shortCloseDeadline = Date.now() + 1000;
    while (!events.some(row => row.type === 'media-close' && row.requestId === 2) && Date.now() < shortCloseDeadline)
        await new Promise(resolve => setTimeout(resolve, 5));
    const shortClose = events.find(row => row.type === 'media-close' && row.requestId === 2);
    assert(shortClose?.complete, 'a complete short range ends naturally');
    assert.equal(shortClose.streamReadBytes, 1000);
    assert.equal(server.snapshot().activeMediaResponses, 0);
    const stopped = await server.close(); server = null;
    assert.equal(stopped.activeMediaResponses, 0);
    assert.equal(stopped.mediaSockets, 0);
    assert.equal(stopped.heldRequests, 0);
});
