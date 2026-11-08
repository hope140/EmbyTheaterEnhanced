'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const diagnostics = require('../src/electronapp/enhanced/diagnostics');
const {createNativeDiagnostics} = require('../src/electronapp/enhanced/native-diagnostics');
const {projectLog} = require('../src/electronapp/enhanced/media-network-diagnostics');
const {sanitizeEngineText, projectEngineSnapshot} = require('../src/electronapp/enhanced/engine-diagnostics');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
function root(t) { const r = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-engine-')); t.after(() => fs.rmSync(r, {recursive:true,force:true})); return r; }
function snapshot(generation, overrides={}) {return {mode:'detailed',phase:'startup',candidateGenerationId:generation,snapshotSequence:1,dropped:0,
    records:[{sequence:1,monotonicMicros:10,module:'vd/ffmpeg',level:'error',message:'Error while decoding frame!'}],...overrides};}
function client(observe) {const c = new NativeHelperClient({helperPath:'unused',libmpvPath:'unused',parentWindowHandle:'1',helperInstanceId:'H',onDiagnostic:r=>observe({...r,helperRun:1})}); c.command=()=>{};return c;}
function send(c, detail, helper='H') {c.dispatch({type:'lifecycle',scope:'helper',helperInstanceId:helper,name:'mpv-engine',detail});}

test('operation errors and actual property results survive controller, JSONL, rotation and export', async t => {
    const logger=diagnostics.createLogger(root(t)), observe=createNativeDiagnostics(logger), c=client(observe), g=c.beginGeneration('play-1-1');
    c.dispatch({type:'event',scope:'generation',helperInstanceId:'H',generationId:g,name:'operation-error',operation:'set-property',property:'start',errorCode:-9,error:'error accessing property',fatal:false});
    c.dispatch({type:'event',scope:'generation',helperInstanceId:'H',generationId:g,name:'startup-property-result',value:{property:'start',value:'0',applied:false,errorCode:-9,operationSequence:1}});
    send(c,snapshot(g));
    await logger.flush();
    const records=(await logger.readRecords()).records;
    assert.equal(records.find(r=>r.event==='operation-error').details.requestId,'play-1-1');
    assert.equal(records.find(r=>r.event==='operation-error').details.mpvErrorCode,-9);
    assert.equal(records.find(r=>r.event==='startup-property-result').details.applied,false);
    const engine=records.find(r=>r.category==='mpv-engine' && r.event==='engine-message');
    assert.equal(engine.level,'error');assert.equal(engine.details.generationId,null);assert.equal(engine.details.candidateGenerationId,g);
    const paths=logger.getPaths(); fs.appendFileSync(paths.file,' '.repeat(diagnostics.LOG_MAX_BYTES));
    await logger({category:'test',event:'rotate',details:{}});
    assert.ok(fs.existsSync(paths.rotations[0]));
    const report=await logger.exportReport({});assert.match(report,/Error while decoding frame/);assert.match(report,/startup-property-result/);assert.match(report,/active-generation-context/);
});

test('mode saves persist, validate, fail atomically and do not change an already activated generation', async t => {
    const r=root(t), logger=diagnostics.createLogger(r), c=client(()=>{}), commands=[];c.command=(...args)=>commands.push(args);
    c.beginGeneration('play-1-1',[],null,logger.getMode());
    await logger.setMode('detailed');assert.equal(commands.length,1);assert.equal(commands[0][1].diagnosticMode,'normal');
    c.beginGeneration('play-2-2',[],null,logger.getMode());assert.equal(commands.at(-1)[1].diagnosticMode,'detailed');
    assert.equal(diagnostics.createLogger(r).getMode(),'detailed');
    await assert.rejects(logger.setMode('trace'));assert.equal(logger.getMode(),'detailed');
    await logger.setMode('normal');assert.equal(diagnostics.createLogger(r).getMode(),'normal');
    const fakeFs={...fs,promises:{...fs.promises,rename:async()=>{throw Error('disk-failure');}}};
    const failed=diagnostics.createLogger(r,{fs:fakeFs});await assert.rejects(failed.setMode('detailed'));assert.equal(failed.getMode(),'normal');
});

test('native snapshots are contextual, deduplicated across flushes and not misattributed after replacement', () => {
    const rows=[],observe=createNativeDiagnostics(r=>rows.push(r)),c=client(observe),a=c.beginGeneration('play-1-1');
    send(c,snapshot(a));const b=c.beginGeneration('play-2-2');send(c,snapshot(a,{snapshotSequence:2}));
    send(c,snapshot(b,{records:[{sequence:2,monotonicMicros:20,module:'ao',level:'warn',message:'output unavailable'}]}));
    send(c,snapshot(b),'OLD_HELPER');
    const messages=rows.filter(r=>r.event==='engine-message');assert.equal(messages.length,2);
    assert.equal(messages[0].details.candidateRequestId,'play-1-1');assert.equal(messages[1].details.candidateRequestId,'play-2-2');
    assert.equal(messages[1].level,'warn');assert.ok(messages.every(r=>r.details.generationId===null));
    assert.equal(projectEngineSnapshot(snapshot(b,{records:[{sequence:1,module:'bad',level:'trace',message:'x'}]})),null);
});

test('errors keep an independent pending budget when context writes stall', async () => {
    const rows=[],completions=[],observe=createNativeDiagnostics(r=>{rows.push(r);return new Promise(resolve=>completions.push(resolve));});
    observe({name:'generation-begin',helperRun:1,generationId:1,disposition:'BEGIN_GENERATION',label:'play-1-1'});
    for(let i=1;i<500;i++) observe({name:'mpv-engine',disposition:'ACCEPT_HELPER_GLOBAL',helperRun:1,engine:snapshot(1,{snapshotSequence:i,records:[{sequence:i,monotonicMicros:i,module:'cplayer',level:'v',message:'context '+i}]})});
    observe({name:'mpv-engine',disposition:'ACCEPT_HELPER_GLOBAL',helperRun:1,engine:snapshot(1,{snapshotSequence:501,records:[{sequence:501,monotonicMicros:501,module:'vd',level:'error',message:'FIRST_DECODE_ERROR'}]})});
    assert.ok(rows.some(r=>r.details.message==='FIRST_DECODE_ERROR'));assert.ok(rows.length<=66);
    completions.forEach(resolve=>resolve(true));await Promise.resolve();
});

test('credentials are removed before truncation while ordinary media paths and fault reasons survive export', () => {
    const text='Cannot decode C:\\media\\sample.mkv\nhttps://user:PASSWORD_CANARY@nas.invalid:8098/emby/a?token=TOKEN_CANARY\nAuthorization: Bearer AUTH_CANARY\nCookie: SESSION_CANARY\n'+ 'x'.repeat(480)+' api_key=TAIL_CANARY';
    const safe=sanitizeEngineText(text);assert.match(safe,/Cannot decode C:\\media\\sample.mkv/);assert.doesNotMatch(safe,/CANARY|user:|\?token/);
    const report=diagnostics.buildDiagnosticReport([{category:'mpv-engine',event:'engine-message',level:'error',details:{message:text}}],{});
    assert.match(report,/sample\.mkv/);assert.match(report,/Cannot decode/);assert.doesNotMatch(report,/CANARY/);
    const observed=projectLog({kind:'response',stage:'response',networkError:'none',httpStatus:206,sequence:1,streamOk:false,declaredContentSize:-1,seekable:false,mpvLevel:'debug'});
    assert.equal(observed.streamOk,false);assert.equal(observed.declaredContentSize,-1);
    assert.equal(projectLog({...observed,raw:'unsafe'}),null);
});

test('settings UI saves only the diagnostic mode and reports the next-playback boundary', async () => {
    const nodes=new Map(),calls=[];function node(selector){if(!nodes.has(selector))nodes.set(selector,{value:'normal',disabled:false,textContent:'',addEventListener(){},setAttribute(){}});return nodes.get(selector);}
    const view={querySelector:node};let View;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/electronapp/plugins/mpvplayer/diagnostics.js'),'utf8'),{
        define(deps,factory){View=factory({show(){},hide(){}},function(){});},window:{ipc:{invoke:async(channel,payload)=>{calls.push([channel,payload]);return channel.endsWith('status')?{status:'ok',enabled:true,diagnosticMode:'normal'}:{status:'saved',diagnosticMode:payload.mode};}}},Promise,Number,Error});
    const v=new View(view);await v.loadStatus();node('.selectDiagnosticMode').value='detailed';await v.saveMode();
    assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),['enhanced-diagnostics-set-mode',{mode:'detailed'}]);
    assert.match(node('.diagnosticsState').textContent,/后续播放/);assert.equal(node('.btnSaveDiagnosticMode').disabled,false);
    assert.ok(calls.every(([channel])=>channel.startsWith('enhanced-diagnostics-')));
});

test('mode IPC accepts only a trusted application frame and validated saved modes', async t => {
    const {pathToFileURL}=require('node:url');
    const {register,CHANNELS}=require('../src/electronapp/enhanced/diagnostics-ipc');
    const logger=diagnostics.createLogger(root(t)), handlers=new Map();
    const expected={mainFrame:{url:pathToFileURL(path.resolve(__dirname,'../src/electronapp/www/index.html')).href},isDestroyed:()=>false};
    const unregister=register({logger,getWebContents:()=>expected,ipcMain:{handle:(key,value)=>handlers.set(key,value),on(){},removeHandler:key=>handlers.delete(key),removeListener(){}}});
    const trusted={sender:expected,senderFrame:expected.mainFrame},set=handlers.get(CHANNELS.SET_MODE);
    assert.equal((await set({}, {mode:'detailed'})).reason,'untrusted_sender');assert.equal(logger.getMode(),'normal');
    assert.equal((await set(trusted,{mode:'trace'})).status,'error');
    assert.deepEqual(await set(trusted,{mode:'detailed'}),{status:'saved',diagnosticMode:'detailed',appliesTo:'next-playback'});
    assert.equal((await handlers.get(CHANNELS.GET_STATUS)(trusted)).diagnosticMode,'detailed');
    unregister();assert.equal(handlers.size,0);
});
