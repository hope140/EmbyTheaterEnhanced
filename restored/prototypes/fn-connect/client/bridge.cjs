'use strict';

const http = require('node:http');
const {randomBytes, createHash} = require('node:crypto');
const {fail, header} = require('./policy.cjs');
const responseHeaders = new Set(['content-type', 'content-length', 'content-range', 'accept-ranges',
    'etag', 'last-modified', 'cache-control']);

async function createBridge(controller, {enabled = false} = {}) {
    if (!enabled) throw fail('FEATURE_DISABLED');
    const leases = new Map(), allSockets = new Set();
    let closed = false;
    const server = http.createServer();
    server.maxHeadersCount = 40;
    server.headersTimeout = 10000;
    server.requestTimeout = 15000;
    server.on('connection', socket => { allSockets.add(socket); socket.once('close', () => allSockets.delete(socket)); });
    function revoke(key) {
        const lease = leases.get(key);
        if (!lease) return;
        leases.delete(key);
        for (const active of lease.active) active.abort();
    }
    const off = controller.onState(event => {
        if (event.state === 'ready') return;
        for (const [key, lease] of leases) if (lease.id === event.id) revoke(key);
    });
    function lookup(req, kind) {
        if (closed || req.headers.origin && req.headers.origin !== 'null') throw fail('LOCAL_ORIGIN_REJECTED');
        const match = /^\/r\/([a-f0-9]{48})$/.exec(req.url);
        const lease = match && leases.get(match[1]);
        if (!lease || lease.kind !== kind) throw fail('LEASE_GONE');
        if (controller.assertReady(lease.id).generation !== lease.generation) throw fail('LEASE_GONE');
        return lease;
    }
    server.on('request', async (req, res) => {
        let lease, active, response;
        try {
            if (!['GET', 'HEAD'].includes(req.method)) throw fail('METHOD_REJECTED');
            lease = lookup(req, 'media');
            active = new AbortController();
            lease.active.add(active);
            const abort = () => active.abort();
            res.once('close', abort);
            const forwarded = {...lease.headers};
            for (const key of ['range', 'if-range', 'accept']) if (typeof req.headers[key] === 'string') forwarded[key] = req.headers[key];
            response = await controller.request(lease.id, {path: lease.path, headers: forwarded, signal: active.signal, kind: 'media'});
            if (active.signal.aborted) throw fail('CANCELLED');
            const encoding = header(response, 'content-encoding');
            if (encoding && encoding !== 'identity') throw fail('ENCODING_UNVERIFIED');
            // HLS URL rewriting belongs to a later, separately verified phase.
            // Do not return a playlist whose subsequent requests lose this lease.
            if (/mpegurl|dash\+xml/i.test(header(response, 'content-type'))) throw fail('PLAYLIST_NOT_SUPPORTED');
            const headers = {};
            for (const [key, value] of Object.entries(response.headers || {})) if (responseHeaders.has(key.toLowerCase())) headers[key] = value;
            if (response.external) headers.location = response.headers.location;
            res.writeHead(response.statusCode, headers);
            if (req.method === 'HEAD') { response.dispose?.(); response.body.destroy(); res.end(); }
            else {
                response.body.once('error', () => res.destroy());
                response.body.pipe(res);
                await new Promise(resolve => { res.once('close', resolve); res.once('finish', resolve); });
            }
            res.removeListener('close', abort);
        } catch (error) {
            response?.dispose?.();
            if (!res.headersSent) {
                res.writeHead(error?.code === 'LEASE_GONE' ? 410 : 502, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'});
                res.end('FN_PROTOTYPE_REQUEST_UNAVAILABLE');
            } else res.destroy();
        } finally {
            active?.abort();
            if (lease && active) lease.active.delete(active);
        }
    });
    server.on('upgrade', async (req, client, head) => {
        let lease, active, upstream;
        client.on('error', () => { active?.abort(); upstream?.socket?.destroy(); });
        client.once('end', () => { active?.abort(); client.destroy(); });
        try {
            lease = lookup(req, 'websocket');
            if (req.headers.upgrade?.toLowerCase() !== 'websocket' ||
                !/^[a-zA-Z0-9+/]{22}==$/.test(req.headers['sec-websocket-key'] || '') || req.headers['sec-websocket-version'] !== '13') throw fail('INVALID_WS_HANDSHAKE');
            active = new AbortController();
            lease.active.add(active);
            client.once('close', () => active.abort());
            const headers = {...lease.headers, 'sec-websocket-key': req.headers['sec-websocket-key'], 'sec-websocket-version': '13'};
            for (const key of ['sec-websocket-protocol', 'sec-websocket-extensions']) if (req.headers[key]) headers[key] = req.headers[key];
            upstream = await controller.webSocket(lease.id, {path: lease.path, headers, signal: active.signal});
            const expected = createHash('sha1').update(headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
            if (active.signal.aborted || header(upstream, 'sec-websocket-accept') !== expected) throw fail('INVALID_WS_ACCEPT');
            let reply = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + expected + '\r\n';
            for (const key of ['sec-websocket-protocol', 'sec-websocket-extensions']) {
                const value = header(upstream, key);
                if (value && !/[\r\n]/.test(value)) reply += key + ': ' + value + '\r\n';
            }
            client.write(reply + '\r\n');
            if (upstream.head?.length) client.write(upstream.head);
            if (head.length) upstream.socket.write(head);
            upstream.socket.on('error', () => client.destroy());
            upstream.socket.once('close', () => { client.destroy(); lease.active.delete(active); });
            client.once('close', () => { upstream.socket.destroy(); lease.active.delete(active); });
            client.pipe(upstream.socket).pipe(client);
        } catch {
            upstream?.socket?.destroy();
            if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
            active?.abort();
            if (lease && active) lease.active.delete(active);
        }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    return {
        lease(id, {path, headers = {}, kind = 'media'} = {}) {
            if (closed) throw fail('BRIDGE_CLOSED');
            const {generation} = controller.assertReady(id);
            if (!['media', 'websocket'].includes(kind) || leases.size >= 64) throw fail('INVALID_LEASE');
            // Controller performs the same URL/header validation before I/O.
            const key = randomBytes(24).toString('hex');
            leases.set(key, {id, generation, path, headers: {...headers}, kind, active: new Set()});
            return Object.freeze({url: (kind === 'websocket' ? origin.replace('http:', 'ws:') : origin) + '/r/' + key,
                revoke: () => revoke(key)});
        },
        async close() {
            if (closed) return;
            closed = true;
            off();
            for (const key of [...leases.keys()]) revoke(key);
            for (const socket of allSockets) socket.destroy();
            await new Promise(resolve => server.close(resolve));
        }
    };
}
module.exports = {createBridge};
