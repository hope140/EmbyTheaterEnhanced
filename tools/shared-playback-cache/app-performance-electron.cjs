'use strict';
// Test entry wrapper: execute the verified, unchanged ordinary product main.
// No alternate renderer, API client, PlaybackManager or source proof is supplied.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {pathToFileURL} = require('node:url');
const contract = require('./app-performance-contract.cjs'), fixed = require('./windows-contract.cjs');
const smoke = require('./windows-smoke.cjs');
const need = (value, code) => {if (!value) throw Error(code);};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const electron = require('electron'), {app} = electron;
  need(process.platform === 'win32' && process.versions.electron, 'app-windows-electron-required');
  const args = contract.workerArguments(process.argv.slice(2));
  const plan = require('./app-performance-runner.cjs').readPlan(args.plan, args['plan-sha256']), index = Number(args.case), task = plan.cases[index];
  need(task && task.index === index, 'app-worker-case');
  fixed.verifyCandidate({repo: plan.repo, runtime: plan.runtime, installer: plan.installer,
    installerSha256: plan.installerSha256, candidateCommit: plan.productCommit});
  const profile = path.join(plan.out, 'profile-' + index), output = path.join(plan.out, 'case-' + index + '.json');
  need(!fs.existsSync(output), 'app-worker-preserve-receipt');
  const get = member => require(path.join(plan.runtime, 'electronapp', member));
  const report = {schema: 1, status: 'FAIL', index, pair: task.pair, arm: task.arm, productCommit: plan.productCommit,
    toolCommit: plan.toolCommit, scope: 'ordinary product main and unchanged web/API/PM; owned loopback fixture; decoded frame not visible presentation',
    resourceAssessment: {electron:'NOT_ASSESSED',native:'NOT_ASSESSED',disk:'NOT_ASSESSED'},
    audio: 'NOT_TESTED_VIDEO_ONLY_FIXTURE', real115Requests: 0, pid: process.pid, samples: [], observations: [], helperExits: [],
    externalNetworkAttempts: 0, discoveryOrWakeRequestsBlocked: 0, udpSocketsBlocked: 0, unknownFixtureRoutes: 0, memoryScope: 'sum of observed Electron working-set peak and owned Native lifetime PeakWorkingSet; conservative sum, not simultaneous RSS'};
  need(/^[1-9][0-9]{12}$/.test(args['deadline-ms']), 'app-worker-deadline-argument');
  const started = performance.now(), deadline = started + Math.max(1, Math.min(contract.LIMITS.workerMs, Number(args['deadline-ms']) - Date.now()));
  let service, client, endpoint, mainWindow, cacheStore, cacheKey, cacheProxy, generation, retired = false, peakRss = 0, peakDisk = 0, observationErrors = 0;
  const restores = [], clientList = [], events = [], storeKeys = new Set(), proxyUrls = new Set();
  const mark = (type, data = {}) => {if (report.observations.length < 2048) report.observations.push({type, at: performance.now() - started, ...data}); else observationErrors++;};
  function active() {need(!retired && performance.now() < deadline, 'app-worker-deadline');}
  async function until(test, code, ms = 5000) {
    const end = Math.min(deadline, performance.now() + ms);
    while (performance.now() < end) {active(); if (await test()) return; await delay(10);}
    throw Error(code);
  }
  function tap(object, name, settled) {
    const original = object[name]; need(typeof original === 'function', 'app-observer-target');
    const replacement = function (...values) {
      const value = original.apply(this, values);
      const observe = result => {try {settled(result, values);} catch (_) {observationErrors++;}};
      if (value && typeof value.then === 'function') value.then(observe, () => {}).catch(() => {}); else observe(value);
      return value;
    };
    object[name] = replacement;
    restores.push(() => {need(object[name] === replacement, 'app-observer-owner'); object[name] = original;});
  }
  function resourceSample() {
    const rows = app.getAppMetrics();
    const rss = rows.reduce((n, row) => n + (Number.isFinite(row.memory?.workingSetSize) ? row.memory.workingSetSize * 1024 : 0), 0);
    peakRss = Math.max(peakRss, rss, process.memoryUsage().rss); report.resourceAssessment.electron='OBSERVED_WORKING_SETS';
    if (cacheStore) {const status = cacheStore.status(); peakDisk = Math.max(peakDisk, status.committed || 0);}
  }
  // All business sources are owned TCP loopback fixtures. Deny Node UDP as
  // defense in depth even if a custom-scheme request misses webRequest.
  const datagram = require('node:dgram'), originalDatagram = datagram.createSocket;
  const denyDatagram = () => {report.udpSocketsBlocked++; throw Object.assign(Error('app-lan-discovery-disabled'), {code:'ENETUNREACH'});};
  datagram.createSocket = denyDatagram;
  restores.push(() => {need(datagram.createSocket === denyDatagram, 'app-observer-owner'); datagram.createSocket = originalDatagram;});
  // Read-only observation retains exact arguments, return Promise and side effects.
  tap(get('enhanced/shared-playback-cache/proxy'), 'createProxy', proxy => {cacheProxy = proxy;
    tap(proxy, 'open', (handle, values) => {if (typeof handle?.url === 'string' && contract.isMediaA(values[0], plan.sources.origin)) proxyUrls.add(handle.url);});
  });
  tap(get('enhanced/shared-playback-cache/store'), 'createStore', store => {
    cacheStore = store;
    tap(store, 'open', (key, values) => {if (contract.isMediaA(values[0], plan.sources.origin)) {cacheKey = key; storeKeys.add(key);}});
  });
  const native = get('native-helper/controller'), OriginalClient = native.NativeHelperClient;
  class ObservedClient extends OriginalClient {
    constructor(options) {
      super({...options, onEvent: event => {
        if (['time-pos', 'playback-restart', 'pause', 'eof-reached'].includes(event.name)) {if (events.length < 8192) events.push({name: event.name, value: event.value, generation: event.generationId, at: performance.now()}); else observationErrors++;}
        options.onEvent(event);
      }});
      client = this; clientList.push(this);
    }
    async start() {
      const starting = super.start(), child = this.child;
      this.ownedClose = new Promise(resolve => child.once('close', (exitCode, signal) => {
        report.helperExits.push({pid: child.pid, exitCode, signal, pending: this.pending.size, streamsClosed: [child.stdin, child.stdout, child.stderr].every(stream => stream.destroyed)}); resolve();
      }));
      return await starting;
    }
    load(values) {
      const selected = contract.loadSource(values[1], plan.sources.mediaOrigin, proxyUrls);
      generation = this.currentGenerationId;
      mark('native-load', {generation, proxied: selected.proxied});
      return super.load(values);
    }
  }
  native.NativeHelperClient = ObservedClient;
  restores.push(() => {need(native.NativeHelperClient === ObservedClient, 'app-observer-owner'); native.NativeHelperClient = OriginalClient;});
  tap(get('native-helper/service'), 'createService', value => {
    service = value;
    tap(value, 'call', (result, values) => {if (values[0] === 'create' && result?.status === 'ok') endpoint = result.endpointId;});
  });
  const expectedUrl = pathToFileURL(path.join(plan.runtime, 'electronapp/www/index.html')).href + '?autostart=false';
  restores.push(contract.installReadinessObserver(app, expectedUrl, mark));
  const lifecycleFile = path.join(plan.out, 'case-' + index + '.lifecycle.jsonl');
  need(!fs.existsSync(lifecycleFile), 'app-worker-preserve-lifecycle');
  let lifecycleRows = 0;
  const lifecycle = (type, data = {}) => {
    mark(type, data);
    if (++lifecycleRows > 128) {observationErrors++; report.status = 'FAIL'; process.exitCode = 1; if (lifecycleRows === 129) console.error('SHARED_CACHE_APP_EVIDENCE_FAILURE'); return;}
    try {fs.writeFileSync(lifecycleFile, JSON.stringify({type, at: performance.now() - started, ...data}) + '\n', {flag: lifecycleRows === 1 ? 'wx' : 'a'});}
    catch (_) {observationErrors++; report.status = 'FAIL'; report.lifecycleWriteFailure = true; process.exitCode = 1; console.error('SHARED_CACHE_APP_EVIDENCE_FAILURE');}
  };
  for (const type of ['before-quit', 'will-quit', 'window-all-closed', 'quit']) app.on(type, () => lifecycle('ordinary-' + type));
  process.once('exit', code => lifecycle('ordinary-process-exit', {code}));
  app.on('web-contents-created', (_event, contents) => {
    const fixedError = error => ['Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError'].includes(error?.name) ? error.name : 'OTHER';
    contents.on('preload-error', (_event, _file, error) => mark('ordinary-preload-error', {contentsId: contents.id, errorName: fixedError(error)}));
    contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => mark('ordinary-did-fail-load', {contentsId: contents.id, code: Number.isInteger(code) ? code : null, isMainFrame: !!isMainFrame}));
    contents.on('render-process-gone', (_event, details) => mark('ordinary-render-process-gone', {contentsId: contents.id, reason: ['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure'].includes(details.reason) ? details.reason : 'other'}));
    contents.on('destroyed', () => lifecycle('ordinary-contents-destroyed', {contentsId: contents.id}));
    contents.on('console-message', (_event, ...args) => {
      const message = typeof _event?.message === 'string' ? _event.message : args[1];
      const label = new Map([['onAppReady', 'app-ready-entered'], ['Loaded dependencies in onAppReady', 'app-ready-dependencies'], ['Defining core routes', 'app-routes'], ['loadExternalScripts', 'app-external-scripts']]).get(message);
      if (label) mark('ordinary-console-stage', {contentsId: contents.id, stage: label});
      // Never record raw console text, source URL, stack or exception payload.
    });
    contents.session.webRequest.onBeforeRequest((request, callback) => {
      let allowed = false;
      try {const u = new URL(request.url);
        if (['electronserverdiscovery:', 'electronwakeonlan:'].includes(u.protocol)) {report.discoveryOrWakeRequestsBlocked++; callback({cancel:true}); return;}
        allowed = u.protocol === 'file:' || u.protocol === 'data:' || u.protocol === 'blob:' ||
        ['electronfile:', 'electronapphost:', 'electronfs:', 'electronrefreshrate:'].includes(u.protocol) ||
        (['http:', 'ws:'].includes(u.protocol) && u.hostname === '127.0.0.1' && [new URL(plan.sources.origin).port, new URL(plan.sources.mediaOrigin).port].includes(u.port));} catch (_) {}
      if (!allowed) report.externalNetworkAttempts++;
      callback({cancel: !allowed});
    });
  });
  // Product trial validates the real app path and owns every profile/environment directory.
  process.argv = [process.execPath, path.join(plan.runtime, 'electronapp'), '--ete-shared-cache-trial=' + profile];
  app.setAppPath(process.argv[1]);
  contract.assertEntry({argv: process.argv, runtime: plan.runtime, appPath: app.getAppPath(), appReady: app.isReady()});
  const timeout = setTimeout(() => {mark('worker-deadline'); retired = true;}, Math.max(1, deadline-performance.now()));
  let sampling;
  try {
    mark('ordinary-main-require'); require(path.join(plan.runtime, 'electronapp/main.js'));
    await app.whenReady(); mark('ordinary-app-ready');
    await until(() => {mainWindow = electron.BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/www/index.html')); return !!mainWindow;}, 'app-main-window-missing', 20000);
    const contents = mainWindow.webContents;
    mark('ordinary-main-window', {contentsId: contents.id});
    await until(() => !contents.isLoadingMainFrame() && contents.mainFrame?.url.split('#')[0] === expectedUrl, 'app-document-not-ready', 20000);
    mark('ordinary-document-ready', {contentsId: contents.id, loading: contents.isLoadingMainFrame()});
    const evalCode = code => smoke.within(() => contract.executeAppFrame(contents, expectedUrl, code), Math.min(10000, deadline - performance.now()), 'app-renderer-command-timeout');
    let readiness;
    try {
      await until(async () => {readiness = await evalCode(contract.READY_SNAPSHOT); return contract.readinessCode(readiness) === null;}, 'app-startup-not-ready', 15000);
    } catch (error) {
      mark('ordinary-readiness', readiness || {});
      if (error.message === 'app-startup-not-ready') throw Error(contract.readinessCode(readiness));
      throw error;
    }
    mark('ordinary-readiness', readiness);
    const loggedIn = await evalCode(contract.rendererLogin(plan.sources.origin)); need(loggedIn?.signedIn, 'app-login-failed');
    await until(async () => evalCode("require(['pluginManager']).then(v=>(v[0].default||v[0]).ofType('mediaplayer').some(p=>p.id==='libmpvmediaplayer'))"), 'app-player-not-ready', 10000);
    sampling = setInterval(() => {try {resourceSample();} catch (_) {observationErrors++;}}, 100);
    let lastFrameHash = null;
    async function decoded(previousHash = null) {
      let result;
      await until(async () => {
        if (!service || !endpoint || !client?.currentGenerationId) return false;
        result = await service.capturePreview({endpointId: endpoint, generationId: client.currentGenerationId});
        return smoke.coloredFrame(result) && (!previousHash || crypto.createHash('sha256').update(result.pixels).digest('hex') !== previousHash);
      }, 'app-decoded-frame-missing');
      lastFrameHash = crypto.createHash('sha256').update(result.pixels).digest('hex'); return lastFrameHash;
    }
    async function snapshot() {
      resourceSample();
      return {hit: cacheProxy?.status().hitBytes ?? null,
        span: cacheStore && cacheKey ? await cacheStore.span(cacheKey, contract.frameRange(plan.fixture.media.A, contract.TARGETS['cached-seek']).start) : null};
    }
    async function cachedRanges() {
      const ranges = []; let offset = 0;
      if (!cacheStore || !cacheKey) return ranges;
      for (let n = 0; n < 128 && offset < plan.fixture.media.A.size; n++) {
        const span = await cacheStore.span(cacheKey, offset);
        if (span) {need(span.end > offset, 'app-cache-span'); ranges.push({start: span.start, end: span.end}); offset = span.end;}
        else {const next = await cacheStore.nextOffset(cacheKey, offset); if (next === null) return ranges; need(next > offset, 'app-cache-next'); offset = next;}
      }
      need(offset >= plan.fixture.media.A.size, 'app-cache-ranges-limit'); return ranges;
    }
    function diskSample() {
      const root = path.join(profile, 'userdata/shared-playback-byte-cache-v2'); let count = 0, bytes = 0;
      const scan = directory => {for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        need(++count <= 20000 && !entry.isSymbolicLink(), 'app-cache-disk-layout');
        const file = path.join(directory, entry.name); if (entry.isDirectory()) scan(file); else {const st = fs.lstatSync(file); need(st.isFile() && st.nlink === 1, 'app-cache-disk-layout'); bytes += st.size;}
      }};
      if (fs.existsSync(root)) scan(root); peakDisk = Math.max(peakDisk, bytes); report.resourceAssessment.disk='OBSERVED_LOGICAL_FILES';
    }
    async function observedBytes() {
      // Ask only the local owned coordinator; never origin credentials or URLs.
      const r = await fetch(plan.controlOrigin + '/snapshot/' + index, {signal: AbortSignal.timeout(2000)}); need(r.ok, 'app-source-observation'); return r.json();
    }
    async function measure(scenario, operation, prepare = async () => {}) {
      let latencyMs = null, status = 'FAIL', code = null, rejection = null;
      let before = await observedBytes(), hitBefore = 0;
      try {await prepare(); before = await observedBytes(); hitBefore = cacheProxy?.status().hitBytes || 0; const initial = performance.now();
        await operation(); latencyMs = performance.now() - initial; status = 'PASS';}
      catch (error) {code = contract.failureCode(error, 'app-sample-failed'); rejection = contract.rejectionFacts(error);}
      const after = await observedBytes(); resourceSample(); diskSample();
      if (task.arm === 'B' && scenario !== 'cold-first-frame' && after.overlapBytes > before.overlapBytes) {status='FAIL';code='app-cache-body-reread';}
      const localHitBytes = Math.max(0,(cacheProxy?.status().hitBytes||0)-hitBefore);
      mark('sample-path', {scenario,localHitBytes,sourceStreamReadBytes:Math.max(0,after.bodyBytes-before.bodyBytes),
        assessment:localHitBytes?'shared-cache-read':after.bodyBytes>before.bodyBytes?'source-read':'native-demux-or-no-body'});
      report.samples.push({scenario, pair: task.pair, arm: task.arm, status, latencyMs,
        sourceBodyBytes: Math.max(0, after.bodyBytes - before.bodyBytes), overlapBodyBytes: Math.max(0, after.overlapBytes - before.overlapBytes), peakRssBytes: peakRss, peakDiskBytes: peakDisk});
      if (status === 'FAIL') {
        code ||= 'app-sample-failed';
        const failure = {scenario, code, rejection};
        report.firstFailure ||= failure; mark('sample-failed', failure);
      }
      return {status, code};
    }
    const cold = await measure('cold-first-frame', async () => {
      const playing = await evalCode(contract.rendererAction('play'));
      need(playing?.player === true && playing.source === true, 'app-play-not-established');
      await decoded();
      need(report.observations.some(r => r.type === 'native-load' && r.proxied === (task.arm === 'B')), 'app-shared-selection');});
    need(cold.status === 'PASS', cold.code || 'app-cold-playback-failed');
    await evalCode(contract.rendererAction('pause'));
    await until(async () => client && await client.getProperty('pause', 1000) === true, 'app-initial-pause');
    if (task.arm === 'B') await until(async () => {const s = await snapshot(); return s.span?.end >= contract.LIMITS.prefixBytes;}, 'app-prefix-coverage-missing', 10000);
    for (const scenario of contract.SCENARIOS.slice(1)) {
      const target = contract.TARGETS[scenario];
      await measure(scenario, async () => {
        const start = events.length, owner = generation, previousHash = lastFrameHash;
        await evalCode(contract.rendererAction('seek', target));
        await until(() => events.slice(start).some(e => e.name === 'time-pos' && e.generation === owner && typeof e.value === 'number' && Math.abs(e.value - target) < 0.2) &&
          events.slice(start).some(e => e.name === 'playback-restart' && e.generation === owner), 'app-seek-position-restart');
        const nextHash = await decoded(previousHash); mark('seek-new-frame', {scenario, generation: owner, differentFromPrevious: nextHash !== previousHash});
        await evalCode(contract.rendererAction('unpause'));
        const at = await client.getProperty('time-pos', 1000);
        await until(async () => (await client.getProperty('time-pos', 1000)) > at + 0.05, 'app-seek-no-resume');
        await evalCode(contract.rendererAction('pause'));
      }, async () => {
        await until(async () => client && await client.getProperty('pause', 1000) === true, 'app-between-seek-pause');
        const range = contract.frameRange(plan.fixture.media.A, target);
        let span = null;
        if (task.arm === 'B') {
          need(cacheStore && cacheKey && storeKeys.size > 0, 'app-cache-owner-missing');
          span = await cacheStore.span(cacheKey, range.start);
          const kind = contract.coverageKind(span, range); mark('seek-coverage', {scenario, kind, range}); contract.assertCoverage(scenario, kind);
        }
        const request = await fetch(plan.controlOrigin + '/window/' + index, {method: 'POST', signal: AbortSignal.timeout(2000), headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ranges: task.arm === 'B' ? await cachedRanges() : []})});
        need(request.ok, 'app-observation-window');
      });
    }
    need(clientList.length === 1 && client && !client.exited, 'app-owned-memory-single-helper');
    report.nativeHelperPeakWorkingSetBytes = await require('./app-performance-resources.cjs').nativePeak({child: client.child, systemRoot: process.env.SystemRoot});
    report.resourceAssessment.native='OBSERVED_OWNED_LIFETIME_PEAK';
    report.electronPeakWorkingSetBytes = peakRss;
    for (const row of report.samples) row.peakRssBytes = Math.max(row.peakRssBytes, peakRss) + report.nativeHelperPeakWorkingSetBytes;
    await evalCode(contract.rendererAction('stop'));
    need(report.samples.length === contract.SCENARIOS.length, 'app-sample-count');
    report.status = report.samples.every(s => s.status === 'PASS') && !observationErrors && report.externalNetworkAttempts === 0 ? 'PASS' : 'FAIL';
  } catch (error) {report.code = contract.failureCode(error, 'app-worker-failed'); report.failure = contract.rejectionFacts(error);}
  finally {
    clearTimeout(timeout); clearInterval(sampling); retired = true;
    for (const scenario of contract.SCENARIOS) if (!report.samples.some(row => row.scenario === scenario)) report.samples.push({
      scenario, pair: task.pair, arm: task.arm, status: 'FAIL', latencyMs: null,
      sourceBodyBytes: 0, overlapBodyBytes: 0, peakRssBytes: peakRss, peakDiskBytes: peakDisk});
    report.samples.sort((a,b)=>contract.SCENARIOS.indexOf(a.scenario)-contract.SCENARIOS.indexOf(b.scenario));
    const finalize = () => {
      report.nativeHelperStarted = clientList.length > 0;
      report.ownedHelpersClosed = clientList.every(c => c.exited && c.pending.size === 0 &&
        c.operationErrors.length === 0 && report.helperExits.some(e => e.pid === c.child?.pid && e.exitCode === 0 && e.signal === null && e.streamsClosed && e.pending === 0) &&
        [c.child?.stdin,c.child?.stdout,c.child?.stderr].every(stream => !stream || stream.destroyed));
      report.helperExitAssessment = clientList.length ? (report.ownedHelpersClosed ? 'CONFIRMED' : 'UNCERTAIN') : 'NOT_STARTED';
      if (!report.ownedHelpersClosed || observationErrors || report.status === 'PASS' && clientList.length !== 1) report.status = 'FAIL';
      report.observationErrors = observationErrors; report.durationMs = performance.now() - started;
      for (const restore of restores.reverse()) {try {restore();} catch (_) {report.status = 'FAIL'; report.restoreFailure = true;}}
      fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
      console.log('SHARED_CACHE_APP_CASE ' + JSON.stringify({index, status: report.status, code: report.code || null, sampleCount: report.samples.length, ownedHelpersClosed: report.ownedHelpersClosed}));
    };
    contract.installQuitCollector({app, finalize, mark: lifecycle, onFailure: () => {report.status = 'FAIL'; report.finalizeFailure = true; process.exitCode = 1; console.error('SHARED_CACHE_APP_EVIDENCE_FAILURE');}, pending: () => clientList
      .filter(c => !report.helperExits.some(e => e.pid === c.child?.pid && e.streamsClosed))
      .map(c => c.ownedClose || Promise.resolve())});
    lifecycle('ordinary-quit-request'); app.quit();
  }
}
module.exports = {main};
if (process.versions.electron && process.type === 'browser') main().catch(() => {console.error('SHARED_CACHE_APP_WORKER bootstrap-failed'); require('electron').app.exit(2);});
