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
 for(const name of new Set([...Object.values(trial.SOURCES),...trial.GENERATORS]))put(name,fs.readFileSync(path.resolve(__dirname,'..',name)));
 if(crlf){const name='native/mpv-helper/ete-mpv-helper.cpp';put(name,fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));}
 // Synthetic dependency bytes are never loaded; only package/identity behavior
 // is tested. Real pinned archives are independently verified outside this fixture.
 const registry=JSON.parse(fs.readFileSync(path.join(root,'native/windows-media/registry-input.json'))),dependencyRoot=path.join(root,'deps');
 for(const entry of registry.packages){const name=entry.name==='koffi'?'LICENSE.txt':'win32_x64/koffi.node';let bytes=Buffer.from('synthetic MIT fixture');if(name.endsWith('.node')){bytes=Buffer.alloc(256);bytes.write('MZ');bytes.writeUInt32LE(128,60);bytes.write('PE\0\0',128);bytes.writeUInt16LE(0x8664,132);bytes.writeUInt16LE(0x20b,152);}entry.files=[{path:name,size:bytes.length,sha256:hash(bytes)}];put('deps/node_modules/'+entry.name+'/'+name,bytes);}
 put('native/windows-media/registry-input.json',JSON.stringify(registry));
 const native=JSON.parse(fs.readFileSync(path.join(root,'vendor/native-helper-manifest.json'))),dll=Buffer.from('synthetic DLL; never execute'),exe=Buffer.from('synthetic helper; never execute');native.libmpv.sha256=hash(dll);put('vendor/native-helper-manifest.json',JSON.stringify(native));
 const git=args=>cp.execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git(['init','-q']);if(crlf)git(['config','core.autocrlf','true']);git(['config','user.name','Synthetic test']);git(['config','user.email','fixture@example.invalid']);git(['add','tools','native','vendor']);git(['commit','-qm','synthetic source']);const commit=git(['rev-parse','HEAD']);
 put('runtime/'+native.runtimePath,exe);put('runtime/'+native.libmpv.runtimePath,dll);put('runtime/electronapp/package.json','{"main":"main.js"}');
 const cpp=cp.execFileSync('git',['-C',root,'show',commit+':'+native.sourcePath]);put('runtime/native-helper-provenance.json',JSON.stringify({sourceCommit:commit,source:{sha256:hash(cpp)},helper:{testing:false,sha256:hash(exe)}}));
 const files=[...check.inventory(path.join(root,'runtime'))].map(([name,file])=>({path:name,...file}));put('runtime/build-manifest.json',JSON.stringify({schemaVersion:3,sourceCommit:commit,files}));
 return {root,commit,runtime:path.join(root,'runtime'),dependencies:dependencyRoot,destination:path.join(root,'trial-output'),put};
}
for(const crlf of [false,true])test('trial assembly keeps the standard payload unchanged with '+(crlf?'CRLF':'LF')+' source checkout',t=>{
 const f=fixture(t,crlf),before=check.inventory(f.runtime),result=trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 assert.equal(result.standardPayloadUnchanged,true);assert.equal(result.defaultEnabled,false);assert.equal(result.ffiLoaded,false);
 assert.deepEqual(check.inventory(f.runtime),before);assert.equal(fs.readFileSync(path.join(f.destination,'electronapp/package.json'),'utf8'),'{"main":"main.js"}');
 const entry=fs.readFileSync(path.join(f.destination,'electronapp/native-preview-trial.cjs'),'utf8');assert.match(entry,/ETE_WINDOWS_NATIVE_TRIAL = '1'/);assert.match(entry,/fs\.mkdirSync\(directory\)/);assert.match(entry,/Profile must be outside bundle/);
 assert.throws(()=>trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit),/Preserve/);
});
for(const mode of ['base','ffi','extra','source'])test('bundle rejects '+mode+' drift',t=>{
 const f=fixture(t);trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit);
 const target=mode==='base'?'electronapp/package.json':mode==='ffi'?'electronapp/enhanced/native-media/node_modules/koffi/LICENSE.txt':mode==='source'?'trial/helper-source.cpp':'unexpected-file';
 fs.writeFileSync(path.join(f.destination,target),'tampered');assert.throws(()=>check.verify(f.destination,f.commit,{loadNative:false}),/mismatch/);
});
test('trial cannot be emitted into the base runtime or from dirty generator sources',t=>{
 const f=fixture(t);assert.throws(()=>trial.create(f.root,f.runtime,f.dependencies,path.join(f.runtime,'nested'),f.commit),/separate/);
 f.put('tools/windows-media-trial-bootstrap.cjs','changed');assert.throws(()=>trial.create(f.root,f.runtime,f.dependencies,f.destination,f.commit),/differs from HEAD/);assert.equal(fs.existsSync(f.destination),false);
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
 for(const required of ['download-native-preview-deps.py','windows-native-preview-trial.cjs','ExtractToDirectory','trial/verify.cjs','trial/owner-probe.cjs','ownedExitConfirmed'])assert.ok(build.includes(required));
 assert.doesNotMatch(build,/gh workflow run|gh release|git push|Invoke-Expression/);
});
