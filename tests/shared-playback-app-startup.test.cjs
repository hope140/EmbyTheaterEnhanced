'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const vm = require('node:vm'), fs = require('node:fs');
const c = require('../tools/shared-playback-cache/app-performance-contract.cjs');
const ENTRY = 'file:///owned/electronapp/www/index.html?autostart=false';
const turn = () => new Promise(resolve => setImmediate(resolve));
function renderer(url = ENTRY) {
  const listeners = new Map();
  const document = {readyState: 'complete', addEventListener(type, listener) {listeners.set(type, listener);}};
  const window = {};
  window.require = window.requirejs = () => {}; window.define = {amd: {}}; window.ipc = {};
  window.Emby = {App: {start() {window.appStartInfo = {}; listeners.get('appready')?.();}}};
  Object.assign(window, {window, self: window, document, setTimeout});
  const context = vm.createContext(window);
  const contents = new EventEmitter(); contents.id = 17; contents.isDestroyed = () => false;
  let queue = Promise.resolve();
  contents.mainFrame = {url, isDestroyed: () => false, detached: false,
    executeJavaScript(script) {const work = queue.then(() => vm.runInContext(script, context)); queue = work.catch(() => {}); return work;}};
  return {contents, context, window, document};
}

test('ordinary observer queues before the unchanged main dom-ready start, without CDP or app-start substitution', async () => {
  const app = new EventEmitter(), marks = [], r = renderer();
  const remove = c.installReadinessObserver(app, ENTRY, (type, data) => marks.push({type, ...data}));
  app.emit('web-contents-created', {}, r.contents);
  // Use the maintained product's real setStartInfo function. Its listener is
  // registered after BrowserWindow construction/web-contents-created.
  const main = fs.readFileSync(require.resolve('../src/electronapp/main.js'), 'utf8');
  const begin = main.indexOf('    function setStartInfo() {'), end = main.indexOf('    function sendCommand', begin);
  assert.ok(begin > 0 && end > begin);
  const setStartInfo = vm.runInNewContext(main.slice(begin, end) + '\nsetStartInfo;', {
    startInfoJson: '{}', sendJavascript: code => r.contents.mainFrame.executeJavaScript(code)
  });
  r.contents.on('dom-ready', setStartInfo);
  r.contents.emit('dom-ready');
  const state = await c.executeAppFrame(r.contents, ENTRY, c.READY_SNAPSHOT);
  assert.equal(state.markerInstalled, true); assert.equal(state.appReady, true);
  assert.equal(c.readinessCode(state), null);
  assert.equal(marks.filter(m => m.type === 'ordinary-ready-observer-settled' && m.installed).length, 1);
  remove(); assert.equal(app.listenerCount('web-contents-created'), 0);
  assert.equal(r.contents.listenerCount('dom-ready'), 1, 'the original main listener remains owned by the product');
  assert.doesNotMatch(c.READY_LISTENER, /\.start\(|dispatchEvent|require\s*=|ipc\s*=/);
});

test('readiness distinguishes missed observation, loader, preload and actual appready; no synthetic ready on install', async () => {
  const app = new EventEmitter(), r = renderer();
  const remove = c.installReadinessObserver(app, ENTRY, () => {});
  app.emit('web-contents-created', {}, r.contents); r.contents.emit('dom-ready');
  const state = await c.executeAppFrame(r.contents, ENTRY, c.READY_SNAPSHOT);
  assert.equal(state.markerInstalled, true); assert.equal(state.appReady, false);
  assert.equal(c.readinessCode(state), 'app-ready-event-missing');
  assert.equal(c.readinessCode({...state, markerInstalled: false}), 'app-ready-observer-missing');
  assert.equal(c.readinessCode({...state, requireType: 'undefined'}), 'app-amd-not-ready');
  assert.equal(c.readinessCode({...state, sameRequire: false}), 'app-amd-not-ready');
  assert.equal(c.readinessCode({...state, amdDefined: false}), 'app-amd-not-ready');
  assert.equal(c.readinessCode({...state, ipc: false}), 'app-preload-ipc-not-ready');
  r.window.Emby.App.start();
  assert.equal(c.readinessCode(await c.executeAppFrame(r.contents, ENTRY, c.READY_SNAPSHOT)), null);
  remove();
});

test('foreign first contents cannot claim the ordinary marker; retired frame result is rejected', async () => {
  const app = new EventEmitter(), marks = [], foreign = renderer('about:blank'), owned = renderer();
  const remove = c.installReadinessObserver(app, ENTRY, type => marks.push(type));
  app.emit('web-contents-created', {}, foreign.contents); foreign.contents.emit('dom-ready');
  assert.equal(marks.length, 0); assert.equal(foreign.window.__eteOwnedAppReadiness, undefined);
  app.emit('web-contents-created', {}, owned.contents); owned.contents.emit('dom-ready');
  owned.contents.mainFrame = {...owned.contents.mainFrame}; await turn();
  assert.ok(marks.includes('ordinary-ready-observer-rejected'));
  remove(); assert.equal(owned.contents.listenerCount('dom-ready'), 0);
});

function quitFixture() {
  const app = new EventEmitter(); let prevented = 0, calls = 0, naturalExits = 0, nativeBusy = false;
  app.quit = () => {
    calls++;
    if (nativeBusy) return;
    nativeBusy = true;
    const event = {defaultPrevented: false, preventDefault() {this.defaultPrevented = true; prevented++;}};
    app.emit('will-quit', event);
    if (!event.defaultPrevented) naturalExits++;
    // Model a native quit stack which has not unwound at a Promise microtask.
    setImmediate(() => {nativeBusy = false;});
  };
  return {app, facts: () => ({prevented, calls, naturalExits})};
}

test('no-helper pre-play failure writes evidence without preventing or recursively reentering ordinary quit', () => {
  const f = quitFixture(); let finalized = 0;
  const remove = c.installQuitCollector({app: f.app, pending: () => [], finalize: () => finalized++, mark: () => {}});
  f.app.quit(); assert.equal(finalized, 1);
  assert.deepEqual(f.facts(), {prevented: 0, calls: 1, naturalExits: 1}); remove();
});

test('real pending stream closes remain awaited, then quit resumes on a fresh turn instead of a Promise microtask', async () => {
  const f = quitFixture(); let release, finalized = 0;
  const pending = new Promise(resolve => {release = resolve;});
  const remove = c.installQuitCollector({app: f.app, pending: () => [pending], finalize: () => finalized++, mark: () => {}});
  f.app.quit(); assert.equal(finalized, 0); assert.equal(f.facts().naturalExits, 0);
  release(); await turn(); await turn();
  assert.equal(finalized, 1); assert.equal(f.facts().naturalExits, 1);
  assert.deepEqual(f.facts(), {prevented: 1, calls: 2, naturalExits: 1}); remove();
});

test('a nonclosing stream still has finite collection and cannot change cleanup failure into success', async () => {
  const f = quitFixture(); let finalized = 0, actualClosed = false;
  const remove = c.installQuitCollector({app: f.app, pending: () => [new Promise(() => {})],
    finalize: () => {finalized++; assert.equal(actualClosed, false);}, mark: () => {}, timeoutMs: 5});
  f.app.quit(); await new Promise(resolve => setTimeout(resolve, 15)); await turn();
  assert.equal(finalized, 1); assert.equal(f.facts().naturalExits, 1); remove();
});

test('receipt failure cannot trap will-quit or silently become a successful finalization', async () => {
  for (const asynchronous of [false, true]) {
    const f = quitFixture(); let failures = 0;
    const remove = c.installQuitCollector({app: f.app, pending: () => asynchronous ? [Promise.resolve()] : [],
      finalize: () => {throw Error('owned-disk-failure');}, onFailure: () => failures++, mark: () => {}});
    f.app.quit(); await turn(); await turn();
    assert.equal(failures, 1); assert.equal(f.facts().naturalExits, 1); remove();
  }
});

test('late receipt/log failures are caught across output chunks even if Electron normal quit returns zero', () => {
  const source = fs.readFileSync(require.resolve('../tools/shared-playback-cache/app-performance-runner.cjs'), 'utf8');
  const begin = source.indexOf('    const take=(part,channel)=>'), end = source.indexOf("    child.stdout.on('data'", begin);
  assert.ok(begin > 0 && end > begin);
  const observed = vm.runInNewContext(source.slice(begin,end) + "\ntake(Buffer.from('SHARED_CACHE_APP_EVI'),'stderr');take(Buffer.from('unrelated'),'stdout');take(Buffer.from('DENCE_FAILURE'),'stderr');({evidenceWriteFailed,outputTails});", {
    Buffer, outputTails:{stdout:'',stderr:''}, evidenceWriteFailed:false, bytes:0, overflow:false, stop(){throw Error('unexpected-stop');}
  });
  assert.equal(observed.evidenceWriteFailed, true);
  assert.ok(observed.outputTails.stderr.length <= 64);
  assert.match(source, /transportGood=.*!result\.evidenceWriteFailed/);
});

test('Windows safe receipt export includes only bounded case JSON and the new fixed lifecycle name', () => {
  const ps = fs.readFileSync(require.resolve('../tools/shared-playback-cache/windows-ci.ps1'), 'utf8');
  const expression = /\$_\.Name -match '(\^case-[^']+)'/.exec(ps);
  assert.ok(expression);
  const allowed = new RegExp(expression[1]);
  for (const name of ['case-0.json', 'case-45.json', 'case-0.lifecycle.jsonl', 'case-45.lifecycle.jsonl']) assert.equal(allowed.test(name), true, name);
  for (const name of ['app-plan.json', 'case-1.raw.json', 'case-1.lifecycle.log', 'case-100.json', 'profile-1', '../case-1.json']) assert.equal(allowed.test(name), false, name);
});

test('cold measure retains the first safe rejection including undefined instead of silently omitting it', async () => {
  const source = fs.readFileSync(require.resolve('../tools/shared-playback-cache/app-performance-electron.cjs'), 'utf8');
  const begin = source.indexOf('    async function measure('), end = source.indexOf('    const cold =', begin);
  assert.ok(begin > 0 && end > begin);
  for (const rejected of [undefined, null, {message: undefined}, new TypeError('account-and-server-private-payload')]) {
    const report = {samples: []}, marks = [];
    const measure = vm.runInNewContext('(' + source.slice(begin,end) + ')', {
      contract: c, report, task: {arm: 'A', pair:-3}, performance,
      observedBytes: async () => ({bodyBytes:0,overlapBytes:0}), cacheProxy:null,
      resourceSample() {}, diskSample() {}, peakRss:0, peakDisk:0, mark:(type,data) => marks.push({type,...data})
    });
    const result = await measure('cold-first-frame', () => Promise.reject(rejected));
    assert.equal(result.status, 'FAIL'); assert.equal(result.code, 'app-sample-failed');
    assert.equal(report.firstFailure.code, 'app-sample-failed');
    assert.equal(report.firstFailure.rejection.type, rejected === null ? 'null' : typeof rejected);
    assert.equal(report.samples[0].latencyMs, null); assert.equal(report.samples[0].status, 'FAIL');
    assert.ok(marks.some(row => row.type === 'sample-failed' && row.code === 'app-sample-failed'));
    assert.equal(JSON.stringify({report, marks}).includes('private-payload'), false);
  }
  assert.equal(c.failureCode(Error('app-decoded-frame-missing'), 'app-sample-failed'), 'app-decoded-frame-missing');
  assert.equal(c.failureCode(Error('user-account-identifier'), 'app-sample-failed'), 'app-sample-failed');
  assert.equal(c.failureCode(Error('app-user-private-identifier'), 'app-sample-failed'), 'app-sample-failed');
  const throwing = new Proxy({}, {get() {throw Error('private-payload');}});
  assert.equal(c.failureCode(throwing, 'app-sample-failed'), 'app-sample-failed');
  assert.deepEqual(c.rejectionFacts(throwing), {type:'object',name:null});
  let messageReads = 0, nameReads = 0;
  const changing = {get message() {return ++messageReads === 1 ? 'app-decoded-frame-missing' : 'private-payload';}, get name() {return ++nameReads === 1 ? 'TypeError' : 'private-payload';}};
  assert.equal(c.failureCode(changing, 'app-sample-failed'), 'app-decoded-frame-missing');
  assert.deepEqual(c.rejectionFacts(changing), {type:'object',name:'TypeError'});
  assert.equal(messageReads, 1); assert.equal(nameReads, 1);
});

test('failed cold start never dispatches pause or later seek and cannot conceal its code', async () => {
  const source = fs.readFileSync(require.resolve('../tools/shared-playback-cache/app-performance-electron.cjs'), 'utf8');
  const begin = source.indexOf('    const cold ='), end = source.indexOf("    if (task.arm === 'B') await until", begin);
  assert.ok(begin > 0 && end > begin);
  const commands = [];
  await assert.rejects(vm.runInNewContext('(async()=>{' + source.slice(begin,end) + '})()', {
    measure: async () => ({status:'FAIL',code:'app-sample-failed'}),
    evalCode: async code => commands.push(code), until: async () => {}, contract:c,
    need(value,code) {if(!value)throw Error(code);}
  }), /app-sample-failed/);
  assert.equal(commands.length, 0, 'no command can make a missing player appear paused');
  let decoded = 0;
  await assert.rejects(vm.runInNewContext('(async()=>{' + source.slice(begin,end) + '})()', {
    measure: async (_scenario, operation) => {try {await operation(); return {status:'PASS'};} catch(error) {return {status:'FAIL',code:c.failureCode(error,'app-sample-failed')};}},
    evalCode: async code => {commands.push(code); return {player:false,source:false};},
    decoded: async () => decoded++, contract:c,
    need(value,code) {if(!value)throw Error(code);}
  }), /app-play-not-established/);
  assert.equal(commands.length, 1); assert.equal(decoded, 0);
});
