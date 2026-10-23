'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {startLocalHarness} = require('../prototypes/fn-connect/companion/local-unix-harness.cjs');
const prefix = '/app/ete-fn-transport';
const linuxOnly = {skip: process.platform === 'win32' ? 'fnOS Unix-socket development harness requires Unix' : false, timeout: 5000};

async function fixture(t, handler, upgrade) {
    const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'ete-fn-harness-'));
    const sockets = new Set();
    const server = http.createServer(handler);
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {}); });
    if (upgrade) server.on('upgrade', upgrade);
    await new Promise(resolve => server.listen(path.join(root, 'upstream.sock'), resolve));
    let harness;
    t.after(async () => {
        await harness?.close();
        await new Promise(resolve => { server.close(resolve); for (const socket of sockets) socket.destroy(); });
        fs.rmSync(root, {recursive: true});
    });
    harness = await startLocalHarness({enabled: true, root, authorizeFixture: request => request.headers['x-fixture-allow'] === 'yes'});
    return harness;
}

function request(socketPath, url, {headers = {}, method = 'GET', body} = {}) {
    return new Promise((resolve, reject) => {
        const client = http.request({socketPath, agent: false, path: url, method, headers: {'X-Fixture-Allow': 'yes', ...headers}}, response => {
            const chunks = [];
            response.on('data', part => chunks.push(part));
            response.on('end', () => resolve({status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks)}));
            response.on('error', reject);
        });
        client.on('error', reject);
        client.end(body);
    });
}

test('Unix harness remains disabled without touching a target', async () => {
    await assert.rejects(startLocalHarness(), {code: 'HARNESS_DISABLED'});
    if (process.platform !== 'win32') {
        await assert.rejects(startLocalHarness({enabled: true, root: '/workspace'}), {code: 'PRIVATE_FIXTURE_ROOT_REQUIRED'});
    }
});

test('real Unix HTTP preserves Range/206/416 and separate Emby denial', linuxOnly, async t => {
    let calls = 0;
    const harness = await fixture(t, (incoming, outgoing) => {
        calls++;
        assert.equal(incoming.headers.cookie, undefined);
        assert.equal(incoming.headers['x-trim-userid'], undefined);
        if (incoming.method === 'POST') { outgoing.writeHead(401); outgoing.end(); return; }
        assert.equal(incoming.url, '/emby/media?item=synthetic');
        const valid = incoming.headers.range === 'bytes=4-7';
        outgoing.writeHead(valid ? 206 : 416, {'Content-Range': valid ? 'bytes 4-7/10' : 'bytes */10'});
        outgoing.end(valid ? '4567' : '');
    });
    const partial = await request(harness.socketPath, prefix + '/emby/media?item=synthetic',
        {headers: {Range: 'bytes=4-7', Cookie: 'synthetic-gateway-marker', 'X-Trim-Userid': '1000'}});
    assert.equal(partial.status, 206);
    assert.equal(partial.headers['content-range'], 'bytes 4-7/10');
    assert.equal(partial.body.toString(), '4567');
    assert.equal((await request(harness.socketPath, prefix + '/emby/media?item=synthetic')).status, 416);
    assert.equal((await request(harness.socketPath, prefix + '/emby/login', {method: 'POST', body: 'synthetic'})).status, 401);
    assert.equal(calls, 3);
});

test('real Unix gateway denies missing fixture authorization and mapping escape', linuxOnly, async t => {
    let calls = 0;
    const harness = await fixture(t, (req, res) => { calls++; res.end(); });
    assert.equal((await request(harness.socketPath, prefix + '/emby', {headers: {'X-Fixture-Allow': 'no'}})).status, 403);
    assert.equal((await request(harness.socketPath, '/outside')).status, 403);
    assert.equal((await request(harness.socketPath, prefix + '/emby', {headers: {'Set-Cookie': ['a=x', 'b=y']}})).status, 403);
    assert.equal(calls, 0);
});

test('real Unix WebSocket upgrade and binary frames traverse the owned connection', linuxOnly, async t => {
    const frame = Buffer.from([0x82, 0x02, 0x6f, 0x6b]);
    const clientFrame = Buffer.from([0x82, 0x82, 0, 0, 0, 0, 0x6f, 0x6b]);
    const harness = await fixture(t, (req, res) => res.end(), (req, socket, head) => {
        assert.equal(req.url, '/emby/socket');
        assert.equal(req.headers['sec-websocket-key'], 'dGhlIHNhbXBsZSBub25jZQ==');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n');
        let received = head;
        socket.on('data', bytes => {
            received = Buffer.concat([received, bytes]);
            if (received.length >= clientFrame.length) { assert.deepEqual(received, clientFrame); socket.write(frame); }
        });
    });
    const client = net.connect(harness.socketPath);
    t.after(() => client.destroy());
    const echoed = new Promise((resolve, reject) => {
        let data = Buffer.alloc(0), upgraded = false;
        client.on('error', reject);
        client.on('data', part => {
            data = Buffer.concat([data, part]);
            if (!upgraded) {
                const end = data.indexOf('\r\n\r\n');
                if (end < 0) return;
                assert.match(data.toString('ascii', 0, end), /^HTTP\/1.1 101/);
                assert.match(data.toString('ascii', 0, end), /sec-websocket-accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=/i);
                data = data.subarray(end + 4); upgraded = true; client.write(clientFrame);
            }
            if (data.length >= frame.length) resolve(data.subarray(0, frame.length));
        });
    });
    // Fixed RFC 6455 example nonce; it is not an account credential.
    client.write(`GET ${prefix}/emby/socket HTTP/1.1\r\nHost: fixture\r\nX-Fixture-Allow: yes\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`);
    assert.deepEqual(await echoed, frame);
    await harness.close();
    await harness.close();
});

test('real client disconnect cancels a streaming Unix upstream', linuxOnly, async t => {
    let ended;
    const upstreamClosed = new Promise(resolve => { ended = resolve; });
    const harness = await fixture(t, (req, res) => {
        res.writeHead(200, {'Content-Type': 'application/octet-stream'});
        res.write('synthetic-chunk');
        res.once('close', ended);
    });
    await new Promise((resolve, reject) => {
        const client = http.get({socketPath: harness.socketPath, path: prefix + '/emby/stream',
            headers: {'X-Fixture-Allow': 'yes'}, agent: false}, response => {
            response.once('data', () => { response.destroy(); resolve(); });
            response.on('error', () => {});
        });
        client.on('error', reject);
    });
    await upstreamClosed;
});
