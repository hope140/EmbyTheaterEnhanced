'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {EventEmitter} = require('node:events');
const {createSession, parseContext} = require('../src/electronapp/enhanced/playback-range-session');
const renderer = require('../src/electronapp/enhanced/playback-range-renderer');
const launch = require('../src/electronapp/enhanced/playback-range-launch');
const {harness, storage} = require('./helpers/api-client-amd.cjs');
const {create: createEndpoint} = require('../src/electronapp/native-helper/client');
const flush = async () => {for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));};
async function fixture(t) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-range-integration-')), rows = [], body = Buffer.from('abcdefghijklmnopqrstuvwxyz012345');
    let editions = 1, holdMetadata = false, metadataResponse;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://fixture.invalid'); rows.push(req.url);
        if (url.searchParams.get('api_key') !== 'synthetic-token' && url.searchParams.get('X-Emby-Token') !== 'synthetic-token' && req.headers['x-emby-token'] !== 'synthetic-token') {res.writeHead(401); res.end(); return;}
        if (url.pathname.includes('/Users/')) {
            if (holdMetadata) {metadataResponse = res; return;}
            res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({Id: 'next', Type: 'Episode', MediaType: 'Video', SeriesId: 'series',
                MediaSources: Array.from({length: editions}, (_, i) => ({Id: 'next-source-' + i, SupportsDirectStream: true, Container: 'mp4'}))})); return;
        }
        const match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        if (!match) {res.writeHead(400); res.end(); return;}
        const start = +match[1], end = +match[2];
        res.writeHead(206, {ETag: '"fixed"', 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1}); res.end(body.subarray(start, end + 1));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const h = harness(), Api = h.load('apiclient.js').default;
    const api = new Api(storage(), () => Promise.resolve(), origin, 'ETE', 'fixture', 'fixture', 'fixture', 1);
    api.serverInfo({Id: 'server', UserId: 'user', AccessToken: 'synthetic-token'}); api.setSystemInfo({Version: '4.9.0.0'});
    const config = {root, maxBytes: 128, minFreeBytes: 0, blockBytes: 4, timeoutMs: 1000, bytesPerSecond: 1000000};
    const session = createSession({config}), helper = {currentGenerationId: 1, state: {playing: false}}, connectionManager = {getApiClient: () => api};
    const item = {Id: 'current', ServerId: 'server', Type: 'Episode', MediaType: 'Video', SeriesId: 'series'}, source = {Id: 'current-source', Container: 'mp4'};
    const options = {playMethod: 'DirectStream', playSessionId: 'play-1'};
    function url(id, sourceId) {return api.getUrl('Videos/' + id + '/stream.mp4', {Static: true, mediaSourceId: sourceId, deviceId: api.deviceId(), api_key: api.accessToken()});}
    const sourceUrl = url('current', source.Id), context = renderer.capture(connectionManager, item, source, options, sourceUrl)();
    const queue = {item: {Id: 'next', ServerId: 'server', Type: 'Episode', SeriesId: 'series'}};
    let position = 69;
    const player = {}, manager = {getCurrentPlayer: () => player, _playQueueManager: {getNextItemInfo: () => queue}, nextItem: () => {throw Error('must not call the async nextItem network entry');}};
    const calls = [], preloads = [];
    const binding = {setContext: value => session.setContext(value, helper, helper.currentGenerationId),
        preload: async value => {calls.push(value); const job = session.preload(value, helper, helper.currentGenerationId); preloads.push(job); return job;},
        cancelNext: () => session.cancelNext(), retire: () => session.retire()};
    const endpoint = {rangeCache: session.status(), createRangeBinding: () => binding}, controller = new AbortController();
    let control;
    t.after(async () => {try {if (control) await control.close(); await session.close();} finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, {recursive: true, force: true});}});
    return {root, rows, body, session, helper, api, context, config, calls, preloads, queue, url, sourceUrl,
        editions(value) {editions = value;}, hold() {holdMetadata = true;}, metadataResponse: () => metadataResponse,
        position(value) {position = value;}, async bind() {
            control = await renderer.bind({endpoint, connectionManager, playbackManager: manager, player, item, mediaSource: source, options, source: sourceUrl,
                signal: controller.signal, isCurrent: () => !controller.signal.aborted, position: () => ({positionTicks: position, durationTicks: 100})}); return control;
        }};
}

test('real selected ApiClient context drives threshold -> next prefix -> native-source hit across generation retirement', async t => {
    const f = await fixture(t), control = await f.bind();
    const selected = await f.session.select(f.sourceUrl, f.helper, 1); assert.match(selected.source, /^http:\/\/127\.0\.0\.1:/);
    const first = await fetch(selected.source, {headers: {Range: 'bytes=0-7'}}); assert.deepEqual(Buffer.from(await first.arrayBuffer()), f.body.subarray(0, 8));
    await f.session.started(f.helper, 1); control.started(); await control.tick(); await flush();
    assert.equal(f.calls.length, 0); assert.equal(f.rows.some(row => row.includes('/Users/')), false);
    f.position(70); await control.tick(); await flush();
    // Wait only for this owned tiny fixture job, without wall-clock sleeps.
    for (let i = 0; i < 30 && f.rows.filter(r => r.includes('/Videos/next/')).length < 9; i++) await flush();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].mediaSourceId, 'next-source-0');
    assert.equal((await f.preloads[0]).state, 'ready');
    await control.close(); await f.session.retire(); f.helper.currentGenerationId = 2;
    const nextUrl = f.url('next', 'next-source-0');
    await f.session.setContext({...f.context, source: nextUrl, itemId: 'next', mediaSourceId: 'next-source-0', playSessionId: 'play-2'}, f.helper, 2);
    const count = f.rows.length, hit = await f.session.select(nextUrl, f.helper, 2);
    const read = await fetch(hit.source, {headers: {Range: 'bytes=0-7'}}); assert.deepEqual(Buffer.from(await read.arrayBuffer()), f.body.subarray(0, 8));
    assert.equal(f.rows.length, count + 1, 'only the fresh authorization/version probe crosses the origin');
    await f.session.started(f.helper, 2);
});
for (const editions of [0, 2]) test('unconfirmed next media version is skipped: ' + editions + ' editions', async t => {
    const f = await fixture(t); f.editions(editions); const control = await f.bind();
    const selected = await f.session.select(f.sourceUrl, f.helper, 1); assert(selected); await f.session.started(f.helper, 1);
    control.started(); f.position(90); await control.tick(); await flush(); assert.equal(f.calls.length, 0);
});
test('browsing/preparing does not replace the persisted actual last-played cache', async t => {
    const f = await fixture(t); await f.session.setContext(f.context, f.helper, 1);
    let selected = await f.session.select(f.sourceUrl, f.helper, 1); await (await fetch(selected.source, {headers: {Range: 'bytes=0-3'}})).arrayBuffer(); await f.session.started(f.helper, 1);
    await f.session.retire(); f.helper.currentGenerationId = 2;
    const otherUrl = f.url('other', 'other-source'); await f.session.setContext({...f.context, itemId: 'other', mediaSourceId: 'other-source', source: otherUrl}, f.helper, 2);
    selected = await f.session.select(otherUrl, f.helper, 2); assert(selected);
    await f.session.retire(); await f.session.close();
    const index = JSON.parse(await fs.readFile(path.join(f.root, 'index.json'), 'utf8'));
    assert.equal(Object.keys(index.entries).length, 1); assert.equal(Object.values(index.entries)[0].role, 'last');
});
test('account credential epoch changes retire the old route and metadata request', async t => {
    const f = await fixture(t); f.hold(); const control = await f.bind();
    const selected = await f.session.select(f.sourceUrl, f.helper, 1); await f.session.started(f.helper, 1); control.started(); f.position(80); await control.tick();
    for (let i = 0; i < 30 && !f.metadataResponse(); i++) await flush();
    f.api.serverInfo({Id: 'server', UserId: 'other-user', AccessToken: 'replacement'}); await control.tick();
    assert.equal((await fetch(selected.source)).status, 403); assert.equal(f.calls.length, 0);
});
test('source parsing preserves representation fields and rejects transcode/cross-origin/unknown Range modes', () => {
    const c = {source: 'https://fixture.invalid/Videos/1/stream.mp4?Static=true&api_key=old&format=a', serverOrigin: 'https://fixture.invalid', serverId: 's', accountId: 'u', itemId: 'i', mediaSourceId: 'm', playSessionId: 'p', mode: 'DirectStream', mediaType: 'Video', container: 'mp4'};
    assert.equal(parseContext(c).identity.representation, parseContext({...c, source: c.source.replace('old', 'new')}).identity.representation);
    assert.notEqual(parseContext(c).identity.representation, parseContext({...c, source: c.source.replace('format=a', 'format=b')}).identity.representation);
    for (const value of [{...c, container: 'm3u8'}, {...c, mode: 'Transcode'}, {...c, source: c.source.replace('Static=true', 'Static=false')}, {...c, source: c.source.replace('fixture.invalid', 'other.invalid')}]) assert.equal(parseContext(value), null);
});
test('trial launch is disabled without complete explicit limits and isolates child/application profile paths', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ete-range-launch-')); t.after(() => fs.rm(root, {recursive: true, force: true}));
    const profile = path.join(root, 'profile'), file = path.join(root, 'config.json'); await fs.mkdir(profile);
    assert.equal(launch.parseLaunch([]).enabled, false);
    const args = ['--ete-range-cache-trial', '--ete-range-cache-config=' + file, '--ete-range-cache-profile=' + profile];
    await fs.writeFile(file, '{}'); assert.equal(launch.parseLaunch(args).enabled, false);
    await fs.writeFile(file, JSON.stringify({maxBytes: 1048576, minFreeBytes: 0, bytesPerSecond: 100000, timeoutMs: 1000}));
    const parsed = launch.parseLaunch(args); assert.equal(parsed.enabled, true); assert.equal(parsed.config.progressPercent, 70); assert.equal(parsed.config.preloadMB, 300);
    const paths = {}, env = {}; launch.activateProfile({setPath: (key, value) => {paths[key] = value;}}, parsed, env);
    assert.equal(env.APPDATA, profile); assert.equal(env.LOCALAPPDATA, path.join(profile, 'local')); assert.equal(env.MPV_HOME, path.join(profile, 'mpv')); assert.equal(paths.sessionData, path.join(profile, 'electron'));
});
test('a retired native binding cannot clear the newer generation context', async () => {
    class Ipc extends EventEmitter {
        constructor() {super(); this.generation = 1; this.calls = [];}
        async invoke(_channel, request) {
            this.calls.push(request);
            if (request.operation === 'create') return {status: 'ok', mode: 'native-helper', endpointId: 'endpoint', protocolVersion: 1};
            if (request.operation === 'begin-generation') return {status: 'ok', generationId: ++this.generation};
            return {status: 'ok'};
        }
        send() {}
    }
    const ipc = new Ipc(), {endpoint} = await createEndpoint({ipc});
    await endpoint.beginGeneration('old'); const binding = endpoint.createRangeBinding(); await endpoint.beginGeneration('new');
    const before = ipc.calls.length; await assert.rejects(binding.retire(), /stale-generation/); assert.equal(ipc.calls.length, before); await endpoint.destroy();
});
test('a confirmed core-playing event followed immediately by Stop still persists that last video', async t => {
    const f = await fixture(t); await f.session.setContext(f.context, f.helper, 1);
    const selected = await f.session.select(f.sourceUrl, f.helper, 1);
    await (await fetch(selected.source, {headers: {Range: 'bytes=0-3'}})).arrayBuffer();
    const playing = f.session.started(f.helper, 1), stopped = f.session.retire(); await Promise.all([playing, stopped]); await f.session.close();
    const index = JSON.parse(await fs.readFile(path.join(f.root, 'index.json'), 'utf8')); assert(index.lastKey); assert.equal(Object.keys(index.entries[index.lastKey].blocks).length, 1);
});
test('actual native service dispatches the range source, gates preload on real helper progress and retires stale work', async t => {
    const f = await fixture(t), {createService} = require('../src/electronapp/native-helper/service');
    class Window extends EventEmitter {
        constructor() {super(); this.webContents = {isDestroyed: () => false, send() {}};}
        getBounds() {return {x: 0, y: 0, width: 320, height: 180};} setBounds() {} getNativeWindowHandle() {return Buffer.from([1, 0, 0, 0]);}
        isDestroyed() {return false;} isVisible() {return false;} isMinimized() {return false;} setMenu() {} loadURL() {} hide() {} showInactive() {} destroy() {this.emit('closed');}
    }
    let helper;
    class Client {
        constructor(options) {helper = this; this.options = options; this.handshake = {helperVersion: 'mock', libmpvVersion: 'mock'}; this.state = {playing: false}; this.currentGenerationId = null; this.position = 69;}
        async start() {return this;} beginGeneration() {this.currentGenerationId = (this.counter || 0) + 1; this.counter = this.currentGenerationId; return this.counter;}
        retireGeneration() {this.currentGenerationId = null;} allocateGenerationId() {return ++this.counter;} command() {} submitCommand() {} setProperty() {}
        async getProperty(name) {return name === 'duration' ? 100 : this.position;}
        load(args) {this.args = args; this.loaded = (async () => {const response = await fetch(args[1], {headers: {Range: 'bytes=0-7'}}); this.bytes = Buffer.from(await response.arrayBuffer());
            this.state.playing = true; this.options.onEvent({name: 'core-idle', value: false, generationId: this.currentGenerationId}); return {};})();
            return {generationId: this.currentGenerationId, promise: this.loaded};}
        async stop() {this.currentGenerationId = null;} async kill() {this.exited = true;}
    }
    const main = new Window(), config = {...f.config, root: path.join(f.root, 'native-cache')};
    const service = createService({electron: {BrowserWindow: Window}, NativeHelperClient: Client, fs: {existsSync: () => true}, getMainWindow: () => main,
        getWebContents: () => main.webContents, runtimeRoot: f.root, rangeCache: config});
    try {
        const metadata = await service.call('create'); assert.equal(metadata.rangeCache.progressPercent, 70);
        const id = metadata.endpointId, begin = await service.call('begin-generation', {requestEpoch: 1}, id), generationId = begin.generationId;
        await service.call('range-context', {generationId, context: f.context}, id);
        await service.call('command', {generationId, data: ['loadfile', f.sourceUrl]}, id); await helper.loaded;
        assert.notEqual(helper.args[1], f.sourceUrl); assert.deepEqual(helper.bytes, f.body.subarray(0, 8));
        const next = {...f.context, itemId: 'next', mediaSourceId: 'next-source-0', source: f.url('next', 'next-source-0')};
        const count = f.rows.length; const result = await service.call('range-preload', {generationId, context: next}, id);
        assert.equal(result.value.state, 'progress-pending'); assert.equal(f.rows.length, count);
        helper.position = 70; assert.equal((await service.call('range-preload', {generationId, context: next}, id)).value.state, 'ready');
        await service.call('command', {generationId, data: 'stop'}, id);
        await assert.rejects(service.call('range-context', {generationId, context: f.context}, id), /stale-generation/);
    } finally {await service.destroy();}
    const index = JSON.parse(await fs.readFile(path.join(config.root, 'index.json'), 'utf8'));
    assert.equal(Object.keys(index.entries).length, 1, 'service exit retains actual current video, discarding the unplayed next');
});

test('only the explicit same-series queue neighbor qualifies; browsing does not supply a next item', () => {
    const player = {}, current = {serverId: 's'}, item = {Id: 'a', Type: 'Episode', SeriesId: 'series'};
    let next = {Id: 'b', ServerId: 's', Type: 'Episode', SeriesId: 'series'};
    const options = {player, item, playbackManager: {getCurrentPlayer: () => player, _playQueueManager: {getNextItemInfo: () => ({item: next})}}};
    assert.equal(renderer.nextItem(options, current).Id, 'b');
    for (const change of [null, {...next, Id: 'a'}, {...next, ServerId: 'other'}, {...next, SeriesId: 'other'}, {...next, Type: 'Movie'}]) {next = change; assert.equal(renderer.nextItem(options, current), null);}
});
