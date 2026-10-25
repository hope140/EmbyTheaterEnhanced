'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {performance} = require('node:perf_hooks');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const liveness = require('../tools/shared-playback-cache/windows-liveness.cjs');
const nativeWorker = require('../tools/shared-playback-cache/windows-native-liveness-electron.cjs');
const fixtureTool = path.join(root, 'tools/make-fixture.cjs');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/public-ci.yml'), 'utf8').replace(/\r\n/g, '\n');

const nativeCases = ['helper-idle', 'helper-playback', 'helper-preview'];
const rendererScripts = [['primitive', 11], ['promise', 12], ['echo-one', 1], ['async-void', 14], ['awaited', 7], ['microtask', 16]];
const hashes = {installer: 'a'.repeat(64), product: 'b'.repeat(40)};
function args(suite) {
  return [
    '--repo=' + path.join(os.tmpdir(), 'owned-repo'),
    '--runtime=' + path.join(os.tmpdir(), 'owned-runtime'),
    '--installer=' + path.join(os.tmpdir(), 'owned-installer.exe'),
    '--installer-sha256=' + hashes.installer,
    '--product-sha=' + hashes.product,
    '--out=' + path.join(os.tmpdir(), 'owned-output'),
    ...(suite === undefined ? [] : ['--suite=' + suite]),
  ];
}

function nativeReceipt(name, overrides = {}) {
  const preview = name === 'helper-preview';
  const playback = name !== 'helper-idle';
  return {
    schema: 1, kind: 'runtime-liveness-case', suite: 'native', case: name, status: 'PASS',
    pid: 9002, ppid: 9001, processType: 'browser', browserProcess: true, ready: true,
    windowsCreated: 2, hidden: true, backgroundThrottling: false,
    scripts: rendererScripts.map(([label, result]) => ({label, result})), ipcCounts: [1, 1, 1, 1],
    observations: Array.from({length: 8}, () => ['entered', 'returned', 'settled']).flat(), ownedHelpersClosed: true,
    native: {created: true, closed: true, loaded: playback, playbackAdvanced: playback},
    beforeHelper: 11, afterHelper: 17,
    previewCalls: preview ? 1 : 0, preview: preview ? {width: 64, height: 64, colored: true} : undefined,
    undefinedScripts: [
      {label: 'undefined-promise', resultType: 'undefined'},
      {label: 'undefined-timer', resultType: 'undefined'},
    ],
    helpers: [{pid: 9003, ready: true, exited: true, exitCode: 0, signal: false, streamsClosed: true,
      pendingRequests: 0, protocolFailure: false, operationErrorCount: 0, fatal: false}],
    ...overrides,
  };
}
function resultFor(name, receipt = nativeReceipt(name), overrides = {}) {
  return {case: name, spawnPid: 9002, coordinatorPid: 9001, exitConfirmed: true, exitCode: 0,
    exitSignal: null, timedOut: false, streamsClosed: true, receipt, ...overrides};
}

test('suite parser leaves the original runtime-liveness defaults unchanged and accepts only native', () => {
  assert.deepEqual(liveness.CASES, ['bare', 'contents', 'frame']);
  assert.deepEqual(liveness.NATIVE_CASES, nativeCases);
  assert.deepEqual(liveness.LIMITS, {caseMs: 35000, totalMs: 120000});
  assert.deepEqual(liveness.parseArgs(args()), {
    repo: path.join(os.tmpdir(), 'owned-repo'), runtime: path.join(os.tmpdir(), 'owned-runtime'),
    installer: path.join(os.tmpdir(), 'owned-installer.exe'), installerSha256: hashes.installer,
    productCommit: hashes.product, out: path.join(os.tmpdir(), 'owned-output'),
  });
  assert.deepEqual(liveness.parseArgs(args('native')), {...liveness.parseArgs(args()), suite: 'native'});
  for (const malformed of [args('unknown'), [...args('native'), '--suite=native'], [...args(), '--unexpected=yes']]) {
    assert.throws(() => liveness.parseArgs(malformed));
  }
});

test('native validation requires one known helper with a confirmed clean exit and case-specific results', () => {
  for (const name of nativeCases) assert.equal(liveness.validateResult(resultFor(name), name), true, name);
  const badReceipts = [
    nativeReceipt('helper-playback', {helpers: [null]}),
    nativeReceipt('helper-playback', {observations: Array.from({length: 6}, () => ['entered', 'returned', 'settled']).flat()}),
    nativeReceipt('helper-playback', {undefinedScripts: {length: 2}}),
    nativeReceipt('helper-playback', {undefinedScripts: [null, null]}),
    nativeReceipt('helper-playback', {helpers: [{...nativeReceipt('helper-playback').helpers[0], pid: null}]}),
    nativeReceipt('helper-playback', {helpers: [{...nativeReceipt('helper-playback').helpers[0], exitCode: 2}]}),
    nativeReceipt('helper-playback', {helpers: [{...nativeReceipt('helper-playback').helpers[0], signal: true}]}),
    nativeReceipt('helper-playback', {helpers: [{...nativeReceipt('helper-playback').helpers[0], pendingRequests: 1}]}),
    nativeReceipt('helper-playback', {helpers: [{...nativeReceipt('helper-playback').helpers[0], ready: false}]}),
    nativeReceipt('helper-playback', {helpers: [...nativeReceipt('helper-playback').helpers, {...nativeReceipt('helper-playback').helpers[0]}]}),
    nativeReceipt('helper-preview', {previewCalls: 0}),
    nativeReceipt('helper-idle', {native: {...nativeReceipt('helper-idle').native, loaded: true}}),
    nativeReceipt('helper-playback', {native: {...nativeReceipt('helper-playback').native, playbackAdvanced: false}}),
    nativeReceipt('helper-playback', {undefinedScripts: [{label: 'undefined-promise', resultType: 'number'},
      {label: 'undefined-timer', resultType: 'undefined'}]}),
    nativeReceipt('helper-playback', {afterHelper: undefined}),
    nativeReceipt('helper-preview', {preview: {width: 0, height: 64, colored: true}}),
    nativeReceipt('helper-preview', {preview: {width: 64, height: 64, colored: false}}),
    nativeReceipt('helper-playback', {suite: 'unexpected'}),
  ];
  for (const receipt of badReceipts) assert.equal(liveness.validateResult(resultFor(receipt.case, receipt), receipt.case), false, JSON.stringify(receipt));
  assert.equal(liveness.validateResult(resultFor('helper-playback', nativeReceipt('helper-playback'), {exitConfirmed: false}), 'helper-playback'), false);
  assert.equal(liveness.validateResult(resultFor('helper-playback', nativeReceipt('helper-playback'), {exitCode: 1}), 'helper-playback'), false);
  assert.equal(liveness.validateResult(resultFor('helper-playback', nativeReceipt('helper-playback'), {exitSignal: 'SIGTERM'}), 'helper-playback'), false);
  assert.equal(liveness.validateResult(resultFor('helper-playback', nativeReceipt('helper-playback'), {timedOut: true}), 'helper-playback'), false);
  assert.equal(liveness.validateResult(resultFor('helper-playback', nativeReceipt('helper-playback'), {streamsClosed: false}), 'helper-playback'), false);
  assert.equal(liveness.validateResult(resultFor('helper-playback', nativeReceipt('helper-playback'), {receipt: null}), 'helper-playback'), false);
});

test('worker kill guard permits only a known active child and health distinguishes confirmed closure', () => {
  const active = {child: {pid: 8123, exitCode: null, signalCode: null}, exited: false, killDenied: false};
  assert.equal(nativeWorker.allowedKill(active), true);
  for (const client of [null, {...active, killDenied: true}, {...active, exited: true},
    {...active, child: {...active.child, pid: null}}, {...active, child: {...active.child, exitCode: 0}},
    {...active, child: {...active.child, signalCode: 'SIGTERM'}}]) {
    assert.equal(nativeWorker.allowedKill(client), false, JSON.stringify(client));
  }

  const healthy = {handshake: true, protocolFailure: false, transportTerminated: false, operationErrors: [],
    exited: false, child: {exitCode: null, signalCode: null}, closeSeen: false, pending: new Map()};
  assert.equal(nativeWorker.helperHealthy(healthy), true);
  assert.equal(nativeWorker.helperHealthy({...healthy, operationErrors: [{fatal: false}]}), true);
  for (const broken of [
    {...healthy, handshake: false}, {...healthy, transportTerminated: true},
    {...healthy, protocolFailure: true}, {...healthy, operationErrors: [{fatal: true}]},
  ]) assert.equal(nativeWorker.helperHealthy(broken), false);
  const closed = {...healthy, exited: true, child: {exitCode: 0, signalCode: null}, closeSeen: true};
  assert.equal(nativeWorker.helperHealthy(closed, true), true);
  assert.equal(nativeWorker.helperHealthy(healthy, true), false);
  assert.equal(nativeWorker.helperHealthy({...closed, child: {exitCode: 1, signalCode: null}}, true), false);
  assert.equal(nativeWorker.helperHealthy({...closed, child: {exitCode: 0, signalCode: 'SIGTERM'}}, true), false);
  assert.equal(nativeWorker.helperHealthy({...closed, closeSeen: false}, true), false);
  assert.equal(nativeWorker.helperHealthy({...closed, pending: new Map([['request', true]])}, true), false);
});

test('preview frame acceptance checks supported dimensions, exact RGBA size, and visible color', () => {
  const valid = (width, height) => {
    const pixels = Buffer.alloc(width * height * 4);
    pixels[0] = 100;
    return {width, height, pixels};
  };
  assert.equal(nativeWorker.coloredFrame(valid(64, 64)), true);
  assert.equal(nativeWorker.coloredFrame(valid(160, 90)), true);
  assert.equal(nativeWorker.coloredFrame(valid(65, 64)), false);
  assert.equal(nativeWorker.coloredFrame({width: 64, height: 64, pixels: Buffer.alloc(64 * 64 * 4 - 1)}), false);
  const alphaOnly = Buffer.alloc(64 * 64 * 4); alphaOnly[3] = 255;
  assert.equal(nativeWorker.coloredFrame({width: 64, height: 64, pixels: alphaOnly}), false);
  assert.equal(nativeWorker.coloredFrame(null), false);
});

test('owned five-second fixture is small, hashed, and rejected after byte corruption', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-native-liveness-fixture-'));
  t.after(() => fs.rmSync(temp, {recursive: true, force: true}));
  const file = path.join(temp, 'owned.y4m');
  const started = performance.now();
  const generated = spawnSync(process.execPath, [fixtureTool, file, '5'], {encoding: 'utf8', timeout: 10000});
  assert.equal(generated.status, 0, generated.stderr);
  assert.ok(performance.now() - started < 5000, 'fixture generation should finish within five seconds');
  const bytes = fs.readFileSync(file);
  assert.ok(bytes.length > 0 && bytes.length < 2 * 1024 * 1024);
  const plan = {out: temp, fixture: {file, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')}};
  assert.equal(liveness.verifyFixture(plan), file);
  const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1; fs.writeFileSync(file, changed);
  assert.throws(() => liveness.verifyFixture(plan), /fixture-changed/);
});

test('existing dispatch keeps its ten inputs and adds native liveness as an opt-in suite choice', () => {
  const inputs = workflow.slice(workflow.indexOf('    inputs:\n'), workflow.indexOf('\npermissions:\n'));
  const names = [...inputs.matchAll(/^      ([a-z0-9_]+):$/gm)].map(match => match[1]);
  assert.deepEqual(names, ['release_package', 'build_input_benchmark', 'benchmark_expected_sha', 'benchmark_trials',
    'benchmark_warm_calls', 'shared_cache_smoke', 'shared_cache_diagnostics', 'shared_cache_artifact_id',
    'shared_cache_zip_sha256', 'shared_cache_installer_sha256']);
  assert.equal(names.length, 10);
  for (const [name, type, value] of [
    ['release_package', 'boolean', 'false'], ['build_input_benchmark', 'boolean', 'false'],
    ['benchmark_expected_sha', 'string', "''"], ['benchmark_trials', 'choice', "'4'"],
    ['benchmark_warm_calls', 'choice', "'3'"], ['shared_cache_smoke', 'boolean', 'false'],
    ['shared_cache_diagnostics', 'boolean', 'false'], ['shared_cache_artifact_id', 'string', "''"],
    ['shared_cache_zip_sha256', 'string', "''"], ['shared_cache_installer_sha256', 'string', "''"],
  ]) {
    const start = inputs.indexOf('      ' + name + ':\n');
    const tail = inputs.slice(start + 8);
    const nextRelative = tail.search(/\n      [a-z0-9_]+:\n/);
    const block = inputs.slice(start, nextRelative < 0 ? inputs.length : start + 8 + nextRelative);
    assert.match(block, new RegExp('^        type: ' + type + '$', 'm'), name);
    assert.match(block, new RegExp('^        default: ' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'), name);
  }
  const warmCalls = inputs.slice(inputs.indexOf('      benchmark_warm_calls:\n'), inputs.indexOf('\n      shared_cache_smoke:'));
  assert.match(warmCalls, /options: \['3', '1', '5', '10', 'native-liveness'\]/);
  assert.match(workflow, /benchmark_warm_calls:\n +description: [^\n]*native-liveness only with smoke AND diagnostics/);
  assert.equal(fs.existsSync(path.join(root, '.github/workflows/shared-cache-native-liveness.yml')), false,
    'native liveness must use the existing user-selectable public workflow');
});

test('combined-mode route is branch-bound, benchmark-disabled, and selects exactly one liveness suite', () => {
  function jobBlock(name) {
    const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
    const headers = [...jobs.matchAll(/^  ([a-zA-Z0-9_-]+):[ \t]*$/gm)];
    const index = headers.findIndex(match => match[1] === name);
    assert.ok(index >= 0, 'job must exist: ' + name);
    return jobs.slice(headers[index].index, headers[index + 1]?.index ?? jobs.length);
  }
  const livenessJob = jobBlock('windows-shared-cache-liveness');
  function routes(job, event, benchmark, smoke, diagnostics) {
    const match = /^    if: (.+)$/m.exec(job);
    assert.ok(match, 'job route condition required');
    return match[1].split(/\s+&&\s+/).map(clause => {
      const eventCheck = /^github\.event_name == '([^']+)'$/.exec(clause);
      if (eventCheck) return event === eventCheck[1];
      const inputCheck = /^(!)?inputs\.(build_input_benchmark|shared_cache_smoke|shared_cache_diagnostics)$/.exec(clause);
      assert.ok(inputCheck, 'unsupported route clause: ' + clause);
      const selected = inputCheck[2] === 'build_input_benchmark' ? benchmark :
        inputCheck[2] === 'shared_cache_smoke' ? smoke : diagnostics;
      return inputCheck[1] ? !selected : selected;
    }).every(Boolean);
  }
  const manual = jobBlock('manual-windows-test-package');
  const benchmark = jobBlock('windows-build-input-benchmark');
  const smoke = jobBlock('windows-shared-cache-smoke');
  const diagnostics = jobBlock('windows-shared-cache-diagnostics');
  for (const event of ['push', 'pull_request', 'workflow_dispatch']) {
    for (const benchmarkMode of [false, true]) for (const smokeMode of [false, true]) for (const diagnosticsMode of [false, true]) {
      const selected = event === 'workflow_dispatch' && smokeMode && diagnosticsMode;
      assert.equal(routes(livenessJob, event, benchmarkMode, smokeMode, diagnosticsMode), selected);
      assert.equal(routes(manual, event, benchmarkMode, smokeMode, diagnosticsMode),
        event === 'workflow_dispatch' && !benchmarkMode && !smokeMode && !diagnosticsMode);
      assert.equal(routes(benchmark, event, benchmarkMode, smokeMode, diagnosticsMode),
        event === 'workflow_dispatch' && benchmarkMode && !smokeMode && !diagnosticsMode);
      assert.equal(routes(smoke, event, benchmarkMode, smokeMode, diagnosticsMode),
        event === 'workflow_dispatch' && smokeMode && !diagnosticsMode);
      assert.equal(routes(diagnostics, event, benchmarkMode, smokeMode, diagnosticsMode),
        event === 'workflow_dispatch' && diagnosticsMode && !smokeMode);
    }
  }
  assert.match(livenessJob, /^    runs-on: windows-2022$/m);
  assert.match(livenessJob, /^    timeout-minutes: 10$/m);
  assert.match(livenessJob, /permissions:\n      contents: read\n      actions: read/);
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  assert.doesNotMatch(workflow, /(?:contents|actions|id-token): write|write-all|secrets\./);
  assert.match(livenessJob, /AUDIT_RELEASE: \$\{\{ inputs\.release_package \}\}/);
  assert.match(livenessJob, /AUDIT_BENCHMARK: \$\{\{ inputs\.build_input_benchmark \}\}/);
  assert.match(livenessJob, /AUDIT_TOOL_SHA: \$\{\{ inputs\.benchmark_expected_sha \}\}/);
  assert.match(livenessJob, /AUDIT_BENCHMARK -eq 'true'/);
  assert.match(livenessJob, /AUDIT_RELEASE -eq 'true'/);
  assert.match(livenessJob, /AUDIT_TOOL_SHA -cnotmatch '\^\[a-f0-9\]\{40\}\$' -or \$env:AUDIT_TOOL_SHA -cne \$env:GITHUB_SHA/);
  assert.match(livenessJob, /if \(\$env:AUDIT_SUITE -eq 'native-liveness'\) \{[\s\S]*?-NativeLivenessOnly[\s\S]*?\} else \{[\s\S]*?-LivenessOnly/);
  assert.match(livenessJob, /AUDIT_SUITE -notin @\('1','3','5','10','native-liveness'\)/);
  assert.doesNotMatch(livenessJob, /npm (?:ci|install)|tools\/build\.ps1|ci-windows-test-package|benchmark-build-inputs/);
  const actionRefs = [...livenessJob.matchAll(/^        uses: [^@\n]+@([^\s]+)/gm)].map(match => match[1]);
  assert.equal(actionRefs.length, 3);
  assert.ok(actionRefs.every(ref => /^[0-9a-f]{40}$/.test(ref)));
});
