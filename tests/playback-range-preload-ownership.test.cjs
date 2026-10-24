'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {createRequire} = require('node:module');
const {EventEmitter} = require('node:events');
const servicePath = path.resolve(__dirname, '../src/electronapp/native-helper/service.js');
const serviceSource = fs.readFileSync(process.env.ETE_RANGE_SERVICE_SOURCE || servicePath, 'utf8');
const sessionModule = require('../src/electronapp/enhanced/playback-range-session');
function deferred() {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};}
const flush = async () => {for (let i = 0; i < 20; i++) await Promise.resolve();};
function fixture(t) {
    const started = [], helpers = [];
    const cache = {async open({source, identity}) {
        return {source, async markPlaying() {}, async stop() {}, async prefetch() {started.push(identity.itemId); return {bytes: 4};}};
    }, async discardNext() {}, async discardLastUnless() {}, async close() {}};
    const requireService = createRequire(servicePath), exported = {exports: {}};
    const sandbox = {module: exported, exports: exported.exports, __dirname: path.dirname(servicePath), process, console, Buffer, setTimeout, clearTimeout,
        require(name) {
            if (name === '../enhanced/playback-range-session') return {createSession: options => sessionModule.createSession({...options, create: async () => cache})};
            return requireService(name);
        }};
    // Entire production service plus production session; only I/O/property responders are in memory.
    vm.runInNewContext(serviceSource, sandbox, {filename: 'service.js#candidate-properties'});
    class Window extends EventEmitter {
        constructor() {super(); this.webContents = {isDestroyed: () => false, send() {}};}
        getBounds() {return {x: 0, y: 0, width: 320, height: 180};} setBounds() {} getNativeWindowHandle() {return Buffer.from([1, 0, 0, 0]);}
        isDestroyed() {return false;} isVisible() {return false;} isMinimized() {return false;} setMenu() {} loadURL() {} hide() {} showInactive() {} destroy() {this.emit('closed');}
    }
    class Helper {
        constructor(options) {helpers.push(this); this.options = options; this.handshake = {helperVersion: 'fixture', libmpvVersion: 'fixture'}; this.currentGenerationId = null; this.state = {playing: false}; this.gets = [];}
        async start() {return this;} beginGeneration() {return this.currentGenerationId = 1;} retireGeneration() {this.currentGenerationId = null;}
        allocateGenerationId() {return 2;} command() {} setProperty() {} submitCommand() {}
        getProperty(name) {const row = {...deferred(), name, done: false}; this.gets.push(row); return row.promise;}
        load() {return {generationId: this.currentGenerationId, promise: Promise.resolve({})};}
        play() {this.state.playing = true; this.options.onEvent({name: 'core-idle', value: false, generationId: this.currentGenerationId});}
        async stop() {this.currentGenerationId = null;}
        async kill() {this.exited = true; for (const row of this.gets) if (!row.done) {row.done = true; row.reject(Error('fixture-helper-exited'));}}
        crash() {this.transportTerminated = true; this.options.onTerminal({name: 'process-exit-terminal'});}
    }
    const main = new Window();
    const service = exported.exports.createService({electron: {BrowserWindow: Window}, NativeHelperClient: Helper, fs: {existsSync: () => true},
        getMainWindow: () => main, getWebContents: () => main.webContents, runtimeRoot: path.resolve('fixture-runtime'),
        rangeCache: {maxBytes: 1024, minFreeBytes: 0, blockBytes: 4, timeoutMs: 1000, bytesPerSecond: 1024}});
    t.after(() => service.destroy());
    let endpoint, generationId, sequence = 0;
    const current = {source: 'https://fixture.invalid/Videos/current/stream.mp4?Static=true', serverOrigin: 'https://fixture.invalid', serverId: 'server', accountId: 'user',
        itemId: 'current', mediaSourceId: 'source-current', playSessionId: 'play', mediaType: 'Video', container: 'mp4', mode: 'DirectStream', live: false};
    function context(itemId) {return {...current, itemId, mediaSourceId: 'source-' + itemId, source: 'https://fixture.invalid/Videos/' + itemId + '/stream.mp4?Static=true'};}
    return {service, helpers, started,
        async begin() {
            endpoint = (await service.call('create')).endpointId;
            generationId = (await service.call('begin-generation', {requestEpoch: ++sequence}, endpoint)).generationId;
            await service.call('range-context', {generationId, context: current}, endpoint);
            await service.call('command', {generationId, data: ['loadfile', current.source]}, endpoint);
            helpers.at(-1).play(); await flush();
        },
        preload(itemId) {const job = service.call('range-preload', {generationId, context: context(itemId)}, endpoint); job.catch(() => {}); return job;},
        cancel() {return service.call('range-cancel-next', {generationId}, endpoint);},
        resolve(helper, offset = 0) {for (const row of helper.gets.slice(offset, offset + 2)) {row.done = true; row.resolve(row.name === 'duration' ? 100 : 80);}}
    };
}

test('cancel completed while properties are pending prevents the obsolete candidate taking the next slot', async t => {
    const f = fixture(t); await f.begin(); const helper = f.helpers[0];
    const old = f.preload('obsolete-next'); assert.equal(helper.gets.length, 2);
    await f.cancel(); f.resolve(helper); const oldResult = await old;
    const next = f.preload('current-next'); f.resolve(helper, 2); const nextResult = await next;
    assert.equal(nextResult.value.state, 'ready'); assert.equal(oldResult.value.state, 'cancelled'); assert.deepEqual(f.started, ['current-next']);
});
for (const first of ['old', 'new']) test('a replacement candidate retires the older property gate, response order=' + first, async t => {
    const f = fixture(t); await f.begin(); const helper = f.helpers[0];
    const old = f.preload('obsolete-next'), next = f.preload('replacement-next'); assert.equal(helper.gets.length, 4);
    if (first === 'old') {f.resolve(helper); await old; f.resolve(helper, 2);} else {f.resolve(helper, 2); await next; f.resolve(helper);}
    const [oldResult, nextResult] = await Promise.all([old, next]);
    assert.equal(oldResult.value.state, 'cancelled'); assert.equal(nextResult.value.state, 'ready'); assert.deepEqual(f.started, ['replacement-next']);
});
test('an old helper property response cannot start a candidate on a replacement helper with the same numeric generation', async t => {
    const f = fixture(t); await f.begin(); const oldHelper = f.helpers[0], old = f.preload('old-helper-next');
    // Preserve the old responders so their deliberately delayed callbacks can arrive after actual replacement.
    const oldGets = oldHelper.gets.splice(0); oldHelper.crash(); await flush(); await f.begin();
    const helper = f.helpers[1], next = f.preload('new-helper-next'); f.resolve(helper); await next;
    for (const row of oldGets) {row.done = true; row.resolve(row.name === 'duration' ? 100 : 80);}
    assert.notEqual((await old).value.state, 'ready'); assert.deepEqual(f.started, ['new-helper-next']);
});
test('a late failed property query does not clear the newer candidate or cause a second preload', async t => {
    const f = fixture(t); await f.begin(); const helper = f.helpers[0], old = f.preload('obsolete-next'); await f.cancel();
    const next = f.preload('current-next'); f.resolve(helper, 2); assert.equal((await next).value.state, 'ready');
    for (const row of helper.gets.slice(0, 2)) {row.done = true; row.reject(Error('fixture-late-property-failure'));}
    await assert.rejects(old, /fixture-late-property-failure/); assert.deepEqual(f.started, ['current-next']);
});
