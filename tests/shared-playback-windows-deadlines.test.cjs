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

test('Electron worker watchdog is reduced by time spent reading its plan', async () => {
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
  const profile = path.resolve(path.sep, 'tmp', 'profile');
  const plan = {runtime, out, limits: {phaseDeadlineMs: 40000},
    tools: {toolCommit: 'a'.repeat(40)}};
  const args = ['--plan=' + path.join(out, 'plan.json'), '--plan-sha256=ignored', '--session=' + sessionFile,
    '--session-sha256=' + sha(sessionBytes), '--deadline-ms=' + (fakeWallTime + 40000), '--phase=baseline'];
  const timers = [], exits = [];
  const logs = [];
  const app = {on() {}, isReady: () => false, setPath() {}, whenReady: () => new Promise(() => {}), exit(code) {exits.push(code);}};
  const electron = {app, BrowserWindow: class {}, ipcMain: {}, session: {}};
  const driver = {PHASES: ['baseline', 'natural', 'reopen', 'cancel'], safeFailure: error => error.message,
    watchdogDelay: smoke.watchdogDelay,
    safeNativeTags: () => ({}),
    readPlan() {clock = 12000; return plan;}, validateProfile: () => profile};
  let clock = 0;
  const writtenReceipts = new Map();
  const fakeRequire = name => {
    if (name === 'electron') return electron;
    if (name === './windows-smoke.cjs') return driver;
    if (name === './windows-contract.cjs') return {};
    if (name === 'node:fs') return {...fs, readFileSync(file, ...rest) {
      if (file === sessionFile) return sessionBytes;
      return fs.readFileSync(file, ...rest);
    }, existsSync(file) {
      if (file === receiptFile || file === path.join(out, 'baseline.stages.json')) return false;
      return fs.existsSync(file);
    }, writeFileSync(file, data, options) {
      if (file === receiptFile) {writtenReceipts.set(file, String(data)); return;}
      return fs.writeFileSync(file, data, options);
    }};
    return require(name);
  };
  const context = {
    require: fakeRequire, process: {argv: ['electron', path.join(out, 'worker.cjs'), ...args], versions: {electron: 'test'},
      platform: 'win32', execPath: path.join(runtime, 'x64/electron/electron.exe')},
    performance: {now: () => clock}, Date: {now: () => fakeWallTime}, URL, Buffer, Response,
    console: {log(...items) {logs.push(items.join(' '));}},
    setTimeout(fn, ms) {timers.push({fn, ms}); return timers.length;}, clearTimeout() {},
  };
  vm.runInNewContext(source, context, {filename: 'windows-electron.cjs'});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timers.length, 1, logs.join('\n'));
  assert.equal(timers[0].ms, 27000);
  timers[0].fn();
  assert.equal(writtenReceipts.has(receiptFile), true);
  const receipt = JSON.parse(writtenReceipts.get(receiptFile));
  assert.equal(receipt.status, 'FAIL');
  assert.equal(receipt.code, 'worker-deadline');
  assert.equal(receipt.stage, 'isolated');
  assert.equal(receipt.ownedHelpersClosed, false);
  assert.equal(receipt.helperExitAssessment, 'UNCERTAIN');
  assert.deepEqual(exits, [2]);
});
