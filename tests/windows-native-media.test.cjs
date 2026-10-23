'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {EventEmitter} = require('node:events'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const adapter = require('../src/electronapp/enhanced/windows-native-media');
const {NATIVE_CHANNEL, NATIVE_SESSION_CHANNEL} = require('../src/electronapp/enhanced/windows-media-renderer');
const drain = () => new Promise(resolve => setImmediate(resolve));
function frame(color = 48) {
    const pixels = Buffer.alloc(800, color);
    for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
    return {accepted: true, pixels};
}
function fixture(t, overrides = {}) {
    const window = new EventEmitter(), ipc = new EventEmitter(), handlers = new Map(), calls = [];
    window.webContents = new EventEmitter();
    window.webContents.mainFrame = {url: pathToFileURL(path.resolve(__dirname, '../src/electronapp/www/index.html')).href};
    window.webContents.isDestroyed = () => false;
    window.isDestroyed = () => false;
    window.getNativeWindowHandle = () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(1n); return b; };
    ipc.handle = (name, callback) => handlers.set(name, callback); ipc.removeHandler = name => handlers.delete(name);
    const video = {isDestroyed: () => false, getNativeWindowHandle: window.getNativeWindowHandle};
    let minimized = false, visible = true, time = 0, tick, request, currentVideo = video;
    window.isMinimized = () => minimized; video.isVisible = () => visible;
    const event = {sender: window.webContents, senderFrame: window.webContents.mainFrame};
    let command, updates = 0, clears = 0;
    const commands = [];
    const controller = adapter.attach({window, ipcMain: ipc, koffi: {}, getVideoWindow: () => currentVideo,
        clock: {now: () => time, setInterval(callback) { tick = callback; return 1; }, clearInterval() { tick = null; }},
        createBindings: () => ({}), createDwm: () => ({clientSize: () => ({width: 20, height: 10}),
            capture: overrides.capture || (async () => frame())}),
        createSmtc: overrides.create || (async (_b, _h, options) => { command = options.onCommand; commands.push(command); return {
            update(value) { updates++; calls.push(value.active ? 'update' : 'inactive'); }, async dispose() { calls.push('dispose'); }}; }),
        attachThumbnail: (_window, _dwm, _getImage, _onError, onRequest) => { request = onRequest; return {clear() { clears++; }, refresh() { calls.push('preview'); }, dispose() { calls.push('preview-dispose'); }, submitted: 0, requestedRecently: () => overrides.demand !== false}; },
        nativeImage: {createFromBitmap: (pixels, size) => ({pixels: Buffer.from(pixels), size, resize() { return this; }})}, sendCommand: value => calls.push('command:' + value)});
    t.after(() => controller.dispose());
    function token() { return handlers.get(NATIVE_SESSION_CHANNEL)(event).token; }
    const make = (extra = {}) => ({version: 1, active: true, paused: false, title: 'Fixture', mediaKey: 'a'.repeat(64), mediaType: 'Video',
        duration: 100, position: 1, rate: 1, sequence: 1, sessionToken: token(), ...extra});
    return {controller, window, ipc, handlers, calls, event, make, token, commands, minimize() {minimized=true;}, restore() {minimized=false;}, hide() {visible=false;}, show() {visible=true;},
        replaceVideo() { currentVideo = {...video}; }, request() { request(); },
        async tick(ms = 1000) { time += ms; if (tick) tick(); await drain(); }, get updates() { return updates; }, get clears() { return clears; },
        send(value, source = event) { ipc.emit(NATIVE_CHANNEL, source, value); }, command(value) { command(value); }};
}

test('native snapshots reject untrusted senders, additional fields and invalid ranges', async t => {
    const f = fixture(t);
    for (const extra of [{version: 2}, {title: 'a\nprivate'}, {mediaKey: '../file'}, {position: Infinity}, {position: 101}, {rate: 0}, {command: 'arbitrary'}, {sequence: 0}]) {
        assert.equal(adapter.valid(f.make(extra)), false);
        f.send(f.make(extra));
    }
    f.send(f.make(), {sender: {}, senderFrame: f.event.senderFrame});
    f.send(f.make(), {sender: f.event.sender, senderFrame: {url: 'https://example.invalid'}});
    await drain(); assert.equal(f.updates, 0);
});

test('current native snapshots publish and commands stay with the original fixed input route', async t => {
    const f = fixture(t); f.send(f.make()); await drain();
    assert.equal(f.updates, 1); assert.equal(f.controller.status().captured, 1);
    f.command('pause'); f.command('arbitrary');
    assert.ok(f.calls.includes('command:pause')); assert.ok(!f.calls.includes('command:arbitrary'));
    f.send(f.make({active: false, paused: false, title: '', mediaKey: '', mediaType: '', duration: 0, position: 0, sequence: 2}));
    await drain(); f.command('play');
    assert.equal(f.controller.status().active, false); assert.equal(f.controller.status().ready, false);
    assert.ok(!f.calls.includes('command:play'));
});

test('document reset rotates the session token so queued old-document snapshots are rejected', async t => {
    const f = fixture(t), old = f.make();
    f.send(old); await drain(); const count = f.updates;
    f.window.webContents.emit('did-start-navigation', {}, 'file:///fixture', false, true); await drain();
    assert.notEqual(f.token(), old.sessionToken);
    f.send({...old, sequence: 100}); await drain(); assert.equal(f.updates, count);
    f.send(f.make()); await drain(); assert.equal(f.updates, count + 1);
});

test('late capture from retired media cannot publish into the new preview', async t => {
    let complete;
    const pending = new Promise(resolve => { complete = resolve; });
    const f = fixture(t, {capture: () => pending});
    f.send(f.make()); await drain();
    const refreshes = f.calls.filter(x => x === 'preview').length;
    f.send(f.make({active: false, paused: false, title: '', mediaKey: '', mediaType: '', duration: 0, position: 0, sequence: 2}));
    complete(frame()); await drain(); await drain();
    assert.equal(f.controller.status().captured, 0); assert.equal(f.calls.filter(x => x === 'preview').length, refreshes);
});

test('shutdown waits for owned capture and SMTC release and removes IPC ownership immediately', async t => {
    let complete;
    const f = fixture(t, {capture: () => new Promise(resolve => { complete = resolve; })});
    f.send(f.make()); await drain();
    let settled = false; const close = f.controller.dispose().then(() => { settled = true; });
    assert.equal(f.ipc.listenerCount(NATIVE_CHANNEL), 0); assert.equal(f.handlers.size, 0);
    await drain(); assert.equal(settled, false);
    complete(frame()); await close;
    assert.equal(settled, true); assert.equal(f.calls.filter(x => x === 'dispose').length, 1);
    await f.controller.dispose();
});

test('capture completed after minimization cannot replace the retained preview', async t => {
    let complete;
    const f=fixture(t,{capture:()=>new Promise(resolve=>{complete=resolve;})});
    f.send(f.make());await drain();f.minimize();complete(frame());
    await drain();assert.equal(f.controller.status().captured,0);assert.equal(f.controller.status().previewReady,false);assert.ok(f.controller.previewImage());
});

test('an old document cannot issue native commands when reset and new state coalesce', async t => {
    const f=fixture(t);f.send(f.make());await drain();const old=f.commands[0];
    f.window.webContents.emit('did-start-navigation', {}, 'file:///fixture', false, true);f.send(f.make());old('pause');await drain();await drain();
    assert.equal(f.calls.includes('command:pause'),false);assert.equal(f.commands.length,2);
    f.commands[1]('play');assert.equal(f.calls.includes('command:play'),true);
});

test('subframe navigation and same-document routes do not retire the native session', async t => {
    const f=fixture(t);f.send(f.make());await drain();const token=f.token();
    f.window.webContents.emit('did-start-navigation',{},'https://example.invalid',false,false);
    f.window.webContents.emit('did-start-navigation',{},'file:///fixture#!/videoosd',true,true);
    await drain();assert.equal(f.token(),token);assert.equal(f.controller.status().active,true);
});

test('blank first capture retries without counting placeholder as a captured video frame', async t => {
    let captures = 0;
    const f = fixture(t, {capture: async () => ++captures === 1 ? frame(0) : frame(72)});
    f.send(f.make()); await drain();
    const placeholder = f.controller.previewImage();
    assert.equal(f.controller.status().captured, 0);
    assert.equal(f.controller.status().blankFirstFrames, 1);
    assert.equal(f.controller.status().previewReady, false);
    assert.deepEqual([...placeholder.pixels.subarray(0, 8)], [0, 0, 0, 255, 0, 0, 0, 255]);
    await f.tick();
    assert.equal(f.controller.status().captured, 1);
    assert.equal(f.controller.status().previewReady, true);
    assert.notEqual(f.controller.previewImage(), placeholder);
    assert.equal(f.controller.previewImage().pixels[0], 72);
});

test('no pre-minimize frame and a minimized media switch keep an opaque current-media fallback', async t => {
    let captures = 0;
    const f = fixture(t, {capture: async () => { captures++; return frame(); }});
    f.minimize(); f.send(f.make()); await drain(); await f.tick();
    assert.equal(captures, 0); assert.ok(f.controller.previewImage());
    assert.equal(f.controller.status().previewReady, false);
    f.restore(); await f.tick();
    const first = f.controller.previewImage(); assert.equal(captures, 1);
    f.minimize(); await f.tick(); assert.equal(f.controller.previewImage(), first);
    f.send(f.make({mediaKey: 'b'.repeat(64), sequence: 2})); await drain();
    assert.notEqual(f.controller.previewImage(), first); assert.equal(f.controller.status().previewReady, false);
    await f.tick(); assert.equal(captures, 1);
    f.restore(); await f.tick();
    assert.equal(captures, 2); assert.equal(f.controller.status().previewReady, true);
});

test('media switch can capture immediately despite the previous media throttle', async t => {
    const f = fixture(t); f.send(f.make()); await drain();
    const first = f.controller.previewImage();
    f.send(f.make({mediaKey: 'b'.repeat(64), sequence: 2})); await drain();
    assert.equal(f.controller.status().captured, 2); assert.notEqual(f.controller.previewImage(), first);
});

test('rejected and hidden captures preserve the last frame, but later genuine black frames are allowed', async t => {
    let captures = 0;
    const f = fixture(t, {capture: async () => ++captures === 2 ? {accepted: false} : frame(captures === 3 ? 0 : 48)});
    f.send(f.make()); await drain(); const first = f.controller.previewImage();
    await f.tick(); assert.equal(f.controller.previewImage(), first);
    f.hide(); await f.tick(); assert.equal(captures, 2); assert.equal(f.controller.previewImage(), first);
    f.show(); await f.tick();
    assert.equal(f.controller.status().captured, 2); assert.equal(f.controller.previewImage().pixels[0], 0);
});

test('a replaced source window cannot publish its in-flight frame', async t => {
    let complete;
    const f = fixture(t, {capture: () => new Promise(resolve => { complete = resolve; })});
    f.send(f.make()); await drain(); const placeholder = f.controller.previewImage();
    f.replaceVideo(); complete(frame()); await drain();
    assert.equal(f.controller.previewImage(), placeholder); assert.equal(f.controller.status().captured, 0);
});

test('audio, stop and navigation remove both the video frame and placeholder', async t => {
    const f = fixture(t); f.send(f.make()); await drain();
    f.send(f.make({mediaType: 'Audio', sequence: 2})); await drain();
    assert.equal(f.controller.previewImage(), null);
    f.send(f.make({mediaKey: 'b'.repeat(64), sequence: 3})); await drain();
    f.window.webContents.emit('render-process-gone'); await drain();
    assert.equal(f.controller.previewImage(), null);
    await f.controller.dispose(); assert.equal(f.controller.previewImage(), null);
});
