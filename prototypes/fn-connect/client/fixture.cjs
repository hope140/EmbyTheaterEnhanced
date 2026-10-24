'use strict';

// Local synthetic services only. These routes, headers and cookie names are not
// fnOS APIs, and no third-party client IDs/signatures are present here.
const http = require('node:http');
const {createHash} = require('node:crypto');
const {openNodeWebSocket} = require('./electron-io.cjs');
const {fail} = require('./policy.cjs');

async function listen(server) {
    const sockets = new Set();
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return {origin: 'http://127.0.0.1:' + server.address().port, async close() {
        for (const socket of sockets) socket.destroy();
        await new Promise(resolve => server.close(resolve));
    }};
}
async function createFixture() {
    const state = {expired: false, ambiguous: false, networkError: false, slowClosed: false,
        seen: [], externalRequests: [], redirectSecret: null, wsClosed: 0,
        streamSequence: 0, closedStreams: new Set(), wsSequence: 0, closedWebSockets: new Set(), endedWebSockets: new Set()};
    const bytes = Buffer.from('ETE-FN-SYNTHETIC-MEDIA\n'.repeat(8192));
    const externalServer = http.createServer((req, res) => {
        state.externalRequests.push({...req.headers});
        res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length});
        res.end(bytes);
    });
    const external = await listen(externalServer);
    let nas;
    const cookie = 'fixture-session-canary-not-a-real-NAS-token';
    const authorized = req => !state.expired && (req.headers.cookie || '').split(';').some(item => item.trim() === 'FNFixture=' + cookie);
    const server = http.createServer((req, res) => {
        const path = new URL(req.url, 'http://fixture.invalid').pathname;
        if (path === '/nas/') {
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end('<!doctype html><title>Synthetic NAS</title><h1>Local fixture, not fnOS</h1><form action="/nas/authorize" method="get"><button>Authorize synthetic session</button></form>');
            return;
        }
        if (path === '/nas/authorize') {
            state.expired = false;
            res.writeHead(302, {'Set-Cookie': 'FNFixture=' + cookie + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=60', location: '/nas/'});
            res.end(); return;
        }
        if (!path.startsWith('/emby/')) { res.writeHead(404); res.end(); return; }
        state.seen.push({path, headers: {...req.headers}});
        if (state.networkError) { req.socket.destroy(); return; }
        if (!authorized(req)) {
            res.writeHead(state.ambiguous ? 200 : 401, {'Content-Type': 'text/html',
                ...(state.ambiguous ? {} : {'X-ETE-FN-Fixture-Auth': 'required'})});
            res.end('<title>Synthetic authorization required</title>'); return;
        }
        if (path === '/emby/System/Info/Public') {
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({Id: 'synthetic-emby', Version: '4.10.0.0'})); return;
        }
        if (path === '/emby/deny') { res.writeHead(403); res.end(); return; }
        if (path === '/emby/relogin') { res.writeHead(302, {location: nas.origin + '/nas/'}); res.end(); return; }
        if (path === '/emby/loop') { res.writeHead(302, {location: '/emby/loop'}); res.end(); return; }
        if (path === '/emby/strip') { res.writeHead(302, {location: '/emby/direct'}); res.end(); return; }
        if (path === '/emby/path-cookie') {
            res.writeHead(302, {'Set-Cookie': 'PathFixture=NEW_PATH_COOKIE_SECRET; Path=/emby/path-cookie; HttpOnly', location: '/emby/direct'});
            res.end(); return;
        }
        if (path === '/emby/direct') {
            const location = external.origin + '/media' + (state.redirectSecret ? '?opaque=' + encodeURIComponent(state.redirectSecret) : '');
            res.writeHead(302, {location, 'Set-Cookie': 'should-not-leave=fixture-private-value'}); res.end(); return;
        }
        if (path === '/emby/hls/playlist.m3u8') {
            res.writeHead(200, {'Content-Type': 'application/vnd.apple.mpegurl'}); res.end('#EXTM3U\nsegment.ts\n'); return;
        }
        if (path === '/emby/slow') {
            const streamId = ++state.streamSequence;
            res.writeHead(200, {'Content-Type': 'application/octet-stream'});
            const timer = setInterval(() => res.write(Buffer.alloc(1024, 42)), 10);
            res.once('close', () => { clearInterval(timer); state.slowClosed = true; state.closedStreams.add(streamId); }); return;
        }
        if (path === '/emby/headers-slow') {
            state.headersPendingEntered = true;
            req.once('close', () => { state.slowClosed = true; state.headersPendingClosed = true; }); return;
        }
        if (path === '/emby/media.bin') {
            const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
            if (range) {
                const start = Number(range[1]), end = range[2] ? Number(range[2]) : bytes.length - 1;
                if (start > end || start >= bytes.length || end >= bytes.length) {
                    res.writeHead(416, {'Content-Range': 'bytes */' + bytes.length}); res.end(); return;
                }
                const part = bytes.subarray(start, end + 1);
                res.writeHead(206, {'Content-Type': 'application/octet-stream', 'Content-Length': part.length,
                    'Content-Range': 'bytes ' + start + '-' + end + '/' + bytes.length, 'Accept-Ranges': 'bytes'});
                res.end(part); return;
            }
            res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length}); res.end(bytes); return;
        }
        res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{"fixture":true}');
    });
    server.on('upgrade', (req, socket) => {
        const connectionId = ++state.wsSequence;
        socket.once('close', () => { state.wsClosed++; state.closedWebSockets.add(connectionId); });
        socket.once('end', () => { state.endedWebSockets.add(connectionId); socket.destroy(); });
        state.seen.push({path: '/emby/ws', connectionId, headers: {...req.headers}});
        if (!authorized(req)) {
            socket.end('HTTP/1.1 401 Unauthorized\r\nX-ETE-FN-Fixture-Auth: required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return;
        }
        if (req.url.startsWith('/emby/ws-pending')) {
            state.wsPendingEntered = true;
            socket.once('close', () => { state.wsPendingClosed = true; });
            return;
        }
        const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
        // Raw transparent fixture, not a media/WebSocket application server.
        socket.on('data', data => socket.write(data));
        socket.on('error', () => {});
    });
    nas = await listen(server);
    return {state, bytes, cookie, profile: {bootstrapUrl: nas.origin + '/nas/', embyUrl: nas.origin + '/emby/',
        expectedServerId: 'synthetic-emby', externalMediaOrigins: [external.origin]},
        async close() { await Promise.all([nas.close(), external.close()]); }};
}

function createFixtureIO() {
    const sessions = new Map();
    function check(address) {
        const u = new URL(address);
        if (u.protocol !== 'http:' || u.hostname !== '127.0.0.1') throw fail('FIXTURE_ONLY');
        return u;
    }
    function cookieHeader(ses, address) {
        const u = check(address);
        return [...ses.cookies.values()].filter(c => c.host === u.hostname && u.pathname.startsWith(c.path) && c.expires > Date.now())
            .map(c => c.name + '=' + c.value).join('; ');
    }
    const io = {
        sessions,
        createSession(id) { const ses = {cookies: new Map(), visits: [], cleared: false}; sessions.set(id, ses); return ses; },
        async openLogin(ses, profile, {onCancel}) {
            ses.visits.push(profile.bootstrap.href);
            const response = await io.request(ses, {url: profile.bootstrap.href, headers: {}, method: 'GET', signal: new AbortController().signal});
            response.body.resume();
            return {close() { onCancel(); }, showTarget() { ses.visits.push(profile.emby.href); }};
        },
        request(ses, {url, method = 'GET', headers = {}, signal}) {
            const target = check(url);
            return new Promise((resolve, reject) => {
                if (signal.aborted) return reject(fail('CANCELLED'));
                const req = http.request(target, {method, headers: {...headers, Cookie: cookieHeader(ses, url)}}, response => {
                    for (const raw of response.headers['set-cookie'] || []) {
                        const parts = raw.split(';').map(p => p.trim()), split = parts[0].indexOf('=');
                        const name = parts[0].slice(0, split), value = parts[0].slice(split + 1);
                        const path = parts.find(p => /^path=/i.test(p))?.slice(5) || '/';
                        const age = Number(parts.find(p => /^max-age=/i.test(p))?.slice(8) || '60');
                        ses.cookies.set(name, {name, value, host: target.hostname, path, expires: Date.now() + age * 1000});
                    }
                    response.once('close', () => signal.removeEventListener('abort', abort));
                    resolve({statusCode: response.statusCode, headers: response.headers, body: response});
                });
                const abort = () => req.destroy();
                signal.addEventListener('abort', abort, {once: true});
                req.once('error', () => { signal.removeEventListener('abort', abort); reject(fail('NETWORK_ERROR')); });
                req.end();
            });
        },
        async authorize(id, profile) {
            const response = await io.request(sessions.get(id), {url: new URL('authorize', profile.bootstrapUrl).href,
                headers: {}, signal: new AbortController().signal});
            response.body.resume();
        },
        async cookieValues(ses, address) { check(address); return [...ses.cookies.values()].map(c => c.value); },
        openWebSocket(ses, {url, headers, signal}) {
            check(url);
            return openNodeWebSocket({url, headers, signal, cookie: cookieHeader(ses, url)});
        },
        async clearSession(ses) { ses.cookies.clear(); ses.cleared = true; }
    };
    return io;
}
module.exports = {createFixture, createFixtureIO};
