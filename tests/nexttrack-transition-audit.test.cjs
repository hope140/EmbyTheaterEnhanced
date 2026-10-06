'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const transitionModule = require('../src/electronapp/enhanced/nexttrack-transition.js');

function eventTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            const current = listeners.get(type) || new Set();
            current.add(listener);
            listeners.set(type, current);
        },
        removeEventListener(type, listener) {
            const current = listeners.get(type);
            if (current) current.delete(listener);
        },
        dispatchEvent(event) {
            for (const listener of Array.from(listeners.get(event.type) || [])) {
                listener.call(this, event);
            }
        },
        listenerCount(type) {
            return (listeners.get(type) || new Set()).size;
        }
    };
}

function element(tagName) {
    const target = eventTarget();
    const classes = new Set();
    return Object.assign(target, {
        tagName: tagName.toUpperCase(),
        className: '',
        classList: {
            add(name) { classes.add(name); },
            contains(name) { return classes.has(name); }
        },
        style: {},
        children: [],
        parentNode: null,
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
        }
    });
}

function makeHarness(options = {}) {
    const document = Object.assign(eventTarget(), {
        visibilityState: options.visibilityState || 'visible',
        createElement: element
    });
    const callbacks = [];
    const cancelledFrameIds = new Set();
    let rafCalls = 0;
    let nextFrameId = 0;
    const window = {
        requestAnimationFrame(callback) {
            rafCalls++;
            if (options.throwOnRafCall === rafCalls) throw new Error('raf unavailable');
            const id = ++nextFrameId;
            callbacks.push({id, callback});
            return id;
        },
        cancelAnimationFrame(id) {
            cancelledFrameIds.add(id);
        },
        matchMedia() { return {matches: false}; }
    };
    const container = element('div');
    container.style.opacity = '0.6';
    const transition = transitionModule.create({
        document,
        window,
        connectionManager: {
            getApiClient() {
                return {getImageUrl() { return 'image://next-item'; }};
            }
        },
        getContainer() { return container; }
    });
    return {
        document,
        window,
        callbacks,
        container,
        transition,
        get rafCalls() { return rafCalls; },
        cancelledFrameIds,
        get overlay() { return container.children.find(child => child.className === 'mpv-nextTrackTransition') || null; },
        runNextFrame() {
            let frame = callbacks.shift();
            while (frame && cancelledFrameIds.has(frame.id)) frame = callbacks.shift();
            assert.ok(frame, 'a pending animation frame exists');
            frame.callback(1);
        }
    };
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
}

async function completePaint(harness) {
    await flushMicrotasks();
    harness.runNextFrame();
    harness.runNextFrame();
    await flushMicrotasks();
}

function videoItem(id) {
    return {Id: id, MediaType: 'Video', ImageTags: {Primary: `${id}-primary`}};
}

test('hidden document skips the paint gate without scheduling animation frames', async function () {
    const harness = makeHarness({visibilityState: 'hidden'});
    harness.transition.show(videoItem('hidden'));

    await harness.transition.beforeTeardown();

    assert.equal(harness.rafCalls, 0);
    assert.ok(harness.overlay, 'the overlay remains until the playback lifecycle clears it');
});

test('visibilitychange to hidden releases a pending paint gate and removes its listener', async function () {
    const harness = makeHarness();
    harness.transition.show(videoItem('visibility'));
    let settled = false;
    const gate = harness.transition.beforeTeardown().then(() => { settled = true; });

    await flushMicrotasks();
    assert.equal(harness.document.listenerCount('visibilitychange'), 1);
    assert.equal(settled, false);

    harness.document.visibilityState = 'hidden';
    harness.document.dispatchEvent({type: 'visibilitychange'});
    await gate;

    assert.equal(settled, true);
    assert.equal(harness.document.listenerCount('visibilitychange'), 0);
    assert.ok(harness.overlay, 'visibility change releases painting, not transition ownership');
});

test('a newer play cancels the active overlay while the old paint callback is pending', async function () {
    const harness = makeHarness();
    const token = harness.transition.show(videoItem('old-play'));
    harness.transition.markLoading(token, 10);
    const gate = harness.transition.beforeTeardown();
    await flushMicrotasks();
    assert.equal(harness.callbacks.length, 1);
    const retiredFrame = harness.callbacks[0].callback;

    harness.transition.playbackStarted(11);
    assert.equal(harness.overlay, null);
    await gate;
    assert.equal(harness.document.listenerCount('visibilitychange'), 0);
    assert.equal(harness.cancelledFrameIds.has(1), true);
    retiredFrame(1);

    assert.equal(harness.transition.isActive(), false);
});

test('an absent transitionend keeps the fading overlay owned until an existing cancellation path runs', async function () {
    const harness = makeHarness();
    const token = harness.transition.show(videoItem('no-transitionend'));
    harness.transition.markLoading(token, 1);
    harness.transition.playbackReady(1);
    await completePaint(harness);

    const fading = harness.overlay;
    assert.ok(fading.classList.contains('mpv-nextTrackTransition-fading'));
    await flushMicrotasks();
    assert.equal(harness.transition.currentState(), 'HIDE_TRANSITION');
    assert.equal(harness.overlay, fading, 'the module has no independent timeout cleanup contract');

    harness.transition.cancel();
    assert.equal(harness.overlay, null);
    assert.equal(harness.container.style.opacity, '0.6');
});

test('reinstalling the same manager updates the binding without nesting its wrapper', async function () {
    const harness = makeHarness();
    const firstPlayer = {};
    const secondPlayer = {};
    const firstTransition = makeHarness().transition;
    const nextItem = videoItem('rapid');
    let originalCalls = 0;
    const manager = {
        _etePlayRequestSequence: 0,
        _playQueueManager: {getNextItemInfo() { return {item: nextItem}; }},
        nextTrack() {
            originalCalls++;
            this._etePlayRequestSequence++;
            return Promise.resolve('ok');
        }
    };

    transitionModule.install(manager, firstPlayer, firstTransition);
    transitionModule.install(manager, secondPlayer, harness.transition);

    await manager.nextTrack(firstPlayer);
    assert.equal(originalCalls, 1);
    assert.equal(harness.overlay, null, 'the previous player binding is no longer eligible');

    const call = manager.nextTrack(secondPlayer);
    assert.ok(harness.overlay, 'the replacement binding owns the overlay');
    assert.equal(originalCalls, 2, 'the original manager method is called once per request');
    assert.equal(await call, 'ok');
});

test('a synchronous nextTrack throw clears the overlay and preserves the original error', function () {
    const harness = makeHarness();
    const player = {};
    const expected = new Error('synchronous nextTrack failure');
    const manager = {
        _etePlayRequestSequence: 0,
        _playQueueManager: {getNextItemInfo() { return {item: videoItem('sync-throw')}; }},
        nextTrack() { throw expected; }
    };
    transitionModule.install(manager, player, harness.transition);

    assert.throws(() => manager.nextTrack(player), error => error === expected);
    assert.equal(harness.overlay, null);
    assert.equal(harness.transition.currentState(), 'IDLE');
});

test('a synchronous animation-frame failure rejects the paint gate for the caller to fail open', async function () {
    const harness = makeHarness({throwOnRafCall: 1});
    harness.transition.show(videoItem('raf-throw'));

    await assert.rejects(harness.transition.beforeTeardown(), /raf unavailable/);
    assert.equal(harness.document.listenerCount('visibilitychange'), 0);
});

test('failure scheduling the second frame rejects and clears the paint listener', async function () {
    const harness = makeHarness({throwOnRafCall: 2});
    harness.transition.show(videoItem('second-raf-throw'));
    const gate = harness.transition.beforeTeardown();
    const rejected = assert.rejects(gate, /raf unavailable/);
    harness.runNextFrame();
    await rejected;
    assert.equal(harness.document.listenerCount('visibilitychange'), 0);
});

test('a cancelled opacity transition clears its element and event listeners', async function () {
    const harness = makeHarness();
    const token = harness.transition.show(videoItem('fade-cancelled'));
    harness.transition.markLoading(token, 1);
    harness.transition.playbackReady(1);
    await completePaint(harness);
    const fading = harness.overlay;
    fading.dispatchEvent({type: 'transitioncancel', target: fading, propertyName: 'opacity'});
    assert.equal(harness.overlay, null);
    assert.equal(harness.transition.currentState(), 'IDLE');
    assert.equal(fading.listenerCount('transitionend'), 0);
    assert.equal(fading.listenerCount('transitioncancel'), 0);
});

test('playbackReady clears immediately after paint when the fading element has no active animation', async function () {
    const harness = makeHarness();
    const token = harness.transition.show(videoItem('no-active-animation'));
    const overlay = harness.overlay;
    overlay.getAnimations = function () { return []; };
    harness.transition.markLoading(token, 1);

    harness.transition.playbackReady(1);
    await completePaint(harness);

    assert.equal(harness.overlay, null);
    assert.equal(harness.transition.currentState(), 'IDLE');
});

test('animation completion clears a fade when the renderer omits transitionend', async function () {
    const harness = makeHarness();
    const token = harness.transition.show(videoItem('silent-animation-end'));
    let finishAnimation;
    harness.overlay.getAnimations = function () {
        return [{finished: new Promise(resolve => { finishAnimation = resolve; })}];
    };
    harness.transition.markLoading(token, 1);
    harness.transition.playbackReady(1);
    await completePaint(harness);
    assert.equal(harness.transition.currentState(), 'HIDE_TRANSITION');
    finishAnimation();
    await flushMicrotasks();
    assert.equal(harness.overlay, null);
    assert.equal(harness.transition.currentState(), 'IDLE');
});

test('terminal cancel releases a pending teardown paint gate and its listener/frame callback', async function () {
    const harness = makeHarness();
    harness.transition.show(videoItem('cancel-pending-paint'));
    let settled = false;
    const gate = harness.transition.beforeTeardown().then(() => { settled = true; });

    await flushMicrotasks();
    assert.equal(harness.document.listenerCount('visibilitychange'), 1);
    assert.equal(harness.callbacks.length, 1);

    harness.transition.cancel();
    await flushMicrotasks();

    try {
        assert.deepEqual({
            overlayPresent: !!harness.overlay,
            visibilityListeners: harness.document.listenerCount('visibilitychange'),
            gateSettled: settled,
            frameCancelled: harness.cancelledFrameIds.has(1)
        }, {
            overlayPresent: false,
            visibilityListeners: 0,
            gateSettled: true,
            frameCancelled: true
        });
    } finally {
        // Let the current implementation release its otherwise pending gate so the test leaves no waiter.
        if (!settled) {
            harness.document.visibilityState = 'hidden';
            harness.document.dispatchEvent({type: 'visibilitychange'});
            await gate;
        }
    }
});
