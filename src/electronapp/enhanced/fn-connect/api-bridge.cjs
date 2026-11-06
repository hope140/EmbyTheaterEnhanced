'use strict';
const http = require('node:http');
const {randomBytes, createHash} = require('node:crypto');
const policy = require('./core/policy.cjs');

// The original Web ApiClient retains its URL, login, Session and method
// ownership. Only the transport URL is mapped to this profile-owned loopback
// endpoint. No FN cookie or raw third-party redirect leaves main.
async function createApiBridge(controller, {id, config, mode = 'live', onLogout = () => {}, authorize = () => false}) {
    const key = randomBytes(24).toString('hex'), prefix = '/a/' + key + '/';
    const sockets = new Set(), requests = new Set();
    let closed = false;
    const server = http.createServer(async (req, res) => {
        const owner = new AbortController(); requests.add(owner);
        res.once('close', () => owner.abort());
        let response;
        try {
            if (closed || req.headers.origin && req.headers.origin !== 'null' || !req.url.startsWith(prefix)) throw policy.fail('API_LEASE_GONE');
            if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) throw policy.fail('METHOD_REJECTED');
            const suffix = req.url.slice(prefix.length);
            const address = policy.target(config, suffix, mode);
            if (!authorize(address, req.headers)) throw policy.fail('API_IDENTITY_RETIRED');
            // A browser must not start or retry a media body through the API
            // route. Native obtains a separately owned media capability.
            if (/(?:^|\/)(?:videos|audio)\/[^/]+\/(?:stream|master|main|universal)(?:[./]|$)/i.test(address.pathname) ||
                /(?:\.m3u8|\.mpd)(?:$|\/)/i.test(address.pathname)) throw policy.fail('MEDIA_REQUIRES_NATIVE_LEASE');
            const chunks = []; let size = 0;
            for await (const chunk of req) {
                size += chunk.length; if (size > 1048576) throw policy.fail('REQUEST_BODY_INVALID'); chunks.push(chunk);
            }
            if (closed || owner.signal.aborted) throw policy.fail('CANCELLED');
            if (/\/sessions\/logout\/?$/i.test(address.pathname)) onLogout(owner);
            const headers = {};
            for (const name of ['accept', 'content-type', 'user-agent', 'authorization', 'x-emby-authorization', 'x-emby-token',
                'x-mediabrowser-token', 'x-emby-language', 'x-emby-client', 'x-emby-device-name', 'x-emby-device-id', 'x-emby-client-version']) {
                if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
            }
            response = await controller.request(id, {path: address.href, kind: 'api', method: req.method, headers,
                body: chunks.length ? Buffer.concat(chunks) : undefined, signal: owner.signal});
            if (owner.signal.aborted || response.statusCode >= 300 && response.statusCode < 400 || response.statusCode === 206 ||
                /^(?:audio|video)\/|application\/octet-stream|mpegurl|dash\+xml/i.test(policy.header(response, 'content-type'))) throw policy.fail('API_RESPONSE_REQUIRES_REVIEW');
            const output = {'Cache-Control': 'no-store'};
            for (const name of ['content-type', 'content-length', 'content-encoding']) if (policy.header(response, name)) output[name] = policy.header(response, name);
            if (output['content-encoding'] && output['content-encoding'] !== 'identity') throw policy.fail('ENCODING_UNVERIFIED');
            res.writeHead(response.statusCode, output);
            if (req.method === 'HEAD') res.end();
            else {
                response.body.once('error', () => res.destroy()); response.body.pipe(res);
                await new Promise(resolve => { res.once('finish', resolve); res.once('close', resolve); });
            }
        } catch {
            if (!res.headersSent) { res.writeHead(502, {'Content-Type': 'text/plain', 'Cache-Control': 'no-store'}); res.end('FN_API_UNAVAILABLE'); }
            else res.destroy();
        } finally { response?.dispose?.(); owner.abort(); requests.delete(owner); }
    });
    server.maxHeadersCount = 40; server.headersTimeout = 10000; server.requestTimeout = 15000;
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    server.on('upgrade', async (req, client, head) => {
        const owner = new AbortController(); requests.add(owner); let upstream;
        client.on('error', () => owner.abort()); client.once('close', () => owner.abort());
        client.once('end', () => { owner.abort(); client.destroy(); });
        try {
            if (closed || req.headers.origin && req.headers.origin !== 'null' || !req.url.startsWith(prefix)) throw policy.fail('API_LEASE_GONE');
            const address = policy.target(config, req.url.slice(prefix.length), mode);
            if (!authorize(address, req.headers) || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
                !/^[A-Za-z0-9+/]{22}==$/.test(req.headers['sec-websocket-key'] || '') || req.headers['sec-websocket-version'] !== '13') throw policy.fail('INVALID_WS_HANDSHAKE');
            const headers = {'sec-websocket-key': req.headers['sec-websocket-key'], 'sec-websocket-version': '13'};
            for (const name of ['sec-websocket-protocol', 'sec-websocket-extensions']) if (req.headers[name]) headers[name] = req.headers[name];
            upstream = await controller.webSocket(id, {path: address.href, headers, signal: owner.signal});
            const expected = createHash('sha1').update(headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
            if (owner.signal.aborted || policy.header(upstream, 'sec-websocket-accept') !== expected) throw policy.fail('INVALID_WS_ACCEPT');
            let reply = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + expected + '\r\n';
            for (const name of ['sec-websocket-protocol', 'sec-websocket-extensions']) {
                const value = policy.header(upstream, name); if (value && !/[\r\n]/.test(value)) reply += name + ': ' + value + '\r\n';
            }
            client.write(reply + '\r\n');
            if (upstream.head?.length) client.write(upstream.head); if (head.length) upstream.socket.write(head);
            upstream.socket.on('error', () => client.destroy()); upstream.socket.once('close', () => client.destroy());
            client.once('close', () => upstream.socket.destroy());
            client.pipe(upstream.socket).pipe(client);
            await new Promise(resolve => client.once('close', resolve));
        } catch { if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); }
        finally { owner.abort(); upstream?.socket?.destroy(); requests.delete(owner); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:' + server.address().port + prefix;
    return {
        base,
        cancel(except) { for (const request of requests) if (request !== except) request.abort(); },
        remote(value) {
            if (typeof value !== 'string' || !value.startsWith(base)) throw policy.fail('TARGET_OUT_OF_SCOPE');
            return policy.target(config, value.slice(base.length), mode).href;
        },
        async close() {
            if (closed) return; closed = true;
            for (const request of requests) request.abort(); for (const socket of sockets) socket.destroy();
            await new Promise(resolve => server.close(resolve));
        }
    };
}
module.exports = {createApiBridge};
