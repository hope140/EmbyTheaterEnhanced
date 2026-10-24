'use strict';
// Integration evidence only: real Alameda/PM/queue/adapter/service/HTTP/store,
// with an explicitly synthetic helper clock and document. No native decode claim.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const {EventEmitter} = require('node:events'), {execFileSync} = require('node:child_process');
const tool = require('../tools/playback-prefix-windows-auto.cjs');
const {createService} = require('../src/electronapp/native-helper/service');
const repo = path.resolve(__dirname, '..');
const waitFor = async (predicate, detail) => {
    const deadline = Date.now() + 4000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert(predicate(), detail());
};
async function automaticCase(t, scenario) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-alameda-next-'))), trace = [], timers = new Set();
    const record = (type, data = {}) => trace.push({seq: trace.length, type, ...data});
    const fixtures = ['A', 'B'].map(id => {const file = id + '.avi'; fs.writeFileSync(path.join(root, file), Buffer.from(id.repeat(40))); return {file, size: 40, etag: '"synthetic-' + id + '"'};});
    const origin = await tool.fixtureServer({out: root, fixtures}, record);
    const managerFile = path.join(root, 'playbackmanager.js');
    fs.copyFileSync(path.join(repo, 'vendor/web-snapshot/www/modules/common/playback/playbackmanager.js'), managerFile);
    execFileSync(process.execPath, [path.join(repo, 'tools/patch-playbackmanager.cjs'), managerFile]);
    let listener, generation = 0, service;
    const contexts = new Map(), clients = [], documentTimers = new Set();
    class Window extends EventEmitter {
        constructor() {super(); this.webContents = {isDestroyed: () => false, send: (_channel, value) => listener?.(value)}; this.destroyed = false;}
        getBounds() {return {x: 0, y: 0, width: 320, height: 180};} setBounds() {} setMenu() {} loadURL() {return Promise.resolve();}
        getNativeWindowHandle() {const value = Buffer.alloc(8); value.writeBigUInt64LE(1n); return value;}
        isDestroyed() {return this.destroyed;} isVisible() {return false;} isMinimized() {return false;} hide() {} showInactive() {} moveTop() {}
        destroy() {this.destroyed = true; this.emit('closed');}
    }
    class SyntheticClient {
        constructor(options) {this.options = options; this.currentGenerationId = null; this.exited = false; this.handshake = {helperVersion: 'SYNTHETIC', libmpvVersion: 'SYNTHETIC'}; this.properties = {}; clients.push(this);}
        async start() {return this;}
        beginGeneration() {this.currentGenerationId = ++generation; return generation;}
        allocateGenerationId() {return ++generation;}
        retireGeneration() {clearInterval(this.clock); this.currentGenerationId = null;}
        command() {} submitCommand() {} setProperty(name, value) {this.properties[name] = value;}
        async getProperty(name) {return this.properties[name] ?? false;}
        async request() {return {attached: true};}
        emit(name, value) {this.properties[name] = value; const event = {generationId: this.currentGenerationId, name, value}; record('synthetic-property', event); this.options.onEvent(event);}
        load(args) {
            const id = contexts.get(this.currentGenerationId), gen = this.currentGenerationId;
            record('load', {item: id, generation: gen, source: args[1]});
            const promise = (async () => {
                const before = trace.length;
                assert.equal(Buffer.from(await (await fetch(args[1], {headers: {Range: 'bytes=0-7'}})).arrayBuffer()).toString(), id.repeat(8));
                record('synthetic-read', {item: id, before});
                this.emit('duration', 8); this.emit('time-pos', 0); this.emit('core-idle', false);
                if (id === 'B') return;
                let position = 0;
                this.clock = setInterval(() => {
                    if (this.currentGenerationId !== gen) {clearInterval(this.clock); return;}
                    position = Math.min(scenario === 'natural' ? 8 : 7.6, position + 0.2); this.emit('time-pos', position);
                    if (position >= 8) {clearInterval(this.clock); this.emit('eof-reached', true);}
                }, 10); timers.add(this.clock);
            })();
            return {generationId: gen, promise};
        }
        async stop() {clearInterval(this.clock); this.currentGenerationId = null;}
        async kill() {await this.stop(); this.exited = true;}
    }
    const main = new Window();
    service = createService({electron: {BrowserWindow: Window}, NativeHelperClient: SyntheticClient, fs: {existsSync: () => true},
        getMainWindow: () => main, getWebContents: () => main.webContents, execFile: (_file, _args, _options, callback) => {callback(null); return {kill() {}};},
        runtimeRoot: root, rangeCache: {...tool.CONFIG, blockBytes: 8, root: path.join(root, 'prefix'), onPrefixRead: value => record('prefix-read', value)}});
    const eventTarget = new EventTarget();
    const body = {insertBefore(element) {element.parentNode = body;}, removeChild(element) {element.parentNode = null;}, firstChild: null};
    const document = {body, querySelector: () => null};
    const window = {document, console: {log() {}, warn() {}, error() {}}, URL, AbortController, TextDecoder, Event, CustomEvent,
        setTimeout, clearTimeout, setInterval(callback, ms) {const timer = setInterval(callback, ms === 500 ? 20 : ms); documentTimers.add(timer); return timer;}, clearInterval,
        addEventListener: eventTarget.addEventListener.bind(eventTarget), removeEventListener: eventTarget.removeEventListener.bind(eventTarget), dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget), localStorage: {getItem: () => null, setItem() {}},
        innerWidth: 320, innerHeight: 180, MutationObserver: class {observe() {} disconnect() {}}, screen: {width: 640, height: 480}, fetch,
        prefixHarness: {report: row => record(row.type, row), source(member) {
            if (member === 'www/modules/common/playback/playbackmanager.js') return fs.readFileSync(managerFile, 'utf8');
            return fs.readFileSync(path.join(repo, member.startsWith('www/') ? 'vendor/web-snapshot' : 'src/electronapp', member), 'utf8');
        }, async invoke(_channel, request) {
            record('ipc', {operation: request.operation});
            if (request.operation === 'range-context' && request.payload.context) contexts.set(request.payload.generationId, request.payload.context.itemId);
            const result = await service.call(request.operation, request.payload, request.endpointId);
            if (request.operation === 'range-preload') record('preload-result', result.value);
            return result;
        }, send(channel, request) {
            if (channel === 'enhanced-native-helper-notify') service.notify(request.operation, request.payload, request.endpointId);
        }, listen(callback) {listener = callback;}, unlisten() {listener = null;}}};
    window.window = window; vm.createContext(window);
    document.createElement = name => {
        if (name !== 'script') return {style: {}, classList: {add() {}, remove() {}}, parentNode: null};
        const listeners = new Map();
        return {addEventListener(name, callback) {listeners.set(name, [...(listeners.get(name) || []), callback]);}, fire(name) {for (const callback of listeners.get(name) || []) callback();}};
    };
    document.head = {appendChild(script) {
        script.src = new URL(script.src, 'file:///fixture/electronapp/www/').href;
        const member = new URL(script.src).pathname.split('/electronapp/')[1];
        queueMicrotask(() => {try {vm.runInContext(window.prefixHarness.source(member), window, {filename: member}); script.fire('load');} catch (error) {record('script-error', {member, error: error.message}); script.fire('error');}});
    }};
    t.after(async () => {
        for (const timer of [...timers, ...documentTimers]) clearInterval(timer);
        if (window.prefixStop) await window.prefixStop(); await service.destroy(); await origin.close();
        assert.deepEqual(fs.readdirSync(path.join(root, 'prefix')), ['owner']); fs.rmSync(root, {recursive: true, force: true});
    });
    await vm.runInContext('(' + tool.rendererBoot.toString() + ')(' + JSON.stringify({origin: origin.origin, windowId: '1', moduleBaseUrl: 'file:///fixture/electronapp/www/'}) + ')', window);
    const details = () => JSON.stringify(trace.slice(-30));
    assert(!trace.some(row => row.type === 'renderer-failure'), details());
    if (scenario !== 'natural') {
        await waitFor(() => trace.some(row => row.type === 'preload-result' && row.state === 'ready'), details);
        assert.equal(service.rangeStatus().diskBytes, 40);
        if (scenario === 'remove-candidate') {
            const manager = (await window.require(['playbackManager']))[0], queue = manager._playQueueManager;
            queue.removeFromPlaylist([queue.getNextItemInfo().item.PlaylistItemId]);
            await waitFor(() => service.rangeStatus().diskBytes === 0, details);
            assert(!trace.some(row => row.type === 'manager-next-track'), details());
        } else {
            await window.prefixStop(); await service.destroy();
            assert.equal(service.rangeStatus().diskBytes, 0);
            assert.deepEqual(fs.readdirSync(path.join(root, 'prefix')), ['owner']);
        }
        assert.equal(trace.filter(row => row.type === 'manager-play-invocation').length, 1);
        assert.equal(trace.filter(row => row.type === 'load').length, 1);
        return;
    }
    await waitFor(() => trace.some(row => row.type === 'synthetic-read' && row.item === 'B'), details);
    assert.equal(trace.filter(row => row.type === 'manager-play-invocation').length, 1);
    const preload = trace.find(row => row.type === 'ipc' && row.operation === 'range-preload'), ready = trace.find(row => row.type === 'preload-result');
    const threshold = trace.find(row => row.type === 'synthetic-property' && row.name === 'time-pos' && row.value >= 5.6);
    const eof = trace.find(row => row.type === 'synthetic-property' && row.name === 'eof-reached'), next = trace.find(row => row.type === 'manager-next-track');
    const b = trace.find(row => row.type === 'load' && row.item === 'B');
    assert(threshold && preload && ready && eof && next && b, JSON.stringify(trace));
    assert(threshold.seq < preload.seq && preload.seq < ready.seq && ready.seq < eof.seq && eof.seq < next.seq && next.seq < b.seq, details());
    assert.equal(ready.state, 'ready'); assert.equal(ready.bytes, 40);
    assert(trace.some(row => row.type === 'prefix-read' && row.itemId === 'B' && row.start === 0 && row.seq > b.seq), details());
    const fresh = trace.filter(row => row.type === 'origin-media' && row.item === 'B' && row.seq > eof.seq);
    assert(fresh.length > 0 && fresh.every(row => row.start === 0 && row.end === 0), details());
    assert(service.rangeStatus().diskBytes <= 100000000);
}
for (const scenario of ['natural', 'remove-candidate', 'app-exit-before-next']) test('real Alameda automatic next-prefix with synthetic helper/document: ' + scenario, {timeout: 8000}, t => automaticCase(t, scenario));
