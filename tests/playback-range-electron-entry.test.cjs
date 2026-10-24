'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {spawnSync, execFileSync} = require('node:child_process');
const support = require('../tools/playback-range-windows-smoke.cjs');
const {isEntrypoint} = require('../tools/playback-range-windows-hidden.cjs');
const entryFile = path.resolve(__dirname, '../tools/playback-range-windows-hidden.cjs');
const requireActual = createRequire(entryFile);
function fixture(t, options = {}) {
    const out = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-entry-contract-'))); t.after(() => fs.rmSync(out, {recursive: true, force: true}));
    const profile = path.join(out, 'profile'); fs.mkdirSync(profile); fs.mkdirSync(path.join(out, 'tmp'));
    fs.writeFileSync(path.join(profile, 'ete-range-cache-trial-owner'), 'ETE range trial v1\n'); fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify(support.LIMITS));
    const plan = {out, runtime: path.resolve(__dirname, '..'), zip: 'not-used-in-loader-contract-substitute', identity: {electronSha256: 'fixture-image-only'}};
    const rows = [], imports = [], errors = [], paths = {}, exits = []; let ready = false, resolveReady, resolveExit;
    const readyPromise = new Promise(resolve => {resolveReady = () => {ready = true; resolve();};});
    const exitPromise = new Promise(resolve => {resolveExit = resolve;});
    const app = {setPath(name, value) {paths[name] = value;}, setAppLogsPath(value) {paths.logs = value;}, isReady: () => ready,
        whenReady: () => readyPromise, exit(code) {exits.push(code); resolveExit(code);}};
    function BrowserWindow() {throw Error('window-construction-forbidden-in-entry-test');}
    BrowserWindow.getAllWindows = () => options.unexpectedWindow ? [{}] : [];
    const runtime = {versions: {electron: '44.4.2'}, type: options.type || 'browser', platform: 'win32', arch: 'x64', pid: 12345,
        argv: ['fixture-electron.exe', options.otherFile || entryFile, '--execute-electron-entry-smoke', '--plan=' + path.join(out, 'plan.json'), '--phase=entry'],
        execPath: 'fixture-electron.exe', env: support.childEnvironment(plan, {}), stdout: {write(line) {rows.push(JSON.parse(line));}}};
    const localRequire = name => {
        imports.push(name);
        if (name === './playback-range-windows-smoke.cjs') return {...support, readPlan: () => plan, hashFile: () => 'fixture-image-only', verifyRuntime() {
            if (options.validationError) throw options.validationError;
            if (options.validationFailure) throw Error('fixture-candidate-validation-failed');
            return options.physicalProofMismatch ? {...plan.identity, physicalPayload: {files: 999, sha256: 'mismatch'}} : plan.identity;
        }};
        if (name === 'electron') return {app, BrowserWindow};
        if (name === path.join(plan.runtime, 'electronapp', 'enhanced', 'playback-range-launch.js')) {
            const launch = require('../src/electronapp/enhanced/playback-range-launch.js');
            return options.badDerivedConfig ? {...launch, prepareLaunch(argv) {const value = launch.prepareLaunch(argv); return {...value, config: {...value.config, prefetchBytes: 1}};}} : launch;
        }
        if (/native-helper/.test(name)) throw Error('native-import-forbidden-in-entry-test');
        return requireActual(name);
    }; // Deliberately no require.main: model Electron's import()-loaded CJS.
    const module = {exports: {}};
    const source = options.source || fs.readFileSync(entryFile, 'utf8');
    vm.runInNewContext(source, {require: localRequire, module, __filename: entryFile, __dirname: path.dirname(entryFile), process: runtime,
        console: {error(message) {errors.push(message);}}, Buffer, URL, AbortController, setTimeout, clearTimeout, setInterval, clearInterval}, {filename: entryFile});
    return {out, plan, rows, imports, paths, exits, errors, runtime, exitPromise, ready: resolveReady};
}
test('real Node ESM import does not mark a CJS fixture as require.main', t => {
    const out = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-cjs-esm-'))); t.after(() => fs.rmSync(out, {recursive: true, force: true}));
    const file = path.join(out, 'entry.cjs'); fs.writeFileSync(file, 'module.exports = {commonJsMain: require.main === module};');
    const code = "import {pathToFileURL} from 'node:url'; console.log((await import(pathToFileURL(process.argv[1]))).default.commonJsMain);";
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code, file], {encoding: 'utf8', windowsHide: true});
    assert.equal(result.status, 0); assert.equal(result.stdout.trim(), 'false');
});
test('entry guard accepts the explicit Electron browser script when require.main is absent', () => {
    const runtime = {versions: {electron: '44.4.2'}, type: 'browser', platform: process.platform, argv: ['electron', entryFile, '--execute-electron-entry-smoke']};
    assert(isEntrypoint(false, runtime)); assert(!isEntrypoint(false, {...runtime, type: 'renderer'}));
    assert(!isEntrypoint(false, {...runtime, versions: {}})); assert(!isEntrypoint(false, {...runtime, argv: ['electron', '/other.cjs', '--execute-electron-entry-smoke']}));
    assert(!isEntrypoint(false, {...runtime, argv: ['electron', entryFile]}));
});
test('preceding require.main-only source never enters main under the same substituted import-loader contract', t => {
    const source = execFileSync('git', ['show', 'c6e1c9141a798c17207d37faebc9d53f9633f6a4:tools/playback-range-windows-hidden.cjs'], {cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true});
    const f = fixture(t, {source}); assert.equal(f.exits.length, 0); assert.deepEqual(f.paths, {});
    assert(!fs.existsSync(path.join(f.out, 'entry.stages.ndjson'))); assert(!f.imports.includes('electron'));
});
test('incorrect derived prefetch bytes still fail the normalized launch-config assertion', async t => {
    const f = fixture(t, {badDerivedConfig: true}); assert.equal(await f.exitPromise, 1);
    const result = JSON.parse(fs.readFileSync(path.join(f.out, 'entry.json'))); assert.equal(result.status, 'failed'); assert.match(result.error, /prefetchBytes/);
});
test('substituted loader contract writes earliest/main/app-ready receipts without creating windows, helper or fixture HTTP', async t => {
    const f = fixture(t); await new Promise(resolve => setImmediate(resolve)); const names = f.rows.map(row => row.stage);
    assert.deepEqual(names.slice(0, 3), ['module-evaluated', 'main-enter', 'plan-validated']);
    assert.equal(f.rows[0].commonJsMain, false);
    assert(fs.existsSync(path.join(f.out, 'entry.stages.ndjson'))); assert(fs.existsSync(path.join(f.out, 'entry.running.json')), JSON.stringify({errors: f.errors, rows: f.rows}));
    assert.equal(f.paths.userData, path.join(f.out, 'profile', 'electron')); assert.equal(f.exits.length, 0);
    f.ready(); assert.equal(await f.exitPromise, 0);
    const result = JSON.parse(fs.readFileSync(path.join(f.out, 'entry.json')));
    assert.equal(result.evidence, 'fixed-Electron-entry-only'); assert.equal(result.checks.helperStarted, false); assert.equal(result.checks.windowsCreated, 0);
    assert(!f.imports.some(name => /native-helper/.test(name)));
    support.validatePhase(f.plan, 'entry', {pid: 12345, code: 0, timedOut: false});
});
test('substituted loader contract records pre-ready validation failure and exits without native import', async t => {
    const f = fixture(t, {validationFailure: true}); assert.equal(await f.exitPromise, 1);
    const result = JSON.parse(fs.readFileSync(path.join(f.out, 'entry.json')));
    assert.equal(result.status, 'failed'); assert.equal(result.lastStage, 'entry-failed'); assert.match(result.error, /validation-failed/);
    assert(f.rows.some(row => row.stage === 'candidate-validation-start')); assert(!f.rows.some(row => row.stage === 'app-ready'));
    assert(!f.imports.some(name => /native-helper/.test(name)));
});
test('entry-only receipt refuses an unexpected window instead of declaring a windowless pass', async t => {
    const f = fixture(t, {unexpectedWindow: true}); f.ready(); assert.equal(await f.exitPromise, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.out, 'entry.json'))).status, 'failed');
});
test('import in another Electron script never enters this harness or writes a profile', t => {
    const f = fixture(t, {otherFile: '/another-entry.cjs'});
    assert(!f.rows.some(row => row.stage === 'main-enter')); assert.deepEqual(f.paths, {}); assert.equal(f.exits.length, 0);
    assert(!fs.existsSync(path.join(f.out, 'entry.stages.ndjson')));
});
for (const change of ['missing-stage', 'wrong-stage-pid', 'nonzero-exit', 'timeout', 'missing-receipt', 'wrong-image', 'helper-started']) test('coordinator refuses incomplete entry evidence: ' + change, async t => {
    const f = fixture(t); f.ready(); await f.exitPromise;
    const file = path.join(f.out, 'entry.json'), stagesFile = path.join(f.out, 'entry.stages.ndjson'), exit = {pid: 12345, code: 0, timedOut: false};
    if (change === 'missing-stage' || change === 'wrong-stage-pid') {
        const rows = fs.readFileSync(stagesFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
        if (change === 'missing-stage') rows.splice(rows.findIndex(row => row.stage === 'app-ready'), 1);
        else rows.find(row => row.stage === 'app-ready').pid = 999;
        fs.writeFileSync(stagesFile, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    }
    if (change === 'nonzero-exit') exit.code = 1;
    if (change === 'timeout') exit.timedOut = true;
    if (change === 'missing-receipt') fs.unlinkSync(file);
    if (change === 'wrong-image' || change === 'helper-started') {
        const result = JSON.parse(fs.readFileSync(file));
        if (change === 'wrong-image') result.identity.electronSha256 = 'other'; else result.checks.helperStarted = true;
        fs.writeFileSync(file, JSON.stringify(result));
    }
    assert.throws(() => support.validatePhase(f.plan, 'entry', exit));
});
function coordinator(t, pid = 24680) {
    const {EventEmitter} = require('node:events'), out = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-entry-owner-')));
    t.after(() => fs.rmSync(out, {recursive: true, force: true}));
    const child = new EventEmitter(); child.pid = pid; child.exitCode = null; child.kills = 0; child.kill = () => {child.kills++;};
    let deadline, timeout, argumentsSeen;
    const module = {exports: {}}, requireDriver = name => name === 'node:child_process' ? {spawn(...args) {argumentsSeen = args; return child;}, execFileSync} : requireActual(name);
    const source = fs.readFileSync(path.resolve(__dirname, '../tools/playback-range-windows-smoke.cjs'), 'utf8') + '\nmodule.exports.testExecutePhase = executePhase;';
    vm.runInNewContext(source, {require: requireDriver, module, __filename: path.resolve(__dirname, '../tools/playback-range-windows-smoke.cjs'), __dirname: path.resolve(__dirname, '../tools'), process,
        Buffer, console, setTimeout(callback, milliseconds) {deadline = callback; timeout = milliseconds; return 1;}, clearTimeout() {} });
    const plan = {out, runtime: out, harness: entryFile, identity: {electronSha256: 'fixture-only'}};
    return {child, plan, run: phase => module.exports.testExecutePhase(plan, path.join(out, 'plan.json'), phase), deadline: () => deadline(), milliseconds: () => timeout, args: () => argumentsSeen};
}
test('coordinator preserves ownership after a live-child error until its actual exit event', async t => {
    const f = coordinator(t); let settled = false; const run = f.run('entry'); run.catch(() => {settled = true;});
    f.child.emit('error', Error('owned-child-error')); await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false); assert.equal(f.child.kills, 1); assert.equal(f.milliseconds(), 20000);
    assert.equal(f.args()[1][1], '--execute-electron-entry-smoke'); assert.equal(f.args()[2].windowsHide, true);
    f.child.exitCode = 1; f.child.emit('exit', 1, null); await assert.rejects(run, /owned-child-error/);
});
test('short entry deadline records only its owned child and waits for actual exit', async t => {
    const f = coordinator(t), run = f.run('entry'); run.catch(() => {}); f.deadline(); assert.equal(f.child.kills, 1);
    f.child.exitCode = 1; f.child.emit('exit', 1, 'SIGTERM');
    await assert.rejects(run, error => error.message === 'entry-deadline-no-native-requested' && error.phaseExit.timedOut && error.phaseExit.pid === f.child.pid);
});
test('longer native deadline is unchanged and no ordinary Node branch claims an entry pass', async t => {
    const f = coordinator(t), run = f.run('populate'); run.catch(() => {}); assert.equal(f.milliseconds(), 120000);
    assert.equal(f.args()[1][1], '--execute-hidden-native');
    f.child.exitCode = 0; f.child.emit('exit', 0, null); await assert.rejects(run, /missing-or-invalid-phase-evidence/);
    await assert.rejects(support.entrySmoke('not-a-plan', false), /explicit-Windows/);
});

test('entry failure and coordinator preserve bounded originating physical-file diagnostics', async t => {
    const validationError = Error('candidate-runtime-file:resources/fixture.asar');
    validationError.integrity = {code: 'candidate-runtime-file', member: 'resources/fixture.asar', fileSystemBackend: 'original-fs', operation: 'compare',
        expectedSha256: 'a'.repeat(64), actualSha256: 'b'.repeat(64), sizeDeclared: false, expectedBytes: null, actualBytes: 100, actualReadBytes: 100};
    const f = fixture(t, {validationError}); assert.equal(await f.exitPromise, 1);
    const result = JSON.parse(fs.readFileSync(path.join(f.out, 'entry.json')));
    assert.equal(result.integrity.member, 'resources/fixture.asar'); assert.equal(result.integrity.expectedSha256, 'a'.repeat(64)); assert.equal(result.integrity.actualBytes, 100);
    assert.equal(result.integrity.fileSystemBackend, 'original-fs');
    assert.throws(() => support.validatePhase(f.plan, 'entry', {pid: 12345, code: 1}), error => error.integrity?.member === 'resources/fixture.asar' && error.integrity.fileSystemBackend === 'original-fs');
});
test('entry cannot pass when its physical payload identity differs from the prepared Node identity', async t => {
    const f = fixture(t, {physicalProofMismatch: true}); assert.equal(await f.exitPromise, 1);
    const result = JSON.parse(fs.readFileSync(path.join(f.out, 'entry.json'))); assert.equal(result.status, 'failed'); assert.match(result.error, /same physical payload proof/);
    assert(!f.rows.some(row => row.stage === 'app-ready'));
});
