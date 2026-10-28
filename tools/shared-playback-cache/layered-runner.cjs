'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), os = require('node:os');
const {spawn, execFileSync} = require('node:child_process');
const contract = require('./layered-protocol.cjs');
const fixed = require('./windows-contract.cjs'), fixtures = require('./windows-fixtures.cjs');
const {createEmby} = require('./app-emby-fixture.cjs');
const TOOL_FILES = Object.freeze(['layered-runner.cjs','layered-protocol.cjs','layered-electron.cjs','prefix-coverage-observer.cjs','layered-ci.ps1','layered-ci-root.cjs','app-performance-contract.cjs','app-performance-metrics.cjs','app-performance-runner.cjs','store-bootstrap-observer.cjs','app-preview-observer.cjs','app-pixel-audit.cjs','fixture-frame-evidence.cjs','fixture-color-profile.cjs','app-performance-resources.cjs','app-emby-fixture.cjs','windows-contract.cjs','windows-fixtures.cjs','windows-smoke.cjs','windows-ci.ps1','windows-ci-root.cjs']
  .map(name=>'tools/shared-playback-cache/'+name).concat(['tests/helpers/next-prefix-alameda.cjs',
    'tests/helpers/range-fixture-root.cjs','.github/workflows/public-ci.yml']));
const OWNER = contract.OWNER;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const need = (value, code) => {if (!value) throw Error(code);};
const cases = contract.cases;
function physical(file, directory = false) {
  need(typeof file === 'string' && path.isAbsolute(file), 'app-physical-path');
  const absolute = path.resolve(file); let cursor = path.parse(absolute).root;
  const normalized = value => process.platform === 'win32' ? value.toLowerCase() : value;
  for (const part of path.relative(cursor, absolute).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part); const st = fs.lstatSync(cursor);
    need(!st.isSymbolicLink() && normalized(fs.realpathSync.native(cursor)) === normalized(cursor), 'app-physical-redirect');
  }
  const st = fs.lstatSync(absolute); need(directory ? st.isDirectory() : st.isFile() && st.nlink === 1, 'app-physical-kind'); return absolute;
}
function toolIdentity(repo) {
  const toolCommit = execFileSync('git', ['rev-parse','HEAD'], {cwd:repo, encoding:'utf8', windowsHide:true}).trim();
  const rows = TOOL_FILES.map(member => {
    const bytes = fs.readFileSync(physical(path.join(repo, member)));
    const committed = execFileSync('git', ['show', toolCommit + ':' + member], {cwd:repo, windowsHide:true});
    const binding = require('./windows-smoke.cjs').boundToolBytes(committed, bytes);
    return {member, ...binding};
  });
  return {toolCommit, files: rows};
}
function readPlan(file, expectedHash) {
  physical(file); const bytes = fs.readFileSync(file);
  need(bytes.length <= 131072 && /^[a-f0-9]{64}$/.test(expectedHash || '') && sha(bytes) === expectedHash, 'app-plan-hash');
  const p = JSON.parse(bytes);
  need(p.schema === 2 && p.kind === 'ordinary-C-stop-A' && p.productCommit === contract.BASE && path.join(p.out, 'layered-plan-'+p.caseIndex+'.json') === file &&
    fs.readFileSync(physical(path.join(p.out,'owner')), 'utf8') === OWNER &&
    JSON.stringify(p.cases) === JSON.stringify(cases(p.mode)) && JSON.stringify(p.limits) === JSON.stringify(contract.LIMITS)&&contract.OBSERVATION_MODES.includes(p.observationMode)&&/^[a-f0-9]{64}$/.test(p.storeSourceSha256||''), 'app-plan-contract');
  need(Array.isArray(p.fixture?.fixtures)&&p.fixture.fixtures.length===3&&p.fixture.fixtures.every(row=>row.encoding==='uncompressed-dib-bgr24'), 'app-plan-contract');contract.assertFixtureTiming(p.fixture);
  for (const target of ['repo','runtime','out']) physical(p[target], true);
  physical(p.installer);
  const identity = toolIdentity(p.repo);
  need(identity.toolCommit === p.toolCommit && JSON.stringify(identity.files) === JSON.stringify(p.tools), 'app-tool-identity');
  for (const origin of [p.controlOrigin, p.sources?.origin, p.sources?.mediaOrigin, p.sources?.cd2Endpoint]) {
    const u = new URL(origin); need(u.origin === origin && u.protocol === 'http:' && u.hostname === '127.0.0.1', 'app-plan-loopback');
  }
  return p;
}
function intersectionLength(start, length, ranges) {
  need(Number.isSafeInteger(start) && start >= 0 && Number.isSafeInteger(length) && length > 0, 'app-byte-interval');
  return ranges.reduce((n, r) => n + Math.max(0, Math.min(start + length, r.end) - Math.max(start, r.start)), 0);
}
const receiptRows=contract.receiptRows;
function runWorker(planFile, planHash, plan, task) {
  return new Promise(resolve => {
    const env = {...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS:'true'};
    for (const key of Object.keys(env)) if (/^(?:ETE_|ELECTRON_RUN_AS_NODE|NODE_OPTIONS|NODE_PATH|GH_TOKEN|GITHUB_TOKEN|CD2_|FN_)/.test(key)) delete env[key];
    // Electron may write before main is loaded. Use owned scratch siblings:
    // trial.prepare intentionally rejects roots containing the pre-trial profile.
    const scratch = path.join(plan.out,'bootstrap-'+task.index);
    env.APPDATA = path.join(scratch,'appdata'); env.LOCALAPPDATA = path.join(scratch,'localappdata');
    env.MPV_HOME = path.join(scratch,'mpv'); env.TEMP = env.TMP = path.join(scratch,'temp');
    const started = Date.now(), child = spawn(path.join(plan.runtime,'x64/electron/electron.exe'),
      [path.join(plan.repo,'tools/shared-playback-cache/layered-electron.cjs'), '--plan='+planFile, '--plan-sha256='+planHash, '--case='+task.index,'--deadline-ms='+(Date.now()+contract.LIMITS.workerMs-3000)],
      {cwd:plan.runtime,env,windowsHide:false,stdio:['ignore','pipe','pipe']});
    let bytes=0,timedOut=false,overflow=false,error=false,done=false,denied=false,finalTimer,evidenceWriteFailed=false;
    const outputTails = {stdout:'',stderr:''};
    const finish=(exitCode,signal,closed)=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(finalTimer);
      if(!closed){child.stdout.destroy();child.stderr.destroy();child.unref();}
      resolve({index:task.index,spawnPid:child.pid||null,exitCode,signal,
        exitConfirmed:!!child.pid&&!error&&closed,streamsClosed:closed&&child.stdout.destroyed&&child.stderr.destroyed,
        timedOut,overflow,error,evidenceWriteFailed,terminationDenied:denied,durationMs:Date.now()-started});};
    const stop=()=>{if(finalTimer||done)return;try{child.kill('SIGTERM');}catch(e){denied=['EACCES','EPERM'].includes(e.code);}
      finalTimer=setTimeout(()=>finish(null,null,false),2000);};
    const take=(part,channel)=>{
      const text=outputTails[channel]+part.toString('utf8');
      if(text.includes('SHARED_CACHE_LAYERED_EVIDENCE_FAILURE'))evidenceWriteFailed=true;
      outputTails[channel]=text.slice(-64);
      bytes+=part.length;if(bytes>1048576&&!overflow){overflow=true;stop();}
    };
    child.stdout.on('data',part=>take(part,'stdout'));child.stderr.on('data',part=>take(part,'stderr'));
    child.stdout.on('error',()=>{error=true;});child.stderr.on('error',()=>{error=true;});
    child.on('error',e=>{error=true;if(['EACCES','EPERM'].includes(e.code))denied=true;if(!child.pid)finish(null,null,false);});
    const timer=setTimeout(()=>{timedOut=true;stop();},contract.LIMITS.workerMs);
    child.once('close',(exitCode,signal)=>finish(exitCode,signal,true));
  });
}
// Trust is withheld before any awaited cleanup, including throws and partial closes.
async function settleCase({result,closeControl,closeSources,state,observationFailed}){
 const original=result&&{accepted:result.accepted,evidenceGood:result.evidenceGood,phaseTrust:result.phaseTrust};
 if(result){result.accepted=false;result.evidenceGood=false;result.phaseTrust=Object.fromEntries(contract.PHASES.map(p=>[p,false]));}
 let failed=false,firstError,cleanup=null;
 try{await closeControl();}catch(error){failed=true;firstError=error;}
 try{cleanup=await closeSources();need(cleanup&&cleanup.activeMediaResponses===0&&cleanup.mediaSockets===0&&cleanup.heldRequests===0&&cleanup.grpcStopped===true,'layered-source-cleanup');}catch(error){if(!failed)firstError=error;failed=true;}
 if(result)result.sourceCleanup=cleanup;
 const settled=state();
 if(!failed&&!observationFailed()&&settled.errors.length===0&&settled.unknown===0&&contract.PHASES.every(p=>settled.phases[p].active===0)&&result)Object.assign(result,original);
 if(failed)throw Error(contract.failureCode(firstError,'layered-source-cleanup'));
}
async function run({repo,runtime,installer,installerSha256,productCommit,out,mode='entry',observationMode='full'}) {
  need(process.platform === 'win32', 'app-performance-windows-required');
  repo=physical(repo,true);runtime=physical(runtime,true);installer=physical(installer);
  need(productCommit===contract.BASE,'app-exact-product');
  need(contract.OBSERVATION_MODES.includes(observationMode),'layered-observation-mode');
  const tasks=cases(mode);
  const identity=fixed.verifyCandidate({repo,runtime,installer,installerSha256,candidateCommit:productCommit}), tools=toolIdentity(repo);
  need(path.isAbsolute(out)&&!fs.existsSync(out),'app-output-exists');physical(path.dirname(out),true);fs.mkdirSync(out);
  fs.writeFileSync(path.join(out,'owner'),OWNER,{flag:'wx'});fs.mkdirSync(path.join(out,'media'));
  let fixture;
  const trial=require('../../src/electronapp/enhanced/shared-playback-cache/trial');
  const rule={id:'app-fixture',sourcePrefix:'X:\\Media',mountPrefix:'X:\\Media',cloudPrefix:'/cloud/media',storageType:'cloud-mount',strategy:'cloud-first',originState:'USER',enabled:true};
  const storeSourceSha256=sha(fs.readFileSync(physical(path.join(runtime,'electronapp/enhanced/shared-playback-cache/store.js'))));
  const plan={schema:2,kind:'ordinary-C-stop-A',repo,runtime,installer,installerSha256,productCommit,out,mode,observationMode,storeSourceSha256,cases:tasks,limits:contract.LIMITS,fixture,
    toolCommit:tools.toolCommit,tools:tools.files,identity};
  const tasksForRun=tasks, ledger=contract.createLedger(tasks), events=[],results=[],setupErrors=[];
  const samples=contract.slots(tasks);let closed=false;const began=Date.now();
  for(const phase of contract.PHASES){const auditRoot=path.join(out,phase);fs.mkdirSync(auditRoot);fs.writeFileSync(path.join(auditRoot,'owner'),'ETE ordinary app performance owned trial v1\n',{flag:'wx'});}
  try {
    fixture=await fixtures.generateFixtures(path.join(out,'media'),{encoding:'uncompressed-dib-bgr24',timing:contract.FIXTURE_TIMING});fixture.autoPlay=false;contract.assertFixtureTiming(fixture);plan.fixture=fixture;
    for(const task of tasksForRun){
      need(Date.now()-began<contract.LIMITS.suiteMs,'layered-suite-deadline');ledger.activate(task.index);
      let sources,control;const controlSockets=new Set();let caseObservationFailed=false;
      const record=(type,data)=>{
        try{const owner=ledger.record(type,data,task.index);if(events.length<32768&&type!=='media-bytes')events.push({...data,detailPhase:data.phase??null,case:owner?.case??task.index,phase:owner?.phase??null,type,wallClockMs:Date.now(),sourceCase:task.index});}
        catch(_){caseObservationFailed=true;setupErrors.push('layered-ledger-invalid');}
      };
      try {
        sources=await fixtures.startWindowsSources({plan:fixture,record,createEmby,pacing:contract.LIMITS});
        plan.sources={origin:sources.origin,mediaOrigin:sources.mediaOrigin,cd2Endpoint:sources.cd2Endpoint};plan.caseIndex=task.index;
        control=http.createServer((req,res)=>{(async()=>{
          const match=/^\/(snapshot|window|advance|phase)\/(\d{1,2})$/.exec(req.url);need(match&&Number(match[2])===task.index&&!req.headers.authorization&&!req.headers.cookie,'layered-control-owner');
          if(match[1]==='snapshot'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...ledger.snapshot(),transport:sources.snapshot()}));return;}
          need(req.method==='POST','layered-control-method');let length=0;const chunks=[];for await(const part of req){length+=part.length;need(length<=8192,'layered-control-size');chunks.push(part);}
          const value=JSON.parse(Buffer.concat(chunks));need(!req.aborted&&!res.destroyed,'layered-control-retired');
          if(match[1]==='phase'){
            need(Object.keys(value).join(',')==='phase','layered-control-shape');
            if(value.phase==='quiet'){need(sources.snapshot().activeMediaResponses===0&&sources.snapshot().heldRequests===0,'layered-source-not-drained');ledger.beginQuiet();}
            else{need(value.phase==='ready-A','layered-control-phase');ledger.beginReady();}
          }else if(match[1]==='advance'){
            need(Object.keys(value).sort().join(',')==='phase,scenario','layered-control-shape');ledger.advance(value.phase,value.scenario);const advanced=sources.advancePaced();
            res.setHeader('Content-Type','application/json');res.end(JSON.stringify(advanced));return;
          }else{
            need(Object.keys(value).sort().join(',')==='phase,ranges'&&Array.isArray(value.ranges)&&value.ranges.length<=64,'layered-control-shape');
            for(const r of value.ranges)need(Object.keys(r).sort().join(',')==='end,start'&&Number.isSafeInteger(r.start)&&Number.isSafeInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=fixture.media[contract.ITEM[value.phase]]?.size,'layered-control-range');
            need(value.ranges.every((r,i)=>!i||value.ranges[i-1].end<=r.start),'layered-control-range');ledger.window(value.phase,value.ranges);
          }
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify(ledger.snapshot()));
        })().catch(()=>{caseObservationFailed=true;setupErrors.push('layered-control-refused');if(!res.destroyed&&!res.writableEnded)res.writeHead(400).end();});});
        control.on('connection',s=>{controlSockets.add(s);s.once('close',()=>controlSockets.delete(s));});
        await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(0,'127.0.0.1',resolve);});plan.controlOrigin='http://127.0.0.1:'+control.address().port;
        const root=path.join(out,'profile-'+task.index);trial.createProfile({root});
        need(!fs.existsSync(path.join(root,'userdata/shared-playback-byte-cache-v2')),'layered-profile-preseeded');
        const scratch=path.join(out,'bootstrap-'+task.index);fs.mkdirSync(scratch);for(const n of ['appdata','localappdata','mpv','temp'])fs.mkdirSync(path.join(scratch,n));
        const config=require('../../src/electronapp/enhanced/strm-config-store').createStore({rootDir:path.join(root,'userdata','config'),environment:{}});
        config.save({version:1,enabled:true,cd2:{enabled:true,origin:sources.cd2Endpoint,directUrlEnabled:true},rules:[rule]});config.setToken('synthetic-only-token');
        require('../../src/electronapp/enhanced/playback-range-user-settings').createStore({profileRoot:path.join(root,'userdata')}).save({schema:1,enabled:task.arm==='B',progressPercent:70,preloadMB:300});
        const file=path.join(out,'layered-plan-'+task.index+'.json');fs.writeFileSync(file,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});const planHash=sha(fs.readFileSync(file));
        const processResult=await runWorker(file,planHash,plan,task);let receipt;
        try{const bytes=fs.readFileSync(path.join(out,'case-'+task.index+'.json'));need(bytes.length<=2*1048576,'layered-receipt-size');receipt=JSON.parse(bytes);}catch(_){}
        const rows=receiptRows(receipt,processResult,task,productCommit,tools.toolCommit);
        if(rows)for(const row of rows){const at=samples.findIndex(r=>r.phase===row.phase&&r.scenario===row.scenario&&r.pair===row.pair&&r.arm===row.arm);samples[at]=row;}
        const sourceState=ledger.snapshot();
        const expectedObservation={mode:observationMode,storeSourceSha256,fixture};
        const phaseValid=Object.fromEntries(contract.PHASES.map(p=>[p,contract.validatePhase(p,task.arm,receipt?.phases?.[p])&&contract.prefixPhaseEvidence(receipt,p,expectedObservation)]));
        const physicalGood=processResult.exitCode===0&&processResult.exitConfirmed&&processResult.streamsClosed&&!processResult.timedOut&&!processResult.overflow&&!processResult.evidenceWriteFailed;
        const evidenceGood=contract.observerClean(receipt,expectedObservation)&&receipt?.ownedHelpersClosed===true&&receipt.externalNetworkAttempts===0&&receipt.observationErrors===0&&sourceState.unknown===0&&sourceState.errors.length===0&&sourceState.initialAReads===0&&sourceState.aRequests>0&&
          contract.PHASES.every(p=>sourceState.phases[p].stoppedReports>0&&sourceState.phases[p].active===0)&&sourceState.quiet.opened===0&&sourceState.quiet.sourceBytes===0&&sourceState.quiet.ended-sourceState.quiet.started>=contract.LIMITS.quietMs;
        const phaseTrust=Object.fromEntries(contract.PHASES.map(p=>[p,physicalGood&&contract.observerClean(receipt,expectedObservation)&&receipt?.ownedHelpersClosed===true&&receipt.observationErrors===0&&receipt.externalNetworkAttempts===0&&sourceState.unknown===0&&sourceState.errors.length===0&&receipt?.phases?.[p]?.stopConfirmed===true&&sourceState.phases[p].active===0&&sourceState.phases[p].stoppedReports>0]));
        const accepted=!!(physicalGood&&evidenceGood&&rows&&Object.values(phaseValid).every(Boolean)&&receipt.status==='PASS');
        results[task.index]={...processResult,accepted,evidenceGood,physicalGood,phaseValid,phaseTrust,phases:receipt?.phases?Object.fromEntries(contract.PHASES.map(p=>[p,{selection:receipt.phases[p]?.selection??null}])):null,code:receipt?.code??null};
        console.log('SHARED_CACHE_LAYERED_PROGRESS '+JSON.stringify({case:task.index,arm:task.arm,pair:task.pair,accepted,code:receipt?.code??null}));
        if(!processResult.exitConfirmed||!processResult.streamsClosed||receipt?.ownedHelpersClosed!==true)throw Error('layered-physical-close-unconfirmed');
      } finally {
        await settleCase({result:results[task.index],
          closeControl:async()=>{if(control){const done=new Promise(r=>control.close(r));for(const s of controlSockets)s.destroy();await done;}},
          closeSources:async()=>sources?await sources.close():null,
          state:()=>ledger.states[task.index],observationFailed:()=>caseObservationFailed});
      }
    }
    closed=true;
  }catch(error){setupErrors.push(/^[a-z0-9-]{1,100}$/.test(error.message)?error.message:'layered-suite-failed');}
  finally {
    ledger.deactivate();
    const summary=contract.summarize(tasks,samples,results,mode);
    const report={schema:2,kind:'ordinary-C-stop-A',status:closed&&setupErrors.length===0&&results.length===tasks.length&&results.every(r=>r?.accepted)&&summary.status==='PASS'?'PASS':'FAIL',mode,observationMode,storeSourceSha256,productCommit,toolCommit:tools.toolCommit,samples,results,summary,setupErrors,events,sourceLedger:ledger.states,requestLedger:[...ledger.requests].map(([key,value])=>({key,...value})),
      resourceScope:'whole-case Electron and per-owned-helper observed lifetime peaks; both phases included; never subtracted into phase-only RSS',
      fixtureTiming:contract.FIXTURE_TIMING,sourceScope:'all filesystem stream bytes counted; one-byte reads separately retained; 0-0 probe candidates are not automatically proven access probes',
      durationMs:Date.now()-began,real115Requests:0};
    fs.writeFileSync(path.join(out,'layered-performance.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('SHARED_CACHE_LAYERED_RESULT '+JSON.stringify({status:report.status,cases:results.length,plannedCases:tasks.length,samples:samples.length,setupErrors}));
    if(report.status!=='PASS')throw Error('layered-performance-failed');
  }
  need(closed,'app-sources-not-closed');
}
module.exports={BASE:contract.BASE,TOOL_FILES,cases,physical,toolIdentity,readPlan,intersectionLength,receiptRows,settleCase,run};
if(require.main===module){const values={};for(const arg of process.argv.slice(2)){const m=/^--(repo|runtime|installer|installer-sha256|product-sha|out|mode|observation-mode)=(.+)$/.exec(arg);need(m&&!Object.hasOwn(values,m[1]),'app-argument');values[m[1]]=m[2];}
  run({repo:values.repo,runtime:values.runtime,installer:values.installer,installerSha256:values['installer-sha256'],productCommit:values['product-sha'],out:values.out,mode:values.mode,observationMode:values['observation-mode']}).catch(error=>{console.error('SHARED_CACHE_APP_ERROR '+(/^[a-z0-9-]{1,100}$/.test(error.message)?error.message:'app-performance-failed'));process.exitCode=1;});}
