'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const web = require('./web-snapshot-input.cjs');
const MANIFEST_PATH = 'vendor/windows-host-manifest.json';
const INPUT_ROOT = 'vendor/windows-host/3.0.20';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
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
function validateRuntime(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),report=validate(root),manifest=load(root);
    for(const entry of manifest.files) {
        const file=path.join(runtime,entry.path);physical(file,false);const bytes=fs.readFileSync(file);
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Windows Host runtime identity mismatch: '+entry.path);
    }
    return {...report,runtimeFiles:manifest.files.map(({path,size,sha256})=>({path,size,sha256}))};
}
function assemble(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),rel=path.relative(path.join(root,'dist'),runtime);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('Windows Host assembly requires dedicated dist output.');
    const report=validate(root),manifest=load(root);
    for(const entry of manifest.files) if(fs.existsSync(path.join(runtime,entry.path)))throw new Error('Windows Host output already exists: '+entry.path);
    for(const entry of manifest.files) {
        const bytes=fs.readFileSync(path.join(root,INPUT_ROOT,entry.path));
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Windows Host input changed during assembly.');
        const target=path.join(runtime,entry.path);mkdirPhysical(path.dirname(target));fs.writeFileSync(target,bytes,{flag:'wx'});
    }
    return report;
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
module.exports={MANIFEST_PATH,INPUT_ROOT,load,paths,validate,validateArchive,validateRuntime,assemble};
