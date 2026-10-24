'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');
const {PLAN,clip,loadProbeClip,assertNoSnapshotDiagnostics,probeConfiguration,auditSourceContract,startProbeHelper,startupEvidence,noteProbeTerminal,finishOwnerProbe,stageErrorProjection}=require('../tools/windows-native-owner-probe.cjs');
test('production owner probe is explicit, local-only and does not imply DWM visible acceptance',()=>{
    assert.deepEqual(JSON.parse(execFileSync(process.execPath,[path.join(__dirname,'../tools/windows-native-owner-probe.cjs'),'--describe'],{encoding:'utf8'})),PLAN);
    assert.equal(PLAN.usesServer,false);assert.equal(PLAN.snapshotUsesKoffi,false);assert.equal(PLAN.packagedSelfcheckUsesKoffi,true);assert.equal(PLAN.visibleDwmAcceptance,'NOT_ASSESSED');
});
test('Electron default_app ESM import invokes only the matching direct CJS entry',()=>{
    const {pathToFileURL}=require('node:url'),file=path.join(__dirname,'../tools/windows-native-owner-probe.cjs');
    for(const matching of [true,false]){
        const driver=`import {pathToFileURL} from 'node:url';Object.defineProperty(process.versions,'electron',{value:'44.4.2'});Object.defineProperty(process,'defaultApp',{value:true});process.argv=[process.execPath,${JSON.stringify(matching?file:__filename)},'--describe'];await import(${JSON.stringify(pathToFileURL(file).href)});`;
        const stdout=execFileSync(process.execPath,['--input-type=module','-e',driver],{encoding:'utf8'});
        if(matching)assert.deepEqual(JSON.parse(stdout),PLAN);else assert.equal(stdout,'');
    }
});
test('ordinary ESM library import cannot start a probe by changing argv alone',()=>{
    const {pathToFileURL}=require('node:url'),file=path.join(__dirname,'../tools/windows-native-owner-probe.cjs');
    const driver=`process.argv=[process.execPath,${JSON.stringify(file)},'--describe'];await import(${JSON.stringify(pathToFileURL(file).href)});`;
    assert.equal(execFileSync(process.execPath,['--input-type=module','-e',driver],{encoding:'utf8'}),'');
});
test('GUI describe entry flushes its scope and exits without waiting for app.ready or creating a player',()=>{
    const fs=require('node:fs'),vm=require('node:vm'),file=path.join(__dirname,'../tools/windows-native-owner-probe.cjs'),exits=[],output=[];
    const module={exports:{}},localRequire=require('node:module').createRequire(file),load=name=>name==='electron'?{app:{exit:code=>exits.push(code)}}:localRequire(name);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,require:load,__filename:file,__dirname:path.dirname(file),process:{versions:{electron:'44.4.2'},platform:process.platform,defaultApp:true,type:'browser',argv:['electron',file,'--describe'],stdout:{write(text,callback){output.push(text);callback?.();}},stderr:{write(){}}}});
    assert.deepEqual(JSON.parse(output.join('')),PLAN);assert.deepEqual(exits,[0]);
});
test('probe activates its own generation before changing keep-open and loading each clip',async()=>{
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller');
    const client=new NativeHelperClient({}),commands=[];
    // Execute the production client's generation-required guards. Capture only
    // transport output: this does not execute a helper or libmpv.
    client.command=(method,params,generation)=>commands.push({method,params,generation});
    client.request=async(method,params,options)=>{commands.push({method,params,generation:options.generationId});return {};};
    for(const label of ['A','B']){
        const generation=await loadProbeClip(client,label,label+'.y4m');
        const property=commands.findLast(command=>command.method==='set-property');
        const load=commands.at(-1);assert.equal(property.generation,generation);assert.equal(load.generation,generation);
        assert.deepEqual(property.params,{name:'keep-open',value:false});assert.deepEqual(load.params.args,['loadfile',label+'.y4m','replace']);
        assert.ok(commands.indexOf(property)<commands.indexOf(load));
    }
});
test('red and green fixtures contain only bounded generated Y4M frames',()=>{
    for(const values of [[81,90,240],[145,54,34]]) {
        const bytes=clip(...values),header='YUV4MPEG2 W32 H18 F2:1 Ip A1:1 C420jpeg\n';
        assert.equal(bytes.subarray(0,header.length).toString(),header);
        assert.equal(bytes.length,header.length+12*(6+32*18+2*16*9));
        assert.equal(bytes[header.length+6],values[0]);assert.equal(bytes[header.length+6+32*18],values[1]);
    }
});
test('diagnostic guard detects wire BGR24 payloads as well as decoded BGRA',()=>{
    assert.doesNotThrow(()=>assertNoSnapshotDiagnostics({requests:[{method:'load',state:'RESOLVED'}]}));
    for(const pixels of [Buffer.from([19,67,213]).toString('base64'),Buffer.from([19,67,213,255])])
        assert.throws(()=>assertNoSnapshotDiagnostics({requests:[{detail:{pixels}}]}),/Pixels retained/);
});
function handshakeFixture(t,{fatal=false,preview=true,readyOverrides={},exitCode=0,ignoreEof=false}={}){
    const fs=require('node:fs'),os=require('node:os'),directory=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-probe-handshake-')));
    t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const file=path.join(directory,'pipe-fixture.cjs'),controller=require.resolve('../src/electronapp/native-helper/controller');
    const baseline=require('../src/electronapp/native-helper/service'),ready={protocolVersion:1,mpvClientApiVersion:131077,helperVersion:'1.0.0',libmpvVersion:baseline.EXPECTED_LIBMPV_VERSION,surfaceAttached:true,capabilities:['private-inherited-pipe','native-child-hwnd','gpu-next','d3d11','generation-attribution',...(preview?['preview-snapshot-v1']:[])],queueLimits:{maxPendingFrames:128,maxPendingBytes:262144}};
    // Real controller and OS pipes, synthetic producer. No native DLL/helper,
    // window or actual libmpv startup is exercised by this fixture.
    const code=fatal?`process.stderr.write('helper-fatal:dll-load-failed\\n',()=>process.exit(23));`:
        `const {encodeFrame}=require(${JSON.stringify(controller)});process.stdout.write(encodeFrame({protocolVersion:1,type:'lifecycle',scope:'helper',helperInstanceId:process.argv[2],name:'ready',detail:${JSON.stringify({...ready,...readyOverrides})}}));process.stdin.resume();${ignoreEof?'setInterval(()=>{},1000);':`process.stdin.on('end',()=>process.exit(${exitCode}));`}`;
    fs.writeFileSync(file,code);return {helperPath:process.execPath,libmpvPath:file,parentWindowHandle:'1'};
}
test('production runtime version contract rejects the old component version and accepts the service identity over real pipes',async t=>{
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller'),manifest=require('../vendor/native-helper-manifest.json'),baseline=require('../src/electronapp/native-helper/service'),options=handshakeFixture(t);
    const old=new NativeHelperClient({...options,expectedLibmpvVersion:manifest.libmpv.version});t.after(()=>old.kill());
    await assert.rejects(startProbeHelper(old),error=>error.code==='unexpected-libmpv-version'&&error.details.startup.handshake.libmpvVersion===baseline.EXPECTED_LIBMPV_VERSION&&error.details.startup.exited);
    const current=new NativeHelperClient({...options,...probeConfiguration(manifest,baseline)});t.after(()=>current.kill());
    await startProbeHelper(current);assert.equal(current.handshake.libmpvVersion,baseline.EXPECTED_LIBMPV_VERSION);await current.kill();assert.equal(current.exited,true);
    assert.throws(()=>probeConfiguration({...manifest,libmpv:{...manifest.libmpv,sha256:'0'.repeat(64)}},baseline),/OWNER_BASELINE_CONTRACT_MISMATCH/);
});
test('native startup exit and fatal tag survive wrapper cleanup and stream close',async t=>{
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller'),client=new NativeHelperClient({...handshakeFixture(t,{fatal:true}),expectedLibmpvVersion:'mpv v0.41.0-920-gdd5d17d32'});t.after(()=>client.kill());
    await assert.rejects(startProbeHelper(client),error=>{
        assert.equal(error.code,'OWNER_HELPER_START_FAILED');assert.equal(error.cause.message,'helper-start-failed:23');assert.equal(error.details.startup.exitCode,23);assert.equal(error.details.startup.exited,true);assert.deepEqual(error.details.startup.stderr.fatalTags,['helper-fatal:dll-load-failed']);assert.ok(error.details.startup.closeOrdering.some(row=>row.name==='process-close'));return true;
    });
});
test('missing snapshot capability is distinct from controller handshake failure and still confirms exit',async t=>{
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller'),client=new NativeHelperClient({...handshakeFixture(t,{preview:false}),expectedLibmpvVersion:require('../src/electronapp/native-helper/service').EXPECTED_LIBMPV_VERSION});t.after(()=>client.kill());
    await assert.rejects(startProbeHelper(client),error=>error.code==='OWNER_SNAPSHOT_CAPABILITY_MISSING'&&error.details.step==='preview-capability'&&error.details.startup.exited===true);
});
test('API, surface and required-capability handshake rejections retain exact controller codes',async t=>{
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller'),version=require('../src/electronapp/native-helper/service').EXPECTED_LIBMPV_VERSION;
    for(const [readyOverrides,code]of [[{mpvClientApiVersion:131078},'invalid-helper-handshake'],[{surfaceAttached:false},'invalid-helper-handshake'],[{capabilities:['preview-snapshot-v1']},'missing-helper-capability']]){
        const client=new NativeHelperClient({...handshakeFixture(t,{readyOverrides}),expectedLibmpvVersion:version});t.after(()=>client.kill());
        await assert.rejects(startProbeHelper(client),error=>error.code===code&&error.details.step==='controller-start'&&error.details.startup.exited===true);
    }
});
test('spawn failure retains its system error code without publishing its path',async t=>{
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller'),client=new NativeHelperClient({helperPath:path.join(__dirname,'missing-private-helper.exe'),libmpvPath:'unused',parentWindowHandle:'1',expectedLibmpvVersion:'mpv v0.41'});t.after(()=>client.kill());
    await assert.rejects(startProbeHelper(client),error=>error.details.startup.error.systemError==='ENOENT'&&!JSON.stringify(error.details).includes('missing-private-helper.exe')&&error.details.startup.exited===true);
});
test('startup diagnostics are bounded and omit raw unknown text, pixels, URLs and account paths',()=>{
    const secret='https://user:secret@example.invalid/private',details=startupEvidence({expectedLibmpvVersion:'mpv v0.41',stderrChunks:[Buffer.from('pixels='+secret+'\nhelper-fatal:option-failed:vo\n')],stderrObservedBytes:100,stderrRetainedBytes:100,closeOrdering:[]},Error(secret));
    assert.deepEqual(details.stderr.fatalTags,['helper-fatal:option-failed:vo']);assert.equal(details.error.message,null);assert.equal(JSON.stringify(details).includes(secret),false);assert.ok(details.stderr.inspectedTailBytes<=8192);
});
test('static source audit loads no Electron/FFI/DLL and starts no child process',()=>{
    const file=path.resolve(__dirname,'../tools/windows-native-owner-probe.cjs');
    const driver=`const cp=require('node:child_process'),Module=require('node:module');for(const key of ['spawn','spawnSync','execFile','execFileSync','exec','execSync','fork'])cp[key]=()=>{throw Error('process-start-forbidden');};const load=Module._load;Module._load=function(name,...args){if(['electron','koffi','original-fs'].includes(name))throw Error('native-load-forbidden');return load.call(this,name,...args);};Module._extensions['.node']=()=>{throw Error('addon-load-forbidden');};process.stdout.write(JSON.stringify(require(${JSON.stringify(file)}).auditSourceContract()));`;
    const report=JSON.parse(execFileSync(process.execPath,['-e',driver],{encoding:'utf8'}));assert.equal(report.scope,'static-source-contract-only');assert.equal(report.nativeHelperStarted,false);assert.equal(report.dllLoaded,false);assert.deepEqual(report,auditSourceContract());
});
async function exitFixture(t,options={}){
    const {NativeHelperClient}=require('../src/electronapp/native-helper/controller'),state={shutdownRequested:false,unexpectedTerminal:null};
    const client=new NativeHelperClient({...handshakeFixture(t,options),expectedLibmpvVersion:require('../src/electronapp/native-helper/service').EXPECTED_LIBMPV_VERSION,onTerminal:record=>noteProbeTerminal(state,record)});
    t.after(()=>client.kill());await startProbeHelper(client);return {client,state};
}
test('new exit acceptance uses real controller EOF and waits for stream close',async t=>{
    const {client,state}=await exitFixture(t),report=await finishOwnerProbe(client,state);
    assert.equal(report.result,'PASS');assert.equal(report.nativeExit.kind,'graceful');assert.equal(report.nativeExit.code,0);assert.equal(report.nativeExit.signal,null);assert.equal(report.nativeExit.streamsClosed,true);assert.equal(report.nativeExit.controllerTermination.attempted,false);
});
test('Native error exits 20 through 23 are rejected after actual controller shutdown',async t=>{
    for(const exitCode of [20,21,22,23]){
        const {client,state}=await exitFixture(t,{exitCode});
        await assert.rejects(finishOwnerProbe(client,state),error=>error.code==='OWNER_NATIVE_EXIT_NOT_ACCEPTED'&&error.details.nativeExit.code===exitCode&&error.details.nativeExit.exited&&error.details.nativeExit.streamsClosed);
    }
});
test('production controller escalation is accepted only with the observed owned SIGTERM call',async t=>{
    const {client,state}=await exitFixture(t,{ignoreEof:true}),originalKill=client.child.kill,report=await finishOwnerProbe(client,state);
    assert.equal(client.child.kill,originalKill);assert.equal(report.nativeExit.kind,'controller-terminated');assert.equal(report.nativeExit.code,null);assert.equal(report.nativeExit.signal,'SIGTERM');
    assert.deepEqual(report.nativeExit.controllerTermination,{attempted:true,succeeded:true,signal:'SIGTERM',error:null});
});
test('unsolicited signal and early zero exit cannot masquerade as requested shutdown',async t=>{
    for(const signalled of [true,false]){
        const {client,state}=await exitFixture(t);
        if(signalled)client.child.kill();else client.child.stdin.end();
        await client.exitPromise;
        await assert.rejects(finishOwnerProbe(client,state),error=>error.code==='OWNER_NATIVE_EXIT_NOT_ACCEPTED'&&error.details.nativeExit.unexpectedTerminal===true);
    }
});
test('exit zero with a protocol or transport error cannot pass',async t=>{
    for(const protocol of [true,false]){
        const {client,state}=await exitFixture(t);
        if(protocol)client.protocolFailure='invalid-json';else client.closeOrdering.push({name:'stdin-error'});
        await assert.rejects(finishOwnerProbe(client,state),error=>error.code==='OWNER_NATIVE_EXIT_NOT_ACCEPTED'&&(protocol?error.details.nativeExit.protocolFailure==='invalid-json':error.details.nativeExit.terminalErrors.includes('stdin-error')));
    }
});
test('later stage errors preserve only allowlisted reasons, codes and states',()=>{
    const cases=[['Snapshot unavailable','snapshot-unavailable'],['A frame mismatch','a-color-mismatch'],['B frame mismatch','b-color-mismatch'],['Old request not retired','old-request-not-retired'],['Pixels retained in diagnostics','pixels-in-diagnostics'],['Ended media still produces snapshot','ended-snapshot-available'],['load-command-failed-or-unattributed','load-command-failed-or-unattributed'],['timeout:42:end-file','end-file-timeout']];
    for(const [message,reason]of cases)assert.equal(stageErrorProjection(Error(message),'sample-A').reason,reason);
    const known=Object.assign(Error('unknown'),{code:'OWNER_NATIVE_EXIT_NOT_ACCEPTED',state:'GENERATION_RETIRED'});assert.equal(stageErrorProjection(known,'owned-exit').code,known.code);assert.equal(stageErrorProjection(known,'owned-exit').state,known.state);
    const secret='https://user:secret@example.invalid/private/media',projection=stageErrorProjection(Object.assign(Error(secret),{code:secret,state:secret}),'sample-B');
    assert.equal(projection.reason,null);assert.equal(projection.code,null);assert.equal(projection.state,null);assert.match(projection.messageSha256,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(projection).includes(secret),false);
    for(const message of ['constructor','toString','__proto__'])assert.equal(stageErrorProjection(Error(message),secret).reason,null);
    assert.equal(stageErrorProjection(Error(secret),secret).stage,null);
});
