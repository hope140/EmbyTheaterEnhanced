'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const main = require('../src/electronapp/enhanced/windows-media-controls');
const renderer = require('../src/electronapp/enhanced/windows-media-renderer');

function mainFixture(overrides = {}) {
    const window = new EventEmitter(), ipcMain = new EventEmitter(), nativeTheme = new EventEmitter(), app = new EventEmitter();
    const toolbars = [], commands = [];
    const webContents = new EventEmitter();
    let destroyed = false;
    Object.defineProperty(window, 'webContents', {get() {
        if (destroyed) throw new TypeError('Object has been destroyed');
        return webContents;
    }});
    webContents.mainFrame = {url: pathToFileURL(path.resolve(__dirname, '../src/electronapp/www/index.html')).href};
    webContents.isDestroyed = () => destroyed;
    window.isDestroyed = () => destroyed;
    let visible = overrides.visible !== false, remainingFailures = overrides.failures || 0;
    window.isVisible = () => visible;
    window.setThumbarButtons = value => {
        assert.equal(destroyed, false, 'cannot update a destroyed window');
        toolbars.push(value);
        if (overrides.onToolbar) overrides.onToolbar(value);
        return remainingFailures-- > 0 ? false : true;
    };
    const options = {platform: 'win32', window, ipcMain, nativeTheme, app,
        nativeImage: {createFromBitmap(bitmap, size) { assert.equal(bitmap.length, 4096); return {bitmap, size}; }},
        sendCommand: command => commands.push(command), clock: overrides.clock};
    const dispose = main.attach(options);
    const event = {sender: window.webContents, senderFrame: window.webContents.mainFrame};
    return {window, webContents, ipcMain, nativeTheme, app, toolbars, commands, dispose,
        destroy() { destroyed = true; window.emit('closed'); },
        markDestroyed() { destroyed = true; },
        show() {visible=true;window.emit('show');},
        send(value, receivedEvent = event) { ipcMain.emit(renderer.CHANNEL, receivedEvent, value); }};
}

test('native toolbar follows current play pause stop state and uses only existing command names', () => {
    const f = mainFixture();
    assert.equal(f.toolbars.length, 0);
    f.send({active: true, paused: false});
    assert.equal(f.toolbars.at(-1)[0].tooltip, '暂停');
    f.toolbars.at(-1)[0].click(); f.toolbars.at(-1)[1].click();
    assert.deepEqual(f.commands, ['playpause', 'stop']);
    f.send({active: true, paused: true});
    assert.equal(f.toolbars.at(-1)[0].tooltip, '播放');
    const stale = f.toolbars.at(-1)[0];
    f.send({active: false, paused: false}); stale.click();
    assert.equal(f.commands.length, 2);
    assert.deepEqual(f.toolbars.at(-1), []);
    f.dispose();
});

test('foreign frames invalid payloads and unchanged updates cannot affect the toolbar', () => {
    const f = mainFixture(), baseline = f.toolbars.length;
    for (const value of [null, {}, {active: true, paused: 'yes'}, {active: false, paused: true}, {active: true, paused: false, command: 'arbitrary'}]) f.send(value);
    f.send({active: true, paused: false}, {sender: f.window.webContents, senderFrame: {url: 'https://example.invalid'}});
    f.send({active: true, paused: false}, {sender: {}, senderFrame: f.window.webContents.mainFrame});
    f.send({active: false, paused: false});
    assert.equal(f.toolbars.length, baseline);
    f.dispose();
});

test('navigation reset shutdown and closed cleanup remove buttons and listener ownership', () => {
    for (const action of ['navigation', 'crash', 'shutdown', 'closed']) {
        const f = mainFixture(); f.send({active: true, paused: false});
        const stale = f.toolbars.at(-1)[0];
        if (action === 'navigation') f.window.webContents.emit('did-start-navigation',{},'file:///fixture',false,true);
        else if (action === 'crash') f.window.webContents.emit('render-process-gone');
        else if (action === 'shutdown') f.app.emit('before-quit');
        else f.destroy();
        stale.click(); assert.equal(f.commands.length, 0);
        if (action !== 'navigation' && action !== 'crash') {
            assert.equal(f.ipcMain.listenerCount(renderer.CHANNEL), 0);
            assert.equal(f.nativeTheme.listenerCount('updated'), 0);
            assert.equal(f.app.listenerCount('before-quit'), 0);
        }
        f.dispose(); f.dispose();
    }
});

test('playback then destroyed-window closed event retires every owned listener without accessing webContents', () => {
    for (const paused of [false, true]) {
        const f = mainFixture();
        f.send({active: true, paused});
        const stale = f.toolbars.at(-1), count = f.toolbars.length;
        assert.doesNotThrow(() => f.destroy());
        assert.doesNotThrow(() => { f.dispose(); f.app.emit('before-quit'); f.dispose(); });
        stale.forEach(button => button.click());
        assert.deepEqual(f.commands, []);
        assert.equal(f.dispose.status().active, false);
        assert.equal(f.toolbars.length, count);
        for (const [owner, event] of [[f.ipcMain, renderer.CHANNEL], [f.nativeTheme, 'updated'],
            [f.webContents, 'did-start-navigation'], [f.webContents, 'render-process-gone'],
            [f.window, 'closed'], [f.window, 'show'], [f.window, 'restore'], [f.app, 'before-quit']]) {
            assert.equal(owner.listenerCount(event), 0, event);
        }
    }
});

test('before-quit clears a live toolbar once and remains safe when closed follows', () => {
    const f = mainFixture(); f.send({active: true, paused: false});
    const count = f.toolbars.length;
    f.app.emit('before-quit');
    assert.deepEqual(f.toolbars.at(-1), []);
    assert.equal(f.toolbars.length, count + 1);
    assert.doesNotThrow(() => { f.destroy(); f.dispose(); });
    assert.equal(f.toolbars.length, count + 1);
});

test('destroyed window before closed ignores late IPC and cancels pending toolbar retry', () => {
    const timers = new Map(); let next = 0;
    const clock = {setTimeout(fn) {timers.set(++next, fn);return next;}, clearTimeout(id) {timers.delete(id);}};
    const f = mainFixture({failures: 10, clock}); f.send({active: true, paused: false});
    const lateReceive = f.ipcMain.listeners(renderer.CHANNEL)[0], lateRetry = [...timers.values()][0];
    f.markDestroyed();
    assert.doesNotThrow(() => f.send({active: true, paused: true}));
    assert.doesNotThrow(() => f.dispose());
    assert.equal(timers.size, 0);
    assert.equal(f.dispose.status().retries, 0);
    const count = f.toolbars.length;
    assert.doesNotThrow(() => { lateRetry(); lateReceive({}, {active: true, paused: false}); f.destroy(); f.dispose(); });
    assert.equal(f.toolbars.length, count);
});

test('dispose retires callbacks before clearing a live toolbar, including reentrant cleanup and shell failure', () => {
    let cleanup, stale, clearCount = 0;
    const f = mainFixture({onToolbar(value) {
        if (value.length === 0 && cleanup) { clearCount++; cleanup(); stale.click(); throw Error('shell unavailable'); }
    }});
    f.send({active: true, paused: false});
    cleanup = f.dispose; stale = f.toolbars.at(-1)[0];
    assert.doesNotThrow(() => { f.dispose(); f.dispose(); });
    assert.equal(clearCount, 1);
    assert.deepEqual(f.commands, []);
    assert.equal(f.ipcMain.listenerCount(renderer.CHANNEL), 0);
    assert.equal(f.dispose.status().active, false);
    assert.equal(f.dispose.status().applied, false);
});

test('theme changes regenerate native icons and platform capability absence is harmless', () => {
    const f = mainFixture(); f.send({active: true, paused: false});
    const light = f.toolbars.at(-1)[0].icon.bitmap;
    f.nativeTheme.shouldUseDarkColors = true; f.nativeTheme.emit('updated');
    assert.notDeepEqual(light, f.toolbars.at(-1)[0].icon.bitmap);
    assert.doesNotThrow(() => main.attach({platform: 'linux'})());
    assert.doesNotThrow(() => main.attach({platform: 'win32', window: {}})());
    f.dispose();
});

test('first toolbar registration waits for a shown window and contains real buttons', () => {
    const f=mainFixture({visible:false});
    f.send({active:true,paused:false});assert.equal(f.toolbars.length,0);
    f.show();assert.equal(f.toolbars.length,1);assert.equal(f.toolbars[0].length,2);
    f.dispose();
});

test('a rejected toolbar submission retries and shutdown cancels pending retries', () => {
    const timers=new Map();let next=0;
    const clock={setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};
    const f=mainFixture({failures:1,clock});f.send({active:true,paused:false});
    assert.equal(f.dispose.status().applied,false);assert.equal(timers.size,1);
    const [id,fn]=[...timers][0];timers.delete(id);fn();
    assert.equal(f.dispose.status().applied,true);assert.equal(timers.size,0);f.dispose();
    const g=mainFixture({failures:10,clock});g.send({active:true,paused:false});
    assert.equal(timers.size,1);g.dispose();assert.equal(timers.size,0);
});

test('toolbar icons use the Windows shell theme when it differs from the application theme', () => {
    const f=mainFixture();f.nativeTheme.shouldUseDarkColors=false;f.nativeTheme.shouldUseDarkColorsForSystemIntegratedUI=true;
    f.send({active:true,paused:false});
    assert.deepEqual(f.toolbars.at(-1)[0].icon.bitmap,main.iconBitmap('pause',true));
    f.nativeTheme.shouldUseDarkColors=true;f.nativeTheme.shouldUseDarkColorsForSystemIntegratedUI=false;f.nativeTheme.emit('updated');
    assert.deepEqual(f.toolbars.at(-1)[0].icon.bitmap,main.iconBitmap('pause',false));f.dispose();
});

test('toolbar failures stop after a bounded retry budget and resume can try again', () => {
    const timers=new Map();let next=0;
    const clock={setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};
    const f=mainFixture({failures:100,clock});f.send({active:true,paused:false});
    while(timers.size){const [id,fn]=[...timers][0];timers.delete(id);fn();}
    assert.equal(f.toolbars.length,4);assert.equal(f.dispose.status().applied,false);
    f.window.emit('restore');assert.equal(f.toolbars.length,5);assert.equal(timers.size,1);
    f.dispose();assert.equal(timers.size,0);
});

function rendererFixture(options = {}) {
    const document = new EventEmitter(), window = new EventEmitter(), subscriptions = [];
    const emitted = [], positions = [];
    let player = {}, state = {NowPlayingItem: {MediaType: 'Video', RunTimeTicks: 1000000000},
        PlayState: {IsPaused: false, PositionTicks: 200000000}};
    document.addEventListener = document.on.bind(document); document.removeEventListener = document.removeListener.bind(document);
    window.addEventListener = window.on.bind(window); window.removeEventListener = window.removeListener.bind(window);
    window.document = document; window.top = window;
    window.define = function () {}; window.define.amd = {};
    window.navigator = {mediaSession: {setPositionState: value => positions.push(value)}};
    const manager = {getCurrentPlayer: () => player, getPlayerState: () => state};
    const events = {on(object, name, callback) { subscriptions.push({object, name, callback}); },
        off(object, name, callback) { const i = subscriptions.findIndex(s => s.object === object && s.name === name && s.callback === callback); if (i >= 0) subscriptions.splice(i, 1); }};
    window.require = (names, ready) => { assert.deepEqual(names, ['modules/common/playback/playbackmanager.js', 'modules/emby-apiclient/events.js']); ready({default: manager}, {default: events}); };
    const dispose = renderer.install(window, (channel, value) => emitted.push({channel, value}),
        options.direct ? {...options, playbackManager: manager, events} : options);
    function fire(name, object = player, ...args) { for (const s of [...subscriptions]) if (s.object === object && s.name === name) s.callback(...args); }
    return {window, document, manager, emitted, positions, subscriptions, dispose, fire, get player() { return player; },
        setState(value) { state = value; }, switchPlayer() { player = {}; fire('playerchange', manager); }};
}

test('renderer binds original AMD singletons and supplements MediaSession without adding media players', () => {
    const f = rendererFixture();
    assert.equal(f.emitted.length, 0);
    f.document.emit('appready');
    assert.deepEqual(f.emitted.at(-1), {channel: renderer.CHANNEL, value: {active: true, paused: false}});
    assert.equal(f.window.navigator.mediaSession.playbackState, 'playing');
    assert.deepEqual(f.positions.at(-1), {duration: 100, position: 20, playbackRate: 1});
    f.fire('timeupdate'); assert.equal(f.emitted.length, 1);
    f.setState({NowPlayingItem: {MediaType: 'Audio', RunTimeTicks: 100000000}, PlayState: {IsPaused: true, PositionTicks: 200000000}});
    f.fire('pause');
    assert.equal(f.window.navigator.mediaSession.playbackState, 'paused');
    assert.deepEqual(f.positions.at(-1), {duration: 10, position: 10, playbackRate: 1});
    f.setState({NowPlayingItem: {MediaType: 'Audio', RunTimeTicks: 100000000}, PlayState: {IsPaused: false, PositionTicks: 10000000, PlaybackRate: 1.5}});
    f.fire('playbackratechange');
    assert.equal(f.positions.at(-1).playbackRate, 1.5);
    f.fire('playbackstop', f.player, {}, {NextMediaType: 'Video'});
    assert.equal(f.window.navigator.mediaSession.playbackState, 'playing');
    f.fire('playbackstop');
    assert.equal(f.window.navigator.mediaSession.playbackState, 'none');
    assert.equal(f.positions.at(-1), undefined);
    f.dispose(); assert.equal(f.subscriptions.length, 0);
});

test('player replacement unload late AMD completion and optional MediaSession failures remain isolated', () => {
    const f = rendererFixture(); f.document.emit('appready');
    const expected = f.subscriptions.length;
    f.switchPlayer(); assert.equal(f.subscriptions.length, expected);
    f.window.navigator.mediaSession.setPositionState = () => { throw Error('unsupported'); };
    assert.doesNotThrow(() => f.fire('timeupdate'));
    f.window.emit('unload'); assert.equal(f.subscriptions.length, 0);
    const g = rendererFixture(); let loaded;
    g.window.require = (_, callback) => { loaded = callback; };
    g.document.emit('appready'); g.dispose();
    loaded({default: g.manager}, {default: {on() { assert.fail('late bind'); }}});
    assert.equal(g.subscriptions.length, 0);
    f.dispose();
});

test('preload can bind when AMD becomes ready after the appready observation', async () => {
    const f = rendererFixture(), define = f.window.define;
    f.window.define = undefined;
    f.document.emit('appready');
    assert.equal(f.dispose.status().bound, false);
    f.window.define = define;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(f.dispose.status().bound, true);
    assert.equal(f.emitted.length, 1);
    f.dispose();
});

test('direct player binding works without renderer AMD access and owns one subscription set', () => {
    const f = rendererFixture({direct: true});
    f.window.require = () => { throw Error('preload access revoked'); };
    f.window.define = undefined;
    assert.equal(f.dispose.status().bound, true);
    assert.equal(f.dispose.status().hasPlayer, true);
    const count = f.subscriptions.length;
    f.document.emit('appready');
    assert.equal(f.subscriptions.length, count);
    f.setState({NowPlayingItem: {MediaType: 'Video', RunTimeTicks: 1000000000}, PlayState: {IsPaused: true, PositionTicks: 100000000}});
    f.fire('pause');
    assert.deepEqual(f.emitted.at(-1).value, {active: true, paused: true});
    f.dispose();
    assert.equal(f.subscriptions.length, 0);
});

test('paused position updates flush after throttling even without another timeupdate event', async () => {
    let now = 0, next = 0;
    const timers = new Map(), clock = {now: () => now,
        setTimeout(fn, delay) {const id=++next;timers.set(id,{fn,at:now+delay});return id;}, clearTimeout(id) {timers.delete(id);}};
    const f = rendererFixture({clock, requestNativeSession: () => Promise.resolve({token:'12345678-1234-1234-1234-123456789abc'})});
    f.player.id = 'libmpvmediaplayer';
    f.setState({NowPlayingItem:{Id:'fixture',Name:'Fixture',MediaType:'Video',RunTimeTicks:1000000000},PlayState:{IsPaused:true,PositionTicks:200000000}});
    f.document.emit('appready');
    for(let i=0;i<5;i++)await Promise.resolve();
    const packets = () => f.emitted.filter(value => value.channel === renderer.NATIVE_CHANNEL);
    assert.equal(packets().at(-1).value.position,20);
    now=100;
    f.setState({NowPlayingItem:{Id:'fixture',Name:'Fixture',MediaType:'Video',RunTimeTicks:1000000000},PlayState:{IsPaused:true,PositionTicks:300000000}});
    f.fire('timeupdate');
    assert.equal(packets().length,1);
    now=1000;for(const [id,timer] of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}
    assert.equal(packets().at(-1).value.position,30);
    f.dispose();assert.equal(timers.size,0);
});
