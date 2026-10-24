'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const av = require('../tools/playback-buffer-av-fixture.cjs'), probe = require('../tools/playback-buffer-export-probe.cjs');
test('bounded synthetic AVI contains unique video frames and exactly8sec mono48kPCM', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-av-fixture-test-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const file = path.join(root, 'A.avi'), proof = av.fixture(file), data = av.inspect(file);
    assert.equal(proof.size, 33955148); assert(proof.size < probe.MAX_FILE);
    assert.equal(data.video.packets.length, 192); assert.equal(new Set(data.video.packets.map(p => p.sha256)).size, 192);
    assert.equal(data.audio.samples, 384000); assert.equal(data.audio.localStart, 0);
    const raw = fs.readFileSync(file), audioHeader = raw.indexOf(Buffer.from('auds'));
    const damaged = Buffer.from(raw); damaged.writeUInt32LE(44100, audioHeader + 24); fs.writeFileSync(file, damaged);
    assert.throws(() => av.inspect(file), /export-av-format/);
});
function sample() {
    const pcm = Buffer.alloc(48000 * 2);
    for (let n = 0; n < 48000; n++) pcm.writeUInt16LE((Math.imul(n, 31415927) ^ n >>> 5) & 65535, n * 2);
    const source = {audio: {pcm}}, clip = {audio: {pcm: pcm.subarray(12000 * 2, 24000 * 2), samples: 12000, localStart: 0}, videoLocalStart: 0};
    const video = {sourceStartSeconds: .25, sourceEndExclusiveSeconds: .5}; return {source, clip, video};
}
test('audio mapping uses exact sample sequence and a shared offset with video', () => {
    const {source, clip, video} = sample(), result = av.audioMapping(source, clip, video);
    assert.equal(result.sourceStartSeconds, .25); assert.equal(result.sourceEndSeconds, .5);
    assert.equal(result.offsetDeltaSeconds, 0); assert.equal(result.commonMappingWithinOneSample, true);
    assert.equal(av.localPosition(video, result, .375), .125);
    for (const outside of [.249, .5, .6, NaN]) assert.equal(av.localPosition(video, result, outside), null);
    assert.equal(av.localPosition(video, null, .375), null); assert.equal(av.localPosition(null, result, .375), null);
    assert.equal(av.localPosition(video, {...result, sourceMinusLocalSeconds: undefined}, .375), null);
});
test('audio timestamp mismatch, changed samples and ambiguous repeats never become common resume mapping', () => {
    const {source, clip, video} = sample();
    const shifted = {...clip, audio: {...clip.audio, pcm: source.audio.pcm.subarray(12002 * 2, 24002 * 2)}};
    const mismatch = av.audioMapping(source, shifted, video); assert.equal(mismatch.commonMappingWithinOneSample, false);
    assert.equal(av.localPosition(video, mismatch, .375), null);
    const damaged = Buffer.from(clip.audio.pcm); damaged[1024] ^= 1;
    assert.throws(() => av.audioMapping(source, {...clip, audio: {...clip.audio, pcm: damaged}}, video), /export-av-audio-mapping/);
    assert.throws(() => av.audioMapping({audio: {pcm: Buffer.alloc(2000)}}, {...clip, audio: {pcm: Buffer.alloc(1000), localStart: 0, samples: 500}}, video), /export-av-audio-mapping/);
});
test('headless audio probe uses only null output and leaves normal video probe options unchanged', () => {
    assert.equal(probe.optionsFor('av').ao, 'null'); assert.equal(Object.hasOwn(probe.optionsFor('video'), 'ao'), false);
    assert(probe.optionMatches('ao', ['null'], 'null')); assert(probe.optionMatches('ao', 'null', 'null'));
    const native = [{name: 'null', enabled: true, params: {}}];
    const oldMatcher = value => value === 'null' || Array.isArray(value) && value.length === 1 && value[0] === 'null';
    assert.equal(oldMatcher(native), false, 'fixed get_obj_settings_list contract reproduces old comparison failure');
    assert(probe.optionMatches('ao', JSON.parse(JSON.stringify(native)), 'null'));
    for (const value of [[{name: 'null', enabled: false, params: {}}], [{name: 'null', enabled: true, params: {unknown: 'private-canary'}}],
        [{name: 'null', enabled: true, params: {}, label: 'private-canary'}], [...native, {name: 'wasapi', enabled: true, params: {}}]]) assert.equal(probe.optionMatches('ao', value, 'null'), false);
    for (const value of [['wasapi'], ['null', 'wasapi'], [], 'auto']) assert.equal(probe.optionMatches('ao', value, 'null'), false);
    assert.throws(() => probe.optionsFor('unconfirmed'), /export-input-invalid/);
});
test('option application distinguishes actual setter error, getter failure and typed readback mismatch', async () => {
    const response = [{name: 'null', enabled: true, params: {}}], calls = [], report = {};
    const client = {currentGenerationId: 7, operationErrors: [], setProperty(name, value) {calls.push(['set', name, value]);}, async getProperty(name) {calls.push(['get', name]); return response;}};
    assert.deepEqual(await probe.applyOption(client, 'ao', 'null', report, () => {}), response);
    assert.deepEqual(calls, [['set', 'ao', 'null'], ['get', 'ao']]); assert.equal(report.optionStatus.phase, 'confirmed'); assert.equal(report.optionStatus.actualType, 'object-list');
    const failed = {...client, operationErrors: [], async getProperty() {this.operationErrors.push({generationId: 7, operation: 'set-property', property: 'ao', errorCode: -8, error: 'private-canary'}); return response;}};
    await assert.rejects(probe.applyOption(failed, 'ao', 'null', report, () => {}), /export-option-set-failed/);
    assert.equal(report.optionStatus.phase, 'set-property'); assert.equal(report.optionStatus.mpvErrorCode, -8);
    const getter = {...client, operationErrors: [], async getProperty() {throw Error('property-unavailable');}};
    await assert.rejects(probe.applyOption(getter, 'ao', 'null', report, () => {}), /export-option-get-failed/);
    assert.equal(report.optionStatus.phase, 'get-property'); assert.equal(report.optionStatus.requestCode, 'property-unavailable');
    const mismatch = {...client, operationErrors: [], async getProperty() {return [{name: 'private-canary', enabled: true, params: {}}];}};
    await assert.rejects(probe.applyOption(mismatch, 'ao', 'null', report, () => {}), /export-option-readback-mismatch/);
    assert.equal(report.optionStatus.phase, 'readback-validation'); assert.equal(report.optionStatus.mpvErrorCode, null);
    assert(!JSON.stringify(report).includes('private-canary'));
});
test('option diagnostics keep fixed phases and numeric mpv codes without raw native errors or values', () => {
    const projected = probe.projectOptionStatus({name: 'ao', phase: 'set-property', actualType: 'object-list', entries: 1, mpvErrorCode: -8,
        requestCode: 'property-unavailable', matches: false, error: '/private-canary', raw: 'https://private.invalid'});
    assert.equal(projected.mpvErrorCode, -8); assert(!JSON.stringify(projected).includes('private'));
    const unknown = probe.projectOptionStatus({name: '/private-canary', phase: 'private-canary', mpvErrorCode: '/private-canary', requestCode: 'private-canary'});
    assert.equal(unknown.name, 'unavailable'); assert.equal(unknown.phase, 'unavailable'); assert.equal(unknown.mpvErrorCode, null); assert.equal(unknown.requestCode, null);
});
test('AV short scope stays on retention branch with no release staging or automatic invocation', () => {
    const route = require('../tools/ci-playback-range-smoke.cjs');
    route.validateDispatch('buffer-export-av', 'a'.repeat(40), route.PIN.repository, 'false', 'refs/heads/experiment/playback-buffer-retention');
    for (const ref of ['refs/heads/main', 'refs/heads/feature/playback-range-cache']) assert.throws(() => route.validateDispatch('buffer-export-av', 'a'.repeat(40), route.PIN.repository, 'false', ref));
    assert.throws(() => route.validateDispatch('buffer-export-av', 'a'.repeat(40), route.PIN.repository, 'true', 'refs/heads/experiment/playback-buffer-retention'));
});
