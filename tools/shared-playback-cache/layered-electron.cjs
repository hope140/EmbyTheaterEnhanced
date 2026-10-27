'use strict';
// Test entry wrapper: execute the verified, unchanged ordinary product main.
// No alternate renderer, API client, PlaybackManager or source proof is supplied.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {pathToFileURL} = require('node:url');
const contract = require('./layered-protocol.cjs'), fixed = require('./windows-contract.cjs');
const smoke = require('./windows-smoke.cjs');
const previewEvidence = require('./app-preview-observer.cjs');
const fixtureEvidence = require('./fixture-frame-evidence.cjs');
const fixtureColor = require('./fixture-color-profile.cjs');
const need = (value, code) => {if (!value) throw Error(code);};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const electron = require('electron'), {app} = electron;
  need(process.platform === 'win32' && process.versions.electron, 'app-windows-electron-required');
  const args = contract.workerArguments(process.argv.slice(2));
  const plan = require('./layered-runner.cjs').readPlan(args.plan, args['plan-sha256']), index = Number(args.case), task = plan.cases[index];
  need(task && task.index === index, 'app-worker-case');
  fixed.verifyCandidate({repo: plan.repo, runtime: plan.runtime, installer: plan.installer,
    installerSha256: plan.installerSha256, candidateCommit: plan.productCommit});
  const profile = path.join(plan.out, 'profile-' + index), output = path.join(plan.out, 'case-' + index + '.json');
  need(!fs.existsSync(output), 'app-worker-preserve-receipt');
  const get = member => require(path.join(plan.runtime, 'electronapp', member));
  const report = {schema: 2, kind:'ordinary-C-stop-A', phases:Object.fromEntries(contract.PHASES.map(p=>[p,{phase:p,item:contract.ITEM[p],selection:null,owner:null,stopConfirmed:false,samples:contract.blank(task,p)}])), status: 'FAIL', index, pair: task.pair, arm: task.arm, productCommit: plan.productCommit,
    fixtureFormat:Object.fromEntries(contract.PHASES.map(phase=>{const f=plan.fixture.media[contract.ITEM[phase]];return[phase,{encoding:f.encoding,width:f.width,height:f.height,fps:f.fps,sourceBytes:f.size,sourceSha256:f.sha256,alphaChannel:false}];})),
    toolCommit: plan.toolCommit, scope: 'ordinary product main and unchanged web/API/PM; owned loopback fixture; decoded frame not visible presentation',
    resourceAssessment: {electron:'NOT_ASSESSED',native:'NOT_ASSESSED',disk:'NOT_ASSESSED'},
    audio: 'NOT_TESTED_VIDEO_ONLY_FIXTURE', real115Requests: 0, pid: process.pid, samples: [], observations: [], helperExits: [],
    externalNetworkAttempts: 0, discoveryOrWakeRequestsBlocked: 0, udpSocketsBlocked: 0, unknownFixtureRoutes: 0, memoryScope: 'sum of observed Electron working-set peak and owned Native lifetime PeakWorkingSet; conservative sum, not simultaneous RSS'};
  need(/^[1-9][0-9]{12}$/.test(args['deadline-ms']), 'app-worker-deadline-argument');
  const started = performance.now(), deadline = started + Math.max(1, Math.min(contract.LIMITS.workerMs, Number(args['deadline-ms']) - Date.now()));
  let service, client, endpoint, mainWindow, cacheStore, cacheKey, cacheProxy, generation, retired = false, peakRss = 0, peakDisk = 0, observationErrors = 0;
  const restores = [], clientList = [], events = [], storeKeys = new Set(), proxyItems = new Map(), cacheKeys = new Map(), budgetReads = [], sourceContexts = [], cacheReadCalls = [], actualLoads = [], nativePeaks = new Map(), stopJobs = new Set();
  let phaseName='cold-C', mediaId='C', phaseSelection=null, phaseOwner=null,lastAcceptedFrameProof=null,measurementProof=null,measurementSeek=null;
  const ownerOf=(c,generationId=c?.currentGenerationId)=>({helper:c?.helperInstanceId??null,endpointId:c?.layeredEndpoint??endpoint,generationId});
  let storeBootstrap = null;
  let lastAuditableFrame = null, lastFixtureEvidence = null, frameColorProfile = null, carrierDisabled = null, carrierReader, pixelWritesDisabled = false;
  const previewAuditPhases = new Set(), carrierAuditPhases = new Set();
  const mark = (type, data = {}) => {if (report.observations.length < 8192) {const phase=contract.PHASES.includes(data.phase)||data.phase==='quiet'?data.phase:phaseName;report.observations.push({type, at: performance.now() - started, ...data,...(data.phase&&data.phase!==phase?{detailPhase:data.phase}:{}),phase});} else observationErrors++;};
  // Entry evidence only: never enable image I/O in the timed matrix.
  let pixelAudit=null;
  const makeAudit=()=>plan.mode==='entry'?require('./app-pixel-audit.cjs').createAudit({root:path.join(plan.out,phaseName),index,
    encodePNG:({pixels,width,height})=>{const image=electron.nativeImage.createFromBitmap(pixels,{width,height});need(!image.isEmpty()&&image.getSize().width===width&&image.getSize().height===height&&image.toBitmap().equals(pixels),'app-pixel-codec-roundtrip');return image.toPNG();}}):null;
  let scenario = 'startup';
  // This observer proves only freshness/chroma. Full pixels and the independently
  // selected color model are checked in decoded(), never accepted on this alone.
  const preview = previewEvidence.createPreviewObserver({now: () => performance.now(), colored: smoke.coloredFrame,
    current: owner => !!service && owner.endpointId === endpoint && owner.generationId === client?.currentGenerationId && service.isPreviewOwner(owner),
    observe: row => mark('preview-observation', {...row, requestedAt: row.requestedAt - started, resolvedAt: row.resolvedAt - started, scenario})});
  function active() {need(!retired && performance.now() < deadline, 'app-worker-deadline');}
  async function until(test, code, ms = 5000) {
    const end = Math.min(deadline, performance.now() + ms);
    while (performance.now() < end) {active(); const found = await test(); active(); if (found && performance.now() < end) return; await delay(10);}
    throw Error(code);
  }
  function tap(object, name, settled, stage = null, begun = null) {
    const original = object[name]; need(typeof original === 'function', 'app-observer-target');
    const replacement = function (...values) {
      const requestedAt = performance.now(), captured={phase:phaseName,...ownerOf(client)},ownerGeneration=captured.generationId;
      const trace = (outcome, error) => {
        if (!stage || retired) return;
        try {mark('cache-selection-step', {...captured,stage, outcome, generation: ownerGeneration,
          requestMs: requestedAt - started, elapsedMs: Math.max(0, performance.now() - requestedAt),
          ...(['threw', 'rejected'].includes(outcome) ? {diagnostic: get('enhanced/playback-range-diagnostics').fromError(error, 'current-probe', 'cache-unavailable')} : {})});}
        catch (_) {observationErrors++;}
      };
      trace('begin');if(begun)try{begun(values,captured);}catch(_){observationErrors++;}
      let value;
      try {value = original.apply(this, values);} catch (error) {trace('threw', error); throw error;}
      const observe = result => {trace('fulfilled'); try {settled(result, values, requestedAt, captured);} catch (_) {observationErrors++;}};
      if (value && typeof value.then === 'function') value.then(observe, error => trace('rejected', error)).catch(() => {}); else observe(value);
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
  tap(get('enhanced/playback-range-session'), 'createSession', session => {
    if (!session) return;
    tap(session, 'setContext', () => mark('cache-context-result', {cache: smoke.cacheSelectionSnapshot(session.status())}), 'context');
    tap(session, 'select', selected => mark('cache-selection-result', {selected: !!selected,
      cache: smoke.cacheSelectionSnapshot(session.status())}), 'select');
  });
  tap(get('enhanced/shared-playback-cache/adapter'), 'createCache', cache => {
    tap(cache, 'open', handle => {
      if (handle && typeof handle.ready === 'function') tap(handle, 'ready', () => {}, 'adapter-ready');
    }, 'adapter-open');
  }, 'adapter-create');
  tap(get('enhanced/shared-playback-cache/proxy'), 'createProxy', proxy => {cacheProxy = proxy;
    tap(proxy, 'open', (handle, values) => {
      if (typeof handle?.url === 'string') for(const item of ['C','A']) if(contract.isMedia(values[0],plan.sources.origin,item))proxyItems.set(handle.url,item);
      if (handle && typeof handle.ready === 'function') tap(handle, 'ready', () => {}, 'proxy-ready');
    }, 'proxy-open');
  }, 'proxy-create');
  // Observe only the exact, manifest-bound bootstrap source and its owned
  // lexical I/O. Source bytes and product fs/guard operations stay unchanged.
  const storeModule = get('enhanced/shared-playback-cache/store');
  const physicalFs = fixed.selectPhysicalFs(), manifestBytes = physicalFs.readFileSync(path.join(plan.runtime, 'build-manifest.json'));
  need(crypto.createHash('sha256').update(manifestBytes).digest('hex') === plan.identity.manifestSha256, 'app-observer-target');
  const storeMember = 'electronapp/enhanced/shared-playback-cache/store.js';
  const storeRow = JSON.parse(manifestBytes).files.find(row => row.path === storeMember);
  need(storeRow && /^[a-f0-9]{64}$/i.test(storeRow.sha256), 'app-observer-target');
  const storeFilename = path.join(plan.runtime, storeMember);
  storeBootstrap = require('./store-bootstrap-observer.cjs').install({target: storeModule, filename: storeFilename,
    source: physicalFs.readFileSync(storeFilename), expectedSha256: storeRow.sha256,
    root: path.join(profile, 'userdata/shared-playback-byte-cache-v2'),
    context: () => ({generation: client?.currentGenerationId}), now: () => performance.now() - started,
    emit: row => mark('store-bootstrap', row), onFailure: () => {observationErrors++;}});
  restores.push(() => storeBootstrap.restore());
  tap(get('enhanced/shared-playback-cache/store'), 'createStore', store => {
    cacheStore = store;
    tap(store,'read',()=>{},null,(_values,captured)=>{if(cacheReadCalls.length>=8192){observationErrors++;return;}cacheReadCalls.push({...captured,at:performance.now()-started});});
    tap(store, 'open', (key, values) => {for(const item of ['C','A'])if(contract.isMedia(values[0],plan.sources.origin,item)){cacheKeys.set(item,key);storeKeys.add(key);if(item===mediaId)cacheKey=key;}}, 'store-open');
  }, 'store-create');
  const native = get('native-helper/controller'), OriginalClient = native.NativeHelperClient;
  class ObservedClient extends OriginalClient {
    constructor(options) {
      super({...options, onEvent: event => {
        if (['time-pos', 'playback-restart', 'pause', 'eof-reached', 'core-idle'].includes(event.name)) {
          const owned=this.layeredOwners?.get(event.generationId);
          const value = typeof event.value === 'boolean' || typeof event.value === 'number' && Number.isFinite(event.value) ? event.value : null;
          if (events.length < 8192) events.push({name: event.name, value, generation: event.generationId, at: performance.now(),...owned}); else observationErrors++;
          mark('native-property', {name: event.name, value, generation: event.generationId, scenario,...owned});
        }
        if (event.name === 'operation-error') mark('native-operation-error', {...previewEvidence.operationFacts([event])[0], scenario});
        options.onEvent(event);
      }});
      client = this; clientList.push(this);
    }
    async start() {
      const starting = super.start(), child = this.child;
      this.ownedClose = new Promise(resolve => child.once('close', (exitCode, signal) => {
        report.helperExits.push({helper:this.helperInstanceId,pid: child.pid, exitCode, signal, pending: this.pending.size, streamsClosed: [child.stdin, child.stdout, child.stderr].every(stream => stream.destroyed)}); resolve();
      }));
      return await starting;
    }
    beginGeneration(...args) {
      const value=super.beginGeneration(...args);this.layeredOwners ||= new Map();
      this.layeredOwners.set(value,{phase:phaseName,...ownerOf(this,value)});return value;
    }
    stop(...args) {
      const owned={phase:phaseName,...ownerOf(this)},promise=super.stop(...args);stopJobs.add(promise);
      promise.then(()=>mark('native-stop-complete',owned),()=>{observationErrors++;mark('native-stop-failed',owned);}).finally(()=>stopJobs.delete(promise)).catch(()=>{});return promise;
    }
    dispatch(message) {
      const key=this.helperInstanceId+':'+message.requestId,row=budgetReads.find(r=>r.key===key);
      if(row&&message.type==='response'&&message.helperInstanceId===row.helper&&message.generationId===row.generationId&&this.pending.has(message.requestId))row.response={helper:message.helperInstanceId,generationId:message.generationId,requestId:message.requestId,at:performance.now()-started};
      return super.dispatch(message);
    }
    load(values) {
      const selected=contract.loadSource(values[1],plan.sources.mediaOrigin,proxyItems,mediaId),owned=ownerOf(this);
      generation=this.currentGenerationId;phaseOwner=owned;phaseSelection=selected.proxied?'proxy':'original';
      actualLoads.push({phase:phaseName,...owned,selection:phaseSelection,at:performance.now()-started});
      const phase=report.phases[phaseName];if(phase){phase.owner={...owned};phase.selection=phaseSelection;phase.loadAt=performance.now()-started;}
      lastAuditableFrame=null;lastFixtureEvidence=null;frameColorProfile=null;
      let cache=null,cacheEnabled=null;try{const range=service.rangeStatus();cache=smoke.cacheSelectionSnapshot(range);cacheEnabled=range.enabled===true;}catch(_){observationErrors++;}
      mark('native-load',{...owned,generation,proxied:selected.proxied,item:mediaId,cacheEnabled,cache});
      return super.load(values);
    }
    submitCommand(values) {
      if(values[0]==='seek')events.push({name:'seek-submit',value:Number(values[1]),at:performance.now(),...this.layeredOwners?.get(this.currentGenerationId)});
      if (values[0] === 'seek') mark('native-seek-submit', {generation: this.currentGenerationId, scenario,
        seconds: Number.isFinite(Number(values[1])) ? Number(values[1]) : null,
        mode: values.slice(2).every(v => ['absolute', 'exact', 'absolute+exact'].includes(v)) ? values.slice(2).join(' ') : 'other'});
      return super.submitCommand(values);
    }
    setProperty(name, value) {
      mark('native-property-submit', {generation: this.currentGenerationId, scenario, property: previewEvidence.propertyName(name),
        valueType: value === null ? 'null' : typeof value, value: typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) ? value : null});
      return super.setProperty(name, value);
    }
    request(method, params, options) {
      const captured={phase:phaseName,...ownerOf(this,options?.generationId??this.currentGenerationId)},promise = super.request(method, params, options);
      if(method==='get-property'&&params?.name==='demuxer-max-bytes'&&options?.timeoutMs===50){
        const row={...captured,key:this.helperInstanceId+':'+promise.requestId,requestId:promise.requestId,requestGeneration:promise.generationId,at:performance.now()-started,outcome:'pending',response:null};budgetReads.push(row);
        promise.then(result=>{row.outcome='fulfilled';row.bytes=Number.isSafeInteger(result?.value)?result.value:null;row.resolvedAt=performance.now()-started;mark('cache-budget-request',row);},()=>{row.outcome='rejected';mark('cache-budget-request',row);}).catch(()=>{observationErrors++;});
      }
      if(pixelAudit && ['presentation-prepare','presentation-arm','presentation-release','presentation-cancel-preparation'].includes(method)) {
        const at=performance.now();
        promise.then(value=>mark('pixel-presentation-reply',{method,generation:options?.generationId??null,requestMs:at-started,
          ready:value?.ready===true,painted:value?.painted===true,holdPresent:Number.isSafeInteger(value?.holdId)&&value.holdId>0}),
        ()=>mark('pixel-presentation-reply',{method,generation:options?.generationId??null,requestMs:at-started,rejected:true})).catch(()=>{});
      }
      if (method === 'preview-snapshot') {
        const reasons = new Set(['preview-not-ready-or-busy', 'preview-queue-failed', 'preview-owner-unavailable', 'preview-frame-unavailable', 'preview-generation-retired', 'preview-media-ended', 'preview-deadline']);
        promise.then(result => {
          const shape = !!pixelAudit && result?.ready === true && result?.generationId === options?.generationId && result.format === 'bgr24' &&
            Number.isInteger(result.width) && result.width > 0 && result.width <= 160 && Number.isInteger(result.height) && result.height > 0 && result.height <= 90 &&
            typeof result.pixels === 'string' && result.pixels.length <= 57600;
          const bytes = shape ? Buffer.from(result.pixels,'base64') : null;
          const canonical = !!bytes && bytes.length === result.width*result.height*3 && bytes.toString('base64') === result.pixels;
          mark('preview-native-reply', {scenario, generation: options?.generationId ?? null,
            ready: result?.ready === true, reason: reasons.has(result?.reason) ? result.reason : result?.ready === true ? 'ready' : 'other',
            rawShapeValid:pixelAudit?canonical:null,format:shape?'bgr24':null,width:shape?result.width:null,height:shape?result.height:null,
            rawBytes:canonical?bytes.length:null,rawBgrSha256:canonical?crypto.createHash('sha256').update(bytes).digest('hex'):null});
        },
        () => mark('preview-native-reply', {scenario, generation: options?.generationId ?? null, ready: false, reason: 'request-rejected'})).catch(() => {});
      }
      return promise;
    }
  }
  native.NativeHelperClient = ObservedClient;
  restores.push(() => {need(native.NativeHelperClient === ObservedClient, 'app-observer-owner'); native.NativeHelperClient = OriginalClient;});
  tap(get('native-helper/service'), 'createService', value => {
    service = value;
    restores.push(preview.install(value));
    tap(value,'capturePreview',(frame,_values,requestedAt,captured)=>{
      if (retired || performance.now()>=deadline || !frame || !Buffer.isBuffer(frame.pixels) ||
        !Number.isInteger(frame.width)||frame.width<1||frame.width>160||!Number.isInteger(frame.height)||frame.height<1||frame.height>90||frame.pixels.length!==frame.width*frame.height*4||
        !value.isPreviewOwner(frame.owner) || lastAuditableFrame && requestedAt < lastAuditableFrame.requestedAt) return;
      // One bounded frame for validation in both modes, never a media buffer or
      // history. PNG/window I/O remains disabled in the timed matrix.
      lastAuditableFrame = {helper:captured.helper,width:frame.width,height:frame.height,pixels:Buffer.from(frame.pixels),owner:{...frame.owner},
        requestedAt,resolvedAt:performance.now()};
    });
    tap(value, 'call', (result, values, requestedAt,captured) => {
      if (values[0] === 'create' && result?.status === 'ok') {endpoint = result.endpointId;if(client)client.layeredEndpoint=endpoint;}
      if(values[0]==='range-context'&&values[1]?.context){const c=values[1].context;sourceContexts.push({phase:captured.phase,...captured,generationId:values[1].generationId,endpointId:values[2],item:['A','C'].includes(c.itemId)?c.itemId:null,at:requestedAt-started,resolvedAt:performance.now()-started,proofHash:typeof c.sourceProof==='string'?crypto.createHash('sha256').update(c.sourceProof).digest('hex'):null,accepted:result?.value?.state==='ready'&&!result.value.diagnostic});}
      if(pixelAudit && ['prepare-presentation','cancel-presentation','set-visible','begin-generation'].includes(values[0]))
        mark('pixel-service-call',{operation:values[0],requestMs:requestedAt-started,status:result?.status==='ok'?'ok':result?.status==='accepted'?'accepted':'other',
          ready:result?.ready===true,generation:Number.isSafeInteger(values[1]?.generationId)?values[1].generationId:null,
          visible:typeof values[1]?.visible==='boolean'?values[1].visible:null});
    });
    tap(value,'notify',(_result,values,requestedAt)=>{
      if(pixelAudit && values[0]==='set-visible')mark('pixel-service-notify',{operation:'set-visible',requestMs:requestedAt-started,
        generation:Number.isSafeInteger(values[1]?.generationId)?values[1].generationId:null,visible:typeof values[1]?.visible==='boolean'?values[1].visible:null});
    });
  });
  const expectedUrl = pathToFileURL(path.join(plan.runtime, 'electronapp/www/index.html')).href + '?autostart=false';
  restores.push(contract.installReadinessObserver(app, expectedUrl, mark));
  const lifecycleFile = path.join(plan.out, 'case-' + index + '.lifecycle.jsonl');
  need(!fs.existsSync(lifecycleFile), 'app-worker-preserve-lifecycle');
  let lifecycleRows = 0;
  const lifecycle = (type, data = {}) => {
    mark(type, data);
    if (++lifecycleRows > 128) {observationErrors++; report.status = 'FAIL'; process.exitCode = 1; if (lifecycleRows === 129) console.error('SHARED_CACHE_LAYERED_EVIDENCE_FAILURE'); return;}
    try {fs.writeFileSync(lifecycleFile, JSON.stringify({type, at: performance.now() - started, ...data}) + '\n', {flag: lifecycleRows === 1 ? 'wx' : 'a'});}
    catch (_) {observationErrors++; report.status = 'FAIL'; report.lifecycleWriteFailure = true; process.exitCode = 1; console.error('SHARED_CACHE_LAYERED_EVIDENCE_FAILURE');}
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
    async function decoded(previousHash = null, after = performance.now(), owner = {endpointId: endpoint, generationId: client?.currentGenerationId}, targetSeconds = null,absoluteDeadline=Infinity) {
      let result; const frameDeadline = Math.min(deadline,absoluteDeadline, after + 5000);
      await until(async () => {
        if (!service || !endpoint || !client?.currentGenerationId) return false;
        need(endpoint === owner.endpointId && client.currentGenerationId === owner.generationId && service.isPreviewOwner(owner), 'app-preview-owner-retired');
        const accepted = async () => {
          result=preview.frame(owner,after,previousHash,frameDeadline);
          const pixels=lastAuditableFrame,activeClient=client;
          if(!result||!pixels||pixels.helper!==activeClient?.helperInstanceId||pixels.owner.endpointId!==owner.endpointId||pixels.owner.generationId!==owner.generationId||
            crypto.createHash('sha256').update(pixels.pixels).digest('hex')!==result.hash)return false;
          if(!frameColorProfile){
            const profile=await fixtureColor.readProfile(activeClient);
            need(!retired&&client===activeClient&&endpoint===owner.endpointId&&activeClient.currentGenerationId===owner.generationId&&service.isPreviewOwner(owner),'app-preview-owner-retired');
            if(performance.now()>=frameDeadline){mark('fixture-color-profile-late',{generation:owner.generationId});return false;}
            mark('fixture-color-profile',{generation:owner.generationId,...profile});
            need(profile.supported,'app-fixture-color-profile-unavailable');
            frameColorProfile=profile;
          }
          if(performance.now()>=frameDeadline)return false;
          if(!lastFixtureEvidence||lastFixtureEvidence.hash!==result.hash){
            const evidence=fixtureEvidence.analyze(pixels,{item:mediaId,colorModel:frameColorProfile.model});
            lastFixtureEvidence={hash:result.hash,evidence};mark('fixture-preview-evidence',{generation:owner.generationId,...evidence});
          }
          if(performance.now()>=frameDeadline)return false;
          const matched=fixtureEvidence.accepts(lastFixtureEvidence.evidence,{item:mediaId,
            targetFrame:targetSeconds===null?null:targetSeconds*plan.fixture.media[mediaId].fps});
          if(matched)lastAcceptedFrameProof={owner:ownerOf(activeClient,owner.generationId),hash:result.hash,profile:{supported:frameColorProfile.supported,model:frameColorProfile.model},evidence:lastFixtureEvidence.evidence,requestedAt:pixels.requestedAt-started,resolvedAt:pixels.resolvedAt-started,after:after-started,deadline:frameDeadline-started,clock:{origin:started,after,requestedAt:pixels.requestedAt,resolvedAt:pixels.resolvedAt,deadline:frameDeadline}};
          return matched;
        };
        if (await accepted()) return true;
        if (preview.probeDue()) await service.capturePreview(owner);
        need(endpoint === owner.endpointId && client.currentGenerationId === owner.generationId && service.isPreviewOwner(owner), 'app-preview-owner-retired');
        return await accepted();
      }, 'app-decoded-frame-missing');
      lastFrameHash = result.hash; return lastFrameHash;
    }
    async function auditPhase(phase, owner, after) {
      if (!pixelAudit) return;
      if(pixelWritesDisabled){mark('pixel-audit-unavailable',{phase,reason:'prior-audit-write-failure',attempted:false});return;}
      const activeClient = client;
      const owned = () => !retired && performance.now()<deadline && client === activeClient && endpoint === owner.endpointId && activeClient?.currentGenerationId === owner.generationId && service?.isPreviewOwner(owner);
      try {
        need(owned(), 'app-preview-owner-retired');
        const frame = lastAuditableFrame;
        need(frame && frame.owner.endpointId===owner.endpointId && frame.owner.generationId===owner.generationId && frame.requestedAt>=after,'app-pixel-preview-missing');
        if(!previewAuditPhases.has(phase)) {
          let row;
          try{row=pixelAudit.preview(phase,frame,{generation:owner.generationId,requestMs:frame.requestedAt-started,resolveMs:frame.resolvedAt-started});}
          catch(error){pixelWritesDisabled=true;throw error;}
          previewAuditPhases.add(phase);mark('pixel-preview-saved',row);
        }
        // PrintWindow sends WM_PRINT and can trigger painting. It must not
        // intervene before the original cached-seek sample has failed.
        if(!report.firstFailure) {mark('pixel-carrier-deferred',{phase,reason:'preserve-original-baseline'});return;}
        const metadata = {phase,generation:owner.generationId,actualFramePts:null,timePosIsFramePts:false,alphaMeaning:'INTERPRETATION_MODE_NOT_PIXEL_ALPHA'};
        for (const property of ['time-pos','pause','current-vo']) {
          need(owned(),'app-preview-owner-retired');
          try {const value=await activeClient.getProperty(property,1000);
            if(property==='current-vo')metadata.currentVo=['gpu-next','gpu','null'].includes(value)?value:'other';
            else metadata[property==='time-pos'?'timePosAfterPreview':'pauseAfterPreview']=typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)?value:null;
          } catch (_) {metadata[property==='current-vo'?'currentVo':property==='time-pos'?'timePosAfterPreview':'pauseAfterPreview']=null;}
          need(owned(),'app-preview-owner-retired');
        }
        for (const property of ['video-params','video-out-params','video-frame-info']) {
          need(owned(),'app-preview-owner-retired');
          try {
            const value = await activeClient.getProperty(property,1000);
            if (property === 'video-frame-info') metadata[property] = value && typeof value === 'object' ? {
              pictureType:['I','P','B'].includes(value['picture-type'])?value['picture-type']:null,
              interlaced:typeof value.interlaced==='boolean'?value.interlaced:null} : null;
            else {
              const formats = new Set(['pal8','rgb8','bgr8','bgra','bgr0','rgba','rgb0','rgb24','bgr24','rgba64','bgra64','rgba64le','bgra64le',
                'gbrp','gbrap','gbrp16','gbrp16le','gbrap16','gbrap16le','gbrpf32','gbrapf32','gbrpf32le','gbrapf32le','gbrpf32be','gbrapf32be','gbrpf16le','gbrapf16le','rgbaf16','rgbaf32',
                'yuv420p','yuvj420p','yuv420p10le','yuv444p','yuva444p','yuv444p16','yuv444p16le','nv12','p010','p010le','d3d11','d3d11-nv12','d3d11-p010']);
              metadata[property] = value && typeof value === 'object' ? {...Object.fromEntries(['w','h','dw','dh'].map(key=>
                [key,Number.isFinite(value[key])?value[key]:null])),pixelformat:formats.has(value.pixelformat)?value.pixelformat:'other',
                hwPixelformat:formats.has(value['hw-pixelformat'])?value['hw-pixelformat']:null,
                alpha:['auto','straight','premul','none'].includes(value.alpha)?value.alpha:value.alpha==null?null:'other'} : null;
            }
          } catch (_) {metadata[property]=null;}
          need(owned(),'app-preview-owner-retired');
        }
        mark('pixel-frame-metadata',metadata);
        if (carrierDisabled) {mark('pixel-carrier-unavailable',{phase,reason:carrierDisabled,attempted:false});return;}
        if(carrierAuditPhases.has(phase))return;
        const window = service.getVideoWindow();
        need(window && !window.isDestroyed(),'app-pixel-carrier-owner');
        const handle = window.getNativeWindowHandle().readBigUInt64LE();
        carrierReader ||= get('enhanced/native-media/dwm.cjs').createDwm(get('enhanced/native-media/node_modules/koffi'));
        // clientSize validates the HWND belongs to this Electron PID. Never
        // enumerate/capture the desktop or another process's windows.
        const size = carrierReader.clientSize(handle);
        need(Number.isInteger(size.width)&&Number.isInteger(size.height)&&size.width>0&&size.height>0&&
          size.width<=4096&&size.height<=2160&&size.width*size.height*4<=16*1024*1024,'app-pixel-carrier-limit');
        const requestAt=performance.now();
        mark('pixel-carrier-start',{phase,generation:owner.generationId,width:size.width,height:size.height});
        // Do not race this Promise and free its DC/DIB early. The implementation
        // releases them in finally when the real PrintWindow call returns.
        const result=await carrierReader.capture(handle,size.width,size.height,{pixelFormat:'opaque-video-bgrx'});
        const resolvedAt=performance.now();
        need(owned()&&service.getVideoWindow()===window&&!window.isDestroyed()&&window.getNativeWindowHandle().readBigUInt64LE()===handle,'app-pixel-carrier-owner');
        const afterSize=carrierReader.clientSize(handle);
        need(afterSize.width===size.width&&afterSize.height===size.height,'app-pixel-carrier-owner');
        if (!result.accepted || resolvedAt-requestAt>=3000) {
          carrierDisabled = !result.accepted?'print-not-accepted':'late-result';
          mark('pixel-carrier-unavailable',{phase,reason:carrierDisabled,attempted:true,accepted:!!result.accepted,elapsedMs:resolvedAt-requestAt});return;
        }
        let row;
        try{row=pixelAudit.carrier(phase,{...size,pixels:result.pixels},{generation:owner.generationId,requestMs:requestAt-started,resolveMs:resolvedAt-started});}
        catch(error){pixelWritesDisabled=true;throw error;}
        carrierAuditPhases.add(phase);
        mark('pixel-carrier-saved',row);
      } catch(error) {
        carrierDisabled ||= 'capture-or-owner-unavailable';
        observationErrors++;mark('pixel-audit-failed',{phase,code:contract.failureCode(error,'app-pixel-audit-failed')});
      }
    }
    async function snapshot() {
      resourceSample();
      return {hit: cacheProxy?.status().hitBytes ?? null,
        span: cacheStore && cacheKey ? await cacheStore.span(cacheKey, contract.frameRange(plan.fixture.media[mediaId], contract.TARGETS[phaseName]['cached-seek']).start) : null};
    }
    async function cachedRanges() {
      const ranges = []; let offset = 0;
      if (!cacheStore || !cacheKey) return ranges;
      for (let n = 0; n < 128 && offset < plan.fixture.media[mediaId].size; n++) {
        const span = await cacheStore.span(cacheKey, offset);
        if (span) {need(span.end > offset, 'app-cache-span'); ranges.push({start: span.start, end: span.end}); offset = span.end;}
        else {const next = await cacheStore.nextOffset(cacheKey, offset); if (next === null) return ranges; need(next > offset, 'app-cache-next'); offset = next;}
      }
      need(offset >= plan.fixture.media[mediaId].size, 'app-cache-ranges-limit'); return ranges;
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
      const r = await fetch(plan.controlOrigin + '/snapshot/' + index, {signal: AbortSignal.timeout(2000)}); need(r.ok, 'app-source-observation');const whole=await r.json();return {...whole.phases[phaseName],bodyBytes:whole.phases[phaseName]?.bodyBytes??0,overlapBytes:whole.phases[phaseName]?.overlapBytes??0,whole};
    }
    async function measure(sampleScenario, operation, prepare = async () => {}) {
      scenario = sampleScenario;measurementProof=null;measurementSeek=null;
      let latencyMs = null, status = 'FAIL', code = null, rejection = null;
      let before = await observedBytes(), hitBefore = 0;
      try {await prepare(); before = await observedBytes(); hitBefore = cacheProxy?.status().hitBytes || 0; const initial = performance.now();
        await operation(); latencyMs = performance.now() - initial; status = 'PASS';}
      catch (error) {code = contract.failureCode(error, 'app-sample-failed'); rejection = contract.rejectionFacts(error);}
      const after = await observedBytes(); resourceSample(); diskSample();
      if (task.arm === 'B' && scenario !== 'cold-first-frame' && after.overlapBytes > before.overlapBytes) {status='FAIL';code='app-cache-body-reread';}
      const localHitBytes = Math.max(0,(cacheProxy?.status().hitBytes||0)-hitBefore);
      if(task.arm==='B'&&phaseName==='ready-A'&&scenario==='boundary-seek'&&localHitBytes<=0){status='FAIL';code='layered-boundary-no-local-hit';}
      if(task.arm==='B'&&phaseSelection==='original'&&service.rangeStatus().current?.route!=='original'){status='FAIL';code='layered-original-revived';}
      if(phaseSelection==='original'&&localHitBytes!==0){status='FAIL';code='layered-original-revived';}
      mark('sample-path', {scenario,localHitBytes,sourceStreamReadBytes:Math.max(0,after.sourceBytes-before.sourceBytes),
        assessment:localHitBytes?'shared-cache-read':after.bodyBytes>before.bodyBytes?'source-read':'native-demux-or-no-body'});
      report.samples.push({phase:phaseName,item:mediaId,scenario, pair: task.pair, arm: task.arm, status, latencyMs,localHitBytes,code,frameProof:measurementProof,seekProof:measurementSeek,
        sourceBodyBytes: Math.max(0, after.bodyBytes - before.bodyBytes), sourceStreamReadBytes:Math.max(0,after.sourceBytes-before.sourceBytes),oneByteReadBytes:Math.max(0,after.oneByteBytes-before.oneByteBytes), overlapBodyBytes: Math.max(0, after.overlapBytes - before.overlapBytes), peakRssBytes: peakRss, peakDiskBytes: peakDisk});
      if (status === 'FAIL') {
        code ||= 'app-sample-failed';
        const failure = {scenario, code, rejection};
        report.firstFailure ||= failure; mark('sample-failed', failure);
      }
      return {status, code};
    }
    async function runPhase(phase) {
      phaseName=phase;mediaId=contract.ITEM[phase];phaseSelection=null;phaseOwner=null;cacheKey=cacheKeys.get(mediaId)||null;
      report.samples=[];report.phases[phase].samples=report.samples;lastFrameHash=null;lastAuditableFrame=null;lastFixtureEvidence=null;frameColorProfile=null;
      previewAuditPhases.clear();carrierAuditPhases.clear();pixelWritesDisabled=false;carrierDisabled=null;pixelAudit=makeAudit();
      const beforeLoadCount=actualLoads.length;
      try {
    const cold = await measure('cold-first-frame', async () => {
      const playing = await evalCode(contract.rendererAction('play',undefined,phaseName));
      need(playing?.player === true && playing.source === true, 'app-play-not-established');
      await decoded();measurementProof=lastAcceptedFrameProof;
      const loads=actualLoads.filter(r=>r.phase===phaseName);need(loads.length===1,'layered-load-count');
      if(task.arm==='A')need(phaseSelection==='original','app-shared-selection');
      if(task.arm==='B'&&(phaseName==='ready-A'||phaseSelection==='proxy')){
        need(phaseSelection==='proxy','app-shared-selection');
        const budget=budgetReads.findLast(r=>r.phase===phaseName&&contract.sameOwner(r,phaseOwner)&&r.outcome==='fulfilled'&&r.response&&r.response.generationId===r.generationId&&r.requestGeneration===r.generationId&&r.bytes>=262144&&r.bytes<=3072*1048576&&r.resolvedAt<=loads[0].at);
        const context=sourceContexts.findLast(r=>r.phase===phaseName&&contract.sameOwner(r,phaseOwner)&&r.item===mediaId&&r.accepted&&r.proofHash);
        need(budget&&context,'layered-fresh-budget-source');report.phases[phaseName].budget={...budget};report.phases[phaseName].source={...context};
      }
      if(phaseName==='ready-A')need(!contract.sameOwner(report.phases['cold-C'].owner,phaseOwner),'layered-owner-reused');});
    if(cold.status!=='PASS'&&client&&endpoint&&generation)
      await auditPhase('reference',{endpointId:endpoint,generationId:generation},0);
    need(cold.status === 'PASS', cold.code || 'app-cold-playback-failed');
    // First seek must move away from the actual paused reference, rather than
    // comparing the target against a cold preview that may already show it.
    await until(async () => client && await client.getProperty('time-pos', 1000) >= contract.TARGETS[phaseName]['cached-seek'] + 1, 'app-initial-position');
    await evalCode(contract.rendererAction('pause'));
    await until(async () => client && await client.getProperty('pause', 1000) === true, 'app-initial-pause');
    const referenceAfter=performance.now();await decoded(null, referenceAfter); mark('initial-paused-frame');
    await auditPhase('reference',{endpointId:endpoint,generationId:generation},referenceAfter);
    if (task.arm === 'B'&&phaseSelection==='proxy') await until(async () => {const s = await snapshot(); return s.span?.end >= contract.LIMITS.prefixBytes;}, 'app-prefix-coverage-missing', 10000);
    for (const scenario of contract.SCENARIOS.slice(1)) {
      const target = contract.TARGETS[phaseName][scenario];
      const measured = await measure(scenario, async () => {
        const start = events.length, owner = {...phaseOwner}, frameOwner = {endpointId: endpoint, generationId: generation}, previousHash = lastFrameHash;
        const seekDeadline = Math.min(deadline, performance.now() + 5000);
        await evalCode(contract.rendererAction('seek', target));
        if (scenario !== 'cached-seek') {
          // Source shaping only: after the real PM command, unblock at most one
          // gap window on each PRE-EXISTING stalled response. All bytes remain
          // measured; position/restart/new target pixels retain their deadlines.
          active();need(endpoint===frameOwner.endpointId&&contract.sameOwner(ownerOf(client),owner)&&service.isPreviewOwner(frameOwner),'app-preview-owner-retired');
          const response = await fetch(plan.controlOrigin + '/advance/' + index, {method:'POST',
            signal:AbortSignal.timeout(2000),headers:{'Content-Type':'application/json'},body:JSON.stringify({phase:phaseName,scenario})});
          need(response.ok, 'app-seek-source-window');
          const window = await response.json();
          active();need(endpoint===frameOwner.endpointId&&contract.sameOwner(ownerOf(client),owner)&&service.isPreviewOwner(frameOwner),'app-preview-owner-retired');
          need(Number.isSafeInteger(window.advancedResponses) && window.advancedResponses >= 0 &&
            window.maxAdditionalBytesPerResponse === contract.LIMITS.gapBytes, 'app-seek-source-window');
          mark('seek-source-window', {scenario,...window});
        }
        let signals;
        await until(() => (signals = contract.seekSignals(events, start, owner, target)), 'app-seek-position-restart', Math.max(0,seekDeadline-performance.now()));
        mark('seek-native-confirmed', {scenario, generation: owner.generationId, positionAt: signals.positionAt - started, restartAt: signals.restartAt - started});
        const nextHash = await decoded(previousHash, signals.after, frameOwner,target,seekDeadline);measurementProof=lastAcceptedFrameProof;measurementSeek={owner:{...owner},submittedAt:signals.submitAt-started,positionAt:signals.positionAt-started,restartAt:signals.restartAt-started,deadline:seekDeadline-started,target,previousHash,clock:{origin:started,submittedAt:signals.submitAt,positionAt:signals.positionAt,restartAt:signals.restartAt,deadline:seekDeadline}}; mark('seek-new-frame', {scenario, generation: owner.generationId, differentFromPrevious: nextHash !== previousHash});
        if(scenario==='cached-seek')await auditPhase('paused-target',frameOwner,signals.after);
        active();
        need(endpoint===frameOwner.endpointId&&contract.sameOwner(ownerOf(client),owner)&&service.isPreviewOwner(frameOwner),'app-preview-owner-retired');
        const resumedAfter=performance.now();
        await evalCode(contract.rendererAction('unpause'));
        const at = await client.getProperty('time-pos', 1000);
        await until(async () => (await client.getProperty('time-pos', 1000)) > at + 0.05, 'app-seek-no-resume');
        if(scenario==='cached-seek'&&pixelAudit){
          if(lastAuditableFrame?.requestedAt>=resumedAfter)await auditPhase('resumed',frameOwner,resumedAfter);
          else mark('pixel-stage-unavailable',{phase:'resumed',reason:'no-fresh-passive-frame-normal-path-preserved'});
        }
        active();
        need(endpoint===frameOwner.endpointId&&contract.sameOwner(ownerOf(client),owner)&&service.isPreviewOwner(frameOwner),'app-preview-owner-retired');
        await evalCode(contract.rendererAction('pause'));
      }, async () => {
        await until(async () => client && await client.getProperty('pause', 1000) === true, 'app-between-seek-pause');
        const range = contract.frameRange(plan.fixture.media[mediaId], target);
        let span = null;
        if (task.arm === 'B'&&phaseSelection==='proxy') {
          need(cacheStore && cacheKey && storeKeys.size > 0, 'app-cache-owner-missing');
          span = await cacheStore.span(cacheKey, range.start);
          const kind = contract.coverageKind(span, range); mark('seek-coverage', {scenario, kind, range}); contract.assertCoverage(scenario, kind);
        }
        const request = await fetch(plan.controlOrigin + '/window/' + index, {method: 'POST', signal: AbortSignal.timeout(2000), headers: {'Content-Type': 'application/json'}, body: JSON.stringify({phase:phaseName,ranges: task.arm === 'B'&&phaseSelection==='proxy' ? await cachedRanges() : []})});
        need(request.ok, 'app-observation-window');
      });
      if (measured.status === 'FAIL') {
        report.unexecutedAfterFailure = scenario; break;
      }
    }
      }catch(error){report.phases[phase].code=contract.failureCode(error,'app-worker-failed');report.firstFailure ||= {phase,code:report.phases[phase].code};}
      finally {
        if(client&&!client.exited){try{const memoryStart=performance.now();const peak=await require('./app-performance-resources.cjs').nativePeak({child:client.child,koffi:get('enhanced/native-media/node_modules/koffi'),onObservation:row=>mark('owned-memory-query',{...row,elapsedMs:performance.now()-memoryStart})});nativePeaks.set(client.helperInstanceId,{helper:client.helperInstanceId,pid:client.child.pid,bytes:Math.max(peak,nativePeaks.get(client.helperInstanceId)?.bytes||0)});report.resourceAssessment.native='OBSERVED_OWNED_LIFETIME_PEAK';}catch(error){observationErrors++;report.phases[phase].code ||= contract.failureCode(error,'app-owned-memory-query-failed');}}
        try {
          const old=phaseOwner,oldClient=client;await evalCode(contract.rendererAction('stop',undefined,phase));
          await until(async()=>{const source=await observedBytes();return (!old||!service.isPreviewOwner({endpointId:old.endpointId,generationId:old.generationId}))&&((!oldClient||oldClient.exited)?(!oldClient||report.helperExits.some(e=>e.helper===oldClient.helperInstanceId&&e.pid===oldClient.child?.pid&&e.exitCode===0&&e.signal===null&&e.streamsClosed&&e.pending===0)):oldClient.currentGenerationId!==old?.generationId)&&stopJobs.size===0&&(!oldClient||oldClient.pending.size===0)&&(!service.rangeStatus().enabled||service.rangeStatus().current?.state==='idle')&&source.whole.transport.activeMediaResponses===0&&source.whole.transport.heldRequests===0&&source.whole.phases[phase].stoppedReports>0;},'layered-stop-unconfirmed',contract.LIMITS.stopMs);
          report.phases[phase].stopConfirmed=true;
        }catch(error){report.phases[phase].code ||= contract.failureCode(error,'layered-stop-unconfirmed');}
        for(const row of contract.blank(task,phase,report.phases[phase].code||'layered-not-run'))if(!report.samples.some(s=>s.scenario===row.scenario))report.samples.push(row);
        report.samples.sort((a,b)=>contract.SCENARIOS.indexOf(a.scenario)-contract.SCENARIOS.indexOf(b.scenario));
        report.phases[phase].pixelAuditFiles=pixelAudit?pixelAudit.files():[];
        report.phases[phase].loadCount=actualLoads.length-beforeLoadCount;
        if(plan.mode==='entry')fs.writeFileSync(path.join(plan.out,phase,'case-'+index+'.json'),JSON.stringify({index,pixelAuditFiles:report.phases[phase].pixelAuditFiles})+'\n',{flag:'wx'});
      }
      report.phases[phase].status=contract.validatePhase(phase,task.arm,report.phases[phase])&&report.phases[phase].loadCount===1&&!report.phases[phase].code?'PASS':'FAIL';
      return report.phases[phase].status==='PASS';
    }
    let stopService,localQuiet;
    const controlPhase=async phase=>{const r=await fetch(plan.controlOrigin+'/phase/'+index,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase}),signal:AbortSignal.timeout(2000)});need(r.ok,'layered-control-phase');return r.json();};
    await contract.runStages({arm:task.arm,play:runPhase,
      beginQuiet:async()=>{stopService=service;phaseName='quiet';scenario='quiet';const status=cacheStore?.status();need(!status||status.readers===0&&status.pending===0&&status.pendingCount===0,'layered-local-not-drained');localQuiet={hits:cacheProxy?.status().hitBytes||0,reads:cacheReadCalls.length};const value=await controlPhase('quiet');mark('quiet-start',{source:value,backend:service.rangeStatus().backend??null});return value;},
      snapshot:async()=>{const r=await fetch(plan.controlOrigin+'/snapshot/'+index,{signal:AbortSignal.timeout(2000)});need(r.ok,'app-source-observation');return r.json();},
      backend:()=>service.rangeStatus().backend??null,beginReady:()=>controlPhase('ready-A'),wait:delay,now:()=>performance.now(),sameService:()=>service===stopService,hasTargetKey:()=>cacheKeys.has('A'),onQuiet:value=>{report.quiet={...value,localBefore:localQuiet,localAfter:{hits:cacheProxy?.status().hitBytes||0,reads:cacheReadCalls.length},store:cacheStore?.status()??null};const status=cacheStore?.status();need((cacheProxy?.status().hitBytes||0)===localQuiet.hits&&cacheReadCalls.length===localQuiet.reads&&(!status||status.readers===0&&status.pending===0&&status.pendingCount===0),'layered-local-read-during-quiet');}});
    report.status=Object.values(report.phases).every(p=>p.status==='PASS')&&!observationErrors&&report.externalNetworkAttempts===0?'PASS':'FAIL';
  } catch (error) {contract.recordTerminalFailure(report, error);}
  finally {
    clearTimeout(timeout); clearInterval(sampling); retired = true;
    lastAuditableFrame = null;
    lastFixtureEvidence = null;
    frameColorProfile = null;
    for(const phase of contract.PHASES)for(const row of contract.blank(task,phase,report.phases[phase].code||report.code||'layered-not-run'))if(!report.phases[phase].samples.some(s=>s.scenario===row.scenario))report.phases[phase].samples.push(row);
    report.nativePeaks=[...nativePeaks.values()];report.nativeLoads=actualLoads;report.budgetReads=budgetReads;report.sourceContexts=sourceContexts;report.cacheReadCalls=cacheReadCalls;report.electronPeakWorkingSetBytes=peakRss;
    report.resourceScope='observed whole-case Electron plus maximum observed lifetime peak per owned helper; both phases included, no subtraction';
    const knownPeaks=clientList.length>0&&clientList.every(c=>nativePeaks.has(c.helperInstanceId));
    const memory=knownPeaks?peakRss+[...nativePeaks.values()].reduce((n,r)=>n+r.bytes,0):null;
    for(const p of Object.values(report.phases))for(const row of p.samples)if(row.latencyMs!==null){row.peakRssBytes=memory;row.peakDiskBytes=peakDisk;}
    report.samples=contract.PHASES.flatMap(p=>report.phases[p].samples);
    const finalize = () => {
      report.pixelAuditFiles=[];
      report.pixelAuditAssessment=!pixelAudit?'DISABLED_MATRIX':previewAuditPhases.size===3?'THREE_PREVIEW_PHASES_WINDOW_OPTIONAL':'PARTIAL';
      report.pixelAuditLatencyScope=pixelAudit?'ENTRY_DIAGNOSTIC_INCLUDES_CAPTURE_IO_NOT_PERFORMANCE':'NONE';
      report.pixelWindowIntervention=pixelAudit?'ONLY_AFTER_ORIGINAL_SAMPLE_FAILURE;WM_PRINT_MAY_TRIGGER_PAINT':'NONE';
      report.code ||= report.firstFailure?.code;
      report.nativeHelperStarted = clientList.length > 0;
      report.helperOperationErrors = clientList.map(c => ({count: c.operationErrors.length, rows: previewEvidence.operationFacts(c.operationErrors)}));
      report.ownedHelpersClosed = clientList.every(c => c.exited && c.pending.size === 0 &&
        c.operationErrors.length === 0 && report.helperExits.some(e => e.helper===c.helperInstanceId&&e.pid === c.child?.pid && e.exitCode === 0 && e.signal === null && e.streamsClosed && e.pending === 0) &&
        [c.child?.stdin,c.child?.stdout,c.child?.stderr].every(stream => !stream || stream.destroyed));
      report.helperExitAssessment = clientList.length ? (report.ownedHelpersClosed ? 'CONFIRMED' : 'UNCERTAIN') : 'NOT_STARTED';
      if (!report.ownedHelpersClosed || observationErrors || report.status === 'PASS' && (!knownPeaks||clientList.length<1||actualLoads.length!==2||!contract.PHASES.every(p=>actualLoads.filter(l=>l.phase===p).length===1))) report.status = 'FAIL';
      report.observationErrors = observationErrors; report.durationMs = performance.now() - started;
      for (const restore of restores.reverse()) {try {restore();} catch (_) {report.status = 'FAIL'; report.restoreFailure = true;}}
      report.storeInitialization = storeBootstrap?.snapshot() || null;
      if (report.storeInitialization && (report.storeInitialization.pendingCreates || report.storeInitialization.observerErrors || report.storeInitialization.dropped)) report.status = 'FAIL';
      fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
      console.log('SHARED_CACHE_LAYERED_CASE ' + JSON.stringify({index, status: report.status, code: report.code || null, sampleCount: report.samples.length, ownedHelpersClosed: report.ownedHelpersClosed}));
    };
    contract.installQuitCollector({app, finalize, mark: lifecycle, onFailure: () => {report.status = 'FAIL'; report.finalizeFailure = true; process.exitCode = 1; console.error('SHARED_CACHE_LAYERED_EVIDENCE_FAILURE');}, pending: () => clientList
      .filter(c => !report.helperExits.some(e => e.helper===c.helperInstanceId&&e.pid === c.child?.pid && e.streamsClosed))
      .map(c => c.ownedClose || Promise.resolve())});
    lifecycle('ordinary-quit-request'); app.quit();
  }
}
module.exports = {main};
if (process.versions.electron && process.type === 'browser') main().catch(() => {console.error('SHARED_CACHE_APP_WORKER bootstrap-failed'); require('electron').app.exit(2);});
