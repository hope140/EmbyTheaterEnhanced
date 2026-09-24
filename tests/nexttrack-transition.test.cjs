'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const transitionModule = require('../src/electronapp/enhanced/nexttrack-transition.js');

function makeEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            const rows = listeners.get(type) || [];
            rows.push(listener);
            listeners.set(type, rows);
        },
        removeEventListener(type, listener) {
            listeners.set(type, (listeners.get(type) || []).filter(item => item !== listener));
        },
        dispatchEvent(event) {
            for (const listener of (listeners.get(event.type) || []).slice()) listener.call(this, event);
        }
    };
}

function makeElement(tagName) {
    const events = makeEventTarget();
    const classes = new Set();
    return Object.assign(events, {
        tagName: tagName.toUpperCase(),
        className: '',
        classList: {
            add(name) { classes.add(name); },
            contains(name) { return classes.has(name); }
        },
        style: {},
        children: [],
        parentNode: null,
        alt: '',
        _src: '',
        set src(value) { this._src = value; },
        get src() { return this._src; },
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
            if (selector === 'img') return this.children.find(child => child.tagName === 'IMG') || null;
            return null;
        }
    });
}

function makeDom() {
    const frameCallbacks = [];
    const documentEvents = makeEventTarget();
    const container = makeElement('div');
    container.style.opacity = '0.7';
    const document = Object.assign(documentEvents, {
        visibilityState: 'visible',
        createElement: makeElement
    });
    const window = {
        requestAnimationFrame(callback) { frameCallbacks.push(callback); },
        matchMedia() { return {matches: false}; }
    };
    return {document, window, container, frameCallbacks};
}

function makeTransitionHarness(item, options) {
    const dom = makeDom();
    const imageRequests = [];
    const client = {
        getImageUrl(itemId, params) {
            imageRequests.push({itemId, params});
            if (options && options.throwOnBackdrop && params.type === 'Backdrop') throw new Error('backdrop image unavailable');
            if (options && options.throwOnPrimary && params.type === 'Primary') throw new Error('primary image unavailable');
            return `image://${itemId}/${params.type.toLowerCase()}${params.index == null ? '' : `/${params.index}`}?tag=${params.tag}`;
        }
    };
    const transition = transitionModule.create({
        document: dom.document,
        window: dom.window,
        connectionManager: {getApiClient() { return client; }},
        getContainer() { return dom.container; }
    });
    const events = [];
    const player = {};
    let callCount = 0;
    const argsSeen = [];
    const resolveNextTracks = [];
    const manager = {
        _etePlayRequestSequence: 0,
        _playQueueManager: {getNextItemInfo() { return {item}; }},
        getCurrentPlayer() { return player; },
        nextTrack(...args) {
            assert.equal(this, manager, 'original nextTrack receiver is preserved');
            callCount++;
            argsSeen.push(args);
            events.push({type: 'original-nextTrack', overlayPresent: dom.container.children.length === 1});
            manager._etePlayRequestSequence++;
            if (options && options.rejectNextTrack) return Promise.reject(new Error('nextTrack failed'));
            let result;
            if (options && options.deferNextTrack) {
                result = new Promise(resolve => resolveNextTracks.push(() => resolve({requestId: manager._etePlayRequestSequence})));
            } else {
                result = Promise.resolve({requestId: manager._etePlayRequestSequence});
            }
            if (options && options.simulateStop) {
                const stopping = transition.beforeTeardown().then(() => {
                    events.push({type: 'teardown', overlayPresent: dom.container.children.length === 1});
                });
                return Promise.all([stopping, result]).then(values => values[1]);
            }
            return result;
        }
    };
    transitionModule.install(manager, player, transition);
    return {dom, imageRequests, transition, events, player, manager,
        get callCount() { return callCount; }, argsSeen, resolveNextTracks};
}

async function flushMicrotasks() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

async function completePaint(harness) {
    await flushMicrotasks();
    assert.ok(harness.dom.frameCallbacks.length > 0, 'first animation frame was requested');
    const firstFrame = harness.dom.frameCallbacks.splice(0);
    for (const callback of firstFrame) callback(1);
    assert.ok(harness.dom.frameCallbacks.length > 0, 'second animation frame was requested');
    const completedFrame = harness.dom.frameCallbacks.splice(0);
    for (const callback of completedFrame) callback(2);
    await flushMicrotasks();
}

function overlay(harness) {
    return harness.dom.container.children.find(child => child.className === 'mpv-nextTrackTransition') || null;
}

function assertBlackFallbackStyle() {
    const css = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.css'), 'utf8');
    assert.match(css, /\.mpv-nextTrackTransition\s*\{[^}]*background:\s*(?:#000(?:000)?\b|rgba\(0,\s*0,\s*0,\s*\.97\))/s,
        'overlay retains the black fallback background when no image is present');
}

function cssRule(selector) {
    const css = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.css'), 'utf8');
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'));
    assert.ok(match, `CSS rule exists for ${selector}`);
    return match[1];
}

test('overlay artwork fills the video area with centered cover cropping', function () {
    const containerRule = cssRule('.mpv-nextTrackTransition');
    const artworkRule = cssRule('.mpv-nextTrackTransition-artwork');
    assert.match(containerRule, /position:\s*absolute\s*;/);
    assert.match(containerRule, /inset:\s*0\s*;/);
    assert.match(containerRule, /overflow:\s*hidden\s*;/);
    assert.match(artworkRule, /width:\s*100%\s*;/);
    assert.match(artworkRule, /height:\s*100%\s*;/);
    assert.match(artworkRule, /object-fit:\s*cover\s*;/);
    assert.match(artworkRule, /object-position:\s*center\s*;/);
    assert.doesNotMatch(artworkRule, /max-width|max-height|object-fit:\s*contain/i);
});

test('uses the next Item Primary image tag and keeps the overlay visible until matching playbackReady', async function () {
    const item = {Id: 'episode-primary', MediaType: 'Video', ImageTags: {Primary: 'primary-tag'}};
    const harness = makeTransitionHarness(item, {deferNextTrack: true, simulateStop: true});
    const originalArgs = [harness.player, {source: 'keyboard'}];
    const pending = harness.manager.nextTrack(...originalArgs);

    const shown = overlay(harness);
    assert.ok(shown, 'overlay is inserted synchronously at the NextTrack entry');
    assert.equal(shown.querySelector('img').src, 'image://episode-primary/primary?tag=primary-tag');
    assert.deepEqual(harness.imageRequests, [{itemId: 'episode-primary', params: {type: 'Primary', tag: 'primary-tag'}}]);
    assert.equal(harness.callCount, 1, 'original manager nextTrack is invoked synchronously after showing the overlay');
    assert.deepEqual(harness.events, [{type: 'original-nextTrack', overlayPresent: true}]);

    assert.equal(harness.events.some(event => event.type === 'teardown'), false,
        'simulated player stop remains gated until a completed overlay paint');
    await completePaint(harness);
    assert.equal(harness.callCount, 1);
    assert.deepEqual(harness.argsSeen, [originalArgs]);
    assert.deepEqual(harness.events, [
        {type: 'original-nextTrack', overlayPresent: true},
        {type: 'teardown', overlayPresent: true}
    ], 'beforeTeardown allows stop only after the overlay has painted');
    assert.equal(harness.transition.currentState(), 'LOADING_NEXT');

    harness.transition.playbackReady(2);
    await flushMicrotasks();
    assert.equal(harness.transition.currentState(), 'LOADING_NEXT', 'unmatched readiness cannot hide the overlay');
    harness.transition.playbackReady(1);
    assert.equal(harness.transition.currentState(), 'PLAYBACK_READY');
    assert.ok(overlay(harness), 'artwork remains until a completed paint after readiness');
    await completePaint(harness);
    assert.equal(harness.transition.currentState(), 'HIDE_TRANSITION');
    assert.ok(overlay(harness).classList.contains('mpv-nextTrackTransition-fading'));

    const element = overlay(harness);
    element.dispatchEvent({type: 'transitionend', target: element, propertyName: 'opacity'});
    assert.equal(overlay(harness), null);
    assert.equal(harness.transition.currentState(), 'IDLE');
    assert.equal(harness.dom.container.style.opacity, '0.7');
    harness.resolveNextTracks[0]();
    assert.deepEqual(await pending, {requestId: 1});
});

test('prefers Backdrop, falls back to Primary when Backdrop URL generation or loading fails', function () {
    const item = {
        Id: 'episode-artwork-priority',
        MediaType: 'Video',
        ImageTags: {Primary: 'primary-tag'},
        BackdropImageTags: ['backdrop-tag']
    };
    const preferred = makeTransitionHarness(item);
    preferred.transition.show(item);
    assert.equal(overlay(preferred).querySelector('img').src,
        'image://episode-artwork-priority/backdrop/0?tag=backdrop-tag');
    assert.deepEqual(preferred.imageRequests.map(row => row.params.type), ['Backdrop', 'Primary'],
        'Backdrop is requested before Primary when both image tags exist');

    const generationFallback = makeTransitionHarness(item, {throwOnBackdrop: true});
    generationFallback.transition.show(item);
    assert.equal(overlay(generationFallback).querySelector('img').src,
        'image://episode-artwork-priority/primary?tag=primary-tag');
    assert.deepEqual(generationFallback.imageRequests.map(row => row.params.type), ['Backdrop', 'Primary'],
        'Primary is selected when Backdrop URL generation fails');

    const loadFallback = makeTransitionHarness(item);
    loadFallback.transition.show(item);
    const image = overlay(loadFallback).querySelector('img');
    image.onerror();
    assert.equal(image.src, 'image://episode-artwork-priority/primary?tag=primary-tag',
        'Primary is attempted when the Backdrop image fails to load');
    image.onerror();
    assert.equal(overlay(loadFallback).querySelector('img'), null,
        'failed Backdrop and Primary are removed while the black overlay remains');
    assertBlackFallbackStyle();

    const noArtworkItem = {Id: 'episode-no-art', MediaType: 'Video'};
    const noArtwork = makeTransitionHarness(noArtworkItem);
    noArtwork.transition.show(noArtworkItem);
    assert.ok(overlay(noArtwork));
    assert.equal(overlay(noArtwork).querySelector('img'), null);
    assert.deepEqual(noArtwork.imageRequests, []);
    assertBlackFallbackStyle();
});

test('rapid consecutive NextTrack calls keep the newest transition token authoritative', async function () {
    const item = {Id: 'episode-race', MediaType: 'Video', ImageTags: {Primary: 'race-tag'}};
    const harness = makeTransitionHarness(item, {deferNextTrack: true});
    const first = harness.manager.nextTrack(harness.player, 'first');
    const firstOverlay = overlay(harness);
    const second = harness.manager.nextTrack(harness.player, 'second');
    const currentOverlay = overlay(harness);

    assert.notEqual(currentOverlay, firstOverlay);
    assert.equal(firstOverlay.parentNode, null, 'new transition replaces the older artwork node');
    await flushMicrotasks();
    assert.equal(harness.callCount, 2);
    assert.deepEqual(harness.argsSeen, [[harness.player, 'first'], [harness.player, 'second']]);
    assert.equal(harness.events.every(event => event.overlayPresent), true);
    assert.equal(harness.transition.currentState(), 'LOADING_NEXT');

    harness.transition.playbackReady(1);
    await flushMicrotasks();
    assert.equal(harness.transition.currentState(), 'LOADING_NEXT', 'old request cannot hide the latest overlay');
    assert.equal(overlay(harness), currentOverlay);
    harness.transition.playbackReady(2);
    await completePaint(harness);
    assert.equal(harness.transition.currentState(), 'HIDE_TRANSITION');
    assert.equal(overlay(harness), currentOverlay);
    harness.resolveNextTracks[0]();
    harness.resolveNextTracks[1]();
    await Promise.all([first, second]);
});

test('beforeTeardown waits for the newest overlay when it changes during the first paint gate', async function () {
    const firstItem = {Id: 'episode-gate-first', MediaType: 'Video'};
    const newestItem = {Id: 'episode-gate-newest', MediaType: 'Video', ImageTags: {Primary: 'newest-tag'}};
    const harness = makeTransitionHarness(firstItem);
    harness.transition.show(firstItem);
    const firstOverlay = overlay(harness);

    let gateResolved = false;
    const gate = harness.transition.beforeTeardown().then(() => { gateResolved = true; });
    await flushMicrotasks();
    assert.equal(harness.dom.frameCallbacks.length, 1);

    harness.transition.show(newestItem);
    const newestOverlay = overlay(harness);
    assert.notEqual(newestOverlay, firstOverlay, 'a newer overlay replaces the artwork shown when the gate began');
    assert.equal(newestOverlay.querySelector('img').src, 'image://episode-gate-newest/primary?tag=newest-tag');
    await completePaint(harness);
    assert.equal(gateResolved, false,
        'completion of the original paint gate is insufficient after a newer overlay replaces it');
    assert.equal(overlay(harness), newestOverlay);

    await completePaint(harness);
    await gate;
    assert.equal(gateResolved, true);
    assert.equal(overlay(harness).className, 'mpv-nextTrackTransition');
});

test('failed playback and terminal cancel clear only the active transition', async function () {
    const item = {Id: 'episode-error', MediaType: 'Video'};
    const harness = makeTransitionHarness(item, {rejectNextTrack: true});
    const pending = harness.manager.nextTrack(harness.player);
    await assert.rejects(pending, /nextTrack failed/);
    assert.equal(overlay(harness), null);
    assert.equal(harness.transition.currentState(), 'IDLE');

    const token = harness.transition.show(item);
    assert.ok(token);
    assert.ok(overlay(harness));
    harness.transition.cancel();
    assert.equal(overlay(harness), null);
    assert.equal(harness.transition.isActive(), false);
});
