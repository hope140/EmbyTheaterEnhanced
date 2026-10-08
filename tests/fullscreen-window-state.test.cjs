'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const mainSource = fs.readFileSync(path.join(__dirname, '../src/electronapp/main.js'), 'utf8');
const startMarker = '    var currentWindowState =';
const endMarker = '    var customFileProtocol =';
const start = mainSource.indexOf(startMarker);
const end = mainSource.indexOf(endMarker, start);
assert.notEqual(start, -1, 'main.js window state section start must exist');
assert.notEqual(end, -1, 'main.js window state section end must exist');
const windowStateSource = mainSource.slice(start, end);

function copyBounds(bounds) {
    return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height};
}

function createHarness(platform = 'win32', initialInteraction = {resizable: true, movable: true}) {
    const normalBounds = {x: 140, y: 90, width: 960, height: 640};
    const displayBounds = {x: 0, y: 0, width: 1920, height: 1080};
    const events = [];
    const sentJavascript = [];
    let bounds = copyBounds(normalBounds);
    let savedNormalBounds = null;
    let minimized = false;
    let resizable = initialInteraction.resizable;
    let movable = initialInteraction.movable;
    let fullScreenCalls = [];
    let focusCalls = 0;
    const callbacks = Object.create(null);
    const context = {
        electron: {
            screen: {getDisplayMatching: () => ({bounds: copyBounds(displayBounds)})}
        },
        process: {platform},
        initialShowEventsComplete: true,
        previousBounds: undefined,
        sendJavascript: script => sentJavascript.push(script),
        mainWindow: null
    };
    context.mainWindow = {
        getBounds: () => copyBounds(bounds),
        isResizable: () => resizable,
        isMovable: () => movable,
        isMinimized: () => minimized,
        isFullScreen: () => false,
        setResizable(value) { resizable = value; events.push(['resizable', value]); },
        setMovable(value) { movable = value; events.push(['movable', value]); },
        setFullScreen(value) {
            fullScreenCalls.push(value);
            events.push(['setFullScreen', value]);
            if (value) {
                // This models Electron's transparent Windows path: enter is emitted
                // synchronously while getBounds() still reports the normal bounds.
                savedNormalBounds = copyBounds(bounds);
                callbacks['enter-full-screen']();
                events.push(['bounds-to-display']);
                bounds = copyBounds(displayBounds);
            } else {
                // The matching leave event is emitted before Electron restores bounds.
                callbacks['leave-full-screen']();
                events.push(['bounds-to-normal']);
                bounds = copyBounds(savedNormalBounds || normalBounds);
                savedNormalBounds = null;
            }
            context.onWindowGeometryChanged();
        },
        minimize() {
            minimized = true;
            callbacks.minimize();
        },
        restore() {
            minimized = false;
            callbacks.restore();
        },
        unmaximize() { events.push(['unmaximize']); },
        focus() { focusCalls++; },
        on(name, callback) { callbacks[name] = callback; }
    };
    vm.runInNewContext(windowStateSource, context, {filename: 'main.js#window-state'});
    for (const [name, callback] of Object.entries({
        'enter-full-screen': context.onEnterFullscreen,
        'leave-full-screen': context.onLeaveFullscreen,
        minimize: context.onMinimize,
        restore: context.onRestore
    })) context.mainWindow.on(name, callback);

    return {
        context,
        events,
        sentJavascript,
        normalBounds,
        displayBounds,
        fullScreenCalls: () => fullScreenCalls.slice(),
        interaction: () => ({resizable, movable}),
        bounds: () => copyBounds(bounds),
        focusCalls: () => focusCalls,
        systemMinimize: () => callbacks.minimize(),
        systemRestore: () => callbacks.restore(),
        externalBoundsChange: next => { bounds = copyBounds(next); }
    };
}

function assertState(harness, expected) {
    assert(harness.sentJavascript.some(script => script.includes('document.windowState="' + expected + '";')),
        'renderer should receive state ' + expected);
    assert.equal(harness.context.currentWindowState, expected);
}

test('Windows fullscreen locks interaction once and restores the original bounds and interaction', () => {
    const h = createHarness('win32', {resizable: false, movable: true});
    h.context.setWindowState('Fullscreen');

    assert.deepEqual(h.fullScreenCalls(), [true]);
    assert.deepEqual(h.context.previousBounds, h.normalBounds);
    assert.deepEqual(h.interaction(), {resizable: false, movable: false});
    assert.deepEqual(h.bounds(), h.displayBounds);
    assert(h.events.findIndex(row => row[0] === 'setFullScreen') < h.events.findIndex(row => row[0] === 'bounds-to-display'));
    assert.equal(h.focusCalls(), 1);
    assertState(h, 'Fullscreen');

    h.context.setWindowState('Fullscreen');
    assert.deepEqual(h.fullScreenCalls(), [true], 'repeated request must not re-enter Electron fullscreen');
    assert.deepEqual(h.context.previousBounds, h.normalBounds, 're-entry must preserve the original normal bounds');

    h.context.setWindowState('Normal');
    assert.deepEqual(h.fullScreenCalls(), [true, false]);
    assert.deepEqual(h.bounds(), h.normalBounds);
    assert.deepEqual(h.interaction(), {resizable: false, movable: true});
    assert.equal(h.events.findIndex(row => row[0] === 'setFullScreen' && row[1] === false) <
        h.events.findIndex(row => row[0] === 'bounds-to-normal'), true);
    assertState(h, 'Normal');
});

test('Minimized to Fullscreen restores the existing fullscreen without a second enter', () => {
    const h = createHarness();
    h.context.setWindowState('Fullscreen');
    h.context.setWindowState('Minimized');
    assertState(h, 'Minimized');

    h.context.setWindowState('Fullscreen');
    assert.deepEqual(h.fullScreenCalls(), [true]);
    assert.equal(h.context.fullscreenActive, true);
    assert.deepEqual(h.bounds(), h.displayBounds);
    assert.deepEqual(h.interaction(), {resizable: false, movable: false});
    assertState(h, 'Fullscreen');
});

test('Minimized to Normal exits fullscreen and restores the original interaction', () => {
    const h = createHarness();
    h.context.setWindowState('Fullscreen');
    h.context.setWindowState('Minimized');
    h.context.setWindowState('Normal');

    assert.deepEqual(h.fullScreenCalls(), [true, false]);
    assert.equal(h.context.fullscreenActive, false);
    assert.deepEqual(h.bounds(), h.normalBounds);
    assert.deepEqual(h.interaction(), {resizable: true, movable: true});
    assertState(h, 'Normal');
});

test('System minimize and restore retain fullscreen without re-entering', () => {
    const h = createHarness();
    h.context.setWindowState('Fullscreen');
    h.systemMinimize();
    assertState(h, 'Minimized');

    h.systemRestore();
    assert.deepEqual(h.fullScreenCalls(), [true]);
    assert.equal(h.context.fullscreenActive, true);
    assert.deepEqual(h.bounds(), h.displayBounds);
    assert.deepEqual(h.interaction(), {resizable: false, movable: false});
    assertState(h, 'Fullscreen');
});

test('System minimize followed by Normal exits fullscreen', () => {
    const h = createHarness();
    h.context.setWindowState('Fullscreen');
    h.systemMinimize();
    h.context.setWindowState('Normal');

    assert.deepEqual(h.fullScreenCalls(), [true, false]);
    assert.equal(h.context.fullscreenActive, false);
    assert.deepEqual(h.bounds(), h.normalBounds);
    assert.deepEqual(h.interaction(), {resizable: true, movable: true});
    assertState(h, 'Normal');
});

test('External geometry mismatch exits fullscreen through the normal transition', () => {
    const h = createHarness();
    h.context.setWindowState('Fullscreen');
    h.externalBoundsChange({x: 50, y: 40, width: 1100, height: 700});
    h.context.onWindowGeometryChanged();

    assert.deepEqual(h.fullScreenCalls(), [true, false]);
    assert.equal(h.context.fullscreenActive, false);
    assert.deepEqual(h.bounds(), h.normalBounds);
    assert.deepEqual(h.interaction(), {resizable: true, movable: true});
    assertState(h, 'Normal');
});

test('Normal window geometry changes remain allowed', () => {
    const h = createHarness();
    h.context.onWindowStateChanged('Normal');
    const resized = {x: 120, y: 80, width: 1100, height: 720};
    h.externalBoundsChange(resized);
    h.context.onWindowGeometryChanged();

    assert.deepEqual(h.fullScreenCalls(), []);
    assert.deepEqual(h.bounds(), resized);
    assert.equal(h.context.fullscreenActive, false);
    assertState(h, 'Normal');
});

test('Non-Windows fullscreen does not apply the Windows interaction lock', () => {
    const h = createHarness('darwin');
    h.context.setWindowState('Fullscreen');

    assert.deepEqual(h.fullScreenCalls(), [true]);
    assert.deepEqual(h.interaction(), {resizable: true, movable: true});
    assert.equal(h.context.normalWindowInteraction, undefined);
    assertState(h, 'Fullscreen');

    h.context.setWindowState('Normal');
    assert.deepEqual(h.interaction(), {resizable: true, movable: true});
    assert.deepEqual(h.bounds(), h.normalBounds);
    assertState(h, 'Normal');
});
