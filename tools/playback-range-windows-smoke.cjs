'use strict';
// Preparation is Node-only. Native execution requires a separate, explicit Windows command.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFileSync, spawn} = require('node:child_process');
const CANDIDATE = Object.freeze({commit: '162dc69f9c3438d99508c90321a889b693b6b10a',
    zipSize: 164367963, zipSha256: 'b35d89c4d7070bc4e56223802b0db666befbc4623a43f18b8fee5a4ec67083cc',
    installerSha256: '17df456db78dc726c27e0e882c568dbc875839cbf5f68e967b452bd62e880e6b'});
const LIMITS = Object.freeze({maxBytes: 16 * 1048576, minFreeBytes: 64 * 1048576, bytesPerSecond: 1048576,
    timeoutMs: 5000, progressPercent: 70, preloadMB: 300}); // Fixture values, never product defaults.
const OWNER = 'ETE hidden range smoke v1\n';
function sha(data) {return crypto.createHash('sha256').update(data).digest('hex');}
function hashFile(file) {
    const hash = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), buffer = Buffer.alloc(1048576);
    try {let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n));}
    finally {fs.closeSync(fd);} return hash.digest('hex');
}
function regular(file) {if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== path.resolve(file)) throw Error('nonphysical-file'); return file;}
function writeNew(file, value) {fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});}
function argumentsOf(argv, allowed) {
    const result = {};
    for (const arg of argv) {
        const n = arg.indexOf('='), key = n < 0 ? arg : arg.slice(0, n), value = n < 0 ? true : arg.slice(n + 1);
        if (!allowed.includes(key) || Object.hasOwn(result, key) || value === '') throw Error('invalid-or-duplicate-argument'); result[key] = value;
    }
    return result;
}
// Read only small provenance entries from the already hash-verified, ordinary ZIP.
// ZIP64, encryption and other compression formats fail closed; no entries are extracted.
function zipReceipts(file) {
    const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
    const read = (offset, length) => {const b = Buffer.alloc(length); if (fs.readSync(fd, b, 0, length, offset) !== length) throw Error('zip-short'); return b;};
    try {
        const tail = read(Math.max(0, size - 65557), Math.min(size, 65557)); let end = -1;
        for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {end = i; break;}
        if (end < 0 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) throw Error('zip-layout');
        const count = tail.readUInt16LE(end + 10), centralSize = tail.readUInt32LE(end + 12), centralStart = tail.readUInt32LE(end + 16);
        if (count === 65535 || centralSize > 4 * 1048576 || centralStart + centralSize > size) throw Error('zip-layout');
        const central = read(centralStart, centralSize), results = []; let cursor = 0;
        for (let i = 0; i < count; i++) {
            if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== 0x02014b50) throw Error('zip-central');
            const flags = central.readUInt16LE(cursor + 8), method = central.readUInt16LE(cursor + 10), compressed = central.readUInt32LE(cursor + 20), uncompressed = central.readUInt32LE(cursor + 24);
            const nameSize = central.readUInt16LE(cursor + 28), extra = central.readUInt16LE(cursor + 30), comment = central.readUInt16LE(cursor + 32), offset = central.readUInt32LE(cursor + 42);
            const name = central.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8'); cursor += 46 + nameSize + extra + comment;
            if (cursor > central.length) throw Error('zip-central');
            if (!name.endsWith('.exe.provenance.json')) continue;
            if (flags & 1 || ![0, 8].includes(method) || compressed > 65536 || uncompressed > 65536 || offset + 30 > centralStart) throw Error('zip-receipt-layout');
            const local = read(offset, 30);
            if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(8) !== method) throw Error('zip-local');
            const start = offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
            if (start + compressed > centralStart) throw Error('zip-local');
            const packed = read(start, compressed), data = method === 0 ? packed : zlib.inflateRawSync(packed, {maxOutputLength: 65536});
            if (data.length !== uncompressed) throw Error('zip-receipt-size'); results.push(JSON.parse(data.toString('utf8')));
        }
        if (cursor !== central.length) throw Error('zip-central'); return results;
    } finally {fs.closeSync(fd);}
}
function source(repo, relative) {return execFileSync('git', ['show', CANDIDATE.commit + ':' + relative], {cwd: repo, maxBuffer: 4 * 1048576, windowsHide: true});}
// Schema v3's producer emits path/hash rows. Optional size is an additional
// assertion, never a prerequisite for the archive-bound hash/set/source checks.
function verifyPayload(runtime, expectedManifestSha256) {
    const manifestFile = regular(path.join(runtime, 'build-manifest.json')), manifestSha256 = hashFile(manifestFile);
    if (manifestSha256 !== expectedManifestSha256) throw Error('candidate-runtime-manifest');
    const manifest = JSON.parse(fs.readFileSync(manifestFile));
    if (manifest.schemaVersion !== 3 || manifest.sourceCommit !== CANDIDATE.commit || !Array.isArray(manifest.files)) throw Error('candidate-runtime-source');
    const inventory = require('./verify-installer-runtime.cjs').inventory(runtime), expected = new Set(['build-manifest.json']); let digest = '';
    for (const row of manifest.files) {
        if (!row || typeof row.path !== 'string' || row.path.includes('\\') || row.path.split('/').some(p => !p || p === '.' || p === '..') || row.path.includes(':') ||
            expected.has(row.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(row.sha256 || '')) throw Error('candidate-runtime-path');
        expected.add(row.path.toLowerCase()); const actual = inventory.get(row.path);
        if (!actual || actual.sha256 !== row.sha256 || Object.hasOwn(row, 'size') &&
            (!Number.isSafeInteger(row.size) || row.size < 0 || actual.size !== row.size)) throw Error('candidate-runtime-file');
        digest += row.path + '\0' + row.sha256 + '\n';
    }
    if (inventory.size !== expected.size || [...inventory.keys()].some(k => !expected.has(k.toLowerCase())) ||
        !manifest.payload || manifest.payload.fileCount !== manifest.files.length || manifest.payload.payloadSetSha256 !== sha(digest)) throw Error('candidate-runtime-set');
    return {inventory, manifestSha256};
}
function verifyRuntime(repo, runtime, zip) {
    regular(zip);
    if (fs.statSync(zip).size !== CANDIDATE.zipSize || hashFile(zip) !== CANDIDATE.zipSha256) throw Error('candidate-zip-identity');
    const receipts = zipReceipts(zip).filter(r => r.sourceCommit === CANDIDATE.commit && r.installer && r.installer.sha256 === CANDIDATE.installerSha256);
    if (receipts.length !== 1) throw Error('candidate-installer-receipt');
    const {inventory, manifestSha256} = verifyPayload(runtime, receipts[0].runtimeManifestSha256);
    for (const relative of [...inventory.keys()].filter(k => /^electronapp\/(enhanced\/playback-range[^/]*\.js|native-helper\/(service|controller)\.js)$/.test(k))) {
        if (inventory.get(relative).sha256 !== sha(source(repo, 'src/' + relative))) throw Error('candidate-maintained-source');
    }
    const native = JSON.parse(source(repo, 'vendor/native-helper-manifest.json'));
    const electron = JSON.parse(source(repo, 'vendor/electron-runtime-manifest.json'));
    const nativeRecord = JSON.parse(fs.readFileSync(path.join(runtime, native.provenancePath)));
    if (nativeRecord.sourceCommit !== CANDIDATE.commit || nativeRecord.helper.testing !== false ||
        nativeRecord.source.sha256 !== sha(source(repo, native.sourcePath)) ||
        nativeRecord.helper.sha256 !== inventory.get(native.runtimePath)?.sha256 ||
        inventory.get(native.libmpv.runtimePath)?.sha256 !== native.libmpv.sha256 ||
        inventory.get(electron.runtime.runtimePath + '/' + electron.runtime.electronPath)?.sha256 !== electron.runtime.electronExeSha256) throw Error('candidate-fixed-native-identity');
    return {sourceCommit: CANDIDATE.commit, manifestSha256, zipSha256: CANDIDATE.zipSha256,
        helperSha256: nativeRecord.helper.sha256, libmpvSha256: native.libmpv.sha256, electronSha256: electron.runtime.electronExeSha256};
}
function chunk(id, body) {const size = Buffer.alloc(4); size.writeUInt32LE(body.length); return Buffer.concat([Buffer.from(id), size, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);}
// Small, deterministic raw AVI: no external encoder/download, audio or private media.
function avi(file, variant, frames = 192) {
    const width = 320, height = 180, fps = 24, stride = width * 3, frameSize = stride * height;
    if (!Number.isInteger(frames) || frames < 1 || frames > 192 || !['A', 'B'].includes(variant)) throw Error('fixture-arguments');
    const avih = Buffer.alloc(56); [Math.round(1e6 / fps), frameSize * fps, 0, 16, frames, 0, 1, frameSize, width, height].forEach((v, i) => avih.writeUInt32LE(v, i * 4));
    const strh = Buffer.alloc(56); strh.write('vidsDIB '); strh.writeUInt32LE(1, 20); strh.writeUInt32LE(fps, 24); strh.writeUInt32LE(frames, 32); strh.writeUInt32LE(frameSize, 36); strh.writeUInt32LE(0xffffffff, 40); strh.writeInt16LE(width, 52); strh.writeInt16LE(height, 54);
    const strf = Buffer.alloc(40); strf.writeUInt32LE(40); strf.writeInt32LE(width, 4); strf.writeInt32LE(height, 8); strf.writeUInt16LE(1, 12); strf.writeUInt16LE(24, 14); strf.writeUInt32LE(frameSize, 20);
    const hdrl = chunk('LIST', Buffer.concat([Buffer.from('hdrl'), chunk('avih', avih), chunk('LIST', Buffer.concat([Buffer.from('strl'), chunk('strh', strh), chunk('strf', strf)]))]));
    const moviSize = 4 + frames * (8 + frameSize), idx = Buffer.alloc(frames * 16), head = Buffer.alloc(12); head.write('RIFF'); head.writeUInt32LE(4 + hdrl.length + 8 + moviSize + 8 + idx.length, 4); head.write('AVI ', 8);
    const fd = fs.openSync(file, 'wx');
    try {
        fs.writeSync(fd, head); fs.writeSync(fd, hdrl); const movi = Buffer.alloc(12); movi.write('LIST'); movi.writeUInt32LE(moviSize, 4); movi.write('movi', 8); fs.writeSync(fd, movi);
        for (let i = 0; i < frames; i++) {
            const frame = Buffer.alloc(frameSize); for (let p = 0; p < frame.length; p += 3) {frame[p] = i % 2 ? 32 : 16; frame[p + (variant === 'A' ? 2 : 1)] = 180;}
            fs.writeSync(fd, chunk('00db', frame)); idx.write('00db', i * 16); idx.writeUInt32LE(16, i * 16 + 4); idx.writeUInt32LE(4 + i * (8 + frameSize), i * 16 + 8); idx.writeUInt32LE(frameSize, i * 16 + 12);
        }
        fs.writeSync(fd, chunk('idx1', idx));
    } finally {fs.closeSync(fd);}
    return {file: path.basename(file), size: fs.statSync(file).size, sha256: hashFile(file), etag: '"' + hashFile(file) + '"'};
}
function prepare({repo, runtime, zip, out}) {
    repo = fs.realpathSync(repo); runtime = fs.realpathSync(runtime); zip = fs.realpathSync(zip);
    const identity = verifyRuntime(repo, runtime, zip); // No directory creation before the source/payload gate.
    if (!path.isAbsolute(out) || fs.existsSync(out)) throw Error('fresh-absolute-output-required');
    fs.mkdirSync(out); out = fs.realpathSync(out); fs.writeFileSync(path.join(out, 'owner'), OWNER, {flag: 'wx'});
    const fixtures = [avi(path.join(out, 'A.avi'), 'A'), avi(path.join(out, 'B.avi'), 'B')];
    fs.mkdirSync(path.join(out, 'profile')); writeNew(path.join(out, 'profile', 'ete-range-cache-trial-owner'), 'ETE range trial v1\n'); fs.mkdirSync(path.join(out, 'tmp')); writeNew(path.join(out, 'config.json'), LIMITS);
    const harness = path.join(__dirname, 'playback-range-windows-hidden.cjs');
    const plan = {schema: 1, candidate: CANDIDATE, identity, runtime, zip, out, fixtures, limits: LIMITS,
        harness, harnessSha256: hashFile(harness), driver: __filename, driverSha256: hashFile(__filename),
        phases: ['populate', 'reopen'], evidence: 'fixed Windows/native hidden transport and decode; no visual, NAS, UI or installation acceptance'};
    writeNew(path.join(out, 'plan.json'), plan); return plan;
}
function readPlan(file) {
    regular(file); const plan = JSON.parse(fs.readFileSync(file));
    if (plan.schema !== 1 || JSON.stringify(plan.candidate) !== JSON.stringify(CANDIDATE) || JSON.stringify(plan.limits) !== JSON.stringify(LIMITS) ||
        JSON.stringify(plan.phases) !== JSON.stringify(['populate', 'reopen']) || fs.realpathSync(plan.out) !== plan.out ||
        path.resolve(file) !== path.join(plan.out, 'plan.json') || fs.readFileSync(regular(path.join(plan.out, 'owner')), 'utf8') !== OWNER ||
        plan.driver !== __filename || hashFile(__filename) !== plan.driverSha256 || hashFile(regular(plan.harness)) !== plan.harnessSha256) throw Error('invalid-owned-plan');
    if (JSON.stringify(JSON.parse(fs.readFileSync(regular(path.join(plan.out, 'config.json'))))) !== JSON.stringify(LIMITS) || plan.fixtures.length !== 2 || new Set(plan.fixtures.map(row => row.file)).size !== 2) throw Error('fixture-config-mutated');
    for (const relative of ['profile', 'tmp']) {const dir = path.join(plan.out, relative); if (fs.realpathSync(dir) !== dir || !fs.lstatSync(dir).isDirectory()) throw Error('redirected-owned-directory');}
    if (fs.readFileSync(regular(path.join(plan.out, 'profile', 'ete-range-cache-trial-owner')), 'utf8') !== 'ETE range trial v1\n') throw Error('profile-owner-mismatch');
    for (const row of plan.fixtures) if (!['A.avi', 'B.avi'].includes(row.file) || hashFile(regular(path.join(plan.out, row.file))) !== row.sha256) throw Error('fixture-mutated');
    return plan;
}
function childEnvironment(plan, inherited = process.env) {
    const environment = {...inherited};
    for (const name of Object.keys(environment)) if (/^(?:ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH|NODE_USE_ENV_PROXY|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/i.test(name)) delete environment[name];
    environment.NO_PROXY = '127.0.0.1,localhost'; environment.no_proxy = environment.NO_PROXY;
    environment.APPDATA = path.join(plan.out, 'profile'); environment.LOCALAPPDATA = path.join(plan.out, 'profile', 'local'); environment.MPV_HOME = path.join(plan.out, 'profile', 'mpv');
    environment.TEMP = path.join(plan.out, 'tmp'); environment.TMP = environment.TEMP; return environment;
}
async function run(file, explicit) {
    if (explicit !== true || process.platform !== 'win32' || process.arch !== 'x64') throw Error('explicit-Windows-x64-hidden-execution-required');
    const plan = readPlan(file);
    // Recheck the source-bound payload just before starting a process. No installer/Host/main.js is executed.
    const identity = verifyRuntime(path.resolve(__dirname, '..'), plan.runtime, plan.zip);
    if (JSON.stringify(identity) !== JSON.stringify(plan.identity)) throw Error('candidate-changed-after-preparation');
    for (const phase of plan.phases) if (fs.existsSync(path.join(plan.out, phase + '.json')) || fs.existsSync(path.join(plan.out, phase + '.stdout'))) throw Error('previous-receipt-exists-use-fresh-output');
    const environment = childEnvironment(plan);
    const exits = [];
    try {
    for (const phase of plan.phases) {
        const output = fs.openSync(path.join(plan.out, phase + '.stdout'), 'wx');
        let timedOut = false;
        try {
            const child = spawn(path.join(plan.runtime, 'x64', 'electron', 'electron.exe'), [plan.harness, '--execute-hidden-native', '--plan=' + file, '--phase=' + phase],
                {cwd: plan.out, env: environment, windowsHide: true, shell: false, stdio: ['ignore', output, output]});
            const timer = setTimeout(() => {timedOut = true; child.kill();}, 120000);
            let exit;
            try {exit = await new Promise((resolve, reject) => {child.once('error', reject); child.once('exit', (code, signal) => resolve({code, signal}));});}
            finally {clearTimeout(timer);}
            exits.push({phase, ...exit, timedOut});
            if (timedOut) throw Error('outer-deadline-owned-helper-exit-UNCERTAIN-inspect-running-receipt');
            if (exit.code !== 0 || JSON.parse(fs.readFileSync(path.join(plan.out, phase + '.json'))).status !== 'passed') throw Error('native-phase-failed:' + phase);
        } finally {fs.closeSync(output);}
    }
    writeNew(path.join(plan.out, 'coordinator.json'), {status: 'passed', identity, exits, evidence: plan.evidence}); return exits;
    } catch (error) {writeNew(path.join(plan.out, 'coordinator.json'), {status: 'failed', identity, exits, error: error.message, helperExit: exits.some(e => e.timedOut) ? 'UNCERTAIN' : 'inspect-phase-receipt'}); throw error;}
}
async function main(argv) {
    const [mode, ...rest] = argv;
    if (mode === 'prepare') {
        const a = argumentsOf(rest, ['--runtime', '--zip', '--out']); if (Object.values(a).some(v => typeof v !== 'string') || Object.keys(a).length !== 3) throw Error('prepare-needs-runtime-zip-out');
        const p = prepare({repo: path.resolve(__dirname, '..'), runtime: a['--runtime'], zip: a['--zip'], out: a['--out']}); console.log(JSON.stringify({status: 'prepared-NOT-RUN', plan: path.join(p.out, 'plan.json')}));
    } else if (mode === 'run') {
        const a = argumentsOf(rest, ['--plan', '--execute-hidden-native']); await run(a['--plan'], a['--execute-hidden-native']);
    } else throw Error('Usage: prepare --runtime=PATH --zip=PATH --out=NEW_PATH | run --plan=PATH --execute-hidden-native');
}
if (require.main === module) main(process.argv.slice(2)).catch(error => {console.error(error.message); process.exitCode = 1;});
module.exports = {CANDIDATE, LIMITS, sha, hashFile, regular, writeNew, argumentsOf, zipReceipts, verifyPayload, verifyRuntime, avi, prepare, readPlan, childEnvironment, run};
