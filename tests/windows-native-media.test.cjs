'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {EventEmitter} = require('node:events'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const adapter = require('../src/electronapp/enhanced/windows-native-media');
const {NATIVE_CHANNEL, NATIVE_SESSION_CHANNEL} = require('../src/electronapp/enhanced/windows-media-renderer');
const drain = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, overrides = {}) {
    const window = new EventEmitter(), ipc = new EventEmitter(), handlers = new Map(), calls = [], commands = [];
    window.webContents = new EventEmitter();
    window.webContents.mainFrame = {url: pathToFileURL(path.resolve(__dirname, '../src/electronapp/www/index.html')).href};
    window.webContents.isDestroyed = () => false; window.isDestroyed = () => false;
    window.getNativeWindowHandle = () => {const b = Buffer.alloc(8); b.writeBigUInt64LE(1n); return b;};
    ipc.handle = (name, callback) => handlers.set(name, callback); ipc.removeHandler = name => handlers.delete(name);
    let minimized = false, sourceReads = 0, captures = 0, artworkWrites = 0, updates = 0, clears = 0, time = 0, scheduled;
    const video = {webContents: {}, isDestroyed: () => false, isVisible: () => !minimized, getNativeWindowHandle: window.getNativeWindowHandle};
    window.isMinimized = () => minimized;
    const event = {sender: window.webContents, senderFrame: window.webContents.mainFrame};
    const opaqueOldPixels = Buffer.alloc(800);
    for (let offset = 0; offset < opaqueOldPixels.length; offset += 4) opaqueOldPixels.set([19, 67, 213, 255], offset);
    let request, imageReader;
    const controller = adapter.attach({window, ipcMain: ipc, koffi: {},
        getVideoWindow() {sourceReads++; return video;},
        // Deliberately offer successful nonzero pixels without a presentation
        // fence. Accepting these pixels would reproduce the old-media leak.
        createDwm: () => ({clientSize: () => ({width:20, height:10}), async capture() {captures++; return {accepted:true, pixels:opaqueOldPixels};}}),
        createBindings: () => ({}),
        createSmtc: overrides.create || (async (_bindings, _hwnd, options) => {
            commands.push(options.onCommand); return {
                update() {updates++;calls.push('update');}, clearArtwork() {calls.push('clear-artwork');},
                async setArtwork() {artworkWrites++;}, async dispose() {calls.push('dispose');}
            };
        }),
        attachThumbnail: (_window, _dwm, getImage, _onError, onRequest = () => {}) => {
            imageReader = getImage; request = onRequest;
            return {clear() {clears++;}, refresh() {calls.push('preview');}, dispose() {calls.push('preview-dispose');},
                requestedRecently: () => true, submitted:0};
        },
        clock: {now: () => time, setInterval(callback) {scheduled=callback;return 1;}, clearInterval() {scheduled=null;}},
        nativeImage: {createFromBitmap: (pixels, size) => ({pixels:Buffer.from(pixels), size,
            resize() {return this;}, getSize() {return size;}, isEmpty() {return false;}, toPNG() {return this.pixels;}})},
        // A legacy artwork option must not revive disk-cache reads/writes.
        artworkDirectory: overrides.artworkDirectory,
        sendCommand: value => calls.push('command:' + value)});
    t.after(() => controller.dispose());
    function token() {return handlers.get(NATIVE_SESSION_CHANNEL)(event).token;}
    const make = (extra = {}) => ({version:2, playbackEpoch:1, active:true, paused:false, title:'Fixture', mediaKey:'a'.repeat(64), mediaType:'Video',
        duration:100, position:1, rate:1, sequence:1, sessionToken:token(), ...extra});
    return {controller, window, ipc, handlers, event, make, token, calls, commands,
        get updates() {return updates;}, get clears() {return clears;},
        get captureCalls() {return captures;}, get sourceReads() {return sourceReads;}, get artworkWrites() {return artworkWrites;},
        get timerScheduled() {return !!scheduled;}, readPreview() {return imageReader();}, request() {request();},
        minimize() {minimized=true;window.emit('minimize');}, restore() {minimized=false;window.emit('restore');},
        async tick(ms = 1000) {time+=ms;if (scheduled) scheduled();await drain();},
        send(value, source = event) {ipc.emit(NATIVE_CHANNEL, source, value);}};
}
function assertNeutral(image) {
    assert.ok(image);
    for (let offset = 0; offset < image.pixels.length; offset += 4) {
        assert.equal(image.pixels.readUInt32LE(offset), 0xff000000);
    }
    assert.deepEqual(image.size, {width:640, height:360});
}
const stopped = {active:false, paused:false, title:'', mediaKey:'', mediaType:'', duration:0, position:0};

test('native snapshots reject untrusted senders, extra fields and invalid ranges', async t => {
    const f = fixture(t);
    for (const extra of [{version:1}, {playbackEpoch:0}, {title:'a\nprivate'}, {mediaKey:'../file'}, {position:Infinity}, {position:101}, {rate:0}, {command:'arbitrary'}, {sequence:0}]) {
        assert.equal(adapter.valid(f.make(extra)), false); f.send(f.make(extra));
    }
    f.send(f.make(), {sender:{}, senderFrame:f.event.senderFrame});
    f.send(f.make(), {sender:f.event.sender, senderFrame:{url:'https://example.invalid'}});
    await drain(); assert.equal(f.updates, 0);
});

test('unproven successful colored PrintWindow pixels cannot become a current-media preview or artwork', async t => {
    const f = fixture(t); f.send(f.make()); await drain();
    assertNeutral(f.controller.previewImage()); assertNeutral(f.readPreview());
    assert.equal(f.sourceReads, 0); assert.equal(f.captureCalls, 0); assert.equal(f.artworkWrites, 0);
    assert.equal(f.controller.status().captured, 0); assert.equal(f.controller.status().previewReady, false);
    assert.equal(f.controller.status().previewMode, 'neutral-unverified');
    assert.equal(f.controller.status().captureBlockedReason, 'native-frame-ownership-unproven');
});

test('current metadata and native commands keep the original input route without enabling pixel capture', async t => {
    const f = fixture(t); f.send(f.make()); await drain(); assert.equal(f.updates, 1);
    assert.ok(f.calls.indexOf('clear-artwork') < f.calls.indexOf('update'));
    f.commands[0]('pause'); f.commands[0]('arbitrary');
    assert.ok(f.calls.includes('command:pause')); assert.ok(!f.calls.includes('command:arbitrary'));
    f.send(f.make({...stopped, sequence:2})); await drain(); f.commands[0]('play');
    assert.equal(f.controller.previewImage(), null); assert.equal(f.controller.status().ready, false);
    assert.ok(!f.calls.includes('command:play'));
});

test('document reset rotates session token and rejects old-document snapshots and callbacks', async t => {
    const f = fixture(t), old = f.make(); f.send(old); await drain(); const command = f.commands[0];
    f.window.webContents.emit('did-start-navigation', {}, 'file:///fixture', false, true);
    assert.equal(f.controller.previewImage(), null); assert.notEqual(f.token(), old.sessionToken);
    f.send({...old, sequence:100}); await drain(); const before = f.updates;
    f.send(f.make()); command('pause'); await drain();
    assert.equal(f.updates, before + 1); assert.equal(f.calls.includes('command:pause'), false);
    f.commands.at(-1)('play'); assert.ok(f.calls.includes('command:play'));
});

test('same item replay and media switches stay neutral even when only old colored pixels are available', async t => {
    const f = fixture(t); f.send(f.make()); await drain(); assertNeutral(f.controller.previewImage());
    f.send(f.make({playbackEpoch:2, sequence:2})); await drain(); assertNeutral(f.controller.previewImage());
    f.send(f.make({mediaKey:'b'.repeat(64), playbackEpoch:3, sequence:3})); await drain(); assertNeutral(f.controller.previewImage());
    assert.equal(f.captureCalls, 0); assert.equal(f.controller.status().artworkReady, false);
    assert.ok(f.calls.includes('clear-artwork'));
});

test('DWM demand, arbitrary time and minimize/restore cannot open an unproven capture path', async t => {
    const f = fixture(t); f.minimize(); f.send(f.make()); await drain();
    assertNeutral(f.readPreview()); f.restore();
    for (let i = 0; i < 30; i++) {f.request();await f.tick(100000);}
    assertNeutral(f.readPreview());
    assert.equal(f.timerScheduled, false); assert.equal(f.sourceReads, 0); assert.equal(f.captureCalls, 0);
    assert.equal(f.controller.status().firstFrameAttempts, 0);
});

test('stop and audio remove neutral preview and the next active video only restores neutral content', async t => {
    const f = fixture(t); f.send(f.make()); await drain();
    f.send(f.make({...stopped, sequence:2})); assert.equal(f.controller.previewImage(), null); await drain();
    f.send(f.make({mediaType:'Audio', playbackEpoch:2, sequence:3})); await drain(); assert.equal(f.readPreview(), null);
    f.send(f.make({playbackEpoch:3, sequence:4})); await drain(); assertNeutral(f.readPreview());
});

test('late state from a retired playback epoch is rejected even with a higher IPC sequence', async t => {
    const f = fixture(t); f.send(f.make({playbackEpoch:2})); await drain(); const before = f.updates;
    f.send(f.make({playbackEpoch:1, sequence:2})); await drain(); assert.equal(f.updates, before);
    assert.equal(f.controller.status().sequence, 1); assertNeutral(f.readPreview());
});

test('subframe navigation and same-document routes do not retire the native session', async t => {
    const f = fixture(t); f.send(f.make()); await drain(); const token = f.token();
    f.window.webContents.emit('did-start-navigation', {}, 'https://example.invalid', false, false);
    f.window.webContents.emit('did-start-navigation', {}, 'file:///fixture#!/videoosd', true, true);
    await drain(); assert.equal(f.token(), token); assert.equal(f.controller.status().active, true);
});

test('crash and disposal retire preview immediately and detach every IPC listener', async t => {
    const f = fixture(t); f.send(f.make()); await drain(); f.window.webContents.emit('render-process-gone');
    assert.equal(f.readPreview(), null); await drain(); await f.controller.dispose();
    assert.equal(f.handlers.size, 0); assert.equal(f.ipc.listenerCount(NATIVE_CHANNEL), 0);
    f.request(); await f.tick(); assert.equal(f.readPreview(), null);
    assert.equal(f.controller.status().previewMode, 'inactive'); assert.equal(f.controller.status().ready, false);
});

test('shutdown drains pending SMTC startup without starting a video capture', async t => {
    let complete, releases = 0;
    const f = fixture(t, {create: () => new Promise(resolve => {complete=resolve;})});
    f.send(f.make()); await drain(); let settled = false;
    const closing = f.controller.dispose().then(() => {settled=true;});
    await drain(); assert.equal(settled, false); assert.equal(f.readPreview(), null); assert.equal(f.handlers.size, 0);
    complete({update() {throw Error('late update');}, async dispose() {releases++;}});
    await closing; assert.equal(releases, 1); assert.equal(f.captureCalls, 0);
    await f.controller.dispose(); assert.equal(releases, 1);
});

test('legacy artwork directory with old-media pixels is never read or rewritten', async t => {
    const fs = require('node:fs'), os = require('node:os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-unproven-artwork-'));
    const file = path.join(root, 'a'.repeat(64) + '.png'), canary = Buffer.from('old-user-frame-canary');
    fs.writeFileSync(file, canary);
    const f = fixture(t, {artworkDirectory:root});
    t.after(async () => {await f.controller.dispose();fs.rmSync(root, {recursive:true, force:true});});
    f.send(f.make()); await drain(); f.send(f.make({playbackEpoch:2, sequence:2})); await drain();
    assert.deepEqual(fs.readdirSync(root), [path.basename(file)]); assert.deepEqual(fs.readFileSync(file), canary);
    assert.equal(f.artworkWrites, 0); assertNeutral(f.readPreview());
});
