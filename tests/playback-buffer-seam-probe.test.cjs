'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const cancel = require('../tools/playback-buffer-cancel-probe.cjs'), pcm = require('../tools/playback-buffer-pcm-probe.cjs'), route = require('../tools/ci-playback-range-smoke.cjs');
const hidden = require('../tools/playback-range-windows-hidden.cjs');
function root(t) {const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-seam-unit-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir;}
test('seam dispatch is explicit, independent, nonrelease and present in actual job condition', () => {
    route.validateDispatch('buffer-export-seam', 'a'.repeat(40), route.PIN.repository, 'false', 'refs/heads/experiment/playback-buffer-retention');
    for (const ref of ['refs/heads/main', 'refs/heads/feature/playback-range-cache']) assert.throws(() => route.validateDispatch('buffer-export-seam', 'a'.repeat(40), route.PIN.repository, 'false', ref));
    assert.throws(() => route.validateDispatch('buffer-export-seam', 'a'.repeat(40), route.PIN.repository, 'true', 'refs/heads/experiment/playback-buffer-retention'));
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8');
    assert(workflow.includes("inputs.range_smoke == 'buffer-export-seam'"));
});
test('cancel receipt rejects missing cases, stale accepted events, old Stop, and wrong retirement state', () => {
    const good = {scope: 'synthetic-held-request-cancel-and-replace', completed: true, cases: ['cancel', 'replace'].map(kind => ({kind, cancelled: true, terminal: 'GENERATION_RETIRED', oldRequestClosed: true,
        lateBytes: 0, obsoleteAcceptedEvents: 0, obsoleteStopRequests: 0, replacementPreserved: true, landedSourceSeconds: 3, advancedSourceSeconds: 3.125}))};
    assert(cancel.valid(good));
    for (const mutate of [r => r.scope = 'other', r => r.cases.pop(), r => r.cases[0].terminal = 'HELPER_DIED', r => r.cases[1].obsoleteAcceptedEvents = 1,
        r => r.cases[1].obsoleteStopRequests = 1, r => r.cases[0].lateBytes = 1, r => r.cases[1].advancedSourceSeconds = NaN]) {const bad = structuredClone(good); mutate(bad); assert.equal(cancel.valid(bad), false);}
});
test('real fixture hold can be reused only after actual old response close', async t => {
    const dir = root(t); fs.writeFileSync(path.join(dir, 'A.avi'), Buffer.alloc(32));
    const server = await hidden.fixtureServer({out: dir, fixtures: [{file: 'A.avi', size: 32, etag: '"owned"'}]});
    t.after(() => server.close());
    for (let n = 0; n < 2; n++) {
        server.hold(() => true); const request = http.get(server.origin + '/Videos/A/stream.avi'); request.on('error', () => {});
        for (let i = 0; !server.held() && i < 100; i++) await new Promise(r => setTimeout(r, 2));
        const held = server.held(); assert(held); assert.throws(() => server.clearClosedHold(), /fixture-held-still-open/);
        request.destroy(); await held.close; held.release(); assert.equal(held.row.bytesScheduled, 0); server.clearClosedHold(); assert.equal(server.held(), null);
    }
});
test('PCM orchestration waits beyond load reply for FILE_LOADED and PCM parameters, then EOF', async t => {
    let paused = false, loaded = false, awaits = 0; const calls = [], dir = root(t);
    const client = {state: {fileLoaded: false}, setProperty(name, value) {assert.equal(name, 'pause'); paused = value;}, load(args) {calls.push(args); return {promise: Promise.resolve()};}};
    const result = await pcm.capture({client, source: 'synthetic-source', output: path.join(dir, 'baseline.wav'), range: {resume: .9, end: 1.7},
        async property(name) {if (name === 'pause') return paused; if (name === 'current-ao') return 'pcm'; if (name === 'audio-out-params') return {samplerate: 48000, 'channel-count': 1}; if (name === 'eof-reached') return loaded; throw Error('unexpected-property');},
        async until(predicate) {awaits++; if (awaits === 1) {assert.equal(await predicate(), false); client.state.fileLoaded = true;} loaded = true; assert.equal(await predicate(), true);}});
    assert(result.reachedEOF); assert.equal(awaits, 2); assert.deepEqual(calls[0].slice(2), ['replace', '-1', 'start=0.9,end=1.95']);
});
test('PCM receipt allows measured discontinuity, rejects contradictory success/format/output', () => {
    const good = {scope: 'fixed-PCM-AO-synthetic-seam-NOT-device-gaplessness', captures: ['baseline.wav', 'seam.wav'].map(file => ({file, bytes: 20000, sha256: 'a'.repeat(64), samples: 9000,
        format: {sampleRate: 48000, channels: 1, bitsPerSample: 16, encoding: 's16le'}, observation: {reachedEOF: true, sampleRate: 48000, channels: 1, output: 'pcm', untimed: true}})), comparison: {ok: false, assessment: 'changed-edl'}};
    assert(pcm.valid(good));
    for (const mutate of [r => r.comparison.ok = true, r => r.comparison.assessment = 'exact-source-samples-through-seam', r => r.captures[0].observation.output = 'wasapi',
        r => r.captures[1].format.channels = 2, r => r.captures[0].observation.sampleRate = 44100, r => r.captures[0].file = 'foreign.wav']) {const bad = structuredClone(good); mutate(bad); assert.equal(pcm.valid(bad), false);}
});
