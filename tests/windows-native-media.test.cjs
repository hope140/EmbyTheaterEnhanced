'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {EventEmitter} = require('node:events'), path = require('node:path');
const {pathToFileURL} = require('node:url');
const adapter = require('../src/electronapp/enhanced/windows-native-media');
const {NATIVE_CHANNEL, NATIVE_SESSION_CHANNEL} = require('../src/electronapp/enhanced/windows-media-renderer');
const drain = () => new Promise(resolve => setImmediate(resolve));
function fixture(t, overrides = {}) {
    const window = new EventEmitter(), ipc = new EventEmitter(), handlers = new Map(), calls = [], commands = [];
    const webContents = new EventEmitter(); let destroyed = false;
    Object.defineProperty(window, 'webContents', {get() {if (destroyed) throw new TypeError('Object has been destroyed');return webContents;}});
    webContents.mainFrame = {url: pathToFileURL(path.resolve(__dirname, '../src/electronapp/www/index.html')).href};
    webContents.isDestroyed = () => destroyed; window.isDestroyed = () => destroyed;
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
        previewSavings: overrides.previewSavings, captureIntervalMs:overrides.captureIntervalMs,
        getVideoWindow() {sourceReads++; return video;},
        capturePreview: overrides.capturePreview, isPreviewOwner: overrides.isPreviewOwner,
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
            return {clear() {clears++;if(overrides.onClear)overrides.onClear();}, refresh() {calls.push('preview');}, dispose() {calls.push('preview-dispose');},
                requestedRecently: () => overrides.demand !== false, submitted:0};
        },
        clock: {now: () => time, setInterval(callback) {scheduled=callback;return 1;}, clearInterval() {scheduled=null;}},
        nativeImage: {createFromBitmap: (pixels, size) => {if(size.width<=160)time+=overrides.imageMs||0;return {pixels:Buffer.from(pixels), size,
            resize() {return this;}, getSize() {return size;}, isEmpty() {return false;}, toPNG() {return this.pixels;}};}},
        // A legacy artwork option must not revive disk-cache reads/writes.
        artworkDirectory: overrides.artworkDirectory,
        sendCommand: value => calls.push('command:' + value.command)});
    t.after(() => controller.dispose().catch(error => {if(!overrides.cleanupError || !error.errors.includes(overrides.cleanupError))throw error;}));
    function token() {return handlers.get(NATIVE_SESSION_CHANNEL)(event).token;}
    const make = (extra = {}) => ({version:4, canPrevious:false, canNext:false, nativeOwner:null, playbackEpoch:1, active:true, paused:false, title:'Fixture', mediaKey:'a'.repeat(64), mediaType:'Video',
        duration:100, position:1, rate:1, sequence:1, sessionToken:token(), ...extra});
    return {controller, window, webContents, ipc, handlers, event, make, token, calls, commands,
        destroy() {destroyed=true;window.emit('closed');},
        get updates() {return updates;}, get clears() {return clears;},
        get captureCalls() {return captures;}, get sourceReads() {return sourceReads;}, get artworkWrites() {return artworkWrites;},
        get timerScheduled() {return !!scheduled;}, readPreview() {return imageReader();}, advance(ms) {time+=ms;}, request(info) {request(info);},
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
    f.commands.at(-1)('pause'); assert.ok(f.calls.includes('command:pause'));
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


const nativeOwner = generationId => ({endpointId:'12345678-1234-1234-1234-123456789abc',generationId});
function ownedFrame(owner, color=64) {return {owner:{...owner},width:2,height:1,pixels:Buffer.from([color,0,0,255,color,0,0,255])};}

test('owner-bound pixels become the thumbnail image, including a valid pure-black first frame', async t => {
    const owner=nativeOwner(10);
    const f=fixture(t,{isPreviewOwner:value=>value.generationId===10,capturePreview:async()=>ownedFrame(owner,0)});
    f.send(f.make({nativeOwner:owner}));await drain();
    assert.equal(f.controller.status().previewMode,'owner-frame');assert.equal(f.controller.status().captured,1);
    assert.equal(f.controller.status().previewReady,true);assert.deepEqual([...f.readPreview().pixels],[0,0,0,255,0,0,0,255]);
    assert.equal(f.captureCalls,0,'PrintWindow must never be the product pixel source');
});

test('generation switch rejects old pending pixels, then publishes only the new owner reply', async t => {
    let complete, active=10;
    const f=fixture(t,{isPreviewOwner:owner=>owner.generationId===active,capturePreview:owner=>owner.generationId===10?
        new Promise(resolve=>{complete=resolve;}):Promise.resolve(ownedFrame(owner,96))});
    f.send(f.make({nativeOwner:nativeOwner(10)}));await drain();active=11;
    f.send(f.make({nativeOwner:nativeOwner(11),playbackEpoch:2,sequence:2}));
    complete(ownedFrame(nativeOwner(10),32));await drain();assertNeutral(f.readPreview());
    assert.equal(f.controller.status().captured,0);await f.tick();
    assert.equal(f.controller.status().captured,1);assert.equal(f.readPreview().pixels[0],96);
});

test('Native retirement and media end invalidate cached pixels even before renderer Stop arrives', async t => {
    let current=true;const owner=nativeOwner(10);
    const f=fixture(t,{isPreviewOwner:()=>current,capturePreview:async()=>ownedFrame(owner)});
    f.send(f.make({nativeOwner:owner}));await drain();assert.equal(f.controller.status().previewReady,true);
    current=false;assertNeutral(f.readPreview());assert.equal(f.controller.status().previewReady,false);
    f.send(f.make({...stopped,nativeOwner:null,sequence:2}));assert.equal(f.readPreview(),null);
});

test('minimize preserves the last owner frame and suppresses new requests; switch while minimized is neutral', async t => {
    let requests=0;const owner=nativeOwner(10);
    const f=fixture(t,{isPreviewOwner:()=>true,capturePreview:async value=>{requests++;return ownedFrame(value);}});
    f.send(f.make({nativeOwner:owner}));await drain();const first=f.readPreview();
    f.minimize();await f.tick();assert.equal(f.readPreview(),first);assert.equal(requests,1);
    f.send(f.make({nativeOwner:nativeOwner(11),playbackEpoch:2,sequence:2}));await drain();assertNeutral(f.readPreview());
    f.restore();await f.tick();assert.equal(f.controller.status().previewReady,true);assert.equal(requests,2);
});

test('minimize during a pending snapshot drops its result and shutdown drains owned work', async t => {
    let complete;const owner=nativeOwner(10);
    const f=fixture(t,{isPreviewOwner:()=>true,capturePreview:()=>new Promise(resolve=>{complete=resolve;})});
    f.send(f.make({nativeOwner:owner}));await drain();f.minimize();
    let closed=false;const closing=f.controller.dispose().then(()=>{closed=true;});await drain();assert.equal(closed,false);
    assert.equal(f.handlers.size,0);complete(ownedFrame(owner));await closing;
    assert.equal(f.readPreview(),null);assert.equal(f.controller.status().captured,0);
});

test('wrong-owner, malformed and unavailable snapshot responses stay neutral within a bounded first-frame budget', async t => {
    let attempts=0;const owner=nativeOwner(10);
    const f=fixture(t,{isPreviewOwner:()=>true,capturePreview:async()=>{
        attempts++;return attempts%2?ownedFrame(nativeOwner(11)):{...ownedFrame(owner),width:161};}});
    f.send(f.make({nativeOwner:owner}));await drain();for(let i=0;i<30;i++)await f.tick();
    assert.equal(attempts,10);assertNeutral(f.readPreview());assert.equal(f.controller.status().captured,0);
    f.restore();await f.tick();assert.equal(attempts,11);
});

test('closed after native destruction releases listeners, thumbnail and SMTC exactly once', async t => {
    const f=fixture(t);f.send(f.make());await drain();
    const lateReceive=f.ipc.listeners(NATIVE_CHANNEL)[0], lateSession=f.handlers.get(NATIVE_SESSION_CHANNEL), state=f.make({sequence:2});
    assert.doesNotThrow(()=>f.destroy());
    assert.throws(()=>f.window.webContents,/Object has been destroyed/);
    const closing=f.controller.dispose();assert.equal(closing,f.controller.dispose());await closing;
    assert.equal(f.calls.filter(value=>value==='dispose').length,1);
    assert.equal(f.calls.filter(value=>value==='preview-dispose').length,1);
    for(const name of ['did-start-navigation','render-process-gone'])assert.equal(f.webContents.listenerCount(name),0);
    for(const name of ['closed','restore'])assert.equal(f.window.listenerCount(name),0);
    assert.equal(f.handlers.size,0);assert.equal(f.ipc.listenerCount(NATIVE_CHANNEL),0);
    assert.doesNotThrow(()=>lateReceive(f.event,state));assert.equal(lateSession(f.event),null);
    f.request();await f.tick();assert.equal(f.readPreview(),null);assert.equal(f.updates,1);
});

test('Stop followed by destroyed close does not dispose the retired session twice', async t => {
    const f=fixture(t);f.send(f.make());await drain();
    f.send(f.make({...stopped,sequence:2}));await drain();
    f.destroy();await f.controller.dispose();
    assert.equal(f.calls.filter(value=>value==='dispose').length,1);
    assert.equal(f.calls.filter(value=>value==='preview-dispose').length,1);
});

test('destroy while SMTC startup is pending drains its late session without update', async t => {
    let complete,releases=0;
    const f=fixture(t,{create:()=>new Promise(resolve=>{complete=resolve;})});
    f.send(f.make());await drain();f.destroy();
    const closing=f.controller.dispose();assert.equal(closing,f.controller.dispose());let settled=false;closing.then(()=>{settled=true;});
    await drain();assert.equal(settled,false);
    complete({update(){assert.fail('late update');},dispose(){releases++;}});
    await closing;assert.equal(releases,1);assert.equal(f.readPreview(),null);
});

for(const rejected of [false,true])test(`destroy drains ${rejected?'rejected':'successful'} pending capture without submitting late pixels`,async t=>{
    let complete,reject,requests=0;const owner=nativeOwner(10);
    const f=fixture(t,{isPreviewOwner:()=>true,capturePreview:()=>{requests++;return new Promise((resolve,fail)=>{complete=resolve;reject=fail;});}});
    f.send(f.make({nativeOwner:owner}));await drain();f.destroy();
    const previews=f.calls.filter(value=>value==='preview').length;
    let settled=false;const closing=f.controller.dispose();closing.then(()=>{settled=true;});await drain();assert.equal(settled,false);
    if(rejected)reject(new Error('capture ended'));else complete(ownedFrame(owner));
    await closing;f.request();await f.tick();
    assert.equal(f.controller.status().captured,0);assert.equal(requests,1);assert.equal(f.readPreview(),null);
    assert.equal(f.calls.filter(value=>value==='preview').length,previews);
    assert.equal(f.calls.filter(value=>value==='dispose').length,1);
});

test('reentrant native retirement shares the published cleanup promise',async t=>{
    let f,reentered,armed=false;
    f=fixture(t,{onClear(){if(armed)reentered=f.controller.dispose();}});
    f.send(f.make());await drain();armed=true;
    const closing=f.controller.dispose();assert.equal(reentered,closing);await closing;
    assert.equal(f.calls.filter(value=>value==='preview-dispose').length,1);
    assert.equal(f.calls.filter(value=>value==='dispose').length,1);
});

test('a synchronous cleanup failure is reported after other listeners and resources drain',async t=>{
    const failure=new Error('bounded fixture cleanup failure');let armed=false;
    const f=fixture(t,{cleanupError:failure,onClear(){if(armed)throw failure;}});
    f.send(f.make());await drain();armed=true;
    let closing;assert.doesNotThrow(()=>{closing=f.controller.dispose();});
    await assert.rejects(closing,error=>error instanceof AggregateError&&error.errors.length===1&&error.errors[0]===failure);
    assert.equal(f.controller.dispose(),closing);assert.equal(f.handlers.size,0);
    assert.equal(f.webContents.listenerCount('did-start-navigation'),0);
    assert.equal(f.calls.filter(value=>value==='preview-dispose').length,1);
    assert.equal(f.calls.filter(value=>value==='dispose').length,1);
});

test('SMTC callback identity retires on playback generation switch before its async disposal',async t=>{
    const f=fixture(t);f.send(f.make({canNext:true}));await drain();const stale=f.commands[0];
    stale('next');assert.equal(f.calls.filter(value=>value==='command:next').length,1);
    f.send(f.make({canNext:true,playbackEpoch:2,sequence:2}));stale('next');
    assert.equal(f.calls.filter(value=>value==='command:next').length,1);await drain();
    assert.equal(f.commands.length,2);f.commands[1]('next');assert.equal(f.calls.filter(value=>value==='command:next').length,2);
    f.send(f.make({...stopped,sequence:3,playbackEpoch:2}));f.commands[1]('stop');await drain();
    assert.equal(f.calls.filter(value=>value==='command:stop').length,0);
});

test('main SMTC commands enforce current pause state and actual queue capability fields',async t=>{
    const f=fixture(t);f.send(f.make());await drain();
    for(const command of ['play','previous','next','volumeup'])f.commands[0](command);
    assert.equal(f.calls.filter(value=>value.startsWith('command:')).length,0);
    f.commands[0]('pause');assert.ok(f.calls.includes('command:pause'));
    f.send(f.make({paused:true,canPrevious:true,canNext:true,sequence:2}));await drain();
    for(const command of ['play','previous','next'])f.commands[0](command);
    assert.ok(f.calls.includes('command:play'));assert.ok(f.calls.includes('command:previous'));assert.ok(f.calls.includes('command:next'));
    assert.equal(adapter.valid(f.make({...stopped,canNext:true,sequence:3})),false);
    assert.equal(adapter.valid(f.make({canNext:1})),false);
});

test('identical owner pixels reuse NativeImage while retaining DWM feedback for later moving frames',async t=>{
    const owner=nativeOwner(10);let color=50,requests=0;
    const f=fixture(t,{isPreviewOwner:()=>true,capturePreview:async()=>{requests++;return ownedFrame(owner,color);}});
    f.send(f.make({nativeOwner:owner}));await drain();const first=f.readPreview(),previews=f.calls.filter(value=>value==='preview').length;
    await f.tick();assert.equal(f.readPreview(),first);assert.equal(requests,2);
    assert.equal(f.controller.status().performance.counters.duplicates,1);assert.equal(f.controller.status().performance.capture.stages.nativeImage.count,1);
    assert.equal(f.calls.filter(value=>value==='preview').length,previews+1,'duplicate still renews DWM demand feedback');
    color=80;await f.tick();assert.notEqual(f.readPreview(),first);assert.equal(f.readPreview().pixels[0],80);
    assert.equal(f.controller.status().performance.counters.changed,2);
});

test('paused savings are bounded, and seek, fresh DWM demand and restore refresh the verified frame',async t=>{
    const owner=nativeOwner(10);let requests=0;
    const f=fixture(t,{isPreviewOwner:()=>true,capturePreview:async()=>{requests++;return ownedFrame(owner);}});
    f.send(f.make({nativeOwner:owner,paused:true}));await drain();assert.equal(requests,1);
    await f.tick();assert.equal(requests,1);f.request();await drain();assert.equal(requests,2,'new DWM demand bypasses paused saving');
    await f.tick();assert.equal(requests,2);await f.tick();assert.equal(requests,3,'periodic verification remains bounded');
    f.send(f.make({nativeOwner:owner,paused:true,position:10,sequence:2}));await f.tick();assert.equal(requests,4);
    f.restore();await f.tick();assert.equal(requests,5);
    f.send(f.make({nativeOwner:owner,paused:false,position:10,sequence:3}));await f.tick();assert.equal(requests,6);
    assert.equal(f.controller.status().performance.counters.pausedSkipped,2);
});

test('mutable capture input cannot make changed pixels appear identical to the cached NativeImage',async t=>{
    const owner=nativeOwner(10),frame=ownedFrame(owner,10);
    const f=fixture(t,{isPreviewOwner:()=>true,capturePreview:async()=>frame});f.send(f.make({nativeOwner:owner}));await drain();
    const image=f.readPreview();frame.pixels[0]=70;await f.tick();assert.notEqual(f.readPreview(),image);assert.equal(f.readPreview().pixels[0],70);
    f.send(f.make({nativeOwner:nativeOwner(11),playbackEpoch:2,sequence:2}));await drain();assertNeutral(f.readPreview());
});

test('explicit diagnostic baseline restores original paused captures and NativeImage churn',async t=>{
    const owner=nativeOwner(10);let captures=0;
    const f=fixture(t,{previewSavings:false,isPreviewOwner:()=>true,capturePreview:async()=>{captures++;return ownedFrame(owner);}});
    f.send(f.make({nativeOwner:owner,paused:true}));await drain();const first=f.readPreview();
    await f.tick();assert.equal(captures,2);assert.notEqual(f.readPreview(),first);
    assert.equal(f.controller.status().performance.savingsEnabled,false);assert.equal(f.controller.status().performance.counters.duplicates,0);
});


test('550ms cadence requires an explicit preset and active verified demand; baseline remains 1Hz',async t=>{
    const owner=nativeOwner(10);
    for(const value of [undefined,500,550,551]){
        const f=fixture(t,{captureIntervalMs:value,isPreviewOwner:()=>true,capturePreview:async()=>ownedFrame(owner)});
        f.send(f.make({nativeOwner:owner}));await drain();
        assert.equal(f.controller.status().performance.configuredIntervalMs,value===550?550:1000);
        await f.tick(550);assert.equal(f.controller.status().captured,value===550?2:1);
    }
    const options={captureIntervalMs:550,previewSavings:false,isPreviewOwner:()=>true,capturePreview:async()=>ownedFrame(owner)};
    const baseline=fixture(t,options);baseline.send(baseline.make({nativeOwner:owner}));await drain();
    assert.equal(baseline.controller.status().performance.configuredIntervalMs,1000);
    const absent=fixture(t,{...options,previewSavings:true,demand:false});absent.send(absent.make({nativeOwner:owner}));await drain();
    assert.equal(absent.controller.status().performance.activeIntervalMs,1000);await absent.tick();assert.equal(absent.controller.status().captured,1);
});

test('slow capture and expensive DWM request back off for 30s, without overlapping capture or stale-owner attribution',async t=>{
    const owner=nativeOwner(10);let f,slow=false,resolve;
    f=fixture(t,{captureIntervalMs:550,isPreviewOwner:()=>true,capturePreview:async()=>{if(slow)f.advance(101);return ownedFrame(owner);}});
    f.send(f.make({nativeOwner:owner}));await drain();slow=true;await f.tick(550);slow=false;
    let status=f.controller.status().performance;assert.equal(status.activeIntervalMs,1000);assert.equal(status.backoffs,1);
    await f.tick(550);assert.equal(f.controller.status().captured,2);
    await f.tick(30000);assert.equal(f.controller.status().performance.activeIntervalMs,550);
    f.request({requestMs:21});await drain();assert.equal(f.controller.status().performance.activeIntervalMs,1000);
    f.send(f.make({...stopped,sequence:2}));await drain();assert.equal(f.controller.status().performance.backoffRemainingMs,0);
    const pending=fixture(t,{captureIntervalMs:550,isPreviewOwner:()=>true,capturePreview:()=>new Promise(done=>{resolve=done;})});
    pending.send(pending.make({nativeOwner:owner}));await drain();await pending.tick(550);
    assert.equal(pending.controller.status().performance.counters.requests,1);
    pending.send(pending.make({nativeOwner:nativeOwner(11),playbackEpoch:2,sequence:2}));pending.advance(101);resolve(ownedFrame(owner));await drain();
    assert.equal(pending.controller.status().performance.backoffs,0);assert.equal(pending.controller.status().captured,0);
});

test('faster cadence still skips hidden windows and keeps paused verification at the lower budget',async t=>{
    const owner=nativeOwner(10),f=fixture(t,{captureIntervalMs:550,isPreviewOwner:()=>true,capturePreview:async()=>ownedFrame(owner)});
    f.send(f.make({nativeOwner:owner,paused:true}));await drain();
    for(let i=0;i<3;i++)await f.tick(550);assert.equal(f.controller.status().captured,1);
    await f.tick(550);assert.equal(f.controller.status().captured,2);
    assert.equal(f.controller.status().performance.activeIntervalMs,1000);
    f.minimize();await f.tick(550);assert.equal(f.controller.status().captured,2);
});


test('expensive NativeImage creation returns the opt-in cadence to low frequency',async t=>{
    const owner=nativeOwner(10),f=fixture(t,{captureIntervalMs:550,imageMs:9,isPreviewOwner:()=>true,capturePreview:async()=>ownedFrame(owner)});
    f.send(f.make({nativeOwner:owner}));await drain();
    assert.equal(f.controller.status().performance.activeIntervalMs,1000);assert.equal(f.controller.status().performance.backoffs,1);
    assert.equal(f.controller.status().performance.capture.stages.nativeImage.maxMs,9);
});
