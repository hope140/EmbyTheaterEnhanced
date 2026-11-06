'use strict';

const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const nativeClient = require('../src/electronapp/native-helper/client');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');

function fixture() {
    const ipc = new EventEmitter(), operations = [], records = [], eventNames = [], pendingSeeks = [];
    const windowEvents = new EventTarget();
    let factory, generation = 0, playSequence = 0, repeatedGeneration = null, failSeek = false, throwLog = false;
    let now = 10000;
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
        AbortController, setTimeout, clearTimeout, Date: class extends Date { static now() { return now; } }, console: {log() {}}
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
        rawEvent: value => ipc.emit(nativeClient.EVENT_CHANNEL, {}, value),
        generation: () => generation,
        repeatGeneration: value => { repeatedGeneration = value; },
        advance: milliseconds => { now += milliseconds; },
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

test('load diagnostics describe the request start applied before loadfile', async () => {
    const f = fixture(); await f.play({playerStartPositionTicks: 123456789});
    const load = f.log('loadfile-requested').details;
    assert.equal(load.requestedStartSeconds, 12.3456789);
    assert.equal(load.plannedStartSeconds, 12);
    assert.equal(load.startOptionWriteOrder, 'before-loadfile-submission');
    assert.equal(load.nativeGenerationId, f.generation());
    assert.equal(load.cached.durationCurrentGeneration, null);
    const loadIndex = f.operations.findIndex(row => row.operation === 'command' && row.payload.data[0] === 'loadfile');
    const startIndex = f.operations.findIndex(row => row.operation === 'set-properties' && row.payload.entries.some(entry => entry.name === 'start'));
    assert.ok(startIndex >= 0 && startIndex < loadIndex);
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

test('cache observations are bounded, include only current playable numbers, and export EOF transitions safely', async t => {
    const f = fixture(); await f.play();
    f.property('duration', 120); f.property('time-pos', 10);
    const operationsBefore = f.operations.length;
    const cache = {'reader-pts': 10, 'cache-end': 25, 'cache-duration': 15,
        'eof-cached': false, eof: false, underrun: false,
        url: 'https://PRIVATE_CANARY.invalid/movie?token=PRIVATE_CANARY', path: 'C:\\PRIVATE_CANARY\\movie'};
    f.property('demuxer-cache-state', cache);
    const first = f.log('cache-observation').details;
    assert.equal(first.cause, 'initial');
    assert.equal(first.positionSeconds, 10);
    assert.equal(first.cacheEndSeconds, 25);
    assert.equal(first.cacheDurationSeconds, 15);
    assert.equal(first.cacheAheadSeconds, 15);
    assert.equal(first.remainingSeconds, 110);
    assert.equal(first.cacheEof, false);
    assert.equal(first.cacheEofPrevious, null);
    for (let index = 0; index < 100; index++) {
        f.advance(100);
        f.property('time-pos', 10 + index / 100);
        f.property('demuxer-cache-state', cache);
    }
    assert.equal(f.records.filter(row => row.event === 'cache-observation').length, 1, 'rapid updates cannot fill the log');
    f.advance(30000);
    f.property('time-pos', 11);
    assert.equal(f.log('cache-observation').details.cause, 'periodic');
    f.advance(5000);
    f.property('demuxer-cache-state', {...cache, 'eof-cached': true, eof: true});
    const eof = f.log('cache-observation').details;
    assert.equal(eof.cause, 'state-change');
    assert.equal(eof.cacheEofPrevious, false);
    assert.equal(eof.cacheEof, true);
    f.property('eof-reached', true);
    assert.equal(f.eventNames.filter(name => name === 'stopped').length, 1);
    assert.equal(f.operations.length, operationsBefore, 'diagnostics add no native command or query');
    const report = diagnostics.buildDiagnosticReport(f.records, {}, new Date('2026-11-03T00:00:00Z'));
    assert.match(report, /cache-observation/);
    assert.doesNotMatch(report, /PRIVATE_CANARY|token=/);
    assert.ok(JSON.stringify(diagnostics.sanitizeRecord(f.log('cache-observation'))).length < 1200);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-cache-diagnostic-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const logger = diagnostics.createLogger(root);
    for (const record of f.records.filter(row => row.event === 'cache-observation')) await logger(record);
    const persisted = await logger.readRecords();
    assert.equal(persisted.records.length, 4);
    assert.equal(persisted.records.at(-1).details.cause, 'terminal');
    assert.doesNotMatch(JSON.stringify(persisted), /PRIVATE_CANARY|token=/);
    assert.doesNotMatch(await logger.exportReport({}), /PRIVATE_CANARY|token=/);
});

test('cache observations mark seek positions unavailable until native restart and reject old playback events', async () => {
    const f = fixture(); await f.play();
    const firstGeneration = f.generation();
    f.property('duration', 120); f.property('time-pos', 10);
    f.property('demuxer-cache-state', {'cache-end': 12, 'cache-duration': 2, 'eof-cached': false, underrun: true});
    assert.equal(f.log('cache-observation').details.cacheAheadSeconds, 2);
    assert.equal(f.log('cache-observation').details.cacheUnderrun, true);
    f.player.currentTime(80000);
    f.advance(6000);
    f.property('time-pos', 11);
    f.property('demuxer-cache-state', {'cache-end': 12, 'cache-duration': 1, 'eof-cached': false, underrun: false});
    const pending = f.log('cache-observation').details;
    assert.equal(pending.positionSeconds, null);
    assert.equal(pending.cacheAheadSeconds, null);
    assert.equal(pending.remainingSeconds, null);
    f.property('playback-restart', 80);
    f.advance(6000);
    f.property('demuxer-cache-state', {'cache-end': 85, 'cache-duration': 5, 'eof-cached': false, underrun: true});
    assert.equal(f.log('cache-observation').details.positionSeconds, 80);
    assert.equal(f.log('cache-observation').details.cacheAheadSeconds, 5);
    const count = f.records.filter(row => row.event === 'cache-observation').length;
    await f.play();
    f.advance(6000);
    f.property('demuxer-cache-state', {'cache-end': 99, 'eof-cached': true}, firstGeneration);
    f.property('time-pos', 12);
    assert.equal(f.records.filter(row => row.event === 'cache-observation').length, count);
    f.property('demuxer-cache-state', {'cache-end': 18, 'eof-cached': false});
    assert.equal(f.log('cache-observation').details.positionSeconds, 12);
    assert.equal(f.log('cache-observation').details.remainingSeconds, null, 'previous media duration is not current');
});

test('cache shortage and native error records omit unavailable transport facts and raw error text', async () => {
    const f = fixture(); await f.play();
    f.property('time-pos', 20);
    f.property('demuxer-cache-state', {'cache-end': 18, 'cache-duration': 0, underrun: true, 'eof-cached': false});
    assert.equal(f.log('cache-observation').details.cacheAheadSeconds, 0);
    f.property('demuxer-cache-state', {'cache-end': 18, 'cache-duration': 0, underrun: true, 'eof-cached': true});
    f.property('eof-reached', true);
    assert.equal(f.log('cache-observation').details.cacheEofPrevious, false, 'terminal EOF flushes a throttled transition');
    const ipcError = {type: 'bridge_error', generationId: f.generation(),
        reason: 'https://PRIVATE_CANARY.invalid/movie?token=PRIVATE_CANARY', endReason: 4, mpvErrorCode: -13,
        httpStatus: 'PRIVATE_CANARY', reconnectOutcome: 'PRIVATE_CANARY'};
    f.rawEvent(ipcError);
    const error = f.log('playback-error');
    assert.equal(error.details.mpvErrorCode, -13);
    assert.equal(error.details.endReason, 4);
    assert.equal(Object.hasOwn(error.details, 'httpStatus'), false);
    assert.equal(Object.hasOwn(error.details, 'readFailureClass'), false);
    assert.equal(Object.hasOwn(error.details, 'reconnectOutcome'), false);
    assert.doesNotMatch(diagnostics.buildDiagnosticReport(f.records, {}), /PRIVATE_CANARY|token=/);
});

for (const [index, expected] of [[0, 1], [null, null], [undefined, null], [3, 2]]) {
    for (const playMethod of ['DirectPlay', 'DirectStream', 'Transcode']) {
        test(`audio preference ${index} preserves container mapping for ${playMethod}`, async () => {
            const f = fixture();
            await f.play({playMethod, mediaSource: {Id: 'synthetic', DefaultAudioStreamIndex: index,
                MediaStreams: [{Type: 'Audio', Index: 0, IsDefault: false},
                    {Type: 'Video', Index: 2}, {Type: 'Audio', Index: 3, IsDefault: true}]}});
            const aids = f.operations.filter(row => row.operation === 'set-properties')
                .flatMap(row => row.payload.entries).filter(entry => entry.name === 'aid');
            assert.deepEqual(aids.map(entry => String(entry.value)),
                playMethod === 'Transcode' || expected === null ? [] : [String(expected)]);
            await f.player.stop();
        });
    }
}

test('explicit stop snapshots the last observed owner before invalidation and carries the cause to destroy IPC', async t => {
    const f = fixture(); await f.play();
    f.property('duration', 120); f.property('time-pos', 23);
    f.property('demuxer-cache-state', {'cache-end': 113, 'cache-duration': 90, underrun: false});
    const generation = f.generation(), before = f.operations.length;
    f.advance(9538);
    const control = {operationId: 'manager-17', controlOrigin: 'remote-playstate', controlReason: 'stop', callSite: 'manager-stop'};
    const stopping = f.player.stop(true, true, control);
    const snapshot = clean(f.log('stop-requested').details);
    assert.equal(snapshot.snapshotMeaning, 'latest-known-at-stop-request');
    assert.equal(snapshot.snapshotAt, 19538);
    assert.equal(snapshot.observedAt.cache, 10000);
    assert.equal(snapshot.cached.positionCurrentGeneration, true);
    assert.equal(snapshot.cached.cacheCurrentGeneration, true);
    assert.equal(snapshot.cached.remainingSeconds, 97);
    assert.equal(snapshot.cached.cacheAheadSeconds, 90);
    assert.equal(snapshot.nativeGenerationId, generation);
    assert.equal(snapshot.control.operationId, 'manager-17');
    assert.equal(snapshot.control.controlOrigin, 'remote-playstate');
    assert.equal(f.log('invalidation-requested').details.cached.cacheCurrentGeneration, true);
    await stopping;
    assert.deepEqual(f.operations.slice(before).map(row => row.operation), ['destroy'], 'no diagnostic native query');
    const payload = clean(f.operations.at(-1).payload.diagnostic);
    assert.deepEqual(payload, snapshot);
    assert.deepEqual(clean(f.log('stop').details.requestedState), snapshot);
    assert.equal(f.eventNames.filter(name => name === 'stopped').length, 1);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-stop-diagnostic-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const logger = diagnostics.createLogger(root);
    for (const row of f.records) await logger(row);
    const report = await logger.exportReport({});
    assert.match(report, /manager-17/);
    assert.match(report, /remote-playstate/);
    assert.match(report, /latest-known-at-stop-request/);
    assert.doesNotMatch(report, /PRIVATE_CANARY/);
});

test('reentrant destroy retains the first physical teardown snapshot and old observations never claim the new owner', async () => {
    const f = fixture(); await f.play();
    const a = f.generation(); f.property('time-pos', 31, a);
    await f.play(); const b = f.generation();
    f.property('demuxer-cache-state', {'cache-end': 90}, a);
    const one = f.player.destroy({operationId: 'manager-1', controlOrigin: 'osd-route', controlReason: 'destroy'});
    const first = f.log('destroy-requested').details;
    assert.equal(first.nativeGenerationId, b);
    assert.equal(first.cached.cacheCurrentGeneration, false);
    assert.equal(first.cached.cacheAheadSeconds, null);
    const two = f.player.destroy({operationId: 'manager-2', controlOrigin: 'unknown'});
    await Promise.all([one, two]);
    const destroys = f.operations.filter(row => row.operation === 'destroy');
    assert.equal(destroys.length, 1);
    assert.equal(destroys[0].payload.diagnostic.control.operationId, 'manager-1');
    assert.equal(f.log('destroy-completed').details.control.operationId, 'manager-1');
});
