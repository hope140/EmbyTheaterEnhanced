'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {PassThrough} = require('node:stream');

// Exercise the production collector body; these fixtures never launch Electron,
// native helpers, or OS processes and cannot supply production PASS evidence.
const source = fs.readFileSync(path.join(__dirname, '../tools/shared-playback-cache/windows-smoke.cjs'), 'utf8');
const start = source.indexOf('async function child('), end = source.indexOf('\nasync function run(', start);
assert(start >= 0 && end > start, 'actual collector function must be present');

function fixture(t, {killError = null} = {}) {
  let clock = 1000, nextTimer = 0;
  const timers = new Map(), kills = [];
  const owned = new EventEmitter();
  Object.assign(owned, {pid: 2000, exitCode: null, stdout: new PassThrough(), stderr: new PassThrough(), unrefCalled: false,
    unref() {this.unrefCalled = true;}});
  const targets = [owned, owned.stdout, owned.stderr];
  const baseline = new Map(targets.map(target => [target, new Map(target.eventNames().map(event => [event, target.listeners(event)]))]));
  function exit(code, signal = null) {owned.exitCode = code; owned.emit('exit', code, signal);}
  function close() {
    owned.stdout.destroy(); owned.stderr.destroy();
    owned.stdout.emit('close'); owned.stderr.emit('close'); owned.emit('close');
  }
  owned.kill = signal => {kills.push(signal || 'SIGTERM');
    if (killError) {const error = Error('synthetic-kill-denied'); error.code = killError; throw error;}
    queueMicrotask(() => {exit(null, signal || 'SIGTERM'); close();}); return true;};
  const context = {path, process: {pid: 1000}, Date: {now: () => clock}, Promise,
    setTimeout(fn, delay) {const id = ++nextTimer; timers.set(id, {fn, at: clock + delay}); return id;},
    clearTimeout(id) {timers.delete(id);},
    fs: {readFileSync(file) {if (['plan.json', 'sources.json'].includes(path.basename(file))) return Buffer.from('{}'); throw Error('synthetic-no-receipt');}},
    sha: () => 'synthetic', validateProfile: () => '/synthetic/profile', childEnvironment: () => ({}),
    spawn(executable, args, options) {assert.equal(options.shell, false); assert.equal(options.detached, false); return owned;}};
  const collect = vm.runInNewContext(source.slice(start, end) + '; child', context);
  let settled = false;
  const result = collect({runtime: '/synthetic', repo: '/synthetic', out: '/synthetic', limits: {phaseDeadlineMs: 50}},
    'synthetic', '/synthetic/sources.json', clock + 2050).then(value => {settled = true; return value;});
  t.after(async () => {
    const outcome = await result;
    assert.equal(timers.size, 0, 'collector must clear deadline, force, and final timers');
    assert(owned.stdout.destroyed && owned.stderr.destroyed, 'owned streams must be destroyed or closed');
    assert.equal(owned.unrefCalled, !outcome.streamsClosed, 'only an unconfirmed child is unrefed');
    for (const target of targets) {
      const expected = new Map(baseline.get(target));
      if (!outcome.streamsClosed) {
        const guards = target.listeners('error').filter(fn => fn.name === 'ignoreLateError');
        assert.equal(guards.length, 1, 'unconfirmed finish retains exactly one named late-error guard');
        expected.set('error', [...(expected.get('error') || []), guards[0]]);
        assert.doesNotThrow(() => target.emit('error', Object.assign(Error('late synthetic error'), {code: 'EACCES'})));
      }
      assert.deepEqual(target.eventNames().sort(), [...expected.keys()].sort());
      for (const [event, listeners] of expected) assert.deepEqual(target.listeners(event), listeners,
        'collector-owned observers must be released');
    }
  });
  return {owned, kills, result, exit, close, settled: () => settled,
    advance(ms) {assert(ms <= 100); const target = clock + ms;
      for (;;) {const due = [...timers].filter(([,v]) => v.at <= target).sort((a,b) => a[1].at-b[1].at)[0];
        if (!due) break; timers.delete(due[0]); clock = due[1].at; due[1].fn();} clock = target;}};
}
async function advanceBy(f, ms) {
  while (ms > 0) {const step = Math.min(100, ms); f.advance(step); ms -= step; await Promise.resolve();}
}
function events(result) {return Array.from(result.processTimeline, row => row.event);}

test('reported app quit does not settle collection before actual exit and close', async t => {
  const f = fixture(t); f.owned.stdout.write('SHARED_CACHE_WORKER app-quit\n');
  await Promise.resolve(); assert.equal(f.settled(), false);
  f.exit(0); await Promise.resolve(); assert.equal(f.settled(), false);
  f.close(); const r = await f.result;
  assert.equal(r.spawnPid, 2000); assert.equal(r.coordinatorPid, 1000);
  assert.equal(r.exitCode, 0); assert.equal(r.exitSignal, null); assert.equal(r.timedOut, false);
  assert.equal(r.terminationReason, null); assert.deepEqual(Array.from(r.workerStages), ['app-quit']);
  assert(events(r).indexOf('exit') < events(r).indexOf('close')); assert.equal(r.receipt, null);
});

test('parent exit zero is preserved while inherited pipes delay close', async t => {
  const f = fixture(t); f.exit(0); f.advance(30);
  await Promise.resolve(); assert.equal(f.settled(), false); assert.equal(f.kills.length, 0);
  f.close(); const r = await f.result;
  assert.equal(r.exitCode, 0); assert.equal(r.exitSignal, null); assert.equal(r.timedOut, false);
  assert.equal(r.processTimeline.find(e => e.event === 'close').elapsedMs, 30);
});

test('closed streams without an actual process exit do not provide exit evidence', async t => {
  const f = fixture(t); f.close(); const r = await f.result;
  assert.equal(r.exitConfirmed, false); assert.equal(r.exitCode, null); assert.equal(r.exitSignal, null);
  assert.equal(r.streamsClosed, true); assert.equal(r.receipt, null);
});

test('live parent after app quit is terminated for deadline with null exit code', async t => {
  const f = fixture(t); f.owned.stdout.write('SHARED_CACHE_WORKER app-quit\n'); f.advance(50);
  const r = await f.result;
  assert.deepEqual(f.kills, ['SIGTERM']); assert.equal(r.exitCode, null); assert.equal(r.exitSignal, 'SIGTERM');
  assert.equal(r.timedOut, true); assert.equal(r.terminationReason, 'deadline');
  assert(events(r).includes('terminate')); assert.equal(r.spawnPid, 2000);
});

test('stdout overflow records a distinct reason while retaining legacy timedOut flag', async t => {
  const f = fixture(t); f.owned.stdout.write(Buffer.alloc(128 * 1024 + 1)); const r = await f.result;
  assert.equal(r.terminationReason, 'stdout-limit'); assert.equal(r.timedOut, true);
  assert.equal(r.stdoutBytes, 128 * 1024 + 1); assert.equal(r.exitSignal, 'SIGTERM');
});

test('nonzero process exit remains nonzero without deadline classification', async t => {
  const f = fixture(t); f.exit(7); f.close(); const r = await f.result;
  assert.equal(r.exitCode, 7); assert.equal(r.exitSignal, null); assert.equal(r.timedOut, false);
  assert.equal(r.terminationReason, null);
});

test('spawn failure is recorded without inventing successful exit evidence', async t => {
  const f = fixture(t); f.owned.emit('error', Error('synthetic-spawn-failure')); f.close(); const r = await f.result;
  assert.equal(r.terminationReason, 'spawn-error'); assert.equal(r.exitCode, null);
  assert.equal(r.exitSignal, null); assert.equal(r.timedOut, false); assert(events(r).includes('spawn-error'));
});

for (const code of ['EPERM', 'EACCES']) test(`kill ${code} denial skips force retry and ends unknown`, async t => {
  const f = fixture(t, {killError: code});
  f.advance(50); await Promise.resolve();
  await advanceBy(f, 2000);
  const r = await f.result;
  assert.deepEqual(f.kills, ['SIGTERM']);
  assert.equal(r.exitConfirmed, false); assert.equal(r.exitCode, null); assert.equal(r.exitSignal, null);
  assert.equal(r.streamsClosed, false); assert.equal(r.timedOut, true);
  assert.equal(r.terminationReason, 'deadline');
  assert(events(r).includes('collection-unconfirmed'));
  assert.equal(f.settled(), true);
});
