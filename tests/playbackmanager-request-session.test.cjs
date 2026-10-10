'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.join(__dirname, '..');
const playbackManagerRelativePath = path.join(
    'vendor', 'carnival', 'electronapp', 'www', 'modules', 'common', 'playback', 'playbackmanager.js'
);
const patchToolPath = process.env.ETE_PLAYBACKMANAGER_PATCH_TOOL
    ? path.resolve(process.env.ETE_PLAYBACKMANAGER_PATCH_TOOL)
    : path.join(repoRoot, 'tools', 'patch-playbackmanager.cjs');
const sourcePath = process.env.ETE_PLAYBACKMANAGER_SOURCE
    ? path.resolve(process.env.ETE_PLAYBACKMANAGER_SOURCE)
    : path.join(repoRoot, playbackManagerRelativePath);

function materializePatchedSource() {
    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-playbackmanager-request-session-'));
    const temporaryPath = path.join(temporaryRoot, 'playbackmanager.js');
    fs.copyFileSync(sourcePath, temporaryPath);
    childProcess.execFileSync(process.execPath, [patchToolPath, temporaryPath], {
        cwd: repoRoot,
        stdio: 'pipe'
    });
    const source = fs.readFileSync(temporaryPath, 'utf8');
    fs.rmSync(temporaryRoot, {recursive: true, force: true});
    return source;
}

const playbackManagerSource = materializePatchedSource();

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

function makeEventHub() {
    const listeners = new Map();
    function key(target, type) {
        let types = listeners.get(target);
        if (!types) {
            types = new Map();
            listeners.set(target, types);
        }
        let rows = types.get(type);
        if (!rows) {
            rows = [];
            types.set(type, rows);
        }
        return rows;
    }
    return {
        on(target, type, listener) {
            key(target, type).push(listener);
        },
        off(target, type, listener) {
            const types = listeners.get(target);
            if (!types) return;
            types.set(type, (types.get(type) || []).filter(row => row !== listener));
        },
        trigger(target, type, args) {
            const types = listeners.get(target);
            for (const listener of (types && types.get(type) || []).slice()) {
                listener.apply(target, args || []);
            }
        }
    };
}

function makeQueueManager(control) {
    return class QueueManager {
        constructor() {
            this.items = [];
            this.currentIndex = -1;
            this.repeatMode = 'RepeatNone';
        }
        getNextItemInfo() {
            return control.nextItem ? control.nextItem(this) : null;
        }
        getPlaylist() {
            return this.items;
        }
        getPlaylistResult() {
            return {Items: this.items.slice()};
        }
        setPlaylist(items) {
            this.items = items;
        }
        setPlaylistState(_playlistItemId, index) {
            this.currentIndex = index;
        }
        getCurrentPlaylistIndex() {
            return this.currentIndex;
        }
        getCurrentPlaylistLength() {
            return this.items.length;
        }
        getCurrentPlaylistItemId() {
            const item = this.items[this.currentIndex];
            return item && item.PlaylistItemId;
        }
        reset() {
            this.currentIndex = -1;
        }
        setRepeatMode(value) {
            this.repeatMode = value;
        }
        getRepeatMode() {
            return this.repeatMode;
        }
        queue() {}
        queueNext() {}
        removeFromPlaylist() {
            return {result: 'noop', isCurrentIndex: false};
        }
        movePlaylistItem() {
            return {result: 'noop'};
        }
    };
}

function makeItem(id, playOptions) {
    return {
        Id: id,
        ServerId: 'server-1',
        MediaType: 'Video',
        Type: 'Movie',
        Name: id,
        Path: id + '.mkv',
        RunTimeTicks: 1200000000,
        MediaSources: [],
        playOptions: playOptions || {fullscreen: true}
    };
}

function makeMediaSource(itemId, sessionId) {
    return {
        Id: 'media-' + itemId,
        StreamUrl: 'stream://' + itemId,
        Container: 'mkv',
        RunTimeTicks: 1200000000,
        MediaStreams: [],
        SupportsDirectPlay: false,
        SupportsDirectStream: false,
        SupportsTranscoding: true,
        TranscodingContainer: 'mkv',
        PlaySessionId: sessionId
    };
}

function makeFixture(options = {}) {
    const calls = {
        alerts: [],
        loadingShown: 0,
        loadingHidden: 0,
        metadata: [],
        play: [],
        stop: [],
        playbackStarts: [],
        playbackStops: [],
        playbackCancelled: [],
        reports: []
    };
    const events = makeEventHub();
    const queueControl = {nextItem: null};
    const queueManagerClass = makeQueueManager(queueControl);
    const player = {
        name: 'localplayer',
        id: 'local-player',
        isLocalPlayer: true,
        supportsProgress: true,
        currentState: {},
        canPlayMediaType() { return true; },
        canPlayItem() { return true; },
        getDeviceProfile() {
            return Promise.resolve({
                DirectPlayProfiles: [],
                TranscodingProfiles: [],
                SubtitleProfiles: []
            });
        },
        play(streamInfo) {
            calls.play.push(streamInfo);
            return Promise.resolve();
        },
        stop(...args) {
            calls.stop.push(args);
            if (args[0] === true) {
                queueMicrotask(() => events.trigger(player, 'stopped'));
            }
            return Promise.resolve();
        },
        destroy() {
            calls.destroyed = (calls.destroyed || 0) + 1;
        },
        beginPlayerUpdates() {},
        endPlayerUpdates() {},
        currentTime() { return 0; },
        duration() { return 120; },
        getVolume() { return 50; },
        setVolume() {},
        isMuted() { return false; },
        paused() { return false; },
        getBufferedRanges() { return []; },
        getMaxStreamingBitrate() { return 1000000; },
        getRepeatMode() { return 'RepeatNone'; },
        getSubtitleOffset() { return 0; },
        getPlaybackRate() { return 1; }
    };
    const apiClient = {
        deviceId() { return 'device-1'; },
        accessToken() { return ''; },
        getCurrentUserId() { return 'user-1'; },
        getSavedEndpointInfo() { return {IsInNetwork: true}; },
        getEndpointInfo() { return Promise.resolve({IsInNetwork: true, IsLocal: true}); },
        getUrl(value) { return 'https://server.test/' + value; },
        getImageUrl(itemId) { return 'https://server.test/images/' + itemId; },
        getPlaybackInfo(itemId) {
            const pending = deferred();
            const metadata = {itemId, pending};
            calls.metadata.push(metadata);
            return pending.promise;
        },
        reportPlaybackStart(info) {
            calls.reports.push({method: 'reportPlaybackStart', info});
            return Promise.resolve();
        },
        reportPlaybackStopped(info) {
            calls.reports.push({method: 'reportPlaybackStopped', info});
            return Promise.resolve();
        },
        reportPlaybackProgress(info) {
            calls.reports.push({method: 'reportPlaybackProgress', info});
            return Promise.resolve();
        },
        stopActiveEncodings() { return Promise.resolve(); },
        isMinServerVersion() { return false; }
    };
    const connectionManager = {
        getApiClient() { return apiClient; },
        currentApiClient() { return apiClient; }
    };
    const appSettings = {
        maxStreamingBitrate() { return 1000000; },
        enableAutomaticBitrateDetection() { return false; }
    };
    const pluginManager = {
        ofType(type) {
            if (type === 'mediaplayer') return [player];
            return [];
        }
    };
    const serviceLocator = {
        appHost: {supports() { return true; }},
        fullscreenManager: {},
        serverNotifications: {}
    };
    const loading = {
        show() { calls.loadingShown++; },
        hide() { calls.loadingHidden++; }
    };
    const context = {
        Promise,
        Date,
        Math,
        Object,
        Array,
        String,
        Number,
        RegExp,
        JSON,
        setTimeout,
        clearTimeout,
        setInterval() { return 0; },
        clearInterval() {},
        queueMicrotask,
        console: {log() {}, warn() {}, error() {}},
        window: {
            localStorage: {
                getItem() { return null; },
                setItem() {}
            }
        },
        document: {
            body: {},
            querySelector() { return null; }
        },
        MutationObserver: class {
            observe() {}
            disconnect() {}
        },
        require(dependencies, callback) {
            if (dependencies[0] === 'alert') {
                callback(function alert(options) {
                    calls.alerts.push(options);
                    return Promise.resolve();
                });
            } else if (dependencies[0] === 'filesystem') {
                callback({fileExists() { return Promise.resolve(); }, directoryExists() { return Promise.resolve(); }});
            }
        },
        define(_dependencies, factory) {
            const exports = {};
            factory(
                exports,
                {default: events},
                {default: appSettings},
                {default: {isLocalItem(item) { return !item || !item.Id; }}},
                {default: pluginManager},
                {default: queueManagerClass},
                {default: {
                    enableCinemaMode() { return options.enableCinemaMode === true; },
                    skipForwardLength() { return 30; },
                    skipBackLength() { return 10; }
                }},
                {default: {translate(value) { return value; }}},
                {default: connectionManager},
                serviceLocator,
                {default: loading}
            );
            context.playbackManagerExports = exports;
        }
    };
    vm.createContext(context);
    vm.runInContext(playbackManagerSource, context, {filename: 'playbackmanager.js'});
    const manager = context.playbackManagerExports.default;
    manager._playQueueManager.items = [];
    events.on(manager, 'playbackstart', (_player, state) => calls.playbackStarts.push(state));
    events.on(manager, 'playbackstop', info => calls.playbackStops.push(info));
    events.on(manager, 'playbackcancelled', () => calls.playbackCancelled.push(true));

    return {
        manager,
        player,
        apiClient,
        calls,
        events,
        queue: manager._playQueueManager,
        queueControl,
        resolveMetadata(index, sessionId) {
            const metadata = calls.metadata[index];
            assert.ok(metadata, 'metadata request ' + index + ' exists');
            metadata.pending.resolve({
                MediaSources: [makeMediaSource(metadata.itemId, sessionId)],
                PlaySessionId: sessionId
            });
        },
        rejectMetadata(index, error) {
            const metadata = calls.metadata[index];
            assert.ok(metadata, 'metadata request ' + index + ' exists');
            metadata.pending.reject(error);
        }
    };
}

async function settle() {
    for (let index = 0; index < 6; index++) {
        await Promise.resolve();
        await new Promise(resolve => setImmediate(resolve));
    }
}

async function waitFor(predicate, message) {
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await settle();
    }
    assert.fail(message || 'timed out waiting for playback manager fixture');
}

async function startSharedItemRequests(fixture) {
    const sharedOptions = {fullscreen: false};
    const itemB = makeItem('B', sharedOptions);
    fixture.queueControl.nextItem = queue => {
        queue.items = [itemB];
        return {item: itemB, index: 0};
    };
    const first = fixture.manager.nextTrack();
    const firstOutcome = first.catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 1, 'first B metadata request did not start');
    const second = fixture.manager.nextTrack();
    const secondOutcome = second.catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 2, 'second B metadata request did not start');
    return {sharedOptions, itemB, firstOutcome, secondOutcome};
}

function reportsFor(calls, method) {
    return calls.reports
        .filter(row => row.method === method)
        .map(row => ({
            itemId: row.info.ItemId,
            playSessionId: row.info.PlaySessionId,
            mediaSourceId: row.info.MediaSourceId
        }));
}

function installDeferredReplacementStops(fixture, {emitStoppedBeforeResolve = false} = {}) {
    const originalStop = fixture.player.stop;
    const pendingStops = [];
    fixture.player.stop = function (...args) {
        if (args[0] !== false) return originalStop.apply(this, args);
        const pending = deferred();
        fixture.calls.stop.push(args);
        const stop = {args, pending};
        pendingStops.push(stop);
        stop.emitStoppedBeforeResolve = () => {
            if (emitStoppedBeforeResolve) fixture.events.trigger(fixture.player, 'stopped');
        };
        return pending.promise;
    };
    return pendingStops;
}

async function startQueueItem(fixture, items, sessionId) {
    fixture.queue.items = items;
    fixture.queueControl.nextItem = queue => {
        const index = queue.currentIndex + 1;
        return items[index] ? {item: items[index], index} : null;
    };
    const request = fixture.manager.nextTrack();
    await waitFor(() => fixture.calls.metadata.length === 1, items[0].Id + ' metadata request did not start');
    fixture.resolveMetadata(0, sessionId);
    await request;
    await settle();
    assert.equal(fixture.queue.currentIndex, 0, items[0].Id + ' starts at queue index 0');
}

async function runSerializedDoubleNextStop(emitStoppedBeforeResolve) {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B')];
    await startQueueItem(fixture, items, 'session-A');
    const pendingStops = installDeferredReplacementStops(fixture, {emitStoppedBeforeResolve});
    const nextSelections = [];
    fixture.queueControl.nextItem = queue => {
        const index = queue.currentIndex + 1;
        const item = items[index];
        if (item) nextSelections.push({item, index});
        return item ? {item, index} : null;
    };

    const oldestRequest = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => pendingStops.length === 1, 'oldest replacement stop did not start');
    const newestRequest = fixture.manager.nextTrack().catch(error => error);
    await settle();
    assert.equal(pendingStops.length, 1,
        'the second physical replacement stop waits for the first stop promise');
    assert.deepEqual(nextSelections.map(selection => ({item: selection.item.Id, index: selection.index})), [
        {item: 'B', index: 1},
        {item: 'B', index: 1}
    ], 'double Next selects the same B at index 1 while A remains current');

    const resolveStop = async stop => {
        stop.emitStoppedBeforeResolve();
        stop.pending.resolve();
        await settle();
    };
    await resolveStop(pendingStops[0]);
    await waitFor(() => pendingStops.length === 2, 'newest replacement stop did not start after oldest resolved');
    assert.equal(fixture.calls.metadata.length, 1,
        'newest B waits for both admitted physical stops before metadata');
    await resolveStop(pendingStops[1]);
    await waitFor(() => fixture.calls.metadata.length === 2, 'newest B metadata request did not start');
    fixture.resolveMetadata(1, 'session-B-new');
    await Promise.all([oldestRequest, newestRequest]);
    await settle();

    assert.equal(fixture.calls.play.length, 2,
        'A and the newest B are the only player.play calls after obsolete metadata resolves');
    assert.equal(fixture.queue.currentIndex, 1, 'newest B owns queue index 1');
    assert.equal(fixture.player.streamInfo.item.Id, 'B', 'old stop completion does not clear final B streamInfo');
    assert.equal(fixture.player.streamInfo.playSessionId, 'session-B-new',
        'final B retains the newest PlaySessionId');
    assert.equal(fixture.player.streamInfo.mediaSource.Id, 'media-B',
        'final B retains its MediaSource identity');
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'overlapping stale replacements stop-report started A exactly once');

    await fixture.manager.stop();
    await settle();
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
        {itemId: 'B', playSessionId: 'session-B-new', mediaSourceId: 'media-B'}
    ], 'terminal B contributes exactly one matching stop report');
    assert.deepEqual(fixture.calls.playbackStops.map(info => info.state.NowPlayingItem.Id), ['A', 'B'],
        'each owned stream preserves one replacement or terminal stop event');
}

test('serialized replacement stops preserve A and newest B after both physical stops drain', async () => {
    // Exercise both the ordinary completion path and libmpv's stopped-before-resolve ordering.
    await runSerializedDoubleNextStop(false);
    await runSerializedDoubleNextStop(true);
});

test('serialized replacement stops do not admit stale middle requests', async () => {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B')];
    await startQueueItem(fixture, items, 'session-A');
    const pendingStops = installDeferredReplacementStops(fixture);
    fixture.queueControl.nextItem = queue => ({item: items[queue.currentIndex + 1], index: queue.currentIndex + 1});
    const requests = [fixture.manager.nextTrack().catch(error => error)];
    await waitFor(() => pendingStops.length === 1, 'burst first replacement stop did not start');
    requests.push(
        fixture.manager.nextTrack().catch(error => error),
        fixture.manager.nextTrack().catch(error => error)
    );
    await settle();
    assert.equal(pendingStops.length, 1, 'burst middle request does not start a second physical stop');
    pendingStops[0].pending.resolve();
    await waitFor(() => pendingStops.length === 2, 'burst newest replacement stop did not start after active stop');
    assert.equal(fixture.calls.metadata.length, 1, 'burst newest request waits for both admitted physical stops');
    pendingStops[1].pending.resolve();
    await waitFor(() => fixture.calls.metadata.length === 2, 'burst newest B metadata did not start');
    fixture.resolveMetadata(1, 'session-B-newest');
    await Promise.all(requests);
    await settle();
    assert.equal(pendingStops.length, 2, 'only active and newest burst requests own physical stops');
    assert.equal(fixture.calls.play.length, 2, 'burst produces only A and newest B player.play calls');
    assert.equal(fixture.player.streamInfo.playSessionId, 'session-B-newest',
        'newest burst request retains its session identity');
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'burst stale requests do not duplicate A stopped report');
});

test('serialized stop captured while B is pending keeps B unreported and retains final C', async () => {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B'), makeItem('C')];
    await startQueueItem(fixture, items, 'session-A');

    let nextCall = 0;
    fixture.queueControl.nextItem = () => {
        const index = nextCall++ === 0 ? 1 : 2;
        return {item: items[index], index};
    };
    const pendingStops = installDeferredReplacementStops(fixture);
    const originalPlay = fixture.player.play;
    const pendingBPlay = deferred();
    fixture.player.play = function (streamInfo) {
        if (streamInfo.item.Id === 'B') {
            fixture.calls.play.push(streamInfo);
            return pendingBPlay.promise;
        }
        return originalPlay.call(this, streamInfo);
    };

    const bRequest = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => pendingStops.length === 1, 'A to B replacement stop did not start');
    pendingStops[0].pending.resolve();
    await waitFor(() => fixture.calls.metadata.length === 2, 'B metadata request did not start');
    fixture.resolveMetadata(1, 'session-B');
    await waitFor(() => fixture.calls.play.length === 2, 'B pending player.play did not capture streamInfo');

    const cRequest = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => pendingStops.length === 2, 'pending B to C replacement stop did not start');
    const newestC = fixture.manager.nextTrack().catch(error => error);
    await settle();
    assert.equal(pendingStops.length, 2, 'second pending B stop waits behind the active stop');
    pendingStops[1].pending.resolve();
    await waitFor(() => pendingStops.length === 3, 'newest pending B stop did not start');
    assert.equal(fixture.calls.metadata.length, 2, 'C metadata waits for both pending B stops');
    pendingStops[2].pending.resolve();
    await waitFor(() => fixture.calls.metadata.length === 3, 'newest C metadata request did not start');
    fixture.resolveMetadata(2, 'session-C');
    await Promise.all([cRequest, newestC]);
    await settle();
    pendingBPlay.reject({playbackSuperseded: true});
    await bRequest;
    await settle();

    assert.equal(fixture.calls.stop.length, 3, 'A to B and both pending B to C replacement stops were invoked');
    assert.deepEqual(fixture.calls.stop.map(args => args[0]), [false, false, false],
        'replacement player.stop calls remain observable with serialized ownership');
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'pending B captured by overlapping stops never generates a stopped report');
    assert.deepEqual(fixture.calls.playbackStops.map(info => info.state.NowPlayingItem.Id), ['A', 'B'],
        'A and pending B each keep one cleanup event for their owned stream');
    assert.equal(fixture.calls.metadata.length, 3, 'pending B rejection does not start extra metadata');
    assert.equal(fixture.calls.play.length, 3, 'only A, pending B, and final C reach player.play');
    assert.equal(fixture.queue.currentIndex, 2, 'final C owns queue index 2');
    assert.equal(fixture.player.streamInfo.item.Id, 'C', 'old pending-B stop completion does not clear final C');
    assert.equal(fixture.player.streamInfo.playSessionId, 'session-C', 'final C retains PlaySessionId');
    assert.equal(fixture.player.streamInfo.mediaSource.Id, 'media-C', 'final C retains MediaSource identity');

    await fixture.manager.stop();
    await settle();
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
        {itemId: 'C', playSessionId: 'session-C', mediaSourceId: 'media-C'}
    ], 'terminal C adds exactly one matching stop report after pending B cleanup');
    assert.deepEqual(fixture.calls.playbackStops.map(info => info.state.NowPlayingItem.Id), ['A', 'B', 'C'],
        'terminal C preserves the owned cleanup event sequence');
});

test('old replacement stop rejection releases the owner and lets newest B proceed', async () => {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B')];
    await startQueueItem(fixture, items, 'session-A');
    fixture.queueControl.nextItem = queue => ({item: items[1], index: 1});
    const pendingStops = installDeferredReplacementStops(fixture);
    const oldRequest = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => pendingStops.length === 1, 'old replacement stop did not start');
    const newestRequest = fixture.manager.nextTrack().catch(error => error);
    await settle();
    assert.equal(pendingStops.length, 1, 'newest request waits behind old physical stop');
    pendingStops[0].pending.reject(new Error('old replacement stop failed'));
    await waitFor(() => pendingStops.length === 2, 'newest replacement stop did not start after old rejection');
    pendingStops[1].pending.resolve();
    await waitFor(() => fixture.calls.metadata.length === 2, 'newest B metadata did not start after old rejection');
    fixture.resolveMetadata(1, 'session-B-newest');
    await Promise.all([oldRequest, newestRequest]);
    await settle();

    assert.equal(fixture.calls.play.length, 2, 'old stop rejection does not block newest B player.play');
    assert.equal(fixture.player.streamInfo.playSessionId, 'session-B-newest',
        'newest B retains identity after old stop rejection');
    assert.equal(fixture.calls.playbackCancelled.length, 0, 'stale old stop rejection is not a playback cancellation');
    assert.equal(fixture.calls.alerts.length, 0, 'stale old stop rejection shows no playback dialog');
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'old stop rejection still cleans up started A once');
});

test('newest replacement stop rejection fails latest request without stale B play', async () => {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B')];
    await startQueueItem(fixture, items, 'session-A');
    fixture.queueControl.nextItem = queue => ({item: items[1], index: 1});
    const pendingStops = installDeferredReplacementStops(fixture);
    const oldRequest = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => pendingStops.length === 1, 'old replacement stop did not start');
    const newestRequest = fixture.manager.nextTrack().catch(error => error);
    pendingStops[0].pending.resolve();
    await waitFor(() => pendingStops.length === 2, 'newest replacement stop did not start');
    pendingStops[1].pending.reject(new Error('newest replacement stop failed'));
    const outcomes = await Promise.all([oldRequest, newestRequest]);
    await settle();

    assert.equal(fixture.calls.metadata.length, 1, 'newest stop rejection starts no stale B metadata');
    assert.equal(fixture.calls.play.length, 1, 'newest stop rejection starts no stale B player.play');
    assert.equal(fixture.calls.playbackCancelled.length, 1, 'latest stop rejection fails the latest request');
    assert.equal(fixture.calls.alerts.length, 1, 'latest stop rejection shows the latest playback failure');
    assert.ok(outcomes.every(outcome => outcome instanceof Error || outcome === undefined),
        'replacement outcomes settle after newest stop rejection');
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'successful first stop cleans up A once despite newest rejection');
});

test('all replacement stops rejecting retain A until a real stopped event and restore the listener', async () => {
    const fixture = makeFixture();
    await startQueueItem(fixture, [makeItem('A'), makeItem('B')], 'session-A');
    const streamA = fixture.player.streamInfo;
    const pendingStops = installDeferredReplacementStops(fixture);
    const first = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => pendingStops.length === 1);
    const second = fixture.manager.nextTrack().catch(error => error);
    pendingStops[0].pending.reject(new Error('first stop rejected'));
    await waitFor(() => pendingStops.length === 2);
    pendingStops[1].pending.reject(new Error('second stop rejected'));
    await Promise.all([first, second]);
    assert.equal(fixture.player.streamInfo, streamA, 'no successful Stop can claim the current stream');
    assert.equal(fixture.player._eteReplacementStop, undefined, 'rejected stop owner is released');
    assert.equal(fixture.calls.metadata.length, 1);
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), []);
    fixture.events.trigger(fixture.player, 'stopped');
    await settle();
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'restored listener performs the real A stop exactly once');
});

test('terminal Stop drains pending replacement before queued Next and preserves B identity', async () => {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B')];
    await startQueueItem(fixture, items, 'session-A');
    fixture.queueControl.nextItem = queue => ({item: items[1], index: 1});

    const originalStop = fixture.player.stop;
    const replacementStops = [];
    let terminalCalls = 0;
    const terminalPending = deferred();
    fixture.player.stop = function (...args) {
        if (args[0] === false) {
            const pending = deferred();
            fixture.calls.stop.push(args);
            replacementStops.push({pending, args});
            return pending.promise;
        }
        if (args[0] === true) {
            terminalCalls++;
            fixture.calls.stop.push(args);
            return terminalPending.promise.then(() => {
                fixture.events.trigger(fixture.player, 'stopped');
            });
        }
        return originalStop.apply(this, args);
    };

    const oldRequest = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => replacementStops.length === 1, 'old replacement stop did not start');
    const terminalRequest = fixture.manager.stop();
    await settle();
    assert.equal(terminalCalls, 0, 'terminal Stop waits behind the outstanding replacement stop');
    const newestRequest = fixture.manager.nextTrack().catch(error => error);
    await settle();
    assert.equal(replacementStops.length, 1,
        'Next arriving during terminal drain does not enqueue a second replacement stop');

    replacementStops[0].pending.resolve();
    await waitFor(() => terminalCalls === 1, 'terminal stop did not start after replacement drain');
    const physicalPendingNext = fixture.manager.nextTrack().catch(error => error);
    await settle();
    assert.equal(fixture.calls.metadata.length, 1, 'Next during physical terminal Stop cannot enter metadata');
    assert.equal(replacementStops.length, 1, 'Next during physical terminal Stop adds no replacement teardown');
    terminalPending.resolve();
    await waitFor(() => fixture.calls.metadata.length === 2, 'queued B metadata did not start after terminal drain');
    fixture.resolveMetadata(1, 'session-B');
    await Promise.all([oldRequest, newestRequest, physicalPendingNext, terminalRequest]);
    await settle();

    assert.equal(fixture.player.streamInfo.item.Id, 'B', 'queued B survives terminal drain');
    assert.equal(fixture.player.streamInfo.playSessionId, 'session-B', 'queued B retains PlaySessionId');
    assert.equal(fixture.player.streamInfo.mediaSource.Id, 'media-B', 'queued B retains MediaSource identity');
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'terminal drain reports A exactly once before queued B starts');
    assert.deepEqual(fixture.calls.playbackStops.map(info => info.state.NowPlayingItem.Id), ['A'],
        'terminal drain preserves one A cleanup event');
    assert.deepEqual(fixture.calls.stop.map(args => args[0]), [false, true],
        'replacement stop and terminal stop are invoked without a second replacement stop');

    await fixture.manager.stop();
    await settle();
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
        {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'}
    ], 'later terminal Stop reports the queued B pair exactly once');
});

test('duplicate terminal Stop rejection releases the owner and queued Next does not play stale B', async () => {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B')];
    await startQueueItem(fixture, items, 'session-A');
    fixture.queueControl.nextItem = queue => ({item: items[1], index: 1});
    const originalStop = fixture.player.stop;
    const replacementStops = [];
    let terminalPending;
    let terminalCalls = 0;
    fixture.player.stop = function (...args) {
        if (args[0] === false) {
            const pending = deferred();
            fixture.calls.stop.push(args);
            replacementStops.push(pending);
            return pending.promise;
        }
        if (args[0] === true) {
            fixture.calls.stop.push(args);
            terminalCalls++;
            terminalPending = deferred();
            return terminalPending.promise;
        }
        return originalStop.apply(this, args);
    };

    const replacement = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => replacementStops.length === 1, 'replacement stop did not start');
    const terminalOne = fixture.manager.stop().catch(error => error);
    const terminalTwo = fixture.manager.stop().catch(error => error);
    const queuedNext = fixture.manager.nextTrack().catch(error => error);
    await settle();
    assert.equal(terminalCalls, 0, 'terminal Stop calls wait behind replacement stop');
    replacementStops[0].resolve();
    await waitFor(() => terminalCalls === 1, 'terminal physical stop did not start');
    assert.ok(terminalPending, 'terminal physical stop created a deferred promise');
    const terminalError = new Error('terminal stop failed');
    terminalPending.reject(terminalError);
    const outcomes = await Promise.all([replacement, terminalOne, terminalTwo, queuedNext]);
    await settle();

    assert.equal(fixture.calls.stop.filter(args => args[0] === true).length, 1,
        'duplicate terminal Stop calls share one physical terminal stop');
    assert.equal(fixture.calls.metadata.length, 1, 'queued Next after terminal failure starts no B metadata');
    assert.equal(fixture.calls.play.length, 1, 'queued Next after terminal failure starts no B player.play');
    assert.equal(fixture.calls.playbackCancelled.length, 1, 'queued latest Next reports its terminal failure once');
    assert.equal(fixture.calls.alerts.length, 1, 'queued latest Next shows its terminal failure once');
    assert.equal(outcomes[1], terminalError, 'first terminal caller receives the physical rejection');
    assert.equal(outcomes[2], terminalError, 'duplicate terminal caller receives the same physical rejection');
    assert.equal(fixture.player._eteReplacementStop, undefined, 'failed owner is released');
});

test('native transition prepares both tokens and newest loading token remains usable', async () => {
    const transitionModule = require(path.join(repoRoot, 'src', 'electronapp', 'enhanced', 'nexttrack-transition.js'));
    const fixture = makeFixture();
    await startQueueItem(fixture, [makeItem('A'), makeItem('B')], 'session-A');
    const preparations = new Map();
    const preparedTokens = [];
    const endpoint = {
        preparePresentation(token) {
            const pending = deferred();
            preparations.set(token, pending);
            preparedTokens.push(token);
            return pending.promise;
        },
        cancelPresentation() {}
    };
    const transition = transitionModule.createNative({getEndpoint: () => endpoint});
    const loadingTokens = [];
    const originalStop = fixture.player.stop;
    fixture.player.stop = function (...args) {
        if (args[0]) return originalStop.apply(this, args);
        fixture.calls.stop.push(args);
        return transition.beforeTeardown().then(() => {
            fixture.events.trigger(fixture.player, 'stopped');
        });
    };
    const originalPlay = fixture.player.play;
    fixture.player.play = function (streamInfo) {
        transition.playbackStarted(streamInfo._etePlayRequestId);
        loadingTokens.push(transition.loadingToken(streamInfo._etePlayRequestId));
        return originalPlay.call(this, streamInfo);
    };
    transitionModule.install(fixture.manager, fixture.player, transition);

    const first = fixture.manager.nextTrack();
    await waitFor(() => preparedTokens.length === 1, 'native token 1 was not prepared');
    const second = fixture.manager.nextTrack();
    await settle();
    assert.deepEqual(preparedTokens, [1], 'new token preparation waits for active Stop');
    preparations.get(1).resolve({ready: true});
    await waitFor(() => preparedTokens.length === 2, 'native token 2 was not prepared');
    assert.equal(fixture.calls.metadata.length, 1, 'B is gated until latest native preparation and Stop finish');
    preparations.get(2).resolve({ready: true});
    await waitFor(() => fixture.calls.metadata.length === 2, 'newest B metadata did not begin');
    fixture.resolveMetadata(1, 'session-B');
    await Promise.all([first, second]);

    assert.deepEqual(preparedTokens, [1, 2], 'native preparation runs once for each transition token');
    assert.deepEqual(loadingTokens, [2], 'only newest B plays and receives the usable token 2');
    assert.equal(fixture.player.streamInfo.playSessionId, 'session-B');
});

test('shared next item options ignore a stale success after the newer response starts', async () => {
    const fixture = makeFixture();
    const {sharedOptions, itemB, firstOutcome, secondOutcome} = await startSharedItemRequests(fixture);

    fixture.resolveMetadata(1, 'session-B-new');
    await settle();
    fixture.resolveMetadata(0, 'session-B-old');
    await Promise.all([firstOutcome, secondOutcome]);
    await settle();

    assert.equal(fixture.calls.play.length, 1,
        'the newer metadata response produces exactly one player.play call');
    assert.equal(fixture.calls.playbackStarts.length, 1,
        'the stale response does not emit a second playbackstart');
    assert.equal(sharedOptions._etePlayRequestId, undefined,
        'the caller-owned options object is not the request identity store');
    assert.equal(itemB.playOptions._etePlayRequestId, 2,
        'the item points at the newest independent request snapshot');
    assert.equal(fixture.calls.play[0]._etePlayRequestId, 2,
        'the started stream retains the newer request identity');
});

test('shared next item options isolate a stale rejection from the newer session', async () => {
    const fixture = makeFixture();
    const {sharedOptions, itemB, firstOutcome, secondOutcome} = await startSharedItemRequests(fixture);

    fixture.resolveMetadata(1, 'session-B-new');
    await settle();
    fixture.rejectMetadata(0, new Error('late old metadata failure'));
    await Promise.all([firstOutcome, secondOutcome]);
    await settle();

    assert.equal(fixture.calls.play.length, 1,
        'the newer metadata response produces exactly one player.play call');
    assert.equal(fixture.calls.playbackStarts.length, 1,
        'the stale rejection does not emit a second playbackstart');
    assert.equal(fixture.calls.playbackCancelled.length, 0,
        'a stale rejection does not surface a new-session playback error');
    assert.equal(fixture.calls.alerts.length, 0,
        'a stale rejection does not show the playback error dialog');
    assert.equal(sharedOptions._etePlayRequestId, undefined,
        'the caller-owned options object is not the request identity store');
    assert.equal(itemB.playOptions._etePlayRequestId, 2,
        'the item points at the newest independent request snapshot');
});

test('terminal Stop invalidates pending metadata before player.play or playbackstart', async () => {
    const fixture = makeFixture();
    const itemB = makeItem('B');
    fixture.queueControl.nextItem = queue => {
        queue.items = [itemB];
        return {item: itemB, index: 0};
    };

    const request = fixture.manager.nextTrack();
    await waitFor(() => fixture.calls.metadata.length === 1, 'pending metadata request did not start');
    await fixture.manager.stop();
    fixture.resolveMetadata(0, 'session-B-stopped');
    await request.catch(() => undefined);
    await settle();

    assert.equal(fixture.calls.play.length, 0, 'terminal Stop prevents late player.play');
    assert.equal(fixture.calls.playbackStarts.length, 0, 'terminal Stop prevents late playbackstart');
    assert.equal(reportsFor(fixture.calls, 'reportPlaybackStopped').length, 0,
        'terminal Stop while PlaybackInfo is pending does not report a stopped session');
});

test('terminal Stop of a replacement pending stream does not report its temporary streamInfo', async () => {
    const fixture = makeFixture();
    const itemA = makeItem('A');
    const itemB = makeItem('B');
    const items = [itemA, itemB];
    fixture.queue.items = items;
    fixture.queueControl.nextItem = queue => {
        const index = queue.currentIndex + 1;
        return items[index] ? {item: items[index], index} : null;
    };

    const first = fixture.manager.nextTrack();
    const firstResultPromise = first.then(
        () => ({ok: true}),
        error => ({ok: false, error})
    );
    await waitFor(() => fixture.calls.metadata.length === 1, 'A metadata request did not start');
    fixture.resolveMetadata(0, 'session-A');
    const firstResult = await firstResultPromise;
    assert.equal(firstResult.ok, true, 'A initial request failed: ' + String(firstResult.error));
    await settle();

    const replacement = fixture.manager.nextTrack();
    const replacementOutcome = replacement.catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 2, 'B metadata request did not start');
    await settle();
    await fixture.manager.stop();
    await settle();
    fixture.resolveMetadata(1, 'session-B');
    await replacementOutcome;
    await settle();

    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'only the truly started A session is reported stopped');
    assert.equal(fixture.calls.play.length, 1, 'the pending B replacement never reaches player.play');
    assert.equal(fixture.calls.playbackStarts.length, 1, 'the pending B replacement never starts');
});

test('a pending B replacement by C keeps stop events and reports only started A and final C', async () => {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B'), makeItem('C')];
    fixture.queue.items = items;
    let nextCall = 0;
    fixture.queueControl.nextItem = () => {
        const index = nextCall++;
        return items[index] ? {item: items[index], index} : null;
    };

    const first = fixture.manager.nextTrack();
    await waitFor(() => fixture.calls.metadata.length === 1, 'A metadata request did not start');
    fixture.resolveMetadata(0, 'session-A');
    await first;
    await settle();

    const pendingB = fixture.manager.nextTrack();
    const pendingBOutcome = pendingB.catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 2, 'B metadata request did not start');
    await settle();

    const finalC = fixture.manager.nextTrack();
    const finalCOutcome = finalC.catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 3, 'C metadata request did not start');
    fixture.resolveMetadata(2, 'session-C');
    await finalC;
    await settle();
    fixture.resolveMetadata(1, 'session-B-late');
    await Promise.all([pendingBOutcome, finalCOutcome]);
    await settle();

    await fixture.manager.stop();
    await settle();

    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStart'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
        {itemId: 'C', playSessionId: 'session-C', mediaSourceId: 'media-C'}
    ], 'only started A and final C report playback starts');
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
        {itemId: 'C', playSessionId: 'session-C', mediaSourceId: 'media-C'}
    ], 'pending B has no ghost stop and final C keeps its full stop identity');
    assert.deepEqual(fixture.calls.playbackStops.map(info => info.state.NowPlayingItem.Id), ['A', 'B', 'C'],
        'replacement and terminal stop events still run for A, B, and C');
    assert.deepEqual(fixture.calls.stop.map(args => args[0]), [false, false, true],
        'A to B, B to C, and terminal C stops all execute');
    assert.equal(fixture.calls.play.length, 2, 'only A and C reach player.play');
});

test('started A, B, and C sessions each preserve their own stop identity and pairing', async () => {
    const fixture = makeFixture();
    const items = [makeItem('A'), makeItem('B'), makeItem('C')];
    fixture.queue.items = items;
    fixture.queueControl.nextItem = queue => {
        const index = queue.currentIndex + 1;
        return items[index] ? {item: items[index], index} : null;
    };

    for (const [index, item] of items.entries()) {
        const request = fixture.manager.nextTrack();
        await waitFor(() => fixture.calls.metadata.length === index + 1,
            item.Id + ' metadata request did not start');
        fixture.resolveMetadata(index, 'session-' + item.Id);
        await request;
        await settle();
        assert.equal(fixture.calls.play[index]._etePlayRequestId, index + 1,
            item.Id + ' keeps its request identity in streamInfo');
    }

    await fixture.manager.stop();
    await settle();

    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStart'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
        {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'},
        {itemId: 'C', playSessionId: 'session-C', mediaSourceId: 'media-C'}
    ], 'each started session reports its own start identity');
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
        {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'},
        {itemId: 'C', playSessionId: 'session-C', mediaSourceId: 'media-C'}
    ], 'each started session reports exactly one matching stop identity');
});

test('an unmarked started=false change-stream failure still reports its existing session stop', async () => {
    const fixture = makeFixture();
    const item = makeItem('failed-change');
    fixture.manager._currentPlayer = fixture.player;
    fixture.player.streamInfo = {
        url: 'stream://failed-change',
        playMethod: 'Transcode',
        mediaType: 'Video',
        item,
        mediaSource: makeMediaSource(item.Id, 'session-failed-change'),
        playSessionId: 'session-failed-change',
        fullscreen: false,
        started: false
    };

    fixture.events.trigger(fixture.player, 'stopped');
    await settle();

    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {
            itemId: 'failed-change',
            playSessionId: 'session-failed-change',
            mediaSourceId: 'media-failed-change'
        }
    ], 'started=false alone does not suppress an existing change-stream session stop');
});

function makeStopBoundaryFixture(options) {
    const fixture = makeFixture(options);
    fixture.apiClient.getCurrentUser = () => Promise.resolve({Configuration: {}});
    fixture.player.canSetAudioStreamIndex = () => false;
    return fixture;
}

async function startPublicItem(fixture, id) {
    const metadataIndex = fixture.calls.metadata.length;
    const request = fixture.manager.play({items: [makeItem(id)], fullscreen: true});
    const outcome = request.catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === metadataIndex + 1, id + ' public metadata starts');
    fixture.resolveMetadata(metadataIndex, 'session-' + id);
    assert.equal(await outcome, undefined, id + ' public Play succeeds');
    await settle();
    assert.equal(fixture.player.streamInfo.item.Id, id);
    assert.equal(fixture.player.streamInfo.playSessionId, 'session-' + id);
    return fixture.player.streamInfo;
}

function assertOnlyAStopped(fixture) {
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'terminal Stop reports exactly the original A identity once');
}

test('PLAY-01 public Play metadata pending is invalidated by terminal Stop', async () => {
    const fixture = makeStopBoundaryFixture();
    const request = fixture.manager.play({items: [makeItem('A')], fullscreen: false}).catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 1, 'public metadata starts');
    await fixture.manager.stop();
    fixture.resolveMetadata(0, 'session-A-late');
    await request;
    await settle();
    assert.equal(fixture.calls.play.length, 0);
    assert.equal(fixture.calls.playbackStarts.length, 0);
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStart'), []);
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), []);
});

test('PLAY-01 double Next metadata responses remain invalid after Stop in either response order', async t => {
    for (const order of [[0, 1], [1, 0]]) {
        await t.test('response order ' + order.join(','), async () => {
            const fixture = makeStopBoundaryFixture();
            const {firstOutcome, secondOutcome} = await startSharedItemRequests(fixture);
            await fixture.manager.stop();
            for (const index of order) {
                fixture.resolveMetadata(index, 'session-B-' + index);
                await settle();
                assert.equal(fixture.calls.play.length, 0, 'each stale response independently cannot load');
            }
            await Promise.all([firstOutcome, secondOutcome]);
            assert.equal(fixture.calls.playbackStarts.length, 0);
            assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), []);
        });
    }
});

test('PLAY-01 new public Play after Stop owns B while old Next metadata returns', async () => {
    const fixture = makeStopBoundaryFixture();
    const item = makeItem('A');
    fixture.queueControl.nextItem = queue => {
        queue.items = [item];
        return {item, index: 0};
    };
    const oldRequest = fixture.manager.nextTrack().catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 1, 'A metadata starts');
    await fixture.manager.stop();
    const streamB = await startPublicItem(fixture, 'B');
    fixture.resolveMetadata(0, 'session-A-late');
    await oldRequest;
    await settle();
    assert.equal(fixture.player.streamInfo, streamB);
    assert.deepEqual(fixture.calls.play.map(stream => stream.item.Id), ['B']);
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStart'), [
        {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'}
    ]);
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), []);
    await fixture.manager.stop();
    await settle();
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'}
    ]);
});

test('PLAY-01 active A changeStream metadata pending then Stop cannot reload A', async () => {
    const fixture = makeStopBoundaryFixture();
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    const request = fixture.manager.setAudioStreamIndex(2).catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 2, 'audio change metadata starts');
    await fixture.manager.stop();
    await settle();
    assertOnlyAStopped(fixture);
    fixture.resolveMetadata(1, 'session-A');
    await request;
    await settle();
    assert.equal(fixture.calls.play.length, 1, 'late changeStream cannot make a second player.play');
    assert.equal(fixture.calls.playbackStarts.length, 1);
    assertOnlyAStopped(fixture);
});

test('PLAY-01 changeStream stopActiveEncodings pending releases the original A Stop once', async () => {
    const fixture = makeStopBoundaryFixture();
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    const encodingGate = deferred();
    const encodingCalls = [];
    fixture.apiClient.stopActiveEncodings = sessionId => {
        encodingCalls.push(sessionId);
        return encodingGate.promise;
    };
    const request = fixture.manager.setAudioStreamIndex(2).catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 2, 'audio change metadata starts');
    fixture.resolveMetadata(1, 'session-A');
    await waitFor(() => encodingCalls.length === 1, 'encoding stop is pending');
    await fixture.manager.stop();
    await settle();
    const stoppedBeforeRelease = reportsFor(fixture.calls, 'reportPlaybackStopped');
    encodingGate.resolve();
    await request;
    await settle();
    assert.deepEqual(stoppedBeforeRelease, [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
    ], 'Stop reports the started A while encoding cancellation is still pending');
    assertOnlyAStopped(fixture);
    assert.equal(fixture.calls.play.length, 1, 'releasing old encoding cancellation cannot load');
});

for (const rejectLate of [false, true]) {
    test('PLAY-01 changeStream player.play late ' + (rejectLate ? 'rejection' : 'success') + ' cannot affect new B', async () => {
        const fixture = makeStopBoundaryFixture();
        await startQueueItem(fixture, [makeItem('A')], 'session-A');
        const playGate = deferred();
        const originalPlay = fixture.player.play;
        fixture.player.play = stream => {
            if (stream.item.Id !== 'A') return originalPlay.call(fixture.player, stream);
            fixture.calls.play.push(stream);
            return playGate.promise;
        };
        const request = fixture.manager.setAudioStreamIndex(2).catch(error => error);
        await waitFor(() => fixture.calls.metadata.length === 2, 'audio change metadata starts');
        const changedSource = makeMediaSource('A', 'session-A');
        changedSource.SupportsTranscoding = false;
        fixture.calls.metadata[1].pending.resolve({MediaSources: [changedSource], PlaySessionId: 'session-A'});
        await waitFor(() => fixture.calls.play.length === 2, 'changeStream physical play is pending');
        await fixture.manager.stop();
        await settle();
        const stoppedBeforeRelease = reportsFor(fixture.calls, 'reportPlaybackStopped');
        const streamB = await startPublicItem(fixture, 'B');
        const reportsBeforeRelease = JSON.stringify(fixture.calls.reports);
        if (rejectLate) playGate.reject(new Error('late changeStream failure'));
        else playGate.resolve();
        await request;
        await settle();
        assert.equal(fixture.player.streamInfo, streamB, 'late continuation cannot overwrite B streamInfo');
        assert.equal(JSON.stringify(fixture.calls.reports), reportsBeforeRelease, 'late continuation emits no reports');
        assert.equal(fixture.calls.alerts.length, 0);
        assert.equal(fixture.calls.playbackCancelled.length, 0);
        assert.deepEqual(stoppedBeforeRelease, [
            {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
        ], 'A is stopped before admitting B');
        assertOnlyAStopped(fixture);
        assert.deepEqual(fixture.calls.play.map(stream => stream.item.Id), ['A', 'A', 'B']);
        await fixture.manager.stop();
        await settle();
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
            {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
            {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'}
        ]);
    });
}

test('PLAY-01 reverse changeStream metadata responses allow only the current owner to load', async () => {
    const fixture = makeStopBoundaryFixture();
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    const requestId = fixture.player.streamInfo._etePlayRequestId;
    const first = fixture.manager.setAudioStreamIndex(1).catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 2, 'first audio change starts');
    const second = fixture.manager.setAudioStreamIndex(2).catch(error => error);
    await waitFor(() => fixture.calls.metadata.length === 3, 'second audio change starts');
    fixture.resolveMetadata(2, 'session-A');
    await second;
    await settle();
    const newestStream = fixture.player.streamInfo;
    assert.equal(newestStream._etePlayRequestId, requestId, 'valid changeStream preserves playback request identity');
    assert.equal(fixture.player.audioStreamIndex, 2);
    fixture.resolveMetadata(1, 'session-A');
    await first;
    await settle();
    assert.equal(fixture.calls.play.length, 2, 'initial A and newest changeStream are the only loads');
    assert.equal(fixture.player.streamInfo, newestStream);
    assert.equal(fixture.player.audioStreamIndex, 2);
    await fixture.manager.stop();
    await settle();
    assertOnlyAStopped(fixture);
});

test('PLAY-01 public Play waiting for current user cannot acquire a new request after Stop', async () => {
    const fixture = makeStopBoundaryFixture();
    const userGate = deferred();
    let userCalls = 0;
    fixture.apiClient.getCurrentUser = () => {
        userCalls++;
        return userGate.promise;
    };
    const request = fixture.manager.play({items: [makeItem('A')], fullscreen: false}).catch(error => error);
    await waitFor(() => userCalls === 1, 'public Play waits for current user');
    await fixture.manager.stop();
    const stoppedSequence = fixture.manager._etePlayRequestSequence;
    userGate.resolve({Configuration: {}});
    await settle();
    const staleMetadataCount = fixture.calls.metadata.length;
    for (let index = 0; index < staleMetadataCount; index++) fixture.resolveMetadata(index, 'session-A-late');
    await request;
    await settle();
    assert.equal(fixture.manager._etePlayRequestSequence, stoppedSequence, 'stale public Play cannot reacquire request identity');
    assert.equal(staleMetadataCount, 0);
    assert.equal(fixture.calls.play.length, 0);
    assert.equal(fixture.calls.playbackStarts.length, 0);
});

test('PLAY-01 audio device profile pending across Stop cannot target new B', async () => {
    const fixture = makeStopBoundaryFixture();
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    const profileGate = deferred();
    let profileCalls = 0;
    const originalProfile = fixture.player.getDeviceProfile;
    fixture.player.getDeviceProfile = (...args) => {
        if (++profileCalls === 1) return profileGate.promise;
        return originalProfile.apply(fixture.player, args);
    };
    const request = fixture.manager.setAudioStreamIndex(2).catch(error => error);
    await waitFor(() => profileCalls === 1, 'audio change waits for device profile');
    await fixture.manager.stop();
    const streamB = await startPublicItem(fixture, 'B');
    profileGate.resolve({DirectPlayProfiles: [], TranscodingProfiles: [], SubtitleProfiles: []});
    await settle();
    const metadataCount = fixture.calls.metadata.length;
    for (let index = 2; index < metadataCount; index++) fixture.resolveMetadata(index, 'session-A-late');
    await request;
    await settle();
    assert.equal(metadataCount, 2, 'old audio change cannot request metadata from B');
    assert.equal(fixture.calls.play.length, 2);
    assert.equal(fixture.player.streamInfo, streamB);
    assertOnlyAStopped(fixture);
});

test('PLAY-01 quality endpoint pending across Stop cannot change new B', async () => {
    const fixture = makeStopBoundaryFixture();
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    const endpointGate = deferred();
    let endpointCalls = 0;
    const originalEndpoint = fixture.apiClient.getEndpointInfo;
    fixture.apiClient.getEndpointInfo = () => {
        if (++endpointCalls === 1) return endpointGate.promise;
        return originalEndpoint.call(fixture.apiClient);
    };
    const request = fixture.manager.setMaxStreamingBitrate({maxBitrate: 500000}).catch(error => error);
    await waitFor(() => endpointCalls === 1, 'quality change waits for endpoint');
    await fixture.manager.stop();
    const streamB = await startPublicItem(fixture, 'B');
    endpointGate.resolve({IsInNetwork: true, IsLocal: true});
    await settle();
    const metadataCount = fixture.calls.metadata.length;
    for (let index = 2; index < metadataCount; index++) fixture.resolveMetadata(index, 'session-B-unwanted');
    await request;
    await settle();
    assert.equal(metadataCount, 2, 'old quality change cannot request B metadata');
    assert.equal(fixture.calls.play.length, 2);
    assert.equal(fixture.player.streamInfo, streamB);
    assertOnlyAStopped(fixture);
});

test('PLAY-01 public Play during terminal physical Stop waits for complete drain', async () => {
    const fixture = makeStopBoundaryFixture();
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    const terminalGate = deferred();
    const replacementGates = [];
    const originalStop = fixture.player.stop;
    fixture.player.stop = (...args) => {
        fixture.calls.stop.push(args);
        if (args[0] === true) {
            fixture.events.trigger(fixture.player, 'stopped');
            return terminalGate.promise;
        }
        const gate = deferred();
        replacementGates.push(gate);
        return gate.promise;
    };
    const terminal = fixture.manager.stop().catch(error => error);
    await waitFor(() => fixture.calls.stop.length === 1, 'physical terminal Stop starts');
    const publicPlay = fixture.manager.play({items: [makeItem('B')], fullscreen: true}).catch(error => error);
    await settle();
    const metadataBeforeDrain = fixture.calls.metadata.length;
    if (metadataBeforeDrain === 2) fixture.resolveMetadata(1, 'session-B');
    await settle();
    const playsBeforeDrain = fixture.calls.play.length;
    terminalGate.resolve();
    for (const gate of replacementGates) gate.resolve();
    await terminal;
    await waitFor(() => fixture.calls.metadata.length === 2, 'new public B is admitted after terminal drain');
    fixture.resolveMetadata(1, 'session-B');
    await publicPlay;
    await settle();
    fixture.player.stop = originalStop;
    assert.equal(metadataBeforeDrain, 1, 'public B metadata waits behind the physical terminal Stop');
    assert.equal(playsBeforeDrain, 1, 'public B cannot load while physical A Stop is unsettled');
    assert.equal(fixture.player.streamInfo.item.Id, 'B');
    assertOnlyAStopped(fixture);
    await fixture.manager.stop();
    await settle();
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
        {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'}
    ]);
});

test('PLAY-01 extra current changeStream terminal failure preserves existing alert and session stop', async () => {
    const fixture = makeStopBoundaryFixture();
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    fixture.player.play = stream => {
        fixture.calls.play.push(stream);
        return Promise.reject(new Error('current audio load failed'));
    };
    const outcome = fixture.manager.setAudioStreamIndex(2).then(
        value => ({status: 'fulfilled', value}),
        error => ({status: 'rejected', error})
    );
    await waitFor(() => fixture.calls.metadata.length === 2, 'current audio metadata starts');
    const source = makeMediaSource('A', 'session-A');
    source.SupportsTranscoding = false;
    fixture.calls.metadata[1].pending.resolve({MediaSources: [source], PlaySessionId: 'session-A'});
    const result = await outcome;
    await settle();
    assertOnlyAStopped(fixture);
    assert.equal(fixture.player.streamInfo, null);
    assert.equal(fixture.calls.play.length, 2);
    assert.equal(result.status, 'fulfilled', 'existing terminal failure settles through its alert path');
    assert.equal(result.value, undefined);
    assert.equal(fixture.calls.alerts.length, 1);
    assert.equal(fixture.calls.alerts[0].text, 'PlaybackErrorNoCompatibleStream');
});

test('PLAY-01 extra direct audio selection profile gate cannot cross Stop into B', async () => {
    const fixture = makeStopBoundaryFixture();
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    fixture.player.streamInfo.playMethod = 'DirectPlay';
    fixture.player.canSetAudioStreamIndex = () => true;
    const profileGate = deferred();
    const directSelections = [];
    let profileCalls = 0;
    const originalProfile = fixture.player.getDeviceProfile;
    fixture.player.getDeviceProfile = (...args) => {
        if (++profileCalls === 1) return profileGate.promise;
        return originalProfile.apply(fixture.player, args);
    };
    fixture.player.setAudioStreamIndex = index => directSelections.push(index);
    const request = fixture.manager.setAudioStreamIndex(2).catch(error => error);
    await waitFor(() => profileCalls === 1, 'direct audio action waits before entering changeStream');
    assert.equal(fixture.calls.metadata.length, 1);
    await fixture.manager.stop();
    const streamB = await startPublicItem(fixture, 'B');
    profileGate.resolve({DirectPlayProfiles: [], TranscodingProfiles: [], SubtitleProfiles: []});
    await settle();
    const metadataCount = fixture.calls.metadata.length;
    for (let index = 2; index < metadataCount; index++) fixture.resolveMetadata(index, 'session-B-unwanted');
    await request;
    await settle();
    assert.equal(metadataCount, 2, 'old direct audio continuation cannot initiate a B stream change');
    assert.deepEqual(directSelections, []);
    assert.equal(fixture.calls.play.length, 2);
    assert.equal(fixture.player.streamInfo, streamB);
    assertOnlyAStopped(fixture);
});

test('PLAY-01 extra public Play intros gate cannot acquire a request after Stop', async () => {
    const fixture = makeStopBoundaryFixture({enableCinemaMode: true});
    const introsGate = deferred();
    let introsCalls = 0;
    fixture.apiClient.getIntros = itemId => {
        assert.equal(itemId, 'A');
        introsCalls++;
        return introsGate.promise;
    };
    const request = fixture.manager.play({items: [makeItem('A')], fullscreen: true}).catch(error => error);
    await waitFor(() => introsCalls === 1, 'public Play reaches actual intros API');
    assert.equal(fixture.calls.metadata.length, 0);
    await fixture.manager.stop();
    const stoppedSequence = fixture.manager._etePlayRequestSequence;
    introsGate.resolve({Items: [makeItem('intro-A')]});
    await settle();
    const metadataCount = fixture.calls.metadata.length;
    for (let index = 0; index < metadataCount; index++) fixture.resolveMetadata(index, 'session-intro-late');
    await request;
    await settle();
    assert.equal(fixture.manager._etePlayRequestSequence, stoppedSequence);
    assert.equal(metadataCount, 0);
    assert.equal(fixture.calls.play.length, 0);
    assert.equal(fixture.calls.playbackStarts.length, 0);
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStart'), []);
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), []);
});

for (const changedSession of ['session-A', 'session-A-changed']) {
    test('PLAY-01 extra valid audio change preserves request identity with ' + changedSession, async () => {
        const fixture = makeStopBoundaryFixture();
        await startQueueItem(fixture, [makeItem('A')], 'session-A');
        const requestId = fixture.player.streamInfo._etePlayRequestId;
        const encodingStops = [];
        fixture.apiClient.stopActiveEncodings = sessionId => {
            encodingStops.push(sessionId);
            return Promise.resolve();
        };
        const change = fixture.manager.setAudioStreamIndex(2);
        await waitFor(() => fixture.calls.metadata.length === 2, 'valid audio change metadata starts');
        fixture.resolveMetadata(1, changedSession);
        await change;
        await settle();
        assert.equal(fixture.calls.play.length, 2);
        assert.equal(fixture.player.streamInfo._etePlayRequestId, requestId);
        assert.equal(fixture.player.streamInfo.playSessionId, changedSession);
        assert.equal(fixture.player.audioStreamIndex, 2);
        assert.deepEqual(encodingStops, ['session-A', 'session-A'], 'existing before/after cleanup retains previous session identity');
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), []);
        await fixture.manager.stop();
        await settle();
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
            {itemId: 'A', playSessionId: changedSession, mediaSourceId: 'media-A'}
        ]);
    });
}

for (const rejectLate of [false, true]) {
    test('PLAY-01 extra old changeStream play ' + (rejectLate ? 'rejection' : 'success') + ' cannot clean up current encoding', async () => {
        const fixture = makeStopBoundaryFixture();
        await startQueueItem(fixture, [makeItem('A')], 'session-A');
        const encodingStops = [];
        fixture.apiClient.stopActiveEncodings = sessionId => {
            encodingStops.push(sessionId);
            return Promise.resolve();
        };
        const oldPlayGate = deferred();
        const originalPlay = fixture.player.play;
        fixture.player.play = stream => {
            if (stream.playSessionId !== 'session-A-old') return originalPlay.call(fixture.player, stream);
            fixture.calls.play.push(stream);
            return oldPlayGate.promise;
        };
        const oldChange = fixture.manager.setAudioStreamIndex(1).catch(error => error);
        await waitFor(() => fixture.calls.metadata.length === 2, 'old audio metadata starts');
        const oldSource = makeMediaSource('A', 'session-A-old');
        oldSource.SupportsTranscoding = false;
        fixture.calls.metadata[1].pending.resolve({MediaSources: [oldSource], PlaySessionId: 'session-A-old'});
        await waitFor(() => fixture.calls.play.length === 2, 'old audio play is pending');
        const newChange = fixture.manager.setAudioStreamIndex(2);
        await waitFor(() => fixture.calls.metadata.length === 3, 'new audio metadata starts');
        fixture.resolveMetadata(2, 'session-A-new');
        await newChange;
        const newestStream = fixture.player.streamInfo;
        const stopsBeforeStale = encodingStops.slice();
        const reportsBeforeStale = JSON.stringify(fixture.calls.reports);
        assert.deepEqual(stopsBeforeStale, ['session-A', 'session-A', 'session-A']);
        if (rejectLate) oldPlayGate.reject(new Error('old audio play failed'));
        else oldPlayGate.resolve();
        await oldChange;
        await settle();
        assert.deepEqual(encodingStops, stopsBeforeStale, 'stale completion performs no encoding cleanup');
        assert.equal(fixture.player.streamInfo, newestStream);
        assert.equal(fixture.player.streamInfo.playSessionId, 'session-A-new');
        assert.equal(JSON.stringify(fixture.calls.reports), reportsBeforeStale);
        assert.equal(fixture.calls.alerts.length, 0);
    });
}

for (const rejectLate of [false, true]) {
    test('PLAY-01 extra initial player.play late ' + (rejectLate ? 'rejection' : 'success') + ' cannot revive A after Stop and B', async () => {
        const fixture = makeStopBoundaryFixture();
        const initialGate = deferred();
        const originalPlay = fixture.player.play;
        fixture.player.play = stream => {
            if (stream.item.Id !== 'A') return originalPlay.call(fixture.player, stream);
            fixture.calls.play.push(stream);
            return initialGate.promise;
        };
        const oldRequest = fixture.manager.play({items: [makeItem('A')], fullscreen: true}).catch(error => error);
        await waitFor(() => fixture.calls.metadata.length === 1, 'initial A metadata starts');
        const source = makeMediaSource('A', 'session-A');
        source.SupportsTranscoding = false;
        fixture.calls.metadata[0].pending.resolve({MediaSources: [source], PlaySessionId: 'session-A'});
        await waitFor(() => fixture.calls.play.length === 1, 'initial A player.play is pending');
        assert.equal(fixture.calls.playbackStarts.length, 0);
        await fixture.manager.stop();
        const streamB = await startPublicItem(fixture, 'B');
        const reportsBeforeRelease = JSON.stringify(fixture.calls.reports);
        if (rejectLate) initialGate.reject(new Error('late initial A load failure'));
        else initialGate.resolve();
        await oldRequest;
        await settle();
        assert.equal(fixture.player.streamInfo, streamB);
        assert.equal(JSON.stringify(fixture.calls.reports), reportsBeforeRelease);
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStart'), [
            {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'}
        ]);
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), []);
        assert.equal(fixture.calls.alerts.length, 0);
        assert.equal(fixture.calls.playbackCancelled.length, 0);
        await fixture.manager.stop();
        await settle();
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
            {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'}
        ]);
    });
}

for (const rejectMetadata of [false, true]) {
    test('PLAY-01 extra current changeStream automatic retry propagates metadata ' + (rejectMetadata ? 'rejection' : 'ErrorCode'), async () => {
        const fixture = makeStopBoundaryFixture();
        await startQueueItem(fixture, [makeItem('A')], 'session-A');
        fixture.player.play = stream => {
            fixture.calls.play.push(stream);
            return Promise.reject(new Error('current audio load needs retry'));
        };
        const outcome = fixture.manager.setAudioStreamIndex(2).then(
            value => ({status: 'fulfilled', value}),
            error => ({status: 'rejected', error})
        );
        await waitFor(() => fixture.calls.metadata.length === 2, 'audio metadata starts');
        fixture.resolveMetadata(1, 'session-A');
        await waitFor(() => fixture.calls.metadata.length === 3, 'actual onPlaybackError automatic retry starts');
        const retryError = new Error('retry playback metadata failed');
        if (rejectMetadata) fixture.rejectMetadata(2, retryError);
        else fixture.calls.metadata[2].pending.resolve({ErrorCode: 'NoCompatibleStream'});
        const result = await outcome;
        await settle();
        assert.equal(fixture.calls.play.length, 2, 'failed retry metadata causes no third load');
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), []);
        assert.equal(fixture.player.streamInfo.item.Id, 'A');
        assert.equal(fixture.player.streamInfo.playSessionId, 'session-A');
        assert.equal(result.status, 'rejected', 'current retry failure must reach the original action caller');
        if (rejectMetadata) assert.equal(result.error, retryError);
        else assert.equal(result.error.errorCode, 'NoCompatibleStream');
        await fixture.manager.stop();
        await settle();
        assertOnlyAStopped(fixture);
    });
}

async function startPendingAutomaticRetry(fixture) {
    await startQueueItem(fixture, [makeItem('A')], 'session-A');
    const encodingStops = [];
    fixture.apiClient.stopActiveEncodings = sessionId => {
        encodingStops.push(sessionId);
        return Promise.resolve();
    };
    const originalPlay = fixture.player.play;
    let failedOnce = false;
    fixture.player.play = stream => {
        if (failedOnce) return originalPlay.call(fixture.player, stream);
        failedOnce = true;
        fixture.calls.play.push(stream);
        return Promise.reject(new Error('current audio load needs one automatic retry'));
    };
    const outcome = fixture.manager.setAudioStreamIndex(1).then(
        value => ({status: 'fulfilled', value}),
        error => ({status: 'rejected', error})
    );
    await waitFor(() => fixture.calls.metadata.length === 2, 'first audio metadata starts');
    fixture.resolveMetadata(1, 'session-A');
    await waitFor(() => fixture.calls.metadata.length === 3, 'actual automatic retry metadata is pending');
    assert.equal(fixture.calls.play.length, 2);
    return {outcome, encodingStops};
}

for (const rejectLate of [false, true]) {
    test('PLAY-01 retry boundary late metadata ' + (rejectLate ? 'rejection' : 'success') + ' after Stop cannot affect B', async () => {
        const fixture = makeStopBoundaryFixture();
        const {outcome, encodingStops} = await startPendingAutomaticRetry(fixture);
        await fixture.manager.stop();
        await settle();
        assertOnlyAStopped(fixture);
        const streamB = await startPublicItem(fixture, 'B');
        const reportsBeforeStale = JSON.stringify(fixture.calls.reports);
        const encodingBeforeStale = encodingStops.slice();
        if (rejectLate) fixture.rejectMetadata(2, new Error('old retry metadata failed after Stop'));
        else fixture.resolveMetadata(2, 'session-A-retry-late');
        const result = await outcome;
        await settle();
        assert.equal(result.status, 'fulfilled', 'superseded retry is ignored by its original caller');
        assert.equal(fixture.player.streamInfo, streamB);
        assert.equal(fixture.player.streamInfo.playSessionId, 'session-B');
        assert.deepEqual(fixture.calls.play.map(stream => stream.item.Id), ['A', 'A', 'B']);
        assert.deepEqual(encodingStops, encodingBeforeStale, 'old retry has no encoding cleanup after B starts');
        assert.equal(JSON.stringify(fixture.calls.reports), reportsBeforeStale);
        assert.equal(fixture.calls.alerts.length, 0);
        assert.equal(fixture.calls.playbackCancelled.length, 0);
        await fixture.manager.stop();
        await settle();
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
            {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
            {itemId: 'B', playSessionId: 'session-B', mediaSourceId: 'media-B'}
        ]);
    });
}

test('PLAY-01 retry boundary late rejection cannot clear a newer pending stream change owner', async () => {
    const fixture = makeStopBoundaryFixture();
    const {outcome, encodingStops} = await startPendingAutomaticRetry(fixture);
    const newPlayGate = deferred();
    fixture.player.play = stream => {
        fixture.calls.play.push(stream);
        return newPlayGate.promise;
    };
    const newerChange = fixture.manager.setAudioStreamIndex(2);
    await waitFor(() => fixture.calls.metadata.length === 4, 'new action metadata starts while old retry is pending');
    fixture.resolveMetadata(3, 'session-A-new');
    await waitFor(() => fixture.calls.play.length === 3, 'new action player.play is pending');
    const newestOwner = fixture.player._eteStreamChange;
    assert.ok(newestOwner, 'new pending action owns stream change');
    assert.equal(fixture.player.isChangingStream, true);
    const encodingBeforeStale = encodingStops.slice();
    const reportsBeforeStale = JSON.stringify(fixture.calls.reports);
    fixture.rejectMetadata(2, new Error('superseded retry metadata failed'));
    const oldResult = await outcome;
    await settle();
    const ownerAfterStale = fixture.player._eteStreamChange;
    const changingAfterStale = fixture.player.isChangingStream;
    const encodingAfterStale = encodingStops.slice();
    const reportsAfterStale = JSON.stringify(fixture.calls.reports);
    newPlayGate.resolve();
    await newerChange;
    await settle();
    assert.equal(oldResult.status, 'fulfilled');
    assert.equal(ownerAfterStale, newestOwner, 'old retry cleanup cannot clear the new owner');
    assert.equal(changingAfterStale, true, 'old retry cleanup cannot unmark new pending player.play');
    assert.deepEqual(encodingAfterStale, encodingBeforeStale);
    assert.equal(reportsAfterStale, reportsBeforeStale);
    assert.equal(fixture.player.streamInfo.playSessionId, 'session-A-new');
    assert.equal(fixture.player.audioStreamIndex, 2);
    assert.equal(fixture.calls.play.length, 3);
    assert.equal(fixture.calls.alerts.length, 0);
    assert.equal(fixture.calls.playbackCancelled.length, 0);
    await fixture.manager.stop();
    await settle();
    assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
        {itemId: 'A', playSessionId: 'session-A-new', mediaSourceId: 'media-A'}
    ]);
});

for (const emitStoppedBeforeReject of [false, true]) {
    test('PLAY-01 terminal rejection settles public Play and admits later C ' +
        (emitStoppedBeforeReject ? 'after stopped event' : 'before stopped event'), async () => {
        const fixture = makeStopBoundaryFixture();
        await startQueueItem(fixture, [makeItem('A')], 'session-A');
        const terminalGate = deferred();
        const terminalError = new Error('controlled physical terminal Stop rejection');
        const originalStop = fixture.player.stop;
        let physicalTerminalCalls = 0;
        fixture.player.stop = (...args) => {
            if (args[0] !== true) return originalStop.apply(fixture.player, args);
            fixture.calls.stop.push(args);
            physicalTerminalCalls++;
            if (emitStoppedBeforeReject) fixture.events.trigger(fixture.player, 'stopped');
            return terminalGate.promise;
        };
        const outcomes = {};
        function captureOutcome(name, promise) {
            return promise.then(
                value => { outcomes[name] = {status: 'fulfilled', value}; },
                error => { outcomes[name] = {status: 'rejected', error}; }
            );
        }
        const firstStop = fixture.manager.stop();
        const duplicateStop = fixture.manager.stop();
        const firstStopOutcome = captureOutcome('firstStop', firstStop);
        const duplicateStopOutcome = captureOutcome('duplicateStop', duplicateStop);
        assert.equal(firstStop, duplicateStop, 'repeat Stop shares the terminal completion promise');
        assert.equal(physicalTerminalCalls, 1, 'repeat Stop does not issue another physical stop');
        assert.equal(fixture.manager._eteTerminalStop, firstStop);
        const publicPlayOutcome = captureOutcome('publicPlay', fixture.manager.play({
            items: [makeItem('B')], fullscreen: true
        }));
        await settle();
        assert.equal(outcomes.publicPlay, undefined, 'B is pending while physical A Stop is unresolved');
        assert.equal(fixture.calls.metadata.length, 1, 'B cannot request metadata before terminal completion');
        assert.equal(fixture.calls.play.length, 1, 'only A has loaded while Stop is pending');
        terminalGate.reject(terminalError);
        await waitFor(() => outcomes.firstStop && outcomes.duplicateStop && outcomes.publicPlay,
            'terminal rejection must settle both Stop callers and pending public Play B');
        await Promise.all([firstStopOutcome, duplicateStopOutcome, publicPlayOutcome]);
        assert.equal(outcomes.firstStop.status, 'rejected');
        assert.equal(outcomes.firstStop.error, terminalError, 'first Stop preserves the physical error object');
        assert.equal(outcomes.duplicateStop.status, 'rejected');
        assert.equal(outcomes.duplicateStop.error, terminalError, 'repeat Stop preserves the same error object');
        assert.equal(outcomes.publicPlay.status, 'rejected', 'B settles as a failure rather than waiting forever');
        assert.equal(fixture.manager._eteTerminalStop, null, 'rejected terminal fence is released');
        assert.equal(fixture.calls.metadata.length, 1, 'failed B never enters metadata');
        assert.equal(fixture.calls.play.length, 1, 'failed B never loads');
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), emitStoppedBeforeReject ? [
            {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'}
        ] : [], 'A is reported stopped only after its actual stopped event or replacement cleanup');
        fixture.player.stop = originalStop;
        const streamC = await startPublicItem(fixture, 'C');
        assert.equal(streamC.mediaSource.Id, 'media-C');
        assert.equal(fixture.manager._eteTerminalStop, null);
        assert.deepEqual(fixture.calls.play.map(stream => stream.item.Id), ['A', 'C']);
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStart'), [
            {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
            {itemId: 'C', playSessionId: 'session-C', mediaSourceId: 'media-C'}
        ]);
        assertOnlyAStopped(fixture);
        await fixture.manager.stop();
        await settle();
        assert.deepEqual(reportsFor(fixture.calls, 'reportPlaybackStopped'), [
            {itemId: 'A', playSessionId: 'session-A', mediaSourceId: 'media-A'},
            {itemId: 'C', playSessionId: 'session-C', mediaSourceId: 'media-C'}
        ], 'failed B has no session report and A/C retain exactly one matching Stopped each');
    });
}
