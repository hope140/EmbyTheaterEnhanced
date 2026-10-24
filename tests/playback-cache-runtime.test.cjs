'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {EventEmitter} = require('node:events');
const {parseLaunch, valid, activateProfile} = require('../src/electronapp/enhanced/playback-cache-launch');
const {createRuntime} = require('../src/electronapp/enhanced/playback-cache-runtime');
const {createService} = require('../src/electronapp/native-helper/service');
const nativeClient = require('../src/electronapp/native-helper/client');
const contextProvider = require('../src/electronapp/enhanced/playback-cache-context');
const nextCache = require('../src/electronapp/enhanced/playback-cache-next');
const {harness: apiHarness, storage: apiStorage} = require('./helpers/api-client-amd.cjs');
const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
function config() { return {policy: {maxBytes: 256, maxEntries: 2, ttlMs: 10000, minFreeBytes: 0},
    download: {maxFileBytes: 128, bytesPerSecond: 65536, chunkBytes: 32, maxDurationMs: 5000, authorizationMaxAgeMs: 2000},
    networkPolicy: 'same-origin-paused-only', activeLeasePolicy: 'retain-until-media-close', partialPolicy: 'discard-on-cancel'}; }
function media() {
    const b = Buffer.alloc(60); b.write('RIFF'); b.writeUInt32LE(52, 4); b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
    b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(16, 40); return b;
}
function files(t) {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-runtime-cache-')));
    const cleanups = []; t.after(async () => { try { for (const cleanup of cleanups.reverse()) await cleanup(); } finally { fs.rmSync(parent, {recursive: true, force: true}); } });
    return {parent, cleanup: fn => cleanups.push(fn)};
}
test('launch requires explicit switch, every policy and an empty or owned isolated profile', t => {
    const f = files(t), profile = path.join(f.parent, 'isolated'), cfg = path.join(f.parent, 'policy.json'); fs.mkdirSync(profile);
    fs.writeFileSync(cfg, JSON.stringify(config()));
    const args = ['--ete-cache-trial', '--ete-cache-trial-config=' + cfg, '--ete-cache-trial-profile=' + profile];
    assert.deepEqual(parseLaunch(args.slice(1)), {enabled: false});
    for (const key of Object.keys(config().download)) {
        const changed = config(); delete changed.download[key]; fs.writeFileSync(cfg, JSON.stringify(changed));
        assert.deepEqual(parseLaunch(args), {enabled: false}); assert.deepEqual(fs.readdirSync(profile), []);
    }
    fs.writeFileSync(cfg, JSON.stringify(config()));
    const launch = parseLaunch(args); assert.equal(launch.enabled, true); assert.equal(launch.userData, path.join(profile, 'electron'));
    assert.equal(parseLaunch(args).enabled, true);
    const occupied = path.join(f.parent, 'ordinary-profile'); fs.mkdirSync(occupied); fs.writeFileSync(path.join(occupied, 'personal'), 'keep');
    assert.equal(parseLaunch([...args.slice(0, 2), '--ete-cache-trial-profile=' + occupied]).enabled, false);
    assert.deepEqual(fs.readdirSync(occupied), ['personal']);
    assert.equal(valid({...config(), networkPolicy: 'unrestricted'}), false);
    for (const partialPolicy of [undefined, 'guessed-default']) assert.equal(valid({...config(), partialPolicy}), false);
});

test('context comes from the existing ApiClient and PlaybackManager identities, and cannot relabel an old URL after account change', () => {
    let account = 'current-user'; const api = {serverId: () => 'server', getCurrentUserId: () => account, serverAddress: () => 'http://127.0.0.1:1234/emby'};
    let selectedApi = api;
    const connection = {getApiClient: id => id === 'server' ? selectedApi : null};
    const captured = contextProvider.capture(connection, {ServerId: 'server', Id: 'item'}, {Id: 'media-source', Container: 'wav'},
        {playMethod: 'DirectPlay', playSessionId: 'session-from-playbackinfo'}, 'http://127.0.0.1:1234/stream?api_key=current-token');
    assert.equal(captured().accountId, 'current-user'); assert.equal(captured().playSessionId, 'session-from-playbackinfo');
    assert.equal(Object.hasOwn(captured(), 'authorized'), false); account = 'different-user'; assert.equal(captured(), null);
    account = 'current-user'; selectedApi = {...api}; assert.equal(captured(), null);
});

test('trial activation isolates renderer/preload/mpv process paths; disabled launch leaves them unchanged', t => {
    const f = files(t), profile = path.join(f.parent, 'profile'), cfg = path.join(f.parent, 'policy.json'); fs.mkdirSync(profile); fs.writeFileSync(cfg, JSON.stringify(config()));
    const launch = parseLaunch(['--ete-cache-trial', '--ete-cache-trial-config=' + cfg, '--ete-cache-trial-profile=' + profile]);
    const paths = {}, env = {APPDATA: 'ordinary', LOCALAPPDATA: 'ordinary-local', MPV_HOME: 'personal-mpv'};
    activateProfile({setPath: (key, value) => { paths[key] = value; }}, {enabled: false}, env);
    assert.deepEqual(paths, {}); assert.equal(env.APPDATA, 'ordinary');
    activateProfile({setPath: (key, value) => { paths[key] = value; }}, launch, env);
    assert.deepEqual(paths, {appData: profile, userData: launch.userData, sessionData: launch.userData});
    assert.deepEqual(env, {APPDATA: profile, LOCALAPPDATA: launch.localData, MPV_HOME: launch.mpvHome});
});

test('missing session/server identity or transcoding yields no fabricated cache context', () => {
    const connection = {getApiClient: () => ({serverId: () => 'server', getCurrentUserId: () => 'user', serverAddress: () => 'http://127.0.0.1:1234'})};
    for (const options of [{playMethod: 'DirectPlay'}, {playMethod: 'Transcode', playSessionId: 'session'}]) {
        assert.equal(contextProvider.capture(connection, {ServerId: 'server', Id: 'item'}, {Id: 'source', Container: 'wav'}, options, 'http://127.0.0.1:1234/file')(), null);
    }
    assert.equal(contextProvider.capture(connection, {Id: 'item'}, {Id: 'source'}, {playMethod: 'DirectPlay', playSessionId: 'session'}, 'url')(), null);
});

test('only the existing Static=true DirectStream file route is eligible; remux/transcode or ambiguous flags remain ineligible', async t => {
    const f = await setup(t);
    for (const query of ['', '&Static=false', '&Static=true&Static=false']) {
        await f.play({mode: 'DirectStream', source: f.origin + '/video?api_key=synthetic-only' + query});
        await f.pause(true); assert.equal((await f.download()).state, 'unavailable');
    }
    assert.equal(f.requests.length, 0);
    const source = f.origin + '/video?api_key=synthetic-only&Static=true';
    await f.play({mode: 'DirectStream', source}); await f.pause(true); assert.equal((await f.download()).state, 'ready');
    await f.play({mode: 'DirectStream', source}); assert.equal(f.owned.loads.at(-1).bytes.equals(media()), true);
});

class Window extends EventEmitter {
    constructor() { super(); this.webContents = {isDestroyed: () => false, send() {}}; }
    isDestroyed() { return false; } isVisible() { return false; } isMinimized() { return false; }
    getBounds() { return {x: 0, y: 0, width: 100, height: 100}; } setBounds() {} getNativeWindowHandle() { return Buffer.alloc(8, 1); }
    setMenu() {} loadURL() { return Promise.resolve(); } hide() {} destroy() {}
}
let generation = 200;
class Helper {
    constructor(options) { this.options = options; this.handshake = {helperVersion: 'mock', libmpvVersion: 'mock'}; this.currentGenerationId = null;
        this.paused = false; this.loads = []; this.exit = gate(); this.exitPromise = this.exit.promise; }
    start() { return Promise.resolve(this); } allocateGenerationId() { return ++generation; }
    beginGeneration() { this.currentGenerationId = ++generation; return generation; }
    retireGeneration() { this.currentGenerationId = null; } request() { return Promise.resolve({attached: true}); }
    getProperty(name) { return Promise.resolve(name === 'pause' ? this.paused : null); }
    setProperty(name, value) { if (name === 'pause') this.paused = value; }
    load(args) {
        const row = {args: [...args], generationId: this.currentGenerationId, bytes: /^https?:/.test(args[1]) ? null : fs.readFileSync(args[1])};
        this.loads.push(row); const mediaIdentity = this.loads.length;
        queueMicrotask(() => this.options.onEvent({name: 'start-file', generationId: row.generationId, mediaIdentity}));
        return {generationId: row.generationId, promise: Promise.resolve({commandAccepted: true, mediaIdentity})};
    }
    stop() { this.currentGenerationId = null; return Promise.resolve(); }
    kill() { this.exited = true; this.exit.resolve(); return this.exitPromise; }
}
async function setup(t, change = {}) {
    const f = files(t), requests = [], sockets = new Set(), entered = gate();
    let mode = 'valid', tag = '"file-one"', bytesSent = 0, confirms = 0, confirm = async () => true, metadataVersions = 1, metadataRedirect = null;
    const server = http.createServer((req, res) => {
        requests.push({url: req.url, headers: req.headers});
        if (/^\/emby\/Users\/fixture-account\/Items\/next-item(?:\?|$)/.test(req.url)) {
            if (!(req.headers['x-emby-authorization'] || '').includes('Token="synthetic-only"') &&
                new URL(req.url, 'http://fixture').searchParams.get('X-Emby-Token') !== 'synthetic-only') { res.writeHead(403); res.end(); return; }
            if (mode === 'metadata-redirect') { res.writeHead(302, {Location: metadataRedirect}); res.end(); return; }
            if (mode === 'metadata-stall') { res.writeHead(200, {'Content-Type': 'application/json'}); res.write('{'); entered.resolve(); return; }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({Id: 'next-item', Type: 'Episode', SeriesId: 'fixture-series', MediaType: 'Video',
                MediaSources: Array.from({length: metadataVersions}, (_, i) => ({Id: 'next-source-' + i, Container: 'wav', Protocol: 'File'}))}));
            return;
        }
        if (!['synthetic-only', 'synthetic-renewed'].includes(new URL(req.url, 'http://fixture').searchParams.get('api_key'))) { res.writeHead(403); res.end(); return; }
        if (mode === 'redirect') { res.writeHead(302, {Location: 'http://192.0.2.1/must-not-follow'}); res.end(); return; }
        const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || ''), start = m && Number(m[1]), end = m && Number(m[2]);
        if (!m || mode === 'ignore' || (req.headers['if-range'] && req.headers['if-range'] !== tag)) { res.writeHead(200); res.end(media()); return; }
        const total = mode === 'oversize' ? 9999 : media().length;
        const headers = {'Content-Range': `bytes ${start}-${end}/${mode === 'unknown' ? '*' : total}`, 'Content-Length': end - start + 1, ETag: tag};
        if (mode === 'no-store') headers['Cache-Control'] = 'no-store';
        if (mode === 'date') { delete headers.ETag; headers['Last-Modified'] = new Date().toUTCString(); }
        res.writeHead(206, headers);
        if (mode === 'stall' || mode === 'stall-after-probe' && start > 0) { res.flushHeaders(); entered.resolve(); return; }
        if (mode === 'interrupt' && start > 0) { res.write(media().subarray(start, start + 2)); setImmediate(() => res.destroy()); return; }
        const representation = media(); if (req.url.startsWith('/variant')) representation[44] = 1;
        const bytes = representation.subarray(start, end + 1); bytesSent += bytes.length; res.end(bytes);
    });
    server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    f.cleanup(async () => { const exits = [...sockets].map(s => new Promise(r => s.once('close', r))); const closed = new Promise(r => server.close(r)); server.closeAllConnections(); await Promise.all([closed, ...exits]); assert.equal(sockets.size, 0); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    let apiOrigin = origin;
    const runtime = createRuntime({enabled: true, parent: f.parent, config: change.config || config()});
    const main = new Window(); let owned;
    class Client extends Helper { constructor(options) { super(options); owned = this; } }
    const service = createService({electron: {BrowserWindow: Window}, NativeHelperClient: Client, runtimeRoot: f.parent, fs: {existsSync: () => true},
        getMainWindow: () => main, getWebContents: () => main.webContents, playbackCacheRuntime: runtime,
        confirmCacheDownload: async target => { confirms++; return confirm(target); }});
    f.cleanup(() => service.destroy());
    const created = await service.call('create'); let gen, epoch = 0;
    function context(extra = {}) {
        const api = {serverId: () => 'fixture-server', getCurrentUserId: () => 'fixture-account', serverAddress: () => apiOrigin};
        const capture = contextProvider.capture({getApiClient: () => api}, {ServerId: 'fixture-server', Id: 'fixture-item'}, {Id: 'source-version', Container: 'wav'},
            {playMethod: 'DirectPlay', playSessionId: 'actual-mock-session'}, apiOrigin + '/video?api_key=synthetic-only');
        return {...capture(), ...extra};
    }
    async function play(extra) {
        const begun = await service.call('begin-generation', {requestEpoch: ++epoch}, created.endpointId); gen = begun.generationId;
        const c = context(extra); await service.call('cache-context', {generationId: gen, context: c}, created.endpointId);
        await service.call('command', {generationId: gen, data: ['loadfile', c.source]}, created.endpointId); await flush(); return gen;
    }
    return {...f, runtime, service, owned, created, origin, requests, entered, context,
        play, current: () => gen, mode: value => { mode = value; }, tag: value => { tag = value; },
        switchOrigin: value => { apiOrigin = value; },
        metadataVersions: value => { metadataVersions = value; }, metadataRedirect: value => { metadataRedirect = value; },
        confirms: () => confirms, confirm: fn => { confirm = fn; }, bytesSent: () => bytesSent,
        download: () => service.call('cache-download', {generationId: gen}, created.endpointId),
        pause: value => service.call('set-property', {generationId: gen, name: 'pause', value}, created.endpointId)};
}

function nextOptions(f) {
    const h = apiHarness(), Api = h.load('apiclient.js').default;
    const api = new Api(apiStorage(), () => Promise.resolve(), f.origin, 'ETE', 'trial', 'fixture', 'fixture-device', 1);
    api.serverInfo({Id: 'fixture-server', UserId: 'fixture-account', AccessToken: 'synthetic-only'});
    const player = {}, next = {Id: 'next-item', Type: 'Episode', SeriesId: 'fixture-series', ServerId: 'fixture-server', Name: 'Synthetic next'};
    let sentTarget, controller;
    let Queue;
    require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/modules/common/playback/playqueuemanager.js'), 'utf8'),
        {define(_deps, factory) { const exported = {}; factory(exported); Queue = exported.default; }});
    const queue = new Queue();
    function select(item) { queue.setPlaylist([{Id: 'fixture-item'}, ...(item ? [item] : [])]); queue.setPlaylistIndex(0); }
    select(next);
    const manager = {getCurrentPlayer: () => player, _playQueueManager: queue, nextTrack() { throw Error('queue must not advance'); }};
    const ownerGeneration = f.current(), signal = new AbortController();
    const captured = contextProvider.capture({getApiClient: () => api}, {Id: 'fixture-item', ServerId: 'fixture-server'},
        {Id: 'source-version', Container: 'wav'}, {playMethod: 'DirectPlay', playSessionId: 'actual-mock-session'}, f.context().source);
    const endpoint = {
        confirmNextCache: (itemId, title) => f.service.call('cache-next-confirm', {itemId, title, generationId: ownerGeneration}, f.created.endpointId),
        downloadNextCache: (confirmationId, target) => { sentTarget = target; return f.service.call('cache-next-download', {confirmationId, target, generationId: ownerGeneration}, f.created.endpointId); },
        cancelNextCache: (confirmationId, reportUnavailable) => f.service.call('cache-next-cancel', {confirmationId, reportUnavailable, generationId: f.current()}, f.created.endpointId)
    };
    return {api, h, signal, target: () => sentTarget, controller: () => controller, select,
        options: {connectionManager: {getApiClient: () => api}, playbackManager: manager, player,
            currentItem: {Id: 'fixture-item', Type: 'Episode', SeriesId: 'fixture-series'}, currentContext: captured,
            endpoint, signal: signal.signal, isCurrent: () => f.owned.currentGenerationId === ownerGeneration,
            onController: value => { controller = value; }}};
}

test('explicit next preload uses the maintained ApiClient authorization provider and the unchanged current session, then normal next playback hits complete bytes', async t => {
    const f = await setup(t); await f.play(); await f.pause(true); const n = nextOptions(f);
    assert.equal((await nextCache.prepare(n.options)).state, 'ready');
    assert.equal(f.owned.loads.length, 1); assert.equal(f.owned.currentGenerationId, f.current());
    assert.equal(n.target().ownerPlaySessionId, 'actual-mock-session'); assert.equal(Object.hasOwn(n.target(), 'playSessionId'), false);
    assert.equal(f.requests.filter(row => row.url.includes('/Items/')).length, 1);
    assert.equal(f.requests.some(row => /PlaybackInfo|Sessions\/Playing/.test(row.url)), false);
    assert.match(f.requests.find(row => row.url.includes('/Items/')).headers['x-emby-authorization'], /Token="synthetic-only"/);
    assert.equal(f.bytesSent(), 60);
    await f.play({itemId: 'next-item', mediaSourceId: 'next-source-0', playSessionId: 'normal-next-session', mode: 'DirectStream', source: n.target().source});
    assert.equal(f.owned.loads.at(-1).bytes.equals(media()), true); assert.equal(f.bytesSent(), 61);
});

test('next confirmation decline, nonmatching queue and ambiguous versions never start a media download', async t => {
    const f = await setup(t); await f.play(); await f.pause(true); const n = nextOptions(f);
    n.select(null); assert.equal((await nextCache.prepare(n.options)).state, 'unavailable'); assert.equal(f.confirms(), 0);
    n.select({Id: 'next-item', Type: 'Episode', SeriesId: 'another-series', ServerId: 'fixture-server'});
    assert.equal((await nextCache.prepare(n.options)).state, 'unavailable'); assert.equal(f.requests.length, 0);
    n.select({Id: 'next-item', Type: 'Episode', SeriesId: 'fixture-series', ServerId: 'fixture-server'});
    f.confirm(async () => false); assert.equal((await nextCache.prepare(n.options)).state, 'cancelled'); assert.equal(f.requests.length, 0);
    f.confirm(async () => true); f.metadataVersions(2);
    assert.equal((await nextCache.prepare(n.options)).state, 'unavailable'); assert.equal(f.requests.length, 1); assert.equal(f.bytesSent(), 0);
});

test('next metadata is cancelled with its real fetch body when the owning play retires', async t => {
    const f = await setup(t); await f.play(); await f.pause(true); f.mode('metadata-stall'); const n = nextOptions(f);
    const preparing = nextCache.prepare(n.options); await f.entered.promise; n.signal.abort();
    assert.equal((await preparing).state, 'cancelled'); assert.equal(f.bytesSent(), 0); assert.equal(f.owned.loads.length, 1);
});

test('next metadata does not follow a redirect or forward the real provider authorization to another origin', async t => {
    const f = await setup(t); let forwarded = 0; const server = http.createServer((_req, res) => { forwarded++; res.end('{}'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    f.cleanup(() => new Promise(resolve => server.close(resolve)));
    f.metadataRedirect(`http://127.0.0.1:${server.address().port}/must-not-follow`); f.mode('metadata-redirect');
    await f.play(); await f.pause(true); const n = nextOptions(f);
    assert.equal((await nextCache.prepare(n.options)).state, 'unavailable'); assert.equal(forwarded, 0); assert.equal(f.bytesSent(), 0);
});

test('the maintained provider query-string authentication mode also authorizes next metadata without storing its token', async t => {
    const f = await setup(t); await f.play(); await f.pause(true); const n = nextOptions(f);
    n.api.setSystemInfo({Version: '4.8.0.0'});
    assert.equal((await nextCache.prepare(n.options)).state, 'ready');
    const request = f.requests.find(row => row.url.includes('/Items/'));
    assert.equal(new URL(request.url, f.origin).searchParams.get('X-Emby-Token'), 'synthetic-only');
    for (const name of fs.readdirSync(path.join(f.parent, 'playback-cache-prototype-v1')).filter(n => n.endsWith('.json'))) {
        assert.equal(fs.readFileSync(path.join(f.parent, 'playback-cache-prototype-v1', name), 'utf8').includes('synthetic-only'), false);
    }
});

test('explicit cancel discards only its partial checkpoint under the selected partial policy', async t => {
    const f = await setup(t); f.mode('stall-after-probe'); await f.play(); await f.pause(true);
    const downloading = f.download(); await f.entered.promise;
    assert.equal(fs.readdirSync(path.join(f.parent, 'playback-cache-prototype-v1')).some(n => n.endsWith('.bytes')), true);
    await f.service.call('cache-cancel', {generationId: f.current()}, f.created.endpointId); await downloading;
    assert.equal(fs.readdirSync(path.join(f.parent, 'playback-cache-prototype-v1')).some(n => n.endsWith('.bytes') || n.endsWith('.json')), false);
});

test('explicit confirmation and actual paused property gate download; complete download then next session consumes verified local bytes', async t => {
    const f = await setup(t); await f.play(); assert.equal(f.requests.length, 0);
    assert.equal((await f.download()).state, 'unavailable'); assert.equal(f.confirms(), 0);
    await f.pause(true); f.confirm(async () => false); assert.equal((await f.download()).state, 'cancelled'); assert.equal(f.requests.length, 0);
    f.confirm(async () => true); assert.equal((await f.download()).state, 'ready'); assert.equal(f.bytesSent(), media().length);
    await f.play({source: f.origin + '/video?api_key=expired-token'}); assert.equal(f.owned.loads.at(-1).bytes, null);
    await f.play({source: f.origin + '/video?api_key=synthetic-renewed', playSessionId: 'new-current-session'});
    const hit = f.owned.loads.at(-1); assert.match(hit.args[1], /[a-f0-9]{64}\.bytes$/); assert.equal(hit.bytes.equals(media()), true);
    assert.equal(f.service.status().cacheTrial.state, 'local-media-opened');
    assert.equal(f.bytesSent(), media().length + 1); assert.equal(f.runtime.status().activeRequests, 0);
    for (const name of fs.readdirSync(path.join(f.parent, 'playback-cache-prototype-v1')).filter(n => n.endsWith('.json'))) {
        assert.equal(/api_key|synthetic|fixture-account|signed/.test(fs.readFileSync(path.join(f.parent, 'playback-cache-prototype-v1', name), 'utf8')), false);
    }
});

test('other account/server or changed validator cannot consume the approved prior object', async t => {
    const f = await setup(t); await f.play(); await f.pause(true); await f.download();
    const before = f.requests.length;
    await f.play({accountId: 'different-user'}); assert.equal(f.owned.loads.at(-1).bytes, null); assert.equal(f.requests.length, before);
    await f.play({serverId: 'different-server'}); assert.equal(f.owned.loads.at(-1).bytes, null); assert.equal(f.requests.length, before);
    f.tag('"new-version"'); await f.play(); assert.equal(f.owned.loads.at(-1).bytes, null);
});

test('a declared playlist/HLS or unknown container is not treated as a complete direct media file', async t => {
    const f = await setup(t);
    for (const container of ['m3u8', 'hls', 'strm', '', 'unknown']) {
        await f.play({container}); await f.pause(true); assert.equal((await f.download()).state, 'unavailable');
    }
    assert.equal(f.requests.length, 0);
});

test('same server/account IDs and ETag at another API origin cannot reuse the previous server bytes', async t => {
    const f = await setup(t); await f.play(); await f.pause(true); await f.download();
    let sent = 0; const payload = media(); payload[44] = 2;
    const sockets = new Set(); const server = http.createServer((req, res) => {
        const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range), start = Number(range[1]), end = Number(range[2]);
        const bytes = payload.subarray(start, end + 1); sent += bytes.length;
        res.writeHead(206, {'Content-Range': `bytes ${start}-${end}/60`, 'Content-Length': bytes.length, ETag: '"file-one"'}); res.end(bytes);
    });
    server.on('connection', s => { sockets.add(s); s.once('close', () => sockets.delete(s)); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    f.cleanup(async () => { const exits = [...sockets].map(s => new Promise(r => s.once('close', r))); const closing = new Promise(r => server.close(r)); server.closeAllConnections(); await Promise.all([closing, ...exits]); });
    f.switchOrigin(`http://127.0.0.1:${server.address().port}`);
    await f.play(); assert.equal(f.owned.loads.at(-1).bytes, null); assert.equal(sent, 0);
    await f.pause(true); assert.equal((await f.download()).state, 'ready'); assert.equal(sent, 60);
    await f.play(); assert.equal(f.owned.loads.at(-1).bytes.equals(payload), true);
});

test('different resource paths or unknown query parameters are distinct even with identical ETag and item/source IDs', async t => {
    const f = await setup(t); await f.play(); await f.pause(true); await f.download();
    await f.play({source: f.origin + '/variant?api_key=synthetic-only'}); assert.equal(f.owned.loads.at(-1).bytes, null);
    await f.pause(true); assert.equal((await f.download()).state, 'ready'); await f.play({source: f.origin + '/variant?api_key=synthetic-only'});
    const expected = media(); expected[44] = 1; assert.equal(f.owned.loads.at(-1).bytes.equals(expected), true);
    await f.play({source: f.origin + '/variant?api_key=synthetic-only&unknown-format=different'});
    assert.equal(f.owned.loads.at(-1).bytes, null);
});

test('redirect, ignored Range, unknown/oversize length, no-store and date-only validators stay ineligible', async t => {
    for (const mode of ['redirect', 'ignore', 'unknown', 'oversize', 'no-store', 'date']) {
        await t.test(mode, async t => {
            const f = await setup(t); f.mode(mode); await f.play(); await f.pause(true);
            assert.equal((await f.download()).state, 'unavailable'); assert.equal(f.requests.length, 1);
            await f.play(); assert.equal(f.owned.loads.at(-1).bytes, null); assert.equal(f.requests.length, 1);
        });
    }
});

test('interrupted partial bytes never become a source; an explicitly reconfirmed download can resume and complete', async t => {
    const f = await setup(t); f.mode('interrupt'); await f.play(); await f.pause(true);
    assert.equal((await f.download()).state, 'unavailable'); await f.play(); assert.equal(f.owned.loads.at(-1).bytes, null);
    f.mode('valid'); await f.pause(true); assert.equal((await f.download()).state, 'ready'); await f.play();
    assert.equal(f.owned.loads.at(-1).bytes.equals(media()), true);
});

test('resume interrupts an owned stalled request and leaves zero active requests', async t => {
    const f = await setup(t); f.mode('stall'); await f.play(); await f.pause(true);
    const downloading = f.download(); await f.entered.promise; await f.pause(false);
    assert.equal((await downloading).state, 'cancelled'); assert.equal(f.runtime.status().activeRequests, 0);
});

test('the explicit cancel action tears down its current HTTP request', async t => {
    const f = await setup(t); f.mode('stall'); await f.play(); await f.pause(true);
    const downloading = f.download(); await f.entered.promise;
    await f.service.call('cache-cancel', {generationId: f.current()}, f.created.endpointId);
    assert.equal((await downloading).state, 'cancelled'); assert.equal(f.runtime.status().activeRequests, 0);
});

test('Next retires the current download and does not reuse its credentials or partial object for the new item', async t => {
    const f = await setup(t); f.mode('stall'); await f.play(); await f.pause(true);
    const downloading = f.download(); await f.entered.promise; await f.play({itemId: 'next-item', playSessionId: 'next-session'});
    assert.equal((await downloading).state, 'cancelled'); assert.equal(f.owned.loads.at(-1).bytes, null);
    assert.equal(f.requests.length, 1); assert.equal(f.runtime.status().activeRequests, 0);
});

test('Stop cancels a rate-budget wait before any HTTP request starts', async t => {
    const c = config(); c.download.bytesPerSecond = 1;
    const f = await setup(t, {config: c}); await f.play(); await f.pause(true); const downloading = f.download(); await flush();
    await f.service.call('command', {generationId: f.current(), data: ['stop']}, f.created.endpointId);
    assert.equal((await downloading).state, 'cancelled'); assert.equal(f.requests.length, 0);
});

test('a changed context while the native dialog is pending cannot consume confirmation for the old source', async t => {
    const f = await setup(t), entered = gate(), answer = gate(); await f.play(); await f.pause(true);
    f.confirm(() => { entered.resolve(); return answer.promise; }); const downloading = f.download(); await entered.promise;
    await f.service.call('cache-context', {generationId: f.current(), context: f.context({itemId: 'different-item'})}, f.created.endpointId);
    answer.resolve(true); assert.equal((await downloading).state, 'unavailable'); assert.equal(f.requests.length, 0);
});

test('exit cancels download and waits for socket teardown before closing the owned store', async t => {
    const f = await setup(t); f.mode('stall'); await f.play(); await f.pause(true);
    const downloading = f.download(); await f.entered.promise; await f.service.destroy(); await downloading;
    assert.equal(f.runtime.status().activeRequests, 0); assert.equal(fs.existsSync(path.join(f.parent, 'playback-cache-prototype-v1', 'lock')), false);
});

test('the real Endpoint trial shortcut refreshes context and invokes the main confirmation operation, then unregisters on destroy', async t => {
    let listener, removed = false, refreshed = 0; const calls = [];
    const previous = global.document;
    global.document = {addEventListener(_name, fn) { listener = fn; }, removeEventListener(_name, fn) { removed = fn === listener; }};
    t.after(() => { if (previous === undefined) delete global.document; else global.document = previous; });
    const ipc = {on() {}, removeListener() {}, invoke(_channel, request) {
        calls.push(request); return Promise.resolve(request.operation === 'create' ? {status: 'ok', mode: 'native-helper', endpointId: 'endpoint', cacheTrialEnabled: true} :
            request.operation === 'begin-generation' ? {status: 'ok', generationId: 1} : {status: 'ok'});
    }};
    const {endpoint} = await nativeClient.create({ipc}); await endpoint.beginGeneration('test'); endpoint.refreshCacheContext = async () => { refreshed++; };
    listener({ctrlKey: true, shiftKey: true, code: 'KeyD', repeat: false, preventDefault() {}, stopPropagation() {}}); await flush();
    assert.equal(refreshed, 1); assert.equal(calls.at(-1).operation, 'cache-download');
    listener({ctrlKey: true, shiftKey: true, code: 'KeyX', repeat: false, preventDefault() {}, stopPropagation() {}}); await flush();
    assert.equal(calls.at(-1).operation, 'cache-cancel');
    await endpoint.destroy(); assert.equal(removed, true);
});
