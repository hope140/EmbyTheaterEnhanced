'use strict';

// Real Electron Session I/O, but strictly synthetic loopback services. No NAS
// URL, user credentials or Chromium cookie values appear in the result.
const assert = require('node:assert/strict');
const net = require('node:net');

async function read(response) {
    const chunks = [];
    for await (const chunk of response.body) chunks.push(chunk);
    return Buffer.concat(chunks);
}
async function waitFor(check) {
    const deadline = Date.now() + 5000;
    while (!await check()) {
        if (Date.now() >= deadline) throw Object.assign(new Error('FIXTURE_DEADLINE'), {code: 'FIXTURE_DEADLINE'});
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}
function socketFor(address) {
    const u = new URL(address);
    assert.equal(u.hostname, '127.0.0.1');
    assert.equal(u.protocol, 'ws:');
    const socket = net.connect(Number(u.port), u.hostname);
    socket.on('error', () => {});
    const connected = new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    const closed = new Promise(resolve => socket.once('close', resolve));
    return {socket, connected, closed, path: u.pathname, host: u.host};
}
async function upgrade(address, {pending = false} = {}) {
    const handle = socketFor(address);
    await handle.connected;
    const response = new Promise((resolve, reject) => {
        let buffer = Buffer.alloc(0);
        const data = chunk => {
            buffer = Buffer.concat([buffer, chunk]);
            const end = buffer.indexOf('\r\n\r\n');
            if (end < 0) return;
            handle.socket.removeListener('data', data);
            /^HTTP\/1.1 101 /.test(buffer.toString()) ? resolve() : reject(new Error('WS_UPGRADE_FAILED'));
        };
        handle.socket.on('data', data);
        handle.socket.once('error', reject);
        handle.socket.once('close', () => reject(new Error('WS_CLOSED_BEFORE_UPGRADE')));
    });
    // Consume rejection even when intentionally closing an incomplete upgrade.
    response.catch(() => {});
    handle.socket.write('GET ' + handle.path + ' HTTP/1.1\r\nHost: ' + handle.host +
        '\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n');
    if (!pending) await response;
    return handle;
}
async function runElectronSmoke({controller, bridge, fixture, addProfile, authorizeProfile, removeProfile, stage = () => {}}) {
    for (const value of [fixture.profile.bootstrapUrl, fixture.profile.embyUrl, ...fixture.profile.externalMediaOrigins]) {
        const u = new URL(value);
        assert.equal(u.hostname, '127.0.0.1'); assert.equal(u.protocol, 'http:');
    }
    const handles = new Set(), leases = new Set();
    const lease = (id, input) => { const value = bridge.lease(id, input); leases.add(value); return value; };
    const ws = async (...args) => { const value = await upgrade(...args); handles.add(value); return value; };
    try {
        stage('BOOTSTRAP');
        const first = await addProfile();
        await authorizeProfile(first);
        await controller.verify(first.id);
        const isolated = await addProfile();
        await assert.rejects(controller.verify(isolated.id), error => error.code === 'FN_AUTH_REQUIRED');
        assert.equal((await isolated.session.cookies.get({url: fixture.profile.embyUrl})).length, 0);
        stage('HTTP_SESSION');
        const api = await controller.request(first.id, {path: 'api', headers: {'X-Emby-Token': 'synthetic-electron-canary'}});
        assert.deepEqual(JSON.parse((await read(api)).toString()), {fixture: true});
        const apiSeen = fixture.state.seen.at(-1).headers;
        assert.match(apiSeen.cookie, /FNFixture=/);
        assert.equal(apiSeen['x-emby-token'], 'synthetic-electron-canary');
        const media = lease(first.id, {path: 'media.bin'});
        const ranged = await fetch(media.url, {headers: {Range: 'bytes=11-97'}});
        assert.equal(ranged.status, 206);
        assert.equal(ranged.headers.get('content-range'), 'bytes 11-97/' + fixture.bytes.length);
        assert.equal(ranged.headers.get('set-cookie'), null);
        assert.deepEqual(Buffer.from(await ranged.arrayBuffer()), fixture.bytes.subarray(11, 98));
        const invalidRange = await fetch(media.url, {headers: {Range: 'bytes=9999999-'}});
        assert.equal(invalidRange.status, 416); await invalidRange.arrayBuffer();
        stage('REDIRECT_SEPARATION');
        const direct = lease(first.id, {path: 'direct', headers: {'X-Emby-Token': 'synthetic-electron-canary'}});
        assert.deepEqual(Buffer.from(await (await fetch(direct.url)).arrayBuffer()), fixture.bytes);
        assert.equal(fixture.state.externalRequests.length, 1);
        for (const key of ['cookie', 'authorization', 'x-emby-token', 'referer']) assert.equal(fixture.state.externalRequests[0][key], undefined);
        fixture.state.redirectSecret = fixture.cookie;
        await assert.rejects(controller.request(first.id, {path: 'direct', kind: 'media'}), error => error.code === 'CREDENTIAL_REDIRECT_BLOCKED');
        fixture.state.redirectSecret = null;
        assert.equal(fixture.state.externalRequests.length, 1);
        stage('WEBSOCKET_SESSION');
        const socketLease = lease(first.id, {path: 'ws', kind: 'websocket', headers: {'X-Emby-Token': 'synthetic-ws-canary'}});
        const active = await ws(socketLease.url);
        const upstreamWsId = fixture.state.seen.at(-1).connectionId;
        const wsSeen = fixture.state.seen.at(-1).headers;
        assert.match(wsSeen.cookie, /FNFixture=/);
        assert.equal(wsSeen['x-emby-token'], 'synthetic-ws-canary');
        // The fixture echoes raw tunnel bytes; this is not an Emby WS protocol
        // or a browser WebSocket application conformance test.
        const wire = Buffer.from([0x82, 0x83, 1, 2, 3, 4, 8, 10, 4]);
        const echoed = new Promise((resolve, reject) => {
            let value = Buffer.alloc(0);
            active.socket.on('data', chunk => { value = Buffer.concat([value, chunk]); if (value.length >= wire.length) resolve(value); });
            active.socket.once('error', reject);
        });
        active.socket.write(wire); assert.deepEqual(await echoed, wire);
        stage('CANCELLATION');
        const pending = await ws(lease(first.id, {path: 'ws-pending', kind: 'websocket'}).url, {pending: true});
        await waitFor(() => fixture.state.wsPendingEntered);
        pending.socket.destroy(); await pending.closed;
        await waitFor(() => fixture.state.wsPendingClosed);
        const cancel = new AbortController();
        const headers = controller.request(first.id, {path: 'headers-slow', signal: cancel.signal});
        const rejected = assert.rejects(headers, error => error.code === 'CANCELLED');
        await waitFor(() => fixture.state.headersPendingEntered);
        cancel.abort(); await rejected;
        await waitFor(() => fixture.state.headersPendingClosed);
        const stream = lease(first.id, {path: 'slow'});
        const streaming = await fetch(stream.url);
        const cancelledStreamId = fixture.state.streamSequence;
        const reader = streaming.body.getReader();
        assert.equal((await reader.read()).done, false);
        await reader.cancel();
        await waitFor(() => fixture.state.closedStreams.has(cancelledStreamId));
        stage('PROFILE_CLOSE');
        assert.equal(fixture.state.closedWebSockets.has(upstreamWsId), false);
        const closingStream = await fetch(stream.url);
        const closingStreamId = fixture.state.streamSequence;
        const closingReader = closingStream.body.getReader();
        assert.equal((await closingReader.read()).done, false);
        assert.equal(fixture.state.closedStreams.has(closingStreamId), false);
        await removeProfile(first.id);
        await active.closed;
        await waitFor(() => fixture.state.closedWebSockets.has(upstreamWsId));
        assert.equal(fixture.state.endedWebSockets.has(upstreamWsId), true);
        await waitFor(() => fixture.state.closedStreams.has(closingStreamId));
        await closingReader.cancel().catch(() => {});
        await waitFor(() => first.window.isDestroyed());
        assert.equal((await first.session.cookies.get({url: fixture.profile.embyUrl})).length, 0);
        const retired = await fetch(media.url); assert.equal(retired.status, 410); await retired.arrayBuffer();
        assert.equal((await isolated.session.cookies.get({url: fixture.profile.embyUrl})).length, 0);
        stage('EXPIRY');
        await authorizeProfile(isolated); await controller.verify(isolated.id);
        const expiredLease = lease(isolated.id, {path: 'media.bin'});
        fixture.state.expired = true;
        await assert.rejects(controller.request(isolated.id, {path: 'api'}), error => error.code === 'FN_AUTH_REQUIRED');
        assert.equal(controller.snapshot(isolated.id).state, 'needs-auth');
        const denied = await fetch(expiredLease.url); assert.equal(denied.status, 410); await denied.arrayBuffer();
        await removeProfile(isolated.id);
        assert.equal((await isolated.session.cookies.get({url: fixture.profile.embyUrl})).length, 0);
        return {bootstrap: true, isolatedSessions: true, httpSessionCookie: true, range206: true, range416: true,
            externalRedirectCredentialSeparation: true, credentialLocationRejected: true,
            websocketSessionCookie: true, websocketRawBytes: true, pendingWebSocketCancelled: true,
            pendingHeadersCancelled: true, streamCancelled: true, profileCloseClearsCookies: true,
            profileCloseRetiresSockets: true, profileCloseRetiresStreams: true, expiryRetiresLeases: true,
            realFNConnect: 'NOT_TESTED', nativeHelperPlayback: 'NOT_TESTED', hlsDash: 'NOT_SUPPORTED'};
    } finally {
        for (const value of handles) value.socket.destroy();
        for (const value of leases) value.revoke();
    }
}
module.exports = {runElectronSmoke, waitFor};
