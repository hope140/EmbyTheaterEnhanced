'use strict';
// Fixed-runtime, finite packet-export experiment. Never imported by production.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const cp = require('node:child_process');
const support = require('./playback-range-windows-smoke.cjs');
const disk = require('./playback-buffer-disk-probe.cjs');
const diagnostics = require('./playback-range-helper-diagnostics.cjs');
const SCOPE = 'fixed-mpv-finite-buffer-export-NOT-transparent-restore';
const OWNER = 'ETE isolated finite buffer export v1\n';
const MAX_FILE = 34 * 1024 * 1024;
const MAX_SLOTS = 192 * 25;
const STAGES = new Set(['preflight', 'app-ready', 'source-helper', 'source-load', 'source-advance', 'source-pause',
    'source-stable', 'export', 'export-inspect', 'source-stop', 'source-exit', 'clip-helper', 'clip-load', 'clip-decode', 'clip-stop', 'complete']);
const CODES = new Set(['export-input-invalid', 'export-file-limit', 'export-avi-invalid', 'export-avi-format', 'export-packets-invalid',
    'export-window-unavailable', 'export-source-not-stable', 'export-extra-source-read', 'export-command-failed', 'export-file-changed',
    'export-mapping-invalid', 'export-native-deadline', 'export-stage-timeout', 'export-result-invalid', 'export-owned-path',
    'export-fresh-root', 'export-owner-drift', 'export-receipt-invalid', 'export-explicit-Windows-required', 'export-fixed-Electron-required',
    'export-helper-exit', 'export-native-not-established']);
const OPTIONS = Object.freeze({'cache': 'yes', 'cache-on-disk': false, 'demuxer-max-bytes': 4 * 1048576,
    'demuxer-max-back-bytes': 2 * 1048576, 'demuxer-donate-buffer': false, 'pause': false, 'volume': 0}); // Probe only, not product defaults.
function safeFailure(error, stage) {
    const old = disk.safeFailure(error);
    const format = formatDiagnostic(error?.avi);
    return {stage: STAGES.has(stage) ? stage : 'preflight', code: CODES.has(error?.message) ? error.message : old.code, systemCode: old.systemCode, ...(format ? {format} : {})};
}
function formatDiagnostic(value) {
    if (!value || !['packet-size', 'packet-count', 'timeline-slots', 'timebase', 'chunk-boundary'].includes(value.reason)) return null;
    const result = {reason: value.reason};
    for (const key of ['offset', 'actualBytes', 'expectedBytes', 'packetCount', 'emptyPackets', 'slots', 'rate', 'scale']) {
        if (Number.isSafeInteger(value[key]) && value[key] >= 0) result[key] = value[key];
    }
    return result;
}
function physical(directory) {
    let current = path.parse(path.resolve(directory)).root;
    for (const part of path.relative(current, path.resolve(directory)).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        if (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink()) throw Error('export-owned-path');
    }
}
function aviPackets(file) {
    support.regular(file);
    const size = fs.statSync(file).size;
    if (size < 64 || size > MAX_FILE) throw Error('export-file-limit');
    const data = fs.readFileSync(file), packets = []; let rate, scale, width, height, emptyPackets = 0, slots = 0;
    const fail = (code, reason, values = {}) => {const error = Error(code); error.avi = {reason, packetCount: packets.length, emptyPackets, slots, rate, scale, ...values}; throw error;};
    if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'AVI ' || data.readUInt32LE(4) + 8 !== size) throw Error('export-avi-invalid');
    function walk(start, end, movie, depth) {
        if (depth > 4) throw Error('export-avi-invalid');
        for (let at = start; at < end;) {
            if (at + 8 > end) throw Error('export-avi-invalid');
            const tag = data.toString('ascii', at, at + 4), bytes = data.readUInt32LE(at + 4), body = at + 8, next = body + bytes + (bytes % 2);
            if (next > end) fail('export-avi-invalid', 'chunk-boundary', {offset: at, actualBytes: bytes});
            if (tag === 'LIST') {
                if (bytes < 4) throw Error('export-avi-invalid');
                walk(body + 4, body + bytes, movie || data.toString('ascii', body, body + 4) === 'movi', depth + 1);
            } else if (tag === 'strh') {
                if (bytes < 56 || data.toString('ascii', body, body + 4) !== 'vids' || scale !== undefined) throw Error('export-avi-format');
                scale = data.readUInt32LE(body + 20); rate = data.readUInt32LE(body + 24);
            } else if (tag === 'strf') {
                if (bytes < 40 || width !== undefined || data.readUInt16LE(body + 14) !== 24 || data.readUInt32LE(body + 16) !== 0) throw Error('export-avi-format');
                width = data.readInt32LE(body + 4); height = data.readInt32LE(body + 8);
            } else if (movie && /^00d[bc]$/.test(tag)) {
                if (slots >= MAX_SLOTS) fail('export-packets-invalid', 'timeline-slots', {offset: at, actualBytes: bytes});
                if (bytes === 0) {emptyPackets++; slots++;}
                else {
                    if (bytes !== 320 * 180 * 3) fail('export-packets-invalid', 'packet-size', {offset: at, actualBytes: bytes, expectedBytes: 320 * 180 * 3});
                    if (packets.length >= 192) fail('export-packets-invalid', 'packet-count', {offset: at, actualBytes: bytes});
                    packets.push({offset: body, bytes, slot: slots++, sha256: require('node:crypto').createHash('sha256').update(data.subarray(body, body + bytes)).digest('hex')});
                }
            } else if (movie && /^(?:[0-9]{2}(?:db|dc|wb)|LIST)$/.test(tag)) throw Error('export-avi-format');
            at = next;
        }
    }
    walk(12, size, false, 0);
    if (width !== 320 || height !== 180 || !rate || !scale || !packets.length) throw Error('export-avi-format');
    if (![24, 600].includes(rate / scale)) fail('export-avi-format', 'timebase', {rate, scale});
    return {width, height, fps: rate / scale, packets, emptyPackets, slots};
}
function markedFixture(file) {
    support.avi(file, 'A');
    const parsed = aviPackets(file), fd = fs.openSync(file, 'r+');
    try {parsed.packets.forEach((packet, i) => fs.writeSync(fd, Buffer.from([i, i ^ 0x5a, 180]), 0, 3, packet.offset)); fs.fsyncSync(fd);}
    finally {fs.closeSync(fd);}
    const sha256 = support.hashFile(file);
    return {file: 'A.avi', size: fs.statSync(file).size, sha256, etag: '"' + sha256 + '"', generator: 'stock-AVI-plus-unique-frame-marker-v1'};
}
function mapping(source, clip) {
    const sourceMap = new Map(source.packets.map((packet, index) => [packet.sha256, index]));
    if (sourceMap.size !== source.packets.length || source.fps !== 24 || ![24, 600].includes(clip.fps)) throw Error('export-mapping-invalid');
    const indices = clip.packets.map(packet => sourceMap.get(packet.sha256));
    if (indices.length < 16 || indices.length >= source.packets.length || indices.some((index, n) => !Number.isInteger(index) || n > 0 && index !== indices[n - 1] + 1)) throw Error('export-mapping-invalid');
    // AVI timebase ticks can contain empty hold/skip slots. They are not packets
    // of raw video. Validate their actual timing rather than dropping them.
    if (clip.packets[0].slot !== 0 || !Number.isInteger(clip.slots) || clip.slots > MAX_SLOTS ||
        !Number.isInteger(clip.emptyPackets) || clip.emptyPackets !== clip.slots - clip.packets.length ||
        clip.packets.some((packet, n) => !Number.isInteger(packet.slot) || Math.abs(packet.slot / clip.fps - n / source.fps) > (clip.fps === 600 ? 1 / clip.fps : 0) + 1e-9) ||
        Math.abs(clip.slots / clip.fps - indices.length / source.fps) > 1 / source.fps + 1 / clip.fps) throw Error('export-mapping-invalid');
    return {scope: 'single-stream-all-keyframe-synthetic-AVI-only', packetPayloadsIdentical: true, packets: indices.length,
        firstSourceFrame: indices[0], lastSourceFrame: indices.at(-1), sourceStartSeconds: indices[0] / source.fps,
        sourceEndExclusiveSeconds: (indices.at(-1) + 1) / source.fps, secondsPerFrame: 1 / source.fps,
        containerTicksPerSecond: clip.fps, emptyVideoSlots: clip.emptyPackets, containerSlots: clip.slots,
        originalRangeBytesReusable: false, generalContainerTimelineAssessed: false};
}
function chooseWindow(state) {
    const ranges = state?.['seekable-ranges'];
    if (!Array.isArray(ranges) || ranges.length !== 1) throw Error('export-window-unavailable');
    const r = ranges[0], first = Math.ceil(r.start * 24) + 1, last = Math.min(Math.floor(r.end * 24) - 1, first + 24);
    if (!Number.isFinite(first) || first < 0 || !Number.isFinite(last) || last - first < 18 || last > 192) throw Error('export-window-unavailable');
    return {start: first / 24, end: last / 24, cacheStart: r.start, cacheEnd: r.end};
}
function sourceCounts(server) {
    return {requests: server.rows.length, scheduledBytes: server.rows.reduce((n, r) => n + r.bytesScheduled, 0),
        completedBytes: server.rows.filter(r => r.finished).reduce((n, r) => n + r.bytesScheduled, 0)};
}
function noExtraSource(before, after) {
    if (before.requests !== after.requests || before.scheduledBytes !== after.scheduledBytes) throw Error('export-extra-source-read');
    return {newRequests: 0, newScheduledSourceBytes: 0, completedBytesDelta: after.completedBytes - before.completedBytes};
}
function prepare(sourceFile, out) {
    sourceFile = fs.realpathSync(sourceFile);
    const source = support.readPlan(sourceFile);
    assert.deepEqual(support.verifyPlanRuntime(source, path.resolve(__dirname, '..')), source.identity);
    if (!path.isAbsolute(out) || fs.existsSync(out)) throw Error('export-fresh-root');
    physical(path.dirname(out));
    const relative = path.relative(source.runtime, out);
    if (!relative || !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw Error('export-owned-path');
    fs.mkdirSync(out); out = fs.realpathSync(out); fs.writeFileSync(path.join(out, 'owner'), OWNER, {flag: 'wx'});
    for (const dir of ['profile', 'local', 'mpv', 'tmp']) fs.mkdirSync(path.join(out, dir));
    const fixture = markedFixture(path.join(out, 'A.avi'));
    const plan = {schema: 1, scope: SCOPE, out, sourceFile, sourcePlanSha256: support.hashFile(sourceFile),
        toolSha256: support.hashFile(__filename), identity: source.identity, fixture};
    support.writeNew(path.join(out, 'probe.json'), plan); return plan;
}
function readProbe(file) {
    const plan = disk.boundedJson(file, 65536);
    if (plan.schema !== 1 || plan.scope !== SCOPE || path.resolve(file) !== path.join(plan.out, 'probe.json') || plan.toolSha256 !== support.hashFile(__filename)) throw Error('export-input-invalid');
    physical(plan.out);
    if (fs.readFileSync(support.regular(path.join(plan.out, 'owner')), 'utf8') !== OWNER || support.hashFile(support.regular(plan.sourceFile)) !== plan.sourcePlanSha256) throw Error('export-owner-drift');
    for (const dir of ['profile', 'local', 'mpv', 'tmp']) physical(path.join(plan.out, dir));
    if (plan.fixture?.file !== 'A.avi' || plan.fixture.generator !== 'stock-AVI-plus-unique-frame-marker-v1' || plan.fixture.size > MAX_FILE ||
        support.hashFile(support.regular(path.join(plan.out, 'A.avi'))) !== plan.fixture.sha256 || fs.statSync(path.join(plan.out, 'A.avi')).size !== plan.fixture.size || plan.fixture.etag !== '"' + plan.fixture.sha256 + '"') throw Error('export-input-invalid');
    const source = support.readPlan(plan.sourceFile);
    assert.deepEqual(support.verifyPlanRuntime(source, path.resolve(__dirname, '..')), plan.identity);
    return {plan, source};
}
function validateReport(report, plan, exit) {
    if (!exit.processExited || !exit.streamsClosed || exit.code !== 0 || exit.signal || exit.spawnError || exit.transportError ||
        report.schema !== 1 || report.scope !== SCOPE || report.status !== 'PASS' || report.workerPid !== exit.pid ||
        report.helpers?.length !== 2 || report.helpers[0].pid === report.helpers[1].pid || report.helpers.some(h => !Number.isInteger(h.pid) || h.pid <= 0 || !h.exited || !h.handshake ||
            h.outcome !== 'EXIT_AND_CLOSE_CONFIRMED' || h.cleanupError || !diagnostics.normalExit(h.diagnostics)) ||
        report.checks?.newRequests !== 0 || report.checks?.newScheduledSourceBytes !== 0 || report.checks?.clipDecoded !== true ||
        report.checks?.unchangedAfterStop !== true || report.checks?.unchangedAfterExit !== true || report.checks?.unchangedAfterReopen !== true ||
        report.mapping?.packetPayloadsIdentical !== true || !Number.isInteger(report.mapping?.packets) || report.mapping.packets < 16 ||
        report.mapping.packets >= 192 || !Number.isInteger(report.mapping.firstSourceFrame) || report.mapping.firstSourceFrame < 0 ||
        report.mapping.lastSourceFrame !== report.mapping.firstSourceFrame + report.mapping.packets - 1 || report.mapping.lastSourceFrame >= 192 ||
        !Number.isFinite(report.mapping.sourceMinusLocalSeconds) || report.decoded?.width !== 320 || report.decoded?.height !== 180 || report.decoded?.vo !== 'gpu-next' ||
        !/^[a-f0-9]{64}$/.test(report.clip?.sha256 || '') || !Number.isSafeInteger(report.clip?.bytes) || report.clip.bytes <= 0 || report.clip.bytes > MAX_FILE ||
        report.helpers.some(h => !h.options || Object.keys(h.options).length !== Object.keys(OPTIONS).length || Object.entries(OPTIONS).some(([k, v]) => !disk.sameOption(h.options[k], v)))) throw Error('export-result-invalid');
    assert.deepEqual(report.identity, plan.identity);
}
async function worker(file) {
    if (process.platform !== 'win32' || process.arch !== 'x64' || process.versions.electron !== '44.4.2' || process.type !== 'browser') throw Error('export-fixed-Electron-required');
    const {plan, source} = readProbe(file), {app, BrowserWindow} = require('electron');
    for (const name of ['appData', 'userData', 'sessionData']) app.setPath(name, path.join(plan.out, 'profile'));
    app.setAppLogsPath(path.join(plan.out, 'profile', 'logs'));
    Object.assign(process.env, {APPDATA: path.join(plan.out, 'profile'), LOCALAPPDATA: path.join(plan.out, 'local'), MPV_HOME: path.join(plan.out, 'mpv'), TEMP: path.join(plan.out, 'tmp'), TMP: path.join(plan.out, 'tmp')});
    const report = {schema: 1, scope: SCOPE, status: 'UNKNOWN', stage: 'preflight', workerPid: process.pid,
        identity: plan.identity, helpers: [], checks: {}, transparentRestore: 'NOT_ASSESSED', mapping: null};
    const save = () => fs.writeFileSync(path.join(plan.out, 'observations.json'), JSON.stringify(report, null, 2) + '\n');
    const stage = name => {report.stage = name; save();};
    const owned = new Map(); let client, window, server, timer, fatal = false;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const check = () => {if (fatal) throw Error('export-native-deadline'); if (client?.operationErrors.length) throw Error('export-command-failed');};
    const until = async predicate => {const end = Date.now() + 10000; do {check(); if (await predicate()) return; await delay(25);} while (Date.now() < end); throw Error('export-stage-timeout');};
    const property = name => client.getProperty(name, 3000);
    const output = path.join(plan.out, 'excerpt.avi');
    const fingerprint = () => {support.regular(output); if (fs.statSync(output).size > MAX_FILE) throw Error('export-file-limit'); return {bytes: fs.statSync(output).size, sha256: support.hashFile(output)};};
    async function finish(thing) {
        const record = owned.get(thing);
        try {await disk.collectHelperExit(thing, record);}
        finally {if (record.outcome === 'EXIT_AND_CLOSE_CONFIRMED') {owned.delete(thing); if (client === thing) client = null;} save();}
    }
    try {
        timer = setTimeout(() => {fatal = true; for (const thing of owned.keys()) {try {thing.child?.kill();} catch (_) {}}}, 100000);
        save(); await app.whenReady(); stage('app-ready');
        window = new BrowserWindow({show: false, focusable: false, skipTaskbar: true, width: 320, height: 180, webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false}});
        require('./playback-range-windows-hidden.cjs').protectHiddenWindow(window);
        const handle = window.getNativeWindowHandle(), hwnd = handle.length === 8 ? handle.readBigUInt64LE().toString() : String(handle.readUInt32LE());
        server = await require('./playback-range-windows-hidden.cjs').fixtureServer({out: plan.out, fixtures: [plan.fixture]});
        const {NativeHelperClient} = require(path.join(source.runtime, 'electronapp/native-helper/controller.js'));
        async function start(label) {
            stage(label); readProbe(file);
            client = new NativeHelperClient({helperPath: path.join(source.runtime, 'electronapp/native-helper/ete-mpv-helper.exe'), libmpvPath: path.join(source.runtime, 'electronapp/libmpv/x64/mpv-1.dll'), parentWindowHandle: hwnd});
            const record = {pid: null, handshake: null, exited: false, outcome: 'UNCERTAIN'}; owned.set(client, record); report.helpers.push(record); save();
            const ready = client.start(); client.smokeClosePromise = new Promise(resolve => client.child.once('close', resolve)); record.pid = client.child.pid; save();
            await ready; record.handshake = client.handshake;
            assert.equal(client.handshake.libmpvVersion, require(path.join(source.runtime, 'electronapp/native-helper/service.js')).EXPECTED_LIBMPV_VERSION); save();
            client.beginGeneration(label, ['core-idle', 'time-pos', 'duration']);
            const expected = OPTIONS;
            record.options = {};
            for (const [name, value] of Object.entries(expected)) {client.setProperty(name, value); const actual = await property(name); if (!disk.sameOption(actual, value)) throw Error('export-command-failed'); record.options[name] = actual;}
        }
        await start('source-helper'); stage('source-load');
        await client.load(['loadfile', server.origin + '/Videos/A/stream.avi']).promise;
        stage('source-advance'); await until(async () => client.state.fileLoaded && await property('time-pos') >= 1);
        stage('source-pause'); client.setProperty('pause', true); assert.equal(await property('pause'), true);
        stage('source-stable');
        let stable = 0, previous;
        await until(async () => {const now = sourceCounts(server); stable = previous && now.requests === previous.requests && now.scheduledBytes === previous.scheduledBytes ? stable + 1 : 0; previous = now; if (stable < 3) {await delay(150); return false;} return true;});
        const state = disk.cacheState(await property('demuxer-cache-state')); report.window = chooseWindow(state); report.cacheBefore = state;
        const before = sourceCounts(server); report.sourceBefore = before; stage('export');
        const started = Date.now();
        client.submitCommand(['dump-cache', String(report.window.start), String(report.window.end), output]);
        assert.equal(await property('pause'), true); check();
        report.exportMs = Date.now() - started; report.completion = 'synchronous-mpv-command-followed-by-ordered-property-reply';
        await delay(150); report.sourceAfter = sourceCounts(server); Object.assign(report.checks, noExtraSource(before, report.sourceAfter));
        stage('export-inspect'); report.clip = fingerprint();
        const originalAVI = aviPackets(path.join(plan.out, 'A.avi')), exportedAVI = aviPackets(output);
        report.clipFormat = {ticksPerSecond: exportedAVI.fps, nonemptyPackets: exportedAVI.packets.length, emptyVideoSlots: exportedAVI.emptyPackets, containerSlots: exportedAVI.slots};
        report.mapping = mapping(originalAVI, exportedAVI);
        if (report.mapping.sourceStartSeconds < report.window.cacheStart - 1 / 24 || report.mapping.sourceEndExclusiveSeconds > report.window.cacheEnd + 1 / 24) throw Error('export-mapping-invalid');
        stage('source-stop'); await client.stop(); await until(() => server.active.size === 0); assert.deepEqual(fingerprint(), report.clip); report.checks.unchangedAfterStop = true;
        stage('source-exit'); await finish(client); assert.deepEqual(fingerprint(), report.clip); report.checks.unchangedAfterExit = true;
        await server.close(); server = null;
        await start('clip-helper'); stage('clip-load'); await client.load(['loadfile', output]).promise;
        stage('clip-decode'); await until(async () => client.state.fileLoaded && await property('time-pos') >= 0.1);
        const video = await property('video-out-params'), vo = await property('current-vo'), duration = await property('duration');
        assert(video && video.w === 320 && video.h === 180); assert.equal(vo, 'gpu-next');
        assert(Math.abs(duration - report.mapping.packets / 24) <= 2 / 24);
        report.decoded = {width: video.w, height: video.h, vo, duration, clipStartTime: await property('demuxer-start-time')};
        assert(Number.isFinite(report.decoded.clipStartTime)); report.mapping.localStartSeconds = report.decoded.clipStartTime;
        report.mapping.sourceMinusLocalSeconds = report.mapping.sourceStartSeconds - report.decoded.clipStartTime; report.checks.clipDecoded = true;
        stage('clip-stop'); await client.stop(); await finish(client); assert.deepEqual(fingerprint(), report.clip); report.checks.unchangedAfterReopen = true;
        readProbe(file); report.status = 'PASS'; stage('complete');
    } catch (error) {report.status = 'UNKNOWN'; report.failure = safeFailure(error, report.stage); console.error('mpv-buffer-export-failure:' + JSON.stringify(report.failure));}
    finally {
        for (const thing of [...owned.keys()]) {try {await finish(thing);} catch (_) {report.status = 'UNKNOWN'; report.cleanupFailure = 'export-helper-exit';}}
        if (owned.size) {report.status = 'UNKNOWN'; report.nativeOutcome = 'UNCERTAIN';}
        try {if (server) await server.close();} catch (_) {report.status = 'UNKNOWN'; report.cleanupFailure = 'origin-close';}
        if (window && !window.isDestroyed()) window.destroy(); clearTimeout(timer); save(); app.exit(report.status === 'PASS' ? 0 : 1);
    }
}
async function run(file, execute) {
    if (execute !== true || process.platform !== 'win32' || process.arch !== 'x64') throw Error('export-explicit-Windows-required');
    const {plan, source} = readProbe(file);
    for (const name of ['observations.json', 'worker.log', 'run.json', 'excerpt.avi']) if (fs.existsSync(path.join(plan.out, name))) throw Error('export-fresh-root');
    const fd = fs.openSync(path.join(plan.out, 'worker.log'), 'wx'), receipt = {scope: SCOPE, status: 'UNKNOWN', nativeOutcome: 'UNCERTAIN'};
    let timer, timedOut = false;
    const save = () => fs.writeFileSync(path.join(plan.out, 'run.json'), JSON.stringify(receipt, null, 2) + '\n');
    try {
        const child = cp.spawn(path.join(source.runtime, 'x64/electron/electron.exe'), [__filename, '--worker', '--probe=' + file],
            {cwd: plan.out, env: disk.childEnvironment({...source, out: plan.out}), shell: false, windowsHide: true, stdio: ['ignore', fd, fd]});
        receipt.pid = child.pid || null; save(); const completion = disk.observeChild(child);
        timer = setTimeout(() => {timedOut = true; receipt.timedOut = true; save(); try {child.kill();} catch (_) {}}, 120000);
        const exit = await completion; Object.assign(receipt, exit, {timedOut}); save();
        if (timedOut) throw Error('export-native-not-established');
        readProbe(file); validateReport(disk.boundedJson(path.join(plan.out, 'observations.json')), plan, exit);
        Object.assign(receipt, {status: 'PASS', nativeOutcome: 'EXIT_AND_CLOSE_CONFIRMED'}); save(); return receipt;
    } catch (error) {receipt.failure = safeFailure(error, 'preflight'); save(); throw error;}
    finally {clearTimeout(timer); fs.closeSync(fd);}
}
const isWorker = process.versions.electron && process.type === 'browser' && process.argv.includes('--worker') && path.resolve(process.argv[1] || '') === __filename;
if (isWorker) {
    console.log('mpv-buffer-export-entry:worker');
    worker(support.argumentsOf(process.argv.slice(2), ['--worker', '--probe'])['--probe']).catch(error => {
    console.error('mpv-buffer-export-failure:' + JSON.stringify(safeFailure(error, 'preflight'))); require('electron').app.exit(1);
    });
}
module.exports = {SCOPE, MAX_FILE, MAX_SLOTS, STAGES, OPTIONS, safeFailure, formatDiagnostic, physical, aviPackets, markedFixture, mapping, chooseWindow, sourceCounts, noExtraSource, prepare, readProbe, validateReport, run};
