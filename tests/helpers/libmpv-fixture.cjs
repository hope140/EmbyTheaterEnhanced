'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const input=require('../../tools/libmpv-input.cjs'),web=require('../../tools/web-snapshot-input.cjs');
function create(root,bytes){bytes=bytes||fs.readFileSync(path.join(root,'vendor/patch/payload/libmpv/mpv-1.dll'));const files=[{path:'mpv-1.dll',size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}];const target=path.join(root,input.INPUT_ROOT,'mpv-1.dll');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);const manifest={schemaVersion:1,version:'20260809-git-dd5d17d328',inputRoot:input.INPUT_ROOT,runtimePath:input.RUNTIME_PATH,fileCount:1,bytes:bytes.length,files,treeSha256:web.treeHash(files),provenance:{mode:'local-snapshot',source:'synthetic test fixture',physicalLegacyDirectoryRequired:false}};fs.writeFileSync(path.join(root,input.MANIFEST_PATH),JSON.stringify(manifest)+'\n');return manifest;}
module.exports={create};
