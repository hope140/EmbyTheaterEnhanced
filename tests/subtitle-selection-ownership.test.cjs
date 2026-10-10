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
        setProperties(properties) {
            if (Object.hasOwn(properties, 'sid')) actions.push({at: clock.now, type: 'sid', value: properties.sid});
            return Promise.resolve({status: 'accepted'});
        },
        sendCommand(command) {
            if (Array.isArray(command) && command[0] === 'loadfile') {
                actions.push({at: clock.now, type: 'loadfile'});
                queueMicrotask(() => target.dispatchEvent({type: 'core-playing'}));
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
    async function play(mediaStreams, defaultSubtitleIndex) {
        const id = ++requestId;
        await player.play({
            _etePlayRequestId: id,
            url: 'opaque:media',
            item: {ServerId: 'fixture', MediaType: 'Video', Type: 'Movie', Path: '/fixture/movie.strm'},
            mediaSource: {
                Path: '/fixture/movie.mkv', MediaStreams: mediaStreams.map(row => ({...row})),
                DefaultSubtitleStreamIndex: defaultSubtitleIndex, RunTimeTicks: 100000000
            },
            mediaType: 'Video', playMethod: 'DirectPlay', playerStartPositionTicks: 0, fullscreen: false
        });
    }
    return {clock, actions, diagnostics, player, play};
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
    assert.equal(h.actions.at(-1).value, 3);
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
