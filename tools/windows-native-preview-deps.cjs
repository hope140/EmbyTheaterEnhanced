'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {TextDecoder}=require('node:util');
const {inventory}=require('./verify-installer-runtime.cjs');
function assertPhysicalDirectory(directory) {
    const target=path.resolve(directory),normalize=value=>process.platform==='win32'?value.toLowerCase():value;
    let current=path.parse(target).root;
    for(const part of path.relative(current,target).split(path.sep).filter(Boolean)) {
        current=path.join(current,part);
        if(!fs.lstatSync(current).isDirectory()||fs.lstatSync(current).isSymbolicLink()||normalize(fs.realpathSync.native(current))!==normalize(current))throw Error('Physical directory required');
    }
    return target;
}
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function contract(root) {
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'native/windows-media/registry-input.json')));
    const lockBytes=fs.readFileSync(path.join(root,'native/windows-media/package-lock.json'));
    const lock=JSON.parse(lockBytes);
    if(manifest.schemaVersion!==1||manifest.registry!=='https://registry.npmjs.org'||manifest.lockSha256!==hash(lockBytes)||manifest.platform!=='win32'||manifest.arch!=='x64'||manifest.packages.length!==2)throw Error('Registry contract mismatch');
    for(const [i,name] of ['koffi','@koromix/koffi-win32-x64'].entries()) {
        const item=manifest.packages[i],entry=lock.packages['node_modules/'+name];
        if(item.name!==name||item.version!=='3.3.3'||entry.version!==item.version||entry.resolved!==item.url||entry.integrity!==item.integrity||!item.url.startsWith('https://registry.npmjs.org/'))throw Error('Pinned registry identity mismatch');
    }
    return manifest;
}
function parse(bytes,item) {
    if(bytes.length!==item.archiveBytes||hash(bytes)!==item.archiveSha256||'sha512-'+crypto.createHash('sha512').update(bytes).digest('base64')!==item.integrity)throw Error('Registry archive identity mismatch');
    const tar=zlib.gunzipSync(bytes,{maxOutputLength:16*1024*1024}),files=new Map(),decoder=new TextDecoder('utf-8',{fatal:true});
    function field(header,start,length){return decoder.decode(header.subarray(start,start+length)).split('\0')[0];}
    for(let offset=0;offset<tar.length;) {
        const header=tar.subarray(offset,offset+512);if(header.length!==512)throw Error('Truncated tar');
        if(header.every(byte=>byte===0)){if(!tar.subarray(offset).every(byte=>byte===0))throw Error('Trailing tar content');break;}
        const checksum=field(header,148,8).trim();let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:header[i];
        if(!/^[0-7]+$/.test(checksum)||parseInt(checksum,8)!==sum)throw Error('Tar checksum mismatch');
        const name=(field(header,345,155)?field(header,345,155)+'/':'')+field(header,0,100),sizeText=field(header,124,12).trim();
        if(!/^[0-7]+$/.test(sizeText)||![0,48].includes(header[156])||!name.startsWith('package/'))throw Error('Nonregular tar member');
        const relative=name.slice(8),size=parseInt(sizeText,8);
        if(!relative||/[\\:\x00-\x1f]/.test(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part))||files.has(relative)||size>8*1024*1024||offset+512+size>tar.length)throw Error('Unsafe tar member');
        files.set(relative,tar.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
    }
    if(files.size!==item.files.length)throw Error('Registry member set mismatch');
    for(const expected of item.files)if(!files.has(expected.path)||files.get(expected.path).length!==expected.size||hash(files.get(expected.path))!==expected.sha256)throw Error('Registry member identity mismatch');
    return files;
}
function prepare(root,archives,destination) {
    const manifest=contract(root),inputs=manifest.packages.map(item=>({item,files:parse(fs.readFileSync(path.join(archives,item.archive)),item)}));
    assertPhysicalDirectory(path.dirname(path.resolve(destination)));fs.mkdirSync(destination);
    for(const {item,files} of inputs)for(const [name,bytes] of files){const target=path.join(destination,'node_modules',item.name,name);fs.mkdirSync(path.dirname(target),{recursive:true});assertPhysicalDirectory(path.dirname(target));fs.writeFileSync(target,bytes,{flag:'wx'});}
    return verify(root,destination);
}
function verify(root,destination) {
    const manifest=contract(root),actual=inventory(destination),expected=new Map();
    for(const item of manifest.packages)for(const file of item.files)expected.set('node_modules/'+item.name+'/'+file.path,file);
    if(actual.size!==expected.size)throw Error('Dependency payload set mismatch');
    for(const [name,file] of expected){const value=actual.get(name);if(!value||value.size!==file.size||value.sha256!==file.sha256)throw Error('Dependency payload identity mismatch');}
    const node=fs.readFileSync(path.join(destination,'node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node'));
    const pe=node.readUInt32LE(60);if(node.toString('ascii',0,2)!=='MZ'||node.toString('ascii',pe,pe+4)!=='PE\0\0'||node.readUInt16LE(pe+4)!==0x8664||node.readUInt16LE(pe+24)!==0x20b)throw Error('Koffi binary is not Windows x64 PE32+');
    return {status:'passed',files:actual.size,registryContractSha256:hash(fs.readFileSync(path.join(root,'native/windows-media/registry-input.json')))};
}
module.exports={contract,parse,prepare,verify,assertPhysicalDirectory};
if(require.main===module){const [operation,root,...args]=process.argv.slice(2);Promise.resolve().then(()=>({prepare,verify}[operation]||(()=>{throw Error('Unknown dependency action');}))(root,...args)).then(value=>console.log(JSON.stringify(value))).catch(error=>{console.error(error.message);process.exitCode=1;});}
