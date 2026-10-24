'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {peImports,assess}=require('../tools/windows-native-loader-probe.cjs');
function pe(name='vulkan-1.dll'){
 const bytes=Buffer.alloc(1024),header=128,optional=header+24,section=optional+240;
 bytes.writeUInt16LE(0x5a4d,0);bytes.writeUInt32LE(header,60);bytes.writeUInt32LE(0x4550,header);bytes.writeUInt16LE(0x8664,header+4);bytes.writeUInt16LE(1,header+6);bytes.writeUInt16LE(240,header+20);bytes.writeUInt16LE(0x20b,optional);
 bytes.writeUInt32LE(512,optional+60);bytes.writeUInt32LE(4096,optional+120);bytes.writeUInt32LE(40,optional+124);
 bytes.writeUInt32LE(4096,section+12);bytes.writeUInt32LE(512,section+16);bytes.writeUInt32LE(512,section+20);
 bytes.writeUInt32LE(4160,512+12);bytes.write(name,576);return bytes;
}
test('PE parser reads ordinary x64 imports without loading a library',()=>{
 assert.deepEqual(peImports(pe()),['vulkan-1.dll']);assert.deepEqual(peImports(pe('api-ms-win-crt-runtime-l1-1-0.dll')),['api-ms-win-crt-runtime-l1-1-0.dll']);
 const none=pe();none.writeUInt32LE(0,272);none.writeUInt32LE(0,276);assert.deepEqual(peImports(none),[]);
});
test('PE parser refuses wrong architecture, missing terminator, malformed RVA and non-DLL names',()=>{
 const machine=pe();machine.writeUInt16LE(0x14c,132);assert.throws(()=>peImports(machine),/x64/);
 const unterminated=pe();unterminated.writeUInt32LE(20,276);assert.throws(()=>peImports(unterminated),/unterminated/);
 const address=pe();address.writeUInt32LE(0xffffff,524);assert.throws(()=>peImports(address),/RVA/);
 for(const value of [Buffer.alloc(0),pe().subarray(0,560),pe('../secret.dll'),pe('C:\\secret.dll')])assert.throws(()=>peImports(value));
 const ascii=pe();ascii[576]=0xf6;assert.throws(()=>peImports(ascii),/name invalid/);
});
function record(phase){return {scope:'dll-load-only-not-helper-or-video',phase,targetExists:true,flags:4352,win32Error:phase==='A'?126:0,loaded:phase==='B',freed:phase==='B'?true:null,vulkanPreloaded:false,vulkanColocated:phase==='B',vulkanSystemPresent:false,vulkanLoadedFrom:phase==='B'?'colocated':'none',loadedVulkanSha256:phase==='B'?'a'.repeat(64):null,helperStarted:false,appStarted:false,visibleAcceptance:'NOT_ASSESSED'};}
test('only fresh failure126 to source-bound colocated loader success supports the dependency hypothesis',()=>{
 const a=record('A'),b=record('B'),hash='a'.repeat(64);assert.equal(assess(a,b,hash).vulkanDependencyCauseSupported,true);
 for(const change of [{vulkanPreloaded:true},{vulkanLoadedFrom:'system32'},{loadedVulkanSha256:'b'.repeat(64)},{loaded:false,win32Error:126,freed:null}])assert.equal(assess(a,{...b,...change},hash).vulkanDependencyCauseSupported,false);
 assert.equal(assess({...a,win32Error:193},b,hash).vulkanDependencyCauseSupported,false);
 assert.equal(assess({...a,loaded:true,win32Error:0,freed:true},b,hash).vulkanDependencyCauseSupported,false);
 assert.equal(assess(a,b,hash).productionHelperAcceptance,'NOT_ASSESSED');
});
test('malformed or failed-cleanup reports cannot support any acceptance',()=>{
 for(const change of [{flags:0},{freed:false},{win32Error:126},{vulkanPreloaded:undefined},{helperStarted:true}])assert.throws(()=>assess(record('A'),{...record('B'),...change},'a'.repeat(64)),/report invalid/);
});
test('short workflow route remains explicit and returns before full build or package upload',()=>{
 const root=path.resolve(__dirname,'..'),workflow=fs.readFileSync(path.join(root,'.github/workflows/public-ci.yml'),'utf8'),ci=fs.readFileSync(path.join(root,'tools/ci-windows-test-package.ps1'),'utf8');
 assert.match(workflow,/native_loader_only:[\s\S]*?default: false/);assert.match(workflow,/Upload verified test package\s+if: \$\{\{ !inputs.native_loader_only && !inputs.native_helper_only && !inputs.native_preview_pacing_only \}\}/);
 const route=ci.indexOf('if ($NativeLoaderOnly) {'),end=ci.indexOf('\n}',route);assert.ok(route>0&&end>route&&end<ci.indexOf('& npm ci'));
 assert.match(ci.slice(route,end),/prepare-native-loader-probe\.ps1[\s\S]*return/);assert.match(ci,/Loader diagnostic must be selected alone/);
 const powershell=fs.readFileSync(path.join(root,'tools/Test-NativeDllLoad.ps1'),'utf8');
 assert.doesNotMatch(powershell,/CreateWindow|mpv_create|mpv_initialize|SetDllDirectory|AddDllDirectory|SetEnvironmentVariable/);
 assert.match(powershell,/error=module==IntPtr.Zero \? Marshal.GetLastWin32Error\(\) : 0/);assert.match(powershell,/FreeLibrary\(\$module\)/);assert.match(powershell,/GITHUB_ACTIONS -ne 'true'/);
});
test('owner target evidence uses actual physical paths and omits raw path values',t=>{
 const os=require('node:os'),{targetEvidence}=require('../tools/windows-native-owner-probe.cjs'),root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'private-loader-target-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const dll=path.join(root,'electronapp','libmpv','x64','mpv-1.dll');fs.mkdirSync(path.dirname(dll),{recursive:true});fs.writeFileSync(dll,'synthetic DLL; not loaded');
 const evidence=targetEvidence(root,dll);assert.equal(evidence.absolute,true);assert.equal(evidence.physicalPathMatch,true);assert.equal(evidence.productionBaselinePathMatch,true);assert.equal(JSON.stringify(evidence).includes(root),false);
 const other=path.join(root,'another.dll');fs.writeFileSync(other,'synthetic DLL; not loaded');assert.equal(targetEvidence(root,other).productionBaselinePathMatch,false);
});
test('bounded helper fatal projection retains numerical loader evidence without paths',()=>{
 const {startupEvidence}=require('../tools/windows-native-owner-probe.cjs'),tag='helper-fatal:dll-load-failed:win32-126:target-file-1:absolute-1:chars-222:forward-slashes-0';
 const evidence=startupEvidence({stderrChunks:[Buffer.from(tag+'\n')],closeOrdering:[]},Error('helper-start-failed:23'));assert.deepEqual(evidence.stderr.fatalTags,[tag]);assert.equal(evidence.error.message,'helper-start-failed:23');
});
test('actual embedded C# compiles and retains Unicode, last-error and out-int contracts without invoking a DLL',()=>{
 const cp=require('node:child_process'),file=path.resolve(__dirname,'../tools/Test-NativeDllLoad.ps1');
 const command=String.raw`$ErrorActionPreference='Stop';$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($env:ETE_LOADER_SOURCE,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'Source parse failed'};$strings=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.StringConstantExpressionAst] -and $n.Value.StartsWith('using System;')},$true));if($strings.Count -ne 1){throw 'One actual CSharp definition required'};Add-Type -TypeDefinition $strings[0].Value;$load=[EteLoaderProbe].GetMethod('LoadWithError');$pinvoke=[EteLoaderProbe].GetMethod('LoadLibraryExW').GetCustomAttributes([Runtime.InteropServices.DllImportAttribute],$false)[0];ConvertTo-Json -Compress -InputObject @{returnType=$load.ReturnType.FullName;outType=$load.GetParameters()[1].ParameterType.FullName;unicode=($pinvoke.CharSet -eq [Runtime.InteropServices.CharSet]::Unicode);setLastError=$pinvoke.SetLastError;library=$pinvoke.Value}`;
 const result=cp.spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',env:{...process.env,ETE_LOADER_SOURCE:file}});assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),{returnType:'System.IntPtr',outType:'System.Int32&',unicode:true,setLastError:true,library:'kernel32.dll'});
});
test('helper startup route is cloud-only, default-off and cannot upload a standard package',()=>{
 const root=path.resolve(__dirname,'..'),workflow=fs.readFileSync(path.join(root,'.github/workflows/public-ci.yml'),'utf8'),ci=fs.readFileSync(path.join(root,'tools/ci-windows-test-package.ps1'),'utf8'),startup=fs.readFileSync(path.join(root,'tools/windows-native-helper-startup.cjs'),'utf8');
 assert.match(workflow,/native_helper_only:[\s\S]*?default: false/);assert.match(ci,/Helper startup must be selected alone/);
 const begin=ci.indexOf('if ($NativeHelperOnly) {'),end=ci.indexOf('\n}',begin);assert.ok(begin>0&&end<ci.indexOf('& npm ci'));assert.match(ci.slice(begin,end),/-HelperStartup[\s\S]*return/);
 assert.match(startup,/GITHUB_ACTIONS!=='true'/);assert.match(startup,/'--handshake-only'/);assert.match(startup,/readHandshakeReport\(probeOutput,c.source\)/);assert.doesNotMatch(startup,/native-helper-electron-smoke|capture-screen|loadfile|\.y4m/);
});
test('actual NativeOnly acquisition selection retains only locked MSYS packages and preserves normal selection',()=>{
 const cp=require('node:child_process'),file=path.resolve(__dirname,'../tools/prepare-ci-build-inputs.ps1');
 const command=String.raw`$ErrorActionPreference='Stop';$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($env:ETE_PREPARE_SOURCE,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'Parse failed'};$assignment=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.VariablePath.UserPath -eq 'selectedFiles'},$true));if($assignment.Count -ne 1){throw 'One production selection required'};$plan=@{files=@(@{id='msys2-gcc'},@{id='inno'},@{id='msys2-runtime'},@{id='official-host'})};$result=@();foreach($NativeOnly in @($true,$false)){. ([scriptblock]::Create($assignment[0].Extent.Text));$result+=,@($selectedFiles | ForEach-Object { $_.id })};ConvertTo-Json -Compress -InputObject $result`;
 const r=cp.spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',env:{...process.env,ETE_PREPARE_SOURCE:file}});assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),[['msys2-gcc','msys2-runtime'],['msys2-gcc','inno','msys2-runtime','official-host']]);
});
