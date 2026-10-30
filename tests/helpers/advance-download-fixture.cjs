'use strict';
const http = require('node:http');
const cd2 = require('../../src/electronapp/enhanced/cd2-service');
const {createSession} = require('../../src/electronapp/enhanced/advance-download/source-session');
const token = 'synthetic-download-token';
const media = Buffer.alloc(4096, 7);
Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(media);

async function fixture(t) {
    const state = {etag: '"movie-v1"', signature: 'first', ranges: true, downloadAllowed: true,
        pointer: true, directDenied: false, body: media, sourceId: 'source', serverId: 'server', closedServices: 0};
    const calls = [], services = [], sockets = new Set();
    let notifyMedia;
    const mediaRequested = new Promise(resolve => {notifyMedia = resolve;});
    function video(req, res) {
        notifyMedia();
        if (state.stall) {res.writeHead(206, {'content-range': 'bytes 0-4095/4096'}); res.flushHeaders(); return;}
        if (state.directDenied && req.url.startsWith('/direct')) {res.writeHead(403); res.end(); return;}
        const body = state.body;
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        if (req.url.startsWith('/direct') && (!match && state.expireFull || match && Number(match[1]) > 0 && !match[2] && state.expireResume)) {
            state.expireFull = state.expireResume = false; state.signature = 'renewed';
            res.writeHead(401); res.end('expired-link-text-not-video'); return;
        }
        const headers = {'content-type': 'application/octet-stream', 'last-modified': 'Wed, 01 Oct 2025 00:00:00 GMT'};
        if (state.etag !== null) headers.etag = state.etag;
        if (!match && state.transferStall) {res.writeHead(200, {...headers, 'content-length': body.length}); res.flushHeaders(); return;}
        if (!match && state.pauseTransfer) {res.writeHead(200, {...headers, 'content-length': body.length}); res.write(body.subarray(0, state.pauseBytes || 1024)); return;}
        if (!match && state.cutTransfer) {
            state.cutTransfer--;
            res.writeHead(200, state.cutAfterBody ? headers : {...headers, 'content-length': body.length});
            res.write(state.cutAfterBody ? body : body.subarray(0, 1024));
            if (state.changeOnCut) state.etag = '"changed-during-transfer"';
            setTimeout(() => res.destroy(), 10); return;
        }
        if (state.ranges && match) {
            const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
            const payload = body.subarray(start, end + 1);
            headers['content-range'] = `bytes ${state.badTail && start > 0 ? 0 : start}-${end}/${body.length}`;
            headers['content-length'] = payload.length;
            res.writeHead(206, headers); res.end(payload);
        } else {
            headers['content-length'] = body.length;
            res.writeHead(200, headers); res.end(body);
        }
    }
    async function listen(handler) {
        const server = http.createServer((req, res) => {
            calls.push({url: req.url, headers: {...req.headers}});
            handler(req, res);
        });
        server.on('connection', socket => {sockets.add(socket); socket.on('close', () => sockets.delete(socket));});
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        t.after(() => new Promise(resolve => {server.closeAllConnections(); server.close(resolve);}));
        return `http://127.0.0.1:${server.address().port}`;
    }
    const cdn = await listen((req, res) => {
        if (req.url === '/bounce') {res.writeHead(302, {location: '/bounce'}); res.end(); return;}
        if (req.url === '/cross') {res.writeHead(302, {location: `${emby}/base/Items/item/Download?mediaSourceId=source`}); res.end(); return;}
        video(req, res);
    });
    const emby = await listen((req, res) => {
        if (req.headers['x-emby-token'] !== token) {res.writeHead(401); res.end('secret-server-message'); return;}
        const url = new URL(req.url, 'http://fixture');
        const json = value => {res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value));};
        if (url.pathname === '/base/System/Info/Public') return json({Id: state.serverId});
        if (url.pathname === '/base/Users/account') return json({Id: 'account', Policy: {EnableContentDownloading: state.downloadAllowed}});
        if (url.pathname === '/base/Users/account/Items/item') return json({Id: 'item', ServerId: 'server', Name: 'Synthetic Movie', MediaType: 'Video', CanDownload: state.itemDownloadAllowed !== false,
            Path: '/server/movie.mkv.strm', MediaSources: state.multiple ? [{Id: 'one'}, {Id: 'two'}] : [{Id: state.sourceId,
                Container: 'mkv', Size: state.sizeHint ?? state.body.length, Path: state.sourcePath || 'X:\\Media\\movie.mkv',
                RequiredHttpHeaders: state.requiredHeaders}]});
        if (url.pathname === '/base/Items/item/Download') {
            if (!req.headers.range && state.redirectOnTransfer) {state.redirectOnTransfer = false; state.redirect = true;}
            if (state.redirect) {res.writeHead(302, {location: cdn + '/direct?signature=redirected'}); res.end(); return;}
            if (state.pointer) {const pointer = Buffer.from('https://example.invalid/movie.mkv\n'); res.writeHead(200, {'content-length': pointer.length}); res.end(pointer); return;}
            return video(req, res);
        }
        res.writeHead(404); res.end();
    });
    const rule = {id: 'download-rule', enabled: true, originState: 'USER', sourcePrefix: 'X:\\Media',
        cloudPrefix: '/cloud/media', strategy: 'cloud-first', order: ['direct-url', 'cd2-http', 'mount', 'native']};
    const configs = {resolver: {version: 1, enabled: true, rules: [rule]}, runtime: {
        enabled: true, origin: cd2.parseOrigin(cdn), token: 'synthetic-cd2-token', directUrlEnabled: true,
        rules: [rule], totalBudgetMs: 1200
    }};
    function createCd2Service(config) {
        const methods = [];
        const client = {
            close() {state.closedServices++;}, waitForReady(_deadline, cb) {cb(null);},
            FindFileByPath(request, _metadata, _options, cb) {
                methods.push(['find', request.path]); cb(null, {fullPathName: request.path, size: String(state.body.length), fileType: 'File', isDirectory: false}); return {cancel() {}};
            },
            GetDownloadUrlPath(request, _metadata, _options, cb) {
                methods.push(['url', request.get_direct_url]);
                cb(null, request.get_direct_url ? {directUrl: `${cdn}/direct?signature=${state.signature}`, userAgent: 'ETE-Download-Fixture', expiresIn: '60', additionalHeaders: {}} : {downloadUrlPath: '/fallback'});
                return {cancel() {}};
            }
        };
        const service = cd2.createService({config, transportFactory: () => ({client, metadata: {}, status: {CANCELLED: 1, NOT_FOUND: 5, DEADLINE_EXCEEDED: 4}})});
        services.push(methods);
        return service;
    }
    const input = {serverAddress: emby + '/base', serverId: 'server', accountId: 'account', itemId: 'item', mediaSourceId: 'source', token};
    const dependencies = {getConfig: () => configs, createCd2Service, fs: {existsSync: () => false}};
    function session(overrides = {}, deps = {}) {
        const value = createSession({...input, ...overrides}, {...dependencies, ...deps});
        t.after(() => value.close());
        return value;
    }
    return {state, calls, services, sockets, mediaRequested, cdn, emby, session, configs};
}

module.exports = {fixture, media, token};
