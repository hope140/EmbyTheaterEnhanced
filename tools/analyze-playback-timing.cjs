'use strict';

// Offline consumer of existing JSONL. Never discovers profiles or starts playback.
const fs = require('node:fs');
const {TextDecoder} = require('node:util');

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 4096;
const MAX_REQUESTS = 512;
const MAX_INTERVAL_MS = 3600000;
const REQUEST = /^play-(?:[1-9][0-9]*|local)-[1-9][0-9]*$/;
const ROUTES = new Set(['native', 'mount', 'cd2-http', 'direct-url']);
const MODES = new Set(['legacy', 'direct', 'same-origin']);
const TERMINALS = new Set(['resolve-hit', 'resolve-miss', 'resolve-error', 'resolve-cancelled']);
const METRICS = {
    playToResolverMs: ['playback/play-request', 'playback/resolver-complete'],
    resolverToLoadRequestMs: ['playback/resolver-complete', 'playback/loadfile-requested'],
    loadRequestToCorePlayingMs: ['playback/loadfile-requested', 'playback/core-playing'],
    playToCorePlayingMs: ['playback/play-request', 'playback/core-playing'],
    loadRequestToFileLoadedMs: ['playback/loadfile-requested', 'native-helper/file-loaded'],
    nativeStartToFileLoadedMs: ['native-helper/start-file', 'native-helper/file-loaded']
};
const NATIVE = new Set(['generation-begin', 'generation-retired', 'start-file', 'file-loaded', 'end-file']);
const PLAYBACK = new Set(['play-request', 'resolver-complete', 'loadfile-requested', 'core-playing', 'stop']);
const unavailable = reason => ({status: 'UNAVAILABLE', milliseconds: null, reason});
const observed = milliseconds => ({status: 'OBSERVED', milliseconds, reason: null});
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value > 0;

function baseReport(options) {
    return {
        schemaVersion: 1,
        status: 'COMPLETE',
        completionMeaning: 'OFFLINE_ANALYSIS_ONLY',
        diagnosticCompleteness: 'NOT_VERIFIED',
        evidenceKind: options.evidenceKind === 'synthetic' ? 'synthetic' : 'unspecified',
        expectedSourceCommit: options.sourceCommit,
        timingBasis: 'MAIN_LOG_RECEIPT_WALL_CLOCK',
        failures: [],
        counts: {records: 0, preStartRecords: 0, ignoredNativeRecords: 0, skippedSourceRuns: 0},
        runs: [],
        summaryByRoute: {},
        unavailableStages: {
            metadataOnly: 'NO_SEPARATE_BOUNDARIES',
            cd2FindOnly: 'PHASE_EVENTS_HAVE_NO_REQUEST_ID',
            cd2UrlOnly: 'PHASE_EVENTS_HAVE_NO_REQUEST_ID',
            firstVisibleFrame: 'NO_PRESENTATION_EVIDENCE',
            directoryColdWarm: 'NO_DIRECTORY_CACHE_EVIDENCE'
        },
        limitations: [
            'Intervals are log receipt observations, not monotonic producer timings or visible first frames.',
            'The play marker is libmpv entry, not the user action or complete PlaybackManager startup.',
            'CD2 reported elapsedMs uses Date.now; clamping by the producer may hide clock changes.',
            'Missing, duplicated, retired or unassociated markers are not paired by temporal proximity.',
            'Absence of suppression/drop markers cannot prove complete delivery or successful final flush.',
            'Timestamps have millisecond resolution; zero differences are not precise zero-duration measurements.',
            'Synthetic samples do not establish real Emby/CD2 performance or pre-warm benefit.',
            'No raw identifiers, timestamps, paths or unknown record fields are included.'
        ]
    };
}

function analyzeText(text, options = {}) {
    const safeOptions = {
        sourceCommit: typeof options.sourceCommit === 'string' && /^[a-f0-9]{40}$/i.test(options.sourceCommit)
            ? options.sourceCommit.toLowerCase() : null,
        evidenceKind: options.evidenceKind
    };
    const report = baseReport(safeOptions);
    function fail(code) {
        report.status = 'INVALID_INPUT';
        report.failures = [code];
        report.runs = [];
        report.summaryByRoute = {};
        return report;
    }
    if (!safeOptions.sourceCommit) return fail('EXPECTED_SOURCE_COMMIT_REQUIRED');
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) return fail('INPUT_SIZE_LIMIT');
    const physicalLines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
    if (physicalLines[physicalLines.length - 1] === '') physicalLines.pop();
    if (physicalLines.length > MAX_LINES) return fail('INPUT_LINE_LIMIT');
    const lines = physicalLines.filter(line => line.trim());
    const runs = [];
    let run;
    let requestCount = 0;
    for (let index = 0; index < lines.length; index++) {
        if (Buffer.byteLength(lines[index], 'utf8') > 65536) return fail('RECORD_SIZE_LIMIT');
        let record;
        try { record = JSON.parse(lines[index]); } catch (_) { return fail('MALFORMED_JSONL'); }
        if (!object(record) || record.schemaVersion !== 1 || !object(record.details)) return fail('INVALID_RECORD');
        const at = typeof record.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.timestamp)
            ? Date.parse(record.timestamp) : NaN;
        if (!Number.isFinite(at) || new Date(at).toISOString() !== record.timestamp) return fail('INVALID_TIMESTAMP');
        report.counts.records++;
        const d = record.details;
        if (record.category === 'app' && record.event === 'start') {
            // Existing records have no per-writer run identity. A second start
            // cannot prove the old writer flushed before the new one began.
            if (runs.length) return fail('MULTIPLE_APP_RUNS_UNVERIFIABLE');
            run = {ordinal: runs.length + 1, matched: typeof d.buildCommit === 'string' &&
                d.buildCommit.toLowerCase() === safeOptions.sourceCommit, lastAt: at,
                clockRegression: false, diagnosticGap: false, requests: new Map(), nativeKeys: new Map()};
            runs.push(run);
        }
        if (!run) { report.counts.preStartRecords++; continue; }
        if (at < run.lastAt) run.clockRegression = true;
        run.lastAt = at;
        if (record.event === 'diagnostics-suppressed' || Number(d.diagnosticPendingDrops) > 0) run.diagnosticGap = true;
        if (!run.matched) continue;
        const kind = record.category + '/' + record.event;
        const relevant = record.category === 'playback' && PLAYBACK.has(record.event) ||
            record.category === 'native-helper' && NATIVE.has(record.event) ||
            record.category === 'cd2' && (record.event === 'resolve-start' || TERMINALS.has(record.event));
        if (!relevant) continue;
        if (record.category === 'native-helper' &&
            (d.association !== 'available' || !integer(d.helperRun) || !integer(d.generationId) ||
             !['ACCEPT', 'BEGIN_GENERATION', 'RETIRE_GENERATION'].includes(d.disposition))) {
            report.counts.ignoredNativeRecords++;
            continue;
        }
        if (typeof d.requestId !== 'string' || d.requestId.length > 64 || !REQUEST.test(d.requestId)) continue;
        let request = run.requests.get(d.requestId);
        if (!request) {
            if (++requestCount > MAX_REQUESTS) return fail('REQUEST_LIMIT');
            request = {ordinal: run.requests.size + 1, records: [], routes: new Set()};
            run.requests.set(d.requestId, request);
        }
        const item = {kind, event: record.event, category: record.category, at, index,
            disposition: d.disposition, currentGenerationId: d.currentGenerationId,
            mode: MODES.has(d.mode) ? d.mode : null,
            elapsedMs: typeof d.elapsedMs === 'number' && Number.isFinite(d.elapsedMs) &&
                d.elapsedMs >= 0 && d.elapsedMs <= MAX_INTERVAL_MS ? d.elapsedMs : null};
        if (record.category === 'native-helper') {
            item.nativeKey = d.helperRun + ':' + d.generationId;
            item.generationId = d.generationId;
            let ownership = run.nativeKeys.get(item.nativeKey);
            if (!ownership) { ownership = []; run.nativeKeys.set(item.nativeKey, ownership); }
            ownership.push({requestId: d.requestId, item});
        }
        if (record.category === 'playback' && ['resolver-complete', 'loadfile-requested'].includes(record.event) && ROUTES.has(d.route)) {
            request.routes.add(d.route);
        }
        request.records.push(item);
    }
    if (!runs.length) return fail('APP_START_REQUIRED');
    for (const current of runs) {
        if (!current.matched) { report.counts.skippedSourceRuns++; continue; }
        const output = {run: current.ordinal, clockRegression: current.clockRegression,
            observedDiagnosticGap: current.diagnosticGap, requests: []};
        for (const [requestId, request] of current.requests) {
            const rows = request.records;
            const nativeBegins = rows.filter(row => row.kind === 'native-helper/generation-begin');
            function nativeValid(row) {
                if (row.category !== 'native-helper') return true;
                const lifecycle = current.nativeKeys.get(row.nativeKey) || [];
                const owners = lifecycle.filter(entry => entry.item.event === 'generation-begin');
                if (nativeBegins.length !== 1 || owners.length !== 1 || owners[0].requestId !== requestId) return false;
                const begin = owners[0].item;
                if (lifecycle.some(entry => entry.requestId !== requestId)) return false;
                const retired = lifecycle.filter(entry => entry.item.event === 'generation-retired').map(entry => entry.item);
                return begin.disposition === 'BEGIN_GENERATION' && begin.currentGenerationId === begin.generationId &&
                    row.disposition === 'ACCEPT' && row.currentGenerationId === row.generationId && row.index > begin.index &&
                    !retired.some(other => other.index <= row.index);
            }
            const problem = current.clockRegression ? 'CLOCK_REGRESSION' : current.diagnosticGap ? 'DIAGNOSTIC_GAP' :
                rows.filter(row => row.kind === 'playback/play-request').length > 1 ? 'DUPLICATE_PLAY_REQUEST' : null;
            function interval(startKind, endKind) {
                if (problem) return unavailable(problem);
                const starts = rows.filter(row => row.kind === startKind);
                const ends = rows.filter(row => row.kind === endKind);
                if (!starts.length || !ends.length) return unavailable('MISSING_MARKER');
                if (starts.length !== 1 || ends.length !== 1) return unavailable('AMBIGUOUS_MARKERS');
                const a = starts[0], b = ends[0];
                if (!nativeValid(a) || !nativeValid(b)) return unavailable('INVALID_NATIVE_ASSOCIATION');
                const duration = b.at - a.at;
                if (b.index <= a.index || duration < 0 || duration > MAX_INTERVAL_MS) return unavailable('ORDER_OR_INTERVAL_INVALID');
                if (rows.some(row => ['playback/stop', 'native-helper/generation-retired'].includes(row.kind) &&
                    row.index <= b.index)) return unavailable('REQUEST_RETIRED_DURING_INTERVAL');
                if (duration === 0) return unavailable('BELOW_CLOCK_RESOLUTION');
                return observed(duration);
            }
            const metrics = {};
            for (const [name, endpoints] of Object.entries(METRICS)) metrics[name] = interval(...endpoints);
            const starts = rows.filter(row => row.kind === 'cd2/resolve-start');
            const ends = rows.filter(row => row.category === 'cd2' && TERMINALS.has(row.event));
            let cd2 = unavailable('MISSING_MARKER');
            if (problem) cd2 = unavailable(problem);
            else if (starts.length > 1 || ends.length > 1) cd2 = unavailable('MULTIPLE_CD2_ATTEMPTS');
            else if (starts.length === 1 && ends.length === 1) {
                const a = starts[0], b = ends[0];
                const retired = rows.some(row => ['playback/stop', 'native-helper/generation-retired'].includes(row.kind) && row.index <= b.index);
                cd2 = retired ? unavailable('REQUEST_RETIRED_DURING_INTERVAL') :
                    a.mode && a.mode === b.mode && b.index > a.index && b.at >= a.at &&
                    a.elapsedMs === 0 && b.elapsedMs !== null
                    ? b.elapsedMs === 0 ? unavailable('ZERO_OR_CLOCK_CLAMPED') : observed(b.elapsedMs)
                    : unavailable('INVALID_CD2_ATTEMPT');
            }
            metrics.cd2ReportedResolveMs = cd2;
            output.requests.push({sample: request.ordinal, route: request.routes.size === 1 ? [...request.routes][0] : 'unknown', metrics});
        }
        report.runs.push(output);
    }
    if (!report.runs.length) return fail('SOURCE_COMMIT_NOT_FOUND');
    for (const runOutput of report.runs) for (const sample of runOutput.requests) {
        const group = report.summaryByRoute[sample.route] ||= {};
        for (const [name, metric] of Object.entries(sample.metrics)) {
            const stats = group[name] ||= {values: [], unavailableCount: 0};
            if (metric.status === 'OBSERVED') stats.values.push(metric.milliseconds);
            else stats.unavailableCount++;
        }
    }
    for (const group of Object.values(report.summaryByRoute)) for (const [name, stats] of Object.entries(group)) {
        const sorted = stats.values.sort((a, b) => a - b);
        const n = sorted.length;
        group[name] = {observedCount: n, unavailableCount: stats.unavailableCount,
            minMs: n ? sorted[0] : null, maxMs: n ? sorted[n - 1] : null,
            medianMs: n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null,
            p95Ms: n >= 20 ? sorted[Math.ceil(n * 0.95) - 1] : null};
    }
    return report;
}

function analyzeFile(file, options) {
    let fd;
    try {
        fd = fs.openSync(file, 'r');
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > MAX_BYTES) return fileFailure('INPUT_FILE_LIMIT', options);
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let length = 0;
        while (length < buffer.length) {
            const read = fs.readSync(fd, buffer, length, buffer.length - length, null);
            if (!read) break;
            length += read;
        }
        if (length > MAX_BYTES) return fileFailure('INPUT_SIZE_LIMIT', options);
        let text;
        try { text = new TextDecoder('utf-8', {fatal: true}).decode(buffer.subarray(0, length)); }
        catch (_) { return fileFailure('INVALID_UTF8', options); }
        return analyzeText(text, options);
    } catch (_) { return fileFailure('INPUT_READ_FAILED', options); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
}

function fileFailure(code, options) {
    const report = analyzeText('', options);
    report.failures = [code];
    return report;
}

function main(args) {
    const values = {};
    const names = new Set(['--log', '--source-commit', '--output', '--evidence']);
    for (let i = 0; i < args.length; i += 2) {
        if (!names.has(args[i]) || !args[i + 1] || values[args[i]] !== undefined) throw new Error('INVALID_ARGUMENTS');
        values[args[i]] = args[i + 1];
    }
    if (!values['--log'] || !values['--source-commit'] || !values['--output'] ||
        values['--evidence'] && !['synthetic', 'unspecified'].includes(values['--evidence'])) throw new Error('INVALID_ARGUMENTS');
    const report = analyzeFile(values['--log'], {sourceCommit: values['--source-commit'], evidenceKind: values['--evidence']});
    // Exclusive creation also prevents accidentally overwriting the input or a prior report.
    fs.writeFileSync(values['--output'], JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
    process.stdout.write(JSON.stringify({status: report.status, runs: report.runs.length, failures: report.failures}) + '\n');
    return report.status === 'COMPLETE' ? 0 : 1;
}

if (require.main === module) {
    try { process.exitCode = main(process.argv.slice(2)); }
    catch (_) { process.stderr.write('TIMING_ANALYSIS_FAILED: check arguments and choose a new output file.\n'); process.exitCode = 1; }
}
module.exports = {analyzeText, analyzeFile, MAX_BYTES, MAX_LINES};
