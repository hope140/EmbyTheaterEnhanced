'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const web = require('./web-snapshot-input.cjs');
const MANIFEST_PATH = 'vendor/windows-host-manifest.json';
const INPUT_ROOT = 'vendor/windows-host/3.0.20';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Test-candidate projection only: preserve the complete official input tree.
const PRIVATE_CONFIGURATION = Object.freeze({path:'System.Configuration.dll',size:93200,
    sha256:'3dba0c61e075728780723d7e517f6276674e29f6e9d5942c0b95a240f1e8f1bf'});
const RETIRED_CEC = Object.freeze([
    {
        "path": "cec/cec-client.exe",
        "size": 89536,
        "sha256": "42f601278f82c37d0cc26460d4ac80e62f6cec5b84b2efb0ee8ed75c1cbc4519",
        "sourceArchiveMember": "cec/cec-client.exe",
        "sourceEvidence": "byte-identical member of official Windows 3.0.20 release; matches former frozen input",
        "licenseEvidence": "Component-specific source and notice completeness remains separate; see docs/WINDOWS_HOST_INPUT.md"
    },
    {
        "path": "cec/cec-client.x64.exe",
        "size": 89536,
        "sha256": "42f601278f82c37d0cc26460d4ac80e62f6cec5b84b2efb0ee8ed75c1cbc4519",
        "sourceArchiveMember": "cec/cec-client.x64.exe",
        "sourceEvidence": "byte-identical member of official Windows 3.0.20 release; matches former frozen input",
        "licenseEvidence": "Component-specific source and notice completeness remains separate; see docs/WINDOWS_HOST_INPUT.md"
    },
    {
        "path": "cec/cec.dll",
        "size": 325568,
        "sha256": "6e2932ab53f4d05d5f815499786a48c3ccb8a60c527aa2f34e4abbf14dc66d04",
        "sourceArchiveMember": "cec/cec.dll",
        "sourceEvidence": "byte-identical member of official Windows 3.0.20 release; matches former frozen input",
        "licenseEvidence": "Component-specific source and notice completeness remains separate; see docs/WINDOWS_HOST_INPUT.md"
    },
    {
        "path": "cec/cec.x64.dll",
        "size": 325568,
        "sha256": "6e2932ab53f4d05d5f815499786a48c3ccb8a60c527aa2f34e4abbf14dc66d04",
        "sourceArchiveMember": "cec/cec.x64.dll",
        "sourceEvidence": "byte-identical member of official Windows 3.0.20 release; matches former frozen input",
        "licenseEvidence": "Component-specific source and notice completeness remains separate; see docs/WINDOWS_HOST_INPUT.md"
    },
    {
        "path": "cec/p8-usbcec-driver-installer.exe",
        "size": 619536,
        "sha256": "6e4d5a091720cf5ad727896bbf3766e5529468e24849183439506130bde3546a",
        "sourceArchiveMember": "cec/p8-usbcec-driver-installer.exe",
        "sourceEvidence": "byte-identical member of official Windows 3.0.20 release; matches former frozen input",
        "licenseEvidence": "Component-specific source and notice completeness remains separate; see docs/WINDOWS_HOST_INPUT.md"
    }
].map(entry => Object.freeze(entry)));
const RETIRED_SERIALIZATION = Object.freeze([
    {
        "path": "ServiceStack.Text.dll",
        "size": 411648,
        "sha256": "2cc4fc93be82d4818dc81beb9f5cd0e4f995c77e1725c129e4918e8aeaeb39c1"
    },
    {
        "path": "ServiceStack.Text.xml",
        "size": 88835,
        "sha256": "19b2a3730eb32f402888a58df9c6704cde19c0e38138dbad4fef000750669c0d"
    },
    {
        "path": "SharpCompress.dll",
        "size": 420864,
        "sha256": "3c34138417974ce215e5d1b5bdbb7abd578ce77420073ea9de3f46ccebe42b55"
    }
].map(entry => Object.freeze(entry)));
const EXCLUDED_FILES = Object.freeze([PRIVATE_CONFIGURATION, ...RETIRED_CEC, ...RETIRED_SERIALIZATION]);
function runtimeSelection(manifest) {
    const excludedFiles=manifest.files.filter(entry=>EXCLUDED_FILES.some(item=>item.path.toLowerCase()===entry.path.toLowerCase()));
    for(const entry of excludedFiles) {
        const expected=EXCLUDED_FILES.find(item=>item.path.toLowerCase()===entry.path.toLowerCase());
        if(entry.path!==expected.path||entry.size!==expected.size||entry.sha256!==expected.sha256) throw new Error('Windows Host test projection identity mismatch: '+entry.path);
    }
    const files=manifest.files.filter(entry=>!excludedFiles.includes(entry));
    return {runtimeFileCount:files.length,runtimeBytes:files.reduce((n,entry)=>n+entry.size,0),
        runtimeTreeSha256:web.treeHash(files),excludedFiles:excludedFiles.map(({path,size,sha256})=>({path,size,sha256}))};
}
function runtimeFiles(manifest) {
    const selection=runtimeSelection(manifest),excluded=new Set(selection.excludedFiles.map(entry=>entry.path));
    return manifest.files.filter(entry=>!excluded.has(entry.path));
}
function rejectExcludedOutput(runtime) {
    if(!fs.existsSync(runtime))return;
    physical(runtime,true);
    for(const entry of EXCLUDED_FILES) {
        let directory=runtime;
        const parts=entry.path.split('/');
        for(let i=0;i<parts.length;i++) {
            const names=fs.readdirSync(directory),aliases=names.filter(name=>name.toLowerCase()===parts[i].toLowerCase());
            if(!aliases.length)break;
            if(aliases.length!==1||i===parts.length-1) throw new Error('Excluded Windows Host test resource present in runtime: '+entry.path);
            directory=path.join(directory,aliases[0]);physical(directory,true);
        }
    }
}
function relative(name) {
    if (typeof name !== 'string' || !name || /[\\:\x00-\x1f\x7f]/.test(name) ||
        name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid Windows Host component path.');
    return name;
}
function physical(file, directory) {
    const absolute=path.resolve(file),normalize=x=>process.platform==='win32'?x.toLowerCase():x;
    let cursor=path.parse(absolute).root;
    for(const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)) {
        cursor=path.join(cursor,part);
        if(fs.lstatSync(cursor).isSymbolicLink()||normalize(fs.realpathSync.native(cursor))!==normalize(cursor)) throw new Error('Windows Host links or redirects are forbidden.');
    }
    const stat=fs.lstatSync(absolute);
    if(directory?!stat.isDirectory():!stat.isFile())throw new Error('Unexpected Windows Host component file type.');
}
function mkdirPhysical(directory) {
    const absolute=path.resolve(directory);let cursor=path.parse(absolute).root;
    for(const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)) {
        cursor=path.join(cursor,part);if(!fs.existsSync(cursor))fs.mkdirSync(cursor);physical(cursor,true);
    }
}
function load(rootArg) {
    const root=path.resolve(rootArg),file=path.join(root,MANIFEST_PATH);physical(file,false);
    const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
    if(manifest.schemaVersion!==1||manifest.version!=='3.0.20'||manifest.inputRoot!==INPUT_ROOT||
        !Array.isArray(manifest.files)||!manifest.files.length||manifest.fileCount!==manifest.files.length)throw new Error('Invalid Windows Host component manifest.');
    const seen=new Set();
    for(const entry of manifest.files) {
        relative(entry.path);
        if(entry.path.toLowerCase()==='mediabrowser.model.dll'||seen.has(entry.path.toLowerCase())||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256||'')) throw new Error('Invalid Windows Host component identity.');
        seen.add(entry.path.toLowerCase());
    }
    if(manifest.bytes!==manifest.files.reduce((n,f)=>n+f.size,0)||manifest.treeSha256!==web.treeHash(manifest.files))throw new Error('Windows Host component summary mismatch.');
    if(!manifest.archive||!/^[a-f0-9]{64}$/.test(manifest.archive.sha256||'')||!Number.isSafeInteger(manifest.archive.size)||manifest.archive.size<=0)throw new Error('Invalid Windows Host archive identity.');
    return manifest;
}
function paths(root) {return load(root).files.map(entry=>entry.path);}
function validate(rootArg) {
    const root=path.resolve(rootArg),manifest=load(root);
    web.verifyTree(path.join(root,INPUT_ROOT),manifest.files);
    return {status:'passed',manifestPath:MANIFEST_PATH,manifestSha256:sha(fs.readFileSync(path.join(root,MANIFEST_PATH))),
        version:manifest.version,sourceUrl:manifest.archive.sourceUrl,fileCount:manifest.fileCount,bytes:manifest.bytes,treeSha256:manifest.treeSha256};
}
function validateArchive(rootArg,archiveArg) {
    const root=path.resolve(rootArg),manifest=load(root),archive=path.resolve(archiveArg);physical(archive,false);
    const bytes=fs.readFileSync(archive);
    if(bytes.length!==manifest.archive.size||sha(bytes)!==manifest.archive.sha256)throw new Error('Windows Host archive identity mismatch.');
    return {status:'passed',archiveSha256:manifest.archive.sha256,archiveBytes:bytes.length};
}
function validateRuntime(rootArg,runtimeArg,producedFiles=[]) {
    if(producedFiles.length && (producedFiles.length!==2||producedFiles.map(f=>f.path).sort().join('|')!=='Emby.Theater.exe|Emby.Theater.pdb'))throw Error('Invalid source-built Host override set.');
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),report=validate(root),manifest=load(root);
    const selection=runtimeSelection(manifest),files=runtimeFiles(manifest).map(entry=>producedFiles.find(f=>f.path===entry.path)||entry);
    rejectExcludedOutput(runtime);
    for(const entry of files) {
        const file=path.join(runtime,entry.path);physical(file,false);const bytes=fs.readFileSync(file);
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Windows Host runtime identity mismatch: '+entry.path);
    }
    return {...report,...selection,runtimeTreeSha256:web.treeHash(files),runtimeBytes:files.reduce((n,f)=>n+f.size,0),runtimeFiles:files.map(({path,size,sha256})=>({path,size,sha256}))};
}
function assemble(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),rel=path.relative(path.join(root,'dist'),runtime);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('Windows Host assembly requires dedicated dist output.');
    const report=validate(root),manifest=load(root),selection=runtimeSelection(manifest),files=runtimeFiles(manifest);
    rejectExcludedOutput(runtime);
    for(const entry of files) if(fs.existsSync(path.join(runtime,entry.path)))throw new Error('Windows Host output already exists: '+entry.path);
    for(const entry of files) {
        const bytes=fs.readFileSync(path.join(root,INPUT_ROOT,entry.path));
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Windows Host input changed during assembly.');
        const target=path.join(runtime,entry.path);mkdirPhysical(path.dirname(target));fs.writeFileSync(target,bytes,{flag:'wx'});
    }
    return {...report,...selection};
}
if(require.main===module) {
    try {
        const [command,root,argument]=process.argv.slice(2);let result;
        if(command==='metadata'&&root&&!argument)result=load(root);
        else if(command==='validate'&&root&&!argument)result=validate(root);
        else if(command==='validate-archive'&&root&&argument)result=validateArchive(root,argument);
        else if(command==='assemble'&&root&&argument)result=assemble(root,argument);
        else if(command==='validate-runtime'&&root&&argument)result=validateRuntime(root,argument);
        else throw new Error('Usage: windows-host-input.cjs <metadata|validate> <root> | <validate-archive|assemble> <root> <path>');
        process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={MANIFEST_PATH,INPUT_ROOT,PRIVATE_CONFIGURATION,RETIRED_CEC,RETIRED_SERIALIZATION,EXCLUDED_FILES,runtimeSelection,runtimeFiles,load,paths,validate,validateArchive,validateRuntime,assemble};
