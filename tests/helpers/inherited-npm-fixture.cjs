'use strict';
// Synthetic component fixture. Preparation from actual Git objects is tested separately.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=require('../../tools/inherited-npm-input.cjs'),web=require('../../tools/web-snapshot-input.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function create(root,entries){
    let files=entries;
    if(!files){const base=path.join(root,'vendor/carnival/electronapp');
        const packages=require('../../tools/runtime-dependency-contract.cjs').RETAINED_PACKAGES;
        const roots=packages.filter(p=>!packages.some(other=>p!==other&&p.packagePath.startsWith(other.packagePath+'/')));
        files=[];function walk(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const name=prefix+'/'+e.name,full=path.join(dir,e.name);if(e.isDirectory())walk(full,name);else files.push({path:'electronapp/'+name,bytes:fs.readFileSync(full)});}}
        for(const p of roots)walk(path.join(base,p.packagePath),p.packagePath);
    }
    files=files.map(e=>{const bytes=e.bytes||fs.readFileSync(path.join(root,'vendor/carnival',e.path));
        const target=path.join(root,input.INPUT_ROOT,e.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
        return{path:e.path,size:bytes.length,sha256:sha(bytes),sourcePath:e.path.slice('electronapp/'.length),sourceSize:bytes.length,sourceSha256:sha(bytes),sourceGitBlob:crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),transform:'identity'};});
    const manifest={schemaVersion:1,version:'3.0.20',inputRoot:input.INPUT_ROOT,fileCount:files.length,bytes:files.reduce((n,e)=>n+e.size,0),treeSha256:web.treeHash(files),files,source:{repository:'https://github.com/MediaBrowser/emby-theater-electron',commit:'0'.repeat(40)}};
    fs.mkdirSync(path.join(root,'vendor'),{recursive:true});fs.writeFileSync(path.join(root,input.MANIFEST_PATH),JSON.stringify(manifest)+'\n');return manifest;
}
module.exports={create};
