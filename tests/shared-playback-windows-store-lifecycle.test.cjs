'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const workerSource = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-electron.cjs'), 'utf8');
const openAt = workerSource.indexOf('  async function inspectOwnedStore(');
const closeAt = workerSource.indexOf('  function cleanup()', openAt);
assert.ok(openAt >= 0 && closeAt > openAt, 'worker store-inspection function boundaries must exist');
const inspectSource = workerSource.slice(openAt, closeAt);
const within = require('../tools/shared-playback-cache/windows-smoke.cjs').within;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

function harness(createStore) {
  const scope = {driver: {within}, workerDeadline: 10000, now: () => 0, finishing: false,
    failed: false, receipt: {}, active() {if (scope.finishing) throw Error('worker-retired');},
    get() {return {createStore};}};
  const context = vm.createContext(scope);
  const inspect = vm.runInContext(`(function() {\n${inspectSource}\nreturn inspectOwnedStore;\n})()`, context);
  return {scope, inspect};
}

function trackedStore(status = {current: 123, pending: 0}) {
  let closeCount = 0, statusCount = 0, resolveClosed;
  const closed = new Promise(resolve => {resolveClosed = resolve;});
  const store = {
    status() {statusCount++; return status;},
    close() {closeCount++; resolveClosed(); return Promise.resolve();},
  };
  return {store, closed, get closeCount() {return closeCount;}, get statusCount() {return statusCount;}};
}

test('actual worker store inspection returns its status and closes the store once', async () => {
  const tracked = trackedStore();
  const {inspect} = harness(async options => {
    assert.deepEqual(options, {root: '/owned/cache'});
    return tracked.store;
  });
  const status = await inspect({root: '/owned/cache'}, 100, 'store-open-timeout', value => value);
  assert.deepEqual(status, {current: 123, pending: 0});
  assert.equal(tracked.statusCount, 1);
  assert.equal(tracked.closeCount, 1);
});

test('a timed-out store open that resolves late is closed once without inspection', async () => {
  const opening = deferred(), tracked = trackedStore();
  const {inspect} = harness(() => opening.promise);
  await assert.rejects(inspect({root: '/owned/cache'}, 5, 'store-open-timeout', value => value), /store-open-timeout/);
  opening.resolve(tracked.store);
  await tracked.closed;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tracked.statusCount, 0);
  assert.equal(tracked.closeCount, 1);
});

test('a store open that resolves after worker retirement is closed once and rejected', async () => {
  const opening = deferred(), tracked = trackedStore();
  const {scope, inspect} = harness(() => opening.promise);
  const pending = inspect({root: '/owned/cache'}, 1000, 'store-open-timeout', value => value);
  await new Promise(resolve => setImmediate(resolve));
  scope.finishing = true;
  opening.resolve(tracked.store);
  await assert.rejects(pending, /worker-store-open-retired/);
  await tracked.closed;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(tracked.statusCount, 0);
  assert.equal(tracked.closeCount, 1);
});

test('store closes once even when the inspection callback throws', async () => {
  const tracked = trackedStore();
  const {inspect} = harness(async () => tracked.store);
  await assert.rejects(inspect({root: '/owned/cache'}, 100, 'store-open-timeout', () => {
    throw Error('inspection-failed');
  }), /inspection-failed/);
  assert.equal(tracked.statusCount, 1);
  assert.equal(tracked.closeCount, 1);
});
