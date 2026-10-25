'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const smoke = require('../tools/shared-playback-cache/windows-smoke.cjs');

test('watchdog delay subtracts setup time and keeps a one millisecond floor', () => {
  assert.equal(smoke.watchdogDelay(0, 12000, 40000), 27000);
  assert.equal(smoke.watchdogDelay(100, 39100, 40000), 1);
  assert.equal(smoke.watchdogDelay(100, 50000, 40000), 1);
});

test('watchdog delay rejects invalid clocks and phase budgets', () => {
  for (const values of [
    [NaN, 0, 40000], [0, NaN, 40000], [Infinity, Infinity, 40000],
    [10, 9, 40000], [0, 0, 1000], [0, 0, NaN],
  ]) assert.throws(() => smoke.watchdogDelay(...values));
});

test('within rejects a never-settling task and caller finally cleanup runs', async () => {
  let cleaned = false;
  await assert.rejects((async () => {
    try {
      await smoke.within(() => new Promise(() => {}), 10, 'fixed-deadline-code');
    } finally {
      cleaned = true;
    }
  })(), error => error.message === 'fixed-deadline-code');
  assert.equal(cleaned, true);
});

test('within preserves task resolution and rejection and ignores late settlement', async () => {
  assert.equal(await smoke.within(() => Promise.resolve('done'), 100, 'deadline'), 'done');
  await assert.rejects(smoke.within(() => Promise.reject(Error('task-failed')), 100, 'deadline'),
    error => error.message === 'task-failed');

  let resolveLate;
  const lateResolve = smoke.within(() => new Promise(resolve => {resolveLate = resolve;}), 5, 'late-deadline');
  await assert.rejects(lateResolve, error => error.message === 'late-deadline');
  resolveLate('too-late');
  await new Promise(resolve => setImmediate(resolve));

  let rejectLate;
  const lateReject = smoke.within(() => new Promise((_, reject) => {rejectLate = reject;}), 5, 'late-deadline');
  await assert.rejects(lateReject, error => error.message === 'late-deadline');
  rejectLate(Error('late-task-failure'));
  await new Promise(resolve => setImmediate(resolve));
});

function launchDeadlineWorker({hangCleanup = false} = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-electron.cjs'), 'utf8');
  const realCrypto = require('node:crypto');
  const sessionBytes = Buffer.from(JSON.stringify({schema: 1, origin: 'http://127.0.0.1:1001',
    mediaOrigin: 'http://127.0.0.1:1002', cd2Endpoint: 'http://127.0.0.1:1003'}));
  const sha = bytes => realCrypto.createHash('sha256').update(bytes).digest('hex');
  const fakeWallTime = 1700000000000;
  const runtime = path.resolve(path.sep, 'tmp', 'runtime');
  const out = path.resolve(path.sep, 'tmp', 'out');
  const sessionFile = path.join(out, 'sources.json');
  const receiptFile = path.join(out, 'baseline.json');
  const stagesFile = path.join(out, 'baseline.stages.json');
  const lifecycleFile = path.join(out, 'baseline.lifecycle.json');
  const profile = path.resolve(path.sep, 'tmp', 'profile');
  const plan = {runtime, out, limits: {phaseDeadlineMs: 40000},
    tools: {toolCommit: 'a'.repeat(40)}};
  const args = ['--plan=' + path.join(out, 'plan.json'), '--plan-sha256=ignored', '--session=' + sessionFile,
    '--session-sha256=' + sha(sessionBytes), '--deadline-ms=' + (fakeWallTime + 40000), '--phase=baseline'];
  const timers = [], exits = [], virtualFiles = new Map(), logs = [], windows = [];
  let readyResolve;
  const readyPromise = new Promise(resolve => {readyResolve = resolve;});
  const app = {on() {}, isReady: () => false, setPath() {}, whenReady: () => readyPromise, exit(code) {exits.push(code);}};
  class BrowserWindow {constructor() {windows.push(this);} static getAllWindows() {return windows;}}
  const electron = {app, BrowserWindow, ipcMain: {removeHandler() {}, removeAllListeners() {}}, session: {}};
  const driver = {PHASES: ['baseline', 'natural', 'reopen', 'cancel'], safeFailure: error => error.message,
    watchdogDelay: smoke.watchdogDelay,
    safeNativeTags: () => ({}),
    readPlan() {clock = 12000; return plan;}, validateProfile: () => profile,
    within(task, _ms, code) {
      if (hangCleanup && code === 'worker-owned-teardown-timeout') return new Promise(() => {});
      return Promise.resolve().then(task);
    }};
  let clock = 0;
  const fakeFs = {...fs,
    readFileSync(file) {
      if (file === sessionFile) return sessionBytes;
      throw Error('unexpected-real-file-read:' + file);
    },
    existsSync(file) {
      if ([receiptFile, stagesFile, lifecycleFile].includes(file)) return virtualFiles.has(file);
      throw Error('unexpected-real-path-check:' + file);
    },
    writeFileSync(file, data, options = {}) {
      if (![receiptFile, stagesFile, lifecycleFile].includes(file)) throw Error('unexpected-real-file-write:' + file);
      if (options.flag === 'wx' && virtualFiles.has(file)) throw Error('virtual-file-exists:' + file);
      virtualFiles.set(file, String(data));
    }};
  const fakeRequire = name => {
    if (name === 'electron') return electron;
    if (name === './windows-smoke.cjs') return driver;
    if (name === './windows-contract.cjs') return {};
    if (name === 'node:fs') return fakeFs;
    return require(name);
  };
  const context = {
    require: fakeRequire, process: {argv: ['electron', path.join(out, 'worker.cjs'), ...args], versions: {electron: 'test'},
      platform: 'win32', type: 'browser', pid: 4100, ppid: 4000, once() {}, getActiveResourcesInfo: () => [],
      execPath: path.join(runtime, 'x64/electron/electron.exe')},
    performance: {now: () => clock}, Date: {now: () => fakeWallTime}, URL, Buffer, Response,
    console: {log(...items) {logs.push(items.join(' '));}},
    setTimeout(fn, ms) {timers.push({fn, ms}); return timers.length;}, clearTimeout() {},
  };
  vm.runInNewContext(source, context, {filename: 'windows-electron.cjs'});
  const flush = async () => {
    for (let i = 0; i < 6; i++) { await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); }
  };
  function fire(timerIndex, at) {clock = at; timers[timerIndex].fn();}
  return {timers, exits, logs, virtualFiles, receiptFile, stagesFile, lifecycleFile, windows,
    readyResolve, flush, fire};
}

test('Electron worker soft deadline includes plan-read time, writes FAIL cleanup receipts, and retires before late app readiness', async () => {
  const worker = launchDeadlineWorker();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(worker.timers.length, 2, worker.logs.join('\n'));
  // The worker deadline is 39s from start after its 1s reserve. readPlan used
  // 12s, so soft cleanup has 22s remaining and hard exit stays at 27s.
  assert.deepEqual(worker.timers.map(timer => timer.ms), [22000, 27000]);
  worker.fire(0, 34000);
  await worker.flush();
  assert.deepEqual(worker.exits, [1], JSON.stringify({logs: worker.logs, files: [...worker.virtualFiles.keys()]}));
  assert.ok(worker.virtualFiles.has(worker.receiptFile));
  assert.ok(worker.virtualFiles.has(worker.stagesFile));
  assert.ok(worker.virtualFiles.has(worker.lifecycleFile));
  let receipt = JSON.parse(worker.virtualFiles.get(worker.receiptFile));
  assert.equal(receipt.status, 'FAIL');
  assert.equal(receipt.code, 'worker-deadline');
  assert.equal(receipt.receiptOrigin, 'cleanup');
  assert.equal(receipt.ownedHelpersClosed, false);
  assert.equal(receipt.helperExitAssessment, 'UNCERTAIN');
  assert.deepEqual(worker.windows, []);
  worker.readyResolve();
  await worker.flush();
  assert.deepEqual(worker.windows, [], 'late readiness must not create a window after retirement');
  receipt = JSON.parse(worker.virtualFiles.get(worker.receiptFile));
  assert.equal(receipt.status, 'FAIL');
  assert.deepEqual(worker.exits, [1]);
});

test('hard worker watchdog preserves FAIL when soft-deadline cleanup remains unconfirmed', async () => {
  const worker = launchDeadlineWorker({hangCleanup: true});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(worker.timers.map(timer => timer.ms), [22000, 27000]);
  worker.fire(0, 34000);
  await worker.flush();
  assert.deepEqual(worker.exits, []);
  assert.ok(worker.virtualFiles.has(worker.receiptFile));
  const softReceipt = JSON.parse(worker.virtualFiles.get(worker.receiptFile));
  assert.equal(softReceipt.status, 'FAIL');
  assert.equal(softReceipt.code, 'worker-deadline');
  worker.fire(1, 39000);
  await worker.flush();
  const finalReceipt = JSON.parse(worker.virtualFiles.get(worker.receiptFile));
  assert.equal(finalReceipt.status, 'FAIL');
  assert.equal(finalReceipt.code, 'worker-deadline');
  assert.equal(finalReceipt.receiptOrigin, 'watchdog');
  assert.equal(finalReceipt.ownedHelpersClosed, false);
  assert.deepEqual(worker.exits, [2]);
  assert.deepEqual(worker.windows, []);
});
