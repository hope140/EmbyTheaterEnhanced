'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const moduleSource = fs.readFileSync(
    path.join(__dirname, '../src/electronapp/enhanced/nexttrack-transition.js'),
    'utf8'
);

function loadBrowserModule() {
    const context = vm.createContext({});
    vm.runInContext(moduleSource, context, {filename: 'nexttrack-transition.js'});
    return context.eteNextTrackTransition;
}

function makeTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            const set = listeners.get(type) || new Set();
            set.add(listener);
            listeners.set(type, set);
        },
        removeEventListener(type, listener) {
            const set = listeners.get(type);
            if (set) set.delete(listener);
        },
        dispatchEvent(event) {
            for (const listener of Array.from(listeners.get(event.type) || [])) listener.call(this, event);
        }
    };
}

function makeElement(tagName) {
    const target = makeTarget();
    const classes = new Set();
    let source = '';
    return Object.assign(target, {
        tagName: tagName.toUpperCase(),
        className: '',
        classList: {
            add(value) { classes.add(value); },
            contains(value) { return classes.has(value); }
        },
        style: {},
        children: [],
        parentNode: null,
        complete: tagName.toLowerCase() !== 'img',
        get src() { return source; },
        set src(value) { source = value; },
        setAttribute(name, value) { this[name] = value; },
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        removeChild(child) {
            this.children = this.children.filter(item => item !== child);
            child.parentNode = null;
            return child;
        },
        querySelector(selector) {
            return selector === 'img' ? this.children.find(child => child.tagName === 'IMG') || null : null;
        }
    });
}

function makeHarness() {
    const document = Object.assign(makeTarget(), {
        visibilityState: 'visible',
        createElement: makeElement
    });
    const frames = [];
    const cancelledFrames = new Set();
    let nextFrameId = 0;
    const window = {
        requestAnimationFrame(callback) {
            const id = ++nextFrameId;
            frames.push({id, callback});
            return id;
        },
        cancelAnimationFrame(id) { cancelledFrames.add(id); },
        matchMedia() { return {matches: false}; }
    };
    const container = makeElement('div');
    container.style.opacity = '0.5';
    const module = loadBrowserModule();
    const transition = module.create({
        document,
        window,
        connectionManager: {
            getApiClient() { return {getImageUrl(id, image) { return `image://${id}/${image.type}`; }}; }
        },
        getContainer() { return container; }
    });
    return {
        module,
        document,
        window,
        frames,
        cancelledFrames,
        container,
        transition,
        get overlay() { return container.children.find(child => child.className === 'mpv-nextTrackTransition') || null; },
        runFrame() {
            let frame = frames.shift();
            while (frame && cancelledFrames.has(frame.id)) frame = frames.shift();
            assert.ok(frame, 'a requestAnimationFrame callback is queued');
            frame.callback(1);
        }
    };
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
}

async function paintTwice(harness) {
    await flushMicrotasks();
    harness.runFrame();
    harness.runFrame();
    await flushMicrotasks();
}

function item(id, mediaType = 'Video') {
    return {Id: id, MediaType: mediaType, ImageTags: {Primary: `${id}-primary`}};
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return {promise, resolve, reject};
}

function makeManager(harness, player, playlist, currentIndex, nextItem, options = {}) {
    const calls = [];
    const nextDeferred = options.nextDeferred;
    const previousDeferred = options.previousDeferred;
    const manager = {
        _etePlayRequestSequence: 0,
        _playQueueManager: {
            getNextItemInfo() {
                calls.push({type: 'getNextItemInfo'});
                return nextItem ? {item: nextItem, index: 2} : null;
            },
            getPlaylist() {
                calls.push({type: 'getPlaylist'});
                return playlist;
            }
        },
        getCurrentPlayer() { return player; },
        getCurrentPlaylistIndex(foundPlayer) {
            calls.push({type: 'getCurrentPlaylistIndex', player: foundPlayer});
            return currentIndex;
        },
        nextTrack(...args) {
            calls.push({type: 'nextTrack', receiver: this, args, overlayPresent: !!harness.overlay});
            this._etePlayRequestSequence++;
            return nextDeferred ? nextDeferred.promise : Promise.resolve('next');
        },
        previousTrack(...args) {
            calls.push({type: 'previousTrack', receiver: this, args, overlayPresent: !!harness.overlay});
            this._etePlayRequestSequence++;
            return previousDeferred ? previousDeferred.promise : Promise.resolve('previous');
        }
    };
    return {manager, calls};
}

test('next and previous synchronously show the selected Video and preserve original receiver, args, and request sequence', async function () {
    const harness = makeHarness();
    const player = {};
    const queue = [item('previous-index-0'), item('previous-index-1'), item('current-index-2')];
    const nextItem = item('next-index-2');
    const {manager, calls} = makeManager(harness, player, queue, 2, nextItem);
    const originalNext = manager.nextTrack;
    const originalPrevious = manager.previousTrack;
    harness.module.install(manager, player, harness.transition);

    try {
        assert.notEqual(manager.nextTrack, originalNext);
        assert.notEqual(manager.previousTrack, originalPrevious);

        const nextArgs = [player, 'next-options'];
        const nextResult = manager.nextTrack(...nextArgs);
        assert.equal(calls.find(call => call.type === 'nextTrack').overlayPresent, true,
            'the next overlay is present before the original manager method runs');
        assert.equal(harness.overlay.querySelector('img').src, 'image://next-index-2/Primary');
        assert.equal(manager._etePlayRequestSequence, 1);
        assert.equal(await nextResult, 'next');
        harness.transition.cancel();

        calls.length = 0;
        const previousArgs = [player, 'previous-options'];
        const previousResult = manager.previousTrack(...previousArgs);
        const selected = calls.find(call => call.type === 'getPlaylist');
        assert.ok(selected, 'previous item is read from the existing queue');
        assert.deepEqual(calls.slice(0, 2).map(call => call.type), ['getCurrentPlaylistIndex', 'getPlaylist']);
        assert.equal(calls[0].player, player);
        assert.equal(calls.find(call => call.type === 'previousTrack').overlayPresent, true,
            'the previous overlay is present before the original manager method runs');
        assert.equal(harness.overlay.querySelector('img').src, 'image://previous-index-1/Primary');
        const originalCall = calls.find(call => call.type === 'previousTrack');
        assert.equal(originalCall.receiver, manager);
        assert.deepEqual(originalCall.args, previousArgs);
        assert.equal(manager._etePlayRequestSequence, 2);
        assert.equal(await previousResult, 'previous');
    } finally {
        harness.transition.cancel();
    }
});

test('previous item lookup bypasses the overlay at playlist start, for non-Video items, and for another player', async function () {
    const harness = makeHarness();
    const player = {};
    const otherPlayer = {};
    const playlist = [item('first', 'Video'), item('current', 'Video')];
    const {manager, calls} = makeManager(harness, player, playlist, 0, item('next'));
    harness.module.install(manager, player, harness.transition);

    try {
        await manager.previousTrack(player, 'at-start');
        assert.equal(harness.overlay, null, 'index zero has no previous Item');
        assert.equal(calls.some(call => call.type === 'getPlaylist'), false,
            'a negative previous index does not read a queue item');

        calls.length = 0;
        const nonVideoPlaylist = [item('previous-audio', 'Audio'), item('current', 'Video')];
        manager._playQueueManager.getPlaylist = function () {
            calls.push({type: 'getPlaylist'});
            return nonVideoPlaylist;
        };
        manager.getCurrentPlaylistIndex = function (foundPlayer) {
            calls.push({type: 'getCurrentPlaylistIndex', player: foundPlayer});
            return 1;
        };
        await manager.previousTrack(player, 'non-video');
        assert.equal(harness.overlay, null, 'a non-Video previous Item bypasses the visual transition');

        calls.length = 0;
        await manager.previousTrack(otherPlayer, 'external-player');
        assert.equal(harness.overlay, null, 'another player does not use this libmpv transition');
        assert.equal(calls.some(call => call.type === 'getCurrentPlaylistIndex' || call.type === 'getPlaylist'), false,
            'another player bypasses current-player queue inspection');
        const externalCall = calls.find(call => call.type === 'previousTrack');
        assert.equal(externalCall.receiver, manager);
        assert.deepEqual(externalCall.args, [otherPlayer, 'external-player']);
    } finally {
        harness.transition.cancel();
    }
});

test('a rapid next then previous switch keeps the newer previous overlay across old completion callbacks', async function () {
    const harness = makeHarness();
    const player = {};
    const playlist = [item('previous'), item('current'), item('next')];
    const nextDeferred = deferred();
    const previousDeferred = deferred();
    const {manager} = makeManager(harness, player, playlist, 1, item('next'), {nextDeferred, previousDeferred});
    harness.module.install(manager, player, harness.transition);

    let nextCall;
    let previousCall;
    try {
        nextCall = manager.nextTrack(player, 'next-call');
        const oldOverlay = harness.overlay;
        assert.equal(oldOverlay.querySelector('img').src, 'image://next/Primary');
        assert.equal(manager._etePlayRequestSequence, 1);

        previousCall = manager.previousTrack(player, 'previous-call');
        const newestOverlay = harness.overlay;
        assert.notEqual(newestOverlay, oldOverlay);
        assert.equal(oldOverlay.parentNode, null);
        assert.equal(newestOverlay.querySelector('img').src, 'image://previous/Primary');
        assert.equal(manager._etePlayRequestSequence, 2);

        harness.transition.playbackReady(1);
        harness.transition.playbackFailed(1);
        nextDeferred.resolve('old-next-finished');
        assert.equal(await nextCall, 'old-next-finished');
        await flushMicrotasks();

        assert.equal(harness.overlay, newestOverlay, 'the old next request cannot clear the newer previous transition');
        assert.equal(harness.transition.currentState(), 'LOADING_NEXT');
        harness.transition.playbackReady(2);
        await paintTwice(harness);
        assert.equal(harness.overlay, newestOverlay, 'only the matching previous request starts the current fade');

        previousDeferred.resolve('previous-finished');
        assert.equal(await previousCall, 'previous-finished');
    } finally {
        harness.transition.cancel();
        nextDeferred.resolve('cleanup-next');
        previousDeferred.resolve('cleanup-previous');
        if (nextCall) await nextCall.catch(() => {});
        if (previousCall) await previousCall.catch(() => {});
    }
});
