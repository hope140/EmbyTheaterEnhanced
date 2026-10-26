'use strict';
// Owned Native diagnostic only. Compile the verified runtime Buffer unchanged,
// in Node's own realm, with observing (not simulated) lexical timer functions.
const crypto = require('node:crypto'), path = require('node:path');
const {createRequire} = require('node:module');
function install({target, filename, source, expectedSha256, emit, context = () => ({}), now = () => performance.now(),
  timers = {setTimeout, clearTimeout}}) {
  const sourceSha256 = Buffer.isBuffer(source) && crypto.createHash('sha256').update(source).digest('hex');
  if (!target || typeof target.createProxy !== 'function' || !path.isAbsolute(filename || '') ||
      !/^[a-f0-9]{64}$/i.test(expectedSha256 || '') || sourceSha256 !== expectedSha256.toLowerCase()) throw Error('read-observer-source-mismatch');
  const text = source.toString('utf8');
  const fixedTimer = (text.match(/setTimeout\(\(\) => resolve\(null\), 15\)/g) || []).length === 1;
  const absoluteTimer = /const deadline\s*=\s*performance\.now\(\)\s*\+\s*15\s*;/.test(text) &&
    /const remaining\s*=\s*deadline\s*-\s*performance\.now\(\)\s*;/.test(text) &&
    /if\s*\(remaining\s*>\s*0\)\s*\{\s*timer\s*=\s*setTimeout\(expire,\s*Math\.ceil\(remaining\)\)\s*;\s*return\s*;\s*\}/.test(text) &&
    /timer\s*=\s*setTimeout\(expire,\s*15\)/.test(text) && /resolve\(null\)/.test(text);
  if (!Buffer.from(text, 'utf8').equals(source) || (!fixedTimer && !absoluteTimer)) throw Error('read-observer-source-contract');
  const load = new Function('exports', 'require', 'module', '__filename', '__dirname', 'setTimeout', 'clearTimeout', text);
  const original = target.createProxy, active = new Set(), timerOwners = new Map();
  const totals = {attempts: 0, settled: 0, valid: 0, resultBytes: 0, empty: 0, rejected: 0, threw: 0, fired: 0, unknownTimers: 0, dropped: 0, observerErrors: 0};
  let rows = 0, restored = false;
  function observe(operation, attempt, extra = {}) {
    if (rows >= 3072) {totals.dropped++; return;}
    rows++;
    try {
      const reporting = emit?.({operation, ...(attempt ? {attempt: attempt.id, item: attempt.item, generation: attempt.generation,
        offset: attempt.offset, length: attempt.length, elapsedMs: now() - attempt.started} : {}), ...extra});
      if (reporting && typeof reporting.catch === 'function') reporting.catch(() => {totals.observerErrors++;});
    } catch (_) {totals.observerErrors++;}
  }
  function replacement(options) {
    if (options?.timeoutMs === 15) throw Error('read-observer-timer-collision');
    const store = options.store; let slot = null, firing = null;
    const observedStore = {...store, read(...args) {
      const id = ++totals.attempts; let value;
      try {value = context();} catch (_) {}
      const attempt = {id, item: ['A', 'B', 'C'].includes(value?.item) ? value.item : null,
        generation: Number.isSafeInteger(value?.generation) && value.generation > 0 ? value.generation : null,
        offset: Number.isSafeInteger(args[1]) && args[1] >= 0 ? args[1] : null,
        length: Number.isSafeInteger(args[2]) && args[2] > 0 ? args[2] : null, started: now()};
      observe('read-begin', attempt); active.add(attempt);
      let pending;
      try {pending = store.read.apply(store, args);} catch (error) {
        active.delete(attempt); totals.settled++; totals.threw++; slot = null; observe('read-settled', attempt, {outcome: 'threw'}); throw error;
      }
      // No await occurs between this return and the proxy's read timer creation.
      slot = attempt;
      pending.then(data => {
        active.delete(attempt); totals.settled++;
        const bytes = Buffer.isBuffer(data) ? data.length : 0;
        if (bytes) {totals.valid++; totals.resultBytes += bytes;} else totals.empty++;
        observe('read-settled', attempt, {outcome: bytes ? 'bytes' : 'empty', resultBytes: bytes});
      }, () => {active.delete(attempt); totals.settled++; totals.rejected++; observe('read-settled', attempt, {outcome: 'rejected'});}).catch(() => {});
      return pending;
    }};
    const readSetTimeout = (callback, ms, ...args) => {
      const attempt = firing ? firing.attempt : ms === 15 ? slot : null;
      if (!attempt) {if (ms === 15) totals.unknownTimers++; return timers.setTimeout(callback, ms, ...args);}
      if (firing) firing.rearmed = true;
      else slot = null;
      const owner = {attempt, rearmed: false}; let handle;
      handle = timers.setTimeout(function (...values) {
        timerOwners.delete(handle);
        const previous = firing; firing = owner;
        try {return callback.apply(this, values);}
        finally {
          firing = previous;
          if (owner.rearmed) observe('timer-rearmed', attempt, {deadlineMs: ms});
          else {totals.fired++; observe('timer-fired', attempt);}
        }
      }, ms, ...args);
      timerOwners.set(handle, owner); observe('timer-armed', attempt, {deadlineMs: ms}); return handle;
    };
    const readClearTimeout = handle => {
      if (timerOwners.has(handle)) {const {attempt} = timerOwners.get(handle); timerOwners.delete(handle); observe('timer-cleared', attempt);}
      return timers.clearTimeout(handle);
    };
    const loaded = {exports: {}};
    const nativeRequire = createRequire(filename);
    const observedRequire = id => {
      const value = nativeRequire(id);
      if (id === 'node:perf_hooks' && value && value.performance) return {...value, performance: {...value.performance, now}};
      return value;
    };
    load(loaded.exports, observedRequire, loaded, filename, path.dirname(filename), readSetTimeout, readClearTimeout);
    return loaded.exports.createProxy({...options, store: observedStore});
  }
  target.createProxy = replacement;
  return {snapshot: () => ({mode: 'verified-source-real-read-timer-observation', sourceSha256, ...totals,
    activeReads: active.size, pendingTimers: timerOwners.size, restored}),
    restore() {
      if (restored) return;
      if (target.createProxy !== replacement) throw Error('read-observer-owner-changed');
      target.createProxy = original; restored = true;
    }};
}
module.exports = {install};
