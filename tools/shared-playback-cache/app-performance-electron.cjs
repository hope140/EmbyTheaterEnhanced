'use strict';
// Test entry wrapper: execute the verified, unchanged ordinary product main.
// No alternate renderer, API client, PlaybackManager or source proof is supplied.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {pathToFileURL} = require('node:url');
const contract = require('./app-performance-contract.cjs'), fixed = require('./windows-contract.cjs');
const smoke = require('./windows-smoke.cjs');
const previewEvidence = require('./app-preview-observer.cjs');
const fixtureEvidence = require('./fixture-frame-evidence.cjs');
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
  let lastAuditableFrame = null, lastFixtureEvidence = null, carrierDisabled = null, carrierReader, pixelWritesDisabled = false;
  const previewAuditPhases = new Set(), carrierAuditPhases = new Set();
  const mark = (type, data = {}) => {if (report.observations.length < 2048) report.observations.push({type, at: performance.now() - started, ...data}); else observationErrors++;};
  // Entry evidence only: never enable image I/O in the timed matrix.
  const pixelAudit = plan.mode === 'entry' ? require('./app-pixel-audit.cjs').createAudit({root:plan.out,index,
    encodePNG: ({pixels,width,height}) => {
      const image = electron.nativeImage.createFromBitmap(pixels,{width,height});
      need(!image.isEmpty() && image.getSize().width === width && image.getSize().height === height && image.toBitmap().equals(pixels),'app-pixel-codec-roundtrip');
      return image.toPNG();
    }}) : null;
  let scenario = 'startup';
  const preview = previewEvidence.createPreviewObserver({now: () => performance.now(), colored: frame => {
    let evidence;
    try{evidence=fixtureEvidence.analyze(frame,{item:'A'});}catch(_){return false;}
    lastFixtureEvidence={hash:crypto.createHash('sha256').update(frame.pixels).digest('hex'),evidence};
    mark('fixture-preview-evidence',{generation:frame.owner?.generationId??null,...evidence});
    return evidence.matches.some(row=>row.item==='A');
  },
    current: owner => !!service && owner.endpointId === endpoint && owner.generationId === client?.currentGenerationId && service.isPreviewOwner(owner),
    observe: row => mark('preview-observation', {...row, requestedAt: row.requestedAt - started, resolvedAt: row.resolvedAt - started, scenario})});
  function active() {need(!retired && performance.now() < deadline, 'app-worker-deadline');}
  async function until(test, code, ms = 5000) {
    const end = Math.min(deadline, performance.now() + ms);
    while (performance.now() < end) {active(); const found = await test(); active(); if (found && performance.now() < end) return; await delay(10);}
    throw Error(code);
  }
  function tap(object, name, settled) {
    const original = object[name]; need(typeof original === 'function', 'app-observer-target');
    const replacement = function (...values) {
      const requestedAt = performance.now();
      const value = original.apply(this, values);
      const observe = result => {try {settled(result, values, requestedAt);} catch (_) {observationErrors++;}};
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
        if (['time-pos', 'playback-restart', 'pause', 'eof-reached', 'core-idle'].includes(event.name)) {
          const value = typeof event.value === 'boolean' || typeof event.value === 'number' && Number.isFinite(event.value) ? event.value : null;
          if (events.length < 8192) events.push({name: event.name, value, generation: event.generationId, at: performance.now()}); else observationErrors++;
          mark('native-property', {name: event.name, value, generation: event.generationId, scenario});
        }
        if (event.name === 'operation-error') mark('native-operation-error', {...previewEvidence.operationFacts([event])[0], scenario});
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
      lastAuditableFrame = null;
      lastFixtureEvidence = null;
      mark('native-load', {generation, proxied: selected.proxied});
      return super.load(values);
    }
    submitCommand(values) {
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
      const promise = super.request(method, params, options);
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
    tap(value,'capturePreview',(frame,_values,requestedAt)=>{
      if (!pixelAudit || retired || performance.now()>=deadline || !frame || !Buffer.isBuffer(frame.pixels) ||
        !Number.isInteger(frame.width)||frame.width<1||frame.width>160||!Number.isInteger(frame.height)||frame.height<1||frame.height>90||frame.pixels.length!==frame.width*frame.height*4||
        !value.isPreviewOwner(frame.owner) || lastAuditableFrame && requestedAt < lastAuditableFrame.requestedAt) return;
      // One bounded diagnostic frame, never a media buffer or frame history.
      lastAuditableFrame = {width:frame.width,height:frame.height,pixels:Buffer.from(frame.pixels),owner:{...frame.owner},
        requestedAt,resolvedAt:performance.now()};
    });
    tap(value, 'call', (result, values, requestedAt) => {
      if (values[0] === 'create' && result?.status === 'ok') endpoint = result.endpointId;
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
    async function decoded(previousHash = null, after = performance.now(), owner = {endpointId: endpoint, generationId: client?.currentGenerationId}, targetSeconds = null) {
      let result; const frameDeadline = Math.min(deadline, performance.now() + 5000);
      await until(async () => {
        if (!service || !endpoint || !client?.currentGenerationId) return false;
        need(endpoint === owner.endpointId && client.currentGenerationId === owner.generationId && service.isPreviewOwner(owner), 'app-preview-owner-retired');
        const accepted = () => {
          result=preview.frame(owner,after,previousHash,frameDeadline);
          if(!result||!lastFixtureEvidence||lastFixtureEvidence.hash!==result.hash)return false;
          return targetSeconds===null||lastFixtureEvidence.evidence.matches.some(row=>row.item==='A'&&Math.abs(row.frameIndex-targetSeconds*plan.fixture.media.A.fps)<=1);
        };
        if (accepted()) return true;
        if (preview.probeDue()) await service.capturePreview(owner);
        need(endpoint === owner.endpointId && client.currentGenerationId === owner.generationId && service.isPreviewOwner(owner), 'app-preview-owner-retired');
        return accepted();
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
                'gbrp','gbrap','gbrp16','gbrp16le','gbrap16','gbrap16le','gbrpf32','gbrapf32','rgbaf16',
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
    async function seekFailureControl(evalCode) {
      // This runs only AFTER a failed sample. It cannot convert that sample or
      // the case to PASS, and its bytes/timing are not performance samples.
      const owner = {endpointId: endpoint, generationId: generation}, controlClient = client;
      const owned = () => !retired && performance.now()<deadline && client === controlClient && endpoint === owner.endpointId && controlClient?.currentGenerationId === owner.generationId && service?.isPreviewOwner(owner);
      const snapshotState = async phase => {
        const row = {phase, generation: owner.generationId};
        for (const property of ['pause','time-pos','core-idle','current-vo','frame-drop-count','decoder-frame-drop-count']) {
          need(owned(), 'app-preview-owner-retired');
          try {const value = await controlClient.getProperty(property, 1000);
            row[property] = typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) ? value :
              property === 'current-vo' && value === 'gpu-next' ? 'gpu-next' : null;
          } catch (_) {row[property] = null;}
          need(owned(), 'app-preview-owner-retired');
        }
        const video = service?.getVideoWindow();
        row.mainVisible = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
        row.mainMinimized = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized();
        row.videoVisible = !!video && !video.isDestroyed() && video.isVisible();
        mark('seek-failure-state', row); return row;
      };
      const sourceBefore = await observedBytes();
      mark('seek-failure-control-start', {generation: owner.generationId});
      try {
        need(owned(), 'app-preview-owner-retired');
        const paused = await snapshotState('paused');
        need(paused.pause === true && Number.isFinite(paused['time-pos']), 'app-between-seek-pause');
        const pausedCaptureAfter=performance.now(),pausedHash = await decoded(null, pausedCaptureAfter, owner);
        need(owned(), 'app-preview-owner-retired');
        const stillPaused = await controlClient.getProperty('pause',1000);
        need(owned() && stillPaused === true, 'app-between-seek-pause');
        mark('seek-failure-control-paused-frame', {generation:owner.generationId,hash:pausedHash});
        await auditPhase('paused-target',owner,pausedCaptureAfter);need(owned(),'app-preview-owner-retired');
        need(owned(), 'app-preview-owner-retired');
        await evalCode(contract.rendererAction('unpause'));
        need(owned(), 'app-preview-owner-retired');
        await until(async () => {need(owned(), 'app-preview-owner-retired');
          const pause = await controlClient.getProperty('pause',1000);need(owned(), 'app-preview-owner-retired');
          const position = await controlClient.getProperty('time-pos',1000);need(owned(), 'app-preview-owner-retired');
          return pause === false && position > paused['time-pos'] + .25;
        }, 'app-seek-no-resume');
        const resumedCaptureAfter=performance.now(),hash = await decoded(null, resumedCaptureAfter, owner);
        await snapshotState('resumed');
        mark('seek-failure-control-frame', {generation: owner.generationId, hash, changedFromPaused: hash !== pausedHash});
        await auditPhase('resumed',owner,resumedCaptureAfter);need(owned(),'app-preview-owner-retired');
      } catch (error) {mark('seek-failure-control-error', {code: contract.failureCode(error,'app-worker-failed')});}
      finally {
        if (owned()) {
          try {need(owned(), 'app-preview-owner-retired');await evalCode(contract.rendererAction('pause'));need(owned(), 'app-preview-owner-retired');
            await until(async () => {need(owned(), 'app-preview-owner-retired');const pause = await controlClient.getProperty('pause',1000);
              need(owned(), 'app-preview-owner-retired');return pause === true;}, 'app-between-seek-pause');
            mark('seek-failure-control-paused', {generation: owner.generationId});
          } catch (error) {mark('seek-failure-control-error', {code: contract.failureCode(error,'app-worker-failed')});}
        }
        const after = await observedBytes();
        mark('seek-failure-control-end', {generation: owner.generationId, sourceBodyBytes: Math.max(0,after.bodyBytes-sourceBefore.bodyBytes),
          overlapBodyBytes: Math.max(0,after.overlapBytes-sourceBefore.overlapBytes)});
      }
    }
    async function measure(sampleScenario, operation, prepare = async () => {}) {
      scenario = sampleScenario;
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
    if(cold.status!=='PASS'&&client&&endpoint&&generation)
      await auditPhase('reference',{endpointId:endpoint,generationId:generation},0);
    need(cold.status === 'PASS', cold.code || 'app-cold-playback-failed');
    // First seek must move away from the actual paused reference, rather than
    // comparing the target against a cold preview that may already show it.
    await until(async () => client && await client.getProperty('time-pos', 1000) >= contract.TARGETS['cached-seek'] + 1, 'app-initial-position');
    await evalCode(contract.rendererAction('pause'));
    await until(async () => client && await client.getProperty('pause', 1000) === true, 'app-initial-pause');
    const referenceAfter=performance.now();await decoded(null, referenceAfter); mark('initial-paused-frame');
    await auditPhase('reference',{endpointId:endpoint,generationId:generation},referenceAfter);
    if (task.arm === 'B') await until(async () => {const s = await snapshot(); return s.span?.end >= contract.LIMITS.prefixBytes;}, 'app-prefix-coverage-missing', 10000);
    for (const scenario of contract.SCENARIOS.slice(1)) {
      const target = contract.TARGETS[scenario];
      const measured = await measure(scenario, async () => {
        const start = events.length, owner = generation, frameOwner = {endpointId: endpoint, generationId: generation}, previousHash = lastFrameHash;
        await evalCode(contract.rendererAction('seek', target));
        let signals;
        await until(() => (signals = previewEvidence.seekSignals(events, start, owner, target)), 'app-seek-position-restart');
        mark('seek-native-confirmed', {scenario, generation: owner, positionAt: signals.positionAt - started, restartAt: signals.restartAt - started});
        const nextHash = await decoded(previousHash, signals.after, frameOwner,target); mark('seek-new-frame', {scenario, generation: owner, differentFromPrevious: nextHash !== previousHash});
        if(scenario==='cached-seek')await auditPhase('paused-target',frameOwner,signals.after);
        active();
        need(endpoint===frameOwner.endpointId&&client.currentGenerationId===owner&&service.isPreviewOwner(frameOwner),'app-preview-owner-retired');
        const resumedAfter=performance.now();
        await evalCode(contract.rendererAction('unpause'));
        const at = await client.getProperty('time-pos', 1000);
        await until(async () => (await client.getProperty('time-pos', 1000)) > at + 0.05, 'app-seek-no-resume');
        if(scenario==='cached-seek'&&pixelAudit){
          if(lastAuditableFrame?.requestedAt>=resumedAfter)await auditPhase('resumed',frameOwner,resumedAfter);
          else mark('pixel-stage-unavailable',{phase:'resumed',reason:'no-fresh-passive-frame-normal-path-preserved'});
        }
        active();
        need(endpoint===frameOwner.endpointId&&client.currentGenerationId===owner&&service.isPreviewOwner(frameOwner),'app-preview-owner-retired');
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
      if (measured.status === 'FAIL') {
        if (scenario === 'cached-seek') await seekFailureControl(evalCode);
        report.unexecutedAfterFailure = scenario; break;
      }
    }
    need(clientList.length === 1 && client && !client.exited, 'app-owned-memory-single-helper');
    scenario = 'owned-memory';
    const memoryStarted = performance.now();
    report.nativeMemoryMethod = 'single-owned-pid-kernel32-peak-working-set';
    mark('owned-memory-query-start', {method:report.nativeMemoryMethod});
    report.nativeHelperPeakWorkingSetBytes = await require('./app-performance-resources.cjs').nativePeak({child: client.child,
      koffi: get('enhanced/native-media/node_modules/koffi'),
      onObservation: row => mark('owned-memory-query', {...row, elapsedMs:performance.now()-memoryStarted})});
    report.resourceAssessment.native='OBSERVED_OWNED_LIFETIME_PEAK';
    report.electronPeakWorkingSetBytes = peakRss;
    for (const row of report.samples) row.peakRssBytes = Math.max(row.peakRssBytes, peakRss) + report.nativeHelperPeakWorkingSetBytes;
    await evalCode(contract.rendererAction('stop'));
    need(report.samples.length === contract.SCENARIOS.length || report.firstFailure, 'app-sample-count');
    report.status = report.samples.every(s => s.status === 'PASS') && !observationErrors && report.externalNetworkAttempts === 0 ? 'PASS' : 'FAIL';
  } catch (error) {contract.recordTerminalFailure(report, error);}
  finally {
    clearTimeout(timeout); clearInterval(sampling); retired = true;
    lastAuditableFrame = null;
    lastFixtureEvidence = null;
    for (const scenario of contract.SCENARIOS) if (!report.samples.some(row => row.scenario === scenario)) report.samples.push({
      scenario, pair: task.pair, arm: task.arm, status: 'FAIL', latencyMs: null,
      sourceBodyBytes: 0, overlapBodyBytes: 0, peakRssBytes: peakRss, peakDiskBytes: peakDisk});
    report.samples.sort((a,b)=>contract.SCENARIOS.indexOf(a.scenario)-contract.SCENARIOS.indexOf(b.scenario));
    const finalize = () => {
      report.pixelAuditFiles=pixelAudit?pixelAudit.files():[];
      report.pixelAuditAssessment=!pixelAudit?'DISABLED_MATRIX':previewAuditPhases.size===3?'THREE_PREVIEW_PHASES_WINDOW_OPTIONAL':'PARTIAL';
      report.pixelAuditLatencyScope=pixelAudit?'ENTRY_DIAGNOSTIC_INCLUDES_CAPTURE_IO_NOT_PERFORMANCE':'NONE';
      report.pixelWindowIntervention=pixelAudit?'ONLY_AFTER_ORIGINAL_SAMPLE_FAILURE;WM_PRINT_MAY_TRIGGER_PAINT':'NONE';
      report.code ||= report.firstFailure?.code;
      report.nativeHelperStarted = clientList.length > 0;
      report.helperOperationErrors = clientList.map(c => ({count: c.operationErrors.length, rows: previewEvidence.operationFacts(c.operationErrors)}));
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
