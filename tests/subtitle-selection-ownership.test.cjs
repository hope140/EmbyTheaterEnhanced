'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the complete production AMD module through play() and its public
// setSubtitleStreamIndex() entry point. Only the browser, bridge and clock are fake.
const source = fs.readFileSync(path.join(process.env.ETE_TEST_SOURCE_ROOT || path.join(__dirname, '..'),
    'src/electronapp/plugins/libmpv.js'), 'utf8');

class Clock {
    constructor() { this.now = 0; this.nextId = 0; this.queue = []; }
    setTimeout(fn, delay) {
        const id = ++this.nextId;
        this.queue.push({id, at: this.now + delay, fn});
        return id;
    }
    clearTimeout(id) { this.queue = this.queue.filter(row => row.id !== id); }
    fireNextWithoutMicrotasks() {
        this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
        const next = this.queue.shift();
        assert.ok(next, 'a pending timer is required');
        this.now = next.at;
        next.fn();
    }
    async advanceTo(target) {
        while (true) {
            this.queue.sort((a, b) => a.at - b.at || a.id - b.id);
            const next = this.queue[0];
            if (!next || next.at > target) break;
            this.queue.shift();
            this.now = next.at;
            next.fn();
            for (let i = 0; i < 8; i++) await Promise.resolve();
        }
        this.now = target;
    }
}

function eventTarget() {
    const listeners = new Map();
    return {
        addEventListener(name, listener) {
            const entries = listeners.get(name) || [];
            entries.push(listener);
            listeners.set(name, entries);
        },
        removeEventListener(name, listener) {
            listeners.set(name, (listeners.get(name) || []).filter(entry => entry !== listener));
        },
        dispatchEvent(event) {
            for (const listener of [...(listeners.get(event.type) || [])]) listener(event);
        }
    };
}

function makeHarness() {
    const clock = new Clock();
    const actions = [];
    const diagnostics = [];
    const target = eventTarget();
    let tracks = [];
    let trackRead = null;
    let automaticReady = true;
    let unpaused = false;
    let rejectSid = false;
    let resolvedSource = null;
    const body = {
        firstChild: null,
        insertBefore(node) { node.parentNode = this; this.firstChild = node; },
        removeChild(node) { if (this.firstChild === node) this.firstChild = null; node.parentNode = null; }
    };
    const document = {
        body,
        querySelector() { return body.firstChild; },
        createElement() {
            return {parentNode: null, classList: {add() {}, remove() {}}, style: {}};
        }
    };
    const endpoint = {
        style: {},
        addEventListener() {},
        observeProperties() { return Promise.resolve(); },
        beginGeneration() { return Promise.resolve({generationId: 1}); },
        retireGeneration() {},
        getProperty(name) {
            assert.equal(name, 'track-list');
            return trackRead ? trackRead() : Promise.resolve(tracks);
        },
        setProperties(properties) {
            if (Object.hasOwn(properties, 'initial-subtitle')) actions.push({type: 'initial-subtitle', value: properties['initial-subtitle']});
            if (properties.pause === false) unpaused = true;
            if (rejectSid && Object.hasOwn(properties, 'sid')) { rejectSid = false; return Promise.reject(Error('synthetic sid rejection')); }
            if (Object.hasOwn(properties, 'sid')) actions.push({at: clock.now, type: 'sid', value: properties.sid});
            return Promise.resolve({status: 'accepted'});
        },
        sendCommand(command) {
            if (Array.isArray(command) && command[0] === 'loadfile') {
                actions.push({at: clock.now, type: 'loadfile'});
                if (automaticReady) queueMicrotask(() => target.dispatchEvent({type: 'core-playing'}));
            } else if (Array.isArray(command) && command[0] === 'sub-add') {
                actions.push({at: clock.now, type: 'sub-add', value: command[1]});
                if (command[1] === 'opaque:reject') return Promise.reject(new Error('synthetic-command-failure'));
            }
            return Promise.resolve({status: 'accepted'});
        },
        destroy() { return Promise.resolve(); }
    };
    const window = Object.assign(target, {
        ipc: {send(channel, record) { if (channel === 'enhanced-diagnostics-log') diagnostics.push(record); }},
        platform: 'win32',
        PlayerWindowId: 'fixture-window'
    });
    const context = {
        window, document, Promise, AbortController, console: {log() {}},
        setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
        Event: class { constructor(type) { this.type = type; } },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        XMLHttpRequest: class {
            open(_method, url) { this.url = url; }
            send() { this.response = this.url.includes('list_possible') ? '30;60' : 'Current Refresh Rate -: 60'; this.onload(); }
        }
    };
    let factory;
    context.define = (_dependencies, value) => { factory = value; };
    vm.runInNewContext(source, context, {filename: 'libmpv.js'});
    const nextTransition = {
        install() {},
        createNative() {
            return {
                playbackStarted() {}, playbackReady() {}, playbackFailed() {},
                loadingToken() { return null; }, cancel() {}, isActive() { return false; }
            };
        }
    };
    const playerClass = factory(
        {translate(value) { return value; }},
        {getSubtitleUrl(stream) { return stream.DeliveryUrl; }},
        {mapPath(_player, value) { return value; }},
        {trigger() {}},
        {showVideoOsd() { return Promise.resolve(); }, setTransparency() {}},
        {get() { return undefined; }, set() {}},
        {getSubtitleAppearanceSettings() { return {}; }},
        function (dependencies, callback) { if (dependencies[0] === 'css!./libmpv') callback(); return Promise.resolve(); },
        {},
        {isStrm() { return false; }, resolveAsync(ctx) { return Promise.resolve(resolvedSource || {type: 'native', source: ctx.nativeSource}); }},
        undefined, undefined, undefined, nextTransition,
        {create() { return Promise.resolve({mode: 'native-helper', endpoint}); }}
    );
    const player = {};
    playerClass.call(player);
    player._onStopped = () => {};
    let requestId = 0;
    async function play(mediaStreams, defaultSubtitleIndex, playMethod = 'DirectPlay') {
        const id = ++requestId;
        tracks = mediaStreams.filter(row => row.Type === 'Subtitle' && row.DeliveryMethod !== 'External')
            .map((row, i) => ({type: 'sub', external: false, id: i + 1, 'ff-index': row.Index}));
        await player.play({
            _etePlayRequestId: id,
            url: 'opaque:media',
            item: {ServerId: 'fixture', MediaType: 'Video', Type: 'Movie', Path: '/fixture/movie.strm'},
            mediaSource: {
                Path: '/fixture/movie.mkv', MediaStreams: mediaStreams.map(row => ({...row})),
                DefaultSubtitleStreamIndex: defaultSubtitleIndex, RunTimeTicks: 100000000
            },
            mediaType: 'Video', playMethod, playerStartPositionTicks: 0, fullscreen: false
        });
    }
    return {clock, actions, diagnostics, player, play,
        async loadingReached() {
            for (let i = 0; i < 300 && !unpaused; i++) await Promise.resolve();
            assert.equal(unpaused, true, 'loadfile submitted and unpause reached');
        },
        rejectNextSid() { rejectSid = true; },
        setResolvedSource(value) { resolvedSource = value; },
        holdReady() { automaticReady = false; }, automaticReady() { automaticReady = true; },
        ready() { target.dispatchEvent({type: 'core-playing'}); },
        setTracks(value) { tracks = value; }, setTrackRead(value) { trackRead = value; }};
}

for (const method of ['DirectPlay', 'DirectStream']) for (const target of [0, 3]) {
    test(`initial exact native selection survives without a redundant sid reset: ${method} ${target}`, async () => {
        const h = makeHarness(); h.holdReady();
        const rows = [{Type:'Subtitle', Index:0, DeliveryMethod:'Embed', Codec:'srt'},
            {Type:'Subtitle', Index:3, DeliveryMethod:'Embed', Codec:'srt'}];
        const playing = h.play(rows, target, method);
        await h.loadingReached();
        const plan = h.actions.find(row => row.type === 'initial-subtitle');
        assert.ok(plan, 'arm a generation-bound plan before loadfile');
        assert.ok(h.actions.indexOf(plan) < h.actions.findIndex(row => row.type === 'loadfile'));
        assert.equal(JSON.parse(plan.value).index, target);
        h.setTracks([{type:'sub', external:true, id:1, 'ff-index':0, selected:false},
            {type:'sub', external:false, id:2, 'ff-index':method==='DirectPlay'?0:4, selected:target===0},
            {type:'sub', external:false, id:3, 'ff-index':method==='DirectPlay'?3:7, selected:target===3}]);
        h.ready(); await playing; await flushSelection();
        assert.equal(h.actions.filter(row => row.type === 'sid').length, 0, 'read back exact identity before skipping');
    });
}

for (const selected of ['none', 'external', 'wrong-internal']) test('initial mapping falls back safely when hook selection is '+selected, async () => {
    const h=makeHarness(); h.holdReady();
    const rows=[{Type:'Subtitle', Index:0, DeliveryMethod:'Embed', Codec:'srt'},
        {Type:'Subtitle', Index:3, DeliveryMethod:'Embed', Codec:'srt'}];
    const playing=h.play(rows,3);await h.loadingReached();
    h.setTracks([{type:'sub',external:true,id:1,'ff-index':3,selected:selected==='external'},
        {type:'sub',external:false,id:2,'ff-index':0,selected:selected==='wrong-internal'},
        {type:'sub',external:false,id:4,'ff-index':3,selected:false}]);
    h.ready();await playing;await flushSelection();
    assert.deepEqual(h.actions.filter(r=>r.type==='sid').map(r=>r.value),['no',4]);
});

test('user Off during startup cancels the native plan and cannot be overwritten by default selection', async()=>{
    const h=makeHarness();h.holdReady();
    const playing=h.play([{Type:'Subtitle',Index:0,DeliveryMethod:'Embed',Codec:'srt'}],0);
    await h.loadingReached();h.player.setSubtitleStreamIndex(-1);await flushSelection();
    assert.equal(h.actions.filter(r=>r.type==='initial-subtitle').at(-1).value,'none');
    h.setTracks([{type:'sub',external:false,id:2,'ff-index':0,selected:false}]);h.ready();await playing;await flushSelection();
    assert.ok(h.actions.filter(r=>r.type==='sid').every(r=>r.value==='no'));
});

for(const target of [-1,5]) test('initial Off or external subtitles do not arm guessed internal IDs: '+target,async()=>{
    const h=makeHarness();await h.play([{Type:'Subtitle',Index:5,DeliveryMethod:'External',DeliveryUrl:'opaque:external',Codec:'srt'}],target);
    assert.equal(h.actions.some(r=>r.type==='initial-subtitle'),false);
    await h.clock.advanceTo(700);
    assert.equal(h.actions.some(r=>r.type==='sub-add'),target===5);
});

for (const action of ['off', 'stop', 'new-play']) test('initial verification delayed across '+action+' cannot select or clear a later owner', async()=>{
    const h=makeHarness();h.holdReady();let release;
    const playing=h.play([{Type:'Subtitle',Index:0,DeliveryMethod:'Embed',Codec:'srt'}],0);
    await h.loadingReached();h.setTrackRead(()=>new Promise(resolve=>release=resolve));
    playing.catch(()=>{});h.ready();await flushSelection();assert.equal(typeof release,'function');
    h.setTrackRead(null);
    if(action==='off')h.player.setSubtitleStreamIndex(-1);
    if(action==='stop')await h.player.stop();
    if(action==='new-play') {h.automaticReady();await h.play([],undefined);}
    await flushSelection();const count=h.actions.length;
    release([{type:'sub',external:false,id:9,'ff-index':0,selected:false}]);await playing.catch(()=>{});await flushSelection();
    assert.equal(h.actions.length,count);
});

for (const failure of ['reject','timeout']) test('initial verification '+failure+' disables unverified selection without guessing',async()=>{
    const h=makeHarness();h.holdReady();
    const playing=h.play([{Type:'Subtitle',Index:0,DeliveryMethod:'Embed',Codec:'srt'}],0);
    await h.loadingReached();h.setTrackRead(()=>failure==='reject'?Promise.reject(Error('synthetic')):new Promise(()=>{}));
    h.ready();await flushSelection();await h.clock.advanceTo(1600);await playing;await flushSelection();
    assert.deepEqual(h.actions.filter(row=>row.type==='sid').map(row=>row.value),['no']);
    assert.ok(h.diagnostics.some(row=>row.event==='subtitle-track-unavailable'));
});

const streams = [
    {Type: 'Subtitle', Index: 0, DeliveryMethod: 'External', DeliveryUrl: 'opaque:A', Codec: 'srt'},
    {Type: 'Subtitle', Index: 1, DeliveryMethod: 'External', DeliveryUrl: 'opaque:B', Codec: 'ass'},
    {Type: 'Subtitle', Index: 2, DeliveryMethod: 'Embed', Codec: 'srt'}
];

function additions(harness) { return harness.actions.filter(row => row.type === 'sub-add'); }

test('external A then external B submits only B', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(100);
    h.player.setSubtitleStreamIndex(1);
    await h.clock.advanceTo(800);
    assert.deepEqual(additions(h).map(row => [row.at, row.value]), [[800, 'opaque:B']]);
});

test('external A then internal B leaves B selected', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(100);
    h.player.setSubtitleStreamIndex(2);
    await h.clock.advanceTo(700);
    assert.equal(h.actions.at(-1).type, 'sid');
    assert.equal(h.actions.at(-1).value, 1);
    assert.equal(additions(h).length, 0);
});

test('external A then Off is not undone by old sub-add', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(100);
    h.player.setSubtitleStreamIndex(-1);
    await h.clock.advanceTo(700);
    assert.equal(h.actions.at(-1).value, 'no');
    assert.equal(additions(h).length, 0);
});

test('Off after timer fires but before its Promise callback suppresses stale A', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    h.clock.fireNextWithoutMicrotasks();
    h.player.setSubtitleStreamIndex(-1);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    assert.equal(additions(h).length, 0);
    assert.equal(h.actions.at(-1).value, 'no');
});

test('external A then B then A submits only newest A', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(100);
    h.player.setSubtitleStreamIndex(1);
    await h.clock.advanceTo(200);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(900);
    assert.deepEqual(additions(h).map(row => [row.at, row.value]), [[900, 'opaque:A']]);
});

test('selecting external A twice submits only the latest A', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(100);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(800);
    assert.deepEqual(additions(h).map(row => [row.at, row.value]), [[800, 'opaque:A']]);
});

test('single external subtitle still submits after 700ms', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(699);
    assert.equal(additions(h).length, 0);
    await h.clock.advanceTo(700);
    assert.deepEqual(additions(h).map(row => [row.at, row.value]), [[700, 'opaque:A']]);
});

test('play applies the server-provided default subtitle index', async () => {
    const h = makeHarness(); await h.play(streams, 1);
    await h.clock.advanceTo(700);
    assert.deepEqual(additions(h).map(row => [row.at, row.value]), [[700, 'opaque:B']]);
});

test('default external subtitle from play is superseded by Off', async () => {
    const h = makeHarness(); await h.play(streams, 0);
    await h.clock.advanceTo(100);
    h.player.setSubtitleStreamIndex(-1);
    await h.clock.advanceTo(700);
    assert.equal(additions(h).length, 0);
    assert.equal(h.actions.at(-1).value, 'no');
});

test('Stop invalidates pending external selection', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    await h.player.stop(true);
    await h.clock.advanceTo(700);
    assert.equal(additions(h).length, 0);
});

test('new Play invalidates pending selection from previous media', async () => {
    const h = makeHarness(); await h.play(streams);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(100);
    await h.play(streams);
    await h.clock.advanceTo(700);
    assert.equal(additions(h).length, 0);
});

test('current delayed sub-add rejection stays diagnosed and contained', async () => {
    const h = makeHarness(); await h.play([{...streams[0], DeliveryUrl: 'opaque:reject'}]);
    h.player.setSubtitleStreamIndex(0);
    await h.clock.advanceTo(700);
    assert.equal(additions(h).length, 1);
    assert.equal(h.diagnostics.some(row => row.event === 'subtitle-command-failed'), true);
});

async function flushSelection() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
const embedded = {Type: 'Subtitle', Index: 8, DeliveryMethod: 'Embed', Codec: 'srt'};
const mappedTrack = {type: 'sub', external: false, id: 17, 'ff-index': 8};
for (const order of ['first', 'middle', 'last']) {
    test(`DirectPlay uses actual id with external ${order}, including loaded external`, async () => {
        const h = makeHarness();
        const other = {...embedded, Index: 11};
        const rows = order === 'first' ? [streams[0], embedded, other] :
            order === 'middle' ? [embedded, streams[0], other] : [embedded, other, streams[0]];
        await h.play(rows);
        h.setTracks([mappedTrack, {type: 'sub', external: false, id: 31, 'ff-index': 11},
            {type: 'sub', external: true, id: 55, 'ff-index': 8}]);
        const before = h.actions.length;
        h.player.setSubtitleStreamIndex(0); await h.clock.advanceTo(700);
        assert.deepEqual(h.actions.slice(before).map(row => row.type), ['sub-add'], 'external never writes guessed sid');
        h.player.setSubtitleStreamIndex(8); await flushSelection();
        assert.equal(h.actions.at(-1).value, 17);
        h.player.setSubtitleStreamIndex(11); await flushSelection();
        assert.equal(h.actions.at(-1).value, 31);
    });
}
for (const retirement of ['off', 'selection', 'stop', 'new-play']) {
    test(`late track table cannot undo ${retirement}`, async () => {
        const h = makeHarness(); await h.play([embedded]);
        let release;
        h.setTrackRead(() => new Promise(resolve => {release = resolve;}));
        h.player.setSubtitleStreamIndex(8); await flushSelection();
        assert.equal(typeof release, 'function');
        if (retirement === 'off') h.player.setSubtitleStreamIndex(-1);
        if (retirement === 'selection') h.player.setSubtitleStreamIndex(999);
        if (retirement === 'stop') await h.player.stop(true);
        if (retirement === 'new-play') await h.play([]);
        const count = h.actions.length;
        release([mappedTrack]); await flushSelection();
        assert.equal(h.actions.length, count, 'retired read makes no mutation');
    });
}
test('pending table retries after load readiness, no ordinal fallback', async () => {
    const h=makeHarness(); await h.play([embedded]);
    h.setTracks(null); h.player.setSubtitleStreamIndex(8); await flushSelection();
    assert.equal(h.actions.at(-1).value, 'no');
    h.setTracks([mappedTrack]); await h.clock.advanceTo(100); await flushSelection();
    assert.equal(h.actions.at(-1).value, 17);
});
for (const value of [[], [mappedTrack, {...mappedTrack, id: 18}], [{type:'sub', external:false,id:1}],
    [{...mappedTrack, external:true}], [{...mappedTrack, id:0}]]) {
    test(`invalid/ambiguous mapping stays off: ${JSON.stringify(value)}`, async () => {
        const h=makeHarness(); await h.play([embedded]); h.setTracks(value);
        h.player.setSubtitleStreamIndex(8); await flushSelection(); await h.clock.advanceTo(1600);
        assert.equal(h.actions.at(-1).value, 'no');
        assert.ok(h.diagnostics.some(row=>row.event==='subtitle-track-unavailable'));
    });
}
test('hanging table is bounded and its late answer cannot select', async()=>{
    const h=makeHarness(); await h.play([embedded]); let release;
    h.setTrackRead(()=>new Promise(resolve=>{release=resolve;}));
    h.player.setSubtitleStreamIndex(8); await flushSelection(); await h.clock.advanceTo(1500);
    const count=h.actions.length; release([mappedTrack]); await flushSelection();
    assert.equal(h.actions.length,count);
    assert.ok(h.diagnostics.some(row=>row.event==='subtitle-track-unavailable'));
});
for (const method of ['Transcode']) {
    test(`${method} retains existing internal contract, does not equate source and output index`, async()=>{
        const h=makeHarness(); await h.play([streams[0],embedded],undefined,method);
        h.setTrackRead(()=>{throw Error('must not read source ff-index for remux');});
        h.player.setSubtitleStreamIndex(8); await flushSelection();
        assert.equal(h.actions.at(-1).value,2);
    });
}

for (const off of [false,true]) test(`slow startup applies owned default only after ready, Off=${off}`,async()=>{
    const h=makeHarness(); h.holdReady();
    const playing=h.play([embedded],8); await h.loadingReached();
    await h.clock.advanceTo(3000); await flushSelection();
    assert.equal(h.diagnostics.some(r=>r.event==='subtitle-track-unavailable'),false,'loading is not mapping timeout');
    if(off)h.player.setSubtitleStreamIndex(-1);
    h.ready(); await playing; await flushSelection();
    assert.equal(h.actions.filter(a=>a.type==='sid').at(-1).value,off?'no':1);
});

test('reported sequence: default external, first embedded, then Simplified uses exact native identity',async()=>{
    const first={...embedded,Index:3};
    const traditional={...embedded,Index:11};
    const h=makeHarness(); await h.play([streams[0],first,embedded,traditional],0);
    h.setTracks([{type:'sub',external:false,id:5,'ff-index':3},mappedTrack,
        {type:'sub',external:false,id:31,'ff-index':11},{type:'sub',external:true,id:55,'ff-index':0}]);
    await h.clock.advanceTo(700); assert.equal(additions(h).length,1);
    h.player.setSubtitleStreamIndex(3); await flushSelection(); assert.equal(h.actions.at(-1).value,5);
    h.player.setSubtitleStreamIndex(8); await flushSelection(); assert.equal(h.actions.at(-1).value,17);
    assert.equal(h.actions.filter(a=>a.type==='sid').some(a=>a.value===31),false);
});

test('manual embedded choice during slow startup keeps its owner until ready',async()=>{
    const h=makeHarness(); h.holdReady();
    const playing=h.play([embedded,{...embedded,Index:11}],8); await h.loadingReached();
    h.player.setSubtitleStreamIndex(11); await h.clock.advanceTo(3000); await flushSelection();
    assert.equal(h.diagnostics.some(r=>r.event==='subtitle-track-unavailable'),false);
    h.ready(); await playing; await flushSelection();
    assert.equal(h.actions.filter(a=>a.type==='sid').at(-1).value,2);
});

test('sid rejection retires lookup timer and does not produce a later false timeout',async()=>{
    const h=makeHarness(); await h.play([embedded]);h.rejectNextSid();
    h.player.setSubtitleStreamIndex(8);await flushSelection();
    assert.equal(h.clock.queue.some(row=>row.at===1500),false);
    const failures=h.diagnostics.filter(r=>r.event==='subtitle-track-unavailable').length;
    await h.clock.advanceTo(2000);
    assert.equal(h.diagnostics.filter(r=>r.event==='subtitle-track-unavailable').length,failures);
    assert.equal(failures,1);
});

test('VideoSideData preserves generated closed-caption track contract',async()=>{
    const h=makeHarness(); await h.play([{...embedded,DeliveryMethod:'VideoSideData'}]);
    h.setTrackRead(()=>{throw Error('generated captions lack a container ff-index');});
    h.player.setSubtitleStreamIndex(8);await flushSelection();
    assert.equal(h.actions.at(-1).value,1);
});

const originalRoutes = [
    {type:'url',source:'opaque:raw',sourceKind:'direct-url',isStrm:true,fallback:false},
    {type:'url',source:'opaque:raw',sourceKind:'cd2-url',isStrm:true,fallback:false},
    {type:'local',source:'opaque:raw',reason:'mount_hit',isStrm:true,localExists:true,fallback:false},
    {type:'local',source:'opaque:raw',sourceKind:'downloaded-file',reason:'download_hit',localExists:true,fallback:false}
];
for(const route of originalRoutes) for(const method of ['DirectStream','Transcode']) {
    test(`${method} resolved ${route.sourceKind||route.reason} uses only proven original-container mapping`,async()=>{
        const h=makeHarness();h.setResolvedSource(route);await h.play([streams[0],embedded],undefined,method);
        h.setTracks([mappedTrack]);h.player.setSubtitleStreamIndex(8);await flushSelection();
        assert.equal(h.actions.at(-1).value,method==='DirectStream'?17:2);
    });
}
for(const route of [{...originalRoutes[0],fallback:true},{...originalRoutes[0],isStrm:false},
    {...originalRoutes[0],sourceKind:'unknown'},{...originalRoutes[2],localExists:false}]) {
    test(`unproven DirectStream route does not infer container identity: ${JSON.stringify(route)}`,async()=>{
        const h=makeHarness();h.setResolvedSource(route);await h.play([streams[0],embedded],undefined,'DirectStream');
        h.setTracks([{type:'sub',external:false,id:17,'ff-index':1},{type:'sub',external:true,id:1,'ff-index':8}]);
        h.player.setSubtitleStreamIndex(8);await flushSelection();assert.equal(h.actions.at(-1).value,17);
        assert.ok(h.diagnostics.some(row=>row.event==='subtitle-track-submitted'&&row.details.subtitleMapping==='output-order'));
    });
}
test('resolved DirectStream default and manual loading choices do not wait before unpause',async()=>{
    const h=makeHarness();h.setResolvedSource(originalRoutes[0]);h.holdReady();
    const playing=h.play([streams[0],embedded],8,'DirectStream');await h.loadingReached();
    h.player.setSubtitleStreamIndex(8);await h.clock.advanceTo(3000);h.setTracks([mappedTrack]);
    h.ready();await playing;await flushSelection();assert.equal(h.actions.at(-1).value,17);
});

for(const externalPosition of ['first','middle','last']) test('native DirectStream maps output order past early external id: '+externalPosition,async()=>{
 const h=makeHarness(); const internal=[5,6,7].map(Index=>({...embedded,Index,IsExternal:false}));
 const ext={...streams[0],Index:12,IsExternal:true};
 const rows=externalPosition==='first'?[ext,...internal]:externalPosition==='middle'?[internal[0],ext,...internal.slice(1)]:[...internal,ext];
 await h.play(rows,12,'DirectStream');await h.clock.advanceTo(700);
 h.setTracks([{type:'sub',external:true,id:1,'ff-index':0},...internal.map((x,i)=>({type:'sub',external:false,id:i+2,'ff-index':i+1}))]);
 h.player.setSubtitleStreamIndex(5);await flushSelection();assert.equal(h.actions.at(-1).value,2);
 h.player.setSubtitleStreamIndex(7);await flushSelection();assert.equal(h.actions.at(-1).value,4);
});
test('native DirectStream rejects a remux table with a different embedded count',async()=>{
 const h=makeHarness();await h.play([{...embedded,Index:5},{...embedded,Index:6}],undefined,'DirectStream');
 h.setTracks([{type:'sub',external:false,id:2,'ff-index':1},{type:'sub',external:true,id:1}]);
 h.player.setSubtitleStreamIndex(6);await flushSelection();await h.clock.advanceTo(1600);await flushSelection();
 assert.equal(h.actions.at(-1).value,'no');assert.ok(h.diagnostics.some(r=>r.event==='subtitle-track-unavailable'));
});
for(const action of ['off','stop','selection','new-play']) test('native DirectStream delayed mapping cannot undo '+action,async()=>{
 const h=makeHarness();await h.play([embedded],undefined,'DirectStream');let release;
 h.setTrackRead(()=>new Promise(r=>release=r));h.player.setSubtitleStreamIndex(8);await flushSelection();
 h.setTrackRead(null);
 if(action==='off')h.player.setSubtitleStreamIndex(-1);
 if(action==='stop')await h.player.stop();
 if(action==='selection'){h.setTracks([{type:'sub',external:false,id:7,'ff-index':1}]);h.player.setSubtitleStreamIndex(8);}
 if(action==='new-play')await h.play([embedded],undefined,'DirectStream');
 await flushSelection();const n=h.actions.length;release([{type:'sub',external:false,id:9,'ff-index':1}]);await flushSelection();assert.equal(h.actions.length,n);
});
test('native DirectStream extracted internal subtitle remains in output order',async()=>{
 const h=makeHarness();await h.play([{...streams[0],IsExternal:false},embedded],undefined,'DirectStream');
 h.setTracks([{type:'sub',external:false,id:2,'ff-index':1},{type:'sub',external:false,id:3,'ff-index':2},{type:'sub',external:true,id:1}]);
 h.player.setSubtitleStreamIndex(8);await flushSelection();assert.equal(h.actions.at(-1).value,3);
});

test('native DirectStream slow startup defaults wait without blocking unpause',async()=>{
 const h=makeHarness();h.holdReady();const playing=h.play([embedded],8,'DirectStream');await h.loadingReached();
 await h.clock.advanceTo(3000);h.setTracks([{type:'sub',external:false,id:7,'ff-index':1}]);
 h.ready();await playing;await flushSelection();assert.equal(h.actions.at(-1).value,7);
});
test('subtitle table diagnostics survive the production sanitizer without URL fields',async()=>{
 const h=makeHarness();await h.play([embedded],undefined,'DirectStream');
 h.setTracks([{type:'sub',external:false,id:7,'ff-index':1,title:'Simplified',lang:'chi',codec:'hdmv_pgs_subtitle'},
 {type:'sub',external:true,id:1,'ff-index':0,externalFilename:'https://invalid.example/?token=synthetic'}]);
 h.player.setSubtitleStreamIndex(8);await flushSelection();
 const record=h.diagnostics.find(r=>r.event==='subtitle-track-table');
 const sanitized=require('../src/electronapp/enhanced/diagnostics').sanitizeRecord(record);
 assert.equal(sanitized.details.subtitleMapping,'output-order');assert.equal(sanitized.details.subtitleStreamIndex,8);
 assert.equal(sanitized.details.tracks[0].id,7);assert.equal(sanitized.details.tracks[0].containerIndex,1);
 assert.equal(sanitized.details.tracks[1].external,true);assert.equal(JSON.stringify(sanitized).includes('invalid.example'),false);
});

test('submitted subtitle reports observed selection separately from command acceptance',async()=>{
 const h=makeHarness();await h.play([embedded],undefined,'DirectStream');
 h.setTracks([{type:'sub',external:false,id:7,'ff-index':1,selected:true}]);
 h.player.setSubtitleStreamIndex(8);await flushSelection();
 const observed=h.diagnostics.find(r=>r.event==='subtitle-track-observed');
 assert.equal(observed.details.selectedTarget,true);assert.equal(observed.details.selectedTracks[0].id,7);
});

test('early external-only table does not consume the embedded table diagnostic',async()=>{
 const h=makeHarness();await h.play([embedded],undefined,'DirectStream');
 h.setTracks([{type:'sub',external:true,id:1,'ff-index':0}]);h.player.setSubtitleStreamIndex(8);await flushSelection();
 assert.equal(h.diagnostics.some(r=>r.event==='subtitle-track-table'),false);
 h.setTracks([{type:'sub',external:false,id:2,'ff-index':1}]);await h.clock.advanceTo(100);await flushSelection();
 assert.equal(h.diagnostics.find(r=>r.event==='subtitle-track-table').details.tracks[0].id,2);
});
test('terminal missing embedded tracks retains the final diagnostic count and table',async()=>{
 const h=makeHarness();await h.play([embedded],undefined,'DirectStream');
 h.setTracks([{type:'sub',external:true,id:1,'ff-index':0}]);h.player.setSubtitleStreamIndex(8);await flushSelection();
 await h.clock.advanceTo(1600);await flushSelection();
 const detail=h.diagnostics.find(r=>r.event==='subtitle-track-unavailable').details;
 assert.equal(detail.expectedTrackCount,1);assert.equal(detail.observedTrackCount,0);assert.equal(detail.tracks[0].external,true);
});
test('generated caption ff-index minus one does not change native output ordinals',async()=>{
 const h=makeHarness();await h.play([embedded,{...embedded,Index:9,DeliveryMethod:'VideoSideData'}],undefined,'DirectStream');
 h.setTracks([{type:'sub',external:false,id:6,'ff-index':-1},{type:'sub',external:false,id:7,'ff-index':1}]);
 h.player.setSubtitleStreamIndex(8);await flushSelection();assert.equal(h.actions.at(-1).value,7);
});
