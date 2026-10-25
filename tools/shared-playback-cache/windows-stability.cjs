'use strict';

// Repeated bounded Node-only checks of the existing synthetic shared-cache Alameda case.
// This is not a native Windows playback, renderer-media or deployment acceptance test.
const fs = require('node:fs');
const path = require('node:path');
const diagnostics = require('./windows-diagnostics.cjs');

const TEST_FILE = 'tests/playback-prefix-alameda-auto.test.cjs';
const NAME_PATTERN = 'trusted-cd2-shared';
const ALLOWED_REPEATS = Object.freeze([2, 4, 6, 8]);
const PER_TRIAL_MS = 8000;
const TOTAL_MS = 80000;
const SCOPE = 'Node synthetic-helper stability only; native Windows media execution not performed';
const METRICS = Object.freeze(['selectionMs', 'probeMs', 'storeOpenMs']);

function parseArgs(argv) {
    const values = Object.create(null);
    for (const argument of argv) {
        const at = argument.indexOf('=');
        if (at <= 2) throw Error('stability-argument-invalid');
        const key = argument.slice(0, at), value = argument.slice(at + 1);
        if (!['--out', '--repeats'].includes(key) || !value || Object.hasOwn(values, key)) throw Error('stability-argument-invalid');
        values[key] = value;
    }
    if (!values['--out'] || !path.isAbsolute(values['--out'])) throw Error('stability-out-absolute-required');
    const repeats = values['--repeats'] === undefined ? 4 : Number(values['--repeats']);
    if (!ALLOWED_REPEATS.includes(repeats)) throw Error('stability-repeats-invalid');
    return {out: path.resolve(values['--out']), repeats};
}

function tapFacts(tap) {
    const lines = tap.split(/\r?\n/).map(line => line.trim());
    const number = key => {
        const row = lines.find(line => line.startsWith('# ' + key + ' '));
        if (!row) return null;
        const value = Number(row.slice(('# ' + key + ' ').length));
        return Number.isSafeInteger(value) && value >= 0 ? value : null;
    };
    const passed = lines.filter(line => /^ok \d+ - /.test(line) && !/\s# SKIP\b/.test(line));
    const failed = lines.filter(line => /^not ok \d+ - /.test(line));
    const targetPassed = passed.filter(line => line.includes(NAME_PATTERN));
    return {tests: number('tests'), pass: number('pass'), fail: number('fail'), cancelled: number('cancelled'),
        skipped: number('skipped'), targetPassLines: targetPassed.length, passLines: passed.length, failLines: failed.length};
}

function resultLine(tap) {
    const rows = [];
    for (const line of tap.split(/\r?\n/)) {
        const trimmed = line.trim().replace(/^#\s*/, '');
        if (!trimmed.startsWith('{') || !trimmed.includes('shared-byte-alameda-natural-result')) continue;
        try {
            const value = JSON.parse(trimmed);
            if (value.type === 'shared-byte-alameda-natural-result') rows.push(value);
        } catch (_) {return null;}
    }
    return rows.length === 1 ? rows[0] : null;
}

function validMetrics(value) {
    return value && value.scenario === NAME_PATTERN && value.syntheticHelper === true && value.nativeDll === false &&
        value.exactSyntheticCurrentBytes === 314572800 && value.preloadBytes === 40 && value.overlapDiskBytes === 48 &&
        value.freshActualBOriginRequests === 1 && value.persistedCurrentBytes === 40 && value.nextBytesAfterReopen === 0 &&
        METRICS.every(key => Number.isFinite(value[key]) && value[key] >= 0);
}

function safeRunResult(result) {
    return {exitCode: Number.isInteger(result?.code) ? result.code : null,
        signal: typeof result?.signal === 'string' && /^SIG[A-Z0-9]+$/.test(result.signal) ? result.signal : null, timedOut: result?.timedOut === true,
        overflow: result?.overflow === true, streamsClosed: result?.streamsClosed === true,
        elapsedMs: Number.isFinite(result?.elapsedMs) && result.elapsedMs >= 0 ? result.elapsedMs : null,
        cleanupAssessment: ['TEST_PROCESS_EXITED', 'OWNED_TEST_EXITED_DESCENDANTS_NOT_INSPECTED'].includes(result?.cleanupAssessment)
            ? result.cleanupAssessment : 'UNKNOWN'};
}
function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function runWindowsStability({out, repeats = 4, repo = path.resolve(__dirname, '../..'), runFile = diagnostics.runFile,
    now = Date.now, emit = value => process.stdout.write(value + '\n')} = {}) {
    if (typeof out !== 'string' || !path.isAbsolute(out) || path.resolve(out) !== out || fs.existsSync(out)) throw Error('stability-fresh-absolute-output-required');
    if (!ALLOWED_REPEATS.includes(repeats) || typeof runFile !== 'function' || typeof now !== 'function') throw Error('stability-options-invalid');
    if (!path.isAbsolute(repo)) throw Error('stability-repo-absolute-required');
    fs.mkdirSync(out, {mode: 0o700});
    const started = now(), trials = [];
    for (let index = 1; index <= repeats; index++) {
        const remaining = TOTAL_MS - (now() - started);
        if (remaining <= 1000) {
            trials.push({trial: index, status: 'NOT_RUN', reason: 'total-deadline'});
            emit('SHARED_CACHE_STABILITY_TRIAL ' + JSON.stringify(trials.at(-1)));
            continue;
        }
        const tape = path.join(out, 'trial-' + String(index).padStart(2, '0') + '.tap');
        let result;
        try {
            result = await runFile({repo, file: TEST_FILE, output: tape, timeoutMs: Math.min(PER_TRIAL_MS, remaining - 1000), echo: true, namePattern: NAME_PATTERN});
        } catch (_) {result = {status: 'FAIL', timedOut: false, overflow: false, streamsClosed: false, cleanupAssessment: 'RUNNER_ERROR'};}
        let facts = null, metrics = null, parseStatus = 'FAIL';
        try {
            const tap = fs.readFileSync(tape, 'utf8'); facts = tapFacts(tap); metrics = resultLine(tap);
            if (facts.tests !== null && facts.pass === 1 && facts.fail === 0 && facts.cancelled === 0 &&
                facts.targetPassLines === 1 && facts.passLines === 1 && facts.failLines === 0 && validMetrics(metrics)) parseStatus = 'PASS';
        } catch (_) { /* Missing/unreadable TAP is a failed trial. */ }
        const safe = safeRunResult(result);
        const processStatus = result?.status === 'PASS' && result?.code === 0 && result?.timedOut === false &&
            result?.overflow === false && result?.streamsClosed === true ? 'PASS' : 'FAIL';
        const status = processStatus === 'PASS' && parseStatus === 'PASS' ? 'PASS' : 'FAIL';
        const trial = {trial: index, ...safe, status, processStatus, tapStatus: parseStatus, tapTests: facts?.tests ?? null,
            tapSkipped: facts?.skipped ?? null, metrics: status === 'PASS' ? Object.fromEntries(METRICS.map(key => [key, metrics[key]])) : null};
        trials.push(trial); emit('SHARED_CACHE_STABILITY_TRIAL ' + JSON.stringify(trial));
    }
    const completed = trials.filter(row => row.status === 'PASS');
    const aggregates = Object.fromEntries(METRICS.map(key => [key, median(completed.map(row => row.metrics[key]))]));
    const report = {schema: 1, status: trials.length === repeats && trials.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL',
        scope: SCOPE, platform: process.platform, nodeVersion: process.version, nativeWindowsExecution: false,
        namePattern: NAME_PATTERN, requestedRepeats: repeats, completedRepeats: completed.length, elapsedMs: now() - started,
        mediansMs: aggregates, trials};
    if (report.elapsedMs > TOTAL_MS) report.status = 'FAIL';
    fs.writeFileSync(path.join(out, 'stability.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    emit('SHARED_CACHE_STABILITY_RESULT ' + JSON.stringify(report));
    return report;
}

module.exports = {TEST_FILE, NAME_PATTERN, ALLOWED_REPEATS, PER_TRIAL_MS, TOTAL_MS, SCOPE, parseArgs, tapFacts, resultLine,
    validMetrics, median, runWindowsStability};

if (require.main === module) {
    try {
        const options = parseArgs(process.argv.slice(2));
        runWindowsStability(options).then(report => {if (report.status !== 'PASS') process.exitCode = 1;})
            .catch(() => {process.stderr.write('SHARED_CACHE_STABILITY_FAILED\n'); process.exitCode = 1;});
    } catch (_) {process.stderr.write('SHARED_CACHE_STABILITY_ARGUMENTS_INVALID\n'); process.exitCode = 2;}
}
