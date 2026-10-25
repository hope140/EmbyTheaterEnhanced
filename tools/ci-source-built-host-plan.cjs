'use strict';
// Exact source recovery, kit projection and source-chain checks; no external binary/receipt.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const host = require('./source-built-host-input.cjs');
const verifier = require('./host-verifier-input.cjs');
const {committedInputs, blobObjectId} = require('./build-input-contract.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const COMMIT = '708fadc068cbf66ced6aece4a32f3e12bb2c4e13';
const REPOSITORY = 'https://github.com/MediaBrowser/emby-theater-windows';
const KIT_FILES = Object.freeze(['Build-UnifiedHost.ps1', 'Get-SourceIdentity.ps1', 'New-VerifiedRuntime.ps1',
    'EXPECTED-ASSEMBLY-REFERENCES.json', 'EXPECTED-SOURCE-IDENTITY.json', 'REFERENCES.json', 'VERIFIED-RUNTIME.schema.json']);
const KIT_INPUTS = Object.freeze(['native/windows-host/Apply-SourceChanges.ps1', 'native/windows-host/LICENSE.md',
    'native/windows-host/LICENSE-Helpers-MIT.txt', 'native/windows-host/LICENSE-Newtonsoft-MIT.md',
    'native/windows-host/upstream-source-manifest.json', 'native/windows-host/change-manifest.json',
    'native/windows-host/host-retirement.patch', 'native/windows-host/json-zip-input.json', 'vendor/host-json-manifest.json']);
function safeRelative(p) {
    if (typeof p !== 'string' || !p || /[\\:<>"|?*\x00-\x1f]/.test(p) || p.startsWith('/') ||
        p.split('/').some(s => !s || s === '.' || s === '..' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s))) {
        throw Error('Unsafe Host recovery path.');
    }
    return p;
}
function physical(p) {
    p = path.resolve(p);
    for (let cursor = p;; cursor = path.dirname(cursor)) {
        if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('Host recovery redirects forbidden.');
        if (cursor === path.dirname(cursor)) break;
    }
    if (path.resolve(fs.realpathSync.native(p)).toLowerCase() !== p.toLowerCase()) throw Error('Host recovery redirects forbidden.');
    return p;
}
function bytes(root, relative) {
    const p = physical(path.join(root, safeRelative(relative)));
    if (!fs.lstatSync(p).isFile()) throw Error('Host recovery ordinary input required.');
    return fs.readFileSync(p);
}
function createPlan(root) {
    const upstream = JSON.parse(bytes(root, 'native/windows-host/upstream-source-manifest.json'));
    if (upstream.repository !== REPOSITORY || upstream.commit !== COMMIT || upstream.files.length !== 55) throw Error('Host upstream recovery identity mismatch.');
    const names = new Set();
    for (const f of upstream.files) {
        safeRelative(f.path);
        if (names.has(f.path.toLowerCase()) || !/^[a-f0-9]{40}$/.test(f.gitBlob) || !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size <= 0) throw Error('Host recovery member mismatch.');
        names.add(f.path.toLowerCase());
    }
    const json = require('./host-json-input.cjs').load(root);
    if (json.package.url !== 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.4/newtonsoft.json.13.0.4.nupkg') throw Error('Unexpected Host JSON acquisition URL.');
    const identity = host.sourceIdentity(root);
    const expected = JSON.parse(bytes(root, 'tools/windows-host-build/EXPECTED-SOURCE-IDENTITY.json'));
    if (identity.sha256 !== expected.sha256) throw Error('Runner build kit source identity is stale.');
    return {schemaVersion: 1, repository: REPOSITORY, commit: COMMIT, sourceFiles: upstream.files,
        sourceIdentitySha256: identity.sha256, files: [
            {id: 'newtonsoft', url: json.package.url, name: 'newtonsoft.json.13.0.4.nupkg', sha256: json.package.sha256},
            {id: 'net462', url: 'https://api.nuget.org/v3-flatcontainer/microsoft.netframework.referenceassemblies.net462/1.0.3/microsoft.netframework.referenceassemblies.net462.1.0.3.nupkg',
                name: 'microsoft.netframework.referenceassemblies.net462.1.0.3.nupkg', sha256: 'ee692a845743500910855d4c330ca6e9ef87c16e16f740e4474d187185d66e21'}
        ]};
}
function verifyPackage(root, file, id) {
    const item = createPlan(root).files.find(f => f.id === id);
    if (!item || !fs.lstatSync(physical(file)).isFile() || sha(fs.readFileSync(file)) !== item.sha256) throw Error('Host recovery package identity mismatch.');
    return item;
}
function newDirectory(out) {
    out = path.resolve(out); physical(path.dirname(out));
    if (fs.existsSync(out)) throw Error('Host recovery output must be absent.');
    fs.mkdirSync(out); return out;
}
function write(out, rel, b) {
    const p = path.join(out, safeRelative(rel)); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, b, {flag: 'wx'});
}
function readSourceBuffers(objectStore, plan) {
    physical(objectStore);
    const git = args => cp.execFileSync('git', ['-C', objectStore, ...args], {maxBuffer: 16 * 1024 * 1024});
    if (git(['rev-parse', plan.commit + '^{commit}']).toString('utf8').trim() !== plan.commit) throw Error('Host recovery commit mismatch.');
    const batch = committedInputs(objectStore, plan.commit, plan.sourceFiles.map(f => f.path));
    const buffers = plan.sourceFiles.map(f => {
        // No checkout, autocrlf conversion, hooks, LFS or source archive executables.
        const line = batch ? batch.lines.get(f.path) || '' : git(['ls-tree', plan.commit, '--', f.path]).toString('utf8').trim();
        const entry = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
        if (!entry || entry[2] !== f.gitBlob || entry[3] !== f.path) throw Error('Host recovery Git blob mismatch.');
        const b = batch?.blobs.get(f.path) ?? git(['cat-file', 'blob', f.gitBlob]);
        if (blobObjectId(b) !== f.gitBlob) throw Error('Host recovery Git blob mismatch.');
        if (b.length !== f.size || sha(b) !== f.sha256) throw Error('Host recovery source bytes mismatch: ' + f.path);
        return {f, b};
    });
    return buffers;
}
function restoreSource(root, objectStore, out) {
    const plan = createPlan(root);
    const buffers = readSourceBuffers(objectStore, plan);
    out = newDirectory(out); for (const {f, b} of buffers) write(out, f.path, b);
    return {files: buffers.length, commit: plan.commit};
}
function materializeKit(root, out) {
    const plan = createPlan(root), buffers = KIT_FILES.map(p => ({path: p, bytes: bytes(root, 'tools/windows-host-build/' + p)}))
        .concat(KIT_INPUTS.map(p => ({path: p, bytes: bytes(root, p)})));
    out = newDirectory(out); for (const f of buffers) write(out, f.path, f.bytes);
    const manifest = {schemaVersion: 1, scope: 'cec-update-json-zip-unified', containsJsonZipReplacements: true,
        sourceIdentitySha256: plan.sourceIdentitySha256, files: buffers.map(f => ({path: f.path, size: f.bytes.length, sha256: sha(f.bytes)}))};
    write(out, 'HANDOFF-MANIFEST.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')); return manifest;
}
function verifyCandidateContract(root, candidate) {
    const plan=createPlan(root),read=p=>JSON.parse(bytes(root,p));
    const changes=read('native/windows-host/change-manifest.json');
    const changed=new Map([...changes.changes,...changes.addedSources].map(f=>[f.path,f]));
    const expected=[...plan.sourceFiles.map(f=>changed.has(f.path)?{path:f.path,size:changed.get(f.path).candidateSize,sha256:changed.get(f.path).candidateSHA256}:{path:f.path,size:f.size,sha256:f.sha256}),
        ...changes.addedSources.map(f=>({path:f.path,size:f.candidateSize,sha256:f.candidateSHA256}))];
    const actual=read('tools/windows-host-verifier/expected-candidate-files.json');
    const ordered=rows=>rows.map(f=>({path:f.path,size:f.size,sha256:f.sha256})).sort((a,b)=>a.path.localeCompare(b.path,'en'));
    if(!Array.isArray(actual)||actual.length!==57||JSON.stringify(ordered(actual))!==JSON.stringify(ordered(expected)))throw Error('Builder/verifier candidate57 manifest mismatch.');
    if(candidate)for(const f of actual){const b=bytes(candidate,f.path);if(b.length!==f.size||sha(b)!==f.sha256)throw Error('Verifier candidate bytes mismatch: '+f.path);}
    const identity=host.sourceIdentity(root),declared=read('tools/windows-host-build/EXPECTED-SOURCE-IDENTITY.json');
    if(JSON.stringify(identity)!==JSON.stringify(declared)||read('tools/windows-host-build/VERIFIED-RUNTIME.schema.json').properties.sourceIdentitySha256.const!==identity.sha256)throw Error('Host source identity declarations mismatch.');
    const contract=read('tools/windows-host-verifier/expected-build-contract.json');
    const componentGuard=bytes(root,'tools/windows-host-verifier/Run-Components.ps1').toString('utf8').match(/\$build\.sourceIdentitySha256 -cne '([a-f0-9]{64})'/g)||[];
    if(contract.sourceFingerprint!==identity.sha256||contract.builderSha256!==sha(bytes(root,'tools/windows-host-build/Build-UnifiedHost.ps1'))||contract.referencePackageSha256!==plan.files.find(f=>f.id==='net462').sha256||componentGuard.length!==1||!componentGuard[0].includes(identity.sha256))throw Error('Host verifier build/fingerprint declarations mismatch.');
    const official=read('vendor/windows-host-manifest.json'),model=read('vendor/model-compatibility-manifest.json').files[0],json=read('vendor/host-json-manifest.json').file;
    const references=contract.references;
    if(references.length!==5||new Set(references.map(f=>f.path)).size!==5)throw Error('Host verifier reference set mismatch.');
    for(const f of references){const name=path.posix.basename(f.path),locked=name==='MediaBrowser.Model.dll'?model:name==='Newtonsoft.Json.dll'?json:official.files.find(x=>x.path===name);
        if(!locked||f.path!=='references/'+name||f.size!==locked.size||f.sha256!==locked.sha256)throw Error('Host verifier reference identity mismatch: '+f.path);}
    if(contract.privateConfigSha256!==official.files.find(f=>f.path==='System.Configuration.dll').sha256)throw Error('Host private probe input mismatch.');
    const manifest=read('tools/windows-host-verifier/verifier-manifest.json');
    const members=verifier.FILES.filter(f=>f.path!=='tools/windows-host-verifier/verifier-manifest.json').map(f=>({...f,path:f.path.slice('tools/windows-host-verifier/'.length)}));
    if(JSON.stringify(ordered(manifest.files))!==JSON.stringify(ordered(members)))throw Error('Host verifier inner/outer manifest mismatch.');
    return {candidateFiles:57,sourceIdentitySha256:identity.sha256,builderVerifierAgreement:true};
}
function verifySourceChain(root, source, kit, out) {
    const plan=createPlan(root),changes=JSON.parse(bytes(root,'native/windows-host/change-manifest.json'));
    physical(source);physical(kit);
    const originals=plan.sourceFiles.map(f=>{const b=bytes(source,f.path);if(b.length!==f.size||sha(b)!==f.sha256||blobObjectId(b)!==f.gitBlob)throw Error('Original55 source chain identity mismatch: '+f.path);return {f,b};});
    for(const f of KIT_FILES)if(!bytes(root,'tools/windows-host-build/'+f).equals(bytes(kit,f)))throw Error('Source chain kit differs: '+f);
    for(const f of KIT_INPUTS)if(!bytes(root,f).equals(bytes(kit,f)))throw Error('Source chain kit differs: '+f);
    out=newDirectory(out);
    const inside=cp.spawnSync('git',['-C',out,'rev-parse','--is-inside-work-tree'],{encoding:'utf8'});
    if(inside.status===0)throw Error('Source chain output must be outside a Git worktree, matching the production builder.');
    const patched=path.join(out,'patched'),overlay=path.join(out,'replacements');fs.mkdirSync(patched);
    for(const {f,b}of originals)write(patched,f.path,b);
    const patch=path.join(kit,'native/windows-host/host-retirement.patch');
    const run=(exe,args,cwd)=>cp.execFileSync(exe,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000,maxBuffer:4*1024*1024});
    run('git',['-c','core.autocrlf=false','apply','--check',patch],patched);run('git',['-c','core.autocrlf=false','apply',patch],patched);
    const ps=process.platform==='win32'?'pwsh.exe':'pwsh';
    run(ps,['-NoProfile','-NonInteractive','-File',path.join(root,'native/windows-host/Apply-SourceChanges.ps1'),'-SourceRoot',source,'-DestinationRoot',overlay]);
    const identity=JSON.parse(run(ps,['-NoProfile','-NonInteractive','-File',path.join(kit,'Get-SourceIdentity.ps1'),'-CandidateSourceRoot',patched]));
    const selected=[...plan.sourceFiles.map(f=>f.path),...changes.addedSources.map(f=>f.path)];
    for(const f of selected)if(!bytes(patched,f).equals(bytes(overlay,f)))throw Error('Patch/replacement byte divergence: '+f);
    function names(dir,base=dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('Source chain redirect forbidden.');return e.isDirectory()?names(p,base):[path.relative(base,p).split(path.sep).join('/')];});}
    if(JSON.stringify(names(patched).sort())!==JSON.stringify(selected.sort()))throw Error('Patched57 source file set mismatch.');
    const project=bytes(patched,'Emby.Theater/Emby.Theater.csproj').toString('utf8').replace(/<!--[\s\S]*?-->/g,'');
    if((project.match(/<Compile\s+Include=/g)||[]).length!==46||identity.sha256!==plan.sourceIdentitySha256)throw Error('Source chain compile count/fingerprint mismatch.');
    verifyCandidateContract(root,patched);
    const result={status:'passed',originalFiles:55,candidateFiles:57,compileInputs:46,sourceIdentitySha256:identity.sha256,patchSha256:sha(bytes(root,'native/windows-host/host-retirement.patch')),programSha256:sha(bytes(patched,'Emby.Theater/Program.cs')),byteEquivalentRoutes:true,hostCompiled:false,hostExecuted:false};
    write(out,'source-chain.json',Buffer.from(JSON.stringify(result,null,2)+'\n'));return result;
}
function prepareVerificationInput(root, buildRoot) {
    verifier.validate(root);
    physical(buildRoot);
    const record = JSON.parse(bytes(buildRoot, 'build-receipt.json'));
    if (record.scope !== 'cec-update-json-zip-unified' || record.sourceIdentitySha256 !== host.sourceIdentity(root).sha256) throw Error('Host verification input build scope mismatch.');
    const contract = JSON.parse(bytes(root, 'tools/windows-host-verifier/expected-build-contract.json'));
    const value = bytes(root, 'vendor/windows-host/3.0.20/System.Configuration.dll');
    if (value.length !== 93200 || sha(value) !== contract.privateConfigSha256) throw Error('Private configuration verification input mismatch.');
    const out = newDirectory(path.join(buildRoot, 'verification-inputs'));
    write(out, 'System.Configuration.dll', value);
    return {purpose: 'controlled private-versus-omitted probe only; never product runtime', sha256: sha(value)};
}
// The CLI loads receipt staging, which imports these guards back from this module.
module.exports = {COMMIT, REPOSITORY, KIT_FILES, KIT_INPUTS, safeRelative, physical, createPlan, verifyPackage, readSourceBuffers, restoreSource, materializeKit, verifyCandidateContract, verifySourceChain, prepareVerificationInput};
if (require.main === module) {
    try {
        const [command, root, a, b, c] = process.argv.slice(2);
        let result;
        if (command === 'plan') result = createPlan(root);
        else if (command === 'verify-package') result = verifyPackage(root, a, b);
        else if (command === 'source') result = restoreSource(root, a, b);
        else if (command === 'kit') result = materializeKit(root, a);
        else if (command === 'source-chain') result = verifySourceChain(root, a, b, c);
        else if (command === 'verify-verifier') result = {...verifier.validate(root),...verifyCandidateContract(root)};
        else if (command === 'verification-input') result = prepareVerificationInput(root, a);
        else if (command === 'install-runner') result = require('./runner-host-receipt.cjs').install(root, a);
        else if (command === 'new-work') {
            if (path.resolve(a) !== path.resolve(root, '.work/actions-host-build')) throw Error('Unexpected Host runner work path.');
            result = {path: newDirectory(a)};
        }
        else throw Error('Usage: ci-source-built-host-plan.cjs <plan|verify-package|source|kit|source-chain> root [input] [output/id/kit] [chain-output]');
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (e) { process.stderr.write(e.message + '\n'); process.exitCode = 1; }
}
