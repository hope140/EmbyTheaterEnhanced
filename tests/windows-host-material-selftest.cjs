'use strict';
// Explicit local-material check. No installer, assembly, helper, driver or media
// is executed. Run in an isolated checkout prepared without the old Host paths.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const assembly=require('../tools/assemble-runtime-base.cjs'),dependencies=require('../tools/runtime-dependency-contract.cjs');
const product=require('../tools/copy-tracked-product-sources.cjs'),overlays=require('../tools/prepare-web-overlays.cjs');
const web=require('../tools/web-snapshot-input.cjs'),host=require('../tools/windows-host-input.cjs');
const contract=require('../tools/build-input-contract.cjs');
const modelInput=require('../tools/model-compatibility-input.cjs');
const root=path.resolve(__dirname,'..');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function inventory(directory) {
    const files=[];function walk(dir,prefix){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
        const name=prefix+entry.name,full=path.join(dir,entry.name);
        if(entry.isDirectory())walk(full,name+'/');else{const bytes=fs.readFileSync(full);files.push({path:name,size:bytes.length,sha256:hash(bytes)});}
    }}walk(directory,'');return files.filter(item=>item.path!==dependencies.OWNER_FILE).sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
test('real official Host and frozen Web preserve the complete base payload with old Host inputs absent',t=>{
    const commit=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    const inputs=contract.inspect(root,commit),legacy=JSON.parse(fs.readFileSync(path.join(root,'vendor/runtime-manifest.json')));
    const component=host.load(root),snapshot=web.load(root);
    assert.equal(fs.existsSync(path.join(root,'vendor/carnival')),false,'Whole old Carnival directory must be absent');
    const compatibility=require('../tools/compatibility-resources-input.cjs');
    const smallRuntime=require('../tools/small-runtime-input.cjs');
    for(const entry of smallRuntime.load(root).files)assert.equal(fs.existsSync(path.join(root,'vendor/carnival',entry.path)),false,'Old small runtime file must be absent');
    for(const entry of compatibility.load(root).files)assert.equal(fs.existsSync(path.join(root,'vendor/carnival',entry.path)),false,'Old compatibility resource must be absent');
    assert.equal(fs.existsSync(path.join(root,'vendor/carnival/external')),false);
    assert.equal(fs.existsSync(path.join(root,'vendor/patch')),false,'Whole old patch directory must be absent');
    const libmpvInput=require('../tools/libmpv-input.cjs').validate(root);
    for(const entry of component.files)assert.equal(fs.existsSync(path.join(root,'vendor/carnival',entry.path)),false,'Old Host entry must be absent in this isolated proof');
    assert.equal(fs.existsSync(path.join(root,'vendor/carnival/electronapp/www')),false);
    assert.equal(fs.existsSync(path.join(root,'vendor/carnival/electronapp/node_modules')),false,'Old npm directory must be absent in this isolated proof');
    for(const name of Object.keys(require('../tools/runtime-template-input.cjs').FILES))assert.equal(fs.existsSync(path.join(root,'vendor/carnival',name)),false,'Old templates must be absent in this isolated proof');
    const classified=assembly.classify(legacy.files,product.listTrackedProductSources(root,commit).map(x=>x.runtimePath),
        overlays.WEB_OVERLAY_CONTRACT.map(x=>x.runtimePath),dependencies.loadSelectedPackages(root).packages.map(x=>x.packagePath));
    const reference=[...classified.filter(x=>x.action==='copy'&&!['config/system.xml',smallRuntime.TRANSLATION_PATH].includes(x.path)&&!web.isLegacyWeb(x.path)&&!modelInput.isModelCompatibility(x.path)).map(({path,size,sha256})=>({path,size,sha256})),
        ...['config/system.xml',smallRuntime.TRANSLATION_PATH].map(name=>{const bytes=require('./helpers/small-runtime-reference.cjs').bytes(root,name,fs.readFileSync(path.join(root,smallRuntime.INPUT_ROOT,name)));return{path:name,size:bytes.length,sha256:hash(bytes)};}),
        ...modelInput.load(root).files.map(({path,size,sha256})=>({path,size,sha256})),
        ...snapshot.files.filter(x=>!['www/modules/CustomCssJS.js','www/modules/themes/logo.png'].includes(x.path)).map(x=>({path:'electronapp/'+x.path,size:x.size,sha256:x.sha256}))].sort((a,b)=>a.path.localeCompare(b.path,'en'));
    const omitted=reference.filter(entry=>entry.path==='System.Configuration.dll');
    assert.deepEqual(omitted,[{path:'System.Configuration.dll',size:93200,sha256:'3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf'}]);
    const expected=reference.filter(entry=>entry.path!=='System.Configuration.dll');
    const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
    const runtime=fs.mkdtempSync(path.join(dist,'windows-host-base-validation-'));
    const token=dependencies.createOwner(root,runtime,commit);
    const result=assembly.assemble(root,commit,runtime,token);
    assert.deepEqual(inventory(runtime),expected);
    const model=modelInput.load(root).files[0];
    assert.equal(hash(fs.readFileSync(path.join(runtime,model.path))),model.sha256.toLowerCase());
    host.validateRuntime(root,runtime);
    const report={schemaVersion:1,status:'passed',sourceCommit:commit,sourceComparison:'Frozen original copy-entry manifest plus independent raw Web manifest',
        filesCompared:expected.length,treeSha256:web.treeHash(expected),hostFiles:component.fileCount,hostBytes:component.bytes,hostRuntimeProjection:host.runtimeSelection(component),
        wholeOldCarnivalAbsent:true,modelCompatibility:result.modelCompatibility,oldHostPathsAbsent:true,oldWwwAbsent:true,oldCompatibilityResourcesAbsent:true,compatibilityResources:result.compatibilityResources,oldSmallRuntimePathsAbsent:true,smallRuntime:result.smallRuntime,oldPatchAbsent:true,libmpvInput,oldNpmAbsent:true,oldTemplatesAbsent:true,runtimeTemplates:result.runtimeTemplates,inheritedNpm:result.inheritedNpm,modelSha256:model.sha256.toLowerCase(),modelUnchanged:false,
        buildInputCount:inputs.files.length,runtimePath:path.relative(root,runtime).replaceAll(path.sep,'/'),
        notExecuted:['full npm/Electron/Native assembly','installer','application','driver installation','display or media playback']};
    const directory=path.join(root,'.work/verification');fs.mkdirSync(directory,{recursive:true});
    const receipt=path.join(directory,path.basename(runtime)+'.json');fs.writeFileSync(receipt,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    t.diagnostic('receipt: '+path.relative(root,receipt).replaceAll(path.sep,'/'));
    t.diagnostic('compared base files: '+expected.length);
});

test('real official Host projection omits private DLL and five CEC files while validating all nineteen source files',t=>{
    const manifest=host.load(root),sourceBefore=host.validate(root);
    const expectedExcluded={path:'System.Configuration.dll',size:93200,
        sha256:'3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf'};
    assert.equal(manifest.fileCount,19);
    assert.deepEqual(manifest.files.filter(x=>x.path===expectedExcluded.path).map(({path,size,sha256})=>({path,size,sha256})),[expectedExcluded]);
    const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
    const output=fs.mkdtempSync(path.join(dist,'host-projection-validation-'));
    const result=host.assemble(root,output);
    const expected=manifest.files.filter(x=>!host.EXCLUDED_FILES.some(entry=>entry.path===x.path)).map(({path,size,sha256})=>({path,size,sha256})).sort((a,b)=>a.path.localeCompare(b.path,'en'));
    assert.deepEqual(inventory(output),expected);assert.equal(expected.length,10);
    assert.equal(result.runtimeBytes,manifest.bytes-host.EXCLUDED_FILES.reduce((n,item)=>n+item.size,0));assert.equal(result.fileCount,19);
    assert.deepEqual(host.validateRuntime(root,output).excludedFiles,host.runtimeSelection(manifest).excludedFiles);
    assert.ok(fs.existsSync(path.join(output,'System.Configuration.xml')));
    const injected=path.join(output,'System.Configuration.dll');fs.writeFileSync(injected,'synthetic reintroduction');
    assert.throws(()=>host.validateRuntime(root,output),/Excluded Windows Host test resource/);fs.unlinkSync(injected);
    assert.deepEqual(inventory(output),expected);
    assert.deepEqual(host.validate(root),sourceBefore,'complete official source stays byte-identical');
    for(const mutation of ['missing','changed']) {
        const sandbox=fs.mkdtempSync(path.join(dist,'host-source-negative-'));
        t.after(()=>fs.rmSync(sandbox,{recursive:true,force:true}));
        fs.mkdirSync(path.join(sandbox,'vendor'),{recursive:true});
        fs.copyFileSync(path.join(root,host.MANIFEST_PATH),path.join(sandbox,host.MANIFEST_PATH));
        fs.cpSync(path.join(root,host.INPUT_ROOT),path.join(sandbox,host.INPUT_ROOT),{recursive:true});
        const file=path.join(sandbox,host.INPUT_ROOT,expectedExcluded.path),runtime=path.join(sandbox,'dist/candidate');
        if(mutation==='missing')fs.unlinkSync(file);else fs.appendFileSync(file,'changed');
        assert.throws(()=>host.assemble(sandbox,runtime),/snapshot input|snapshot identity/);
        assert.equal(fs.existsSync(runtime),false);
    }
    const report={status:'passed',scope:'Host component only; no application, system, GAC or user data accessed',
        source:sourceBefore,projection:result,filesCompared:expected.length,runtimePath:path.relative(root,output).replaceAll(path.sep,'/'),
        notExecuted:['Electron','login','media playback','CEC','installer','system configuration changes']};
    const directory=path.join(root,'.work/verification');fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,path.basename(output)+'.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    t.diagnostic('retained official files compared: '+expected.length);
});
