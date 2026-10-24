'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const edl = require('../tools/playback-buffer-edl-probe.cjs');
function range() {return edl.span({sourceStartSeconds: 17 / 24, sourceEndExclusiveSeconds: 41 / 24},
    {commonMappingWithinOneSample: true, sourceStartSeconds: 17 / 24, sourceEndSeconds: 41 / 24}, 599 / 600);}
test('EDL cuts on an existing complete source frame before remux EOF rounding', () => {
    const r = range(); assert.equal(r.start, 17 / 24); assert.equal(r.end, 40 / 24); assert(r.resume > r.start && r.resume < r.end); assert.equal(r.total, 8);
    assert.throws(() => edl.span({sourceStartSeconds: 1, sourceEndExclusiveSeconds: 2}, {commonMappingWithinOneSample: false}, 1), /export-edl-input/);
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
