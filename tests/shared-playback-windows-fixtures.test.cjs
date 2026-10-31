'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const fixtures = require('../tools/shared-playback-cache/windows-fixtures.cjs');
const cd2 = require('../src/electronapp/enhanced/cd2-service');

async function ownedRoot(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-windows-fixtures-'));
    t.after(() => fs.rm(root, {recursive: true, force: true}));
    return root;
}
async function hashFile(file) {
    const hash = crypto.createHash('sha256'); for await (const part of require('node:fs').createReadStream(file)) hash.update(part); return hash.digest('hex');
}

test('streamed deterministic AVI fixtures are decodable RIFF layouts with A16/B8/C8 metadata', async t => {
    const root = await ownedRoot(t), plan = await fixtures.generateFixtures(root);
    assert.deepEqual(plan.fixtures.map(row => row.durationSeconds), [16, 8, 8]);
    assert.deepEqual(plan.fixtures.map(row => row.fps), [12, 24, 24]);
    assert.deepEqual(plan.fixtures.map(row => row.audio), ['none', 'none', 'none']);
    assert.deepEqual(plan.fixtures.map(row => row.width), [320, 320, 320]);
    assert(plan.fixtures.every(row => row.size < 20 * 1048576));
    assert.equal(new Set(plan.fixtures.map(row => row.sha256)).size, 3);
    for (const row of plan.fixtures) {
        const head = Buffer.alloc(12), handle = await fs.open(path.join(root, row.file), 'r');
        try {assert.equal((await handle.read(head, 0, head.length, 0)).bytesRead, head.length);} finally {await handle.close();}
        assert.equal(head.toString('ascii', 0, 4), 'RIFF'); assert.equal(head.toString('ascii', 8, 12), 'AVI ');
        assert.equal(head.readUInt32LE(4), row.size - 8); assert.equal(await hashFile(path.join(root, row.file)), row.sha256);
        assert.equal(row.encoding, 'uncompressed-dib-paletted-8bit');
    }
    const rerun = await ownedRoot(t);
    const second = await fixtures.generateFixtures(rerun);
    assert.deepEqual(second.fixtures.map(row => row.sha256), plan.fixtures.map(row => row.sha256));
});

test('actual loopback gRPC CD2 resolution returns range-capable owned AVI sources', async t => {
    const root = await ownedRoot(t), events = [], record = (type, data) => events.push({type, ...data});
    const running = await fixtures.createWindowsFixtures({root, record});
    let service;
    t.after(async () => {
        service?.close();
        await running.close();
    });
    const a = await (await fetch(running.origin + '/Users/anonymous/Items/A')).json();
    const b = await (await fetch(running.origin + '/Users/anonymous/Items/B')).json();
    assert.equal(a.RunTimeTicks, 160000000); assert.equal(b.RunTimeTicks, 80000000);
    assert.equal(a.MediaSources[0].Path, 'X:\\Media\\A.avi');
    assert.equal(a.MediaSources[0].Container, 'strm');

    const rule = {id: 'synthetic-cloud', sourcePrefix: 'X:\\Media', cloudPrefix: '/cloud/media', enabled: true, originState: 'USER'};
    service = cd2.createService({config: {enabled: true, origin: cd2.parseOrigin(running.cd2Endpoint), token: 'synthetic-only-token', rules: [rule], directUrlEnabled: true}});
    const startedAt = Date.now();
    const resolved = await service.resolve({requestId: 'windows-fixture', ruleId: rule.id, mode: 'direct', candidates: ['X:\\Media\\A.avi'],
        deadlineAt: startedAt + 3000, refreshDeadlineAt: startedAt + 4000});
    assert.equal(resolved.status, 'hit'); assert.equal(resolved.sourceKind, 'direct-url');
    assert.equal(resolved.source, running.mediaOrigin + '/Videos/A/stream.avi?fixture=synthetic');
    assert.equal(resolved.requestOptions.userAgent, fixtures.USER_AGENT);

    const response = await fetch(resolved.source, {headers: {Range: 'bytes=0-4095', 'User-Agent': resolved.requestOptions.userAgent}});
    assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), `bytes 0-4095/${running.files.A.size}`);
    const body = Buffer.from(await response.arrayBuffer()); assert.equal(body.length, 4096);
    assert(events.some(row => row.type === 'cd2-rpc' && row.method === 'FindFileByPath' && row.item === 'A'));
    assert(events.some(row => row.type === 'cd2-rpc' && row.method === 'GetDownloadUrlPath' && row.item === 'A'));
    assert(events.some(row => row.type === 'media-close' && row.item === 'A' && row.complete && row.streamReadBytes === 4096));
    service.close(); service = null;
    const close = await running.close();
    assert.deepEqual(close, {activeMediaResponses: 0, mediaSockets: 0, heldRequests: 0, openedRequests: 1, grpcStopped: true});
});

test('fresh source startup verifies files rather than regenerating or replacing them', async t => {
    const root = await ownedRoot(t), plan = await fixtures.generateFixtures(root), firstHash = plan.fixtures[0].sha256;
    const first = await fixtures.startWindowsSources({plan}); await first.close();
    const second = await fixtures.startWindowsSources({plan});
    t.after(() => second.close());
    assert.match(second.origin, /^http:\/\/127\.0\.0\.1:/);
    assert.match(second.mediaOrigin, /^http:\/\/127\.0\.0\.1:/);
    assert.match(second.cd2Endpoint, /^http:\/\/127\.0\.0\.1:/);
    assert.equal(await hashFile(path.join(root, 'A.avi')), firstHash);
});

test('held B range sends one byte, closes cleanly on cancel, and cannot write after close', async t => {
    const root = await ownedRoot(t), events = [], record = (type, data) => events.push({type, ...data});
    const running = await fixtures.createWindowsFixtures({root, record});
    t.after(() => running.close());
    const agent = {'User-Agent': fixtures.USER_AGENT};
    const probe = await fetch(running.mediaOrigin + '/Videos/B/stream.avi', {headers: {...agent, Range: 'bytes=0-0'}});
    assert.equal(probe.status, 206); assert.equal((await probe.arrayBuffer()).byteLength, 1);
    assert.equal(events.some(row => row.type === 'media-held'), false, 'a one-byte range probe must not be held');

    running.setHoldNext('B');
    const controller = new AbortController();
    const response = await fetch(running.mediaOrigin + '/Videos/B/stream.avi', {headers: {...agent, Range: 'bytes=0-8191'}, signal: controller.signal});
    assert.equal(response.status, 206);
    const reader = response.body.getReader(), first = await reader.read();
    assert.equal(first.value.byteLength, 1);
    const held = events.find(row => row.type === 'media-held'); assert(held && held.item === 'B' && held.start === 0 && held.end === 8191);
    assert.equal(running.snapshot().heldRequests, 1); assert.equal(running.snapshot().openedRequests, 2);
    controller.abort(); await reader.cancel().catch(() => {});
    const deadline = Date.now() + 2000;
    while (running.snapshot().activeMediaResponses && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(running.snapshot().activeMediaResponses, 0);
    assert.equal(await running.releaseHeld(), 0);
    const closed = events.find(row => row.type === 'media-close' && row.requestId === held.requestId);
    assert.equal(closed.actualResponseClosed, true); assert.equal(closed.complete, false); assert.equal(closed.streamReadBytes, 1);
    const late = events.find(row => row.type === 'media-late-release-attempt' && row.requestId === held.requestId);
    assert.equal(late.actualResponseClosed, true); assert.equal(late.latewriteacceptedbytes, 0);
    const final = running.snapshot(); assert.equal(final.heldRequests, 0);
    assert.equal(final.openedRequests, 2);
    const stopped = await running.close(); assert.equal(stopped.activeMediaResponses, 0); assert.equal(stopped.mediaSockets, 0);
    assert.equal(stopped.heldRequests, 0); assert.equal(stopped.grpcStopped, true);
});
