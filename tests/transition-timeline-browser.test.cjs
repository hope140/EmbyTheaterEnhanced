'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'transition-timeline-browser.js'), 'utf8');

function createClock() {
    let now = 1000;
    let nextId = 1;
    const timers = new Map();

    function setTimeoutFake(callback, delay) {
        const id = nextId++;
        timers.set(id, {id, at: now + Math.max(0, Number(delay) || 0), callback, cancelled: false});
        return id;
    }

    function clearTimeoutFake(id) {
        const timer = timers.get(id);
        if (timer) timer.cancelled = true;
    }

    async function flushMicrotasks() {
        for (let i = 0; i < 24; i++) await Promise.resolve();
    }

    async function advance(milliseconds) {
        const target = now + milliseconds;
        let turns = 0;
        while (turns++ < 2000) {
            const next = Array.from(timers.values())
                .filter(timer => !timer.cancelled && timer.at <= target)
                .sort((left, right) => left.at - right.at || left.id - right.id)[0];
            if (!next) break;
            timers.delete(next.id);
            now = next.at;
            next.callback();
            await flushMicrotasks();
        }
        if (turns >= 2000) throw new Error('fake-clock-loop-limit');
        now = target;
        await flushMicrotasks();
    }

    return {
        now: () => now,
        setTimeout: setTimeoutFake,
        clearTimeout: clearTimeoutFake,
        advance,
        flushMicrotasks,
        pendingCount: () => Array.from(timers.values()).filter(timer => !timer.cancelled).length
    };
}

function createClassList(element, initialClasses) {
    const values = new Set(initialClasses || []);
    return {
        contains(name) { return values.has(name); },
        add(name) {
            values.add(name);
            if (element && typeof element.onClassChange === 'function') element.onClassChange();
        },
        remove(name) {
            values.delete(name);
            if (element && typeof element.onClassChange === 'function') element.onClassChange();
        }
    };
}

function createNode(tagName, initialClasses) {
    const node = {
        nodeType: 1,
        tagName: String(tagName || 'div').toUpperCase(),
        classList: null,
        style: {},
        children: [],
        parentNode: null,
        attributes: Object.create(null),
        setAttribute(name, value) { this.attributes[name] = String(value); },
        querySelectorAll(selector) {
            if (selector !== '.mpv-nextTrackTransition') return [];
            const found = [];
            function visit(current) {
                current.children.forEach(child => {
                    if (child.classList.contains('mpv-nextTrackTransition')) found.push(child);
                    visit(child);
                });
            }
            visit(this);
            return found;
        },
        appendChild(child) {
            if (child.parentNode) child.parentNode.removeChild(child);
            child.parentNode = this;
            this.children.push(child);
            if (this.onChildMutation) this.onChildMutation({type: 'childList', target: this, addedNodes: [child], removedNodes: []});
            return child;
        },
        removeChild(child) {
            const index = this.children.indexOf(child);
            if (index >= 0) this.children.splice(index, 1);
            child.parentNode = null;
            if (this.onChildMutation) this.onChildMutation({type: 'childList', target: this, addedNodes: [], removedNodes: [child]});
            return child;
        }
    };
    node.classList = createClassList(node, initialClasses);
    return node;
}

function createHarness(options) {
    const settings = options || {};
    const clock = createClock();
    const documentListeners = new Map();
    const windowListeners = new Map();
    const observers = new Set();
    const stats = {observerDisconnects: 0, stopCalls: 0, nextCalls: 0, previousCalls: 0,
        captureStarts: [], nextCaptureStartCount: null, previousCaptureStartCount: null,
        nextCallAtMs: null, previousCallAtMs: null};
    const head = createNode('head');
    const body = createNode('body');
    const document = {
        visibilityState: 'visible',
        head,
        body,
        documentElement: createNode('html'),
        listeners: documentListeners,
        createElement(tagName) { return createNode(tagName); },
        addEventListener(name, listener) {
            if (!documentListeners.has(name)) documentListeners.set(name, new Set());
            documentListeners.get(name).add(listener);
        },
        removeEventListener(name, listener) {
            const listeners = documentListeners.get(name);
            if (listeners) listeners.delete(listener);
        },
        dispatchEvent(event) {
            const listeners = documentListeners.get(event.type);
            if (listeners) Array.from(listeners).forEach(listener => listener(event));
        }
    };

    const MutationObserver = class {
        constructor(callback) { this.callback = callback; this.disconnected = false; observers.add(this); }
        observe(target) {
            target.onChildMutation = record => {
                if (!this.disconnected) this.callback([record]);
            };
        }
        disconnect() {
            if (!this.disconnected) stats.observerDisconnects++;
            this.disconnected = true;
        }
    };

    const windowObject = {
        document,
        location: {href: 'file:///timeline-fixture.html'},
        ipc: {messages: [], send(channel, ...messages) { this.messages.push({channel, messages}); }},
        listeners: windowListeners,
        MutationObserver,
        URL,
        Date: class extends Date {
            constructor(...args) { super(...(args.length ? args : [clock.now()])); }
            static now() { return clock.now(); }
        },
        addEventListener(name, listener) {
            if (!windowListeners.has(name)) windowListeners.set(name, new Set());
            windowListeners.get(name).add(listener);
        },
        removeEventListener(name, listener) {
            const listeners = windowListeners.get(name);
            if (listeners) listeners.delete(listener);
        },
        dispatchEvent(event) {
            const listeners = windowListeners.get(event.type);
            if (listeners) Array.from(listeners).forEach(listener => listener(event));
        }
    };

    const items = new Map();
    let current = null;
    let imageUrlForItem = () => '';
    let readCurrentColor = () => null;
    windowObject.__eteTransitionScreenStream = {
        start(kind, startedAtMs) {
            const entry = {kind, startedAtMs, armedAtMs: clock.now()};
            stats.captureStarts.push(entry);
            return {ready: true, armedAtMs: entry.armedAtMs};
        },
        currentColor() { return readCurrentColor(); },
        setCurrentColorReader(reader) { readCurrentColor = reader; }
    };

    function setCurrent(key) {
        current = Array.from(items.values()).find(item => item.__eteTimelineKey === key) || null;
        windowObject.dispatchEvent({type: 'core-playing'});
    }

    function showOverlay(key) {
        if (!settings.overlay) return;
        const overlay = createNode('div', ['mpv-nextTrackTransition']);
        const image = createNode('img', ['mpv-nextTrackTransition-artwork']);
        image.src = imageUrlForItem(key);
        overlay.appendChild(image);
        body.appendChild(overlay);
        document.dispatchEvent({type: 'load', target: image});
        overlay.classList.add('mpv-nextTrackTransition-fading');
        body.removeChild(overlay);
    }

    const manager = {
        currentItem() { return current; },
        async play(playOptions) {
            stats.initialPlayOptions = playOptions;
            stats.playCalls = (stats.playCalls || 0) + 1;
            items.clear();
            playOptions.items.forEach(item => items.set(item.Id, item));
            setCurrent('A');
            return undefined;
        },
        async nextTrack() {
            stats.nextCalls++;
            stats.nextCaptureStartCount = stats.captureStarts.length;
            stats.nextCallAtMs = clock.now();
            setCurrent('B');
            showOverlay('B');
        },
        async previousTrack() {
            stats.previousCalls++;
            stats.previousCaptureStartCount = stats.captureStarts.length;
            stats.previousCallAtMs = clock.now();
            setCurrent('A');
            showOverlay('A');
        },
        async stop() { stats.stopCalls++; }
    };

    const api = {
        getImageUrl(itemId) {
            const item = items.get(itemId);
            return item ? imageUrlForItem(item.__eteTimelineKey) : '';
        }
    };
    imageUrlForItem = key => 'http://127.0.0.1/poster.svg?item=' + key;

    const sandbox = {
        window: windowObject,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        Date: windowObject.Date,
        URL,
        Promise,
        console: {log() {}},
        Math,
        Number,
        Object,
        Array,
        Set,
        WeakMap,
        Error
    };
    vm.runInNewContext(source, sandbox, {filename: 'transition-timeline-browser.js'});

    const context = {
        manager,
        embedded: {currentTime() { return clock.now() - 1000; }},
        api,
        items,
        records: [],
        events: {},
        fixture: 'http://127.0.0.1/media-a',
        options: {
            mediaAUrl: 'http://127.0.0.1/media-a',
            mediaBUrl: 'http://127.0.0.1/media-b',
            posterBaseUrl: 'http://127.0.0.1/poster.svg'
        }
    };

    return {clock, context, document, head, body, manager, stats, window: windowObject};
}

function setCurrentColorReader(harness, reader) {
    harness.window.__eteTransitionScreenStream.setCurrentColorReader(reader);
}

async function flushMicrotasks(clock) {
    await clock.flushMicrotasks();
}

test('failed initial red pixel prerequisite blocks Next and Previous and marks logic NOT_RUN', async () => {
    const harness = createHarness({overlay: true});
    setCurrentColorReader(harness, () => null);
    const pending = harness.window.runTransitionTimelineFixture(harness.context);
    await flushMicrotasks(harness.clock);
    assert.equal(harness.stats.playCalls, 1);
    await harness.clock.advance(1500);
    const result = await pending;

    assert.equal(result.status, 'observation-blocked');
    assert.equal(result.pixelPrerequisite.initialA.status, 'INCONCLUSIVE');
    assert.equal(harness.stats.nextCalls, 0);
    assert.equal(harness.stats.previousCalls, 0);
    assert.equal(result.logicalChecks.nextItemB, 'NOT_RUN');
    assert.equal(result.logicalChecks.previousItemA, 'NOT_RUN');
    assert.equal(result.logicalChecks.nextOverlay, 'NOT_RUN');
    assert.equal(result.logicalChecks.previousOverlay, 'NOT_RUN');
    assert.equal(result.logicalChecks.nextArtworkLoaded, 'NOT_RUN');
    assert.equal(result.logicalChecks.previousArtworkLoaded, 'NOT_RUN');
    assert.equal(result.logicalChecks.nextCorePlaying, 'NOT_RUN');
    assert.equal(result.logicalChecks.previousCorePlaying, 'NOT_RUN');
    assert.equal(harness.stats.stopCalls, 1);
    assert.equal(harness.stats.observerDisconnects, 1);
    assert.equal(harness.document.listeners.get('load').size, 0);
    assert.equal(harness.document.listeners.get('error').size, 0);
    assert.equal(harness.window.listeners.get('core-playing').size, 0);
    assert.equal(harness.head.children.length, 0);
    assert.equal(harness.clock.pendingCount(), 0);
});

test('missing green prerequisite after Next blocks Previous and retains completed Next evidence', async () => {
    const harness = createHarness({overlay: true});
    setCurrentColorReader(harness, () => harness.manager.currentItem() && harness.manager.currentItem().__eteTimelineKey === 'A'
        ? {atMs: harness.clock.now(), colorClass: 'red'} : null);
    const pending = harness.window.runTransitionTimelineFixture(harness.context);
    await flushMicrotasks(harness.clock);
    assert.equal(harness.stats.nextCalls, 1);
    assert.equal(harness.stats.nextCaptureStartCount, 1, 'screen capture is armed before Next is invoked');
    assert.ok(harness.stats.captureStarts[0].armedAtMs <= harness.stats.nextCallAtMs);
    await harness.clock.advance(2100);
    await flushMicrotasks(harness.clock);
    assert.equal(harness.manager.currentItem().__eteTimelineKey, 'B');
    await harness.clock.advance(1500);
    const result = await pending;

    assert.equal(result.status, 'observation-blocked');
    assert.equal(result.pixelPrerequisite.initialA.status, 'COLOR_OBSERVED');
    assert.equal(result.pixelPrerequisite.beforePrevious.status, 'INCONCLUSIVE');
    assert.equal(harness.stats.nextCalls, 1);
    assert.equal(harness.stats.previousCalls, 0);
    assert.equal(result.logicalChecks.nextItemB, true);
    assert.equal(result.logicalChecks.nextOverlay, true);
    assert.equal(result.logicalChecks.nextArtworkLoaded, true);
    assert.equal(result.logicalChecks.nextCorePlaying, true);
    assert.equal(result.logicalChecks.previousItemA, 'NOT_RUN');
    assert.equal(result.logicalChecks.previousOverlay, 'NOT_RUN');
    assert.equal(result.logicalChecks.previousArtworkLoaded, 'NOT_RUN');
    assert.equal(result.logicalChecks.previousCorePlaying, 'NOT_RUN');
    assert.equal(harness.stats.stopCalls, 1);
    assert.equal(harness.stats.observerDisconnects, 1);
    assert.equal(harness.head.children.length, 0);
    assert.equal(harness.clock.pendingCount(), 0);
});

test('historical no-overlay baseline can complete when queue and core transitions are valid', async () => {
    const harness = createHarness({overlay: false});
    setCurrentColorReader(harness, () => {
        const item = harness.manager.currentItem();
        if (!item) return null;
        return {atMs: harness.clock.now(), colorClass: item.__eteTimelineKey === 'A' ? 'red' : 'green'};
    });
    const pending = harness.window.runTransitionTimelineFixture(harness.context);
    await flushMicrotasks(harness.clock);
    assert.equal(harness.stats.nextCalls, 1);
    assert.equal(harness.stats.nextCaptureStartCount, 1);
    assert.ok(harness.stats.captureStarts[0].armedAtMs <= harness.stats.nextCallAtMs);
    await harness.clock.advance(2100);
    await flushMicrotasks(harness.clock);
    assert.equal(harness.stats.previousCalls, 1);
    assert.equal(harness.stats.previousCaptureStartCount, 2, 'screen capture is armed before Previous is invoked');
    assert.ok(harness.stats.captureStarts[1].armedAtMs <= harness.stats.previousCallAtMs);
    await harness.clock.advance(2100);
    await flushMicrotasks(harness.clock);
    const result = await pending;

    assert.equal(result.status, 'completed');
    assert.equal(result.logicalChecks.nextItemB, true);
    assert.equal(result.logicalChecks.previousItemA, true);
    assert.equal(result.logicalChecks.nextCorePlaying, true);
    assert.equal(result.logicalChecks.previousCorePlaying, true);
    assert.equal(result.logicalChecks.nextOverlay, false);
    assert.equal(result.logicalChecks.previousOverlay, false);
    assert.equal(result.logicalChecks.nextArtworkLoaded, false);
    assert.equal(result.logicalChecks.previousArtworkLoaded, false);
    assert.equal(result.pixelPrerequisite.initialA.status, 'COLOR_OBSERVED');
    assert.equal(result.pixelPrerequisite.beforePrevious.status, 'COLOR_OBSERVED');
    assert.equal(result.evidenceClass, 'logical-only');
    assert.equal(harness.stats.stopCalls, 1);
    assert.equal(harness.stats.observerDisconnects, 1);
    assert.equal(harness.head.children.length, 0);
    assert.equal(harness.clock.pendingCount(), 0);
});
