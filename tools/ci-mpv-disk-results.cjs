'use strict';
// Read the one completed experiment artifact. No Electron/helper/native execution.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), zlib = require('node:zlib');
const ci = require('./ci-playback-range-smoke.cjs');
const MODES = Object.freeze(['ram', 'whendone', 'no', 'immediate']);
const PIN = Object.freeze({repository: 'hope140/EmbyTheaterEnhanced', artifactId: 12560867807, runId: 40096829737,
    sourceCommit: '3801714b4e2ee178016ba87ce3304bb72a109e64', size: 27896,
    sha256: '3711a6c7268328a7bf85dd065b487c77de0e5c3b3d173159840f37d318f6b84f'});
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const ERRORS = new Set(['disk-results-expired', 'disk-results-source-mismatch', 'disk-results-fresh-output-required', 'disk-results-zip-size',
    'disk-results-zip-layout', 'disk-results-zip-central', 'disk-results-zip-member', 'disk-results-zip-expanded-limit', 'disk-results-zip-local',
    'disk-results-zip-length', 'disk-results-request-limit', 'disk-results-request-invalid', 'disk-results-mode-not-observed', 'disk-results-sample-missing',
    'disk-results-disk-invalid', 'disk-results-archive-identity', 'disk-results-receipt-missing', 'disk-results-control-invalid', 'disk-results-receipt-hash',
    'disk-results-argument', 'disk-results-dispatch', 'artifact-read-permission-denied', 'candidate-artifact-missing-or-expired', 'download-byte-identity-mismatch']);
function need(value, code) {if (!value) throw Error(code);}
function validateMetadata(artifact, run, now = Date.now()) {
    need(artifact.expired === false && Number.isFinite(Date.parse(artifact.expires_at)) && Date.parse(artifact.expires_at) > now, 'disk-results-expired');
    need(artifact.id === PIN.artifactId && artifact.size_in_bytes === PIN.size && artifact.digest === 'sha256:' + PIN.sha256 &&
        artifact.workflow_run?.id === PIN.runId && artifact.workflow_run?.head_sha === PIN.sourceCommit && run.id === PIN.runId &&
        run.head_sha === PIN.sourceCommit && run.status === 'completed' && run.conclusion === 'success', 'disk-results-source-mismatch');
}
async function download(file, token, request = fetch) {
    need(!fs.existsSync(file) && path.isAbsolute(file), 'disk-results-fresh-output-required');
    const a = await ci.api('artifacts/' + PIN.artifactId, token, request); ci.responseStatus(a, 200);
    const r = await ci.api('runs/' + PIN.runId, token, request); ci.responseStatus(r, 200);
    const artifact = await a.json(); validateMetadata(artifact, await r.json());
    const redirect = await ci.api('artifacts/' + PIN.artifactId + '/zip', token, request); ci.responseStatus(redirect, 302);
    const location = ci.secureLocation(redirect.headers.get('location')); await redirect.body?.cancel();
    await ci.downloaded(location, file, PIN, request); return {artifactId: PIN.artifactId, expiresAt: artifact.expires_at, sha256: PIN.sha256};
}
function zipJson(bytes) {
    need(Buffer.isBuffer(bytes) && bytes.length <= 1048576, 'disk-results-zip-size');
    let end = -1;
    for (let n = bytes.length - 22; n >= Math.max(0, bytes.length - 65557); n--) if (bytes.readUInt32LE(n) === 0x06054b50 && n + 22 + bytes.readUInt16LE(n + 20) === bytes.length) {end = n; break;}
    need(end >= 0 && bytes.readUInt16LE(end + 4) === 0 && bytes.readUInt16LE(end + 6) === 0, 'disk-results-zip-layout');
    const count = bytes.readUInt16LE(end + 10), length = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
    need(count > 0 && count <= 100 && bytes.readUInt16LE(end + 8) === count && start + length === end, 'disk-results-zip-central');
    const files = new Map(), names = new Set(); let cursor = start, total = 0;
    for (let i = 0; i < count; i++) {
        need(cursor + 46 <= end && bytes.readUInt32LE(cursor) === 0x02014b50, 'disk-results-zip-central');
        const flags = bytes.readUInt16LE(cursor + 8), method = bytes.readUInt16LE(cursor + 10), packedSize = bytes.readUInt32LE(cursor + 20), size = bytes.readUInt32LE(cursor + 24);
        const nameSize = bytes.readUInt16LE(cursor + 28), extra = bytes.readUInt16LE(cursor + 30), comment = bytes.readUInt16LE(cursor + 32), offset = bytes.readUInt32LE(cursor + 42);
        need(cursor + 46 + nameSize + extra + comment <= end, 'disk-results-zip-central');
        const name = bytes.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8'), key = name.toLowerCase();
        need(/^[A-Za-z0-9_.-]+\.(?:json|stdout)$/.test(name) && !names.has(key) && !(flags & 1) && [0, 8].includes(method) &&
            ((bytes.readUInt32LE(cursor + 38) >>> 16) & 0xf000) !== 0xa000 && size <= 2097152 && packedSize <= bytes.length && offset + 30 <= start, 'disk-results-zip-member');
        names.add(key); total += size; need(total <= 8388608, 'disk-results-zip-expanded-limit');
        need(bytes.readUInt32LE(offset) === 0x04034b50 && bytes.readUInt16LE(offset + 8) === method, 'disk-results-zip-local');
        const localName = bytes.readUInt16LE(offset + 26), dataStart = offset + 30 + localName + bytes.readUInt16LE(offset + 28);
        need(dataStart + packedSize <= start && bytes.subarray(offset + 30, offset + 30 + localName).toString('utf8') === name, 'disk-results-zip-local');
        if (name.endsWith('.json')) {
            const packed = bytes.subarray(dataStart, dataStart + packedSize), data = method === 0 ? packed : zlib.inflateRawSync(packed, {maxOutputLength: Math.max(size, 1)});
            need(data.length === size, 'disk-results-zip-length'); files.set(name, {data, value: JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(data))});
        }
        cursor += 46 + nameSize + extra + comment;
    }
    need(cursor === end, 'disk-results-zip-central'); return files;
}
function intervals(rows, completedOnly = false) {
    need(Array.isArray(rows) && rows.length <= 128, 'disk-results-request-limit');
    const ranges = [];
    for (const r of rows) {
        need(Number.isSafeInteger(r.start) && Number.isSafeInteger(r.end) && r.start >= 0 && r.end >= r.start && r.end < 34 * 1048576 &&
            Number.isSafeInteger(r.bytesScheduled) && r.bytesScheduled >= 0 && r.bytesScheduled <= r.end - r.start + 1, 'disk-results-request-invalid');
        if (completedOnly && !r.finished) continue;
        if (r.bytesScheduled) ranges.push([r.start, r.start + r.bytesScheduled - 1]);
    }
    ranges.sort((a, b) => a[0] - b[0]); const union = [];
    for (const r of ranges) {const last = union.at(-1); if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else union.push([...r]);}
    return union;
}
function overlap(a, b) {let bytes = 0; for (const x of a) for (const y of b) bytes += Math.max(0, Math.min(x[1], y[1]) - Math.max(x[0], y[0]) + 1); return bytes;}
function summarizeMode(mode, observation, run) {
    need(MODES.includes(mode) && observation.mode === mode && observation.status === 'observed' && run.status === 'observed' &&
        run.pid === observation.workerPid && run.code === 0 && run.processExited && run.streamsClosed && !run.timedOut &&
        observation.helpers?.length === 2 && observation.helpers.every(h => h.exited && h.diagnostics?.processExitCode === 0 && h.diagnostics.streamsClosed && !h.diagnostics.processSignaled), 'disk-results-mode-not-observed');
    const find = label => {const rows = observation.samples.filter(s => s.label === label); need(rows.length === 1, 'disk-results-sample-missing'); return rows[0];};
    const first = find('first-stopped'), base = first.disk.files;
    const labels = ['first-loaded', 'first-forward', 'first-seek', 'first-stopped', 'same-helper-reopen-loaded', 'same-helper-reopen-forward', 'same-helper-reopen-seek',
        'same-helper-reopen-stopped', 'first-helper-exited', 'new-helper-reopen-loaded', 'new-helper-reopen-forward', 'new-helper-reopen-seek', 'new-helper-reopen-stopped'];
    const samples = labels.map(label => {
        const s = find(label); need(Array.isArray(s.disk?.files) && s.disk.files.length <= 16 && Number.isSafeInteger(s.disk.bytes) && s.disk.bytes >= 0, 'disk-results-disk-invalid');
        for (const f of s.disk.files) need(Number.isSafeInteger(f.bytes) && f.bytes >= 0 && /^[a-f0-9]{64}$/.test(f.sha256) && typeof f.stable === 'boolean', 'disk-results-disk-invalid');
        return {label, files: s.disk.files.length, bytes: s.disk.bytes, observedFileBytes: s.disk.files.reduce((n, f) => n + f.bytes, 0),
            stableFiles: s.disk.files.filter(f => f.stable).length, fwBytes: Number.isFinite(s.state?.['fw-bytes']) ? s.state['fw-bytes'] : null,
            seekableRanges: Array.isArray(s.state?.['seekable-ranges']) ? s.state['seekable-ranges'].filter(r => Number.isFinite(r.start) && Number.isFinite(r.end)).slice(0, 32).map(r => ({start: r.start, end: r.end})) : null};
    });
    const reopens = ['same-helper-reopen-stopped', 'new-helper-reopen-stopped'].map(label => {
        const s = find(label), rows = s.sourceRequestsSinceLoad, oldStable = base.length > 0 && base.every(f => f.stable);
        const scheduled = intervals(rows), completed = intervals(rows, true);
        return {label, requests: rows.length, scheduledBytes: rows.reduce((n, r) => n + r.bytesScheduled, 0),
            overlapFirstScheduledBytes: overlap(intervals(first.sourceRequestsSinceLoad), scheduled),
            overlapFirstCompletedBytes: overlap(intervals(first.sourceRequestsSinceLoad, true), completed),
            oldFilesUnchanged: oldStable ? base.every(old => s.disk.files.some(f => f.name === old.name && f.stable && f.bytes === old.bytes && f.sha256 === old.sha256)) : null,
            newFiles: s.disk.files.filter(f => !base.some(old => old.name === f.name)).length,
            ranges: rows.map(r => ({start: r.start, end: r.end, bytesScheduled: r.bytesScheduled, closed: r.closed === true, finished: r.finished === true}))};
    });
    return {mode, status: 'observed', samples, firstRead: {requests: first.sourceRequestsSinceLoad.length,
        scheduledBytes: first.sourceRequestsSinceLoad.reduce((n, r) => n + r.bytesScheduled, 0), scheduledRanges: intervals(first.sourceRequestsSinceLoad),
        completedRanges: intervals(first.sourceRequestsSinceLoad, true)}, reopens, restoreAssessment: 'NOT_ASSESSED',
        meaning: 'origin scheduled/completed byte ranges; not proof of packet decoding or transparent cache restore'};
}
function summarize(bytes) {
    need(bytes.length === PIN.size && hash(bytes) === PIN.sha256, 'disk-results-archive-identity');
    const files = zipJson(bytes), get = name => {need(files.has(name), 'disk-results-receipt-missing'); return files.get(name).value;};
    const control = get('control.json'), collection = get('collection.json');
    need(control.workflowCommit === PIN.sourceCommit && control.mode === 'disk-probe' && control.pin?.sourceCommit === ci.PIN.sourceCommit && collection.complete === true, 'disk-results-control-invalid');
    for (const mode of MODES) for (const suffix of ['observations.json', 'run.json']) {
        const name = 'disk-' + mode + '-' + suffix, row = collection.files.filter(r => r.name === name);
        need(row.length === 1 && row[0].publishedSha256 === hash(files.get(name)?.data || Buffer.alloc(0)), 'disk-results-receipt-hash');
    }
    return {schema: 1, input: PIN, modes: MODES.map(mode => summarizeMode(mode, get('disk-' + mode + '-observations.json'), get('disk-' + mode + '-run.json')))};
}
async function main(argv) {
    const mode = argv[0], file = argv.length === 2 && argv[1].startsWith('--zip=') ? argv[1].slice(6) : null;
    need(file, 'disk-results-argument');
    if (mode === 'download') {
        need(process.env.GITHUB_REF === 'refs/heads/feature/playback-range-cache' && process.env.GITHUB_REPOSITORY === PIN.repository && process.env.ETE_RELEASE_PACKAGE === 'false', 'disk-results-dispatch');
        console.log(JSON.stringify(await download(file, process.env.GITHUB_TOKEN)));
    } else if (mode === 'summarize') {
        ci.noCredentials(process.env); const summary = summarize(fs.readFileSync(file));
        console.log('mpv-disk-results-input:' + JSON.stringify(summary.input));
        for (const row of summary.modes) console.log('mpv-disk-results:' + JSON.stringify(row));
    } else throw Error('disk-results-argument');
}
if (require.main === module) main(process.argv.slice(2)).catch(error => {console.error(ERRORS.has(error?.message) ? error.message : 'disk-results-not-established'); process.exitCode = 1;});
module.exports = {PIN, MODES, validateMetadata, download, zipJson, intervals, overlap, summarizeMode, summarize};
