'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the complete production AMD module through play() and its public
// setSubtitleStreamIndex() entry point. Only the browser, bridge and clock are fake.
const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');

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
        {isStrm() { return false; }, resolveAsync(ctx) { return Promise.resolve({type: 'native', source: ctx.nativeSource}); }},
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
        holdReady() { automaticReady = false; }, ready() { target.dispatchEvent({type: 'core-playing'}); },
        setTracks(value) { tracks = value; }, setTrackRead(value) { trackRead = value; }};
}

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
for (const method of ['DirectStream', 'Transcode']) {
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
