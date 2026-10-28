'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const tool=require('../tools/windows-native-media-input.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Permit only Git's whole-file LF -> CRLF checkout transform; no BOM,
// content normalization, mixed endings or arbitrary whitespace tolerance.
function assertCheckoutBytes(actual,blob){
 const crlf=Buffer.from(blob.toString('utf8').replace(/(?<!\r)\n/g,'\r\n'));
 assert.ok(actual.equals(blob)||actual.equals(crlf),'checkout must equal committed bytes or exact CRLF checkout');
}
// Strip only the exact reviewed opt-in suite extension before comparing the
// ordinary workflow with its frozen baseline. Defaults/routes remain guarded.
const nativeWarmInput="      benchmark_warm_calls:\n        description: Warm calls; native-liveness/app-entry/app-matrix/app-layered-entry/app-layered-matrix/app-layered-minimal-entry/app-layered-minimal-matrix only with smoke AND diagnostics\n        type: choice\n        default: '3'\n        options: ['3', '1', '5', '10', 'native-liveness', 'app-entry', 'app-matrix', 'app-layered-entry', 'app-layered-matrix', 'app-layered-minimal-entry', 'app-layered-minimal-matrix']\n";
const formalWarmInput="      benchmark_warm_calls:\n        description: Subsequent calls in each fresh process\n        type: choice\n        default: '3'\n        options: ['3', '1', '5', '10']\n";
function removeReviewedNativeChoice(workflow){
 assert.equal(workflow.split(nativeWarmInput).length,2,'exactly one reviewed Native suite input required');
 return workflow.replace(nativeWarmInput,formalWarmInput);
}
function fixture(t){
 const base=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-native-media-package-')));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const root=path.join(base,'source'),runtime=path.join(base,'runtime'),prepared=path.join(base,'prepared');for(const dir of [root,runtime,prepared])fs.mkdirSync(dir);
 const write=(dir,name,bytes)=>{const target=path.join(dir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);};
 for(const name of tool.SOURCES)write(root,name,'module.exports={};\n');
 const node=Buffer.alloc(128);node.write('MZ');node.writeUInt32LE(64,60);node.write('PE\0\0',64);node.writeUInt16LE(0x8664,68);node.writeUInt16LE(0x20b,88);
 const rows=[{name:'koffi',members:{'index.js':Buffer.from('module.exports={};'),'LICENSE':Buffer.from('synthetic MIT notice')}},{name:'@koromix/koffi-win32-x64',members:{'win32_x64/koffi.node':node,'LICENSE':Buffer.from('synthetic MIT notice')}}];
 const packages={},items=[];
 for(const row of rows){const url='https://registry.npmjs.org/'+row.name+'/-/fixture-3.3.3.tgz',integrity='sha512-synthetic-only';packages['node_modules/'+row.name]={version:'3.3.3',resolved:url,integrity};const files=[];
  for(const [name,bytes]of Object.entries(row.members)){write(prepared,'node_modules/'+row.name+'/'+name,bytes);files.push({path:name,size:bytes.length,sha256:sha(bytes)});}
  items.push({name:row.name,version:'3.3.3',url,integrity,files});
 }
 const lock=Buffer.from(JSON.stringify({lockfileVersion:3,packages})+'\n');write(root,'native/windows-media/package-lock.json',lock);write(root,'native/windows-media/package.json',JSON.stringify({dependencies:{koffi:'3.3.3'}}));
 write(root,'native/windows-media/registry-input.json',JSON.stringify({schemaVersion:1,registry:'https://registry.npmjs.org',platform:'win32',arch:'x64',lockSha256:sha(lock),packages:items}));
 const vulkan=Buffer.from('synthetic loader fixture; never loaded'),loader={schemaVersion:1,component:'Electron',version:'44.4.2',platform:'win32',arch:'x64',archiveSha256:'a'.repeat(64),sourcePath:'x64/electron/vulkan-1.dll',targetPath:'electronapp/libmpv/x64/vulkan-1.dll',sha256:sha(vulkan),relation:'byte-identical-standard-payload-copy'};
 write(root,'native/windows-media/loader-input.json',JSON.stringify(loader));write(root,'vendor/electron-runtime-manifest.json',JSON.stringify({version:'44.4.2',platform:'win32',arch:'x64',archive:{sha256:loader.archiveSha256}}));
 write(runtime,loader.sourcePath,vulkan);fs.mkdirSync(path.join(runtime,'electronapp/libmpv/x64'),{recursive:true});
 const git=args=>cp.execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();git(['init','-q']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','add','.']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','synthetic native dependency fixture']);
 return {root,runtime,prepared,source:git(['rev-parse','HEAD']),write,loader};
}
test('ordinary package assembles source-bound native modules, locked members and identical loader without a trial',t=>{
 const f=fixture(t),result=tool.assemble(f.root,f.runtime,f.prepared,f.source);
 assert.equal(result.defaultEnabled,true);assert.equal(result.captureIntervalMs,1000);assert.equal(result.files,7);
 assert.deepEqual(tool.verify(f.root,f.runtime,f.source),result);
 assert.deepEqual(fs.readFileSync(path.join(f.runtime,f.loader.sourcePath)),fs.readFileSync(path.join(f.runtime,f.loader.targetPath)));
 assert.equal(fs.existsSync(path.join(f.runtime,tool.ROOT,'node_modules/koffi/LICENSE')),true);
 assert.throws(()=>tool.assemble(f.root,f.runtime,f.prepared,f.source),/Preserve existing/);
});
test('native wrappers materialize committed LF bytes from CRLF checkout',t=>{
 const f=fixture(t);for(const name of tool.SOURCES)f.write(f.root,name,'module.exports={};\r\n');tool.assemble(f.root,f.runtime,f.prepared,f.source);
 for(const name of tool.SOURCES)assert.equal(fs.readFileSync(path.join(f.runtime,tool.ROOT,path.basename(name)),'utf8'),'module.exports={};\n');
});
for(const name of ['node_modules/koffi/LICENSE','node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node','dwm.cjs'])test('native package rejects payload drift: '+name,t=>{
 const f=fixture(t);tool.assemble(f.root,f.runtime,f.prepared,f.source);fs.appendFileSync(path.join(f.runtime,tool.ROOT,name),'drift');assert.throws(()=>tool.verify(f.root,f.runtime,f.source),/identity mismatch/);
});
test('native package rejects extras, loader drift and falsified default/provenance',t=>{
 const f=fixture(t);tool.assemble(f.root,f.runtime,f.prepared,f.source);
 const extra=path.join(f.runtime,tool.ROOT,'extra.cmd');fs.writeFileSync(extra,'synthetic');assert.throws(()=>tool.verify(f.root,f.runtime,f.source),/file set/);fs.unlinkSync(extra);
 const loader=path.join(f.runtime,f.loader.targetPath),bytes=fs.readFileSync(loader);fs.appendFileSync(loader,'drift');assert.throws(()=>tool.verify(f.root,f.runtime,f.source),/loader copy/);fs.writeFileSync(loader,bytes);
 const proof=path.join(f.runtime,tool.PROOF),record=JSON.parse(fs.readFileSync(proof));record.defaultEnabled=false;fs.writeFileSync(proof,JSON.stringify(record));assert.throws(()=>tool.verify(f.root,f.runtime,f.source),/provenance/);
});
test('native package rejects source/lock drift or changed prepared binaries before creating output',t=>{
 const f=fixture(t),sourceFile=tool.SOURCES[0],original=fs.readFileSync(path.join(f.root,sourceFile));fs.appendFileSync(path.join(f.root,sourceFile),'drift');assert.throws(()=>tool.assemble(f.root,f.runtime,f.prepared,f.source),/input differs/);fs.writeFileSync(path.join(f.root,sourceFile),original);
 fs.appendFileSync(path.join(f.prepared,'node_modules/koffi/LICENSE'),'drift');assert.throws(()=>tool.assemble(f.root,f.runtime,f.prepared,f.source),/payload identity/);assert.equal(fs.existsSync(path.join(f.runtime,tool.ROOT)),false);
});
test('formal Windows wiring uses no trial flag and keeps one-second capture, main shutdown and v042 features',()=>{
 const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),main=read('src/electronapp/main.js'),preload=read('tools/prepare-preload.cjs'),adapter=read('src/electronapp/enhanced/windows-native-media.js');
 assert.doesNotMatch(main,/ETE_WINDOWS_NATIVE_TRIAL|windows-media-controls|\.setThumbarButtons/);assert.doesNotMatch(preload,/ETE_WINDOWS_NATIVE_TRIAL/);
 assert.match(preload,/eteWindowsNativeEnabled = process.platform === 'win32'/);assert.match(main,/if \(process.platform === 'win32'\) \{\s+try \{\s+var nativeMediaPath/);
 assert.match(main,/runCleanup\('windows-media'/);assert.match(adapter,/\}, 1000\)/);assert.doesNotMatch(adapter,/550|PREVIEW_INTERVAL|previewSavings|preview-performance|configuredIntervalMs/);
 for(const name of ['tools/build.ps1','tools/package.ps1'])assert.match(read(name),/windows-native-media-input.cjs/);
 const contract=require('../tools/build-input-contract.cjs');for(const name of tool.INPUTS)assert.ok(contract.INPUT_PATHS.includes(name));
 const productVersion=require('../package.json').version,productLock=require('../package-lock.json');assert.equal(productLock.version,productVersion);assert.equal(productLock.packages[''].version,productVersion);assertCheckoutBytes(fs.readFileSync(path.join(root,'src/config/system-defaults.json')),cp.execFileSync('git',['-C',root,'show','ff92bead:src/config/system-defaults.json']));
  // Preserve the exact formal workflow route after removing only the reviewed,
 // opt-in shared-cache smoke extension (which has its own route/permission tests).
 let workflow=fs.readFileSync(path.join(root,'.github/workflows/public-ci.yml'),'utf8');
 const hasCrLf=workflow.includes('\r\n');
 if(hasCrLf)assert.equal(workflow.replace(/\r\n/g,'').includes('\n'),false,'no mixed checkout line endings');
 workflow=workflow.replace(/\r\n/g,'\n');
 workflow=removeReviewedNativeChoice(workflow);
 const extension=workflow.indexOf('\n\n  windows-shared-cache-smoke:\n');
 assert.ok(extension>0,'one explicit isolated smoke extension required');
 workflow=workflow.slice(0,extension);
 const inputStart=workflow.indexOf('      shared_cache_smoke:\n'),inputEnd=workflow.indexOf('\npermissions:\n',inputStart);
 assert.ok(inputStart>0&&inputEnd>inputStart);
 const fields=workflow.slice(inputStart,inputEnd);
 assert.deepEqual([...fields.matchAll(/^      ([a-z_0-9]+):$/gm)].map(m=>m[1]),['shared_cache_smoke','shared_cache_diagnostics','shared_cache_artifact_id','shared_cache_zip_sha256','shared_cache_installer_sha256']);
 workflow=workflow.slice(0,inputStart)+workflow.slice(inputEnd+1);
 assert.equal((workflow.match(/ && !inputs\.shared_cache_smoke/g)||[]).length,2);
 workflow=workflow.replace(/ && !inputs\.shared_cache_smoke/g,'');
 assert.equal((workflow.match(/ && !inputs\.shared_cache_diagnostics/g)||[]).length,2);
 workflow=workflow.replace(/ && !inputs\.shared_cache_diagnostics/g,'');
 assertCheckoutBytes(Buffer.from(workflow),cp.execFileSync('git',['-C',root,'show','ff92bead:.github/workflows/public-ci.yml']));
});
test('formal workflow guard removes only the exact opt-in suite declaration and rejects drift',()=>{
 assert.equal(removeReviewedNativeChoice('before\n'+nativeWarmInput+'after\n'),'before\n'+formalWarmInput+'after\n');
 for(const value of [formalWarmInput,nativeWarmInput+nativeWarmInput,
  nativeWarmInput.replace("default: '3'","default: 'native-liveness'"),
  nativeWarmInput.replace("'10', 'native-liveness'","'10', 'native-liveness', 'other'"),
  nativeWarmInput.replace('type: choice','type: string')])assert.throws(()=>removeReviewedNativeChoice(value));
});


test('ordinary Windows main close enters the existing drain once, while shutdown and other platforms keep their semantics',()=>{
 const {EventEmitter}=require('node:events'),vm=require('node:vm'),source=fs.readFileSync(path.resolve(__dirname,'../src/electronapp/main.js'),'utf8');
 const begin=source.indexOf("            mainWindow.once('closed', function () {"),end=source.indexOf('            });',begin)+15;
 assert.ok(begin>0&&end>begin);const hook=source.slice(begin,end);
 for(const [platform,closing,wanted]of [['win32',false,1],['win32',true,0],['darwin',false,0]]){
  const mainWindow=new EventEmitter();let calls=0;vm.runInNewContext(hook,{mainWindow,appIsShuttingDown:closing,process:{platform},app:{quit(){calls++;}}});
  mainWindow.emit('close',{preventDefault(){}});assert.equal(calls,0,'close can still be held by cache flush');
  mainWindow.emit('closed');mainWindow.emit('closed');assert.equal(calls,wanted);
 }
 assert.ok(source.indexOf('detailCacheCloseOwner.beforeClose')<source.indexOf("mainWindow.once('closed'"));
});


test('all-windows-closed cannot bypass the already pending shutdown drain when the hidden carrier is destroyed',()=>{
 const {EventEmitter}=require('node:events'),vm=require('node:vm'),source=fs.readFileSync(path.resolve(__dirname,'../src/electronapp/main.js'),'utf8');
 const begin=source.indexOf("    app.on('window-all-closed', function () {"),end=source.indexOf('    });',begin)+7;assert.ok(begin>0&&end>begin);
 for(const [platform,closing,wanted]of [['win32',false,1],['win32',true,0],['darwin',false,0]]){
  const app=new EventEmitter();let calls=0;app.quit=()=>{calls++;};vm.runInNewContext(source.slice(begin,end),{app,process:{platform},appIsShuttingDown:closing});
  app.emit('window-all-closed');assert.equal(calls,wanted);
 }
});

test('formal baseline byte guard accepts an actual Git CRLF checkout and rejects BOM/content/ending drift',t=>{
 const root=path.resolve(__dirname,'..'),checkout=fs.mkdtempSync(path.join(os.tmpdir(),'ete-baseline-crlf-'));
 t.after(()=>fs.rmSync(checkout,{recursive:true,force:true}));
 const git=args=>cp.execFileSync('git',['-C',checkout,...args],{stdio:['ignore','pipe','pipe']});git(['init','-q']);
 fs.writeFileSync(path.join(checkout,'.gitattributes'),'* text eol=crlf\n');
 const names=['src/config/system-defaults.json','.github/workflows/public-ci.yml'];
 const blobs=names.map(name=>cp.execFileSync('git',['-C',root,'show','ff92bead:'+name]));
 names.forEach((name,i)=>{fs.mkdirSync(path.dirname(path.join(checkout,name)),{recursive:true});fs.writeFileSync(path.join(checkout,name),blobs[i]);});
 git(['add','.']);names.forEach(name=>fs.unlinkSync(path.join(checkout,name)));git(['checkout-index','--all','--force']);
 names.forEach((name,i)=>{
  const actual=fs.readFileSync(path.join(checkout,name)),blob=blobs[i];assert.ok(actual.includes(Buffer.from('\r\n')));assertCheckoutBytes(actual,blob);
  assert.throws(()=>assertCheckoutBytes(Buffer.concat([Buffer.from([239,187,191]),actual]),blob));
  assert.throws(()=>assertCheckoutBytes(Buffer.concat([actual,Buffer.from(' ')]),blob));
  const text=actual.toString('utf8');assert.throws(()=>assertCheckoutBytes(Buffer.from(text.replace('\r\n','\n')),blob));
  assert.throws(()=>assertCheckoutBytes(Buffer.from(text.replace(/\r\n/g,'\r')),blob));
 });
});
