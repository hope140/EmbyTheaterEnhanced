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

function makeFixture() {
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
                    enableCinemaMode() { return false; },
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
