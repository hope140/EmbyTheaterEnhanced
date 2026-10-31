'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const nativeClient = require('../src/electronapp/native-helper/client');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');

function fixture() {
    const ipc = new EventEmitter(), operations = [], records = [], eventNames = [], pendingSeeks = [];
    const windowEvents = new EventTarget();
    let factory, generation = 0, playSequence = 0, repeatedGeneration = null, failSeek = false, throwLog = false;
    const property = (name, value, owner = generation) => ipc.emit(nativeClient.EVENT_CHANNEL, {}, {
        type: 'property_change', generationId: owner, data: {name, value}
    });
    ipc.send = (channel, value) => {
        if (channel === 'enhanced-diagnostics-log') {
            if (throwLog) throw Error('synthetic logger unavailable');
            records.push(value);
        }
    };
    ipc.invoke = async (_channel, request) => {
        operations.push(request);
        if (request.operation === 'create') return {status: 'ok', mode: 'native-helper', endpointId: 'diagnostic-fixture'};
        if (request.operation === 'begin-generation') return {status: 'ok', generationId: generation = repeatedGeneration || generation + 1};
        if (request.operation === 'command') {
            const data = request.payload.data;
            if (Array.isArray(data) && data[0] === 'loadfile') queueMicrotask(() => property('core-idle', false));
            if (Array.isArray(data) && data[0] === 'seek') {
                if (failSeek) return {status: 'error', reason: 'RAW_ERROR_PRIVATE_CANARY'};
                return new Promise(resolve => pendingSeeks.push(() => resolve({status: 'accepted'})));
            }
        }
        return {status: 'ok'};
    };
    const context = {
        define: (_dependencies, callback) => { factory = callback; },
        window: {platform: 'win32', ipc},
        document: {
            querySelector: () => null,
            body: {firstChild: null, insertBefore(node) { node.parentNode = this; }, removeChild() {}},
            createElement: () => ({style: {}, classList: {add() {}, remove() {}}})
        },
        addEventListener: windowEvents.addEventListener.bind(windowEvents),
        removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
        dispatchEvent: windowEvents.dispatchEvent.bind(windowEvents),
        Event, CustomEvent: class extends Event { constructor(name, options) { super(name); this.detail = options && options.detail; } },
        AbortController, setTimeout, clearTimeout, console: {log() {}}
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/libmpv.js'), 'utf8'), context);
    const Player = factory({}, {getSubtitleUrl() { return ''; }}, {mapPath: (_player, file) => file},
        {trigger: (_player, event) => eventNames.push(event)},
        {showVideoOsd: async () => {}, setTransparency() {}}, {get() {}, set() {}}, {getSubtitleAppearanceSettings: () => ({})},
        (_dependencies, callback) => callback(), {},
        {resolveAsync: async info => ({type: 'native', source: info.nativeSource})}, null, null, null,
        {install() {}, createNative: () => ({
            cancel() {}, playbackStarted() {}, playbackReady() {}, playbackFailed() {}, loadingToken: () => null,
            isActive: () => false, admit: () => false, replacement() {}
        })}, nativeClient);
    const player = {};
    Player.call(player);
    return {
        player, operations, records, eventNames, property,
        generation: () => generation,
        repeatGeneration: value => { repeatedGeneration = value; },
        failSeek: () => { failSeek = true; },
        throwLog: () => { throwLog = true; },
        acknowledge: (index = 0) => pendingSeeks.splice(index, 1)[0](),
        command: () => operations.filter(row => row.operation === 'command').at(-1).payload.data,
        log: event => records.filter(row => row.event === event).at(-1),
        async play(overrides = {}) {
            const id = ++playSequence;
            await player.play(Object.assign({
                _etePlayRequestId: id, url: 'fixture://SOURCE_PRIVATE_CANARY/' + id,
                item: {Id: 'ITEM_PRIVATE_CANARY', ServerId: 'SERVER_PRIVATE_CANARY', Type: 'Episode', MediaType: 'Video', RunTimeTicks: 1300000000},
                mediaSource: {Id: 'MEDIA_PRIVATE_CANARY', MediaStreams: [], RunTimeTicks: 1200000000},
                mediaType: 'Video', playMethod: 'DirectPlay', playerStartPositionTicks: 0, fullscreen: false
            }, overrides));
        }
    };
}

async function flush() { for (let index = 0; index < 8; index++) await Promise.resolve(); }
const clean = value => JSON.parse(JSON.stringify(value));

test('seek diagnostics retain fractional targets and a pre-command snapshot, with readable privacy-safe origin', async () => {
    const f = fixture(); await f.play();
    f.property('time-pos', 3.25); f.property('duration', 120);
    const callsBefore = f.operations.length;
    f.player.currentTime(60125, {origin: 'position-slider', percent: 50.1, url: 'URL_PRIVATE_CANARY', raw: {secret: 'RAW_PRIVATE_CANARY'}});
    assert.deepEqual(Array.from(f.command()), ['seek', '60.125', 'absolute', 'exact']);
    assert.equal(f.operations.length, callsBefore + 1, 'diagnostics add no native query or command');
    const submitted = clean(f.log('seek-command-submitted').details);
    assert.equal(submitted.seek.sequence, 1);
    assert.equal(submitted.seek.seekOrigin, 'position-slider');
    assert.equal(submitted.seek.requestedSeconds, 60.125);
    assert.equal(submitted.cachedBeforeSeek.positionSeconds, 3.25);
    assert.equal(submitted.cachedBeforeSeek.positionCurrentGeneration, true);
    assert.equal(submitted.cachedBeforeSeek.durationCurrentGeneration, true);
    f.property('time-pos', 60.1); f.acknowledge(); await flush();
    const accepted = diagnostics.sanitizeRecord(f.log('seek-command-accepted'));
    assert.equal(accepted.details.seek.seekOrigin, 'position-slider');
    assert.equal(accepted.details.acceptance, 'bridge-submission');
    assert.equal(accepted.details.cachedBeforeSeek.positionSeconds, 3.25);
    assert.equal(submitted.seek.submissionStatus, 'submitted');
    assert.doesNotMatch(JSON.stringify(f.records.map(record => diagnostics.sanitizeRecord(record))), /PRIVATE_CANARY/);
});

test('native restart is recorded without implying a command, and current EOF remains a stopped event', async () => {
    const f = fixture(); await f.play();
    f.property('duration', 120); f.property('playback-restart', 0);
    const restart = f.log('seek').details;
    assert.equal(restart.nativeEvent, 'playback-restart');
    assert.equal(restart.observedPositionSeconds, 0);
    assert.equal(restart.latestSubmittedSeek, null);
    assert.equal(restart.eventCurrentGeneration, true);
    assert.equal(f.records.some(row => row.event === 'seek-command-submitted'), false);
    f.property('time-pos', 3);
    f.property('demuxer-cache-state', {'reader-pts': 3, 'cache-end': 18, 'cache-duration': 15, 'eof-cached': true, path: 'CACHE_PRIVATE_CANARY'});
    f.property('demuxer-cache-time', 18);
    const operationsBefore = f.operations.length;
    f.property('eof-reached', true);
    const stopped = diagnostics.sanitizeRecord(f.log('stop')).details;
    assert.equal(stopped.stopSource, 'native-eof-reached');
    assert.equal(stopped.cached.positionSeconds, 3);
    assert.equal(stopped.cached.durationSeconds, 120);
    assert.equal(stopped.cached.mediaSourceDurationSeconds, 120);
    assert.equal(stopped.cached.itemDurationSeconds, 130);
    assert.equal(stopped.cached.cacheEof, true);
    assert.equal(stopped.cached.cacheCurrentGeneration, true);
    assert.equal(stopped.cached.cacheReaderSeconds, 3);
    assert.equal(stopped.eventCurrentGeneration, true);
    assert.equal(f.eventNames.filter(name => name === 'stopped').length, 1);
    assert.equal(f.operations.length, operationsBefore);
    assert.doesNotMatch(JSON.stringify(stopped), /PRIVATE_CANARY/);
});

test('retained cache is never claimed current after replacement, including reuse of a native generation number', async () => {
    const f = fixture(); await f.play();
    f.property('duration', 120); f.property('time-pos', 5);
    assert.equal(f.player.getIntroSkipDurationTicks(), 1200000000);
    f.repeatGeneration(f.generation());
    await f.play();
    assert.equal(f.player.duration(), 120000, 'generic cached duration behavior is unchanged');
    assert.equal(f.player.getIntroSkipDurationTicks(), null);
    f.player.currentTime(10000);
    const cached = f.log('seek-command-submitted').details.cachedBeforeSeek;
    assert.equal(cached.durationSeconds, 120);
    assert.equal(cached.durationCurrentGeneration, false);
    assert.equal(cached.positionCurrentGeneration, false);
    f.property('duration', 90, null);
    assert.equal(f.player.getIntroSkipDurationTicks(), null);
    f.property('eof-reached', false);
    f.property('duration', 90);
    assert.equal(f.player.getIntroSkipDurationTicks(), 900000000);
    for (const value of [0, -1, Infinity, NaN]) {
        f.property('duration', value);
        assert.equal(f.player.getIntroSkipDurationTicks(), null);
    }
    f.acknowledge(); await flush();
});

test('latest seek association is bounded and reversed acknowledgements keep their own sequence', async () => {
    const f = fixture(); await f.play();
    f.player.currentTime(0, {origin: 'remote-playstate'});
    f.player.rewind(250);
    assert.deepEqual(Array.from(f.command()), ['seek', '-0.25', 'relative']);
    f.acknowledge(1); await flush(); f.acknowledge(); await flush();
    const accepted = f.records.filter(row => row.event === 'seek-command-accepted').map(row => row.details.seek);
    assert.deepEqual(accepted.map(row => row.sequence), [2, 1]);
    f.property('playback-restart', 3);
    const result = f.log('seek').details;
    assert.equal(result.seekAssociation, 'latest-submission-only');
    assert.equal(result.latestSubmittedSeek.sequence, 2);
    assert.equal(result.latestSubmittedSeek.seekOrigin, 'relative-control');
    assert.equal(result.latestSubmittedSeek.requestedSeconds, -0.25);
    assert.equal(result.observedPositionSeconds, 3);
    assert.equal(f.player.currentTime(), 3000);
});

test('retired command responses cannot attach diagnostics to a new play; rejected commands retain only safe facts', async () => {
    const f = fixture(); await f.play();
    f.player.currentTime(5000); await f.play();
    f.acknowledge(); await flush();
    assert.equal(f.records.some(row => row.event === 'seek-command-accepted'), false);
    f.failSeek(); f.player.currentTime(10000, {origin: 'UNKNOWN_PRIVATE_CANARY'}); await flush();
    const failed = diagnostics.sanitizeRecord(f.log('seek-command-failed'));
    assert.equal(failed.details.seek.sequence, 1);
    assert.equal(failed.details.seek.submissionStatus, 'failed');
    assert.equal(failed.details.seek.seekOrigin, 'unspecified');
    assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_CANARY/);
});

test('load diagnostics describe planned start and metadata without reordering loadfile or start property writes', async () => {
    const f = fixture(); await f.play({playerStartPositionTicks: 123456789});
    const load = f.log('loadfile-requested').details;
    assert.equal(load.requestedStartSeconds, 12.3456789);
    assert.equal(load.plannedStartSeconds, 12);
    assert.equal(load.startOptionWriteOrder, 'after-loadfile-submission');
    assert.equal(load.nativeGenerationId, f.generation());
    assert.equal(load.cached.durationCurrentGeneration, null);
    const loadIndex = f.operations.findIndex(row => row.operation === 'command' && row.payload.data[0] === 'loadfile');
    const startIndex = f.operations.findIndex(row => row.operation === 'set-properties' && row.payload.entries.some(entry => entry.name === 'start'));
    assert.ok(startIndex > loadIndex);
    assert.equal(f.operations[startIndex].payload.entries.find(entry => entry.name === 'start').value, '12');
});

test('intro rejection diagnostics project only safe scalars and remain fail-open without seeking', async () => {
    const f = fixture(); await f.play();
    const before = f.operations.length;
    let getterCalls = 0;
    const context = {origin: 'intro-button', introEndTicks: 1250000000, introDurationTicks: 1200000000,
        introDurationSource: 'native-current', introEndSource: 'next-chapter', introOwnerMatches: true,
        introClickOwnerMatches: false, disposition: 'rejected-target', url: 'INTRO_PRIVATE_CANARY', percent: Infinity};
    Object.defineProperty(context, 'introStartTicks', {get() { getterCalls++; throw Error('GETTER_PRIVATE_CANARY'); }});
    f.player.reportIntroSkipDiagnostic(context);
    const log = diagnostics.sanitizeRecord(f.log('intro-skip'));
    assert.equal(log.details.intro.seekOrigin, 'intro-button');
    assert.equal(log.details.disposition, 'rejected-target');
    assert.equal(log.details.intro.introDurationSource, 'native-current');
    assert.equal(log.details.intro.percent, null);
    assert.equal(log.details.intro.introStartTicks, null);
    assert.equal(getterCalls, 0);
    assert.doesNotMatch(JSON.stringify(log), /PRIVATE_CANARY/);
    assert.equal(f.operations.length, before);
    f.throwLog();
    assert.doesNotThrow(() => f.player.reportIntroSkipDiagnostic(context));
    assert.doesNotThrow(() => f.player.currentTime(1000, new Proxy({}, {getOwnPropertyDescriptor() { throw Error('private'); }})));
    assert.deepEqual(Array.from(f.command()), ['seek', '1', 'absolute', 'exact']);
    f.acknowledge(); await flush();
});
