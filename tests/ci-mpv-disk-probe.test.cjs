'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const ci = require('../tools/ci-playback-range-smoke.cjs'), disk = require('../tools/ci-mpv-disk-probe.cjs');
const tool = fs.readFileSync(path.join(__dirname, '../tools/ci-mpv-disk-probe.cjs'), 'utf8');
function root(t) {const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-ci-disk-'))); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir;}
function gates(events) {return {
    async entry() {events.push('entry');},
    async prepare(mode) {events.push('prepare-' + mode);},
    async run(mode) {events.push('run-' + mode); return {status: 'observed', nativeOutcome: 'EXIT_AND_CLOSE_CONFIRMED', processExited: true, streamsClosed: true, pid: 10, code: 0};},
    async verify() {events.push('verify');}
};}
test('four stock-option modes run serially after entry and before final physical input verification', async t => {
    const dir = root(t), events = [], result = await disk.matrix(dir, {synthetic: true}, gates(events));
    assert.deepEqual(events, ['entry', ...disk.MODES.flatMap(mode => ['prepare-' + mode, 'run-' + mode]), 'verify']);
    assert.equal(result.status, 'observed'); assert.equal(result.restoreAssessment, 'NOT_ASSESSED'); assert.equal(result.originalPackageModified, false);
    assert.deepEqual(result.modes.map(row => row.status), ['observed', 'observed', 'observed', 'observed']);
});
for (const failure of ['entry', 'prepare', 'mode', 'closure', 'final-verification']) test('failure records exact progress without starting later modes: ' + failure, async t => {
    const dir = root(t), events = [], actions = gates(events);
    if (failure === 'entry') actions.entry = async () => {events.push('entry'); throw Error('synthetic');};
    if (failure === 'prepare') actions.prepare = async mode => {events.push('prepare-' + mode); throw Error('synthetic');};
    if (failure === 'mode') actions.run = async mode => {events.push('run-' + mode); throw Error('synthetic');};
    if (failure === 'closure') actions.run = async mode => {events.push('run-' + mode); return {status: 'observed', nativeOutcome: 'UNCERTAIN', streamsClosed: false};};
    if (failure === 'final-verification') actions.verify = async () => {throw Error('synthetic');};
    await assert.rejects(disk.matrix(dir, {synthetic: true}, actions), /matrix-not-established/);
    const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json')));
    assert.equal(result.status, 'UNKNOWN'); assert.equal(result.restoreAssessment, 'NOT_ASSESSED');
    if (failure !== 'final-verification') assert(!events.includes('prepare-whendone'));
    if (failure === 'entry') assert(result.modes.every(row => row.status === 'NOT_STARTED'));
    else if (failure !== 'final-verification') {assert.equal(result.modes[0].status, 'UNKNOWN'); assert.equal(result.modes[1].status, 'NOT_STARTED');}
});
test('the runner creates fresh source plans in exact controls rather than changing legacy manifests or checkout gates', () => {
    assert.match(tool, /trial\.derive\(repo, inputs\.runtime, plan\.toolsRoot, plan\.paths\.artifact/);
    assert.match(tool, /support\.prepare\(\{repo, runtime: derived\.runtime,[\s\S]*loaderTrial: derived\.descriptor/);
    assert.match(tool, /support\.entrySmoke\(sourceFile, true\)/);
    assert.match(tool, /probe\.run\(path\.join\(root, mode, 'probe\.json'\), true\)/);
    assert.match(tool, /trial\.verifyRuntime\(repo/);
    assert.doesNotMatch(tool.replace(/^\s*\/\/.*$/gm, ''), /populate|reopen|range-preload|git.*(?:checkout|reset)|build-native|package\.ps1|createWorkflowDispatch|dispatch\s*\(|Work\s+process/i);
});
test('stock disk route stays branch-scoped, nonrelease and credential-free', () => {
    ci.validateDispatch('disk-probe', 'a'.repeat(40), ci.PIN.repository, 'false', 'refs/heads/feature/playback-range-cache');
    for (const ref of ['refs/heads/main', 'refs/tags/v0.4.0']) assert.throws(() => ci.validateDispatch('disk-probe', 'a'.repeat(40), ci.PIN.repository, 'false', ref));
    assert.throws(() => ci.validateDispatch('disk-probe', 'a'.repeat(40), ci.PIN.repository, 'true', 'refs/heads/feature/playback-range-cache'));
    assert.throws(() => ci.noCredentials({GITHUB_TOKEN: 'synthetic-inert'})); ci.noCredentials(ci.cleanEnvironment({GITHUB_TOKEN: 'synthetic-inert'}));
});
test('redaction preserves observation numbers and hashes while removing owned paths, URLs and sensitive fields', () => {
    const original = {out: 'C:\\owned+trial\\no', source: 'C:\\owned+trial\\source', range: {start: 0, end: 7}, sha256: 'a'.repeat(64),
        nested: [{Authorization: 'synthetic-private', url: 'https://example.invalid/private?api_key=synthetic'}]};
    const result = disk.redact(original, [['C:\\owned+trial', '<owned>']]);
    assert.equal(result.out, '<owned>\\no'); assert.deepEqual(result.range, {start: 0, end: 7}); assert.equal(result.sha256, original.sha256);
    assert.equal(result.nested[0].Authorization, '<redacted>'); assert.equal(result.nested[0].url, '<url-redacted>');
    assert.equal(original.nested[0].Authorization, 'synthetic-private');
});
test('collection keeps all four redacted raw JSON receipts and hashes without binaries, profiles or raw stderr', t => {
    const dir = root(t), matrix = path.join(dir, 'disk-probe'); fs.mkdirSync(matrix);
    for (const mode of disk.MODES) {
        const sub = path.join(matrix, mode); fs.mkdirSync(sub);
        for (const file of ['probe.json', 'observations.json', 'run.json']) fs.writeFileSync(path.join(sub, file), JSON.stringify({mode, out: sub, bytes: 12, helper: {pid: 1}, sha256: 'b'.repeat(64)}));
        fs.writeFileSync(path.join(sub, 'worker.log'), 'synthetic-private-stderr'); fs.writeFileSync(path.join(sub, 'private.dat'), 'private-bytes');
    }
    const destination = path.join(dir, 'evidence'); fs.mkdirSync(destination);
    const rows = disk.collect({root: dir, toolsRoot: path.join(dir, 'immutable-tools')}, destination);
    assert.equal(rows.length, 12); assert(rows.every(row => row.action === 'redacted-json' && /^[a-f0-9]{64}$/.test(row.sourceSha256)));
    for (const row of rows) {
        const output = fs.readFileSync(path.join(destination, row.name), 'utf8'); assert(!output.includes(dir));
        assert.equal(JSON.parse(output).bytes, 12); assert(!output.includes('synthetic-private'));
    }
    assert.equal(fs.readdirSync(destination).length, 12);
});
test('oversized observation refuses successful complete collection rather than silently truncating JSON', t => {
    const dir = root(t), matrix = path.join(dir, 'disk-probe'), sub = path.join(matrix, 'ram'); fs.mkdirSync(sub, {recursive: true});
    fs.writeFileSync(path.join(sub, 'observations.json'), Buffer.alloc(2097153));
    const out = path.join(dir, 'evidence');
    assert.throws(() => ci.collect({root: dir, toolsRoot: dir, paths: {smoke: path.join(dir, 'unused')}, mode: 'disk-probe'}, out), /evidence-size-refused/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'collection.json'))).complete, false);
});
test('CI summary exposes fixed failure location and typed choice values without exposing receipt contents', t => {
    const dir = root(t), modeRoot = path.join(dir, 'disk-probe', 'ram'); fs.mkdirSync(modeRoot, {recursive: true});
    const sensitive = 'synthetic-private-unknown';
    fs.writeFileSync(path.join(dir, 'disk-probe-driver.stdout'), 'raw stderr ' + sensitive + '\nmpv-disk-probe-driver-failure:' + JSON.stringify({stage: 'matrix', code: 'probe-not-established', secret: sensitive}) + '\n');
    fs.writeFileSync(path.join(modeRoot, 'observations.json'), JSON.stringify({status: 'UNKNOWN', stage: 'option-readback', secret: sensitive,
        failure: {stage: 'option-readback', code: 'probe-option-readback-mismatch', extra: sensitive},
        readback: {option: 'cache', actualType: 'boolean', actualValue: true, expectedType: 'string', expectedValue: 'yes', extra: sensitive},
        helpers: [{pid: 100, exited: true, diagnostics: {processExitCode: 0, streamsClosed: true, labels: ['dll-load-failed', sensitive], systemCodes: [126, sensitive], unknownFatal: false, raw: sensitive}}]}));
    fs.writeFileSync(path.join(modeRoot, 'run.json'), JSON.stringify({pid: 99, code: 1, processExited: true, streamsClosed: true, secret: sensitive}));
    const rows = disk.summaries({root: dir}); assert.equal(rows.length, 5); assert.equal(rows[0].stage, 'matrix');
    assert.equal(rows[1].readback.actualType, 'boolean'); assert.equal(rows[1].readback.actualValue, true); assert.equal(rows[1].readback.expectedValue, 'yes');
    assert.equal(rows[2].status, 'NOT_STARTED'); assert.equal(rows[1].failure.code, 'probe-option-readback-mismatch');
    assert.deepEqual(rows[1].helpers[0].labels, ['dll-load-failed']); assert.deepEqual(rows[1].helpers[0].systemCodes, [126]);
    assert(!JSON.stringify(rows).includes(sensitive)); assert(!JSON.stringify(rows).includes(dir));
});
