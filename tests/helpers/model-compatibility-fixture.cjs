'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const input = require('../../tools/model-compatibility-input.cjs');
const web = require('../../tools/web-snapshot-input.cjs');

function create(root, fromLegacy = false) {
    const files = input.MODEL_PATHS.map(name => {
        const bytes = fromLegacy ? fs.readFileSync(path.join(root, 'vendor/carnival', name)) :
            Buffer.from('Synthetic compatibility DLL bytes: ' + name);
        const target = path.join(root, input.INPUT_ROOT, name);
        fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.writeFileSync(target, bytes);
        return {path: name, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
    }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
    const manifest = {schemaVersion: 1, version: 'snapshot-v1', inputRoot: input.INPUT_ROOT,
        fileCount: files.length, bytes: files.reduce((n, f) => n + f.size, 0),
        treeSha256: web.treeHash(files), files, provenance: {mode: 'local-model-compatibility-snapshot',
            source: 'Synthetic fixture', dllExecuted: false}};
    fs.mkdirSync(path.join(root, 'vendor'), {recursive: true});
    fs.writeFileSync(path.join(root, input.MANIFEST_PATH), JSON.stringify(manifest) + '\n');
    return manifest;
}
module.exports = {create};
