'use strict';
// This file never imports Electron or starts a process when required by Node tests.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const support = require('./playback-range-windows-smoke.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function protectHiddenWindow(window) {
    if (window.isVisible()) throw Error('visible-window-forbidden');
    for (const method of ['show', 'showInactive', 'focus']) window[method] = () => {throw Error('visible-window-operation-forbidden:' + method);};
    return window;
}
async function fixtureServer(plan, requestedPort = 0) {
    const rows = [], sockets = new Set(), active = new Set(); let holdRule = null, held = null, closing = false;
    const server = http.createServer((req, res) => {
        if (closing || req.headers.authorization || req.headers.cookie || req.headers['x-emby-token']) {res.writeHead(403).end(); return;}
        const url = new URL(req.url, 'http://127.0.0.1'), matchName = /^\/Videos\/([AB])\/stream\.avi$/.exec(url.pathname);
        const item = matchName && matchName[1], proof = plan.fixtures.find(f => f.file === item + '.avi');
        if (!proof || !['GET', 'HEAD'].includes(req.method)) {res.writeHead(404).end(); return;}
        if (req.headers['if-match'] && req.headers['if-match'] !== proof.etag) {res.writeHead(412).end(); return;}
        const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        let start = 0, end = proof.size - 1;
        if (req.headers.range) {
            if (!match || +match[1] >= proof.size || match[2] && +match[2] < +match[1]) {res.writeHead(416, {'Content-Range': 'bytes */' + proof.size}).end(); return;}
            start = +match[1]; end = match[2] ? Math.min(+match[2], end) : end;
        }
        const row = {item, start, end, method: req.method, status: match ? 206 : 200, closed: false, finished: false, held: false, bytesScheduled: 0}; rows.push(row); active.add(res);
        const close = new Promise(resolve => res.once('close', () => {row.closed = true; active.delete(res); resolve();}));
        res.once('finish', () => {row.finished = true;});
        function send() {
            if (res.destroyed) return;
            const headers = {'Content-Type': 'video/x-msvideo', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ETag: proof.etag, Connection: 'close'};
            if (match) headers['Content-Range'] = `bytes ${start}-${end}/${proof.size}`;
            res.writeHead(row.status, headers);
            if (req.method === 'HEAD') {res.end(); return;}
            const stream = fs.createReadStream(path.join(plan.out, proof.file), {start, end});
            stream.on('data', b => {row.bytesScheduled += b.length;}); stream.on('error', error => res.destroy(error));
            res.once('close', () => stream.destroy()); stream.pipe(res);
        }
        if (holdRule && holdRule(row)) {holdRule = null; row.held = true; held = {row, close, release: send};} else send();
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen({host: '127.0.0.1', port: requestedPort, exclusive: true}, resolve);});
    return {rows, active, origin: 'http://127.0.0.1:' + server.address().port, port: server.address().port,
        hold(rule) {if (held || holdRule) throw Error('fixture-already-holding'); holdRule = rule;}, held: () => held,
        async close() {
            closing = true;
            const closed = new Promise(resolve => server.close(resolve));
            const socketCloses = [...sockets].map(socket => new Promise(resolve => {socket.once('close', resolve); socket.destroy();}));
            await Promise.all([closed, ...socketCloses]);
        }};
}
function cacheSnapshot(root, maxBytes) {
    const index = JSON.parse(fs.readFileSync(path.join(root, 'index.json'))); let bytes = 0;
    for (const entry of Object.values(index.entries)) for (const row of Object.values(entry.blocks)) {
        const file = support.regular(path.join(root, row.file)); assert.equal(fs.statSync(file).size, row.size); assert.equal(support.hashFile(file), row.sha256); bytes += row.size;
    }
    assert(bytes <= maxBytes, 'committed media quota');
    const physicalBytes = fs.readdirSync(root).filter(name => name.endsWith('.bytes')).reduce((n, name) => n + fs.statSync(path.join(root, name)).size, 0);
    assert(physicalBytes <= maxBytes, 'physical committed media quota');
    return {index, bytes, physicalBytes};
}
async function main(argv) {
    const args = support.argumentsOf(argv, ['--execute-hidden-native', '--plan', '--phase']);
    if (process.platform !== 'win32' || process.arch !== 'x64' || !process.versions.electron || args['--execute-hidden-native'] !== true || !['populate', 'reopen'].includes(args['--phase'])) throw Error('explicit-fixed-Windows-Electron-required');
    const phase = args['--phase'], plan = support.readPlan(args['--plan']);
    if (support.hashFile(process.execPath) !== plan.identity.electronSha256) throw Error('wrong-Electron-image');
    const output = path.join(plan.out, phase + '.json');
    if (fs.existsSync(output) || fs.existsSync(path.join(plan.out, phase + '.running.json'))) throw Error('receipt-already-exists');
    if (phase === 'reopen' && JSON.parse(fs.readFileSync(path.join(plan.out, 'populate.json'))).status !== 'passed') throw Error('populate-required');
    // Verify the full candidate again before importing any bundled runtime JS.
    support.verifyRuntime(path.resolve(__dirname, '..'), plan.runtime, plan.zip);
    const {app, BrowserWindow} = require('electron');
    const launch = require(path.join(plan.runtime, 'electronapp', 'enhanced', 'playback-range-launch.js'));
    const selected = launch.prepareLaunch(['--ete-range-cache-trial', '--ete-range-cache-config=' + path.join(plan.out, 'config.json'), '--ete-range-cache-profile=' + path.join(plan.out, 'profile')]);
    assert(selected.enabled); assert.deepEqual({...selected.config, root: undefined}, {...support.LIMITS, root: undefined});
    launch.activateProfile(app, selected, process.env); // Before app.ready, any window, service or helper.
    app.setAppLogsPath(path.join(plan.out, 'profile', 'logs'));
    const result = {schema: 1, phase, status: 'running', identity: plan.identity, limits: support.LIMITS, pid: process.pid,
        environment: {APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA, MPV_HOME: process.env.MPV_HOME, TEMP: process.env.TEMP, TMP: process.env.TMP}, helpers: [], checks: {}};
    const running = path.join(plan.out, phase + '.running.json');
    const checkpoint = () => fs.writeFileSync(running, JSON.stringify(result, null, 2) + '\n'); checkpoint();
    let service, mainWindow, origin, fatal = null, endpoint, generation, visibilityTimer;
    const clients = [], windows = [], loads = [], stagedKeys = new Map();
    const deadline = setTimeout(() => {fatal = Error('owned-run-deadline');}, 90000);
    async function until(predicate, label, timeout = 12000) {
        const end = Date.now() + timeout;
        do {if (fatal) throw fatal; if (await predicate()) return; await delay(25);} while (Date.now() < end);
        throw Error('timeout:' + label);
    }
    async function call(op, payload = {}) {
        const scoped = ['set-property', 'set-properties', 'get-property', 'command', 'range-context', 'range-preload', 'range-cancel-next'].includes(op);
        const response = await service.call(op, scoped ? {...payload, generationId: generation} : payload, endpoint);
        if (op === 'begin-generation') generation = response.generationId; return response;
    }
    const snapshot = () => cacheSnapshot(selected.directories.cache, support.LIMITS.maxBytes);
    async function stage(item, label) {
        await call('begin-generation', {label});
        const source = origin.origin + '/Videos/' + item + '/stream.avi?Static=true&PlaySessionId=' + phase + '-' + label;
        const context = {source, serverOrigin: origin.origin, serverId: 'synthetic-loopback-server', accountId: 'anonymous-fixture', itemId: item,
            mediaSourceId: item + '-avi-1', playSessionId: phase + '-' + label, mode: 'DirectPlay', mediaType: 'Video', container: 'avi', live: false};
        assert.equal((await call('range-context', {context})).value.state, 'ready');
        const {parseContext} = require(path.join(plan.runtime, 'electronapp', 'enhanced', 'playback-range-session.js'));
        const {identityKey} = require(path.join(plan.runtime, 'electronapp', 'enhanced', 'playback-range-store.js'));
        const proof = plan.fixtures.find(row => row.file === item + '.avi');
        stagedKeys.set(source, identityKey(parseContext(context).identity, {total: proof.size, etag: proof.etag})); return source;
    }
    async function play(source, item) {
        await call('set-properties', {entries: [{name: 'pause', value: false}, {name: 'volume', value: 0}]});
        await call('command', {data: ['loadfile', source]});
        assert(loads.length && loads.at(-1).source !== source && /^http:\/\/127\.0\.0\.1:\d+\//.test(loads.at(-1).source), 'actual controller loadfile uses the private cache route');
        await until(() => clients.at(-1).state.fileLoaded && clients.at(-1).timeline.some(e => e.action === 'ACCEPT' && e.name === 'core-idle' && e.value === false && e.generationId === generation), 'generation-file-loaded:' + item);
        await until(async () => (await call('get-property', {name: 'core-idle'})).value === false && (await call('get-property', {name: 'time-pos'})).value >= 0.25, 'native-media-advance:' + item);
        const video = (await call('get-property', {name: 'video-out-params'})).value;
        assert(video && video.w === 320 && video.h === 180, 'native decoded video dimensions');
        const vo = (await call('get-property', {name: 'current-vo'})).value;
        assert.equal(vo, 'gpu-next', 'unchanged production video output');
        await until(() => {try {const s = snapshot(); return s.index.lastKey === stagedKeys.get(source) && !!s.index.entries[s.index.lastKey];} catch (_) {return false;}}, 'actual-start-promotion');
        return {video, vo, generation};
    }
    async function stop() {
        await call('command', {data: ['stop']});
        await until(() => clients.at(-1).currentGenerationId === null, 'native-stop-generation');
    }
    try {
        await app.whenReady();
        class HiddenWindow extends BrowserWindow {
            constructor(options) {assert.equal(options.show, false, 'all constructors require hidden windows'); super(options); protectHiddenWindow(this); windows.push(this);}
        }
        mainWindow = new HiddenWindow({show: false, focusable: false, skipTaskbar: true, width: 320, height: 180,
            webPreferences: {sandbox: true, nodeIntegration: false, contextIsolation: true}});
        visibilityTimer = setInterval(() => {
            for (const window of windows) if (!window.isDestroyed() && window.isVisible()) {window.hide(); fatal = Error('unexpected-window-visibility');}
        }, 25);
        const old = phase === 'reopen' ? JSON.parse(fs.readFileSync(path.join(plan.out, 'populate.json'))) : null;
        if (old) assert.notEqual(old.pid, process.pid, 'separate Electron process');
        origin = await fixtureServer(plan, old ? old.originPort : 0); result.originPort = origin.port;
        const bundled = path.join(plan.runtime, 'electronapp', 'native-helper');
        const {NativeHelperClient} = require(path.join(bundled, 'controller.js'));
        class TracedClient extends NativeHelperClient {
            constructor(options) {super(options); clients.push(this); this.smokeRecord = {pid: null, exited: false, handshake: null}; result.helpers.push(this.smokeRecord);}
            async start() {const started = super.start(); this.smokeRecord.pid = this.child && this.child.pid; checkpoint(); const value = await started; this.smokeRecord.handshake = this.handshake; checkpoint(); return value;}
            load(args) {loads.push({source: args[1], generation: this.currentGenerationId}); return super.load(args);}
        }
        const {createService} = require(path.join(bundled, 'service.js'));
        service = createService({electron: {BrowserWindow: HiddenWindow}, NativeHelperClient: TracedClient, getMainWindow: () => mainWindow,
            getWebContents: () => mainWindow.webContents, runtimeRoot: plan.runtime, rangeCache: selected.config});
        const created = await service.call('create'); endpoint = created.endpointId; result.handshake = created;
        await call('observe', {properties: ['core-idle', 'time-pos', 'duration', 'pause']});
        if (old) {
            const before = snapshot(); assert.equal(before.index.lastKey, old.lastKey);
            assert.deepEqual(before.index.entries[old.lastKey].blocks, old.blocks, 'cross-process disk bytes unchanged');
            assert(before.index.entries[old.lastKey].blocks['0'], 'prefix block required for deterministic reuse proof');
        }
        const a = await stage('A', phase + '-A'), startRow = origin.rows.length;
        result.checks.nativeA = await play(a, 'A');
        await stop();
        const stoppedA = snapshot(), keyA = stoppedA.index.lastKey;
        assert(keyA && stoppedA.index.entries[keyA].blocks['0']); assert(stoppedA.bytes > 0 && stoppedA.bytes < plan.fixtures[0].size, 'partial media only');
        result.checks.stopRetains = true;
        if (!old) {result.lastKey = keyA; result.blocks = stoppedA.index.entries[keyA].blocks;}
        else {
            assert.equal(keyA, old.lastKey);
            const requests = origin.rows.slice(startRow).filter(row => row.item === 'A');
            assert(requests.some(row => row.start === 0 && row.end === 0), 'fresh version/authorization eligibility probe');
            assert(!requests.some(row => row.start === 0 && row.end > 0), 'helper consumed the retained first block without fetching it again');
            result.checks.crossProcessRangeReuse = {retainedPrefixBlock: true, freshProbe: true, refetchedPrefixBlock: false};
            const b = await stage('B', 'prepare-only-B');
            assert.equal(snapshot().index.lastKey, keyA, 'context/browsing preparation does not clear last');
            result.checks.preparationPreservesLast = true;
            result.checks.nativeB = await play(b, 'B');
            await until(() => {const s = snapshot(); return s.index.lastKey !== keyA && !s.index.entries[keyA];}, 'other-actual-play-clears-A');
            const keyB = snapshot().index.lastKey; result.checks.otherActualPlayClears = true;
            // Stall a missing raw block before any A playback; probes still complete.
            const cancelledSource = await stage('A', 'cancel-held-A'); origin.hold(row => row.item === 'A' && row.end > row.start);
            const retiredGeneration = generation;
            await call('command', {data: ['loadfile', cancelledSource]});
            await until(() => !!origin.held(), 'origin-held-range');
            await stop();
            await until(() => origin.held().row.closed, 'origin-request-physically-cancelled', 6000);
            assert.equal(origin.held().row.bytesScheduled, 0);
            const replacement = await stage('B', 'after-cancel-B'); result.checks.afterCancelNativeB = await play(replacement, 'B');
            await until(() => !!snapshot().index.entries[keyB].blocks['0'], 'replacement-B-prefix-committed');
            origin.held().release(); await delay(100);
            assert.equal(snapshot().index.lastKey, keyB); assert.equal(generation, clients.at(-1).currentGenerationId); assert.notEqual(generation, retiredGeneration);
            assert(!snapshot().index.entries[keyA], 'late cancelled response cannot resurrect previous video');
            result.checks.cancelAndLateResponse = {physicalOriginClose: true, lateBytes: origin.held().row.bytesScheduled, authoritativeGeneration: generation};
            await stop(); result.lastKey = keyB;
        }
        await service.destroy(); service = null;
        for (const client of clients) {await client.exitPromise; assert(client.exited); client.smokeRecord.exited = true;}
        assert.equal(clients.flatMap(client => client.timeline).filter(e => e.action === 'ACCEPT' && ['file-loaded', 'core-idle', 'time-pos'].includes(e.name) && e.generationId !== e.currentAuthoritativeGeneration).length, 0, 'no stale media event accepted');
        result.checks.noStaleMediaEvents = true;
        assert.equal(origin.active.size, 0); assert(!fs.existsSync(path.join(selected.directories.cache, 'lock')));
        assert(!fs.readdirSync(selected.directories.cache).some(name => name.endsWith('.pending')));
        const closed = snapshot(); assert.equal(closed.index.lastKey, result.lastKey); result.committedBytes = closed.bytes;
        result.checks.ownedHelperExitAndCacheClose = true;
        assert(windows.every(w => w.isDestroyed() || !w.isVisible())); assert(!fatal);
        result.status = 'passed';
    } catch (error) {result.status = 'failed'; result.error = String(error.message).slice(0, 300);}
    finally {
        clearInterval(visibilityTimer); clearTimeout(deadline);
        // Keep ownership even on failure; teardown errors prevent PASS and are retained.
        const errors = [];
        if (service) {try {await service.destroy();} catch (error) {errors.push('service:' + error.message);}}
        for (const client of clients) {
            try {if (!client.exited) await client.kill(); await client.exitPromise; client.smokeRecord.exited = client.exited;}
            catch (error) {errors.push('helper:' + error.message);}
        }
        if (origin) {result.originRequests = origin.rows; try {await origin.close();} catch (error) {errors.push('origin:' + error.message);}}
        for (const window of windows) if (!window.isDestroyed()) window.destroy();
        if (errors.length) {result.status = 'failed'; result.cleanupErrors = errors;}
        checkpoint(); support.writeNew(output, result); app.exit(result.status === 'passed' ? 0 : 1);
    }
}
if (require.main === module) main(process.argv.slice(2)).catch(error => {console.error(error.message); process.exitCode = 1; if (process.versions.electron) require('electron').app.exit(1);});
module.exports = {protectHiddenWindow, fixtureServer, cacheSnapshot};
