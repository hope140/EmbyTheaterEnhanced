'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const vm = require('node:vm');
const test = require('node:test');

const workerPath = path.join(__dirname, '../tools/shared-playback-cache/windows-liveness-electron.cjs');
const preloadPath = path.join(__dirname, '../tools/shared-playback-cache/windows-liveness-preload.cjs');
const workerSource = fs.readFileSync(workerPath, 'utf8');
const preloadSource = fs.readFileSync(preloadPath, 'utf8');
const worker = require(workerPath);
const {CASES, LIMITS, parseArgs, validateResult} = require('../tools/shared-playback-cache/windows-liveness.cjs');

const expectedScripts = [
  ['primitive', 11], ['promise', 12], ['echo-one', 1], ['async-void', 14], ['awaited', 7], ['microtask', 16]
];

function resultFor(caseName, changes = {}) {
  const renderer = caseName !== 'bare';
  const scripts = renderer ? expectedScripts.map(([label, result]) => ({label, result})) : [];
  return {
    exitCode: 0, exitSignal: null, timedOut: false, streamsClosed: true, exitConfirmed: true,
    spawnPid: 4210, coordinatorPid: 4200,
    receipt: {
      schema: 1, kind: 'runtime-liveness-case', case: caseName, status: 'PASS', pid: 4210,
      ppid: 4200, processType: 'browser', browserProcess: true, ready: true,
      windowsCreated: renderer ? 1 : 0,
      hidden: true, backgroundThrottling: false,
      scripts, ipcCounts: renderer ? [1, 1, 1, 1] : [0, 0, 0, 0],
      observations: renderer ? ['entered', 'returned', 'settled', 'entered', 'returned', 'settled',
        'entered', 'returned', 'settled', 'entered', 'returned', 'settled', 'entered', 'returned', 'settled',
        'entered', 'returned', 'settled'] : [],
    },
    ...changes,
  };
}

test('exports the fixed liveness cases, bounded deadlines, and strict six-option parser', () => {
  assert.deepEqual(CASES, ['bare', 'contents', 'frame']);
  assert.deepEqual(LIMITS, {caseMs: 35000, totalMs: 120000});
  const input = [
    '--repo=' + path.resolve('/owned/repo'), '--runtime=' + path.resolve('/owned/runtime'), '--installer=' + path.resolve('/owned/installer.exe'),
    '--installer-sha256=' + 'a'.repeat(64), '--product-sha=' + 'b'.repeat(40), '--out=' + path.resolve('/owned/out')
  ];
  assert.deepEqual(parseArgs(input), {
    repo: path.resolve('/owned/repo'), runtime: path.resolve('/owned/runtime'), installer: path.resolve('/owned/installer.exe'),
    installerSha256: 'a'.repeat(64), productCommit: 'b'.repeat(40), out: path.resolve('/owned/out')
  });
  for (const args of [input.slice(1), [...input, '--extra=x'], [...input, input[0]],
    input.map(value => value === input[0] ? '--repo=' : value), input.map(value => value.startsWith('--installer-sha256=') ? '--installer-sha256=abc' : value)]) {
    assert.throws(() => parseArgs(args));
  }
});

test('accepts only a clean, confirmed browser-process receipt bound to the spawned child', () => {
  for (const name of CASES) assert.equal(validateResult(resultFor(name), name), true, name);
  const invalid = [
    {spawnPid: 4211}, {receipt: {...resultFor('frame').receipt, pid: 4211}},
    {receipt: {...resultFor('frame').receipt, ppid: 4201}},
    {receipt: {...resultFor('frame').receipt, processType: 'renderer'}},
    {receipt: {...resultFor('frame').receipt, kind: 'other'}},
    {receipt: {...resultFor('frame').receipt, status: 'FAIL'}},
    {receipt: {...resultFor('frame').receipt, case: 'contents'}},
    {exitCode: 1}, {exitSignal: 'SIGTERM'}, {timedOut: true}, {streamsClosed: false}, {exitConfirmed: false},
    {receipt: undefined},
  ];
  for (const change of invalid) assert.equal(validateResult(resultFor('frame', change), 'frame'), false, JSON.stringify(change));
  assert.equal(validateResult(resultFor('bare', {receipt: {...resultFor('bare').receipt, ready: false}}), 'bare'), false);
  assert.equal(validateResult(resultFor('bare', {receipt: {...resultFor('bare').receipt, windowsCreated: 1}}), 'bare'), false);
  for (const change of [
    {ready: false}, {scripts: expectedScripts.map(([label, result]) => ({label, result})).slice(1)},
    {scripts: [...expectedScripts.map(([label, result]) => ({label, result})), {label: 'surprise', result: 0}]},
    {scripts: expectedScripts.map(([label, result]) => ({label, result})).reverse()},
    {scripts: expectedScripts.map(([label, result]) => ({label, result: result + 1}))},
    {ipcCounts: [1, 1, 0, 1]}, {hidden: false}, {backgroundThrottling: true},
  ]) {
    assert.equal(validateResult(resultFor('contents', {receipt: {...resultFor('contents').receipt, ...change}}), 'contents'), false, JSON.stringify(change));
    assert.equal(validateResult(resultFor('frame', {receipt: {...resultFor('frame').receipt, ...change}}), 'frame'), false, JSON.stringify(change));
  }
});

test('worker scripts are fixed owned probes and never load product, helper, or HTTP sources', () => {
  assert.ok(Array.isArray(worker.SCRIPTS));
  assert.deepEqual(worker.SCRIPTS.map(([label, , expected]) => [label, expected]), expectedScripts);
  assert.match(workerSource, /windows-liveness-preload\.cjs/);
  assert.doesNotMatch(workerSource + preloadSource, /src\/electronapp|require\([^)]*(?:windows-smoke|windows-electron|windows-preload|trial|proxy|store|adapter)/i);
  assert.doesNotMatch(workerSource + preloadSource, /https?:\/\//i);
  assert.match(workerSource, /caseName|case/);
  assert.equal([...Object.keys(require.cache)].some(name => /node_modules[\\/]@grpc[\\/]/.test(name)), false);
  const loadWithoutElectron = `const Module=require('node:module'); const load=Module._load; Module._load=function(id,...rest){if(id==='electron')throw Error('electron-required');return load.call(this,id,...rest)}; require(${JSON.stringify(workerPath)});`;
  assert.doesNotThrow(() => execFileSync(process.execPath, ['-e', loadWithoutElectron], {encoding: 'utf8'}));
});

test('observeExpression preserves returned Promise identity and records rejection without swallowing it', async () => {
  const promiseExpression = worker.observeExpression('window.probe.promise');
  const rejectedExpression = worker.observeExpression('window.probe.rejected');
  const reports = [];
  const expectedPromise = Promise.resolve(37);
  const context = {window: {probe: {promise: expectedPromise, rejected: Promise.resolve().then(() => { throw Error('probe-rejection'); })},
    ownedLiveness: {report(value) { reports.push(value); }}}};
  const returned = vm.runInNewContext(promiseExpression, context);
  const rejected = vm.runInNewContext(rejectedExpression, context);
  assert.equal(returned, expectedPromise);
  assert.equal(await returned, 37);
  await assert.rejects(rejected, /probe-rejection/);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(reports.some(value => value === 'entered'));
  assert.ok(reports.some(value => value === 'returned'));
  assert.ok(reports.some(value => value === 'settled'));
  assert.ok(reports.some(value => value === 'rejected'));
});
