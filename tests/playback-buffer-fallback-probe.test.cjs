'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto');
const probe = require('../tools/playback-buffer-fallback-probe.cjs');
function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-fallback-unit-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const write = (name, data) => {fs.writeFileSync(path.join(directory, name), data); return {bytes: Buffer.byteLength(data), sha256: crypto.createHash('sha256').update(data).digest('hex')};};
    write('owner', 'ETE isolated finite buffer export v1\n');
    const source = write('A.avi', 'unit-fixture-NOT-a-real-decoded-video'), clip = write('excerpt.avi', 'owned-excerpt'), descriptor = write('retained.edl', 'owned-edl');
    return {directory, source: 'http://127.0.0.1:12345/Videos/A/stream.avi', clip, descriptor,
        fixture: {file: 'A.avi', size: source.bytes, sha256: source.sha256, etag: '"' + source.sha256 + '"'}, position: 1,
        range: {start: .75, end: 1.75, total: 8, resume: 1}};
}
test('bounded selector keeps original source time for EDL and rejects missing or changed excerpt without changing source', t => {
    const input = fixture(t); const selected = probe.select(input);
    assert.equal(selected.mode, 'retained'); assert.deepEqual(selected.command.slice(2), ['replace', '-1', 'start=1']);
    fs.unlinkSync(path.join(input.directory, 'excerpt.avi'));
    const fallback = probe.select(input); assert.equal(fallback.mode, 'original'); assert.equal(fallback.command[1], input.source);
    assert.equal(fallback.reason, 'excerpt-unavailable-or-changed');
    fs.writeFileSync(path.join(input.directory, 'excerpt.avi'), 'foreign-content'); assert.equal(probe.select(input).mode, 'original');
    assert.equal(fs.readFileSync(path.join(input.directory, 'A.avi'), 'utf8'), 'unit-fixture-NOT-a-real-decoded-video');
});
test('descriptor change and a source position outside excerpt select original; invalid source or ownership blocks any selection', t => {
    const input = fixture(t);
    fs.writeFileSync(path.join(input.directory, 'retained.edl'), 'changed'); assert.equal(probe.select(input).reason, 'descriptor-unavailable-or-changed');
    assert.equal(probe.select({...input, position: input.range.end}).reason, 'outside-retained-range');
    for (const source of [input.source + '?token=synthetic', input.source.replace('127.0.0.1', 'other.invalid'), input.source.replace('http:', 'https:'), input.source.replace('127.0.0.1', 'user:synthetic@127.0.0.1')]) {
        assert.throws(() => probe.select({...input, source}), /export-fallback-input/);
    }
    for (const position of [-1, 8, NaN]) assert.throws(() => probe.select({...input, position}), /export-fallback-input/);
    fs.writeFileSync(path.join(input.directory, 'A.avi'), 'changed'); assert.throws(() => probe.select(input), /export-fallback-input/);
    fs.writeFileSync(path.join(input.directory, 'owner'), 'foreign-owner'); assert.throws(() => probe.select(input), /export-owner-drift/);
});
function fake(input, options = {}) {
    let pause = true, time = 0, current = true, reads = 0; const calls = [];
    const server = {origin: 'http://127.0.0.1:12345', rows: [], snapshot: () => ({resources: {activeResponses: 0, openSockets: 0, openSourceStreams: 0}, all: {pendingOpenCallbacks: 0}})};
    const client = {state: {fileLoaded: false}, timeline: [], currentGenerationId: null, beginGeneration: label => {calls.push(label); client.currentGenerationId = 100; return 100;}, setProperty: (name, value) => {if (name === 'pause') pause = value;},
        load(command) {calls.push(command); return {promise: (async () => {if (options.failLoad) throw Error('synthetic-load-failed'); time = input.position; client.state.fileLoaded = true;
            client.timeline.push({action: 'ACCEPT', name: 'start-file'}); server.rows.push({method: 'GET'}); if (options.cancelAfterLoad) current = false; if (options.supersedeAfterLoad) client.currentGenerationId = 101;})()};},
        async stop() {calls.push('stop'); client.currentGenerationId = null; client.state.fileLoaded = false; if (options.stopHook) await options.stopHook();}};
    return {client, server, calls, directory: input.directory, fixture: input.fixture, previous: {range: input.range, descriptor: input.descriptor}, clip: input.clip,
        async property(name) {if (name === 'pause') {if (options.invalidateOwner) fs.writeFileSync(path.join(input.directory, 'owner'), 'changed-owner');
                if (options.supersedeDuringPause) client.currentGenerationId = 101; return pause;}
            if (name === 'time-pos') {reads++; return options.nanAt === reads ? NaN : pause ? time : (time += .2);}
            if (name === 'duration') return options.nanDuration ? NaN : 8;
            if (name === 'path') return input.source; if (name === 'video-out-params') return {w: 320, h: 180}; if (name === 'audio-out-params') return {samplerate: 48000, 'channel-count': 1};
            if (name === 'current-ao') return 'null'; if (name === 'track-list') return [{type: 'audio', selected: true}, {type: 'video', selected: true}]; throw Error('unknown-unit-property');},
        async until(predicate) {assert.equal(await predicate(), true);}, checkpoint() {}, isCurrent: () => options.cancelBefore ? false : current};
}
test('fallback orchestration uses one fresh generation and original-time source load with separate evidence', async t => {
    const input = fixture(t), context = fake(input), result = await probe.run(context);
    assert(result.decodeAndTimelinePassed); assert.equal(result.startFiles, 1); assert.equal(result.sourceRequests, 1); assert.equal(result.targetSourceSeconds, 1);
    assert.deepEqual(context.calls, ['fallback-original', ['loadfile', input.source, 'replace', '-1', 'start=1'], 'stop']);
    assert.equal(fs.readFileSync(path.join(input.directory, 'excerpt.avi'), 'utf8'), 'owned-excerpt');
});
test('cancel or failed source load never becomes fallback success and started reads are stopped', async t => {
    const input = fixture(t);
    const before = fake(input, {cancelBefore: true}); await assert.rejects(probe.run(before), /export-fallback-cancelled/); assert.deepEqual(before.calls, []);
    for (const options of [{cancelAfterLoad: true}, {failLoad: true}]) {
        const context = fake(input, options); await assert.rejects(probe.run(context)); assert.equal(context.calls.at(-1), 'stop');
        assert.equal(context.calls.filter(Array.isArray).length, 1);
    }
});
test('a replacement generation is never stopped by obsolete fallback cleanup', async t => {
    const context = fake(fixture(t), {supersedeAfterLoad: true});
    await assert.rejects(probe.run(context), /export-fallback-cancelled/);
    assert.equal(context.client.currentGenerationId, 101); assert.equal(context.calls.includes('stop'), false);
});
test('owner change while pause reply is pending prevents source load', async t => {
    const context = fake(fixture(t), {invalidateOwner: true});
    await assert.rejects(probe.run(context), /export-owner-drift/);
    assert.equal(context.calls.filter(Array.isArray).length, 0); assert.equal(context.calls.at(-1), 'stop');
});
test('generation change during a property read prevents all later load/stop effects', async t => {
    const context = fake(fixture(t), {supersedeDuringPause: true});
    await assert.rejects(probe.run(context), /export-fallback-cancelled/);
    assert.equal(context.calls.filter(Array.isArray).length, 0); assert.equal(context.calls.includes('stop'), false);
});
test('nonfinite second landed/duration/advanced observations cannot become decode success', async t => {
    for (const options of [{nanAt: 2}, {nanAt: 4}, {nanDuration: true}]) {
        const context = fake(fixture(t), options); await assert.rejects(probe.run(context), /export-fallback-observation/);
        assert.equal(context.calls.at(-1), 'stop');
    }
});
test('replacement during Stop reply is not observed or waited as an obsolete owned request', async t => {
    let entered, release; const stopped = new Promise(resolve => {entered = resolve;}), gate = new Promise(resolve => {release = resolve;});
    const context = fake(fixture(t), {async stopHook() {entered(); await gate;}});
    const result = probe.run(context); await stopped; context.client.currentGenerationId = 101;
    context.server.snapshot = () => {throw Error('must-not-observe-replacement');}; release();
    await assert.rejects(result, /export-fallback-cancelled/); assert.equal(context.client.currentGenerationId, 101);
    assert.equal(context.calls.filter(x => x === 'stop').length, 1);
});
test('replacement during physical-close polling is rejected without a second Stop', async t => {
    const context = fake(fixture(t)); let snapshots = 0;
    const closed = context.server.snapshot;
    context.server.snapshot = () => {snapshots++; if (snapshots === 1) {context.client.currentGenerationId = 101; return {resources: {activeResponses: 1, openSockets: 1, openSourceStreams: 1}, all: {pendingOpenCallbacks: 1}};} return closed();};
    await assert.rejects(probe.run(context), /export-fallback-cancelled/);
    assert.equal(snapshots, 1); assert.equal(context.calls.filter(x => x === 'stop').length, 1);
});
