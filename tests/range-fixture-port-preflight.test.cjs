'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {createWindowsPortPreflight, selectRoot, guardPort} = require('./helpers/range-fixture-root.cjs');

const SNAPSHOT = 'ETE_TEST_WINDOWS_PORT_SNAPSHOT';
const validJson = JSON.stringify({schema: 1, ranges: [{start: 40000, end: 40020}], occupied: [40100, 40101]});
const netsh = 'Windows Port Exclusions\n40000 40020\n';
const netstat = '  TCP    127.0.0.1:40100    0.0.0.0:0    LISTENING    1234\n' +
  '  TCP    [::]:40101    [::]:0    LISTENING    5678\n';

function mockExec({failAt} = {}) {
  const calls = [];
  const exec = (command, args, options) => {
    calls.push({command, args, options});
    if (command === failAt) throw Error('owned-mock-' + command);
    if (command === 'netsh.exe') return netsh;
    if (command === 'netstat.exe') return netstat;
    throw Error('unexpected-command');
  };
  return {exec, calls};
}

test('Windows preflight runs both read-only commands once, validates output, and latches success', () => {
  const env = {EXISTING: 'keep'}, {exec, calls} = mockExec(), logs = [];
  const preflight = createWindowsPortPreflight({env, exec, log: value => logs.push(value)});
  const result = preflight.read();
  assert.deepEqual(result, {ranges: [{start: 40000, end: 40020}], occupied: new Set([40100, 40101])});
  assert.strictEqual(preflight.read(), result);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(value => value.command), ['netsh.exe', 'netstat.exe']);
  for (const call of calls) {
    assert.equal(call.options.timeout, 10000);
    assert.equal(call.options.windowsHide, true);
  }
  assert.deepEqual(calls[0].args, ['interface', 'ipv4', 'show', 'excludedportrange', 'protocol=tcp']);
  assert.deepEqual(calls[1].args, ['-ano', '-p', 'tcp']);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /"readOnly":true/);
});

test('failed OS query is latched and never repeated', () => {
  for (const failAt of ['netsh.exe', 'netstat.exe']) {
    const {exec, calls} = mockExec({failAt});
    const preflight = createWindowsPortPreflight({env: {}, exec, log() {}});
    assert.throws(() => preflight.read(), new RegExp('owned-mock-' + failAt));
    assert.throws(() => preflight.read(), new RegExp('owned-mock-' + failAt));
    assert.equal(calls.filter(call => call.command === failAt).length, 1);
    assert.equal(calls.length, failAt === 'netsh.exe' ? 1 : 2);
  }
});

test('Windows environment export snapshots once; independent child factories inherit without OS queries', () => {
  const env = {KEEP: 'yes'}, {exec, calls} = mockExec();
  const parent = createWindowsPortPreflight({env, exec, log() {}});
  const childEnv = parent.environment('win32');
  assert.deepEqual(env, {KEEP: 'yes'}, 'input environment remains untouched');
  assert.equal(childEnv.KEEP, 'yes');
  assert.deepEqual(JSON.parse(childEnv[SNAPSHOT]), {schema: 1,
    ranges: [{start: 40000, end: 40020}], occupied: [40100, 40101]});
  assert.equal(calls.length, 2);

  for (let child = 0; child < 3; child++) {
    const independent = createWindowsPortPreflight({env: {...childEnv}, exec() {throw Error('must-inherit-snapshot');}, log() {}});
    const snapshot = independent.read();
    assert.deepEqual(snapshot.ranges, [{start: 40000, end: 40020}]);
    assert.deepEqual(snapshot.occupied, new Set([40100, 40101]));
    assert.deepEqual(independent.environment('win32'), childEnv);
  }
  assert.equal(calls.length, 2, 'children never repeat netsh/netstat');
});

test('snapshot input bypasses external commands and malformed or oversized snapshots fail closed', () => {
  const invalidValues = [
    '', '{', JSON.stringify({schema: 2, ranges: [], occupied: []}),
    JSON.stringify({schema: 1, ranges: [], occupied: [], extra: true}),
    JSON.stringify({schema: 1, ranges: [{start: 40000, end: 40020, extra: 1}], occupied: []}),
    JSON.stringify({schema: 1, ranges: [{start: 0, end: 5}], occupied: []}),
    JSON.stringify({schema: 1, ranges: [{start: 5, end: 4}], occupied: []}),
    JSON.stringify({schema: 1, ranges: [], occupied: [65536]}),
    JSON.stringify({schema: 1, ranges: [], occupied: [40000, 40000]}),
    'x'.repeat(8193), '"' + 'é'.repeat(4096) + '"',
  ];
  for (const value of invalidValues) {
    let calls = 0;
    const preflight = createWindowsPortPreflight({env: {[SNAPSHOT]: value}, exec() {calls++; throw Error('must-not-fallback');}, log() {}});
    assert.throws(() => preflight.read(), /invalid-Windows-test-port-snapshot/);
    assert.throws(() => preflight.environment('win32'), /invalid-Windows-test-port-snapshot/);
    assert.equal(calls, 0, 'present but invalid inherited snapshot must not fall back to OS queries');
  }
});

test('Linux environment is a copied no-query/no-modification result', () => {
  const env = {KEEP: 'same', [SNAPSHOT]: ''}, {exec, calls} = mockExec();
  const preflight = createWindowsPortPreflight({env, exec, log() {}});
  const value = preflight.environment('linux');
  assert.notStrictEqual(value, env);
  assert.deepEqual(value, env);
  assert.deepEqual(env, {KEEP: 'same', [SNAPSHOT]: ''});
  assert.equal(calls.length, 0);
});

test('real guardPort candidates still avoid both excluded ranges and occupied ports', () => {
  const root = path.join(path.parse(process.cwd()).root, 'owned-fixture-port-root');
  const initial = guardPort(path.join(root, 'cache'), 'linux');
  const exclusion = {start: initial, end: initial + 5};
  const excluded = selectRoot(root, ['cache'], [exclusion], new Set(), 'linux');
  assert.notEqual(excluded, root);
  const excludedPort = guardPort(path.join(excluded, 'cache'), 'linux');
  assert.ok(excludedPort < exclusion.start || excludedPort > exclusion.end);

  const occupied = selectRoot(root, ['cache'], [], new Set([initial]), 'linux');
  assert.notEqual(occupied, root);
  assert.notEqual(guardPort(path.join(occupied, 'cache'), 'linux'), initial);
});
