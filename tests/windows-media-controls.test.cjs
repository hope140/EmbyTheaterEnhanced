'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const renderer = require('../src/electronapp/enhanced/windows-media-renderer');

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
    window.require = (names, ready) => {
        if (options.inputManager && names.length === 1 && names[0] === 'inputmanager') return ready({default:options.inputManager});
        assert.deepEqual(names, ['modules/common/playback/playbackmanager.js', 'modules/emby-apiclient/events.js']); ready({default: manager}, {default: events}); };
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
    assert.equal(f.emitted.length,0);
    assert.equal(f.window.navigator.mediaSession.playbackState, 'playing');
    assert.deepEqual(f.positions.at(-1), {duration: 100, position: 20, playbackRate: 1});
    f.fire('timeupdate'); assert.equal(f.emitted.length, 0);
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
    assert.equal(f.emitted.length, 0);
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
    assert.equal(f.window.navigator.mediaSession.playbackState, 'paused');
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


test('native playback epochs rotate for same-item replay and stop retires pixels during Next transition', async () => {
    const f = rendererFixture({direct:true, requestNativeSession: () => Promise.resolve({token:'12345678-1234-1234-1234-123456789abc'})});
    f.player.id = 'libmpvmediaplayer';
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const packets = () => f.emitted.filter(value => value.channel === renderer.NATIVE_CHANNEL);
    const first = packets().at(-1).value;
    assert.equal(first.version, 4);
    f.fire('playbackstart'); const second = packets().at(-1).value;
    assert.equal(second.mediaKey, first.mediaKey); assert.ok(second.playbackEpoch > first.playbackEpoch);
    const positionsBefore = f.positions.length;
    f.setState({});
    f.fire('playbackstop', f.player, {}, {NextMediaType: 'Video'});
    assert.equal(f.positions.length, positionsBefore);
    assert.equal(packets().at(-1).value.active, false);
    f.fire('timeupdate'); assert.equal(packets().at(-1).value.active, false);
    f.setState({NowPlayingItem: {MediaType: 'Video', RunTimeTicks: 1000000000}, PlayState: {IsPaused: false, PositionTicks: 0}});
    f.fire('playbackstart'); assert.equal(packets().at(-1).value.active, true);
    f.dispose();
});


test('native metadata binds the original player read-only owner, and owner changes publish despite position throttle', async () => {
    const f=rendererFixture({direct:true,requestNativeSession:()=>Promise.resolve({token:'12345678-1234-1234-1234-123456789abc'})});
    f.player.id='libmpvmediaplayer';let generationId=10;
    f.player.getNativePreviewOwner=item=>{assert.equal(item.MediaType,'Video');return {endpointId:'12345678-1234-1234-1234-123456789abc',generationId};};
    for(let i=0;i<5;i++)await Promise.resolve();
    const packets=()=>f.emitted.filter(row=>row.channel===renderer.NATIVE_CHANNEL);
    assert.equal(packets().at(-1).value.nativeOwner.generationId,10);const count=packets().length;
    generationId=11;f.fire('statechange');assert.equal(packets().length,count+1);
    assert.equal(packets().at(-1).value.nativeOwner.generationId,11);f.dispose();
});


test('malformed optional preview owner cannot make a playback state publication throw', async () => {
    const f=rendererFixture({direct:true,requestNativeSession:()=>Promise.resolve({token:'12345678-1234-1234-1234-123456789abc'})});
    f.player.id='libmpvmediaplayer';const bad={};bad.self=bad;f.player.getNativePreviewOwner=()=>bad;
    for(let i=0;i<5;i++)await Promise.resolve();
    assert.equal(f.emitted.filter(row=>row.channel===renderer.NATIVE_CHANNEL).at(-1).value.nativeOwner,null);
    assert.doesNotThrow(()=>f.fire('statechange'));f.dispose();
});

test('taskbar buttons and their renderer state route are retired',()=>{
    const fs=require('node:fs'),path=require('node:path'),source=fs.readFileSync(path.resolve(__dirname,'../src/electronapp/main.js'),'utf8');
    assert.doesNotMatch(source,/windowsMediaControls|setThumbarButtons/);
    assert.equal(fs.existsSync(path.resolve(__dirname,'../src/electronapp/enhanced/windows-media-controls.js')),false);
    assert.equal(Object.hasOwn(renderer,'CHANNEL'),false);
});

async function nativeFixture(options={}){
    const commands=[],pending=[];
    const f=rendererFixture({direct:true,requestNativeSession:()=>Promise.resolve({token:'12345678-1234-1234-1234-123456789abc'}),
        requireInput(_names,callback){pending.push(()=>callback({trigger:command=>commands.push(command)}));},...options});
    f.player.id='libmpvmediaplayer';
    let index=0,length=3,repeat='RepeatNone';
    f.manager.getCurrentPlaylistIndex=()=>index;f.manager.getCurrentPlaylistLength=()=>length;f.manager.getRepeatMode=()=>repeat;
    for(let i=0;i<5;i++)await Promise.resolve();
    const latest=()=>f.emitted.filter(row=>row.channel===renderer.NATIVE_CHANNEL).at(-1).value;
    let sequence=0;
    return Object.assign(f,{commands,pending,latest,
        queue(i,n,r='RepeatNone',event='playlistitemmove'){index=i;length=n;repeat=r;f.fire(event);},
        packet(command,extra={}){const s=latest();return {version:1,command,sequence:++sequence,sessionToken:s.sessionToken,playbackEpoch:s.playbackEpoch,mediaKey:s.mediaKey,nativeOwner:s.nativeOwner,...extra};}});
}

test('queue controls reflect actual first middle last and repeat semantics, including paused updates',async()=>{
    const f=await nativeFixture();
    const cases=[[0,3,'RepeatNone',false,true],[1,3,'RepeatNone',true,true],[2,3,'RepeatNone',true,false],
        [0,1,'RepeatNone',false,false],[0,1,'RepeatAll',false,true],[0,1,'RepeatOne',false,true],
        [-1,0,'RepeatAll',false,false],[3,3,'RepeatNone',false,false],[0,1.2,'RepeatNone',false,false]];
    for(const [index,length,repeat,previous,next]of cases){f.queue(index,length,repeat);assert.equal(f.latest().canPrevious,previous);assert.equal(f.latest().canNext,next);}
    f.setState({NowPlayingItem:{MediaType:'Video',RunTimeTicks:1000000000},PlayState:{IsPaused:true}});
    f.queue(0,2,'RepeatNone','playlistitemadd');assert.equal(f.latest().paused,true);assert.equal(f.latest().canNext,true);
    f.queue(0,1,'RepeatNone','playlistitemremove');assert.equal(f.latest().canNext,false);
    f.queue(0,1,'RepeatAll','repeatmodechange');assert.equal(f.latest().canNext,true);f.dispose();
});

test('only current enabled SMTC commands reach original inputmanager and duplicates are rejected',async()=>{
    const f=await nativeFixture();f.queue(1,3);
    for(const command of ['pause','previous','next','stop']){const packet=f.packet(command);assert.equal(f.dispose.command(packet),true);assert.equal(f.dispose.command(packet),false);f.pending.shift()();}
    assert.deepEqual(f.commands,['pause','previous','next','stop']);
    for(const command of ['play','seek','volumeup','fullscreen'])assert.equal(f.dispose.command(f.packet(command)),false);
    f.queue(0,1);assert.equal(f.dispose.command(f.packet('previous')),false);assert.equal(f.dispose.command(f.packet('next')),false);
    f.setState({NowPlayingItem:{MediaType:'Video',RunTimeTicks:1000000000},PlayState:{IsPaused:true}});f.fire('pause');
    assert.equal(f.dispose.command(f.packet('pause')),false);assert.equal(f.dispose.command(f.packet('play')),true);f.pending.shift()();
    assert.equal(f.commands.at(-1),'play');f.dispose();
});

for(const retirement of ['replay','stop','switch','dispose','owner','queue'])test('late AMD command cannot control retired '+retirement,async()=>{
    const f=await nativeFixture();f.queue(1,3);const packet=f.packet('next');assert.equal(f.dispose.command(packet),true);
    if(retirement==='replay')f.fire('playbackstart');
    if(retirement==='stop')f.fire('playbackstop',f.player,{}, {NextMediaType:'Video'});
    if(retirement==='switch')f.switchPlayer();
    if(retirement==='dispose')f.dispose();
    if(retirement==='owner')f.player.getNativePreviewOwner=()=>({endpointId:'12345678-1234-1234-1234-123456789abc',generationId:20});
    if(retirement==='queue')f.queue(0,1);
    f.pending.shift()();assert.deepEqual(f.commands,[]);assert.equal(f.dispose.command(packet),false);f.dispose();
});

test('late and malformed command envelopes fail closed without changing playback',async()=>{
    const f=await nativeFixture();
    for(const extra of [{version:2},{sessionToken:'retired'},{playbackEpoch:0},{mediaKey:'foreign'},{nativeOwner:{}},{sequence:0},{extra:true}]){
        assert.equal(f.dispose.command(f.packet('pause',extra)),false);
    }
    assert.equal(f.pending.length,0);assert.deepEqual(f.commands,[]);f.dispose();
});

test('production command path retains the original AMD require when later global access is revoked',async()=>{
    const received=[],f=await nativeFixture({requireInput:undefined,inputManager:{trigger:value=>received.push(value)}});
    f.window.require=()=>{throw Error('later preload access revoked');};
    assert.equal(f.dispose.command(f.packet('pause')),true);assert.deepEqual(received,['pause']);
    f.dispose();assert.equal(f.subscriptions.length,0);assert.equal(f.dispose.command(f.packet('stop')),false);
});
