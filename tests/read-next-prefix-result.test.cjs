'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const tool = require('../tools/read-next-prefix-result.cjs');
function fixture() {
    const source = tool.PIN.source, proof = {sha256: 'a'.repeat(64)}, exit = pid => ({status: 'passed', exit: {pid, code: 0, timedOut: false, streamsClosed: true}});
    const trace = [{type: 'manager-play-invocation'}, {type: 'load', item: 'A', generation: 1, direct: false},
        {type: 'native-property', generation: 1, name: 'time-pos', value: 11.3}, {type: 'range-preload', diskBefore: 0},
        {type: 'prefix-ready', bytes: 100000000, targetBytes: 100000000, diskBytes: 100000000},
        {type: 'native-property', generation: 1, name: 'eof-reached', value: true}, {type: 'manager-next-track'},
        {type: 'origin-media', item: 'B', start: 0, end: 0}, {type: 'load', item: 'B', generation: 2, direct: false},
        {type: 'native-property', generation: 2, name: 'file-loaded'}, {type: 'native-property', generation: 2, name: 'core-idle', value: false},
        {type: 'native-property', generation: 2, name: 'time-pos', value: 0.3}, {type: 'decoded-B', width: 320, height: 180, vo: 'gpu-next'},
        {type: 'origin-media', item: 'B', start: 103809024, end: 104071167}, {type: 'prefix-read', itemId: 'B', start: 0, end: 262143}].map((row, seq) => ({seq, ...row}));
    trace.push({seq: 1.5, type: 'native-property', generation: 1, name: 'duration', value: 16}, {seq: 3.5, type: 'origin-media', item: 'B', start: 0, end: 99999999});
    const values = {'control.json': {workflowCommit: source, mode: 'next-auto'}, 'execution.json': {status: 'passed', overlaySourceCommit: source},
        'unpack.json': {status: 'passed', identity: {helperSha256: 'a'.repeat(64)}}, 'auto-entry.json': {status: 'passed', pid: 1, windows: 0, helpers: 0, derivedProof: proof},
        'auto-entry-coordinator.json': exit(1), 'auto-native-coordinator.json': exit(2), 'auto-native.json': {status: 'passed', pid: 2, derivedProof: proof,
            helpers: [{exited: true, diagnostics: {processExitCode: 0, processSignaled: false, processSignal: null, streamsClosed: true}}]}};
    return {trace, values, rows: () => new Map([...Object.entries(values).map(([name, value]) => [name, JSON.stringify(value)]), ['auto-native.trace.ndjson', trace.map(row => JSON.stringify(row)).join('\n')]])};
}
function zip(rows) {
    const local = [], central = []; let offset = 0;
    for (const [name, value] of rows) {
        const body = Buffer.from(value), member = Buffer.from(name), header = Buffer.alloc(30), row = Buffer.alloc(46);
        header.writeUInt32LE(0x04034b50); header.writeUInt32LE(body.length, 18); header.writeUInt32LE(body.length, 22); header.writeUInt16LE(member.length, 26);
        row.writeUInt32LE(0x02014b50); row.writeUInt32LE(body.length, 20); row.writeUInt32LE(body.length, 24); row.writeUInt16LE(member.length, 28); row.writeUInt32LE(offset, 42);
        local.push(header, member, body); central.push(row, member); offset += header.length + member.length + body.length;
    }
    const tail = Buffer.alloc(22), directory = Buffer.concat(central); tail.writeUInt32LE(0x06054b50); tail.writeUInt16LE(rows.size, 8); tail.writeUInt16LE(rows.size, 10); tail.writeUInt32LE(directory.length, 12); tail.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, directory, tail]);
}
test('existing receipt projection rechecks native chain and exits without exposing arbitrary receipt fields', () => {
    const f = fixture(), canary = 'synthetic-private-receipt-canary'; f.values['auto-native.json'].private = canary; f.trace.find(row => row.type === 'decoded-B').private = canary;
    const report = tool.summarize(tool.members(zip(f.rows())));
    assert.equal(report.checks.automatic, true); assert.equal(report.prefix.committedBytes, 100000000); assert.equal(report.prefix.originMediaAttemptsBeforeEofBytes, 100000000);
    assert.equal(report.prefix.firstPrefixRefetches, 0); assert.equal(report.decodedB.vo, 'gpu-next'); assert.equal(report.cleanup.payloadClearGatePassed, true);
    assert(!JSON.stringify(report).includes(canary));
});
for (const mutation of ['source', 'helper-exit', 'electron-timeout', 'cleanup', 'first-block-refetch', 'no-eof']) test('read-only report rejects incomplete evidence: ' + mutation, () => {
    const f = fixture();
    if (mutation === 'source') f.values['control.json'].workflowCommit = '0'.repeat(40);
    if (mutation === 'helper-exit') f.values['auto-native.json'].helpers[0].diagnostics.processExitCode = 23;
    if (mutation === 'electron-timeout') f.values['auto-native-coordinator.json'].exit.timedOut = true;
    if (mutation === 'cleanup') f.values['auto-native.json'].cleanup = ['temporary-prefix-cleanup-failed'];
    if (mutation === 'first-block-refetch') f.trace.push({seq: 20, type: 'origin-media', item: 'B', start: 0, end: 262143});
    if (mutation === 'no-eof') f.trace.splice(5, 1);
    assert.throws(() => tool.summarize(f.rows()));
});
test('immutable artifact size/hash gate precedes ZIP parsing; missing receipts are refused', () => {
    assert.throws(() => tool.readFixed(zip(fixture().rows())), /result-zip-identity/);
    const rows = fixture().rows(); rows.delete('auto-native.json'); assert.throws(() => tool.members(zip(rows)), /result-receipts-missing/);
});
test('metadata binds only the exact existing artifact and successful native source run', () => {
    const artifact = {id: tool.PIN.artifact, expired: false, expires_at: '2099-01-01', digest: 'sha256:' + tool.PIN.sha256, workflow_run: {id: tool.PIN.run, head_sha: tool.PIN.source}};
    const run = {id: tool.PIN.run, head_sha: tool.PIN.source, status: 'completed', conclusion: 'success'};
    assert.doesNotThrow(() => tool.metadata(artifact, run)); assert.throws(() => tool.metadata({...artifact, expired: true}, run));
    assert.throws(() => tool.metadata({...artifact, id: 1}, run)); assert.throws(() => tool.metadata(artifact, {...run, head_sha: '0'.repeat(40)}));
});
test('report route reads existing receipts with no package preparation, native run or dependency installation', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/public-ci.yml'), 'utf8'), start = workflow.indexOf('  manual-next-prefix-result:'), end = workflow.indexOf('  manual-playback-range-smoke:');
    const job = workflow.slice(start, end), source = fs.readFileSync(path.join(__dirname, '../tools/read-next-prefix-result.cjs'), 'utf8');
    assert.match(job, /inputs.range_smoke == 'next-auto-report'/); assert.match(job, /timeout-minutes: 5/); assert.match(job, /actions: read/);
    assert.match(job, /node tools\/read-next-prefix-result.cjs/); assert.doesNotMatch(job + source, /spawnSync|execFile|--execute-native|npm ci|ci-windows-test-package|prepare-ci-build-inputs|write:|secrets\./);
});
