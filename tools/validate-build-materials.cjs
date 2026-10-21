'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assembly = require('./assemble-runtime-base.cjs');
const web = require('./web-snapshot-input.cjs');
const host = require('./windows-host-input.cjs');
const RETIRED_WEB_PATCH_PATHS = Object.freeze(['payload/client/apiclient.js','payload/client/toast.css']);
function validate(rootArg) {
    const root = path.resolve(rootArg);
    const manifest = JSON.parse(fs.readFileSync(path.join(root,'vendor/runtime-manifest.json'),'utf8'));
    if (!Array.isArray(manifest.files) || !Array.isArray(manifest.patchFiles)) throw new Error('Invalid legacy material manifest.');
    const webInput = web.validate(root);
    const hostInput = host.validate(root),hostPaths=host.paths(root);
    const remaining = manifest.files.filter(item => !web.isLegacyWeb(item.path)&&!hostPaths.includes(item.path));
    const patches = manifest.patchFiles.filter(item => !RETIRED_WEB_PATCH_PATHS.includes(item.path));
    assembly.verifyInputs(path.join(root,'vendor/carnival'), remaining, ['electronapp/www',...hostPaths]);
    // The legacy patch manifest pins hashes but not sizes; read only remaining
    // patch identities. The two Web payloads now belong to the Web component.
    const patchRoot = path.join(root,'vendor/patch');
    const sized = patches.map(item => ({...item,size:fs.statSync(path.join(patchRoot,item.path)).size}));
    assembly.verifyInputs(patchRoot,sized,RETIRED_WEB_PATCH_PATHS);
    return {status:'passed',webInput,hostInput,remainingCarnivalFiles:remaining.length,remainingPatchFiles:patches.length};
}
if (require.main === module) {
    try { if (process.argv.length!==3) throw new Error('Usage: validate-build-materials.cjs <root>');process.stdout.write(JSON.stringify(validate(process.argv[2]),null,2)+'\n'); }
    catch(error) {process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={validate,RETIRED_WEB_PATCH_PATHS};
