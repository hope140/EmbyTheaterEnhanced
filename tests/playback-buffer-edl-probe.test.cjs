'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const edl = require('../tools/playback-buffer-edl-probe.cjs');
function range() {return edl.span({sourceStartSeconds: 17 / 24, sourceEndExclusiveSeconds: 41 / 24},
    {commonMappingWithinOneSample: true, sourceStartSeconds: 17 / 24, sourceEndSeconds: 41 / 24}, 599 / 600);}
test('EDL cuts on an existing complete source frame before remux EOF rounding', () => {
    const r = range(); assert.equal(r.start, 17 / 24); assert.equal(r.end, 40 / 24); assert(r.resume > r.start && r.resume < r.end); assert.equal(r.total, 8);
    assert.throws(() => edl.span({sourceStartSeconds: 1, sourceEndExclusiveSeconds: 2}, {commonMappingWithinOneSample: false}, 1), /export-edl-input/);
});
test('chosen EDL seam is half-open and maps frame/sample neighbors without resetting original time', () => {
    const r = range();
    for (const step of [1 / 24, 1 / 48000]) {
        const before = edl.selectSourcePosition(r, r.end - step), after = edl.selectSourcePosition(r, r.end + step);
        assert.equal(before.segment, 'retained'); assert.equal(before.sourceSeconds, r.end - step);
        assert.equal(after.segment, 'original'); assert.equal(after.sourceSeconds, r.end + step);
    }
    assert.equal(edl.selectSourcePosition(r, r.start).localSeconds, 0);
    assert.deepEqual(edl.selectSourcePosition(r, r.end), {segment: 'original', sourceSeconds: r.end});
    assert.equal(edl.selectSourcePosition(r, 8), null); assert.equal(edl.selectSourcePosition(r, NaN), null);
});
test('only owned loopback source is accepted and filenames are byte-length quoted in EDL', () => {
    const source = 'http://127.0.0.1:12345/Videos/A/stream.avi', clip = path.resolve('synthetic,caché;clip.avi'), text = edl.description(source, clip, range());
    assert(text.startsWith('# mpv EDL v0\n!no_chapters\n')); assert(text.includes('%' + Buffer.byteLength(clip) + '%' + clip));
    assert.equal(text.split(source).length - 1, 2);
    for (const url of ['http://other.invalid/Videos/A/stream.avi', source + '?token=synthetic', source + '#fragment', source.replace('http:', 'https:'), 'http://user:synthetic@127.0.0.1:12345/Videos/A/stream.avi']) assert.throws(() => edl.description(url, clip, range()));
    assert.throws(() => edl.description(source, clip + '\n!injected', range()), /export-edl-input/);
});
test('saved byte regions cover actual video and PCM payloads, excluding metadata and unused last frame', () => {
    const source = {video: {fps: 24, packets: Array.from({length: 4}, (_, n) => ({offset: 100 + n * 10, bytes: 8}))},
        audio: {ranges: Array.from({length: 4}, (_, n) => ({offset: 10000 + n * 10000, bytes: 4000, sampleStart: n * 2000}))}};
    assert.deepEqual(edl.savedRanges(source, {start: 1 / 24, end: 3 / 24}), [[110, 118], [120, 128], [20000, 24000], [30000, 34000]]);
});
test('network accounting separates source scheduling, completed responses and duplicate requests', () => {
    const rows = [{method: 'GET', start: 0, bytesScheduled: 100, end: 199, finished: true}, {method: 'GET', start: 50, bytesScheduled: 100, end: 199, finished: false}, {method: 'HEAD', start: 0, bytesScheduled: 0, finished: true}];
    const r = edl.network(rows, [[80, 120]], 200);
    assert.equal(r.scheduledSourceBytes, 200); assert.equal(r.scheduledUniqueSourceBytes, 150); assert.equal(r.completedUniqueSourceBytes, 100);
    assert.equal(r.scheduledSavedPayloadBytes, 40); assert.equal(r.completedSavedPayloadBytes, 20);
    assert.equal(r.scheduledAllSavedPayloadReread, true); assert.equal(r.completedAllSavedPayloadReread, false);
    assert.equal(r.assessment, 'COMPLETED_SAVED_PAYLOAD_REREAD');
    const full = edl.network([{method: 'GET', start: 0, bytesScheduled: 200, finished: true}], [[80, 120]], 200);
    assert(full.completedWholeSourceRead && full.completedAllSavedPayloadReread);
});
test('unserved tails are not counted and uncertain delivery never becomes confirmed reread', () => {
    const r = edl.network([{method: 'GET', start: 0, end: 199, bytesScheduled: 12, finished: false}], [[80, 120]], 200);
    assert.equal(r.assessment, 'NO_SAVED_PAYLOAD_REREAD_OBSERVED');
    const uncertain = edl.network([{method: 'GET', start: 80, bytesScheduled: 40, finished: false}], [[80, 120]], 200);
    assert.equal(uncertain.completedSavedPayloadBytes, 0); assert.equal(uncertain.assessment, 'SCHEDULED_SAVED_PAYLOAD_REREAD_DELIVERY_UNCERTAIN');
    assert.throws(() => edl.network([{method: 'GET', start: 180, bytesScheduled: 40, finished: true}], [[80, 120]], 200), /export-edl-input/);
});
test('EDL scope remains retention-only, nonrelease and does not require a modified core', () => {
    const route = require('../tools/ci-playback-range-smoke.cjs');
    route.validateDispatch('buffer-export-edl', 'a'.repeat(40), route.PIN.repository, 'false', 'refs/heads/experiment/playback-buffer-retention');
    for (const ref of ['refs/heads/main', 'refs/heads/feature/playback-range-cache']) assert.throws(() => route.validateDispatch('buffer-export-edl', 'a'.repeat(40), route.PIN.repository, 'false', ref));
});
function state(overrides = {}) {
    return {resources: {activeResponses: 0, openSockets: 0, openSourceStreams: 0, ...overrides},
        all: {pendingCallbacks: 1, pendingOpenCallbacks: 0, pendingClosedCallbacks: 1},
        history: {pendingClosedCallbacks: 1}, current: {pendingClosedCallbacks: 0}};
}
test('historical missing callback explains old stop failure without inventing its delivery', async () => {
    const current = state(), server = {snapshot: () => JSON.parse(JSON.stringify(current))}; const recorded = [];
    const result = await edl.stopObserved({client: {async stop() {}}, server, firstRequest: 4,
        async until(predicate) {assert.equal(predicate(), false); throw Error('export-stage-timeout');}, checkpoint(value) {recorded.push(value.snapshots.length);}});
    assert.equal(result.legacyWaitTimedOut, true); assert.equal(result.resolution, 'PHYSICAL_CLOSED_CALLBACK_DELIVERY_UNKNOWN');
    assert.equal(edl.validStopObservation(result), true);
    assert.equal(result.snapshots.at(-1).history.pendingClosedCallbacks, 1);
    current.history.pendingClosedCallbacks = 0;
    assert.equal(result.snapshots.at(-1).history.pendingClosedCallbacks, 1, 'snapshots are independent of later observer mutations');
    assert.deepEqual(recorded, [1, 2, 3, 3]);
});
test('stop receipt contradictions and non-timeout failures cannot be converted into success', async () => {
    const server = {snapshot: () => state()};
    await assert.rejects(edl.stopObserved({client: {async stop() {}}, server, firstRequest: 0,
        async until() {throw Error('export-native-deadline');}, checkpoint() {}}), /export-native-deadline/);
    const good = await edl.stopObserved({client: {async stop() {}}, server, firstRequest: 0,
        async until() {throw Error('export-stage-timeout');}, checkpoint() {}});
    for (const alter of [s => s.legacyWaitTimedOut = false, s => s.snapshots.at(-1).label = 'settled',
        s => s.snapshots.at(-1).all.pendingCallbacks = 0, s => s.snapshots.at(-1).all.pendingClosedCallbacks = undefined,
        s => s.snapshots.at(-1).all.pendingOpenCallbacks = 1, s => s.resolution = 'PHYSICAL_AND_CALLBACKS_SETTLED']) {
        const bad = structuredClone(good); alter(bad); assert.equal(edl.validStopObservation(bad), false);
    }
});
test('open response, socket or source file is never excused as callback uncertainty', async () => {
    for (const key of ['activeResponses', 'openSockets', 'openSourceStreams']) {
        const current = state({[key]: 1});
        await assert.rejects(edl.stopObserved({client: {async stop() {}}, server: {snapshot: () => structuredClone(current)}, firstRequest: 0,
            async until() {throw Error('export-stage-timeout');}, checkpoint() {}}), /export-stage-timeout/);
    }
});
