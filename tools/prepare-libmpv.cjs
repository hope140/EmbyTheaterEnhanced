'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const input=require('./libmpv-input.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function lock(root) {
    const m=input.load(root),a=m.archive;
    if(!a||!/^\d{8}-git-[a-f0-9]{10}$/.test(m.version)||
        !/^[a-f0-9]{40}$/.test(a.sourceCommit||'')||!a.sourceCommit.startsWith(m.version.split('-git-')[1])||
        a.asset!==`mpv-dev-x86_64-${m.version}.7z`||a.member!=='libmpv-2.dll'||
        a.sourceUrl!==`https://sourceforge.net/projects/mpv-player-windows/files/libmpv/${a.asset}/download`||
        !Number.isSafeInteger(a.size)||a.size<6||!/^[a-f0-9]{64}$/.test(a.sha256||''))throw Error('Invalid pinned libmpv archive lock.');
    return {manifest:m,archive:a};
}
function verifyArchive(file,a) {
    input.verifyArchive(file,a);
}
function download(url,destination,size) {
    try {
        return JSON.parse(cp.execFileSync('pwsh',['-NoProfile','-NonInteractive','-File',path.join(__dirname,'download-libmpv.ps1'),
            '-SourceUrl',url,'-Destination',destination,'-MaximumBytes',String(size)],{encoding:'utf8',timeout:330000,maxBuffer:65536,stdio:['ignore','pipe','pipe']}).trim());
    }catch(error){throw Error('Pinned libmpv download failed; no retry/latest fallback. '+String(error.stderr||'Downloader process failed without safe diagnostics.').slice(0,12000));}
}
function extract(file,a,entry) {
    const tar=process.platform==='win32'?'C:\\Windows\\System32\\tar.exe':'bsdtar';
    try {
        const members=cp.execFileSync(tar,['-tf',file],{encoding:'utf8',maxBuffer:1048576}).split(/\r?\n/);
        if(members.filter(x=>x===a.member).length!==1)throw Error('Expected exactly one pinned DLL member.');
        return cp.execFileSync(tar,['-xOf',file,a.member],{maxBuffer:entry.size+65536});
    }catch(error){throw Error('Static libmpv extraction failed; requires trusted libarchive bsdtar (Windows system tar is supported). '+error.message);}
}
function prepare(rootArg,options={}) {
    const root=path.resolve(rootArg),{manifest:m,archive:a}=lock(root);
    const repository=input.validateRepositoryArchive(root,m);
    const component=path.join(root,input.INPUT_ROOT);
    if(fs.existsSync(component))return {...input.validate(root),acquisition:'prepared-cache'};
    let file,acquisition,transport;
    if(repository) {
        file=path.join(root,repository.path);acquisition='repository-archive';
    } else {
        const cache=path.join(root,'.work/libmpv-download');input.mkdirPhysical(cache);
        file=path.join(cache,a.asset);acquisition='archive-cache';
        if(fs.existsSync(file))verifyArchive(file,a);
        else {
            // Legacy fixture/import support is explicit. The CLI never initiates network acquisition.
            if(typeof options.download!=='function')throw Error('Repository libmpv archive is required; network acquisition is disabled.');
            acquisition='download';const partial=file+'.partial-'+crypto.randomUUID();
            try {
                transport=options.download(a.sourceUrl,partial,a.size);
                verifyArchive(partial,a);
                fs.copyFileSync(partial,file,fs.constants.COPYFILE_EXCL);
            }finally{if(fs.existsSync(partial))fs.unlinkSync(partial);}
        }
    }
    verifyArchive(file,a);
    const bytes=(options.extract||extract)(file,a,m.files[0]);
    if(!Buffer.isBuffer(bytes)||bytes.length!==m.files[0].size||sha(bytes)!==m.files[0].sha256)throw Error('Extracted libmpv DLL identity mismatch; no component written.');
    if(repository)input.validateRepositoryArchive(root,m);
    input.mkdirPhysical(component);fs.writeFileSync(path.join(component,'mpv-1.dll'),bytes,{flag:'wx'});
    return {...input.validate(root),acquisition,archive:{asset:a.asset,sha256:a.sha256,size:a.size,sourceCommit:a.sourceCommit,repositoryPath:a.repositoryPath},transport};
}
if(require.main===module){try{if(process.argv.length!==3)throw Error('Usage: node tools/prepare-libmpv.cjs <root>');console.log(JSON.stringify(prepare(process.argv[2]),null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={lock,verifyArchive,prepare};
