'use strict';
// Isolated Windows experiment only. No production config, package or cache restore.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const support = require('./playback-range-windows-smoke.cjs');
const diagnostics = require('./playback-range-helper-diagnostics.cjs');
const MODES = Object.freeze(['ram', 'whendone', 'no', 'immediate']);
const OWNER = 'ETE isolated mpv disk probe v1\n';
function boundedJson(file, maximum = 2 * 1024 * 1024) {
    support.regular(file);
    if (fs.statSync(file).size > maximum) throw Error('probe-json-limit');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function options(mode, directory) {
    if (!MODES.includes(mode) || !path.isAbsolute(directory)) throw Error('probe-invalid-mode');
    return {'cache': 'yes', 'cache-on-disk': mode !== 'ram', 'demuxer-cache-dir': directory,
        'demuxer-cache-unlink-files': mode === 'ram' ? 'whendone' : mode,
        'demuxer-max-bytes': 1048576, 'demuxer-max-back-bytes': 524288,
        'demuxer-donate-buffer': true, 'pause': false, 'volume': 0};
}
function childEnvironment(plan) {
    const env = support.childEnvironment({...plan, out: plan.out});
    for (const key of Object.keys(env)) if (/^(?:GITHUB_TOKEN|GH_TOKEN|GH_ENTERPRISE_TOKEN|ACTIONS_RUNTIME_TOKEN|ACTIONS_ID_TOKEN_REQUEST_TOKEN)$/i.test(key)) delete env[key];
    return {...env, APPDATA: path.join(plan.out, 'profile'), LOCALAPPDATA: path.join(plan.out, 'local'), MPV_HOME: path.join(plan.out, 'mpv')};
}
function physical(directory) {
    let current = path.parse(path.resolve(directory)).root;
    for (const part of path.relative(current, path.resolve(directory)).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        if (fs.lstatSync(current).isSymbolicLink()) throw Error('probe-redirected-path');
    }
    if (fs.realpathSync(directory) !== path.resolve(directory)) throw Error('probe-redirected-path');
}
function diskFiles(directory) {
    physical(directory); let total = 0;
    const files = fs.readdirSync(directory).sort().map(name => {
        const file = path.join(directory, name), stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || !/^[A-Za-z0-9._-]{1,160}$/.test(name)) throw Error('probe-cache-entry-invalid');
        total += stat.size;
        if (total > 128 * 1024 * 1024) throw Error('probe-cache-size-limit');
        const data = fs.readFileSync(file), after = fs.statSync(file);
        return {name, bytes: data.length, stable: stat.size === data.length && after.size === data.length,
            sha256: crypto.createHash('sha256').update(data).digest('hex')};
    });
    return {files, bytes: total};
}
function readSource(file) {
    const plan = support.readPlan(file);
    assert.deepEqual(support.verifyPlanRuntime(plan, path.resolve(__dirname, '..')), plan.identity);
    if (plan.fixtures.some(f => f.size > 34 * 1024 * 1024)) throw Error('probe-fixture-size-limit');
    return plan;
}
function prepare(sourceFile, out, mode) {
    sourceFile = fs.realpathSync(sourceFile); const source = readSource(sourceFile);
    options(mode, path.resolve(out, 'disk'));
    if (!path.isAbsolute(out) || fs.existsSync(out)) throw Error('probe-fresh-output-required');
    physical(path.dirname(out));
    const relative = path.relative(source.runtime, out);
    if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) throw Error('probe-output-outside-runtime-required');
    fs.mkdirSync(out); out = fs.realpathSync(out);
    fs.writeFileSync(path.join(out, 'owner'), OWNER, {flag: 'wx'});
    for (const dir of ['disk', 'profile', 'local', 'mpv', 'tmp']) fs.mkdirSync(path.join(out, dir));
    const plan = {schema: 1, scope: 'mpv-disk-options-observation-only', mode, out, sourceFile,
        sourcePlanSha256: support.hashFile(sourceFile), toolSha256: support.hashFile(__filename), identity: source.identity};
    support.writeNew(path.join(out, 'probe.json'), plan); return plan;
}
function readProbe(file) {
    const plan = boundedJson(file, 65536);
    if (plan.schema !== 1 || plan.scope !== 'mpv-disk-options-observation-only' || !MODES.includes(plan.mode) ||
        path.resolve(file) !== path.join(plan.out, 'probe.json') || plan.toolSha256 !== support.hashFile(__filename)) throw Error('probe-plan-invalid');
    physical(plan.out);
    if (fs.readFileSync(support.regular(path.join(plan.out, 'owner')), 'utf8') !== OWNER || support.hashFile(support.regular(plan.sourceFile)) !== plan.sourcePlanSha256) throw Error('probe-owner-or-source-drift');
    for (const dir of ['disk', 'profile', 'local', 'mpv', 'tmp']) physical(path.join(plan.out, dir));
    const source = readSource(plan.sourceFile); assert.deepEqual(source.identity, plan.identity);
    return {plan, source};
}
function sameOption(actual, expected) {
    // Fixed mpv choice_get() returns MPV_FORMAT_FLAG for the yes/no alternatives,
    // including cache=yes and demuxer-cache-unlink-files=no, not just flag options.
    const flag = value => value === 'yes' ? true : value === 'no' ? false : value;
    actual = flag(actual); expected = flag(expected);
    return actual === expected || typeof expected === 'number' && actual === String(expected);
}
const OPTION_NAMES = new Set(Object.keys(options('ram', path.resolve('synthetic-isolated-disk'))));
const ERROR_CODES = new Set(['probe-invalid-mode', 'probe-redirected-path', 'probe-cache-entry-invalid', 'probe-cache-size-limit', 'probe-fixture-size-limit',
    'probe-fresh-output-required', 'probe-output-outside-runtime-required', 'probe-plan-invalid', 'probe-owner-or-source-drift', 'probe-json-limit',
    'probe-cache-state-unavailable', 'probe-fw-bytes-unavailable', 'probe-deadline', 'probe-option-or-command-failed', 'probe-observation-timeout',
    'probe-helper-exit-unconfirmed', 'probe-fixed-Windows-Electron-required', 'probe-option-readback-mismatch', 'probe-observations-not-accepted',
    'probe-readback-not-accepted', 'probe-samples-incomplete', 'probe-not-established', 'property-unavailable', 'generation-required',
    'invalid-owned-plan', 'fixture-config-mutated', 'fixture-mutated', 'profile-owner-mismatch', 'redirected-owned-directory', 'nonphysical-file',
    'candidate-runtime-source', 'candidate-runtime-path', 'candidate-runtime-set', 'candidate-zip-identity', 'candidate-installer-receipt',
    'candidate-fixed-native-identity', 'candidate-changed-after-preparation', 'candidate-runtime-file', 'candidate-runtime-manifest',
    'candidate-runtime-inventory', 'candidate-maintained-source', 'entry-only-contract-failed', 'native-phase-failed:entry',
    'entry-deadline-no-native-requested', 'previous-receipt-exists-use-fresh-output', 'trial-physical-root-required', 'trial-controls-drift',
    'trial-base-tools-drift', 'trial-loader-source-or-target-invalid', 'trial-derived-file-set', 'trial-base-member-changed', 'trial-loader-copy-mismatch',
    'trial-descriptor-invalid', 'trial-sidecar-root-invalid', 'trial-loader-archive-lock', 'trial-fresh-root-required',
    'assertion-failed', 'unclassified']);
const SYSTEM_CODES = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOSPC', 'EIO', 'ETIMEDOUT']);
function safeFailure(error) {
    return {code: ERROR_CODES.has(error?.integrity?.code) ? error.integrity.code : ERROR_CODES.has(error?.message) ? error.message : ERROR_CODES.has(error?.code) ? error.code : error?.code === 'ERR_ASSERTION' ? 'assertion-failed' : 'unclassified',
        systemCode: SYSTEM_CODES.has(error?.code) ? error.code : null};
}
function safeStage(stage) {
    return typeof stage === 'string' && /^(?:worker-preflight|initialization|helper-start|helper-ready|option-readback|(?:first|same-helper-reopen|new-helper-reopen)-(?:load|loaded|forward|seek|stopped)|first-helper-exited)$/.test(stage) ? stage : 'unavailable';
}
function safeReadback(option, actual, expected) {
    const value = row => typeof row === 'boolean' || typeof row === 'number' && Number.isFinite(row) ? row : ['yes', 'no', 'auto', 'whendone', 'immediate'].includes(row) ? row : null;
    return {option: OPTION_NAMES.has(option) ? option : 'unavailable', actualType: actual === null ? 'null' : Array.isArray(actual) ? 'array' : typeof actual,
        expectedType: typeof expected, actualValue: value(actual), expectedValue: value(expected)};
}
function projectReadback(row) {
    const result = safeReadback(row?.option, row?.actualValue, row?.expectedValue);
    const types = ['undefined', 'null', 'array', 'object', 'string', 'boolean', 'number'];
    result.actualType = types.includes(row?.actualType) ? row.actualType : 'unavailable';
    result.expectedType = types.includes(row?.expectedType) ? row.expectedType : 'unavailable'; return result;
}
function workerDiagnostic(error, stage = 'worker-preflight') {return {stage: safeStage(stage), ...safeFailure(error)};}
function readWorkerDiagnostic(file) {
    if (!fs.existsSync(file)) return null;
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    const size = Math.min(stat.size, 65536), tail = Buffer.alloc(size), fd = fs.openSync(file, 'r');
    try {fs.readSync(fd, tail, 0, size, stat.size - size);} finally {fs.closeSync(fd);}
    for (const line of tail.toString('utf8').split(/\r?\n/).reverse()) if (line.startsWith('mpv-disk-probe-failure:')) {
        try {const row = JSON.parse(line.slice('mpv-disk-probe-failure:'.length)); return workerDiagnostic({message: row.code, code: row.systemCode}, row.stage);} catch (_) {}
    }
    return null;
}
function cacheState(value) {
    if (!value || typeof value !== 'object') throw Error('probe-cache-state-unavailable');
    const result = {};
    for (const key of ['fw-bytes', 'total-bytes', 'cache-end', 'reader-pts', 'eof', 'underrun']) {
        if (typeof value[key] === 'boolean' || typeof value[key] === 'number' && Number.isFinite(value[key])) result[key] = value[key];
    }
    result['seekable-ranges'] = Array.isArray(value['seekable-ranges']) ? value['seekable-ranges'].slice(0, 32).map(r => ({start: r.start, end: r.end})).filter(r => Number.isFinite(r.start) && Number.isFinite(r.end)) : [];
    if (!Object.hasOwn(result, 'fw-bytes')) throw Error('probe-fw-bytes-unavailable');
    return result;
}
function retentionEvidence(samples) {
    const stops = samples.filter(s => s.label.endsWith('-stopped'));
    const first = stops[0]?.disk.files || [];
    return {firstStopFiles: first.length, laterLoads: stops.slice(1).map(s => ({label: s.label,
        helperPid: s.helperPid, requests: s.sourceRequestsSinceLoad.length,
        servedBytes: s.sourceRequestsSinceLoad.reduce((n, r) => n + r.bytesScheduled, 0),
        oldFilesUnchanged: first.length && first.every(old => old.stable === true) ? first.every(old => s.disk.files.some(f => f.stable === true && f.name === old.name && f.bytes === old.bytes && f.sha256 === old.sha256)) : null,
        newNames: s.disk.files.filter(f => !first.some(old => old.name === f.name)).map(f => f.name)})),
        interpretation: 'File retention and source reads only; packet-cache restoration remains NOT_ASSESSED'};
}
// A live-child error is not an exit. Keep ownership until both events arrive.
function observeChild(child) {
    return new Promise(resolve => {
        let exit = null, closed = false, spawnError = false, transportError = false;
        function settle() {if (closed && (exit || spawnError)) resolve({pid: child.pid || null,
            ...(exit || {code: null, signal: null}), streamsClosed: true, processExited: !!exit, spawnError, transportError});}
        child.once('exit', (code, signal) => {exit = {code, signal}; settle();});
        child.once('close', () => {closed = true; settle();});
        child.on('error', () => {
            if (!child.pid) spawnError = true;
            else {transportError = true; try {child.kill();} catch (_) {}}
            settle();
        });
    });
}
async function collectHelperExit(owned, record, capture = diagnostics.capture) {
    record.outcome = 'UNCERTAIN';
    try {await owned.kill();} catch (_) {record.cleanupError = 'kill-failed'; try {owned.child?.kill();} catch (_) {}}
    try {
        await owned.exitPromise;
        record.exited = owned.exited === true;
        record.diagnostics = await capture(owned);
        if (record.exited && record.diagnostics.streamsClosed) record.outcome = 'EXIT_AND_CLOSE_CONFIRMED';
    } catch (_) {record.cleanupError = 'capture-failed';}
    if (record.cleanupError || record.outcome !== 'EXIT_AND_CLOSE_CONFIRMED' || !diagnostics.normalExit(record.diagnostics)) throw Error('probe-helper-exit-unconfirmed');
}
function validateObservations(report, plan, exit) {
    if (!exit.processExited || !exit.streamsClosed || exit.code !== 0 || exit.signal || exit.spawnError || exit.transportError ||
        report.schema !== 1 || report.scope !== plan.scope || report.status !== 'observed' || report.mode !== plan.mode || report.workerPid !== exit.pid ||
        !Array.isArray(report.helpers) || report.helpers.length !== 2 || report.helpers.some(h => !Number.isInteger(h.pid) || h.pid <= 0 || !h.exited ||
            h.outcome !== 'EXIT_AND_CLOSE_CONFIRMED' || h.cleanupError || !diagnostics.normalExit(h.diagnostics)) || report.helpers[0].pid === report.helpers[1].pid) throw Error('probe-observations-not-accepted');
    assert.deepEqual(report.identity, plan.identity);
    const expected = {...options(plan.mode, path.join(plan.out, 'disk')), 'demuxer-cache-dir': '<isolated-disk>'};
    for (const helper of report.helpers) {
        if (!helper.options || Object.keys(helper.options).length !== Object.keys(expected).length || Object.entries(expected).some(([k, v]) => !sameOption(helper.options[k], v))) throw Error('probe-readback-not-accepted');
    }
    for (const label of ['first-stopped', 'same-helper-reopen-stopped', 'new-helper-reopen-stopped']) {
        if (!Array.isArray(report.samples) || report.samples.filter(s => s.label === label).length !== 1) throw Error('probe-samples-incomplete');
    }
}
async function worker(file) {
    if (process.platform !== 'win32' || process.arch !== 'x64' || process.versions.electron !== '44.4.2' || process.type !== 'browser') throw Error('probe-fixed-Windows-Electron-required');
    // Validate all owned paths before setting app paths; no native code yet.
    const {plan, source} = readProbe(file);
    const {app, BrowserWindow} = require('electron');
    for (const key of ['appData', 'userData', 'sessionData']) app.setPath(key, path.join(plan.out, 'profile'));
    app.setAppLogsPath(path.join(plan.out, 'profile', 'logs'));
    process.env.APPDATA = path.join(plan.out, 'profile'); process.env.LOCALAPPDATA = path.join(plan.out, 'local');
    process.env.MPV_HOME = path.join(plan.out, 'mpv'); process.env.TEMP = path.join(plan.out, 'tmp'); process.env.TMP = process.env.TEMP;
    const report = {schema: 1, scope: plan.scope, mode: plan.mode, workerPid: process.pid, identity: plan.identity, status: 'UNKNOWN',
        samples: [], helpers: [], requestedOptions: null, stage: 'initialization', restoreAssessment: 'NOT_ASSESSED',
        note: 'Fresh helper is a new native process; no dat is opened as media. No transparent restore claim.'};
    report.requestedOptions = {...options(plan.mode, path.join(plan.out, 'disk')), 'demuxer-cache-dir': '<isolated-disk>'};
    const checkpoint = () => fs.writeFileSync(path.join(plan.out, 'observations.json'), JSON.stringify(report, null, 2) + '\n');
    let window, server, client, record, deadline, fatal = false;
    const ownedHelpers = new Map();
    const check = () => {if (fatal) throw Error('probe-deadline'); if (client?.operationErrors.length) throw Error('probe-option-or-command-failed');};
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(predicate) {const end = Date.now() + 10000; while (Date.now() < end) {check(); if (await predicate()) return; await delay(25);} throw Error('probe-observation-timeout');}
    async function finishHelper(owned = client) {
        if (!owned) return;
        const row = ownedHelpers.get(owned);
        try {await collectHelperExit(owned, row);}
        finally {
            if (row.outcome === 'EXIT_AND_CLOSE_CONFIRMED') {ownedHelpers.delete(owned); if (client === owned) client = null;}
            checkpoint();
        }
    }
    try {
        deadline = setTimeout(() => {fatal = true; for (const owned of ownedHelpers.keys()) {try {owned.child?.kill();} catch (_) {}}}, 100000);
        await app.whenReady();
        window = new BrowserWindow({show: false, width: 320, height: 180, webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false}});
        require('./playback-range-windows-hidden.cjs').protectHiddenWindow(window);
        const handle = window.getNativeWindowHandle();
        const hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
        server = await require('./playback-range-windows-hidden.cjs').fixtureServer(source);
        const url = server.origin + '/Videos/A/stream.avi';
        const {NativeHelperClient} = require(path.join(source.runtime, 'electronapp/native-helper/controller.js'));
        async function startHelper() {
            report.stage = 'helper-start'; checkpoint();
            readProbe(file); // Every new native process revalidates baseline/derived physical identities.
            client = new NativeHelperClient({helperPath: path.join(source.runtime, 'electronapp/native-helper/ete-mpv-helper.exe'),
                libmpvPath: path.join(source.runtime, 'electronapp/libmpv/x64/mpv-1.dll'), parentWindowHandle: hwnd});
            record = {pid: null, options: null, exited: false, outcome: 'UNCERTAIN'}; report.helpers.push(record); ownedHelpers.set(client, record);
            const started = client.start(); client.smokeClosePromise = new Promise(resolve => client.child.once('close', resolve));
            record.pid = client.child.pid; await started;
            assert.equal(client.handshake.libmpvVersion, require(path.join(source.runtime, 'electronapp/native-helper/service.js')).EXPECTED_LIBMPV_VERSION);
        }
        async function sample(label) {
            report.stage = label; checkpoint();
            check(); const state = cacheState(await client.getProperty('demuxer-cache-state', 2000));
            report.samples.push({label, helperPid: client.child.pid, state, disk: diskFiles(path.join(plan.out, 'disk')), requests: server.rows.map(r => ({...r}))}); checkpoint();
        }
        async function load(label) {
            client.beginGeneration(label, ['core-idle', 'time-pos', 'duration']);
            const expected = options(plan.mode, path.join(plan.out, 'disk')), actual = {};
            record.options = actual;
            for (const [key, value] of Object.entries(expected)) {
                report.stage = 'option-readback'; report.pendingOption = key; checkpoint();
                report.readback = safeReadback(key, undefined, value); checkpoint();
                client.setProperty(key, value); const got = await client.getProperty(key, 2000);
                report.readback = safeReadback(key, got, value); checkpoint();
                if (!sameOption(got, value)) throw Error('probe-option-readback-mismatch');
                actual[key] = key === 'demuxer-cache-dir' ? '<isolated-disk>' : got;
            }
            delete report.pendingOption; delete report.readback; check(); report.stage = label + '-load'; checkpoint();
            const requestStart = server.rows.length;
            await client.load(['loadfile', url]).promise;
            await until(() => client.state.fileLoaded);
            await sample(label + '-loaded'); await delay(1200); await sample(label + '-forward');
            client.submitCommand(['seek', '5', 'absolute']); await delay(500); await sample(label + '-seek');
            await client.stop(); await until(() => server.active.size === 0);
            report.samples.push({label: label + '-stopped', helperPid: client.child.pid, disk: diskFiles(path.join(plan.out, 'disk')),
                sourceRequestsSinceLoad: server.rows.slice(requestStart).map(r => ({...r}))}); checkpoint();
        }
        await startHelper(); await load('first'); await load('same-helper-reopen'); await finishHelper();
        report.samples.push({label: 'first-helper-exited', disk: diskFiles(path.join(plan.out, 'disk'))}); checkpoint();
        await startHelper(); await load('new-helper-reopen'); await finishHelper();
        assert.notEqual(report.helpers[0].pid, report.helpers[1].pid);
        report.retention = retentionEvidence(report.samples);
        readProbe(file);
        report.status = 'observed'; // Observations, not a claim that mpv restored a cache.
    } catch (error) {report.status = 'UNKNOWN'; report.reason = fatal ? 'deadline' : 'probe-failed-or-option-unsupported';
        report.failure = workerDiagnostic(error, report.stage); console.error('mpv-disk-probe-failure:' + JSON.stringify(report.failure));}
    finally {
        for (const owned of [...ownedHelpers.keys()]) {try {await finishHelper(owned);} catch (_) {report.status = 'UNKNOWN'; report.cleanupFailure = 'helper-exit';}}
        if (ownedHelpers.size) {report.status = 'UNKNOWN'; report.nativeOutcome = 'UNCERTAIN';}
        try {if (server) await server.close();} catch (_) {report.status = 'UNKNOWN'; report.cleanupFailure = 'origin-close';}
        if (window && !window.isDestroyed()) window.destroy(); clearTimeout(deadline); checkpoint();
        app.exit(report.status === 'observed' ? 0 : 1);
    }
}
async function run(file, execute) {
    if (execute !== true || process.platform !== 'win32' || process.arch !== 'x64') throw Error('probe-explicit-Windows-required');
    const {plan, source} = readProbe(file);
    for (const name of ['observations.json', 'worker.log', 'run.json']) if (fs.existsSync(path.join(plan.out, name))) throw Error('probe-fresh-run-required');
    const env = childEnvironment({...source, out: plan.out});
    const fd = fs.openSync(path.join(plan.out, 'worker.log'), 'wx'); let timedOut = false, timer, child;
    const receipt = {scope: plan.scope, pid: null, status: 'UNKNOWN', nativeOutcome: 'UNCERTAIN', streamsClosed: false};
    const receiptFile = path.join(plan.out, 'run.json'); support.writeNew(receiptFile, receipt);
    const save = () => fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n');
    try {
        child = cp.spawn(path.join(source.runtime, 'x64/electron/electron.exe'), [__filename, '--worker', '--probe=' + file],
            {cwd: plan.out, env, shell: false, windowsHide: true, stdio: ['ignore', fd, fd]});
        const completion = observeChild(child); receipt.pid = child.pid || null; save();
        timer = setTimeout(() => {timedOut = true; receipt.timedOut = true; save(); try {child.kill();} catch (_) {}}, 120000);
        const exit = await completion; Object.assign(receipt, exit, {timedOut}); save();
        if (timedOut) throw Error('probe-not-established');
        readProbe(file); validateObservations(boundedJson(path.join(plan.out, 'observations.json')), plan, exit);
        Object.assign(receipt, {status: 'observed', nativeOutcome: 'EXIT_AND_CLOSE_CONFIRMED'}); save(); return receipt;
    } catch (error) {receipt.status = 'UNKNOWN'; receipt.reason = 'probe-not-established'; receipt.failure = safeFailure(error);
        receipt.workerFailure = readWorkerDiagnostic(path.join(plan.out, 'worker.log')); save(); throw Error('probe-not-established');
    } finally {clearTimeout(timer); fs.closeSync(fd);}
}
async function main(argv) {
    const command = argv[0], args = support.argumentsOf(argv.slice(1), ['--plan', '--out', '--mode', '--probe', '--execute']);
    if (command === 'prepare') return prepare(args['--plan'], args['--out'], args['--mode']);
    if (command === 'run') return run(args['--probe'], args['--execute']);
    throw Error('probe-invalid-command');
}
const workerEntry = process.versions.electron && process.type === 'browser' && process.argv.includes('--worker') && path.resolve(process.argv[1] || '') === __filename;
if (workerEntry) worker(support.argumentsOf(process.argv.slice(2), ['--worker', '--probe'])['--probe']).catch(error => {
    console.error('mpv-disk-probe-failure:' + JSON.stringify(workerDiagnostic(error))); require('electron').app.exit(1);
});
else if (require.main === module) main(process.argv.slice(2)).then(r => console.log(JSON.stringify(r))).catch(() => {console.error('disk-probe-failed'); process.exitCode = 1;});
module.exports = {MODES, options, childEnvironment, diskFiles, sameOption, safeFailure, safeStage, safeReadback, projectReadback, workerDiagnostic, readWorkerDiagnostic,
    cacheState, retentionEvidence, prepare, readProbe, run, boundedJson, observeChild, collectHelperExit, validateObservations};
