'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'acceptance-readiness.js'), 'utf8');

function makeSurface() {
    const listeners = Object.create(null);
    return {
        nodeType: 1,
        isConnected: true,
        classList: {contains(name) { return name === 'mpv-videoPlayerContainer-native'; }},
        matches(selector) { return selector === '.mpv-videoPlayerContainer-native'; },
        querySelectorAll() { return []; },
        addEventListener(name, listener) { (listeners[name] || (listeners[name] = [])).push(listener); },
        removeEventListener(name, listener) { if (listeners[name]) listeners[name] = listeners[name].filter(item => item !== listener); },
        emit(name, data) { for (const listener of (listeners[name] || []).slice()) listener({data}); }
    };
}

function makeContext(surface, diagnostics) {
    const listeners = Object.create(null);
    const window = {
        __eteEpoch: Date.now(), enhancedDiagnostics: diagnostics,
        addEventListener(name, listener) { (listeners[name] || (listeners[name] = [])).push(listener); },
        removeEventListener(name, listener) { if (listeners[name]) listeners[name] = listeners[name].filter(item => item !== listener); },
        dispatchEvent(event) { for (const listener of (listeners[event.type] || []).slice()) listener(event); }
    };
    const document = {
        current: null,
        documentElement: {contains(node) { return document.current === node; }},
        querySelector() { return this.current; },
        querySelectorAll() { return this.current ? [this.current] : []; }
    };
    let mutationObserver;
    function MutationObserver(callback) {
        mutationObserver = {callback, observe() {}, disconnect() {}, emit(records) { callback(records); }};
        return mutationObserver;
    }
    const context = {window, document, MutationObserver, console: {log() {}}, Date, Math, Array, Object, String, Number, setTimeout, setInterval, clearTimeout, clearInterval};
    vm.createContext(context);
    return {context, window, document, mutationObserver: () => mutationObserver};
}

function attach(context, surface) {
    context.document.current = surface;
    context.mutationObserver().emit([{addedNodes: [surface], removedNodes: []}]);
}

async function main() {
    const surface = makeSurface();
    const firstContext = makeContext(surface, function () {});
    vm.runInContext(source, firstContext.context);
    const first = firstContext.window.__eteReadiness;
    vm.runInContext(source, firstContext.context);
    assert.strictEqual(firstContext.window.__eteReadiness, first, 'duplicate install must reuse the observer');
    assert.strictEqual(first.snapshot().diagnosticsHookInstalled, true, 'diagnostics wrapper should be installed');

    attach(firstContext, surface);
    firstContext.window.dispatchEvent({type: 'native-helper-ready'});
    firstContext.window.enhancedDiagnostics({}, 'ready');
    firstContext.window.enhancedDiagnostics({}, 'playing');
    first.mark('play-called');
    first.mark('manager-play-resolved');
    const observed = first.snapshot();
    assert.strictEqual(observed.bridgeBootstrapReadySeen, true);
    assert.strictEqual(observed.bridgeAuthoritativeReady, true);
    assert.strictEqual(observed.diagnosticsPlayingSeen, true);
    assert.strictEqual(observed.surfaceCount, 1);
    assert.strictEqual(observed.connectedSurfaceCount, 1);
    assert.strictEqual(observed.surfaceConnected, true);
    assert(observed.surfaceLifecycle.some(row => row.event === 'created-observed'));
    assert(observed.surfaceLifecycle.some(row => row.event === 'connected'));
    assert.strictEqual(JSON.parse(JSON.stringify(observed)).bridgeAuthoritativeReady, true);
    firstContext.document.current = null;
    surface.isConnected = false;
    firstContext.mutationObserver().emit([{addedNodes: [], removedNodes: [surface]}]);
    const replacement = makeSurface();
    firstContext.document.current = replacement;
    firstContext.mutationObserver().emit([{addedNodes: [replacement], removedNodes: []}]);
    const recreated = first.snapshot();
    assert.strictEqual(recreated.surfaceCount, 2);
    assert.strictEqual(recreated.surfaceRecreated, true);
    assert.strictEqual(recreated.multipleSurfacesObserved, true);
    first.cleanup();

    const missingSurface = makeSurface();
    const missingContext = makeContext(missingSurface, function () {});
    vm.runInContext(source, missingContext.context);
    attach(missingContext, missingSurface);
    missingContext.window.dispatchEvent({type: 'native-helper-ready'});
    const missing = missingContext.window.__eteReadiness.snapshot();
    assert.strictEqual(missing.bridgeBootstrapReadySeen, true);
    assert.strictEqual(missing.bridgeAuthoritativeReady, false, 'bootstrap ready must not imply authoritative bridge ready');
    assert.strictEqual(missing.diagnosticsPlayingSeen, false, 'unobserved playing must remain missing');
    assert.strictEqual(missing.loadfileObservation, 'unavailable');
    missingSurface.isConnected = false;
    missingContext.document.current = null;
    missingContext.mutationObserver().emit([{addedNodes: [], removedNodes: [missingSurface]}]);
    assert(missingContext.window.__eteReadiness.snapshot().surfaceLifecycle.some(row => row.event === 'disconnected'));
    missingContext.window.__eteReadiness.cleanup();

    const nativeContext = makeContext(null, function () {});
    vm.runInContext(source, nativeContext.context);
    nativeContext.window.dispatchEvent({type: 'native-helper-ready'});
    const native = nativeContext.window.__eteReadiness.snapshot();
    assert.strictEqual(native.bridgeBootstrapReadySeen, true);
    assert(native.timeline.some(row => row.stage === 'native-bridge-created'));
    assert(native.timeline.some(row => row.stage === 'native-bootstrap-ready'));
    nativeContext.window.__eteReadiness.cleanup();
    console.log('acceptance readiness self-test: PASS');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
