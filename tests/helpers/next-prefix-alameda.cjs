'use strict';
// Node-only extraction of the existing 9559d0f Alameda/HTTP fixture functions.
// Actual current PM/adapter/client/service/store; synthetic helper/document only.
// No fixed-040 artifact acquisition, Windows entry, native execution or preload driver.
const fs = require('node:fs'), path = require('node:path');
const CONFIG = Object.freeze({kind: 'next-prefix', progressPercent: 70, preloadMB: 100, timeoutMs: 30000});
const need = (value, code) => {if (!value) throw Error(code);};
async function rendererBoot(input) {
    const bridge = window.prefixHarness, stubs = Object.create(null), registered = [];
    const report = (type, data = {}) => bridge.report({type, ...data});
    const common = 'modules/common/';
    const aliases = {playbackManager: common + 'playback/playbackmanager.js', events: 'modules/emby-apiclient/events.js',
        pluginManager: common + 'pluginmanager.js', appSettings: common + 'appsettings.js',
        userSettings: common + 'usersettings/usersettings.js', globalize: common + 'globalize.js', connectionManager: 'modules/emby-apiclient/connectionmanager.js'};
    // Use the unchanged pinned Alameda implementation. Script loading and module
    // identity stay asynchronous; aliases unwrap default exports as app.js does.
    const loaderDocument = {createElement: name => document.createElement(name), head: {appendChild(script) {
        script.addEventListener('load', () => {
            const member = new URL(script.src).pathname.split('/electronapp/')[1];
            if (member) report('module-loaded', {member: 'electronapp/' + member});
        });
        return document.head.appendChild(script);
    }}};
    const amd = new Function('document', bridge.source('www/modules/alameda/alameda.js') +
        ';return {require:requirejs,define:define};')(loaderDocument);
    window.define = amd.define; window.require = amd.require;
    amd.require.config({baseUrl: input.moduleBaseUrl, noRequireCss: true});
    const load = id => amd.require([id]).then(values => values[0]);
    function url(relative, params) {const u = new URL(relative, input.origin + '/'); for (const [key, value] of Object.entries(params || {})) if (value != null) u.searchParams.set(key, value); return u.href;}
    const get = async relative => {const r = await fetch(url(relative), {redirect: 'error'}); if (!r.ok) throw Error('fixture-api-failed'); return r.json();};
    const api = {serverAddress: () => input.origin, serverId: () => 'prefix-server', getCurrentUserId: () => 'anonymous', deviceId: () => 'prefix-device', accessToken: () => '',
        getUrl: url, getCurrentUser: () => get('Users/anonymous'), getItem: (_user, id) => get('Users/anonymous/Items/' + id),
        getPlaybackInfo: id => get('Items/' + id + '/PlaybackInfo'), getEpisodes: series => get('Shows/' + series + '/Episodes'), getEndpointInfo: () => Promise.resolve({IsLocal: true, IsInNetwork: true}),
        getSavedEndpointInfo: () => ({IsLocal: true, IsInNetwork: true}), isMinServerVersion: () => false,
        setAuthorizationInfoIntoRequest: () => {}, stopActiveEncodings: () => Promise.resolve(),
        reportPlaybackStart: info => (report('server-report', {method: 'start', item: info.ItemId}), Promise.resolve()),
        reportPlaybackProgress: info => (report('server-report', {method: 'progress', item: info.ItemId}), Promise.resolve()),
        reportPlaybackStopped: info => (report('server-report', {method: 'stop', item: info.ItemId}), Promise.resolve())};
    const appSettings = {get: key => key === 'mpv-volume' ? '0' : key === 'mpv-demuxermaxbytes' && input.scenario === 'matrix-preempt' ? '1048576' : null, set: () => {}, maxStreamingBitrate: () => 200000000, enableAutomaticBitrateDetection: () => false};
    const plugins = {ofType: type => registered.filter(plugin => plugin.type === type), mapPath: (_plugin, file) => file};
    stubs[aliases.appSettings] = {default: appSettings}; stubs[aliases.pluginManager] = {default: plugins};
    stubs[aliases.userSettings] = {default: {getSubtitleAppearanceSettings: () => ({}), enableCinemaMode: () => false, skipForwardLength: () => 30, skipBackLength: () => 10}};
    stubs[aliases.globalize] = {default: {translate: value => value}};
    stubs[aliases.connectionManager] = {default: {getApiClient: () => api, currentApiClient: () => api}};
    stubs[common + 'servicelocator.js'] = {appHost: {supports: () => false}, fullscreenManager: {}, serverNotifications: {}};
    stubs['modules/loading/loading.js'] = {default: {show: () => report('presentation-stub', {operation: 'loading'}), hide: () => {}}};
    stubs.embyRouter = {showVideoOsd: () => Promise.resolve(), setTransparency: () => {}};
    stubs.alert = () => {report('renderer-failure', {code: 'playback-alert'}); return Promise.resolve();};
    for (const [id, value] of Object.entries(stubs)) amd.define(id, [], () => value);
    for (const [alias, id] of Object.entries(aliases)) amd.define(alias, [], () =>
        load(id).then(value => value && Object.hasOwn(value, 'default') ? value.default : value));
    window.platform = 'win32'; window.PlayerWindowId = input.windowId;
    window.ipc = {invoke: (channel, payload) => bridge.invoke(channel, payload), send: (channel, payload) => bridge.send(channel, payload),
        on: (_channel, listener) => bridge.listen(data => listener(null, data)), removeListener: (_channel, listener) => bridge.unlisten(listener)};
    window.addEventListener('error', () => report('renderer-failure', {code: 'window-error'}));
    window.addEventListener('unhandledrejection', () => report('renderer-failure', {code: 'unhandled-rejection'}));
    try {
        const events = await load('events'), manager = await load('playbackManager'), Player = await load('../plugins/libmpv.js'), player = new Player();
        // Observe the original manager method; EOF remains the sole caller.
        const originalNextTrack = manager.nextTrack;
        manager.nextTrack = function () {report('manager-next-track'); return originalNextTrack.apply(this, arguments);};
        registered.push(player); events.trigger(plugins, 'registered', [player]);
        const items = await Promise.all((input.singleItem ? ['A'] : ['A', 'B']).map(id => api.getItem('anonymous', id)));
        window.prefixStop = async () => {await manager.stop(); await player.destroy();};
        window.prefixAction = async operation => {
            report('matrix-action', {operation});
            if (operation === 'pause') manager.pause();
            else if (operation === 'unpause') manager.unpause();
            else if (operation === 'seek-back') await manager.seek(20000000);
            else if (operation === 'cancel') await manager.stop();
            else if (operation === 'replace') await manager.queueNext({items: [await api.getItem('anonymous', 'C')]});
            else throw Error('matrix-action-invalid');
        };
        report('manager-play-invocation');
        await manager.play({items, startIndex: 0, startPositionTicks: 0, fullscreen: false});
        if (manager.getCurrentPlayer() !== player || !player.currentSrc()) throw Error('initial-play-not-established');
        report('initial-play-resolved');
    } catch (error) {report('renderer-failure', {code: 'renderer-chain-failed', detail: String(error.message).slice(0, 180)});}
}
async function fixtureServer(plan, record, options = {}) {
    const http = require('node:http'), active = new Set(), sockets = new Set(); let held = null, sequence = 0;
    function item(id) {return {Id: id, ServerId: 'prefix-server', Name: 'Synthetic ' + id, Type: 'Episode', MediaType: 'Video', SeriesId: 'synthetic-series',
        Path: id + '.avi', RunTimeTicks: id === 'A' ? 160000000 : 80000000, MediaSources: [media(id)]};}
    function media(id) {return {Id: id + '-avi', Container: 'avi', Protocol: 'Http', Path: id + '.avi', RunTimeTicks: id === 'A' ? 160000000 : 80000000, SupportsDirectPlay: false,
        SupportsDirectStream: true, SupportsTranscoding: false, DirectStreamUrl: 'Videos/' + id + '/stream.avi?Static=true&mediaSourceId=' + id + '-avi',
        MediaStreams: [{Index: 0, Type: 'Video', Codec: 'rawvideo', Width: 320, Height: 180, RealFrameRate: id === 'A' ? 12 : 24}], DefaultSubtitleStreamIndex: -1};}
    const server = http.createServer((req, res) => {
        active.add(res); res.once('close', () => active.delete(res));
        const u = new URL(req.url, 'http://127.0.0.1');
        if (req.method !== 'GET' || Object.keys(req.headers).some(key => /authorization|cookie|emby-token/i.test(key)) || u.searchParams.get('api_key')) {res.writeHead(403); res.end(); return;}
        let value;
        if (u.pathname === '/Users/anonymous') value = {Id: 'anonymous', Configuration: {EnableNextEpisodeAutoPlay: plan.autoPlay !== false, ResumeRewindSeconds: 0}};
        const metadata = /^\/Users\/anonymous\/Items\/([ABC])$/.exec(u.pathname), playback = /^\/Items\/([ABC])\/PlaybackInfo$/.exec(u.pathname);
        if (metadata) value = item(metadata[1]);
        if (u.pathname === '/Shows/synthetic-series/Episodes') value = {Items: ['A', 'B', 'C'].map(item)};
        if (playback) value = {MediaSources: [media(playback[1])], PlaySessionId: 'synthetic-session-' + playback[1]};
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (value) {res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify(value)); return;}
        const match = /^\/Videos\/([ABC])\/stream\.avi$/.exec(u.pathname); if (!match) {res.writeHead(404); res.end(); return;}
        const proof = plan.fixtures[match[1] === 'A' ? 0 : 1], range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        if (req.headers.range && !range) {res.writeHead(416); res.end(); return;}
        const start = range ? Number(range[1]) : 0, end = range && range[2] ? Number(range[2]) : proof.size - 1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= proof.size) {res.writeHead(416); res.end(); return;}
        const requestId = ++sequence; record('origin-media', {requestId, item: match[1], start, end});
        res.setHeader('X-Fixture-Request', String(requestId));
        res.once('close', () => record('origin-closed', {requestId, item: match[1], start, end, complete: res.writableEnded}));
        if (options.unsupported && match[1] === 'A' && start === 0 && end === 0) {
            record('origin-ineligible', {requestId, status: 206, weakETag: true});
        }
        res.writeHead(range ? 206 : 200, {'Content-Type': 'video/x-msvideo', 'Content-Length': end - start + 1, ETag: options.unsupported && match[1] === 'A' ? 'W/' + proof.etag : proof.etag,
            'Accept-Ranges': 'bytes', ...(range ? {'Content-Range': `bytes ${start}-${end}/${proof.size}`} : {})});
        if (options.holdNext && match[1] === 'B' && start === (options.holdStart ?? 262144) && end > start && !held) {
            held = {requestId, response: res, start, end, file: path.join(plan.out, proof.file), completed: false}; const byte = Buffer.alloc(1), fd = fs.openSync(path.join(plan.out, proof.file), 'r');
            try {fs.readSync(fd, byte, 0, 1, start);} finally {fs.closeSync(fd);} res.write(byte);
            record('matrix-held', {requestId, item: 'B', start, end}); return;
        }
        const stream = fs.createReadStream(path.join(plan.out, proof.file), {start, end}); stream.on('error', () => res.destroy()); res.once('close', () => stream.destroy()); stream.pipe(res);
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
    return {origin: 'http://127.0.0.1:' + server.address().port, active, get held() {return held;}, completeHeld() {
        need(held && !held.completed && !held.response.destroyed && held.end - held.start <= 1048576, 'fixture-held-not-completable');
        const bytes = Buffer.alloc(held.end - held.start), fd = fs.openSync(held.file, 'r');
        try {need(fs.readSync(fd, bytes, 0, bytes.length, held.start + 1) === bytes.length, 'fixture-short-read');} finally {fs.closeSync(fd);}
        held.completed = true; held.response.end(bytes); record('matrix-held-completed', {requestId: held.requestId});
    }, releaseHeld() {const bytes = held && !held.response.destroyed ? 1 : 0; if (bytes) held.response.write(Buffer.from([0])); record('matrix-late-release', {bytes}); return bytes;}, async close() {const done = new Promise(resolve => server.close(resolve)); for (const socket of sockets) socket.destroy(); await done; need(active.size === 0, 'live-origin-response');}};
}
function observeOriginRequests(origin, record) {
    const http = require('node:http'), original = http.request, background = new Set(); let sequence = 0;
    function observed(...args) {
        const request = original.apply(this, args), url = args[0];
        const item = url && url.origin === origin && /^\/Videos\/([ABC])\/stream\.avi$/.exec(url.pathname);
        const range = /^bytes=(\d+)-(\d+)$/.exec(args[1]?.headers?.Range || '');
        if (item && range) {
            const data = {clientRequest: ++sequence, item: item[1], start: +range[1], end: +range[2]}; let requestId = null;
            if (item[1] !== 'A') background.add(request);
            record('origin-client-open', {...data, backgroundActive: background.size});
            request.once('response', response => {const n = Number(response.headers['x-fixture-request']); if (Number.isSafeInteger(n) && n > 0) requestId = n;});
            request.once('close', () => {background.delete(request); record('origin-client-closed', {...data, requestId, backgroundActive: background.size});});
        }
        return request;
    }
    http.request = observed;
    return () => {if (http.request === observed) http.request = original;};
}
module.exports = {CONFIG, rendererBoot, fixtureServer, observeOriginRequests};
