'use strict';
// Electron patches node:fs to expose ASAR members as virtual directories,
// including in RUN_AS_NODE mode. Payload identity always uses physical bytes.
const fs=process.versions.electron?require('original-fs'):require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function inventory(root){const files=new Map();function walk(dir,prefix){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name),name=prefix+item.name,stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('Bundle link forbidden');if(stat.isDirectory())walk(file,name+'/');else if(stat.isFile())files.set(name,{size:stat.size,sha256:hash(fs.readFileSync(file))});else throw Error('Nonregular bundle file');}}if(fs.lstatSync(root).isSymbolicLink())throw Error('Bundle root link forbidden');walk(root,'');return files;}
function difference(actual,files){const expected=new Map(files.map(file=>[file.path,file]));return {expectedFiles:expected.size,actualFiles:actual.size,
    added:[...actual.keys()].filter(name=>!expected.has(name)).sort(),missing:[...expected.keys()].filter(name=>!actual.has(name)).sort(),
    changed:[...actual].filter(([name,file])=>expected.has(name)&&(expected.get(name).sha256!==file.sha256||expected.get(name).size!==file.size)).map(([name])=>name).sort()};}
function verify(root,expectedCommit,options={}) {
    const report=JSON.parse(fs.readFileSync(path.join(root,'native-preview-trial.json')));
    if(!/^[a-f0-9]{40}$/.test(expectedCommit||'')||report.sourceCommit!==expectedCommit||report.schemaVersion!==1||report.defaultEnabled!==false)throw Error('Trial source/default mismatch');
    const actual=inventory(root);actual.delete('native-preview-trial.json');
    for(const name of ['debug.log','x64/electron/debug.log'])if(actual.has(name)&&!report.files.some(file=>file.path===name)){if(actual.get(name).size>8*1024*1024)throw Error('Runtime log exceeds allowed size');actual.delete(name);}
    const delta=difference(actual,report.files);
    if(delta.added.length||delta.missing.length||delta.changed.length){const error=Error('Trial file set/identity mismatch');error.code='TRIAL_INVENTORY_MISMATCH';error.details=delta;throw error;}
    const names=new Set();for(const file of report.files){if(names.has(file.path))throw Error('Duplicate trial record');names.add(file.path);const value=actual.get(file.path);if(!value||value.size!==file.size||value.sha256!==file.sha256)throw Error('Trial file identity mismatch');}
    const base=JSON.parse(fs.readFileSync(path.join(root,'build-manifest.json')));
    if(base.sourceCommit!==expectedCommit||hash(fs.readFileSync(path.join(root,'build-manifest.json')))!==report.baseBuildManifestSha256)throw Error('Base build identity mismatch');
    for(const file of base.files)if(actual.get(file.path)?.sha256!==file.sha256)throw Error('Standard payload changed');
    const provenance=JSON.parse(fs.readFileSync(path.join(root,'native-helper-provenance.json')));
    const native=JSON.parse(fs.readFileSync(path.join(root,'trial/native-helper-manifest.json')));
    if(provenance.sourceCommit!==expectedCommit||provenance.helper.testing||hash(fs.readFileSync(path.join(root,native.runtimePath)))!==provenance.helper.sha256||hash(fs.readFileSync(path.join(root,'trial/helper-source.cpp')))!==provenance.source.sha256||hash(fs.readFileSync(path.join(root,native.libmpv.runtimePath)))!==native.libmpv.sha256)throw Error('Production helper binding mismatch');
    const registry=JSON.parse(fs.readFileSync(path.join(root,'trial/registry-input.json')));
    const lock=fs.readFileSync(path.join(root,'trial/package-lock.json'));
    if(registry.lockSha256!==hash(lock))throw Error('Registry lock mismatch');
    for(const item of registry.packages)for(const file of item.files){const value=actual.get('electronapp/enhanced/native-media/node_modules/'+item.name+'/'+file.path);if(!value||value.size!==file.size||value.sha256!==file.sha256)throw Error('Pinned FFI file mismatch');}
    let ffiLoaded=false;
    if(options.loadNative!==false) {
        if(process.platform!=='win32'||process.arch!=='x64'||process.versions.electron!=='44.4.2')throw Error('Pinned Windows Electron required for selfcheck');
        const directory=path.join(root,'electronapp/enhanced/native-media'),koffi=require(path.join(directory,'node_modules/koffi'));
        if(require(path.join(directory,'node_modules/koffi/package.json')).version!=='3.3.3')throw Error('Koffi version mismatch');
        const pid=koffi.load('kernel32.dll').func('uint32_t GetCurrentProcessId()')();if(!pid)throw Error('FFI selfcheck failed');
        require(path.join(directory,'dwm.cjs')).createDwm(koffi);require(path.join(directory,'winrt.cjs')).createBindings(koffi);ffiLoaded=true;
    }
    return {status:'passed',sourceCommit:expectedCommit,files:actual.size,standardPayloadUnchanged:true,defaultEnabled:false,ffiLoaded,windowsVisibleAcceptance:'NOT_ASSESSED'};
}
module.exports={verify,inventory,difference};
if(require.main===module){try{console.log(JSON.stringify(verify(path.resolve(__dirname,'..'),process.argv[2])));}catch(error){console.error(JSON.stringify({error:error.code||'TRIAL_SELFCHECK_FAILED',message:error.message,details:error.details||null}));process.exitCode=1;}}
