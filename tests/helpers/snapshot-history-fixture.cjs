'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function attach(root,name,manifest,previous=manifest) {
    const old=structuredClone(previous);delete old.migration;old.version='snapshot-v1';
    const file='vendor/snapshot-history/'+name+'-v1-manifest.json',bytes=Buffer.from(JSON.stringify(old)+'\n');
    fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),bytes);
    manifest.version='snapshot-v2';manifest.migration={historicalManifestPath:file,historicalManifestSha256:crypto.createHash('sha256').update(bytes).digest('hex')};
    return manifest;
}
function copy(root,destination,manifest){const name=manifest.migration.historicalManifestPath;fs.mkdirSync(path.dirname(path.join(destination,name)),{recursive:true});fs.copyFileSync(path.join(root,name),path.join(destination,name));}
module.exports={attach,copy};
