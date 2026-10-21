'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assembly = require('./assemble-runtime-base.cjs');
const web = require('./web-snapshot-input.cjs');
const host = require('./windows-host-input.cjs');
const npm = require('./inherited-npm-input.cjs');
const RETIRED_WEB_PATCH_PATHS = Object.freeze(['payload/client/apiclient.js','payload/client/toast.css']);
const REQUIRED_PATCH_PATH = 'payload/libmpv/mpv-1.dll';
function selectPatchInputs(manifest) {
    const seen=new Set();
    for(const entry of manifest.patchFiles) {
        const name=entry.path;
        if(typeof name!=='string'||!name||/[\\:\x00-\x1f\x7f]/.test(name)||name.split('/').some(x=>!x||x==='.'||x==='..')||
            seen.has(name.toLowerCase())||!/^[a-f0-9]{64}$/i.test(entry.sha256||''))throw new Error('Invalid patch input identity.');
        seen.add(name.toLowerCase());
    }
    const required=manifest.patchFiles.filter(item=>item.path===REQUIRED_PATCH_PATH);
    if(required.length!==1)throw new Error('Current libmpv patch identity is missing.');
    const historical=manifest.patchFiles.filter(item=>item.path!==REQUIRED_PATCH_PATH&&!RETIRED_WEB_PATCH_PATHS.includes(item.path));
    return {required,historical,ignored:[...historical.map(item=>item.path),...RETIRED_WEB_PATCH_PATHS,'payload/mpv']};
}
function validate(rootArg,sourceCommit) {
    const root = path.resolve(rootArg);
    const manifest = JSON.parse(fs.readFileSync(path.join(root,'vendor/runtime-manifest.json'),'utf8'));
    if (!Array.isArray(manifest.files) || !Array.isArray(manifest.patchFiles)) throw new Error('Invalid legacy material manifest.');
    const webInput = web.validate(root);
    const hostInput = host.validate(root);
    const inheritedNpm = npm.validate(root);
    const commit=sourceCommit||cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    const plan=assembly.plan(root,commit),patches=selectPatchInputs(manifest);
    assembly.verifyInputs(path.join(root,'vendor/carnival'), plan.entries, plan.ignoredInputPaths);
    // Only the current pinned libmpv is consumed from the old patch directory.
    // Known retired paths are optional; current input namespaces stay strict.
    const patchRoot = path.join(root,'vendor/patch');
    const sized = patches.required.map(item => ({...item,size:fs.statSync(path.join(patchRoot,item.path)).size}));
    assembly.verifyInputs(patchRoot,sized,patches.ignored);
    return {status:'passed',webInput,hostInput,inheritedNpm,remainingCarnivalFiles:plan.entries.length,remainingPatchFiles:patches.required.length,
        historicalCarnivalFiles:plan.historicalEntries.length,historicalPatchFiles:patches.historical.length};
}
if (require.main === module) {
    try { if (process.argv.length!==3) throw new Error('Usage: validate-build-materials.cjs <root>');process.stdout.write(JSON.stringify(validate(process.argv[2]),null,2)+'\n'); }
    catch(error) {process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={validate,RETIRED_WEB_PATCH_PATHS,REQUIRED_PATCH_PATH,selectPatchInputs};
