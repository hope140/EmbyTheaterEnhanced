'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const input = require('../../tools/small-runtime-input.cjs');
const web = require('../../tools/web-snapshot-input.cjs');

function create(root, fromLegacy = false) {
    for (const name of [input.DEFAULT_SOURCE_PATH, input.TRANSLATION_SOURCE_PATH]) {
        const destination = path.join(root, name);
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.copyFileSync(path.join(__dirname, '../../', name), destination);
    }
    const oldPaths = [...input.SMALL_PATHS, ...require('../../tools/runtime-exclusions.cjs').RETIRED_SMALL_RUNTIME_PATHS];
    const history = oldPaths.map(name=>{
        const bytes=fromLegacy?fs.readFileSync(path.join(root,'vendor/carnival',name)):Buffer.from(name==='cec-driver/cancel'?'':'synthetic historical '+name);
        return {path:name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
    });
    const files=input.SMALL_PATHS.map(name=>{
        const bytes=name==='config/system.xml'?require('./small-runtime-reference.cjs').CONFIGURATION:
            fs.readFileSync(path.join(__dirname,'../../',input.TRANSLATION_SOURCE_PATH));
        const target=path.join(root,input.INPUT_ROOT,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
        return {path:name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
    });
    const manifest = {schemaVersion: 1, version: 'snapshot-v2', inputRoot: input.INPUT_ROOT,
        fileCount: files.length, bytes: files.reduce((n, f) => n + f.size, 0),
        treeSha256: web.treeHash(files), files, provenance: {mode: 'local-small-runtime-snapshot',
            source: 'Synthetic fixture', configurationTransformed: false}};
    require('./snapshot-history-fixture.cjs').attach(root,'small-runtime',manifest,{...manifest,files:history,fileCount:history.length,bytes:history.reduce((n,e)=>n+e.size,0),treeSha256:web.treeHash(history)});
    manifest.migration.translationReview=JSON.parse(fs.readFileSync(path.join(__dirname,'../../vendor/small-runtime-manifest.json'))).migration.translationReview;
    fs.mkdirSync(path.join(root, 'vendor'), {recursive: true});
    fs.writeFileSync(path.join(root, input.MANIFEST_PATH), JSON.stringify(manifest) + '\n');
    return manifest;
}
module.exports = {create};
