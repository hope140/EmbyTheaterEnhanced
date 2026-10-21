'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assembly = require('./assemble-runtime-base.cjs');
const web = require('./web-snapshot-input.cjs');
const host = require('./windows-host-input.cjs');
const npm = require('./inherited-npm-input.cjs');
const templates = require('./runtime-template-input.cjs');
const libmpv = require('./libmpv-input.cjs');
const compatibility = require('./compatibility-resources-input.cjs');
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
    const previous=manifest.patchFiles.filter(item=>item.path===REQUIRED_PATCH_PATH);
    if(previous.length!==1)throw new Error('Historical libmpv patch identity is missing.');
    const historical=manifest.patchFiles.filter(item=>!RETIRED_WEB_PATCH_PATHS.includes(item.path));
    return {previous:previous[0],historical};
}
function validate(rootArg,sourceCommit) {
    const root = path.resolve(rootArg);
    const manifest = JSON.parse(fs.readFileSync(path.join(root,'vendor/runtime-manifest.json'),'utf8'));
    if (!Array.isArray(manifest.files) || !Array.isArray(manifest.patchFiles)) throw new Error('Invalid legacy material manifest.');
    const webInput = web.validate(root);
    const hostInput = host.validate(root);
    const inheritedNpm = npm.validate(root);
    const runtimeTemplates=templates.validate(root);
    const libmpvInput=libmpv.validate(root);
    const compatibilityResources=compatibility.validate(root);
    const commit=sourceCommit||cp.execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
    const plan=assembly.plan(root,commit),patches=selectPatchInputs(manifest);
    assembly.verifyInputs(path.join(root,'vendor/carnival'), plan.entries, plan.ignoredInputPaths);
    if(patches.previous.sha256.toLowerCase()!==libmpv.load(root).files[0].sha256)throw new Error('libmpv snapshot differs from historical current DLL identity.');
    return {status:'passed',webInput,hostInput,inheritedNpm,runtimeTemplates,libmpvInput,compatibilityResources,remainingCarnivalFiles:plan.entries.length,remainingPatchFiles:0,
        historicalCarnivalFiles:plan.historicalEntries.length,historicalPatchFiles:patches.historical.length,historicalPatchDirectoryRead:false};
}
if (require.main === module) {
    try { if (process.argv.length!==3) throw new Error('Usage: validate-build-materials.cjs <root>');process.stdout.write(JSON.stringify(validate(process.argv[2]),null,2)+'\n'); }
    catch(error) {process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={validate,RETIRED_WEB_PATCH_PATHS,REQUIRED_PATCH_PATH,selectPatchInputs};
