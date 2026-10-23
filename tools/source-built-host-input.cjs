'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const ownership=require('./runtime-dependency-contract.cjs');
const tracked=require('./tracked-file-hash.cjs');
const LOCK_PATH='native/windows-host/verified-runtime.json';
const INPUT_ROOT='vendor/source-built-host/snapshot-v1';
const SOURCE_MANIFEST='native/windows-host/change-manifest.json';
const OUTPUTS=Object.freeze(['Emby.Theater.exe','Emby.Theater.pdb']);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function physical(file,directory=false) {
    const full=path.resolve(file),normalize=x=>process.platform==='win32'?x.toLowerCase():x;
    let cursor=path.parse(full).root;
    for(const part of path.relative(cursor,full).split(path.sep).filter(Boolean)) {
        cursor=path.join(cursor,part);
        if(fs.lstatSync(cursor).isSymbolicLink()||normalize(fs.realpathSync.native(cursor))!==normalize(cursor))throw Error('Source-built Host redirects forbidden.');
    }
    const s=fs.lstatSync(full);if(directory?!s.isDirectory():!s.isFile())throw Error('Source-built Host ordinary file required.');
}
function selected(root) {return fs.existsSync(path.join(root,SOURCE_MANIFEST));}
function sourceIdentity(root) {
    const manifest=JSON.parse(fs.readFileSync(path.join(root,SOURCE_MANIFEST),'utf8'));
    if(manifest.upstreamCommit!=='708fadc068cbf66ced6aece4a32f3e12bb2c4e13'||manifest.compileInputCount!==46||manifest.changes.length!==6||manifest.addedSources.length!==2||manifest.candidateSourceFileCount!==57)throw Error('Source-built Host source contract mismatch.');
    const paths=['native/windows-host/upstream-source-manifest.json','native/windows-host/host-retirement.patch','native/windows-host/Apply-SourceChanges.ps1',SOURCE_MANIFEST,'vendor/host-json-manifest.json'];
    for(const c of [...manifest.changes,...manifest.addedSources]) {
        if(!/^Emby\.Theater\/(?:App\/|Serialization\/|Archiving\/)?[A-Za-z.]+\.(?:cs|csproj)$/.test(c.path))throw Error('Source-built Host source path mismatch.');
        const p='native/windows-host/changes/'+c.path;if(paths.includes(p))throw Error('Source-built Host duplicate source path.');physical(path.join(root,p));const b=fs.readFileSync(path.join(root,p));
        if(b.length!==c.candidateSize||sha(b)!==c.candidateSHA256)throw Error('Source-built Host modified source identity mismatch.');paths.push(p);
    }
    const files=paths.sort().map(p=>{physical(path.join(root,p));return {path:p,sha256:sha(fs.readFileSync(path.join(root,p)))}});
    return {upstreamCommit:manifest.upstreamCommit,compileInputCount:46,files,sha256:sha(Buffer.from(files.map(f=>f.path+'\0'+f.sha256+'\n').join('')))};
}
function load(rootArg) {
    const root=path.resolve(rootArg),file=path.join(root,LOCK_PATH);
    const runner = require('./runner-host-receipt.cjs');
    if(fs.existsSync(path.join(root,runner.LOCK_PATH))) {
        if(fs.existsSync(file))throw Error('Ambiguous committed and runner-generated Host locks.');
        return {...runner.load(root),sourceIdentity:sourceIdentity(root)};
    }
    if(!fs.existsSync(file))throw Error('Verified source-built Host lock missing; compile and verify this runner output or restore accepted source-built artifacts. Official Host fallback is forbidden.');
    physical(file);tracked.hashTrackedTextFile(root,LOCK_PATH);const lock=JSON.parse(fs.readFileSync(file,'utf8')),identity=sourceIdentity(root);
    if(lock.schemaVersion!==1||lock.mode!=='source-built-host'||lock.sourceIdentitySha256!==identity.sha256||lock.framework!=='net462'||lock.platform!=='x86'||!Array.isArray(lock.files)||lock.files.length!==2||
        !/^[a-f0-9]{64}$/.test(lock.toolchainSnapshotSha256||'')||!/^[a-f0-9]{64}$/.test(lock.buildReceiptSha256||''))throw Error('Source-built Host verified lock mismatch.');
    const model=require('./model-compatibility-input.cjs').load(root);
    if(lock.modelSha256!==model.files[0].sha256)throw Error('Source-built Host Model identity mismatch.');
    for(let i=0;i<OUTPUTS.length;i++) {
        const f=lock.files[i];if(f.path!==OUTPUTS[i]||!Number.isSafeInteger(f.size)||f.size<=0||!/^[a-f0-9]{64}$/.test(f.sha256||''))throw Error('Source-built Host output identity mismatch.');
    }
    const official=require('./windows-host-input.cjs').load(root);
    if(lock.files.some(f=>official.files.some(o=>o.path===f.path&&o.sha256===f.sha256)))throw Error('Source-built Host may not reuse official Host binary or stale PDB.');
    return {...lock,sourceIdentity:identity};
}
function validatePrepared(rootArg) {
    const root=path.resolve(rootArg),lock=load(root);physical(path.join(root,INPUT_ROOT),true);
    if(fs.readdirSync(path.join(root,INPUT_ROOT)).sort().join('|')!==[...OUTPUTS].sort().join('|'))throw Error('Source-built Host prepared file set mismatch.');
    for(const f of lock.files){const p=path.join(root,INPUT_ROOT,f.path);physical(p);const b=fs.readFileSync(p);if(b.length!==f.size||sha(b)!==f.sha256)throw Error('Source-built Host prepared identity mismatch.');}
    require('./host-json-input.cjs').validatePrepared(root);return lock;
}
function stage(rootArg,runtimeArg,sourceCommit,token) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),relative=path.relative(path.join(root,'dist'),runtime);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Source-built Host needs dedicated dist output.');
    ownership.assertRepoLayout(root,runtime);const owner=ownership.loadOwner(root,runtime,token);
    const head=cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if(sourceCommit!==head||owner.sourceCommit!==sourceCommit)throw Error('Source-built Host ownership/source commit mismatch.');
    const lock=validatePrepared(root),official=require('./windows-host-input.cjs').load(root);
    const buffers=lock.files.map(f=>{const file=path.join(root,INPUT_ROOT,f.path);physical(file);const b=fs.readFileSync(file);if(b.length!==f.size||sha(b)!==f.sha256)throw Error('Source-built Host input changed during replacement.');return {f,b};});
    for(const {f}of buffers){const p=path.join(runtime,f.path);physical(p);const old=official.files.find(o=>o.path===f.path),b=fs.readFileSync(p);if(!old||b.length!==old.size||sha(b)!==old.sha256)throw Error('Source-built Host replacement target is not the original fresh assembly.');}
    const json=require('./host-json-input.cjs'),jsonBytes=json.preflightStage(root,runtime);
    for(const {f,b}of buffers)fs.writeFileSync(path.join(runtime,f.path),b);
    json.stage(root,runtime,jsonBytes);return validateRuntime(root,runtime);
}
function validateRuntime(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),lock=load(root);
    for(const f of lock.files){const p=path.join(runtime,f.path);physical(p);const b=fs.readFileSync(p);if(b.length!==f.size||sha(b)!==f.sha256)throw Error('Source-built Host runtime identity mismatch.');}
    const manifestPath=lock.runnerProvenance?require('./runner-host-receipt.cjs').LOCK_PATH:LOCK_PATH;
    return {mode:lock.mode,manifestPath,manifestSha256:lock.runnerProvenance?sha(fs.readFileSync(path.join(root,manifestPath))):tracked.hashTrackedTextFile(root,LOCK_PATH),sourceIdentity:lock.sourceIdentity,
        ...(lock.runnerProvenance?{runnerProvenance:lock.runnerProvenance,verificationReceiptSha256:lock.verificationReceiptSha256}:{}),
        framework:lock.framework,platform:lock.platform,modelSha256:lock.modelSha256,newtonsoft:require('./host-json-input.cjs').validateRuntime(root,runtime),toolchainSnapshotSha256:lock.toolchainSnapshotSha256,buildReceiptSha256:lock.buildReceiptSha256,files:lock.files};
}
// Runner receipt validation calls back into sourceIdentity during these CLI actions.
module.exports={LOCK_PATH,INPUT_ROOT,OUTPUTS,SOURCE_MANIFEST,selected,sourceIdentity,load,validatePrepared,stage,validateRuntime};
if(require.main===module){try{const [command,root,arg,sourceCommit,token]=process.argv.slice(2);let value;if(command==='identity')value=sourceIdentity(root);else if(command==='preflight')value=validatePrepared(root);else if(command==='stage')value=stage(root,arg,sourceCommit,token);else throw Error('Usage: source-built-host-input.cjs <identity|preflight> root | stage root runtime sourceCommit ownerToken');process.stdout.write(JSON.stringify(value,null,2)+'\n');}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
