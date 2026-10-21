'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const web = require('./web-snapshot-input.cjs');
const cp = require('node:child_process');
const MANIFEST_PATH = 'vendor/inherited-npm-manifest.json';
const INPUT_ROOT = 'vendor/inherited-npm/emby-electron-3.0.20';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function relative(name) {
    if (typeof name !== 'string' || !name || /[\\:\x00-\x1f\x7f]/.test(name) ||
        name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid Inherited npm component path.');
    return name;
}
function physical(file, directory) {
    const absolute=path.resolve(file),normalize=x=>process.platform==='win32'?x.toLowerCase():x;
    let cursor=path.parse(absolute).root;
    for(const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)) {
        cursor=path.join(cursor,part);
        if(fs.lstatSync(cursor).isSymbolicLink()||normalize(fs.realpathSync.native(cursor))!==normalize(cursor)) throw new Error('Inherited npm links or redirects are forbidden.');
    }
    const stat=fs.lstatSync(absolute);
    if(directory?!stat.isDirectory():!stat.isFile())throw new Error('Unexpected Inherited npm component file type.');
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
        !Array.isArray(manifest.files)||!manifest.files.length||manifest.fileCount!==manifest.files.length)throw new Error('Invalid Inherited npm component manifest.');
    const seen=new Set();
    for(const entry of manifest.files) {
        relative(entry.path);
        if(!entry.path.startsWith('electronapp/node_modules/')||seen.has(entry.path.toLowerCase())||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256||'')) throw new Error('Invalid Inherited npm component identity.');
        relative(entry.sourcePath);
        if(entry.sourcePath!==entry.path.slice('electronapp/'.length)||!Number.isSafeInteger(entry.sourceSize)||entry.sourceSize<0||
            !/^[a-f0-9]{64}$/.test(entry.sourceSha256||'')||!/^[a-f0-9]{40}$/.test(entry.sourceGitBlob||'')||
            !['identity','lf-to-crlf'].includes(entry.transform))throw new Error('Invalid inherited npm source identity.');
        seen.add(entry.path.toLowerCase());
    }
    if(manifest.bytes!==manifest.files.reduce((n,f)=>n+f.size,0)||manifest.treeSha256!==web.treeHash(manifest.files))throw new Error('Inherited npm component summary mismatch.');
    if(!manifest.source||manifest.source.repository!=='https://github.com/MediaBrowser/emby-theater-electron'||
        !/^[a-f0-9]{40}$/.test(manifest.source.commit||''))throw new Error('Invalid inherited npm Git source identity.');
    return manifest;
}
function paths(root) {return load(root).files.map(entry=>entry.path);}
function validate(rootArg) {
    const root=path.resolve(rootArg),manifest=load(root);
    web.verifyTree(path.join(root,INPUT_ROOT),manifest.files);
    return {status:'passed',manifestPath:MANIFEST_PATH,manifestSha256:sha(fs.readFileSync(path.join(root,MANIFEST_PATH))),
        version:manifest.version,source:manifest.source,fileCount:manifest.fileCount,bytes:manifest.bytes,treeSha256:manifest.treeSha256};
}
function transform(bytes, mode) {
    if(mode==='identity')return bytes;
    if(mode!=='lf-to-crlf'||!Buffer.from(bytes.toString('utf8')).equals(bytes)||bytes.includes(0))throw new Error('Invalid inherited npm text transform.');
    return Buffer.from(bytes.toString('utf8').replace(/(?<!\r)\n/g,'\r\n'),'utf8');
}
function prepare(rootArg, repositoryArg) {
    const root=path.resolve(rootArg),manifest=load(root),repository=path.resolve(repositoryArg);physical(repository,true);
    let actual;try{actual=cp.execFileSync('git',['-C',repository,'rev-parse','--verify',manifest.source.commit+'^{commit}'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
    catch{throw new Error('Pinned official Git commit is unavailable.');}
    if(actual!==manifest.source.commit)throw new Error('Official Git commit identity mismatch.');
    const buffers=manifest.files.map(entry=>{
        let bytes;try{bytes=cp.execFileSync('git',['-C',repository,'cat-file','blob',manifest.source.commit+':'+entry.sourcePath],{stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024});}
        catch{throw new Error('Pinned official source blob is unavailable.');}
        const blob=crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
        if(bytes.length!==entry.sourceSize||sha(bytes)!==entry.sourceSha256||blob!==entry.sourceGitBlob)throw new Error('Inherited npm source blob identity mismatch.');
        const output=transform(bytes,entry.transform);
        if(output.length!==entry.size||sha(output)!==entry.sha256)throw new Error('Inherited npm transformed identity mismatch.');
        return {entry,output};
    });
    const destination=path.join(root,INPUT_ROOT);
    if(fs.existsSync(destination))return validate(root);
    // All source blobs and transformed bytes are verified before the first write.
    for(const {entry,output} of buffers){const target=path.join(destination,entry.path);mkdirPhysical(path.dirname(target));fs.writeFileSync(target,output,{flag:'wx'});}
    return validate(root);
}
function validateRuntime(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),report=validate(root),manifest=load(root);
    for(const entry of manifest.files) {
        const file=path.join(runtime,entry.path);physical(file,false);const bytes=fs.readFileSync(file);
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Inherited npm runtime identity mismatch: '+entry.path);
    }
    return {...report,runtimeFiles:manifest.files.map(({path,size,sha256})=>({path,size,sha256}))};
}
function assemble(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),rel=path.relative(path.join(root,'dist'),runtime);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('Inherited npm assembly requires dedicated dist output.');
    const report=validate(root),manifest=load(root);
    for(const entry of manifest.files) if(fs.existsSync(path.join(runtime,entry.path)))throw new Error('Inherited npm output already exists: '+entry.path);
    for(const entry of manifest.files) {
        const bytes=fs.readFileSync(path.join(root,INPUT_ROOT,entry.path));
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Inherited npm input changed during assembly.');
        const target=path.join(runtime,entry.path);mkdirPhysical(path.dirname(target));fs.writeFileSync(target,bytes,{flag:'wx'});
    }
    return report;
}
if(require.main===module) {
    try {
        const [command,root,argument]=process.argv.slice(2);let result;
        if(command==='metadata'&&root&&!argument)result=load(root);
        else if(command==='validate'&&root&&!argument)result=validate(root);
        else if(command==='prepare'&&root&&argument)result=prepare(root,argument);
        else if(command==='assemble'&&root&&argument)result=assemble(root,argument);
        else if(command==='validate-runtime'&&root&&argument)result=validateRuntime(root,argument);
        else throw new Error('Usage: inherited-npm-input.cjs <metadata|validate> <root> | <prepare|assemble|validate-runtime> <root> <path>');
        process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={MANIFEST_PATH,INPUT_ROOT,load,paths,validate,prepare,transform,validateRuntime,assemble};
