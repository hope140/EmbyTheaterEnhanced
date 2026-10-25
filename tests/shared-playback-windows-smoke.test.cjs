'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const driver = require('../tools/shared-playback-cache/windows-smoke.cjs');
const trial = require('../src/electronapp/enhanced/shared-playback-cache/trial');
test('explicit Windows coordinator arguments reject incomplete, unknown and duplicate inputs', () => {
  assert.equal(driver.argumentsOf(['run', '--plan=owned']).values.plan, 'owned');
  for (const args of [[], ['run'], ['run', '--plan=x', '--plan=y'], ['run', '--plan=x', '--url=https://foreign'], ['prepare', '--out=x']])
    assert.throws(() => driver.argumentsOf(args));
});
test('complete PowerShell prepare argv accepts the exact SHA256 option and Windows path values', () => {
  const values = {repo: String.raw`D:\a\Emby Theater\checkout`, runtime: String.raw`D:\owned\payload\{app}`,
    installer: String.raw`D:\owned\bundle\cache-test-win-x64-setup.exe`,
    'installer-sha256': '1e38c2b2ed440b112e23ec838f16ca2e5debd6a88be7dc87bb42864c30c6883d',
    'product-sha': '2e99cf2b861cb1f56367e5fbc79e45024c11ccec', out: String.raw`D:\owned\fresh smoke`};
  const argv = ['prepare', ...Object.entries(values).map(([key, value]) => '--' + key + '=' + value)];
  assert.deepEqual(driver.argumentsOf(argv), {mode: 'prepare', values});
  for (const extra of ['--sha256=abc', '--installer-sha256=duplicate', '--installer-sha257=abc'])
    assert.throws(() => driver.argumentsOf([...argv, extra]), /invalid-argument/);
  const wrapper = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-run.ps1'), 'utf8');
  const command = wrapper.split(/\r?\n/).find(line => line.startsWith('& node ') && line.includes(' prepare '));
  assert.deepEqual([...command.matchAll(/"--([a-z0-9-]+)=/g)].map(match => match[1]), Object.keys(values),
    'test covers every prepare argument actually emitted by the PowerShell wrapper');
});
test('the actual PowerShell prepare invocation preserves SHA256 and spaced paths through Node argv', t => {
  const cp = require('node:child_process');
  const root = require('./helpers/range-fixture-root.cjs').temporaryRoot('ete-smoke-argv-');
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const source = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-run.ps1'), 'utf8');
  const command = source.split(/\r?\n/).find(line => line.startsWith('& node ') && line.includes(' prepare '));
  const bindings = {repo: String.raw`D:\owned checkout`, RuntimeRoot: String.raw`D:\owned payload\{app}`,
    Installer: String.raw`D:\owned bundle\setup.exe`, InstallerSha256: 'a'.repeat(64),
    ProductCommit: '2e99cf2b861cb1f56367e5fbc79e45024c11ccec', OutputRoot: String.raw`D:\owned fresh`};
  const ps = value => "'" + value.replace(/'/g, "''") + "'";
  fs.writeFileSync(path.join(root, 'windows-smoke.cjs'),
    'const d=require(' + JSON.stringify(require.resolve('../tools/shared-playback-cache/windows-smoke.cjs')) + ');' +
    'console.log(JSON.stringify(d.argumentsOf(process.argv.slice(2))));');
  const script = path.join(root, 'invoke.ps1');
  fs.writeFileSync(script, "$ErrorActionPreference='Stop';\n" +
    Object.entries(bindings).map(([key, value]) => '$' + key + '=' + ps(value)).join('\n') + '\n' + command +
    '\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n');
  const actual = cp.spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', script], {encoding: 'utf8', timeout: 10000,
    env: {...process.env, PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH}});
  assert.ifError(actual.error); assert.equal(actual.status, 0, actual.stderr);
  assert.deepEqual(JSON.parse(actual.stdout), {mode: 'prepare', values: {repo: bindings.repo, runtime: bindings.RuntimeRoot,
    installer: bindings.Installer, 'installer-sha256': bindings.InstallerSha256,
    'product-sha': bindings.ProductCommit, out: bindings.OutputRoot}});
});
test('child environment isolates every media/profile directory and removes executable/proxy injection', () => {
  const root = path.resolve(os.tmpdir(), 'owned-windows-smoke');
  const env = driver.childEnvironment(root, {NODE_OPTIONS: '--require=unowned', ELECTRON_RUN_AS_NODE: '1', http_proxy: 'foreign',
    GH_TOKEN: 'synthetic-only', GITHUB_TOKEN: 'synthetic-only', ACTIONS_RUNTIME_TOKEN: 'synthetic-only', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-only', SystemRoot: 'owned-system'});
  assert.equal(env.NODE_OPTIONS, undefined); assert.equal(env.http_proxy, undefined); assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN']) assert.equal(env[key], undefined);
  assert.equal(env.APPDATA, path.join(root, 'appdata')); assert.equal(env.LOCALAPPDATA, path.join(root, 'localappdata'));
  assert.equal(env.MPV_HOME, path.join(root, 'mpv')); assert.equal(env.TEMP, path.join(root, 'temp'));
  assert.equal(env.NO_PROXY, '127.0.0.1,localhost'); assert.equal(env.SystemRoot, 'owned-system');
});
test('profile owner is insufficient when a child directory is redirected', t => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-windows-profile-')));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const runtime = path.join(root, 'runtime'); fs.mkdirSync(runtime);
  const out = path.join(root, 'out'); fs.mkdirSync(out);
  const profile = path.join(out, 'shared-profile'); trial.createProfile({root: profile});
  assert.equal(driver.validateProfile({out, runtime}, 'natural'), profile);
  const outside = path.join(root, 'ordinary-profile'); fs.mkdirSync(outside);
  fs.rmdirSync(path.join(profile, 'userdata'));
  fs.symlinkSync(outside, path.join(profile, 'userdata'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => driver.validateProfile({out, runtime}, 'reopen'), /redirected/);
  assert.deepEqual(fs.readdirSync(outside), [], 'reject before ordinary profile writes');
});
test('opaque black alpha is not a decoded color-frame success', () => {
  assert.equal(driver.coloredFrame({width: 1, height: 1, pixels: Buffer.from([0, 0, 0, 255])}), false);
  assert.equal(driver.coloredFrame({width: 1, height: 1, pixels: Buffer.from([15, 0, 3, 255])}), true);
  assert.equal(driver.coloredFrame({width: 2, height: 1, pixels: Buffer.from([15, 0, 3, 255])}), false);
});
const result = phase => ({phase, spawnPid: 1001, coordinatorPid: 1000, exitCode: 0, exitSignal: null, exitConfirmed: true, terminationReason: null, streamsClosed: true, timedOut: false,
  receipt: {status: 'PASS', workerPid: 1001, workerParentPid: 1000, workerType: 'browser', ownedHelpersClosed: true, checks: {preloaded: true},
    afterHelper: 17, evaluations: (phase === 'baseline' || phase === 'natural' ? ['renderer-boot', 'seek-forward-pause-command',
      'seek-forward-unpause-command', 'seek-back-pause-command', 'seek-back-unpause-command', 'stop-command'] : ['renderer-boot', 'stop-command'])
      .map((operation, i) => ({operation, sequence: i + 1, completionAck: 1001 + i, rendererResultType: 'undefined', wireResultType: 'null'})),
    trace: [{type: 'load', item: 'B', proxied: true, wallClockMs: 100}]}});
test('phase PASS cannot replace acknowledged commands, post-helper response, or physical exit evidence', () => {
  for (const change of [r => {r.exitConfirmed = false;}, r => {r.exitSignal = 'SIGTERM';}, r => {r.streamsClosed = false;}, r => {r.terminationReason = 'process-error';}]) {
    const r = result('baseline'); change(r); assert.throws(() => driver.validatePhaseEvidence(r, []), /worker-phase-failed/);
  }
  for (const change of [r => {delete r.receipt.afterHelper;}, r => {r.receipt.evaluations = [];},
    r => {r.receipt.evaluations[1].sequence = 1;}, r => {r.receipt.evaluations[1].completionAck = 1001;},
    r => {r.receipt.evaluations[1].rendererResultType = 'number';}, r => {r.receipt.evaluations[1].wireResultType = 'private-value';}]) {
    const r = result('baseline'); change(r); assert.throws(() => driver.validatePhaseEvidence(r, []), /worker-command-evidence-missing/);
  }
  assert.equal(driver.validatePhaseEvidence(result('baseline'), []), null);
});
test('worker success cannot substitute a different launcher PID, parent PID or process role', () => {
  for (const change of [r => {r.receipt.workerPid = 2002;}, r => {r.receipt.workerParentPid = 2002;},
    r => {r.receipt.workerType = 'renderer';}]) {
    const r = result('natural'); change(r);
    assert.throws(() => driver.validatePhaseEvidence(r, []), /worker-pid-binding/);
  }
});
test('natural next rejects a source body re-fetch despite successful native decoding', () => {
  const events = [{phase: 'natural', type: 'media-open', item: 'B', wallClockMs: 101, start: 0, end: 0}];
  assert.equal(driver.validatePhaseEvidence(result('natural'), events), null);
  assert.throws(() => driver.validatePhaseEvidence(result('natural'), [...events,
    {phase: 'natural', type: 'media-open', item: 'B', wallClockMs: 102, start: 1, end: 1000}]), /next-body-reread/);
  const original = result('natural'); original.receipt.trace[0].proxied = false;
  assert.throws(() => driver.validatePhaseEvidence(original, events));
});
test('cross-process reopen requires a fresh probe and no source body request', () => {
  assert.throws(() => driver.validatePhaseEvidence(result('reopen'), []), /reopen-body-reread/);
  assert.equal(driver.validatePhaseEvidence(result('reopen'), [{phase: 'reopen', type: 'media-open', item: 'B', start: 0, end: 0}]), null);
  assert.throws(() => driver.validatePhaseEvidence(result('reopen'), [{phase: 'reopen', type: 'media-open', item: 'B', start: 0, end: 4095}]), /reopen-body-reread/);
});
test('cancel cannot pass without a real held request and its exact physical close', () => {
  assert.throws(() => driver.validatePhaseEvidence(result('cancel'), []), /held-source-not-closed/);
  const held = {phase: 'cancel', type: 'media-held', item: 'B', requestId: 7};
  assert.throws(() => driver.validatePhaseEvidence(result('cancel'), [held,
    {phase: 'cancel', type: 'media-close', requestId: 8, actualResponseClosed: true}]));
  assert.equal(driver.validatePhaseEvidence(result('cancel'), [held,
    {phase: 'cancel', type: 'media-close', requestId: 7, actualResponseClosed: true}]), 7);
  const timed = result('cancel'); timed.timedOut = true;
  assert.throws(() => driver.validatePhaseEvidence(timed, [held]), /worker-phase-failed/);
});
test('Electron imported CJS entry invokes module stage without require.main identity', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-electron.cjs'), 'utf8');
  const logs = [], exits = []; let readPlan = false;
  const fakeRequire = name => name === 'electron' ? {app: {on() {}, exit: code => exits.push(code)}} :
    name === './windows-smoke.cjs' ? {PHASES: ['baseline'], safeFailure: driver.safeFailure, readPlan() {readPlan = true; throw Error('owned-test-stop');}} :
      name === './windows-contract.cjs' ? {} : require(name);
  fakeRequire.main = {};
  const context = {require: fakeRequire, module: {}, console: {log: v => logs.push(v), error: v => logs.push(v)},
    process: {versions: {electron: '44.4.2'}, argv: ['electron', 'driver', '--phase=baseline', '--plan=x', '--plan-sha256=x', '--session=x', '--session-sha256=x', '--deadline-ms=' + (Date.now() + 40000)]},
    performance, Buffer, URL, setTimeout, clearTimeout};
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(readPlan, true); assert.ok(logs.includes('SHARED_CACHE_WORKER module')); assert.deepEqual(exits, [1]);
});


test('native stderr keeps fixed loader/system tags without raw private contents', () => {
  const value = driver.safeNativeTags([Buffer.from('private-path=DO-NOT-LOG; helper-fatal:dll-load-failed:win32-126:target-file-1:absolute-1:chars-50')]);
  assert.equal(value.win32Error, 126); assert.equal(value.dllLoadFailure, true);
  assert.equal(value.targetFile, true); assert.doesNotMatch(JSON.stringify(value), /DO-NOT-LOG|private-path|chars/);
});


test('tool source binding accepts only Git blob or exact CRLF checkout and records both hashes', () => {
  const blob = Buffer.from("'use strict';\nmodule.exports=1;\n"), crlf = Buffer.from(blob.toString().replace(/\n/g,'\r\n'));
  assert.equal(driver.boundToolBytes(blob, blob).relation, 'git-blob');
  const result = driver.boundToolBytes(blob, crlf); assert.equal(result.relation, 'exact-crlf-checkout');
  assert.notEqual(result.sourceSha256, result.checkoutSha256);
  for (const bytes of [Buffer.from('\ufeff'+blob),Buffer.from(blob.toString().replace('=1','=2')),Buffer.from("'use strict';\r\nmodule.exports=1;\n")])
    assert.throws(()=>driver.boundToolBytes(blob,bytes), /tool-source-changed/);
});
