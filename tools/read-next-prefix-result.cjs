'use strict';
// Read one existing immutable receipt artifact. Never prepare or execute a runtime.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), zlib = require('node:zlib');
const ci = require('./ci-playback-range-smoke.cjs');
const auto = require('./playback-prefix-windows-auto.cjs');
const diagnostics = require('./playback-range-helper-diagnostics.cjs');
const PIN = Object.freeze({run: 40100795549, artifact: 12562503770, source: 'cfb597b741a3741ed266fc08ea0d29cf1218e5d8',
    bytes: 19823, sha256: '31fd3af11f29013aaadb773b30a56df9bec85fe0edb53dcde57b33b7165d7d9e'});
const MEMBERS = ['control.json', 'execution.json', 'unpack.json', 'auto-entry.json', 'auto-entry-coordinator.json', 'auto-native.json', 'auto-native-coordinator.json', 'auto-native.trace.ndjson'];
function need(value, code) {if (!value) throw Error(code);}
function metadata(artifact, run) {
    need(artifact.id === PIN.artifact && artifact.expired === false && Date.parse(artifact.expires_at) > Date.now() &&
        artifact.workflow_run?.id === PIN.run && artifact.workflow_run?.head_sha === PIN.source &&
        run.id === PIN.run && run.head_sha === PIN.source && run.status === 'completed' && run.conclusion === 'success' &&
        (artifact.digest == null || artifact.digest === 'sha256:' + PIN.sha256), 'result-metadata-mismatch');
}
function members(bytes) {
    // The caller first verifies the entire immutable ZIP hash. Read only eight
    // named receipts; no extraction, child process or executable member exists.
    const rows = new Map(); let end = -1;
    for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--) if (bytes.readUInt32LE(n) === 0x06054b50) {end = n; break;}
    need(end >= 0 && bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0, 'result-zip-layout');
    let cursor = bytes.readUInt32LE(end + 16); const count = bytes.readUInt16LE(end + 10);
    need(count < 100 && cursor + bytes.readUInt32LE(end + 12) === end, 'result-zip-layout');
    for (let n = 0; n < count; n++) {
        need(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50, 'result-zip-layout');
        const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), packed = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24), nameLength = bytes.readUInt16LE(cursor + 28), offset = bytes.readUInt32LE(cursor + 42);
        const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength);
        cursor += 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
        if (!MEMBERS.includes(name)) continue;
        need(!rows.has(name) && !(flags & 1) && [0, 8].includes(method) && size <= 131072 && offset + 30 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50, 'result-member-layout');
        const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
        need(start + packed <= end, 'result-member-layout');
        const body = method === 0 ? bytes.subarray(start, start + packed) : zlib.inflateRawSync(bytes.subarray(start, start + packed), {maxOutputLength: 131072});
        need(body.length === size, 'result-member-size'); rows.set(name, body.toString('utf8'));
    }
    need(cursor === end && MEMBERS.every(name => rows.has(name)), 'result-receipts-missing'); return rows;
}
function summarize(rows) {
    const json = name => JSON.parse(rows.get(name)), control = json('control.json'), execution = json('execution.json'), unpack = json('unpack.json');
    const entry = json('auto-entry.json'), native = json('auto-native.json'), entryExit = json('auto-entry-coordinator.json'), nativeExit = json('auto-native-coordinator.json');
    const trace = rows.get('auto-native.trace.ndjson').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    need(control.workflowCommit === PIN.source && control.mode === 'next-auto' && execution.status === 'passed' && execution.overlaySourceCommit === PIN.source && unpack.status === 'passed', 'result-source-or-execution-mismatch');
    for (const [receipt, coordinator] of [[entry, entryExit], [native, nativeExit]]) need(receipt.status === 'passed' && coordinator.status === 'passed' && receipt.pid === coordinator.exit?.pid && coordinator.exit.code === 0 && !coordinator.exit.timedOut && coordinator.exit.streamsClosed === true && JSON.stringify(receipt.derivedProof) === JSON.stringify(native.derivedProof), 'result-process-exit-unconfirmed');
    need(entry.windows === 0 && entry.helpers === 0 && native.helpers?.length > 0 && native.helpers.every(helper => helper.exited && diagnostics.normalExit(helper.diagnostics)) && !(native.cleanup?.length), 'result-helper-or-cleanup-unconfirmed');
    const checks = auto.validateTrace(trace, auto.FIXTURE_SIZES[1]);
    const find = (type, predicate = () => true) => trace.find(row => row.type === type && predicate(row));
    const a = find('load', row => row.item === 'A'), b = find('load', row => row.item === 'B'), duration = find('native-property', row => row.generation === a.generation && row.name === 'duration' && row.value > 0);
    const threshold = find('native-property', row => row.generation === a.generation && row.name === 'time-pos' && row.value / duration.value * 100 >= 70);
    const ready = find('prefix-ready'), eof = find('native-property', row => row.generation === a.generation && row.name === 'eof-reached' && row.value === true);
    const fresh = trace.filter(row => row.type === 'origin-media' && row.item === 'B' && row.seq > eof.seq), hits = trace.filter(row => row.type === 'prefix-read' && row.itemId === 'B' && row.seq > b.seq);
    const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
    const warming = trace.filter(row => row.type === 'origin-media' && row.item === 'B' && row.seq < eof.seq && row.end > 0);
    return {type: 'existing-next-prefix-success-result', run: PIN.run, artifact: PIN.artifact, source: PIN.source, checks,
        progress: {percent: 70, durationSeconds: duration.value, observedSeconds: threshold.value},
        sequence: {preload: find('range-preload').seq, ready: ready.seq, naturalEof: eof.seq, originalNextTrack: find('manager-next-track').seq, bLoad: b.seq, aGeneration: a.generation, bGeneration: b.generation},
        decodedB: {width: find('decoded-B').width, height: find('decoded-B').height, vo: find('decoded-B').vo, seq: find('decoded-B').seq},
        prefix: {budgetBytes: 100000000, committedBytes: ready.bytes, reportedOccupancyBytes: ready.diskBytes, beforePreloadBytes: find('range-preload').diskBefore,
            observedHitReads: hits.length, firstHitStart: hits[0].start, firstHitEnd: hits[0].end, originMediaAttemptsBeforeEofBytes: warming.reduce((sum, row) => sum + row.end - row.start + 1, 0),
            postEofOriginProbes: checks.observedBOriginProbeCount, postEofOriginMisses: checks.observedBNativeMissCount, firstPrefixRefetches: fresh.filter(row => row.start === 0 && row.end > 0).length,
            missRanges: fresh.filter(row => row.end > 0).slice(0, 8).map(row => ({start: row.start, end: row.end}))},
        cleanup: {nativeReceiptPassed: true, payloadClearGatePassed: true, electronExitCode: nativeExit.exit.code, electronStreamsClosed: nativeExit.exit.streamsClosed,
            helpers: native.helpers.map(helper => ({exited: helper.exited, exitCode: helper.diagnostics.processExitCode, streamsClosed: helper.diagnostics.streamsClosed}))},
        identity: {helperSha256: hash(unpack.identity?.helperSha256), libmpvSha256: hash(unpack.identity?.libmpvSha256), electronSha256: hash(unpack.identity?.electronSha256)},
        limits: ['synthetic anonymous same-origin media', 'hidden presentation stubs', '100 MB selection only', 'occupancy sampled by harness; no continuous physical peak measurement', 'no active native cancellation/replacement matrix', 'no NAS/auth/302/dian115 or ordinary settings/install acceptance']};
}
function readFixed(bytes) {
    need(bytes.length === PIN.bytes && crypto.createHash('sha256').update(bytes).digest('hex') === PIN.sha256, 'result-zip-identity');
    return summarize(members(bytes));
}
async function main() {
    need(process.env.GITHUB_REF === 'refs/heads/verify/next-episode-auto-20261024' && process.env.GITHUB_REPOSITORY === ci.PIN.repository && process.env.ETE_RELEASE_PACKAGE === 'false', 'result-dispatch-scope');
    const token = process.env.GITHUB_TOKEN;
    const artifact = await ci.api('artifacts/' + PIN.artifact, token); ci.responseStatus(artifact, 200);
    const run = await ci.api('runs/' + PIN.run, token); ci.responseStatus(run, 200); metadata(await artifact.json(), await run.json());
    const response = await ci.api('artifacts/' + PIN.artifact + '/zip', token); ci.responseStatus(response, 302);
    const location = ci.secureLocation(response.headers.get('location')); await response.body?.cancel();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-existing-prefix-result-')), file = path.join(root, 'receipt.zip');
    await ci.downloaded(location, file, {size: PIN.bytes, sha256: PIN.sha256});
    console.log(JSON.stringify(readFixed(fs.readFileSync(file))));
}
if (require.main === module) main().catch(error => {console.error(/^(?:result|candidate|artifact|download|invalid)-[a-z-]+$/.test(error.message) ? error.message : 'result-read-failed'); process.exitCode = 1;});
module.exports = {PIN, metadata, members, summarize, readFixed};
