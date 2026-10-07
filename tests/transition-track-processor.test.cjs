'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {rendererStreamCapture, classifyMeanColor} = require('../tools/transition-stream-capture.cjs');

const CONFIG = {
    legacySourceId: null,
    display: {x: 0, y: 0, width: 100, height: 100},
    window: {x: 0, y: 0, width: 100, height: 100}
};

function redPixels() {
    const data = new Uint8ClampedArray(96 * 54 * 4);
    for (let offset = 0; offset < data.length; offset += 4) {
        data[offset] = 220;
        data[offset + 1] = 20;
        data[offset + 2] = 20;
        data[offset + 3] = 255;
    }
    return data;
}

function flushMicrotasks(turns) {
    let pending = Promise.resolve();
    for (let i = 0; i < (turns || 12); i++) pending = pending.then(() => Promise.resolve());
    return pending;
}

class FakeVideoFrame {
    constructor(id, events) {
        this.id = id;
        this.displayWidth = 100;
        this.displayHeight = 100;
        this.closeCalls = 0;
        this.events = events;
    }
    close() {
        this.closeCalls++;
        this.events.push('frame-close:' + this.id);
    }
}

function createFrameHarness(options) {
    const settings = options || {};
    const events = [];
    const frames = [];
    const frameReader = createFrameReader(settings.initialFrames || [], events);
    const track = {
        stopCalls: 0,
        stop() { this.stopCalls++; events.push('track-stop'); }
    };
    const stream = {
        getVideoTracks() { return [track]; },
        getTracks() { return [track]; }
    };
    let processorConfig;
    class FakeMediaStreamTrackProcessor {
        constructor(config) { processorConfig = config; events.push('processor-created'); }
        get readable() { return {getReader() { events.push('reader-acquired'); return frameReader; }}; }
    }
    const canvasContext = {
        draws: [],
        drawImage(frame, ...crop) { this.draws.push({frameId: frame.id, crop}); events.push('draw:' + frame.id); },
        getImageData() { return {data: redPixels()}; }
    };
    const documentListeners = new Map();
    let focused = settings.focused !== false;
    const document = {
        hasFocus: () => focused,
        visibilityState: 'visible',
        createElement(name) {
            assert.equal(name, 'canvas');
            return {width: 0, height: 0, getContext() { return canvasContext; }};
        },
        addEventListener() {},
        removeEventListener() {}
    };
    const window = {
        screenX: 0,
        screenY: 0,
        innerWidth: 100,
        innerHeight: 100,
        __eteTransitionScreenStream: null
    };
    const navigator = {mediaDevices: {
        getDisplayMedia() { events.push('get-display-media'); return Promise.resolve(stream); }
    }};
    const sandbox = {
        navigator,
        document,
        window,
        MediaStreamTrackProcessor: settings.processorMissing ? undefined : FakeMediaStreamTrackProcessor,
        VideoFrame: FakeVideoFrame,
        setTimeout,
        clearTimeout,
        Promise,
        Date,
        Math,
        Number,
        Object,
        Array,
        Set,
        Error
    };
    const source = '(' + rendererStreamCapture.toString() + ')';
    const rendererCapture = vm.runInNewContext(source, sandbox, {filename: 'rendererStreamCapture.vm.js'});

    return {
        canvasContext,
        document,
        events,
        frames,
        frameReader,
        get processorConfig() { return processorConfig; },
        createFrame(id) {
            const frame = new FakeVideoFrame(id, events);
            frames.push(frame);
            return frame;
        },
        setFocus(value) { focused = !!value; },
        rendererCapture: () => rendererCapture(CONFIG, classifyMeanColor),
        stream,
        track,
        window
    };
}

function createFrameReader(initialFrames, events) {
    const queued = initialFrames.slice();
    let pendingRead = null;
    let cancelled = false;
    return {
        cancelCalls: 0,
        releaseLockCalls: 0,
        read() {
            if (queued.length) return Promise.resolve({done: false, value: queued.shift()});
            if (cancelled) return Promise.resolve({done: true});
            return new Promise(resolve => { pendingRead = resolve; });
        },
        enqueue(frame) {
            if (cancelled) return false;
            if (pendingRead) {
                const resolve = pendingRead;
                pendingRead = null;
                resolve({done: false, value: frame});
            } else queued.push(frame);
            return true;
        },
        cancel() {
            this.cancelCalls++;
            cancelled = true;
            events.push('reader-cancel');
            if (pendingRead) {
                const resolve = pendingRead;
                pendingRead = null;
                resolve({done: true});
            }
            return Promise.resolve();
        },
        releaseLock() { this.releaseLockCalls++; events.push('reader-release-lock'); }
    };
}

test('missing MediaStreamTrackProcessor fails closed and stops the acquired stream', async () => {
    const harness = createFrameHarness({processorMissing: true});
    const result = await harness.rendererCapture();

    assert.equal(result.ready, false);
    assert.equal(result.reason, 'track-processor-unavailable');
    assert.equal(harness.processorConfig, undefined);
    assert.equal(harness.track.stopCalls, 1);
    assert.equal(harness.frameReader.cancelCalls, 0);
    assert.equal(harness.window.__eteTransitionScreenStream, null);
});

test('reader processes and closes frames, exposes fresh red color, and stop releases reader and track', async () => {
    const harness = createFrameHarness();
    const firstFrame = harness.createFrame('first');
    harness.frameReader.enqueue(firstFrame);
    const result = await harness.rendererCapture();
    assert.equal(result.ready, true);
    assert.equal(result.frameSource, 'MediaStreamTrackProcessor');
    assert.equal(harness.processorConfig.track, harness.track);
    assert.equal(harness.processorConfig.maxBufferSize, 1);
    assert.equal(firstFrame.closeCalls, 1, 'the initial VideoFrame is closed after its draw');
    assert.deepEqual(harness.canvasContext.draws.map(draw => draw.frameId), ['first']);

    const secondFrame = harness.createFrame('second');
    assert.equal(harness.frameReader.enqueue(secondFrame), true);
    await flushMicrotasks();
    const stream = harness.window.__eteTransitionScreenStream;
    assert.ok(stream);
    const color = stream.currentColor();
    assert.equal(color.colorClass, 'red');
    assert.equal(color.meanRGB.r, 220);
    assert.equal(color.meanRGB.g, 20);
    assert.equal(color.meanRGB.b, 20);
    assert.ok(Date.now() - color.atMs <= 150);
    assert.equal(secondFrame.closeCalls, 1, 'each consumed VideoFrame is closed');
    assert.deepEqual(harness.canvasContext.draws.map(draw => draw.frameId), ['first', 'second']);
    assert.ok(harness.events.indexOf('draw:first') < harness.events.indexOf('frame-close:first'));
    assert.ok(harness.events.indexOf('draw:second') < harness.events.indexOf('frame-close:second'));

    assert.equal(stream.stop(), true);
    await flushMicrotasks();
    assert.equal(harness.frameReader.cancelCalls, 1);
    assert.equal(harness.frameReader.releaseLockCalls, 1);
    assert.equal(harness.track.stopCalls, 1);
    assert.equal(harness.window.__eteTransitionScreenStream, undefined);
});

test('focus change invalidates later frames and closes the stream resources', async () => {
    const harness = createFrameHarness();
    const firstFrame = harness.createFrame('first');
    harness.frameReader.enqueue(firstFrame);
    const result = await harness.rendererCapture();
    assert.equal(result.ready, true);
    assert.equal(firstFrame.closeCalls, 1);
    const stream = harness.window.__eteTransitionScreenStream;
    assert.equal(stream.currentColor().colorClass, 'red');

    const secondFrame = harness.createFrame('after-focus-change');
    harness.setFocus(false);
    assert.equal(harness.frameReader.enqueue(secondFrame), true);
    await flushMicrotasks();

    assert.equal(secondFrame.closeCalls, 1, 'a discarded frame is still closed');
    assert.deepEqual(harness.canvasContext.draws.map(draw => draw.frameId), ['first']);
    assert.equal(stream.currentColor(), null, 'invalidated capture cannot publish a color');
    assert.equal(stream.diagnostic().failure, 'renderer-focus-or-bounds-changed');
    assert.equal(harness.frameReader.cancelCalls, 1);
    assert.equal(harness.track.stopCalls, 1);

    stream.stop();
    await flushMicrotasks();
    assert.equal(harness.window.__eteTransitionScreenStream, undefined);
    assert.equal(harness.frameReader.releaseLockCalls, 1);
});
