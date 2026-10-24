'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const deps=require('./windows-native-preview-deps.cjs');
const verifier=require('./templates/native-preview/verify.cjs');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const SOURCES={
 'trial/verify.cjs':'tools/templates/native-preview/verify.cjs',
 'trial/exit-policy.cjs':'tools/templates/native-preview/exit-policy.cjs',
 'Launch-Trial.ps1':'tools/templates/native-preview/Launch-Trial.ps1',
 'Test-Owner.ps1':'tools/templates/native-preview/Test-Owner.ps1',
 'trial/NOTICE.md':'tools/templates/native-preview/NOTICE.md',
 'trial/owner-probe.cjs':'tools/windows-native-owner-probe.cjs',
 'trial/native-helper-manifest.json':'vendor/native-helper-manifest.json',
 'trial/helper-source.cpp':'native/mpv-helper/ete-mpv-helper.cpp',
 'trial/registry-input.json':'native/windows-media/registry-input.json',
 'trial/package-lock.json':'native/windows-media/package-lock.json',
 'electronapp/enhanced/native-media/dwm.cjs':'native/windows-media/dwm.cjs',
 'electronapp/enhanced/native-media/winrt.cjs':'native/windows-media/winrt.cjs',
 'electronapp/enhanced/native-media/system-libraries.cjs':'native/windows-media/system-libraries.cjs'
};
const GENERATORS=['tools/windows-native-preview-trial.cjs','tools/windows-native-preview-deps.cjs','tools/windows-native-preview-process.cjs','tools/download-native-preview-deps.py','tools/windows-media-trial-bootstrap.cjs','tools/windows-media-trial-identity.cjs','native/windows-media/package.json'];
function git(root,args){return cp.execFileSync('git',['-C',root,...args],{maxBuffer:16*1024*1024});}
function blob(root,commit,name){return git(root,['show',commit+':'+name]);}
function create(root,runtime,dependencies,destination,commit) {
    root=path.resolve(root);runtime=path.resolve(runtime);destination=path.resolve(destination);
    if(!/^[a-f0-9]{40}$/.test(commit)||git(root,['rev-parse','HEAD']).toString().trim()!==commit)throw Error('Exact HEAD required');
    deps.assertPhysicalDirectory(runtime);deps.assertPhysicalDirectory(path.dirname(destination));
    const relative=path.relative(runtime,destination);if(!relative||(!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative)))throw Error('Trial output must be separate');
    if(fs.existsSync(destination))throw Error('Preserve existing trial output');
    const inputNames=[...Object.values(SOURCES),...GENERATORS],inputs=new Map();
    for(const name of inputNames){const bytes=blob(root,commit,name),working=fs.readFileSync(path.join(root,name));
        const canonical=value=>value.toString('utf8').replace(/\r\n/g,'\n');if(canonical(working)!==canonical(bytes))throw Error('Trial input differs from HEAD');inputs.set(name,bytes);}
    deps.verify(root,dependencies);
    // The ordinary build is validated by the unchanged production build/package
    // gates first. Independently check its complete file set before copying.
    const baseBytes=fs.readFileSync(path.join(runtime,'build-manifest.json')),base=JSON.parse(baseBytes),baseFiles=verifier.inventory(runtime);
    if(base.schemaVersion!==3||base.sourceCommit!==commit||baseFiles.size!==base.files.length+1)throw Error('Base payload identity mismatch');
    const names=new Set();for(const file of base.files){const value=baseFiles.get(file.path);if(names.has(file.path)||!value||value.sha256!==file.sha256)throw Error('Base payload mismatch');names.add(file.path);}
    if([...Object.keys(SOURCES),'electronapp/native-preview-trial.cjs','native-preview-trial.json'].some(name=>baseFiles.has(name)))throw Error('Base already contains trial paths');
    const records=[...inputs].map(([name,bytes])=>({path:name,sha256:hash(bytes)}));
    const additions=new Map(Object.entries(SOURCES).map(([target,name])=>[target,inputs.get(name)]));
    // Load the exact committed generator bytes; its only product output is an
    // explicit entry, never a modification of the standard package/main entry.
    const Module=require('node:module'),generatedModule=new Module(path.join(root,'tools/windows-media-trial-bootstrap.cjs'));
    generatedModule.filename=path.join(root,'tools/windows-media-trial-bootstrap.cjs');generatedModule.paths=Module._nodeModulePaths(path.dirname(generatedModule.filename));
    generatedModule._compile(inputs.get('tools/windows-media-trial-bootstrap.cjs').toString(),generatedModule.filename);
    additions.set('electronapp/native-preview-trial.cjs',Buffer.from(generatedModule.exports.buildPortable()));
    fs.mkdirSync(destination);
    for(const name of baseFiles.keys()){const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(runtime,name),target,fs.constants.COPYFILE_EXCL);}
    for(const [name,bytes] of additions){const target=path.join(destination,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});}
    for(const name of verifier.inventory(dependencies).keys()){const target=path.join(destination,'electronapp/enhanced/native-media',name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dependencies,name),target,fs.constants.COPYFILE_EXCL);}
    const report={schemaVersion:1,sourceCommit:commit,defaultEnabled:false,baseBuildManifestSha256:hash(baseBytes),sources:records,
        registry:{registry:'https://registry.npmjs.org',version:'3.3.3',scriptsExecuted:false},
        files:[...verifier.inventory(destination)].map(([name,record])=>({path:name,...record})).sort((a,b)=>a.path.localeCompare(b.path))};
    fs.writeFileSync(path.join(destination,'native-preview-trial.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    return verifier.verify(destination,commit,{loadNative:false});
}
module.exports={create,SOURCES,GENERATORS};
if(require.main===module){try{console.log(JSON.stringify(create(...process.argv.slice(2))));}catch(error){console.error(error.message);process.exitCode=1;}}
