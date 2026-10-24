'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const probe = require('../tools/playback-buffer-export-probe.cjs');
const ci = require('../tools/ci-mpv-buffer-export.cjs');
const route = require('../tools/ci-playback-range-smoke.cjs');
function root(t) {const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-export-test-'))); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir;}
function media(packets = 32) {return {fps: 24, slots: packets, emptyPackets: 0, packets: Array.from({length: packets}, (_, n) => ({sha256: String(n), slot: n}))};}
test('marked synthetic AVI has192 unique raw payloads and unchanged fixed input dimensions', t => {
    const dir = root(t), file = path.join(dir, 'A.avi'), proof = probe.markedFixture(file), parsed = probe.aviPackets(file);
    assert.equal(proof.size, 33182440); assert.equal(proof.sha256, require('../tools/playback-range-windows-smoke.cjs').hashFile(file));
    assert.equal(parsed.packets.length, 192); assert.equal(new Set(parsed.packets.map(p => p.sha256)).size, 192);
    assert.deepEqual([parsed.width, parsed.height, parsed.fps], [320, 180, 24]);
});
test('bounded RIFF reader rejects malformed chunk boundaries, wrong container, oversized files and links', t => {
    const dir = root(t), real = path.join(dir, 'real'); fs.mkdirSync(real);
    const file = path.join(real, 'A.avi'); require('../tools/playback-range-windows-smoke.cjs').avi(file, 'A', 24);
    const good = fs.readFileSync(file);
    for (const offset of [0, 8, 16]) {
        const damaged = Buffer.from(good); damaged.fill(255, offset, offset + 4); fs.writeFileSync(file, damaged);
        assert.throws(() => probe.aviPackets(file), /export-avi/);
    }
    fs.writeFileSync(file, good); const alias = path.join(dir, 'alias'); fs.symlinkSync(real, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => probe.aviPackets(path.join(alias, 'A.avi')), /nonphysical/);
    fs.truncateSync(file, probe.MAX_FILE + 1); assert.throws(() => probe.aviPackets(file), /export-file-limit/);
});
test('mapping follows exact payload sequence and preserves source frame identity rather than raw offsets', () => {
    const source = media(96), clip = {...media(24), packets: source.packets.slice(24, 48).map((p, slot) => ({...p, slot}))};
    const result = probe.mapping(source, clip);
    assert.equal(result.firstSourceFrame, 24); assert.equal(result.lastSourceFrame, 47);
    assert.equal(result.sourceStartSeconds, 1); assert.equal(result.sourceEndExclusiveSeconds, 2);
    assert.equal(result.originalRangeBytesReusable, false); assert.equal(result.generalContainerTimelineAssessed, false);
    for (const mutation of [p => p.packets.splice(2, 1), p => p.packets[0] = {sha256: 'unknown'}, p => p.fps = 25]) {
        const bad = structuredClone(clip); mutation(bad); assert.throws(() => probe.mapping(source, bad), /export-mapping-invalid/);
    }
    assert.throws(() => probe.mapping({...source, packets: [...source.packets, source.packets[0]]}, clip), /export-mapping-invalid/);
});
test('AVI600Hz empty timing slots are mapped explicitly and misplaced gaps remain invalid', () => {
    const source = media(96), clip = {fps: 600, slots: 600, emptyPackets: 576,
        packets: source.packets.slice(24, 48).map((p, n) => ({...p, slot: n * 25}))};
    const mapped = probe.mapping(source, clip);
    assert.equal(mapped.firstSourceFrame, 24); assert.equal(mapped.containerTicksPerSecond, 600);
    assert.equal(mapped.emptyVideoSlots, 576); assert.equal(mapped.containerSlots, 600);
    for (const change of [p => p.packets[2].slot += 25, p => p.packets[0].slot = 1,
        p => p.slots = probe.MAX_SLOTS + 1, p => p.emptyPackets = 0, p => p.packets[3].sha256 = 'wrong']) {
        const bad = structuredClone(clip); change(bad); assert.throws(() => probe.mapping(source, bad), /export-mapping-invalid/);
    }
});
test('RIFF empty video chunks retain timing slots while a short nonempty packet has safe numeric diagnostics', t => {
    const dir = root(t), source = path.join(dir, 'source.avi'), file = path.join(dir, 'clip.avi');
    const support = require('../tools/playback-range-windows-smoke.cjs'); support.avi(source, 'A', 24);
    const raw = fs.readFileSync(source), parsed = probe.aviPackets(source), movi = raw.indexOf(Buffer.from('movi'));
    const prefix = Buffer.from(raw.subarray(0, movi + 4));
    const chunks = [], indexRows = []; let offset = 4;
    function append(body) {
        const header = Buffer.alloc(8); header.write('00db'); header.writeUInt32LE(body.length, 4); chunks.push(header, body);
        const index = Buffer.alloc(16); index.write('00db'); index.writeUInt32LE(body.length ? 16 : 0, 4); index.writeUInt32LE(offset, 8); index.writeUInt32LE(body.length, 12);
        indexRows.push(index); offset += 8 + body.length;
    }
    for (const packet of parsed.packets.slice(4, 20)) {
        append(raw.subarray(packet.offset, packet.offset + packet.bytes));
        for (let n = 0; n < 24; n++) append(Buffer.alloc(0));
    }
    const avih = raw.indexOf(Buffer.from('avih')) + 8, strh = raw.indexOf(Buffer.from('strh')) + 8;
    prefix.writeUInt32LE(Math.round(1e6 / 600), avih); prefix.writeUInt32LE(400, avih + 16);
    prefix.writeUInt32LE(600, strh + 24); prefix.writeUInt32LE(400, strh + 32);
    const movie = Buffer.concat(chunks), indices = Buffer.concat(indexRows), idx = Buffer.alloc(8); idx.write('idx1'); idx.writeUInt32LE(indices.length, 4);
    prefix.writeUInt32LE(4 + movie.length, movi - 4);
    const result = Buffer.concat([prefix, movie, idx, indices]); result.writeUInt32LE(result.length - 8, 4); fs.writeFileSync(file, result);
    const actual = probe.aviPackets(file); assert.equal(actual.packets.length, 16); assert.equal(actual.emptyPackets, 384); assert.equal(actual.slots, 400); assert.equal(actual.fps, 600);
    const broken = Buffer.from(result); broken.writeUInt32LE(172799, movi + 8); fs.writeFileSync(file, broken);
    let caught; try {probe.aviPackets(file);} catch (error) {caught = error;}
    assert.equal(caught.message, 'export-packets-invalid');
    const safe = probe.safeFailure(caught, 'export-inspect');
    assert.equal(safe.format.reason, 'packet-size'); assert.equal(safe.format.actualBytes, 172799); assert.equal(safe.format.expectedBytes, 172800);
    assert(!JSON.stringify(safe).includes(dir));
});
test('finite window stays inside one existing range and refuses gaps, unknowns or insufficient packets', () => {
    const selected = probe.chooseWindow({'seekable-ranges': [{start: 1.01, end: 2.5}]});
    assert(selected.start > 1.01 && selected.end < 2.5 && selected.end - selected.start <= 1 + 1e-9);
    for (const ranges of [[], [{start: 1, end: 1.1}], [{start: 1, end: 2}, {start: 3, end: 4}], [{start: NaN, end: 2}], [{start: -1, end: 2}], [{start: 7.5, end: 10}]]) {
        assert.throws(() => probe.chooseWindow({'seekable-ranges': ranges}), /export-window-unavailable/);
    }
});
test('new requests and late scheduled source bytes invalidate export even if no response finishes', () => {
    const before = {requests: 2, scheduledBytes: 100, completedBytes: 0};
    assert.deepEqual(probe.noExtraSource(before, {...before, completedBytes: 100}), {newRequests: 0, newScheduledSourceBytes: 0, completedBytesDelta: 100});
    for (const after of [{...before, requests: 3}, {...before, scheduledBytes: 101}]) assert.throws(() => probe.noExtraSource(before, after), /export-extra-source-read/);
});
function reportFixture() {
    const identity = {synthetic: true}, plan = {identity, variant: 'video'};
    const exit = {pid: 101, processExited: true, streamsClosed: true, code: 0, signal: null};
    const report = {schema: 1, scope: probe.SCOPE, variant: 'video', status: 'PASS', workerPid: 101, identity,
        helpers: [102, 103].map(pid => ({pid, handshake: {synthetic: true}, exited: true, outcome: 'EXIT_AND_CLOSE_CONFIRMED', options: {...probe.OPTIONS},
            diagnostics: {processExitCode: 0, streamsClosed: true, processSignaled: false, processSignal: null}})),
        checks: {newRequests: 0, newScheduledSourceBytes: 0, clipDecoded: true, unchangedAfterStop: true, unchangedAfterExit: true, unchangedAfterReopen: true},
        mapping: {packetPayloadsIdentical: true, packets: 24, firstSourceFrame: 24, lastSourceFrame: 47, sourceMinusLocalSeconds: 1},
        decoded: {width: 320, height: 180, vo: 'gpu-next'}, clip: {bytes: 1000, sha256: 'a'.repeat(64)}};
    return {report, plan, exit};
}
test('parent acceptance requires two actual exits, stdio close, native decode, bounded mapping and readbacks', () => {
    const good = reportFixture(); probe.validateReport(good.report, good.plan, good.exit);
    for (const mutate of [x => x.exit.code = 1, x => x.exit.streamsClosed = false, x => x.exit.pid++, x => x.report.identity = {},
        x => x.report.helpers[1].pid = x.report.helpers[0].pid, x => x.report.helpers[1].diagnostics.streamsClosed = false,
        x => x.report.helpers[0].options['cache-on-disk'] = true, x => x.report.checks.newRequests = 1,
        x => x.report.checks.unchangedAfterExit = false, x => x.report.mapping.packets = undefined,
        x => x.report.mapping.lastSourceFrame = 999, x => x.report.decoded.width = 1, x => x.report.clip.bytes = probe.MAX_FILE + 1]) {
        const bad = reportFixture(); mutate(bad); assert.throws(() => probe.validateReport(bad.report, bad.plan, bad.exit));
    }
});
test('AV acceptance additionally requires audio decode and a common source/local mapping', () => {
    const {report, plan, exit} = reportFixture(); plan.variant = 'av'; report.variant = 'av';
    for (const h of report.helpers) h.options.ao = ['null'];
    report.checks.audioDecoded = true; report.checks.seekMappingVerified = true; report.checks.clipReachedEOF = true;
    report.audioMapping = {commonMappingWithinOneSample: true};
    probe.validateReport(report, plan, exit);
    report.audioMapping.commonMappingWithinOneSample = false; assert.throws(() => probe.validateReport(report, plan, exit));
    report.audioMapping.commonMappingWithinOneSample = true; report.checks.audioDecoded = false; assert.throws(() => probe.validateReport(report, plan, exit));
    report.checks.audioDecoded = true; report.checks.seekMappingVerified = false; assert.throws(() => probe.validateReport(report, plan, exit));
    report.checks.seekMappingVerified = true; report.checks.clipReachedEOF = false; assert.throws(() => probe.validateReport(report, plan, exit));
});
test('only the isolated retention branch can run export; old branch modes keep their existing boundary', () => {
    route.validateDispatch('buffer-export', 'a'.repeat(40), route.PIN.repository, 'false', 'refs/heads/experiment/playback-buffer-retention');
    for (const ref of ['refs/heads/main', 'refs/heads/feature/playback-range-cache', 'refs/heads/verify/next-episode-auto']) assert.throws(() => route.validateDispatch('buffer-export', 'a'.repeat(40), route.PIN.repository, 'false', ref));
    assert.throws(() => route.validateDispatch('native', 'a'.repeat(40), route.PIN.repository, 'false', 'refs/heads/experiment/playback-buffer-retention'));
    assert.throws(() => route.validateDispatch('buffer-export', 'a'.repeat(40), route.PIN.repository, 'true', 'refs/heads/experiment/playback-buffer-retention'));
});
test('safe early failure projection and logs never publish arbitrary paths, URLs, stderr or extra fields', t => {
    const dir = root(t), file = path.join(dir, 'worker.log');
    fs.writeFileSync(file, 'private stderr canary\nmpv-buffer-export-failure:' + JSON.stringify({stage: 'export', code: 'export-extra-source-read', systemCode: 'EIO', private: '/private-canary'}) + '\n');
    assert.deepEqual(ci.readFailure(file), {stage: 'export', code: 'export-extra-source-read', systemCode: 'EIO'});
    fs.writeFileSync(file, 'mpv-buffer-export-failure:' + JSON.stringify({stage: '/private-canary', code: 'https://secret.invalid', systemCode: 'hidden'}) + '\n');
    assert.deepEqual(ci.readFailure(file), {stage: 'preflight', code: 'unclassified', systemCode: null});
    fs.writeFileSync(file, 'mpv-buffer-export-failure:' + JSON.stringify({stage: 'export-inspect', code: 'export-packets-invalid',
        format: {reason: 'packet-size', actualBytes: 172799, expectedBytes: 172800, rate: 600, scale: 1, path: '/private-canary'}}) + '\n');
    assert.deepEqual(ci.readFailure(file), {stage: 'export-inspect', code: 'export-packets-invalid', systemCode: null,
        format: {reason: 'packet-size', actualBytes: 172799, expectedBytes: 172800, rate: 600, scale: 1}});
});
test('safe collection excludes media/profile/stderr and keeps bounded semantic receipts with hashes', t => {
    const dir = root(t), out = path.join(dir, 'published'), rootPath = path.join(dir, 'buffer-export'), sub = path.join(rootPath, 'probe');
    fs.mkdirSync(out); fs.mkdirSync(sub, {recursive: true});
    fs.writeFileSync(path.join(sub, 'observations.json'), JSON.stringify({stage: 'source-pause', privatePath: path.join(sub, 'profile'), url: 'http://127.0.0.1/private', token: 'private-canary'}));
    fs.writeFileSync(path.join(sub, 'excerpt.avi'), 'do not publish'); fs.writeFileSync(path.join(sub, 'worker.log'), 'private-canary');
    const rows = ci.collect({root: dir, toolsRoot: '/synthetic-tools'}, out);
    assert.equal(rows.length, 1); assert.equal(rows[0].name, 'export-observations.json'); assert.match(rows[0].publishedSha256, /^[a-f0-9]{64}$/);
    const content = fs.readFileSync(path.join(out, rows[0].name), 'utf8'); assert(!content.includes('private-canary')); assert(!content.includes('http://')); assert(!content.includes(dir));
    assert.deepEqual(fs.readdirSync(out), ['export-observations.json']);
});
test('native execution remains explicit and unsupported platforms cannot start helper', async () => {
    await assert.rejects(probe.run('not-read', false), /export-explicit-Windows-required/);
});
test('manual route adds only a scope, without package, permissions, concurrency or native input changes', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8');
    assert.match(workflow, /- buffer-export/); assert.match(workflow, /group: ete-manual-playback-range-smoke/); assert.match(workflow, /cancel-in-progress: false/);
    const source = fs.readFileSync(path.join(__dirname, '../tools/ci-mpv-buffer-export.cjs'), 'utf8');
    assert.match(source, /trial\.derive/); assert.match(source, /support\.entrySmoke/); assert.match(source, /trial\.verifyRuntime/);
    assert.doesNotMatch(source, /gh workflow run|createWorkflowDispatch|release_package=true|prepare-ci-build-inputs|GITHUB_TOKEN:/i);
});
