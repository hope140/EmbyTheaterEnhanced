'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'acceptance-readiness.js'), 'utf8');

function eventTarget() {
    const listeners = new Map();
    return {
        addEventListener(name, listener) {
            const list = listeners.get(name) || [];
            list.push(listener);
            listeners.set(name, list);
        },
        removeEventListener(name, listener) {
            listeners.set(name, (listeners.get(name) || []).filter(item => item !== listener));
        },
        dispatchEvent(event) {
            for (const listener of (listeners.get(event.type) || []).slice()) listener(event);
        }
    };
}

function makeSurface() {
    return Object.assign(eventTarget(), {
        nodeType: 1,
        isConnected: true,
        classList: {contains(name) { return name === 'mpv-videoPlayerContainer-native'; }},
        matches(selector) { return selector === '.mpv-videoPlayerContainer-native'; },
        querySelectorAll() { return []; }
    });
}

function makeContext(options) {
    const settings = options || {};
    const window = Object.assign(eventTarget(), {
        __eteEpoch: settings.epoch || Date.now(),
        enhancedDiagnostics: settings.diagnostics
    });
    if (settings.sticky) window.__eteBridgeReadiness = settings.sticky;
    const document = {
        current: null,
        documentElement: {contains(node) { return document.current === node; }},
        querySelector() { return this.current; },
        querySelectorAll() { return this.current ? [this.current] : []; }
    };
    let mutationObserver;
    function MutationObserver(callback) {
        mutationObserver = {observe() {}, disconnect() {}, emit(records) { callback(records); }};
        return mutationObserver;
    }
    const context = {
        window, document, MutationObserver, console: {log() {}}, Date, Math, Array, Object, String, Number,
        setTimeout, setInterval, clearTimeout, clearInterval
    };
    vm.createContext(context);
    return {context, window, document, mutationObserver: () => mutationObserver};
}

function attach(context, surface) {
    context.document.current = surface;
    context.mutationObserver().emit([{addedNodes: [surface], removedNodes: []}]);
}

test('native helper ready after observer attach is captured and normalized', async () => {
    const context = makeContext({diagnostics() {}});
    vm.runInContext(source, context.context);
    const surface = makeSurface();
    attach(context, surface);
    await new Promise(resolve => setTimeout(resolve, 80));
    context.window.dispatchEvent({type: 'native-helper-ready'});
    context.window.enhancedDiagnostics({}, 'ready');
    const snapshot = context.window.__eteReadiness.snapshot();
    assert.equal(snapshot.bridgeReadySignalSeen, true);
    assert.equal(snapshot.diagnosticsReadyObserved, true);
    assert.equal(snapshot.bridgeReadiness.status, 'observed-ready');
    context.window.__eteReadiness.cleanup();
});

test('ready before observer attach is recovered from current sticky state', () => {
    const now = Date.now();
    const sticky = {
        version: 1,
        ready: true,
        playing: false,
        runId: null,
        startedAt: now,
        readyAt: now + 1,
        snapshot() { return {version: 1, runId: null, startedAt: this.startedAt, ready: true, readyAt: this.readyAt, readyBridgeMatches: null}; }
    };
    const context = makeContext({sticky, epoch: now});
    vm.runInContext(source, context.context);
    const snapshot = context.window.__eteReadiness.snapshot();
    assert.equal(snapshot.stickyReadinessSupported, true);
    assert.equal(snapshot.stickyReadinessObserved, true);
    assert.equal(snapshot.diagnosticsReadyObserved, false);
    assert.equal(snapshot.bridgeReadiness.status, 'inferred-ready-from-authoritative-state');
    context.window.__eteReadiness.cleanup();
});

test('previous run sticky ready does not pollute a new run', () => {
    const sticky = {
        version: 1,
        ready: true,
        runId: 'run-old',
        startedAt: Date.now() - 100,
        readyAt: Date.now() - 50,
        beginRun() {},
        snapshot() { return {version: 1, runId: this.runId, startedAt: this.startedAt, ready: this.ready, readyAt: this.readyAt, readyBridgeMatches: null}; }
    };
    const context = makeContext({sticky});
    vm.runInContext(source, context.context);
    context.window.__eteReadiness.beginRun('run-new');
    const snapshot = context.window.__eteReadiness.snapshot();
    assert.equal(snapshot.stickyReadinessObserved, false);
    assert.equal(snapshot.diagnosticsReadySeen, false);
    context.window.__eteReadiness.cleanup();
});
