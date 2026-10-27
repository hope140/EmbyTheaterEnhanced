'use strict';
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), crypto = require('node:crypto'), os = require('node:os');
const {spawn, execFileSync} = require('node:child_process');
const contract = require('./app-performance-contract.cjs'), metrics = require('./app-performance-metrics.cjs');
const fixed = require('./windows-contract.cjs'), fixtures = require('./windows-fixtures.cjs');
const {createEmby} = require('./app-emby-fixture.cjs');
const TOOL_FILES = Object.freeze(['app-performance-contract.cjs','app-performance-metrics.cjs','app-performance-runner.cjs',
  'app-performance-electron.cjs','app-preview-observer.cjs','app-pixel-audit.cjs','fixture-frame-evidence.cjs','app-performance-resources.cjs','app-emby-fixture.cjs','windows-contract.cjs','windows-fixtures.cjs','windows-smoke.cjs','windows-ci.ps1','windows-ci-root.cjs']
  .map(name=>'tools/shared-playback-cache/'+name).concat(['tests/helpers/next-prefix-alameda.cjs',
    'tests/helpers/range-fixture-root.cjs','.github/workflows/public-ci.yml']));
const OWNER = 'ETE ordinary app performance owned trial v1\n';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const need = (value, code) => {if (!value) throw Error(code);};
function cases(mode) {
  need(['entry', 'matrix'].includes(mode), 'app-performance-mode');
  const result = [];
  for (let pair = -3; pair <= (mode === 'entry' ? -3 : 19); pair++) for (const arm of (pair + 3) % 2 ? ['B','A'] : ['A','B']) result.push({index: result.length, pair, arm});
  return result;
}
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
  need(p.schema === 1 && p.productCommit === contract.BASE && path.join(p.out, 'app-plan.json') === file &&
    fs.readFileSync(physical(path.join(p.out,'owner')), 'utf8') === OWNER &&
    JSON.stringify(p.cases) === JSON.stringify(cases(p.mode)) && JSON.stringify(p.limits) === JSON.stringify(contract.LIMITS), 'app-plan-contract');
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
function receiptRows(receipt, result, task, productCommit, toolCommit) {
  const fields = ['scenario','pair','arm','status','latencyMs','sourceBodyBytes','overlapBodyBytes','peakRssBytes','peakDiskBytes'].sort().join(',');
  const bound = receipt?.pid === result.spawnPid && receipt.productCommit === productCommit && receipt.toolCommit === toolCommit &&
    receipt.index === task.index && receipt.pair === task.pair && receipt.arm === task.arm;
  const rows = receipt?.samples;
  if (!bound || !Array.isArray(rows) || rows.length !== 5 || !rows.every((row,i) => row && Object.keys(row).sort().join(',') === fields &&
    row.scenario === contract.SCENARIOS[i] && row.pair === task.pair && row.arm === task.arm && ['PASS','FAIL'].includes(row.status) &&
    (row.status === 'FAIL' && row.latencyMs === null || Number.isFinite(row.latencyMs) && row.latencyMs >= 0) &&
    ['sourceBodyBytes','overlapBodyBytes','peakRssBytes','peakDiskBytes'].every(key=>Number.isSafeInteger(row[key])&&row[key]>=0))) return null;
  return rows.map(row=>({...row}));
}
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
      [path.join(plan.repo,'tools/shared-playback-cache/app-performance-electron.cjs'), '--plan='+planFile, '--plan-sha256='+planHash, '--case='+task.index,'--deadline-ms='+(Date.now()+contract.LIMITS.workerMs-3000)],
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
      if(text.includes('SHARED_CACHE_APP_EVIDENCE_FAILURE'))evidenceWriteFailed=true;
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
async function run({repo,runtime,installer,installerSha256,productCommit,out,mode='entry'}) {
  need(process.platform === 'win32', 'app-performance-windows-required');
  repo=physical(repo,true);runtime=physical(runtime,true);installer=physical(installer);
  need(productCommit===contract.BASE,'app-exact-product');
  const tasks=cases(mode);
  const identity=fixed.verifyCandidate({repo,runtime,installer,installerSha256,candidateCommit:productCommit}), tools=toolIdentity(repo);
  need(path.isAbsolute(out)&&!fs.existsSync(out),'app-output-exists');physical(path.dirname(out),true);fs.mkdirSync(out);
  fs.writeFileSync(path.join(out,'owner'),OWNER,{flag:'wx'});fs.mkdirSync(path.join(out,'media'));
  let fixture;
  const trial=require('../../src/electronapp/enhanced/shared-playback-cache/trial');
  const rule={id:'app-fixture',sourcePrefix:'X:\\Media',mountPrefix:'X:\\Media',cloudPrefix:'/cloud/media',storageType:'cloud-mount',strategy:'cloud-first',originState:'USER',enabled:true};
  const plan={schema:1,repo,runtime,installer,installerSha256,productCommit,out,mode,cases:tasks,limits:contract.LIMITS,fixture,
    toolCommit:tools.toolCommit,tools:tools.files,identity};
  let active=-1,sources,control,controlSockets=new Set(),closed=false;
  const observed=tasks.map(()=>({bodyBytes:0,overlapBytes:0,ranges:[],unknownRoutes:0,unexpectedMedia:0,stoppedReports:0,mediaResponses:0})), requestProbes=new Map();
  const events=[], results=[],samples=[], setupErrors=[]; const began=Date.now();
  const record=(type,data)=>{
    if(type==='media-open'&&active>=0)requestProbes.set(data.requestId,{case:active,probe:data.start===data.end});
    const ownership = requestProbes.get(data.requestId);
    const owner = type.startsWith('media-') ? ownership?.case : active;
    if(!Number.isInteger(owner)||owner<0)return;
    const state=observed[owner];
    if(type==='media-open'){state.mediaResponses++;if(data.item!=='A')state.unexpectedMedia++;}
    if(type==='media-close'){state.mediaResponses--;requestProbes.delete(data.requestId);}
    if(type==='media-bytes'&&!ownership?.probe){state.bodyBytes+=data.length;state.overlapBytes+=intersectionLength(data.start,data.length,state.ranges);}
    if(type==='emby-fixture'&&data.category==='unknown')state.unknownRoutes++;
    if(type==='emby-fixture'&&data.category==='playing-report'&&data.phase==='stopped'&&data.item==='A')state.stoppedReports++;
    if(events.length<8192&&type!=='media-bytes')events.push({case:owner,type,...data});
  };
  try {
    fixture=await fixtures.generateFixtures(path.join(out,'media'));fixture.autoPlay=false;plan.fixture=fixture;
    sources=await fixtures.startWindowsSources({plan:fixture,record,createEmby,pacing:contract.LIMITS});
    plan.sources={origin:sources.origin,mediaOrigin:sources.mediaOrigin,cd2Endpoint:sources.cd2Endpoint};
    control=http.createServer((req,res)=>{(async()=>{
      const match=/^\/(snapshot|window)\/(\d{1,2})$/.exec(req.url);if(!match||Number(match[2])!==active||req.headers.authorization||req.headers.cookie){res.writeHead(403).end();return;}
      const state=observed[active];
      if(match[1]==='snapshot'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({bodyBytes:state.bodyBytes,overlapBytes:state.overlapBytes}));return;}
      if(match[1]!=='window'||req.method!=='POST'){res.writeHead(405).end();return;}
      const chunks=[];let length=0;for await(const part of req){length+=part.length;if(length>8192)throw Error('control-body');chunks.push(part);}
      const value=JSON.parse(Buffer.concat(chunks));need(Object.keys(value).join(',')==='ranges'&&Array.isArray(value.ranges)&&value.ranges.length<=64,'control-range');
      for(const range of value.ranges)need(Object.keys(range).sort().join(',')==='end,start'&&Number.isSafeInteger(range.start)&&Number.isSafeInteger(range.end)&&range.start>=0&&range.end>range.start&&range.end<=fixture.media.A.size,'control-range');
      need(value.ranges.every((range,i)=>!i||value.ranges[i-1].end<=range.start),'control-range-order');
      state.ranges=value.ranges;res.writeHead(204).end();
    })().catch(()=>res.writeHead(400).end());});
    control.on('connection',socket=>{controlSockets.add(socket);socket.once('close',()=>controlSockets.delete(socket));});
    await new Promise((resolve,reject)=>{control.once('error',reject);control.listen(0,'127.0.0.1',resolve);});plan.controlOrigin='http://127.0.0.1:'+control.address().port;
    for(const task of tasks){
      const root=path.join(out,'profile-'+task.index);trial.createProfile({root});
      const scratch=path.join(out,'bootstrap-'+task.index);fs.mkdirSync(scratch);
      for(const name of ['appdata','localappdata','mpv','temp'])fs.mkdirSync(path.join(scratch,name));
      const config=require('../../src/electronapp/enhanced/strm-config-store').createStore({rootDir:path.join(root,'userdata','config'),environment:{}});
      config.save({version:1,enabled:true,cd2:{enabled:true,origin:sources.cd2Endpoint,directUrlEnabled:true},rules:[rule]});config.setToken('synthetic-only-token');
      require('../../src/electronapp/enhanced/playback-range-user-settings').createStore({profileRoot:path.join(root,'userdata')}).save({schema:1,enabled:task.arm==='B',progressPercent:70,preloadMB:300});
    }
    const file=path.join(out,'app-plan.json');fs.writeFileSync(file,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});const planHash=sha(fs.readFileSync(file));
    for(const task of tasks){
      need(Date.now()-began<contract.LIMITS.suiteMs,'app-suite-deadline');active=task.index;
      const result=await runWorker(file,planHash,plan,task);let receipt;
      try{const bytes=fs.readFileSync(path.join(out,'case-'+task.index+'.json'));need(bytes.length<=1048576,'app-receipt-size');receipt=JSON.parse(bytes);}catch(_){}
      const rows = receiptRows(receipt,result,task,productCommit,tools.toolCommit);
      const until=Date.now()+3000;while(observed[task.index].mediaResponses&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,5));
      const transportGood=result.exitCode===0&&result.exitConfirmed&&result.streamsClosed&&!result.timedOut&&!result.overflow&&!result.evidenceWriteFailed;
      const caseEvidenceGood=receipt?.ownedHelpersClosed&&receipt.externalNetworkAttempts===0&&observed[task.index].unknownRoutes===0&&
        observed[task.index].stoppedReports>0&&observed[task.index].unexpectedMedia===0&&observed[task.index].mediaResponses===0;
      const accepted=!!(transportGood&&caseEvidenceGood&&rows&&rows.every(row=>row.status==='PASS')&&receipt.status==='PASS');
      results.push({...result,accepted,unknownRoutes:observed[task.index].unknownRoutes,openSourceResponses:observed[task.index].mediaResponses,
        unexpectedMedia:observed[task.index].unexpectedMedia,evidenceFailure:!caseEvidenceGood,workerCode:receipt?.code||null});
      // Preserve each independently valid sample. Cleanup/provenance failure is
      // separate case evidence and cannot silently erase measured latencies.
      for(const scenario of contract.SCENARIOS){const row=rows?.find(s=>s.scenario===scenario);
        samples.push(row||{scenario,pair:task.pair,arm:task.arm,status:'FAIL',latencyMs:null,
          sourceBodyBytes:0,overlapBodyBytes:0,peakRssBytes:0,peakDiskBytes:0});}
      console.log('SHARED_CACHE_APP_PROGRESS '+JSON.stringify({case:task.index,pair:task.pair,arm:task.arm,accepted,code:receipt?.code||null,unknownRoutes:observed[task.index].unknownRoutes}));
      // Do not compound a broken first ordinary entry into 46 repeated launches.
      if(!result.exitConfirmed||observed[task.index].mediaResponses>0||!accepted&&task.index<2)break;
    }
  } catch(error) {setupErrors.push(/^[a-z0-9-]{1,100}$/.test(error.message)?error.message:'app-suite-failed');}
  finally {
    active=-1;
    if(control){const done=new Promise(resolve=>control.close(resolve));for(const socket of controlSockets)socket.destroy();await done;}
    let cleanup=null;try{cleanup=sources?await sources.close():null;closed=true;}catch(_){setupErrors.push('app-source-cleanup-failed');}
    const ordered=metrics.expectedSchedule().map(expected=>samples.find(row=>row.scenario===expected.scenario&&row.pair===expected.pair&&row.arm===expected.arm));
    const complete=mode==='matrix'&&ordered.every(Boolean);
    let summary=null;try{if(complete)summary=metrics.summarize(ordered);}catch(_){setupErrors.push('app-summary-invalid');}
    const report={schema:1,status:!setupErrors.length&&results.length===tasks.length&&results.every(r=>r.accepted)&&(mode==='entry'||complete&&summary?.status==='PASS')?'PASS':'FAIL',mode,productCommit,toolCommit:tools.toolCommit,
      scope:'ordinary-main loopback synthetic, decoded frames; not user NAS, audio or visible presentation',
      performanceAssessment:complete?'COMPLETE_SAMPLES_NO_NEW_THRESHOLD':'NOT_ASSESSED',summary,setupErrors,
      samples,results,events,cleanup,real115Requests:0,conditions:{node:process.version,platform:process.platform,release:os.release(),cpus:os.cpus().length,
        source:'loopback generated raw AVI, 16KiB/8ms, 20ms initial delay, initial response paused at2MiB; other responses paused after256KiB',
        byteScope:'actual source filesystem stream bytes, not confirmed player consumption; all1B requests excluded, including access probes; not an explicit probe classification',
        memoryScope:'sum of observed Electron working-set peak and one live owned Native lifetime PeakWorkingSet; conservative sum, not simultaneous RSS',diskScope:'maximum observed logical bytes of owned cache files including index; not filesystem allocated blocks'},durationMs:Date.now()-began};
    if(report.summary?.status==='FAIL')report.status='FAIL';
    fs.writeFileSync(path.join(out,'app-performance.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log('SHARED_CACHE_APP_RESULT '+JSON.stringify({status:report.status,mode,productCommit,toolCommit:tools.toolCommit,cases:results.length,performanceAssessment:report.performanceAssessment,summary:report.summary,cleanup}));
    if(report.status!=='PASS')throw Error('app-performance-failed');
  }
  need(closed,'app-sources-not-closed');
}
module.exports={BASE:contract.BASE,TOOL_FILES,cases,physical,toolIdentity,readPlan,intersectionLength,receiptRows,run};
if(require.main===module){const values={};for(const arg of process.argv.slice(2)){const m=/^--(repo|runtime|installer|installer-sha256|product-sha|out|mode)=(.+)$/.exec(arg);need(m&&!Object.hasOwn(values,m[1]),'app-argument');values[m[1]]=m[2];}
  run({repo:values.repo,runtime:values.runtime,installer:values.installer,installerSha256:values['installer-sha256'],productCommit:values['product-sha'],out:values.out,mode:values.mode}).catch(error=>{console.error('SHARED_CACHE_APP_ERROR '+(/^[a-z0-9-]{1,100}$/.test(error.message)?error.message:'app-performance-failed'));process.exitCode=1;});}
