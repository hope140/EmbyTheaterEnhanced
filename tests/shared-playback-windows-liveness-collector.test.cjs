'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');

// Run the actual collect() body with synthetic plan, receipt and child process.
// Nothing in this fixture starts Electron, an OS process, or a network request.
const source = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-liveness.cjs'), 'utf8');
const start = source.indexOf('function collect(plan, name, globalDeadline) {');
const end = source.indexOf('\nasync function run(', start);
assert(start >= 0 && end > start, 'actual liveness collector function must be present');

function fixture(t, {killBehavior = 'respond'} = {}) {
  let clock = 1000, nextTimer = 0;
  const timers = new Map(), kills = [];
  const child = new EventEmitter();
  Object.assign(child, {pid: 2042, exitCode: null, stdout: new PassThrough(), stderr: new PassThrough(),
    unrefCalled: false, unref() {this.unrefCalled = true;}});
  const targets = [child, child.stdout, child.stderr];
  const baseline = new Map(targets.map(target => [target, new Map(target.eventNames().map(event => [event, target.listeners(event)]))]));
  const receipt = {kind: 'runtime-liveness-case', case: 'bare', status: 'PASS', pid: 2042,
    ppid: 1001, processType: 'browser', browserProcess: true, ready: true, scripts: [], ipcCounts: [0, 0, 0, 0], windowsCreated: 0};
  function exited(code, signal = null) {child.exitCode = code; child.emit('exit', code, signal);}
  function closed() {
    child.stdout.destroy(); child.stderr.destroy();
    child.stdout.emit('close'); child.stderr.emit('close'); child.emit('close');
  }
  child.kill = signal => {
    const sig = signal || 'SIGTERM'; kills.push(sig);
    if (killBehavior === 'deny' || typeof killBehavior === 'object') {
      const e = Error('denied'); e.code = killBehavior.code || 'EPERM';
      queueMicrotask(() => child.emit('error', e));
      return false;
    }
    if (killBehavior === 'respond') queueMicrotask(() => {exited(null, sig); closed();});
    return true;
  };
  const context = {path, process: {pid: 1001}, Promise, Buffer,
    Date: {now: () => clock},
    setTimeout(fn, delay) {const id = ++nextTimer; timers.set(id, {fn, at: clock + delay}); return id;},
    clearTimeout(id) {timers.delete(id);},
    fs: {readFileSync(file) {
      if (path.basename(file) === 'plan.json') return Buffer.from('{"synthetic":true}');
      if (path.basename(file) === 'bare.json') return Buffer.from(JSON.stringify(receipt));
      throw Error('synthetic-no-receipt');
    }},
    sha: () => 'synthetic-hash', profileFor: () => '/synthetic/profile', environment: () => ({}),
    LIMITS: {caseMs: 35000}, validateResult: actual => require('../tools/shared-playback-cache/windows-liveness.cjs').validateResult(actual, 'bare'),
    spawn(executable, args, options) {
      assert.equal(options.shell, false); assert.equal(options.detached, false);
      assert.equal(options.stdio[1], 'pipe'); return child;
    }};
  const collect = vm.runInNewContext(source.slice(start, end) + '; collect', context);
  const plan = {runtime: '/synthetic/runtime', repo: '/synthetic/repo', out: '/synthetic/out'};
  let settled = false;
  const result = collect(plan, 'bare', clock + 100000).then(value => {settled = true; return value;});
  child.emit('spawn');
  function advance(ms) {
    const target = clock + ms;
    for (;;) {
      const due = [...timers].filter(([,v]) => v.at <= target).sort((a,b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]); clock = due[1].at; due[1].fn();
    }
    clock = target;
  }
  t.after(async () => {
    const outcome = await result;
    assert.equal(timers.size, 0, 'deadline and cleanup timers must be cleared');
    assert(child.stdout.destroyed && child.stderr.destroyed, 'owned streams must be destroyed or closed');
    for (const target of targets) {
      const expected = new Map(baseline.get(target));
      if (!outcome.streamsClosed) {
        expected.set('error', [...(expected.get('error') || []), target.listeners('error').find(fn => fn.name === 'ignoreLateError')]);
        const guards = target.listeners('error').filter(fn => fn.name === 'ignoreLateError');
        assert.equal(guards.length, 1, 'unknown collection must retain exactly one named late-error guard');
        assert.doesNotThrow(() => target.emit('error', Object.assign(Error('late synthetic error'), {code: 'EPERM'})),
          'late errors after FAIL must be safely ignored');
      }
      assert.deepEqual(target.eventNames().sort(), [...expected.keys()].sort(), 'only baseline observers and approved late-error guard may remain');
      for (const [event, listeners] of expected) assert.deepEqual(target.listeners(event), listeners,
        'collector-owned observers must be removed, preserving only baseline observers');
    }
  });
  return {child, kills, timers, result, advance, exited, closed, settled: () => settled, clock: () => clock};
}

test('valid receipt is PASS only after exit zero and child close', async t => {
  const f = fixture(t);
  f.exited(0);
  await Promise.resolve();
  assert.equal(f.settled(), false, 'exit alone must not settle before streams and child close');
  f.closed();
  const r = await f.result;
  assert.equal(r.exitConfirmed, true); assert.equal(r.exitCode, 0); assert.equal(r.exitSignal, null);
  assert.equal(r.streamsClosed, true); assert.equal(r.status, 'PASS');
});

test('receipt and app quit without OS exit terminate at the case deadline and fail', async t => {
  const f = fixture(t);
  f.child.stdout.write('app-quit\n');
  f.advance(35000); await Promise.resolve();
  const r = await f.result;
  assert.deepEqual(f.kills, ['SIGTERM']);
  assert.equal(r.exitConfirmed, true); assert.equal(r.exitCode, null);
  assert.equal(r.timedOut, true); assert.equal(r.status, 'FAIL');
});

test('exit zero with pipes that never close reaches cleanup bound and remains unknown', async t => {
  const f = fixture(t, {killBehavior: 'ignore'});
  f.exited(0);
  f.advance(35000); await Promise.resolve();
  f.advance(1000); await Promise.resolve();
  f.advance(1000);
  const r = await f.result;
  assert.deepEqual(f.kills, ['SIGTERM']);
  assert.equal(r.exitConfirmed, true); assert.equal(r.exitCode, 0);
  assert.equal(r.streamsClosed, false); assert.equal(r.status, 'FAIL');
  assert.equal(f.child.unrefCalled, true);
  assert.equal(f.child.stdout.destroyed, true); assert.equal(f.child.stderr.destroyed, true);
});

test('child ignoring SIGTERM and SIGKILL is bounded and remains unknown', async t => {
  const f = fixture(t, {killBehavior: 'ignore'});
  f.advance(35000); await Promise.resolve();
  f.advance(1000); await Promise.resolve();
  f.advance(1000);
  const r = await f.result;
  assert.deepEqual(f.kills, ['SIGTERM', 'SIGKILL']);
  assert.equal(r.exitConfirmed, false); assert.equal(r.streamsClosed, false);
  assert.equal(r.status, 'FAIL'); assert.equal(f.clock(), 38000);
  assert.equal(f.child.unrefCalled, true);
});

for (const code of ['EPERM', 'EACCES']) test(`kill ${code} denial suppresses force retry`, async t => {
  const f = fixture(t, {killBehavior: {code}});
  f.advance(35000); await Promise.resolve();
  f.advance(1000); await Promise.resolve();
  f.advance(1000);
  const r = await f.result;
  assert.deepEqual(f.kills, ['SIGTERM']);
  assert.equal(r.exitConfirmed, false); assert.equal(r.streamsClosed, false);
  assert.equal(r.status, 'FAIL'); assert.equal(f.child.unrefCalled, true);
});
