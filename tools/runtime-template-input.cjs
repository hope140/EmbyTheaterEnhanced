'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MANIFEST_PATH='vendor/runtime-templates-manifest.json',SOURCE_ROOT='tools/templates/runtime';
const FILES=Object.freeze({
    'electronapp/package.json':{kind:'package',sourcePath:SOURCE_ROOT+'/package.json'},
    'electronapp/preload.js':{kind:'preload',sourcePath:SOURCE_ROOT+'/preload.js'},
    'Emby.Theater.exe.config':{kind:'host-config',sourcePath:SOURCE_ROOT+'/Emby.Theater.exe.config'}
});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function physical(file,directory){const absolute=path.resolve(file),normalize=x=>process.platform==='win32'?x.toLowerCase():x;let cursor=path.parse(absolute).root;
    for(const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if(fs.lstatSync(cursor).isSymbolicLink()||normalize(fs.realpathSync.native(cursor))!==normalize(cursor))throw Error('Runtime template links or redirects are forbidden.');}
    const stat=fs.lstatSync(absolute);if(directory?!stat.isDirectory():!stat.isFile())throw Error('Unexpected runtime template file type.');
}
function load(root){const file=path.join(root,MANIFEST_PATH);physical(file,false);const m=JSON.parse(fs.readFileSync(file,'utf8'));
    if(m.schemaVersion!==1||m.sourceRoot!==SOURCE_ROOT||m.fileCount!==3||!Array.isArray(m.files)||m.files.length!==3)throw Error('Invalid runtime template manifest.');
    const seen=new Set();for(const e of m.files){const definition=FILES[e.runtimePath];if(!definition||e.kind!==definition.kind||e.sourcePath!==definition.sourcePath||seen.has(e.runtimePath)||
        !['identity','lf-to-crlf'].includes(e.transform)||![e.size,e.sourceSize].every(n=>Number.isSafeInteger(n)&&n>=0)||![e.sha256,e.sourceSha256].every(s=>/^[a-f0-9]{64}$/.test(s||'')))throw Error('Invalid runtime template identity.');seen.add(e.runtimePath);}
    if(m.bytes!==m.files.reduce((n,e)=>n+e.size,0))throw Error('Runtime template size summary mismatch.');return m;
}
function produce(rootArg){const root=path.resolve(rootArg),m=load(root),directory=path.join(root,SOURCE_ROOT);physical(directory,true);
    const names=fs.readdirSync(directory);if(names.length!==3||names.some(n=>!m.files.some(e=>path.basename(e.sourcePath)===n)))throw Error('Unexpected runtime template source file.');
    return m.files.map(entry=>{const file=path.join(root,entry.sourcePath);physical(file,false);const raw=fs.readFileSync(file),text=raw.toString('utf8');
        if(!Buffer.from(text).equals(raw)||text.includes('\0')||/\r(?!\n)/.test(text))throw Error('Invalid runtime template text.');
        const sourceBytes=Buffer.from(text.replace(/\r\n/g,'\n'));
        if(sourceBytes.length!==entry.sourceSize||sha(sourceBytes)!==entry.sourceSha256)throw Error('Runtime template source identity mismatch.');
        const bytes=entry.transform==='identity'?sourceBytes:Buffer.from(sourceBytes.toString('utf8').replace(/\n/g,'\r\n'));
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw Error('Runtime template generated identity mismatch.');return{...entry,sourceBytes,bytes};
    });
}
function read(root,runtimePath){const result=produce(root).find(e=>e.runtimePath===runtimePath);if(!result)throw Error('Unknown runtime template.');return result;}
function validate(root){const files=produce(root);return{status:'passed',manifestPath:MANIFEST_PATH,manifestSha256:sha(fs.readFileSync(path.join(root,MANIFEST_PATH))),fileCount:3,bytes:files.reduce((n,e)=>n+e.size,0),files:files.map(({sourceBytes,bytes,...e})=>e)};}
function assemble(rootArg,runtimeArg){const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),rel=path.relative(path.join(root,'dist'),runtime);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw Error('Runtime templates require dedicated dist output.');
    const entry=read(root,'electronapp/package.json'),target=path.join(runtime,entry.runtimePath);if(fs.existsSync(target))throw Error('Runtime template output already exists.');
    let cursor=path.parse(target).root;for(const part of path.relative(cursor,path.dirname(target)).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if(!fs.existsSync(cursor))fs.mkdirSync(cursor);physical(cursor,true);}fs.writeFileSync(target,entry.bytes,{flag:'wx'});return validate(root);
}
if(require.main===module){try{const [command,root]=process.argv.slice(2);if(command!=='validate'||!root)throw Error('Usage: runtime-template-input.cjs validate <root>');process.stdout.write(JSON.stringify(validate(root),null,2)+'\n');}catch(e){process.stderr.write(e.message+'\n');process.exitCode=1;}}
module.exports={MANIFEST_PATH,SOURCE_ROOT,FILES,load,produce,read,validate,assemble};
