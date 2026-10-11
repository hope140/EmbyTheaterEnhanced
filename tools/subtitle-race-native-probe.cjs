'use strict';

// Runs the complete production libmpv AMD module against the existing main
// service, Native Helper and pinned libmpv. All media and profile inputs are
// synthetic and confined to the caller-provided test directory.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {app, BrowserWindow, desktopCapturer, screen} = require('electron');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const bridgeClient = require('../src/electronapp/native-helper/client');
const {createService, CALL_CHANNEL, NOTIFY_CHANNEL, EVENT_CHANNEL} = require('../src/electronapp/native-helper/service');

if (process.argv.length !== 4 && !(process.argv.length === 5 && process.argv[4] === '--visible')) {
    throw new Error('Usage: electron subtitle-race-native-probe.cjs <fixture-dir> <output-json> [--visible]');
}
const visible = process.argv[4] === '--visible';
const fixtureDir = path.resolve(process.argv[2]);
const outputPath = path.resolve(process.argv[3]);
const runLabel = path.basename(outputPath, '.json');
const runtimeRoot = path.join(fixtureDir, 'runtime');
const mediaOne = path.join(fixtureDir, 'media-one.mkv');
const mediaTwo = path.join(fixtureDir, 'media-two.mkv');
const subtitleA = path.join(fixtureDir, 'external-a.srt');
const subtitleB = path.join(fixtureDir, 'external-b.srt');
const profile = path.join(fixtureDir, 'profile');
fs.mkdirSync(profile, {recursive: true});
app.setPath('appData', profile);
app.setPath('userData', profile);
const source = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const result = {schemaVersion: 1, scope: 'full-libmpv-AMD + real-main-service + native-helper + pinned-libmpv',
    status: 'running', visible, mediaSha256: hash(fs.readFileSync(mediaOne)), cases: []};
let host;
let service;
let native;

function eventTarget() {
    const listeners = new Map();
    return {
        addEventListener(name, listener) {
            const rows = listeners.get(name) || [];
            rows.push(listener);
            listeners.set(name, rows);
        },
        removeEventListener(name, listener) {
            listeners.set(name, (listeners.get(name) || []).filter(row => row !== listener));
        },
        dispatchEvent(event) {
            for (const listener of [...(listeners.get(event.type) || [])]) listener(event);
        }
    };
}

async function waitFor(predicate, label, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(20);
    }
    throw new Error('timeout:' + label);
}

async function screenshot(label) {
    const file = path.join(fixtureDir, `frame-${runLabel}-${label}.png`);
    assert.equal(fs.existsSync(file), false, 'screenshot output must be fresh');
    native.submitCommand(['screenshot-to-file', file, 'subtitles']);
    let stable = 0;
    let lastSize = -1;
    await waitFor(() => {
        const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
        stable = size > 64 && size === lastSize ? stable + 1 : 0;
        lastSize = size;
        return stable >= 2;
    }, 'frame-' + label, 3000);
    const bytes = fs.readFileSync(file);
    return {fileName: path.basename(file), sha256: hash(bytes), bytes: bytes.length};
}

async function visibleCapture(label) {
    host.moveTop();
    host.focus();
    await sleep(100);
    const display = screen.getDisplayMatching(host.getBounds());
    const sources = await desktopCapturer.getSources({types: ['screen'],
        thumbnailSize: {width: Math.round(display.bounds.width * display.scaleFactor),
            height: Math.round(display.bounds.height * display.scaleFactor)}, fetchWindowIcons: false});
    const source = sources.find(row => String(row.display_id) === String(display.id));
    if (!source || source.thumbnail.isEmpty()) throw new Error('desktop-capture-unavailable');
    const size = source.thumbnail.getSize();
    const bounds = host.getBounds();
    const factorX = size.width / display.bounds.width;
    const factorY = size.height / display.bounds.height;
    const crop = {x: Math.round((bounds.x - display.bounds.x) * factorX),
        y: Math.round((bounds.y - display.bounds.y) * factorY),
        width: Math.round(bounds.width * factorX), height: Math.round(bounds.height * factorY)};
    const captured = source.thumbnail.crop(crop);
    const pixels = captured.toBitmap();
    const dimensions = captured.getSize();
    let brightSubtitlePixels = 0;
    for (let y = Math.floor(dimensions.height * 0.65); y < Math.floor(dimensions.height * 0.95); y++) {
        for (let x = Math.floor(dimensions.width * 0.2); x < Math.floor(dimensions.width * 0.8); x++) {
            const offset = (y * dimensions.width + x) * 4;
            if (pixels[offset] > 200 && pixels[offset + 1] > 200 && pixels[offset + 2] > 200) {
                brightSubtitlePixels++;
            }
        }
    }
    const bytes = captured.toPNG();
    const file = path.join(fixtureDir, `visible-${runLabel}-${label}.png`);
    assert.equal(fs.existsSync(file), false, 'visible capture output must be fresh');
    fs.writeFileSync(file, bytes);
    return {fileName: path.basename(file), sha256: hash(bytes), bytes: bytes.length, brightSubtitlePixels};
}

function summarizeTracks(tracks) {
    if (!Array.isArray(tracks)) return {status: 'unavailable'};
    return {count: tracks.length, subtitles: tracks.filter(row => row.type === 'sub').length,
        selectedSubtitles: tracks.filter(row => row.type === 'sub' && row.selected === true).length};
}

async function run() {
    for (const file of [mediaOne, mediaTwo, subtitleA, subtitleB]) {
        if (!fs.existsSync(file)) throw new Error('synthetic-input-missing');
    }
    host = new BrowserWindow({width: 640, height: 360, frame: false, show: visible, transparent: true,
        skipTaskbar: true, focusable: visible, backgroundColor: '#00000000'});
    await host.loadURL('data:text/html;charset=utf-8,<html><body style="background:transparent"></body></html>');
    if (visible) { host.setAlwaysOnTop(true, 'screen-saver'); host.focus(); }
    const ipcEvents = new EventEmitter();
    const submitted = [];
    const target = {isDestroyed() { return false; }, send(channel, message) { ipcEvents.emit(channel, null, message); }};
    class InspectClient extends NativeHelperClient {
        constructor(options) { super(options); native = this; }
    }
    service = createService({electron: require('electron'), NativeHelperClient: InspectClient,
        getMainWindow: () => host, getWebContents: () => target, runtimeRoot, mode: 'native-helper'});
    const ipc = {
        on: ipcEvents.on.bind(ipcEvents), removeListener: ipcEvents.removeListener.bind(ipcEvents),
        invoke(channel, request) {
            assert.equal(channel, CALL_CHANNEL);
            if (request.operation === 'command' && Array.isArray(request.payload.data) &&
                request.payload.data[0] === 'sub-add') {
                const sourceName = request.payload.data[1] === subtitleA ? 'A' :
                    request.payload.data[1] === subtitleB ? 'B' : 'UNKNOWN';
                submitted.push(sourceName);
            }
            return service.call(request.operation, request.payload, request.endpointId)
                .catch(error => ({status: 'error', reason: error && error.message || 'bridge-call-failed'}));
        },
        send(channel, request) {
            if (channel === NOTIFY_CHANNEL) service.notify(request.operation, request.payload, request.endpointId);
        }
    };
    const targetEvents = eventTarget();
    const body = {firstChild: null,
        insertBefore(node) { node.parentNode = this; this.firstChild = node; },
        removeChild(node) { if (this.firstChild === node) this.firstChild = null; node.parentNode = null; }};
    const document = {body, querySelector() { return body.firstChild; },
        createElement() { return {parentNode: null, classList: {add() {}, remove() {}}, style: {}}; }};
    const window = Object.assign(targetEvents, {ipc, platform: 'win32', PlayerWindowId: 'synthetic-window'});
    const context = {window, document, Promise, AbortController,
        console: {log() {}}, setTimeout, clearTimeout,
        addEventListener: targetEvents.addEventListener.bind(targetEvents),
        removeEventListener: targetEvents.removeEventListener.bind(targetEvents),
        dispatchEvent: targetEvents.dispatchEvent.bind(targetEvents),
        Event: class { constructor(type) { this.type = type; } },
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        XMLHttpRequest: class {
            open(_method, url) { this.url = url; }
            send() { this.response = this.url.includes('list_possible') ? '30;60' : 'Current Refresh Rate -: 60'; this.onload(); }
        }};
    let factory;
    context.define = (_dependencies, value) => { factory = value; };
    vm.runInNewContext(source, context, {filename: 'libmpv.js'});
    const transition = {install() {}, createNative() { return {
        playbackStarted() {}, playbackReady() {}, playbackFailed() {},
        loadingToken() { return null; }, cancel() {}, isActive() { return false; }
    }; }};
    const Player = factory(
        {translate(value) { return value; }}, {getSubtitleUrl(stream) { return stream.DeliveryUrl; }},
        {mapPath(_player, value) { return value; }}, {trigger() {}},
        {showVideoOsd() { return Promise.resolve(); }, setTransparency() {}},
        {get() { return undefined; }, set() {}}, {getSubtitleAppearanceSettings() { return {}; }},
        function (dependencies, callback) { if (dependencies[0] === 'css!./libmpv') callback(); return Promise.resolve(); },
        {}, {isStrm() { return false; }, resolveAsync(ctx) { return Promise.resolve({type: 'native', source: ctx.nativeSource}); }},
        undefined, undefined, undefined, transition, bridgeClient
    );
    const player = {};
    Player.call(player);
    let playId = 0;
    async function play(media, defaultSubtitleIndex = -1) {
        await player.play({_etePlayRequestId: ++playId, url: media,
            item: {ServerId: 'synthetic', MediaType: 'Video', Type: 'Movie', Path: media + '.strm'},
            mediaSource: {Path: media, MediaStreams: [
                {Type: 'Subtitle', Index: 0, DeliveryMethod: 'External', DeliveryUrl: subtitleA, Codec: 'srt'},
                {Type: 'Subtitle', Index: 1, DeliveryMethod: 'External', DeliveryUrl: subtitleB, Codec: 'srt'}
            ], DefaultSubtitleStreamIndex: defaultSubtitleIndex, RunTimeTicks: 450000000},
            mediaType: 'Video', playMethod: 'DirectPlay', playerStartPositionTicks: 0, fullscreen: false});
        await waitFor(async () => (await native.getProperty('core-idle', 2000)) === false, 'core-playing');
    }
    async function record(label, start, expectedSubmissions, expectedSid, capture = true) {
        const commands = submitted.slice(start);
        assert.deepEqual(commands, expectedSubmissions, label + ' submitted commands');
        const sid = await native.getProperty('sid', 2000);
        const tracks = summarizeTracks(await native.getProperty('track-list', 2000));
        if (expectedSid === 'selected') {
            assert.ok(Number(sid) > 0, label + ' selected sid');
            assert.equal(tracks.selectedSubtitles, 1, label + ' selected track count');
        } else {
            assert.ok(sid === false || sid === 'no', label + ' disabled sid');
            assert.equal(tracks.selectedSubtitles, 0, label + ' selected track count');
        }
        const frame = capture ? await screenshot(label) : null;
        const desktopFrame = visible && capture ? await visibleCapture(label) : null;
        if (desktopFrame) {
            if (expectedSid === 'selected') assert.ok(desktopFrame.brightSubtitlePixels > 100, label + ' visible subtitle');
            else assert.ok(desktopFrame.brightSubtitlePixels < 20, label + ' visible subtitle Off');
        }
        result.cases.push({name: label, submitted: commands, sid: String(sid), tracks, frame, desktopFrame,
            coreIdle: await native.getProperty('core-idle', 2000),
            operationErrors: native.operationErrors.length});
    }

    await play(mediaOne);
    let start = submitted.length;
    player.setSubtitleStreamIndex(0);
    await sleep(850);
    await record('single-A', start, ['A'], 'selected');

    await play(mediaOne);
    start = submitted.length;
    player.setSubtitleStreamIndex(1);
    await sleep(850);
    await record('single-B', start, ['B'], 'selected');

    await play(mediaOne);
    start = submitted.length;
    player.setSubtitleStreamIndex(0);
    await sleep(100);
    player.setSubtitleStreamIndex(1);
    await sleep(850);
    await record('A-to-B', start, ['B'], 'selected');

    await play(mediaOne);
    start = submitted.length;
    player.setSubtitleStreamIndex(0);
    await sleep(100);
    player.setSubtitleStreamIndex(-1);
    await sleep(850);
    await record('A-to-Off', start, [], 'no');

    await play(mediaOne);
    start = submitted.length;
    player.setSubtitleStreamIndex(0);
    await sleep(100);
    player.setSubtitleStreamIndex(1);
    await sleep(100);
    player.setSubtitleStreamIndex(0);
    await sleep(850);
    await record('A-to-B-to-A', start, ['A'], 'selected');

    await play(mediaOne);
    start = submitted.length;
    player.setSubtitleStreamIndex(0);
    await sleep(100);
    player.setSubtitleStreamIndex(0);
    await sleep(850);
    await record('A-to-A', start, ['A'], 'selected');

    await play(mediaOne);
    start = submitted.length;
    player.setSubtitleStreamIndex(0);
    await sleep(100);
    await player.stop(false);
    await sleep(850);
    assert.deepEqual(submitted.slice(start), [], 'Stop suppresses pending A');
    result.cases.push({name: 'Stop', submitted: [], coreIdle: await native.getProperty('core-idle', 2000),
        operationErrors: native.operationErrors.length});

    await play(mediaOne);
    start = submitted.length;
    player.setSubtitleStreamIndex(0);
    await sleep(100);
    await play(mediaTwo, 1);
    await sleep(850);
    await record('new-Play', start, ['B'], 'selected');
    assert.equal(await native.getProperty('path', 2000), mediaTwo, 'new Play must own media source');
    assert.equal(native.state.fileLoaded, true);
    result.status = 'passed';
}

app.whenReady().then(run).catch(error => {
    result.status = 'failed';
    result.error = {name: error && error.name || 'Error', message: String(error && error.message || 'probe-failed')
        .replaceAll(fixtureDir, '<fixture>')};
}).finally(async () => {
    try { if (service) await service.destroy(); } catch (_) { }
    try { if (host && !host.isDestroyed()) host.destroy(); } catch (_) { }
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
    app.exit(result.status === 'passed' ? 0 : 1);
});
