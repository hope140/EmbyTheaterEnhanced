'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {createTransitionStreamCapture, classifyMeanColor} = require('../tools/transition-stream-capture.cjs');

const display = {id: 7, bounds: {x: 0, y: 0, width: 2000, height: 1200}};
const appBounds = {x: 100, y: 100, width: 900, height: 600};

function makeFixture(options = {}) {
    const handlerCalls = [];
    const scriptCalls = [];
    let sourceCalls = 0;
    let focused = options.focused !== false;
    let visible = options.visible !== false;
    const session = {
        setDisplayMediaRequestHandler(handler, settings) {
            handlerCalls.push({handler, settings});
            if (options.throwOnHandler && handler) throw new Error('handler registration failed');
        }
    };
    const window = {
        webContents: {
            session,
            mainFrame: {},
            executeJavaScript(script) {
                scriptCalls.push(script);
                if (script.includes('async function rendererStreamCapture')) {
                    return Promise.resolve(options.prepareResult || {ready: true, videoSize: {width: 1920, height: 1080}});
                }
                if (script.includes('.start(')) {
                    const match = script.match(/\.start\(("(?:next|previous)"),(\d+)\)/);
                    return Promise.resolve(match
                        ? {ready: true, armedAtMs: Number(match[2])}
                        : {ready: false});
                }
                if (script.includes('.results()')) {
                    const action = options.resultAction || {};
                    return Promise.resolve(options.rendererResults || {failure: null, actions: action});
                }
                if (script.includes('.stop()')) return Promise.resolve(true);
                if (script.includes('.invalidate()')) return Promise.resolve(true);
                return Promise.resolve(false);
            }
        },
        isDestroyed() { return false; },
        isVisible() { return visible; },
        isFocused() { return focused; },
        isMinimized() { return false; },
        getBounds() { return {...appBounds}; },
        setFocused(value) { focused = value; },
        setVisible(value) { visible = value; }
    };
    const desktopCapturer = {
        async getSources() {
            sourceCalls++;
            if (options.rejectSources) throw new Error('source enumeration failed');
            return options.sources || [{name: 'DISPLAY 7', display_id: '7'}];
        }
    };
    const screen = {getDisplayMatching() { return display; }};
    const capture = createTransitionStreamCapture({
        desktopCapturer,
        screen,
        getApplicationWindow() { return window; }
    });
    return {
        capture,
        window,
        session,
        handlerCalls,
        scriptCalls,
        get sourceCalls() { return sourceCalls; }
    };
}

function sample(atMs, hash, colorClass = 'red') {
    return {atMs, hash, colorClass, meanRGB: {r: 244, g: 25, b: 41}, meanLuma: 72};
}

test('mean color classifies saturated red without labeling it purple', function () {
    assert.equal(classifyMeanColor({meanRGB: {r: 244, g: 25, b: 41}, blackFraction: 0}), 'red');
});

test('prepare refuses an invisible or unfocused window before calling getSources', async function () {
    for (const state of [{visible: false}, {focused: false}]) {
        const fixture = makeFixture(state);
        const result = await fixture.capture.prepare(fixture.window);
        assert.deepEqual(result, {ready: false, reason: 'application-window-not-visible-and-focused'});
        assert.equal(fixture.sourceCalls, 0);
        assert.equal(fixture.handlerCalls.length, 0);
    }
});

test('prepare requires an exact display_id match and never selects a fallback screen source', async function () {
    const fixture = makeFixture({sources: [
        {name: 'other-display', display_id: '8'},
        {name: 'default-screen-without-id'}
    ]});

    const result = await fixture.capture.prepare(fixture.window);

    assert.deepEqual(result, {ready: false, reason: 'matching-screen-source-unavailable'});
    assert.equal(fixture.sourceCalls, 1);
    assert.equal(fixture.handlerCalls.length, 0);
    assert.equal(fixture.scriptCalls.length, 0);
});

test('failed renderer preparation resets the installed display-media handler', async function () {
    const fixture = makeFixture({prepareResult: {ready: false, reason: 'display-media-deadline'}});

    const result = await fixture.capture.prepare(fixture.window);
    const stopResult = await fixture.capture.stop();

    assert.deepEqual(result, {ready: false, reason: 'display-media-deadline'});
    assert.equal(fixture.handlerCalls.length, 2);
    assert.equal(typeof fixture.handlerCalls[0].handler, 'function');
    assert.equal(fixture.handlerCalls[1].handler, null);
    assert.deepEqual(stopResult, {rendererStopped: true, handlerRestored: true});
});

test('start accepts one next and one previous action and rejects unknown or repeated actions', async function () {
    const fixture = makeFixture();
    const preparation = await fixture.capture.prepare(fixture.window);
    try {
        assert.equal(preparation.ready, true);
        assert.equal(fixture.capture.start('seek'), false);
        assert.equal(fixture.capture.start('next'), true);
        assert.equal(fixture.capture.start('next'), false);
        assert.equal(fixture.capture.start('previous'), true);
        await Promise.resolve();
        assert.equal(fixture.scriptCalls.filter(script => script.includes('.start(')).length, 2);
    } finally {
        await fixture.capture.stop();
    }
});

test('results discard frames outside the requested action window', async function () {
    let actionStart = null;
    const fixture = makeFixture();
    fixture.window.webContents.executeJavaScript = function (script) {
        fixture.scriptCalls.push(script);
        if (script.includes('async function rendererStreamCapture')) {
            return Promise.resolve({ready: true, videoSize: {width: 1920, height: 1080}});
        }
        if (script.includes('.start(')) {
            const match = script.match(/\.start\(("(?:next|previous)"),(\d+)\)/);
            actionStart = Number(match[2]);
            return Promise.resolve({ready: true, armedAtMs: actionStart});
        }
        if (script.includes('.results()')) {
            const at = actionStart;
            return Promise.resolve({failure: null, actions: {next: {frames: [
                sample(at - 1, 'before'),
                sample(at + 1, 'inside-first'),
                sample(at + 1999, 'inside-last'),
                sample(at + 2001, 'after')
            ]}}});
        }
        if (script.includes('.stop()')) return Promise.resolve(true);
        return Promise.resolve(false);
    };

    try {
        assert.equal((await fixture.capture.prepare(fixture.window)).ready, true);
        assert.equal(fixture.capture.start('next'), true);
        const results = await fixture.capture.waitForResults();
        assert.deepEqual(results.captures[0].samples.map(frame => frame.hash), ['inside-first', 'inside-last']);
        assert.equal(results.captures[0].sampleCount, 2);
    } finally {
        await fixture.capture.stop();
    }
});

test('frames are discarded after the application window loses focus', async function () {
    let actionStart = null;
    const fixture = makeFixture();
    fixture.window.webContents.executeJavaScript = function (script) {
        fixture.scriptCalls.push(script);
        if (script.includes('async function rendererStreamCapture')) {
            return Promise.resolve({ready: true, videoSize: {width: 1920, height: 1080}});
        }
        if (script.includes('.start(')) {
            const match = script.match(/\.start\(("(?:next|previous)"),(\d+)\)/);
            actionStart = Number(match[2]);
            return Promise.resolve({ready: true, armedAtMs: actionStart});
        }
        if (script.includes('.results()')) {
            return Promise.resolve({failure: null, actions: {next: {frames: [
                sample(actionStart + 10, 'would-have-been-sampled'),
                sample(actionStart + 20, 'would-have-been-sampled-2')
            ]}}});
        }
        if (script.includes('.invalidate()')) return Promise.resolve(true);
        if (script.includes('.stop()')) return Promise.resolve(true);
        return Promise.resolve(false);
    };

    try {
        assert.equal((await fixture.capture.prepare(fixture.window)).ready, true);
        assert.equal(fixture.capture.start('next'), true);
        fixture.window.setFocused(false);
        const results = await fixture.capture.waitForResults();
        assert.equal(results.captures[0].classification, 'INCONCLUSIVE');
        assert.equal(results.captures[0].reason, 'application-window-not-visible-and-focused');
        assert.equal(results.captures[0].sampleCount, 0);
        assert.deepEqual(results.captures[0].samples, []);
    } finally {
        await fixture.capture.stop();
    }
});
