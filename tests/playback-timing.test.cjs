'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {analyzeText, analyzeFile, MAX_BYTES, MAX_LINES} = require('../tools/analyze-playback-timing.cjs');
const COMMIT = 'a'.repeat(40);
const options = {sourceCommit: COMMIT, evidenceKind: 'synthetic'};
const epoch = Date.parse('2026-10-09T00:00:00.000Z');
function record(ms, category, event, details = {}) {
    return {schemaVersion: 1, timestamp: new Date(epoch + ms).toISOString(), category, event, details};
}
function fixture(id = 'play-1-1', offset = 0) {
    const base = {helperRun: 1, generationId: 1, currentGenerationId: 1, requestId: id, association: 'available'};
    return [
        record(offset, 'app', 'start', {buildCommit: COMMIT}),
        record(offset + 10, 'playback', 'play-request', {requestId: id}),
        record(offset + 40, 'playback', 'resolver-complete', {requestId: id, route: 'cd2-http'}),
        record(offset + 45, 'native-helper', 'generation-begin', {...base, disposition: 'BEGIN_GENERATION'}),
        record(offset + 50, 'playback', 'loadfile-requested', {requestId: id, route: 'cd2-http'}),
        record(offset + 52, 'native-helper', 'start-file', {...base, disposition: 'ACCEPT'}),
        record(offset + 70, 'native-helper', 'file-loaded', {...base, disposition: 'ACCEPT'}),
        record(offset + 90, 'playback', 'core-playing', {requestId: id}),
        record(offset + 100, 'native-helper', 'generation-retired', {...base, currentGenerationId: null, disposition: 'RETIRE_GENERATION'})
    ];
}
function analyze(rows, settings = options) { return analyzeText(rows.map(row => JSON.stringify(row)).join('\n') + '\n', settings); }
function metrics(result, run = 0, request = 0) { return result.runs[run].requests[request].metrics; }

test('observes exact millisecond receipt intervals without claiming first frame or CD2 phases', () => {
    const result = analyze(fixture());
    const m = metrics(result);
    assert.equal(result.status, 'COMPLETE');
    assert.equal(result.evidenceKind, 'synthetic');
    for (const [name, ms] of Object.entries({playToResolverMs: 30, resolverToLoadRequestMs: 10,
        loadRequestToCorePlayingMs: 40, playToCorePlayingMs: 80,
        loadRequestToFileLoadedMs: 20, nativeStartToFileLoadedMs: 18})) {
        assert.deepEqual(m[name], {status: 'OBSERVED', milliseconds: ms, reason: null});
    }
    assert.equal(m.cd2ReportedResolveMs.status, 'UNAVAILABLE');
    assert.equal(result.unavailableStages.firstVisibleFrame, 'NO_PRESENTATION_EVIDENCE');
    assert.equal(result.summaryByRoute['cd2-http'].playToCorePlayingMs.p95Ms, null);
});

test('multiple app starts fail closed because writer ownership and late tails cannot be proven', () => {
    const result = analyze([...fixture(), ...fixture('play-1-1', 1000)]);
    assert.deepEqual(result.failures, ['MULTIPLE_APP_RUNS_UNVERIFIABLE']);
    assert.equal(result.runs.length, 0);
    const interleaved = fixture();
    interleaved.splice(2, 0, record(20, 'app', 'start', {buildCommit: COMMIT}));
    assert.deepEqual(analyze(interleaved).failures, ['MULTIPLE_APP_RUNS_UNVERIFIABLE']);
});

test('source mismatches never contribute and missing app/start fails closed', () => {
    const other = fixture();
    other[0].details.buildCommit = 'b'.repeat(40);
    assert.equal(analyze(other).status, 'INVALID_INPUT');
    const result = analyze(other);
    assert.equal(result.counts.skippedSourceRuns, 1);
    assert.equal(result.runs.length, 0);
    assert.deepEqual(analyze(fixture().slice(1)).failures, ['APP_START_REQUIRED']);
});

test('missing and duplicated endpoints do not become zero or selected first/last markers', () => {
    let rows = fixture().filter(row => row.event !== 'file-loaded');
    assert.equal(metrics(analyze(rows)).nativeStartToFileLoadedMs.reason, 'MISSING_MARKER');
    rows = fixture();
    rows.splice(7, 0, structuredClone(rows[6]));
    assert.equal(metrics(analyze(rows)).nativeStartToFileLoadedMs.reason, 'AMBIGUOUS_MARKERS');
});

test('stale and unattributed native events are excluded even when temporally plausible', () => {
    for (const disposition of ['DROP_STALE_GENERATION', 'DROP_STALE_HELPER', 'DROP_UNATTRIBUTED']) {
        const rows = fixture();
        rows[6].details.disposition = disposition;
        const result = analyze(rows);
        assert.equal(metrics(result).loadRequestToFileLoadedMs.status, 'UNAVAILABLE');
        assert.equal(result.counts.ignoredNativeRecords, 1);
    }
});

test('native events require unique matching begin, current generation and unretired ownership', () => {
    const variants = [
        rows => rows.filter(row => row.event !== 'generation-begin'),
        rows => { rows[6].details.currentGenerationId = 2; return rows; },
        rows => { rows[6].details.helperRun = 2; return rows; },
        rows => { rows.splice(4, 0, structuredClone(rows[3])); return rows; },
        rows => { rows.splice(6, 0, record(60, 'native-helper', 'generation-retired', {...rows[3].details, disposition: 'RETIRE_GENERATION', currentGenerationId: null})); return rows; }
    ];
    for (const mutate of variants) {
        assert.equal(metrics(analyze(mutate(fixture()))).loadRequestToFileLoadedMs.reason, 'INVALID_NATIVE_ASSOCIATION');
    }
});

test('concurrent requests never borrow each other\'s endpoints', () => {
    const rows = fixture();
    rows[6].details.requestId = 'play-2-2';
    const result = analyze(rows);
    assert.equal(metrics(result).loadRequestToFileLoadedMs.reason, 'MISSING_MARKER');
    assert.equal(metrics(result, 0, 1).loadRequestToFileLoadedMs.status, 'UNAVAILABLE');
});

test('conflicting generation owner or repeated play label invalidates attribution', () => {
    const rows = fixture();
    rows[8].details.requestId = 'play-2-2';
    assert.equal(metrics(analyze(rows)).nativeStartToFileLoadedMs.reason, 'INVALID_NATIVE_ASSOCIATION');
    const repeated = fixture();
    repeated.splice(2, 0, structuredClone(repeated[1]));
    assert.ok(Object.values(metrics(analyze(repeated))).every(metric => metric.reason === 'DUPLICATE_PLAY_REQUEST'));
});

test('clock regression and marker order are explicit unavailable results', () => {
    const rows = fixture();
    rows[6].timestamp = new Date(epoch + 49).toISOString();
    const result = analyze(rows);
    assert.equal(result.runs[0].clockRegression, true);
    assert.ok(Object.values(metrics(result)).every(metric => metric.reason === 'CLOCK_REGRESSION'));
    const reversed = fixture();
    [reversed[4].event, reversed[7].event] = [reversed[7].event, reversed[4].event];
    assert.equal(metrics(analyze(reversed)).loadRequestToCorePlayingMs.reason, 'ORDER_OR_INTERVAL_INVALID');
});

test('zero wall-clock differences are unresolved, and a late core-playing does not cross stop', () => {
    const rows = fixture();
    rows[5].timestamp = rows[4].timestamp;
    rows[6].timestamp = rows[4].timestamp;
    assert.equal(metrics(analyze(rows)).nativeStartToFileLoadedMs.reason, 'BELOW_CLOCK_RESOLUTION');
    const stopped = fixture();
    stopped.splice(7, 0, record(80, 'playback', 'stop', {requestId: 'play-1-1'}));
    assert.equal(metrics(analyze(stopped)).playToCorePlayingMs.reason, 'REQUEST_RETIRED_DURING_INTERVAL');
    const earlyStop = fixture();
    earlyStop.splice(2, 0, record(20, 'playback', 'stop', {requestId: 'play-1-1'}));
    assert.equal(metrics(analyze(earlyStop)).resolverToLoadRequestMs.reason, 'REQUEST_RETIRED_DURING_INTERVAL');
    assert.equal(analyze(rows).diagnosticCompleteness, 'NOT_VERIFIED');
});

test('suppression and pending drops make incomplete run timing unavailable', () => {
    for (const row of [record(105, 'native-helper', 'diagnostics-suppressed', {limitPerMinute: 120}),
        record(105, 'native-helper', 'surface-hidden', {diagnosticPendingDrops: 2})]) {
        assert.ok(Object.values(metrics(analyze([...fixture(), row]))).every(metric => metric.reason === 'DIAGNOSTIC_GAP'));
    }
});

test('CD2 total uses one explicit request/mode attempt while anonymous phases stay unavailable', () => {
    const rows = fixture();
    rows.splice(2, 0,
        record(12, 'cd2', 'resolve-start', {requestId: 'play-1-1', mode: 'direct', elapsedMs: 0}),
        record(15, 'cd2', 'find-file-start', {mode: 'direct', elapsedMs: 3}),
        record(25, 'cd2', 'find-file-end', {mode: 'direct', elapsedMs: 13}),
        record(38, 'cd2', 'resolve-hit', {requestId: 'play-1-1', mode: 'direct', elapsedMs: 26}));
    assert.equal(metrics(analyze(rows)).cd2ReportedResolveMs.milliseconds, 26);
    assert.equal(analyze(rows).unavailableStages.cd2FindOnly, 'PHASE_EVENTS_HAVE_NO_REQUEST_ID');
    for (const terminal of [record(11, 'playback', 'stop', {requestId: 'play-1-1'}),
        record(30, 'playback', 'stop', {requestId: 'play-1-1'}),
        record(30, 'native-helper', 'generation-retired', {requestId: 'play-1-1', helperRun: 1,
            generationId: 1, currentGenerationId: null, association: 'available', disposition: 'RETIRE_GENERATION'})]) {
        const stopped = [...rows, terminal].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
        assert.equal(metrics(analyze(stopped)).cd2ReportedResolveMs.reason, 'REQUEST_RETIRED_DURING_INTERVAL');
    }
    rows[5].details.elapsedMs = 0;
    assert.equal(metrics(analyze(rows)).cd2ReportedResolveMs.reason, 'ZERO_OR_CLOCK_CLAMPED');
    rows.splice(6, 0, record(39, 'cd2', 'resolve-start', {requestId: 'play-1-1', mode: 'same-origin', elapsedMs: 0}));
    assert.equal(metrics(analyze(rows)).cd2ReportedResolveMs.reason, 'MULTIPLE_CD2_ATTEMPTS');
});

test('report projects fixed fields only, including errors and unknown enum values', () => {
    const secret = 'PRIVATE_TOKEN_https://private.invalid/movie?api_key=abc';
    const rows = fixture();
    rows[2].details.route = secret;
    rows[4].details.route = secret;
    rows[5].details.path = 'C:\\private\\' + secret;
    rows[0].details.token = secret;
    rows.push(record(110, 'renderer', secret, {message: secret, stack: secret}));
    const serialized = JSON.stringify(analyze(rows));
    assert.ok(!serialized.includes(secret));
    assert.ok(!serialized.includes('play-1-1'));
    assert.ok(!serialized.includes('2026-10-09'));
    assert.equal(analyze(rows).runs[0].requests[0].route, 'unknown');
    assert.ok(!JSON.stringify(analyzeText('{"secret":"' + secret, options)).includes(secret));
});

test('strict input bounds, malformed records and invalid timestamps fail without partial statistics', () => {
    for (const text of ['{bad', 'null', '{}', JSON.stringify(record(0, 'app', 'start')).replace('00:00:00.000Z', '99:00:00.000Z')]) {
        assert.equal(analyzeText(text, options).status, 'INVALID_INPUT');
    }
    assert.deepEqual(analyzeText('x'.repeat(MAX_BYTES + 1), options).failures, ['INPUT_SIZE_LIMIT']);
    const line = JSON.stringify(record(0, 'app', 'start', {buildCommit: COMMIT}));
    assert.deepEqual(analyzeText(Array(MAX_LINES + 1).fill(line).join('\n'), options).failures, ['INPUT_LINE_LIMIT']);
    assert.deepEqual(analyzeText('\n'.repeat(MAX_LINES + 1), options).failures, ['INPUT_LINE_LIMIT']);
    assert.equal(analyze(fixture(), {}).expectedSourceCommit, null);
    assert.equal(analyzeText(fixture().map(JSON.stringify).join('\n') + '\n{bad', options).runs.length, 0);
});

test('request cap fails closed; statistics remain separated by route', () => {
    const manyRuns = Array.from({length: 33}, (_, index) => fixture('play-1-1', index * 1000)).flat();
    assert.deepEqual(analyze(manyRuns).failures, ['MULTIPLE_APP_RUNS_UNVERIFIABLE']);
    const manyRequests = [record(0, 'app', 'start', {buildCommit: COMMIT}),
        ...Array.from({length: 513}, (_, index) => record(index + 1, 'playback', 'play-request', {requestId: 'play-' + (index + 1) + '-1'}))];
    assert.deepEqual(analyze(manyRequests).failures, ['REQUEST_LIMIT']);
    const rows = [record(0, 'app', 'start', {buildCommit: COMMIT}),
        ...Array.from({length: 20}, (_, index) => fixture('play-' + (index + 1) + '-1', index * 1000).slice(1).map(row => {
            if (row.category === 'native-helper') {
                row.details.generationId = index + 1;
                if (row.details.currentGenerationId !== null) row.details.currentGenerationId = index + 1;
            }
            return row;
        })).flat()];
    const group = analyze(rows).summaryByRoute['cd2-http'].playToCorePlayingMs;
    assert.equal(group.observedCount, 20);
    assert.equal(group.p95Ms, 80);
    const native = fixture('play-21-1', 21000);
    for (const row of native) if (row.category === 'native-helper') {
        row.details.generationId = 21;
        if (row.details.currentGenerationId !== null) row.details.currentGenerationId = 21;
    }
    native[2].details.route = native[4].details.route = 'native';
    const separate = analyze([...rows, ...native.slice(1)]).summaryByRoute;
    assert.equal(separate.native.playToCorePlayingMs.observedCount, 1);
    assert.equal(separate['cd2-http'].playToCorePlayingMs.observedCount, 20);
});

test('file API rejects invalid UTF8 and CLI creates output exclusively without echoing paths', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-timing-test-'));
    const input = path.join(dir, 'input.jsonl');
    const output = path.join(dir, 'report.json');
    t.after(() => {
        for (const file of [input, output]) if (fs.existsSync(file)) fs.unlinkSync(file);
        fs.rmdirSync(dir);
    });
    fs.writeFileSync(input, Buffer.from([0xff, 0xfe, 0xfd]));
    assert.deepEqual(analyzeFile(input, options).failures, ['INVALID_UTF8']);
    fs.writeFileSync(input, fixture().map(row => JSON.stringify(row)).join('\n'));
    const args = [path.resolve(__dirname, '../tools/analyze-playback-timing.cjs'), '--log', input,
        '--source-commit', COMMIT, '--output', output, '--evidence', 'synthetic'];
    const first = spawnSync(process.execPath, args, {encoding: 'utf8'});
    assert.equal(first.status, 0, first.stderr);
    const original = fs.readFileSync(output, 'utf8');
    const repeat = spawnSync(process.execPath, args, {encoding: 'utf8'});
    assert.equal(repeat.status, 1);
    assert.equal(fs.readFileSync(output, 'utf8'), original);
    assert.ok(!repeat.stderr.includes(dir));
    const before = fs.readFileSync(input);
    args[6] = input;
    assert.equal(spawnSync(process.execPath, args, {encoding: 'utf8'}).status, 1);
    assert.deepEqual(fs.readFileSync(input), before);
});
