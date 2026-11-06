'use strict';

// Linux development harness ONLY. An injected fixture supplies authorization;
// this is not fnOS gateway authentication or a deployable NAS bridge.
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {targetPath, upstreamHeaders, validateConfig} = require('./bridge-mock.cjs');

function fail(code) { return Object.assign(new Error(code), {code}); }

async function startLocalHarness({enabled = false, root, authorizeFixture = () => false} = {}) {
    if (enabled !== true) throw fail('HARNESS_DISABLED');
    if (process.platform === 'win32') throw fail('UNIX_REQUIRED');
    const temporary = fs.realpathSync(os.tmpdir());
    if (typeof root !== 'string' || !path.isAbsolute(root) || path.dirname(root) !== temporary ||
        !path.basename(root).startsWith('ete-fn-harness-')) throw fail('PRIVATE_FIXTURE_ROOT_REQUIRED');
    const stat = fs.lstatSync(root);
    if (!stat.isDirectory() || fs.realpathSync(root) !== root || (stat.mode & 0o777) !== 0o700 ||
        stat.uid !== process.getuid()) throw fail('PRIVATE_FIXTURE_ROOT_REQUIRED');
    const upstreamSocket = path.join(root, 'upstream.sock');
    const socketPath = path.join(root, 'bridge.sock');
    if (!fs.lstatSync(upstreamSocket).isSocket() || fs.existsSync(socketPath)) throw fail('FIXTURE_SOCKET_REQUIRED');
    const prefix = validateConfig().mapping.prefix;
    const owned = new Set();
    let closing;
    let stopped = false;
    const track = socket => {
        owned.add(socket);
        socket.once('close', () => owned.delete(socket));
        socket.on('error', () => {});
        return socket;
    };
    const route = request => {
        if (stopped || authorizeFixture(request) !== true) throw fail('FIXTURE_ACCESS_DENIED');
        return targetPath(request.url, prefix);
    };
    const server = http.createServer((incoming, outgoing) => {
        let mapped, headers;
        try { mapped = route(incoming); headers = upstreamHeaders(incoming.headers); } catch {
            incoming.resume(); outgoing.writeHead(403); outgoing.end(); return;
        }
        const upstream = http.request({socketPath: upstreamSocket, agent: false, path: mapped,
            method: incoming.method, headers}, response => {
            const headers = {...response.headers};
            delete headers['set-cookie'];
            delete headers.connection;
            delete headers['transfer-encoding'];
            outgoing.writeHead(response.statusCode, headers);
            response.on('error', () => outgoing.destroy());
            response.pipe(outgoing);
        });
        upstream.on('socket', track);
        upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
        incoming.on('aborted', () => upstream.destroy());
        incoming.on('error', () => upstream.destroy());
        outgoing.on('close', () => upstream.destroy());
        incoming.pipe(upstream);
    });
    server.on('connection', track);
    server.on('upgrade', (incoming, downstream, clientHead) => {
        let mapped, headers;
        try {
            mapped = route(incoming);
            headers = upstreamHeaders(incoming.headers);
            if (incoming.headers.upgrade?.toLowerCase() !== 'websocket') throw fail('UPGRADE_UNSUPPORTED');
        } catch { downstream.destroy(); return; }
        const request = http.request({socketPath: upstreamSocket, agent: false, path: mapped,
            headers: {...headers, Connection: 'Upgrade', Upgrade: 'websocket'}});
        request.on('socket', track);
        request.on('error', () => downstream.destroy());
        request.on('response', response => { response.resume(); downstream.destroy(); });
        downstream.on('close', () => request.destroy());
        request.on('upgrade', (response, upstream, serverHead) => {
            if (stopped || downstream.destroyed) { upstream.destroy(); return; }
            // HTTP parser has validated the upstream header syntax. Fixture
            // socket is private; no remote host or cookie forwarding exists.
            const headers = Object.entries(response.headers).filter(([key]) => key !== 'set-cookie')
                .flatMap(([key, value]) => Array.isArray(value) ? value.map(v => `${key}: ${v}`) : [`${key}: ${value}`]);
            downstream.write('HTTP/1.1 101 Switching Protocols\r\n' + headers.join('\r\n') + '\r\n\r\n');
            if (serverHead.length) downstream.write(serverHead);
            if (clientHead.length) upstream.write(clientHead);
            downstream.on('close', () => upstream.destroy());
            upstream.on('close', () => downstream.destroy());
            downstream.pipe(upstream).pipe(downstream);
        });
        request.end();
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
    return Object.freeze({socketPath, close() {
        if (!closing) {
            stopped = true;
            closing = new Promise(resolve => {
                server.close(resolve);
                for (const socket of owned) socket.destroy();
            });
        }
        return closing;
    }});
}

module.exports = {startLocalHarness};
