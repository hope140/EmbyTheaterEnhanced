'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const web = require('./web-snapshot-input.cjs');
const MANIFEST_PATH = 'vendor/small-runtime-manifest.json';
const INPUT_ROOT = 'vendor/small-runtime/snapshot-v1';
const SMALL_PATHS=Object.freeze(['cec-driver/cancel','config/system.xml','electronapp/plugins/mpvplayer/strings/zh-CN.json','\u6ce8\u610f\u4e8b\u9879.txt']);
const isSmallRuntime=name=>SMALL_PATHS.includes(name);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function relative(name) {
    if (typeof name !== 'string' || !name || /[\\:\x00-\x1f\x7f]/.test(name) ||
        name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid Small runtime snapshot component path.');
    return name;
}
function physical(file, directory) {
    const absolute=path.resolve(file),normalize=x=>process.platform==='win32'?x.toLowerCase():x;
    let cursor=path.parse(absolute).root;
    for(const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)) {
        cursor=path.join(cursor,part);
        if(fs.lstatSync(cursor).isSymbolicLink()||normalize(fs.realpathSync.native(cursor))!==normalize(cursor)) throw new Error('Small runtime snapshot links or redirects are forbidden.');
    }
    const stat=fs.lstatSync(absolute);
    if(directory?!stat.isDirectory():!stat.isFile())throw new Error('Unexpected Small runtime snapshot component file type.');
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
    if(manifest.schemaVersion!==1||manifest.version!=='snapshot-v1'||manifest.inputRoot!==INPUT_ROOT||
        !Array.isArray(manifest.files)||manifest.files.length!==SMALL_PATHS.length||manifest.fileCount!==manifest.files.length)throw new Error('Invalid Small runtime snapshot component manifest.');
    const seen=new Set();
    for(const entry of manifest.files) {
        relative(entry.path);
        if(!isSmallRuntime(entry.path)||seen.has(entry.path.toLowerCase())||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256||'')) throw new Error('Invalid Small runtime snapshot component identity.');
        seen.add(entry.path.toLowerCase());
    }
    if(manifest.bytes!==manifest.files.reduce((n,f)=>n+f.size,0)||manifest.treeSha256!==web.treeHash(manifest.files))throw new Error('Small runtime snapshot component summary mismatch.');
    if(manifest.provenance?.mode!=='local-small-runtime-snapshot')throw new Error('Invalid small-runtime snapshot origin.');
    return manifest;
}
function paths(root) {return load(root).files.map(entry=>entry.path);}
function validate(rootArg) {
    const root=path.resolve(rootArg),manifest=load(root);
    web.verifyTree(path.join(root,INPUT_ROOT),manifest.files);
    return {status:'passed',manifestPath:MANIFEST_PATH,manifestSha256:sha(fs.readFileSync(path.join(root,MANIFEST_PATH))),
        version:manifest.version,provenance:manifest.provenance,fileCount:manifest.fileCount,bytes:manifest.bytes,treeSha256:manifest.treeSha256};
}
function importSnapshot(rootArg,sourceArg) {
    const root=path.resolve(rootArg),manifest=load(root),source=path.resolve(sourceArg);physical(source,true);
    const buffers=manifest.files.map(entry=>{const file=path.join(source,entry.path);physical(file,false);const bytes=fs.readFileSync(file);
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Small runtime import identity mismatch: '+entry.path);return{entry,bytes};});
    const destination=path.join(root,INPUT_ROOT);if(fs.existsSync(destination))return validate(root);
    for(const {entry,bytes} of buffers){const target=path.join(destination,entry.path);mkdirPhysical(path.dirname(target));fs.writeFileSync(target,bytes,{flag:'wx'});}return validate(root);
}
function validateRuntime(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),report=validate(root),manifest=load(root);
    for(const entry of manifest.files) {
        const file=path.join(runtime,entry.path);physical(file,false);const bytes=fs.readFileSync(file);
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Small runtime snapshot runtime identity mismatch: '+entry.path);
    }
    return {...report,runtimeFiles:manifest.files.map(({path,size,sha256})=>({path,size,sha256}))};
}
function assemble(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),rel=path.relative(path.join(root,'dist'),runtime);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('Small runtime snapshot assembly requires dedicated dist output.');
    const report=validate(root),manifest=load(root);
    for(const entry of manifest.files) if(fs.existsSync(path.join(runtime,entry.path)))throw new Error('Small runtime snapshot output already exists: '+entry.path);
    for(const entry of manifest.files) {
        const bytes=fs.readFileSync(path.join(root,INPUT_ROOT,entry.path));
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Small runtime snapshot input changed during assembly.');
        const target=path.join(runtime,entry.path);mkdirPhysical(path.dirname(target));fs.writeFileSync(target,bytes,{flag:'wx'});
    }
    return report;
}
if(require.main===module) {
    try {
        const [command,root,argument]=process.argv.slice(2);let result;
        if(command==='metadata'&&root&&!argument)result=load(root);
        else if(command==='validate'&&root&&!argument)result=validate(root);
        else if(command==='import'&&root&&argument)result=importSnapshot(root,argument);
        else if(command==='assemble'&&root&&argument)result=assemble(root,argument);
        else if(command==='validate-runtime'&&root&&argument)result=validateRuntime(root,argument);
        else throw new Error('Usage: small-runtime-input.cjs <metadata|validate> <root> | <import|assemble|validate-runtime> <root> <path>');
        process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={SMALL_PATHS,MANIFEST_PATH,INPUT_ROOT,isSmallRuntime,load,paths,validate,importSnapshot,validateRuntime,assemble};
