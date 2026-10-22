'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const input = require('../../tools/model-compatibility-input.cjs');
const web = require('../../tools/web-snapshot-input.cjs');

function create(root, fromLegacy = false) {
    const files = input.MODEL_PATHS.map(name => {
        const bytes = fromLegacy ? Buffer.concat([fs.readFileSync(path.join(root, 'vendor/carnival', name)),Buffer.from('\nOfficial replacement fixture')]) :
            Buffer.from('Synthetic compatibility DLL bytes: ' + name);
        const target = path.join(root, input.INPUT_ROOT, name);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, bytes);
        return {path: name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
    }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const manifest = {schemaVersion: 1, version: 'snapshot-v1', inputRoot: input.INPUT_ROOT,
        fileCount: files.length, bytes: files.reduce((n, f) => n + f.size, 0),
        treeSha256: web.treeHash(files), files,
        archive:{name:'emby-theater-x64.zip',sourceUrl:input.OFFICIAL_SOURCE,size:Buffer.byteLength('Synthetic official archive'),sha256:crypto.createHash('sha256').update('Synthetic official archive').digest('hex')},
        provenance: {mode: 'official-windows-3.0.20-model',officialReplacement:true,
            source: 'Synthetic fixture', dllExecuted: false}};
    fs.mkdirSync(path.join(root, 'vendor'), {recursive: true});
    fs.writeFileSync(path.join(root, input.MANIFEST_PATH), JSON.stringify(manifest) + '\n');
    return manifest;
}
module.exports = {create};
