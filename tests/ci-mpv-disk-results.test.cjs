'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const reader = require('../tools/ci-mpv-disk-results.cjs');
function metadata() {return {id: reader.PIN.artifactId, size_in_bytes: reader.PIN.size, expired: false, expires_at: '2099-01-01T00:00:00Z', digest: 'sha256:' + reader.PIN.sha256,
    workflow_run: {id: reader.PIN.runId, head_sha: reader.PIN.sourceCommit}};}
const run = () => ({id: reader.PIN.runId, head_sha: reader.PIN.sourceCommit, status: 'completed', conclusion: 'success'});
test('completed result input is pinned independently of the native candidate and rejects expiry/source drift', () => {
    assert.equal(reader.PIN.artifactId, 12560867807); assert.equal(reader.PIN.size, 27896); reader.validateMetadata(metadata(), run());
    for (const change of [a => {a.expired = true;}, a => {a.expires_at = '2000-01-01';}, a => {a.id++;}, a => {a.size_in_bytes++;},
        a => {a.workflow_run.head_sha = '0'.repeat(40);}, a => {a.digest = 'sha256:' + '0'.repeat(64);}]) {
        const a = metadata(); change(a); assert.throws(() => reader.validateMetadata(a, run()));
    }
    assert.throws(() => reader.validateMetadata(metadata(), {...run(), conclusion: 'failure'}));
    assert.throws(() => reader.summarize(Buffer.from('wrong archive')), /archive-identity/);
});
function zip(entries, method = 8) {
    const bodies = [], central = []; let offset = 0;
    for (const [name, object] of entries) {
        const raw = Buffer.from(JSON.stringify(object)), nameBytes = Buffer.from(name), packed = method === 8 ? zlib.deflateRawSync(raw) : raw;
        const local = Buffer.alloc(30 + nameBytes.length); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(method, 8);
        local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26); nameBytes.copy(local, 30);
        const row = Buffer.alloc(46 + nameBytes.length); row.writeUInt32LE(0x02014b50); row.writeUInt16LE(method, 10);
        row.writeUInt32LE(packed.length, 20); row.writeUInt32LE(raw.length, 24); row.writeUInt16LE(nameBytes.length, 28); row.writeUInt32LE(offset, 42); nameBytes.copy(row, 46);
        bodies.push(local, packed); central.push(row); offset += local.length + packed.length;
    }
    const directory = Buffer.concat(central), footer = Buffer.alloc(22); footer.writeUInt32LE(0x06054b50); footer.writeUInt16LE(entries.length, 8); footer.writeUInt16LE(entries.length, 10);
    footer.writeUInt32LE(directory.length, 12); footer.writeUInt32LE(offset, 16); return Buffer.concat([...bodies, directory, footer]);
}
for (const method of [0, 8]) test('bounded in-memory ZIP JSON reader supports ordinary stored/deflated entries: ' + method, () => {
    const files = reader.zipJson(zip([['control.json', {source: 'fixed'}], ['disk-no-run.json', {code: 0}]], method));
    assert.deepEqual(files.get('disk-no-run.json').value, {code: 0});
});
for (const failure of ['traversal', 'duplicate', 'encrypted', 'bad-method', 'local-name', 'short', 'oversized']) test('archive reader refuses ' + failure, () => {
    let data = zip([['a.json', {value: 1}]]);
    if (failure === 'traversal') data = zip([['../a.json', {}]]);
    if (failure === 'duplicate') data = zip([['a.json', {}], ['A.json', {}]]);
    const end = data.length - 22, start = data.readUInt32LE(end + 16);
    if (failure === 'encrypted') data.writeUInt16LE(1, start + 8);
    if (failure === 'bad-method') data.writeUInt16LE(9, start + 10);
    if (failure === 'local-name') data[30] = 'b'.charCodeAt(0);
    if (failure === 'oversized') data.writeUInt32LE(2097153, start + 24);
    if (failure === 'short') data = data.subarray(0, data.length - 1);
    assert.throws(() => reader.zipJson(data));
});
const request = (start, end, bytesScheduled = end - start + 1, finished = true) => ({start, end, bytesScheduled, finished, closed: true});
test('range overlap counts union bytes without double counting duplicate requests or treating unserved tails as read', () => {
    const first = reader.intervals([request(0, 15), request(8, 31), request(0, 31)]);
    assert.deepEqual(first, [[0, 31]]); assert.equal(reader.overlap(first, reader.intervals([request(8, 39)])), 24);
    assert.deepEqual(reader.intervals([request(0, 31, 8, false)]), [[0, 7]]);
    assert.deepEqual(reader.intervals([request(0, 31, 8, false)], true), []);
    assert.throws(() => reader.intervals([request(0, 3, 5)]));
});
function observations(mode = 'no') {
    const names = ['first-loaded', 'first-forward', 'first-seek', 'first-stopped', 'same-helper-reopen-loaded', 'same-helper-reopen-forward', 'same-helper-reopen-seek',
        'same-helper-reopen-stopped', 'first-helper-exited', 'new-helper-reopen-loaded', 'new-helper-reopen-forward', 'new-helper-reopen-seek', 'new-helper-reopen-stopped'];
    const old = {name: 'mpv-old.dat', bytes: 64, stable: true, sha256: 'a'.repeat(64)};
    const samples = names.map(label => {
        const files = mode === 'no' ? label.startsWith('new-helper') ? [old, {...old, name: 'second.dat'}, {...old, name: 'third.dat'}] : [old] : [];
        const rows = label.startsWith('same-helper') ? [request(0, 15)] : label.startsWith('new-helper') ? [request(8, 39)] : [request(0, 31)];
        return {label, disk: {files, bytes: files.reduce((n, f) => n + f.bytes, 0)}, state: {'fw-bytes': 1024, 'seekable-ranges': [{start: 0, end: 5, secret: 'synthetic-do-not-log'}]}, sourceRequestsSinceLoad: rows};
    });
    return {mode, status: 'observed', workerPid: 20, helpers: [21, 22].map(pid => ({pid, exited: true, diagnostics: {processExitCode: 0, streamsClosed: true, processSignaled: false}})), samples};
}
test('receipt projection answers retention and repeated source ranges without claiming cache restoration or leaking fields', () => {
    const observation = observations(), summary = reader.summarizeMode('no', observation, {pid: 20, code: 0, status: 'observed', processExited: true, streamsClosed: true});
    assert.equal(summary.reopens[0].overlapFirstCompletedBytes, 16); assert.equal(summary.reopens[1].overlapFirstCompletedBytes, 24);
    assert.equal(summary.reopens[1].oldFilesUnchanged, true); assert.equal(summary.reopens[1].newFiles, 2);
    assert.equal(summary.restoreAssessment, 'NOT_ASSESSED'); assert(!JSON.stringify(summary).includes('synthetic-do-not-log'));
    observation.samples.pop(); assert.throws(() => reader.summarizeMode('no', observation, {pid: 20, code: 0, status: 'observed', processExited: true, streamsClosed: true}));
});
test('reader-only workflow cannot enter native or package jobs and shares the existing short-job concurrency', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8');
    const job = workflow.slice(workflow.indexOf('\n  manual-mpv-disk-results:'));
    assert.match(job, /inputs.range_smoke == 'disk-results'/); assert.match(job, /timeout-minutes: 5/); assert.match(job, /group: ete-manual-playback-range-smoke/);
    assert.match(job, /contents: read\n      actions: read/); assert.equal((job.match(/GITHUB_TOKEN:/g) || []).length, 1);
    assert.match(job, /ci-mpv-disk-results.cjs download/); assert.match(job, /ci-mpv-disk-results.cjs summarize/);
    assert.doesNotMatch(job, /disk-probe.cjs|execute-hidden|ci-playback-range-smoke.cjs execute|build\.ps1|package\.ps1|createWorkflowDispatch|gh workflow run|write:/);
});
