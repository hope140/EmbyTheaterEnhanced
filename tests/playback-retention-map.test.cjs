'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fixtures = require('./fixtures/retention-core-map-v1.json');
const mapping = require('../tools/playback-retention-map.cjs');

function sample(name) {const row = fixtures.cases.find(value => value.case === name); assert(row, `fixture ${name}`); return structuredClone(row);}
function reject(report, clip, id = report['export-id']) {
    assert.throws(() => mapping.verify(report, clip, id), /retention-export-map-unavailable/);
}
function anchorPacket(report, clip, streamType, end = 'first') {
    const stream = report.streams.find(row => row.type === streamType), anchor = stream[end];
    return clip.packets.find(packet => packet.stream_index === stream['mux-index'] &&
        packet.data_hash.toLowerCase() === 'sha256:' + anchor.sha256);
}

test('real synthetic core receipt distinguishes unusable raw AVI/B-frame anchors from verified NUT/MP4 maps', () => {
    const names = fixtures.cases.map(row => row.case);
    assert.deepEqual(names, ['raw-avi-rejected', 'bframe-nut-rejected', 'raw-nut', 'bframe-mp4']);
    for (const row of fixtures.cases) {
        if (!row.expected) {reject(row.report, row.clip); continue;}
        const result = mapping.verify(row.report, row.clip, row.report['export-id']);
        assert.equal(result.serializedClipMapVerified, true); assert.equal(result.exportId, 1);
        assert(Number.isFinite(result.sourceMinusClipSeconds)); assert(result.quantizationBoundSeconds > 0);
        assert(Number.isFinite(result.sourceAnchorStartSeconds)); assert(result.sourceAnchorEndSeconds > result.sourceAnchorStartSeconds);
        assert.equal(result.observedContainerShiftSeconds, 0);
        assert.match(result.scope, /NOT-device-gaplessness/);
        const expectedOffset = row.case === 'raw-nut' ? 2.2826666666666666 : 1.984;
        assert(Math.abs(result.sourceMinusClipSeconds - expectedOffset) < 1e-8);
    }
});

test('export id, terminal state and all write/trailer/close outcomes are mandatory', () => {
    const {report, clip} = sample('raw-nut');
    reject(report, clip, report['export-id'] + 1);
    for (const [key, value] of [['complete', false], ['io-ok', false], ['internal-affine-map-known', false],
        ['serialized-clip-map-verified', true], ['ranges', 2], ['segments', 2], ['input-error', true],
        ['packet-error', 1], ['trailer-error', 1], ['close-error', 1]]) {
        const bad = structuredClone(report); bad[key] = value; reject(bad, clip);
    }
    for (const key of ['schema', 'export-id', 'complete', 'io-ok', 'base-ts', 'rebase-ts', 'ts-offset', 'streams']) {
        const bad = structuredClone(report); delete bad[key]; reject(bad, clip);
    }
});

test('required anchors and bounded schemas reject missing values, NaN/Infinity, and invalid timestamps', () => {
    const base = sample('bframe-mp4');
    const cases = [
        r => {delete r.streams[0].first;}, r => {delete r.streams[1].last['input-pts'];},
        r => {r['base-ts'] = NaN;}, r => {r['rebase-ts'] = Infinity;}, r => {r['ts-offset'] = '0';},
        r => {r.streams[0].first['input-pts'] = NaN;}, r => {r.streams[0].last['input-dts'] = Infinity;},
        r => {r.streams[1].first.bytes = 0;}, r => {r.streams[1].first.sha256 = 'not-a-fingerprint';},
        r => {r.streams[0].first['mux-pts'] = Number.MAX_SAFE_INTEGER + 1;}
    ];
    for (const mutate of cases) {const bad = structuredClone(base.report); mutate(bad); reject(bad, base.clip);}
    for (const timebase of ['0/600', '1/0', '1/2147483648', 'not-a-rational', '2/1']) {
        const bad = structuredClone(base.clip); bad.streams[0].time_base = timebase; reject(base.report, bad);
    }
});

test('stream identity, codec, timebase, and clip packet association must agree', () => {
    const base = sample('raw-nut');
    const cases = [
        [r => {r.streams[0]['mux-index'] = 8;}, c => {}],
        [r => {r.streams[0]['mux-index'] = r.streams[1]['mux-index'];}, c => {}],
        [r => {r.streams[0]['source-index'] = r.streams[1]['source-index'];}, c => {}],
        [r => {r.streams[0]['codec-id'] = 999;}, c => {}],
        [r => {r.streams[0].type = 'audio';}, c => {}],
        [r => {r.streams[0]['timebase-den'] = 0;}, c => {}],
        [r => {r.streams[0]['timebase-num'] = Number.MAX_SAFE_INTEGER;}, c => {}],
        [r => {}, c => {c.streams[0].index = 7;}],
        [r => {}, c => {c.streams[0].codec_type = 'audio';}]
    ];
    for (const [mutateReport, mutateClip] of cases) {
        const report = structuredClone(base.report), clip = structuredClone(base.clip); mutateReport(report); mutateClip(clip); reject(report, clip);
    }
});

test('first and last packet fingerprints must uniquely bind payload bytes and size', () => {
    const base = sample('bframe-mp4');
    const changed = structuredClone(base.clip), first = anchorPacket(base.report, changed, 'video', 'first');
    first.data_hash = 'SHA256:' + 'f'.repeat(64); reject(base.report, changed);
    const duplicated = structuredClone(base.clip), packet = anchorPacket(base.report, duplicated, 'video', 'first');
    duplicated.packets.push({...packet}); reject(base.report, duplicated);
    const wrongSize = structuredClone(base.clip), sized = anchorPacket(base.report, wrongSize, 'audio', 'last');
    sized.size = String(Number(sized.size) + 1); reject(base.report, wrongSize);
});

test('PTS and DTS each obey the native affine map and serialized container shift', () => {
    const base = sample('bframe-mp4');
    const badMuxPts = structuredClone(base.report); badMuxPts.streams[0].first['mux-pts'] += 500;
    reject(badMuxPts, base.clip);
    const badMuxDts = structuredClone(base.report); badMuxDts.streams[0].first['mux-dts'] += 500;
    reject(badMuxDts, base.clip);
    const droppedDts = structuredClone(base.clip), firstVideo = droppedDts.packets.find(packet => packet.stream_index === 0);
    delete firstVideo.dts; reject(base.report, droppedDts);
    const missingCompleteness = structuredClone(base.report); missingCompleteness.streams[0]['dts-complete'] = false;
    reject(missingCompleteness, base.clip);
    const contradictory = structuredClone(base.clip), p = anchorPacket(base.report, contradictory, 'video', 'first');
    p.dts = p.pts; reject(base.report, contradictory);
});

test('nonconstant serialized container shift and duplicate timestamp anchors are unmappable', () => {
    const base = sample('raw-nut'), changedShift = structuredClone(base.clip), last = anchorPacket(base.report, changedShift, 'video', 'last');
    last.pts += 1000; reject(base.report, changedShift);
    const duplicateTimes = structuredClone(base.report); duplicateTimes.streams[0].last['input-pts'] = duplicateTimes.streams[0].first['input-pts'];
    reject(duplicateTimes, base.clip);
    const divergentStreams = structuredClone(base.report); divergentStreams.streams[1].last['input-pts'] += 0.25;
    reject(divergentStreams, base.clip);
});

test('export identity is the bounded anchor receipt, never a whole-source hash lookup contract', () => {
    const base = sample('raw-nut');
    assert.equal(Object.hasOwn(base.report, 'sourceSha256'), false);
    assert.equal(Object.hasOwn(base.report, 'sourceUrl'), false);
    const result = mapping.verify(base.report, base.clip, 1);
    assert.equal(Object.hasOwn(result, 'sourceSha256'), false);
    assert.equal(Object.hasOwn(result, 'sourceUrl'), false);
    assert.deepEqual(Object.keys(result).sort(), ['exportId', 'observedContainerShiftSeconds', 'quantizationBoundSeconds',
        'schema', 'scope', 'serializedClipMapVerified', 'sourceAnchorEndSeconds', 'sourceAnchorStartSeconds', 'sourceMinusClipSeconds'].sort());
});
test('schema v1 rejects unexpected report/stream/anchor fields and out-of-range native integers', () => {
    const base = sample('raw-nut');
    for (const mutate of [r => {r.sourceUrl = 'unexpected';}, r => {r.streams[0].path = 'unexpected';}, r => {r.streams[0].first.token = 'unexpected';},
        r => {r.streams[0]['timebase-num'] = 2147483648;}, r => {r.streams[0]['timebase-den'] = 2147483648;}, r => {r.streams[0].packets = 32769;}]) {
        const bad = structuredClone(base.report);mutate(bad);reject(bad, base.clip);
    }
});
test('complete sequence digest rejects middle packet time, payload, order, flags and loss even when endpoint anchors match', () => {
    const base = sample('raw-nut');
    for (const mutate of [clip => {const p = clip.packets.filter(p => p.stream_index === 0)[10];p.pts += 600;p.dts += 600;},
        clip => {clip.packets.filter(p => p.stream_index === 0)[10].data_hash = 'SHA256:' + 'f'.repeat(64);},
        clip => {const indexes = clip.packets.map((p,i) => p.stream_index === 0 ? i : -1).filter(i => i >= 0);[clip.packets[indexes[10]],clip.packets[indexes[11]]] = [clip.packets[indexes[11]],clip.packets[indexes[10]]];},
        clip => {clip.packets.filter(p => p.stream_index === 0)[10].flags = '__';},
        clip => {clip.packets.splice(clip.packets.indexOf(clip.packets.filter(p => p.stream_index === 0)[10]),1); }]) {
        const bad = structuredClone(base.clip);mutate(bad);reject(base.report,bad);
    }
});
test('unknown source packing, changed decoded geometry, channels and codec configuration fail closed', () => {
    const base = sample('raw-nut');
    for (const mutate of [r => {r.streams[0]['source-params-known'] = false;}, r => {r.streams[0]['source-pixel-format'] = '';},
        r => {r.streams[0]['source-width']++;}, r => {r.streams[0]['source-height']++;}, r => {r.streams[1]['source-channels']++;},
        r => {r.streams[1]['source-sample-rate']++;}, r => {r.streams[0]['source-extradata-sha256'] = 'f'.repeat(64);}]) {
        const bad=structuredClone(base.report);mutate(bad);reject(bad,base.clip);
    }
    const compressed=sample('bframe-mp4'), bad=structuredClone(compressed.clip);bad.streams[0].extradata_hash='SHA256:'+'f'.repeat(64);reject(compressed.report,bad);
});
test('published native vectors and summary bind the current source patch, lock and recipe without a production-DLL identity claim', () => {
    const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'..');
    const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
    const lock=require('../native/experiments/buffer-retention/linux-input-lock.json'), summary=require('../native/experiments/buffer-retention/linux-result-v1.json');
    assert.equal(fixtures.buildReceipt.inputLockSha256,hash('native/experiments/buffer-retention/linux-input-lock.json'));
    assert.equal(fixtures.buildReceipt.patchSha256,hash('native/experiments/buffer-retention/mpv-dd5d17d-export-map.patch'));
    assert.equal(fixtures.buildReceipt.buildRecipeSha256,hash('tools/experiments/build-retention-core.py'));
    assert.equal(fixtures.buildReceipt.mpvCommit,lock.mpv.commit);assert.deepEqual(summary.buildReceipt,fixtures.buildReceipt);
    assert.equal(fixtures.buildReceipt.productionEquivalent,false);
    assert.notEqual(fixtures.buildReceipt.librarySha256,require('../vendor/libmpv-input-manifest.json').files[0].sha256);
});
