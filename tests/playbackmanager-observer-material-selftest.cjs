'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {createRequire} = require('node:module');

const root = path.resolve(__dirname, '..');
const fixturePath = path.join(root, 'tests/playbackmanager-request-session.test.cjs');
const playbackManagerRelativePath = path.join('electronapp', 'www', 'modules', 'common', 'playback', 'playbackmanager.js');
const sourcePath = process.env.ETE_PLAYBACKMANAGER_SOURCE
    ? path.resolve(process.env.ETE_PLAYBACKMANAGER_SOURCE)
    : path.join(root, 'vendor', 'carnival', playbackManagerRelativePath);
const manifestPath = path.join(root, 'vendor', 'runtime-manifest.json');
const observerAnchor = 'MutationObserver: class {\n            observe() {}\n            disconnect() {}\n        }';
const visibleElementAnchor = 'querySelector() { return null; }';
const fixtureEndAnchor = "test('serialized replacement stops preserve";

function countExact(source, needle) {
    return source.split(needle).length - 1;
}

function assertPlaybackManagerMaterial() {
    assert.ok(fs.existsSync(sourcePath), 'required PlaybackManager material is unavailable: ' + sourcePath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const rows = manifest.files.filter(entry => entry.path === playbackManagerRelativePath.split(path.sep).join('/'));
    assert.equal(rows.length, 1, 'runtime manifest has exactly one PlaybackManager entry');
    const bytes = fs.readFileSync(sourcePath);
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(bytes.length, rows[0].size, 'PlaybackManager byte size matches runtime manifest');
    assert.equal(sha256, rows[0].sha256, 'PlaybackManager SHA-256 matches runtime manifest');
}

assertPlaybackManagerMaterial();

function makeHarness() {
    let fixtureSource = fs.readFileSync(fixturePath, 'utf8').replace(/\r\n/g, '\n');
    const end = fixtureSource.indexOf(fixtureEndAnchor);
    assert.notEqual(end, -1, 'AMD fixture extraction end anchor is present');
    fixtureSource = fixtureSource.slice(0, end);
    assert.equal(countExact(fixtureSource, observerAnchor), 1,
        'AMD MutationObserver fake anchor occurs exactly once');
    assert.equal(countExact(fixtureSource, visibleElementAnchor), 1,
        'AMD document querySelector fake anchor occurs exactly once');

    fixtureSource = fixtureSource.replace(observerAnchor, `MutationObserver: class {
            constructor(callback) {
                this.callback = callback;
                this.active = false;
                observerRecords.push(this);
            }
            observe() { this.active = true; }
            disconnect() { this.active = false; }
            trigger() { if (this.active) this.callback([], this); }
        }`);
    fixtureSource = fixtureSource.replace(visibleElementAnchor, 'querySelector() { return visibleElement; }');
    fixtureSource += '\nglobalThis.observerHarness = {makeFixture, makeItem, settle, reportsFor, observerRecords, timerRecords, setVisibleElement(value) { visibleElement = value; }, fireTimer(id) { const timer = timerRecords.find(row => row.id === id); assert.ok(timer, "timer " + id + " exists"); if (!timer.cancelled) { timer.fired = true; timer.callback(); } }, activeObservers() { return observerRecords.filter(row => row.active); }, pendingTimers() { return timerRecords.filter(row => !row.cancelled && !row.fired); }};';

    const observerRecords = [];
    const timerRecords = [];
    let visibleElement = null;
    let nextTimerId = 1;
    const context = {
        require: createRequire(fixturePath),
        __dirname: path.dirname(fixturePath),
        process,
        setImmediate,
        setTimeout(callback, delay) {
            const timer = {id: nextTimerId++, callback, delay, cancelled: false, fired: false};
            timerRecords.push(timer);
            return timer.id;
        },
        clearTimeout(id) {
            const timer = timerRecords.find(row => row.id === id);
            if (timer) timer.cancelled = true;
        },
        setInterval() { return 0; },
        clearInterval() {},
        queueMicrotask,
        console,
        observerRecords,
        timerRecords,
        visibleElement
    };
    const previousSource = process.env.ETE_PLAYBACKMANAGER_SOURCE;
    process.env.ETE_PLAYBACKMANAGER_SOURCE = sourcePath;
    try {
        vm.createContext(context);
        vm.runInContext(fixtureSource, context, {filename: 'AMD-request-session-fixture-with-observer-and-timer-instrumentation'});
    } finally {
        if (previousSource === undefined) delete process.env.ETE_PLAYBACKMANAGER_SOURCE;
        else process.env.ETE_PLAYBACKMANAGER_SOURCE = previousSource;
    }
    return context.observerHarness;
}

function makeVisibleElement() {
    const changes = [];
    return {
        changes,
        classList: {add(name) { changes.push(name); }}
    };
}

async function startPublicItem(h, fixture, id) {
    const index = fixture.calls.metadata.length;
    const request = fixture.manager.play({items: [h.makeItem(id)], fullscreen: true});
    await waitFor(() => fixture.calls.metadata.length === index + 1, id + ' metadata starts');
    fixture.resolveMetadata(index, 'session-' + id);
    await request;
    await h.settle();
    return fixture.player.streamInfo;
}

async function waitFor(predicate, message) {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await Promise.resolve();
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail(message);
}

test('material control: visible volume OSD keeps its existing 50ms hide while its playback owner remains active', async () => {
    const h = makeHarness();
    const fixture = h.makeFixture();
    fixture.apiClient.getCurrentUser = () => Promise.resolve({Configuration: {}});
    fixture.player.canSetAudioStreamIndex = () => false;
    await startPublicItem(h, fixture, 'A');
    const element = makeVisibleElement();
    h.setVisibleElement(element);
    const observer = h.activeObservers()[0];
    observer.trigger();
    assert.equal(observer.active, false, 'visible OSD disconnects the observer');
    const timer = h.pendingTimers().find(row => row.delay === 50);
    assert.ok(timer, 'visible OSD schedules its existing 50ms hide');
    h.fireTimer(timer.id);
    timer.fired = true;
    assert.deepEqual(element.changes, ['hide']);
});

test('material regression: repeated public Play -> started -> terminal Stop leaves no active observer', async () => {
    const h = makeHarness();
    const fixture = h.makeFixture();
    fixture.apiClient.getCurrentUser = () => Promise.resolve({Configuration: {}});
    fixture.player.canSetAudioStreamIndex = () => false;
    const activeCounts = [];
    for (let index = 0; index < 3; index++) {
        await startPublicItem(h, fixture, 'A' + index);
        await fixture.manager.stop();
        await h.settle();
        activeCounts.push(h.activeObservers().length);
    }
    assert.equal(fixture.calls.reports.filter(row => row.method === 'reportPlaybackStart').length, 3);
    assert.equal(fixture.calls.reports.filter(row => row.method === 'reportPlaybackStopped').length, 3);
    assert.deepEqual(activeCounts, [0, 0, 0], 'each terminal Stop retires its request observer');
});

test('material regression: Stop while initial player.play is pending retires the not-yet-started owner', async () => {
    const h = makeHarness();
    const fixture = h.makeFixture();
    fixture.apiClient.getCurrentUser = () => Promise.resolve({Configuration: {}});
    fixture.player.canSetAudioStreamIndex = () => false;
    let resolvePlay;
    fixture.player.play = streamInfo => {
        fixture.calls.play.push(streamInfo);
        return new Promise(resolve => { resolvePlay = resolve; });
    };
    const request = fixture.manager.play({items: [h.makeItem('pending')], fullscreen: true});
    await waitFor(() => fixture.calls.metadata.length === 1, 'pending metadata starts');
    fixture.resolveMetadata(0, 'session-pending');
    await waitFor(() => fixture.calls.play.length === 1, 'initial player.play becomes pending');
    await fixture.manager.stop();
    await h.settle();
    assert.equal(h.activeObservers().length, 0, 'terminal Stop retires a pending initial-play observer');
    resolvePlay();
    await h.settle();
});

test('material regression: replacement A by B leaves only B observer active', async () => {
    const h = makeHarness();
    const fixture = h.makeFixture();
    fixture.apiClient.getCurrentUser = () => Promise.resolve({Configuration: {}});
    fixture.player.canSetAudioStreamIndex = () => false;
    await startPublicItem(h, fixture, 'A');
    await startPublicItem(h, fixture, 'B');
    assert.equal(h.activeObservers().length, 1, 'A observer is retired and B observer remains');
    assert.equal(fixture.player.streamInfo.item.Id, 'B');
});

test('material regression: a failed player load retires the observer created for that request', async () => {
    const h = makeHarness();
    const fixture = h.makeFixture();
    fixture.apiClient.getCurrentUser = () => Promise.resolve({Configuration: {}});
    fixture.player.canSetAudioStreamIndex = () => false;
    fixture.player.play = streamInfo => {
        fixture.calls.play.push(streamInfo);
        return Promise.reject(new Error('synthetic player load failure'));
    };
    fixture.manager.play({items: [h.makeItem('failed')], fullscreen: true}).catch(() => undefined);
    await waitFor(() => fixture.calls.metadata.length === 1, 'failed request metadata starts');
    fixture.resolveMetadata(0, 'session-failed');
    await waitFor(() => fixture.calls.play.length === 1, 'failed player load is invoked');
    await h.settle();
    assert.equal(h.activeObservers().length, 0, 'failed current request retires its provisional observer');
});

test('material regression: metadata failure after provisional B admission retires A and B observers', async () => {
    const h = makeHarness();
    const fixture = h.makeFixture();
    fixture.apiClient.getCurrentUser = () => Promise.resolve({Configuration: {}});
    fixture.player.canSetAudioStreamIndex = () => false;
    await startPublicItem(h, fixture, 'A');
    fixture.manager.play({items: [h.makeItem('metadata-fails')], fullscreen: true}).catch(() => undefined);
    await waitFor(() => fixture.calls.metadata.length === 2, 'replacement metadata starts');
    fixture.rejectMetadata(1, new Error('synthetic metadata failure'));
    await h.settle();
    assert.equal(h.activeObservers().length, 0, 'failed replacement retires provisional B and replaced A owners');
});

test('material regression: a 50ms hide scheduled by A cannot hide the reused visible OSD owned by B', async () => {
    const h = makeHarness();
    const fixture = h.makeFixture();
    fixture.apiClient.getCurrentUser = () => Promise.resolve({Configuration: {}});
    fixture.player.canSetAudioStreamIndex = () => false;
    await startPublicItem(h, fixture, 'A');
    const reusedElement = makeVisibleElement();
    h.setVisibleElement(reusedElement);
    h.activeObservers()[0].trigger();
    const oldTimer = h.pendingTimers().find(row => row.delay === 50);
    assert.ok(oldTimer, 'A schedules the existing delayed hide');
    await startPublicItem(h, fixture, 'B');
    h.setVisibleElement(reusedElement);
    h.fireTimer(oldTimer.id);
    oldTimer.fired = true;
    assert.deepEqual(reusedElement.changes, [], 'A delayed callback cannot hide B current OSD');
});
