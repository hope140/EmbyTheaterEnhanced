'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto'),zlib=require('node:zlib');
const deps=require('../tools/windows-native-preview-deps.cjs'),trial=require('../tools/windows-native-preview-trial.cjs'),check=require('../tools/templates/native-preview/verify.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function tar(name,body,type=48){const h=Buffer.alloc(512);h.write('package/'+name);h.write('0000644\0',100);h.write(body.length.toString(8).padStart(11,'0')+'\0',124);h[156]=type;h.fill(32,148,156);let sum=0;for(const b of h)sum+=b;h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);return zlib.gzipSync(Buffer.concat([h,body,Buffer.alloc((512-body.length%512)%512),Buffer.alloc(1024)]));}
function item(bytes,name,body){return {archiveBytes:bytes.length,archiveSha256:hash(bytes),integrity:'sha512-'+crypto.createHash('sha512').update(bytes).digest('base64'),files:[{path:name,size:body.length,sha256:hash(body)}]};}
test('archive parser checks exact SRI/member bytes and refuses links/traversal/extra members',()=>{
 const body=Buffer.from('synthetic registry member'),bytes=tar('LICENSE.txt',body),record=item(bytes,'LICENSE.txt',body);
 assert.deepEqual(deps.parse(bytes,record).get('LICENSE.txt'),body);
 assert.throws(()=>deps.parse(Buffer.from('bad'),record),/identity/);
 for(const name of ['../escape','C:/escape']){const bad=tar(name,body);assert.throws(()=>deps.parse(bad,item(bad,name,body)),/Unsafe/);}
 const link=tar('LICENSE.txt',body,50);assert.throws(()=>deps.parse(link,item(link,'LICENSE.txt',body)),/Nonregular/);
 assert.throws(()=>deps.parse(bytes,{...record,files:[]}),/set mismatch/);
});
function fixture(t,crlf=false){
 const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-native-package-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const put=(name,bytes)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
 // Fixture inputs are text. Seed identical LF blobs on either host; the real
 // Git checkout below, not this test runner's own checkout, selects worktree EOL.
 for(const name of new Set([...Object.values(trial.SOURCES),...trial.GENERATORS]))put(name,fs.readFileSync(path.resolve(__dirname,'..',name),'utf8').replace(/\r\n/g,'\n'));
 // Preserve the repository's byte-bound registry/lock attributes during checkout.
 put('.gitattributes',fs.readFileSync(path.resolve(__dirname,'../.gitattributes')));
 // Synthetic dependency bytes are never loaded; only package/identity behavior
 // is tested. Real pinned archives are independently verified outside this fixture.
 const registry=JSON.parse(fs.readFileSync(path.join(root,'native/windows-media/registry-input.json'))),dependencyRoot=path.join(root,'deps');
 for(const entry of registry.packages){const name=entry.name==='koffi'?'LICENSE.txt':'win32_x64/koffi.node';let bytes=Buffer.from('synthetic MIT fixture');if(name.endsWith('.node')){bytes=Buffer.alloc(256);bytes.write('MZ');bytes.writeUInt32LE(128,60);bytes.write('PE\0\0',128);bytes.writeUInt16LE(0x8664,132);bytes.writeUInt16LE(0x20b,152);}entry.files=[{path:name,size:bytes.length,sha256:hash(bytes)}];put('deps/node_modules/'+entry.name+'/'+name,bytes);}
 put('native/windows-media/registry-input.json',JSON.stringify(registry));
 const loader=JSON.parse(fs.readFileSync(path.join(root,'native/windows-media/loader-input.json'))),loaderBytes=Buffer.from('synthetic Vulkan loader; never loaded');loader.sha256=hash(loaderBytes);put('native/windows-media/loader-input.json',JSON.stringify(loader));
 const native=JSON.parse(fs.readFileSync(path.join(root,'vendor/native-helper-manifest.json'))),dll=Buffer.from('synthetic DLL; never execute'),exe=Buffer.from('synthetic helper; never execute');native.libmpv.sha256=hash(dll);put('vendor/native-helper-manifest.json',JSON.stringify(native));
 const git=args=>cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-q']);git(['config','core.autocrlf',String(crlf)]);git(['config','core.eol',crlf?'crlf':'lf']);git(['config','user.name','Synthetic test']);git(['config','user.email','fixture@example.invalid']);git(['add','.gitattributes','tools','native','vendor']);git(['commit','-qm','synthetic source']);const commit=git(['rev-parse','HEAD']);
 // Remove cached-stat matches so checkout-index must actually materialize EOL.
 for(const name of cp.execFileSync('git',['-C',root,'ls-files','-z']).toString().split('\0').filter(Boolean))fs.unlinkSync(path.join(root,name));
 git(['checkout-index','--all']);
 put('runtime/'+native.runtimePath,exe);put('runtime/'+native.libmpv.runtimePath,dll);put('runtime/electronapp/package.json','{"main":"main.js"}');
 put('runtime/x64/electron/resources/default_app.asar','Opaque physical archive fixture; never executed.');
 put('runtime/'+loader.sourcePath,loaderBytes);
 put('runtime/exact-line-endings.txt',Buffer.from('LF\nCRLF\r\nlone-CR\rno-final-LF'));
 const cpp=cp.execFileSync('git',['-C',root,'show',commit+':'+native.sourcePath]);put('runtime/native-helper-provenance.json',JSON.stringify({sourceCommit:commit,source:{sha256:hash(cpp)},helper:{testing:false,sha256:hash(exe)}}));
 const files=[...check.inventory(path.join(root,'runtime'))].map(([name,file])=>({path:name,...file}));put('runtime/build-manifest.json',JSON.stringify({schemaVersion:3,sourceCommit:commit,files}));
 const blob=name=>cp.execFileSync('git',['-C',root,'show',commit+':'+name]);
 return {root,commit,runtime:path.join(root,'runtime'),dependencies:dependencyRoot,destination:path.join(root,'trial-output'),put,blob};
}
for(const crlf of [false,true])test('trial assembly keeps the standard payload unchanged with '+(crlf?'CRLF':'LF')+' source checkout',t=>{
 const f=fixture(t,crlf),policy=trial.SOURCES['trial/exit-policy.cjs'],policyBlob=f.blob(policy),workingPolicy=fs.readFileSync(path.join(f.root,policy));
 // Assert the requested checkout was actually produced, including the new CJS
 // input; merely setting core.autocrlf or converting only C++ cannot prove it.
 assert.deepEqual(workingPolicy,crlf?Buffer.from(policyBlob.toString('utf8').replace(/\n/g,'\r\n')):policyBlob);
 if(crlf)assert.notDeepEqual(workingPolicy,policyBlob);
 const before=check.inventory(f.runtime),result=trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 assert.equal(result.standardPayloadUnchanged,true);assert.equal(result.defaultEnabled,false);assert.equal(result.ffiLoaded,false);
 assert.equal(result.loaderColocated,true);assert.deepEqual(fs.readFileSync(path.join(f.destination,'electronapp/libmpv/x64/vulkan-1.dll')),fs.readFileSync(path.join(f.runtime,'x64/electron/vulkan-1.dll')));
 assert.deepEqual(check.inventory(f.runtime),before);assert.equal(fs.readFileSync(path.join(f.destination,'electronapp/package.json'),'utf8'),'{"main":"main.js"}');
 // Output and source records must match exact committed bytes. Do not normalize
 // either side of this assertion to hide a materialization or hash mismatch.
 const report=JSON.parse(fs.readFileSync(path.join(f.destination,'native-preview-trial.json')));
 for(const [target,source]of Object.entries(trial.SOURCES)){
  const expected=f.blob(source);assert.deepEqual(fs.readFileSync(path.join(f.destination,target)),expected,target);
  assert.equal(report.sources.find(record=>record.path===source)?.sha256,hash(expected),source);
 }
 for(const name of before.keys())assert.deepEqual(fs.readFileSync(path.join(f.destination,name)),fs.readFileSync(path.join(f.runtime,name)),name);
 const description=JSON.parse(cp.execFileSync(process.execPath,[path.join(f.destination,'trial/owner-probe.cjs'),'--describe'],{encoding:'utf8'}));assert.equal(description.scope,'production-helper-owner-snapshot');
 const entry=fs.readFileSync(path.join(f.destination,'electronapp/native-preview-trial.cjs'),'utf8');assert.match(entry,/ETE_WINDOWS_NATIVE_TRIAL = '1'/);assert.match(entry,/fs\.mkdirSync\(directory\)/);assert.match(entry,/Profile must be outside bundle/);
 assert.throws(()=>trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit),/Preserve/);
});
test('newline-only output drift is rejected rather than normalized during verification',t=>{
 const f=fixture(t,true);trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 const target=path.join(f.destination,'trial/exit-policy.cjs'),bytes=fs.readFileSync(target);assert.equal(bytes.includes(Buffer.from('\r\n')),false);
 fs.writeFileSync(target,bytes.toString('utf8').replace(/\n/g,'\r\n'));
 assert.throws(()=>check.verify(f.destination,f.commit,{loadNative:false}),error=>error.code==='TRIAL_INVENTORY_MISMATCH'&&error.details.changed.includes('trial/exit-policy.cjs'));
});
test('CRLF checkout permits only EOL conversion and rejects a substantive policy source edit',t=>{
 const f=fixture(t,true),source=trial.SOURCES['trial/exit-policy.cjs'];f.put(source,fs.readFileSync(path.join(f.root,source),'utf8').replace('owned-shutdown-v1','owned-shutdown-v2'));
 assert.throws(()=>trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit),/Trial input differs from HEAD/);assert.equal(fs.existsSync(f.destination),false);
});
for(const mode of ['missing','wrong-hash','target-collision'])test('trial refuses '+mode+' loader input even when base inventory is internally consistent',t=>{
 const f=fixture(t),source='x64/electron/vulkan-1.dll',target='electronapp/libmpv/x64/vulkan-1.dll';
 if(mode==='missing')fs.unlinkSync(path.join(f.runtime,source));
 if(mode==='wrong-hash')f.put('runtime/'+source,'changed source loader');
 if(mode==='target-collision')f.put('runtime/'+target,fs.readFileSync(path.join(f.runtime,source)));
 const files=[...check.inventory(f.runtime)].filter(([name])=>name!=='build-manifest.json').map(([name,value])=>({path:name,...value}));f.put('runtime/build-manifest.json',JSON.stringify({schemaVersion:3,sourceCommit:f.commit,files}));
 assert.throws(()=>trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit),/Pinned base loader/);assert.equal(fs.existsSync(f.destination),false);
});
test('rehashing trial inventory cannot hide copied loader drift or a forged source relation',t=>{
 for(const mode of ['bytes','relation']){
  const f=fixture(t);trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);const manifest=path.join(f.destination,'native-preview-trial.json'),report=JSON.parse(fs.readFileSync(manifest));
  if(mode==='bytes'){const bytes=Buffer.from('changed target loader');fs.writeFileSync(path.join(f.destination,'electronapp/libmpv/x64/vulkan-1.dll'),bytes);const item=report.files.find(file=>file.path==='electronapp/libmpv/x64/vulkan-1.dll');item.size=bytes.length;item.sha256=hash(bytes);}
  else report.runtimeCopies[0].sourcePath='x64/electron/other.dll';
  fs.writeFileSync(manifest,JSON.stringify(report));assert.throws(()=>check.verify(f.destination,f.commit,{loadNative:false}),/Trial loader source\/copy mismatch/);
 }
});
for(const mode of ['base','ffi','extra','source','exit-policy'])test('bundle rejects '+mode+' drift',t=>{
 const f=fixture(t);trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 const target=mode==='base'?'electronapp/package.json':mode==='ffi'?'electronapp/enhanced/native-media/node_modules/koffi/LICENSE.txt':mode==='source'?'trial/helper-source.cpp':mode==='exit-policy'?'trial/exit-policy.cjs':'unexpected-file';
 fs.writeFileSync(path.join(f.destination,target),'tampered');assert.throws(()=>check.verify(f.destination,f.commit,{loadNative:false}),/mismatch/);
});
test('Electron verification selects original-fs and keeps ASAR as a physical payload file',t=>{
 const vm=require('node:vm'),f=fixture(t);trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 const module={exports:{}},source=fs.readFileSync(path.join(__dirname,'../tools/templates/native-preview/verify.cjs'),'utf8');
 const requirePhysical=name=>{if(name==='original-fs')return fs;if(name==='node:fs')throw Error('ASAR virtual fs must not inspect payload');return require(name);};
 vm.runInNewContext(source,{module,require:requirePhysical,process:{versions:{electron:'44.4.2'}}});
 assert.equal(module.exports.verify(f.destination,f.commit,{loadNative:false}).status,'passed');
 assert.ok(module.exports.inventory(f.destination).has('x64/electron/resources/default_app.asar'));
});
test('file mismatch reports added, missing and changed relative names without allowing them',t=>{
 const f=fixture(t);trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 fs.writeFileSync(path.join(f.destination,'extra.txt'),'unexpected');fs.unlinkSync(path.join(f.destination,'trial/NOTICE.md'));fs.writeFileSync(path.join(f.destination,'electronapp/package.json'),'changed');
 assert.throws(()=>check.verify(f.destination,f.commit,{loadNative:false}),error=>{
  assert.equal(error.code,'TRIAL_INVENTORY_MISMATCH');assert.deepEqual(error.details.added,['extra.txt']);assert.deepEqual(error.details.missing,['trial/NOTICE.md']);assert.deepEqual(error.details.changed,['electronapp/package.json']);return true;
 });
});
test('acceptance records extracted inventory corruption before starting a child',async t=>{
 const {accept}=require('../tools/windows-native-preview-process.cjs'),f=fixture(t);trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 fs.writeFileSync(path.join(f.destination,'unexpected.txt'),'drift');const diagnostics=path.join(f.root,'diagnostics');
 await assert.rejects(accept(f.destination,path.join(f.root,'owner'),f.commit,diagnostics),error=>error.code==='TRIAL_INVENTORY_MISMATCH');
 const recorded=JSON.parse(fs.readFileSync(path.join(diagnostics,'failure.json')));assert.equal(recorded.stage,'extracted');assert.deepEqual(recorded.details.added,['unexpected.txt']);
 assert.equal(fs.existsSync(path.join(diagnostics,'selfcheck.process.json')),false);
});
test('selfcheck spawn failure records close and after-phase inventory before any owner-report read',async t=>{
 const {accept}=require('../tools/windows-native-preview-process.cjs'),f=fixture(t);trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 const diagnostics=path.join(f.root,'diagnostics');await assert.rejects(accept(f.destination,path.join(f.root,'owner'),f.commit,diagnostics),error=>error.code==='TRIAL_CHILD_FAILED');
 const processRecord=JSON.parse(fs.readFileSync(path.join(diagnostics,'selfcheck.process.json'))),phase=JSON.parse(fs.readFileSync(path.join(diagnostics,'after-selfcheck.inventory.json')));
 assert.equal(processRecord.closed,true);assert.equal(processRecord.spawnError,'ENOENT');assert.deepEqual(phase.previousDelta.added,[]);assert.deepEqual(phase.previousDelta.missing,[]);assert.deepEqual(phase.previousDelta.changed,[]);
 assert.equal(JSON.parse(fs.readFileSync(path.join(diagnostics,'failure.json'))).stage,'selfcheck');assert.equal(fs.existsSync(path.join(diagnostics,'owner.process.json')),false);
});
for(const generator of ['tools/windows-media-trial-bootstrap.cjs','tools/windows-native-exit-probe.cjs'])test('trial cannot be emitted into the base runtime or from dirty generator '+generator,t=>{
 const f=fixture(t);assert.throws(()=>trial.create(f.root,f.runtime,f.dependencies,path.join(f.runtime,'nested'),f.commit),/separate/);
 f.put(generator,'changed');assert.throws(()=>trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit),/differs from HEAD/);assert.equal(fs.existsSync(f.destination),false);
});

test('portable entry creates only a fresh outside profile and rejects existing/inside/redirected targets',t=>{
 const vm=require('node:vm'),{EventEmitter}=require('node:events'),{buildPortable}=require('../tools/windows-media-trial-bootstrap.cjs');
 const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-native-entry-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const runtime=path.join(root,'runtime'),directory=path.join(runtime,'electronapp');fs.mkdirSync(directory,{recursive:true});
 function run(profile){const app=new EventEmitter(),paths=new Map(),context={__dirname:directory,process:{argv:['electron.exe','entry.cjs',profile],env:{},pid:1},setImmediate,require(name){if(name==='electron')return {app,BrowserWindow:{}};return require(name);}};
 app.getAppPath=()=>directory;app.setPath=(name,value)=>paths.set(name,value);app.setAppUserModelId=()=>{};app.requestSingleInstanceLock=()=>false;app.quit=()=>{};
 vm.runInNewContext(buildPortable(),context);return {paths,context};}
 const profile=path.join(root,'new-profile'),result=run(profile);assert.equal(result.context.process.env.ETE_WINDOWS_NATIVE_TRIAL,'1');
 for(const value of result.paths.values())assert.ok(value.startsWith(profile+path.sep));
 assert.throws(()=>run(profile),/EEXIST/);assert.throws(()=>run(path.join(runtime,'inside')),/outside bundle/);
 const alias=path.join(root,'alias');fs.symlinkSync(root,alias,'junction');assert.throws(()=>run(path.join(alias,'redirected')),/Physical profile parent/);
});

test('workflow trial option is default-off, incompatible with release mode and checks the extracted ZIP',()=>{
 const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/public-ci.yml'),'utf8');
 const build=fs.readFileSync(path.join(__dirname,'../tools/ci-windows-test-package.ps1'),'utf8');
 assert.match(workflow,/native_preview_trial:[\s\S]*?default: false/);assert.match(build,/\$ReleasePackage -and \$NativePreviewTrial/);
 for(const required of ['download-native-preview-deps.py','windows-native-preview-trial.cjs','ExtractToDirectory','windows-native-preview-process.cjs','ownedExitConfirmed'])assert.ok(build.includes(required));
 assert.match(workflow,/Preserve native preview failure diagnostics[\s\S]*?if: failure\(\) && inputs.native_preview_trial/);
 assert.doesNotMatch(build,/gh workflow run|gh release|git push|Invoke-Expression/);
});
