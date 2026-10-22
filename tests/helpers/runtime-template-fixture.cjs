'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const templates=require('../../tools/runtime-template-input.cjs'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function create(root,overrides={}){
    const defaults={'electronapp/package.json':'{"name":"fixture"}\n','electronapp/preload.js':"const { ipcRenderer } = require('electron');\r\nwindow.ipc = ipcRenderer;\r\nconst fs = require('fs');\r\nwindow.fs = fs;\r\nconst os = require('os');\r\nwindow.dirName = os.tmpdir();\r\nwindow.appdata = process.env.APPDATA;\r\n",'Emby.Theater.exe.config':'<configuration><add key="ProgramDataPath" value=""/></configuration>\n'};
    const files=Object.entries(templates.FILES).map(([runtimePath,definition])=>{const old=path.join(root,'vendor/carnival',runtimePath);const bytes=Object.hasOwn(overrides,runtimePath)?Buffer.from(overrides[runtimePath]):fs.existsSync(old)?fs.readFileSync(old):Buffer.from(defaults[runtimePath]);const source=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));const transform=source.equals(bytes)?'identity':'lf-to-crlf';const file=path.join(root,definition.sourcePath);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,source);return{...definition,runtimePath,sourceSize:source.length,sourceSha256:sha(source),transform,size:bytes.length,sha256:sha(bytes),origin:{status:'synthetic test fixture'}};});
    const manifest={schemaVersion:1,sourceRoot:templates.SOURCE_ROOT,fileCount:3,bytes:files.reduce((n,e)=>n+e.size,0),files};fs.mkdirSync(path.join(root,'vendor'),{recursive:true});fs.writeFileSync(path.join(root,templates.MANIFEST_PATH),JSON.stringify(manifest)+'\n');return manifest;
}
module.exports={create};
