'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sources = require('./copy-tracked-product-sources.cjs');
const overlays = require('./prepare-web-overlays.cjs');
const dependencies = require('./runtime-dependency-contract.cjs');
const {RETIRED_RUNTIME_PATHS} = require('./runtime-exclusions.cjs');
const {hashTrackedTextFile} = require('./tracked-file-hash.cjs');
const webSnapshot = require('./web-snapshot-input.cjs');
const windowsHost = require('./windows-host-input.cjs');
const inheritedNpm = require('./inherited-npm-input.cjs');
const templates = require('./runtime-template-input.cjs');
const compatibility = require('./compatibility-resources-input.cjs');
const smallRuntime = require('./small-runtime-input.cjs');
const modelCompatibility = require('./model-compatibility-input.cjs');

function sha256(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function relativeFile(value) {
    if (typeof value !== 'string' || !value || /[\\:\0]/.test(value) ||
        value.split('/').some(part => !part || part === '.' || part === '..')) {
        throw new Error('Invalid assembly input path.');
    }
    return value;
}

// This is a projection of existing authorities, not another vendor manifest.
// Unchanged legacy assets deliberately remain explicit copy entries in stage 1.
function classify(files, productPaths, overlayPaths, selectedPackagePaths) {
    const product = new Set(productPaths.map(relativeFile));
    const web = new Set(overlayPaths.map(relativeFile));
    const selected = selectedPackagePaths.map(relativeFile);
    const retired = new Set(RETIRED_RUNTIME_PATHS);
    const seen = new Set();
    return files.map(file => {
        const name = relativeFile(file.path);
        if (name.toLowerCase() === dependencies.OWNER_FILE.toLowerCase()) throw new Error('Reserved assembly input path.');
        const key = name.toLowerCase();
        if (seen.has(key)) throw new Error('Duplicate assembly input path: ' + name);
        seen.add(key);
        if (!Number.isSafeInteger(file.size) || file.size < 0 || !/^[0-9a-f]{64}$/i.test(file.sha256 || '')) {
            throw new Error('Invalid assembly input identity: ' + name);
        }
        let action = 'copy';
        let reason = 'legacy-asset';
        if (name.startsWith('x64/electron/')) { action = 'exclude'; reason = 'replaced-electron'; }
        else if (retired.has(name)) { action = 'exclude'; reason = name === 'electronapp/libmpv/x64/mpv-win32-x64.node' ? 'retired-bridge' : 'retired-legacy-resource'; }
        else if (name.startsWith('electronapp/www/modules/externalplayer/')) { action = 'exclude'; reason = 'retired-external-player'; }
        else if (product.has(name)) { action = 'replace'; reason = 'committed-product-source'; }
        else if (name === 'electronapp/preload.js') { action = 'replace'; reason = 'generated-preload'; }
        else if (web.has(name)) { action = 'replace'; reason = 'generated-web-overlay'; }
        else if (name === 'electronapp/libmpv/x64/mpv-1.dll') { action = 'replace'; reason = 'pinned-libmpv'; }
        else if (name === 'Emby.Theater.exe.config') { action = 'replace'; reason = 'generated-host-config'; }
        else if (selected.some(pkg => name.startsWith('electronapp/' + pkg + '/'))) { action = 'replace'; reason = 'locked-npm-dependency'; }
        else if (name === 'electronapp/www/modules/common/playback/playbackmanager.js') reason = 'playbackmanager-template';
        else if (name.startsWith('electronapp/www/')) reason = 'offline-web';
        else if (name.startsWith('electronapp/node_modules/')) reason = 'inherited-npm-dependency';
        else if (name === 'electronapp/package.json') reason = 'application-metadata-template';
        return {path: name, size: file.size, sha256: file.sha256.toLowerCase(), action, reason};
    }).sort((a, b) => a.path.localeCompare(b.path, 'en'));
}

function summarize(entries) {
    const groups = {};
    for (const entry of entries) {
        const key = entry.action + ':' + entry.reason;
        const group = groups[key] || (groups[key] = {action: entry.action, reason: entry.reason, fileCount: 0, bytes: 0});
        group.fileCount++;
        group.bytes += entry.size;
    }
    return Object.values(groups).sort((a, b) => (a.action + a.reason).localeCompare(b.action + b.reason, 'en'));
}

function plan(rootArg, sourceCommit) {
    const root = path.resolve(rootArg);
    const manifestPath = 'vendor/runtime-manifest.json';
    const sourceManifestSha256 = hashTrackedTextFile(root, manifestPath).toLowerCase();
    const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
    if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Carnival input manifest is empty.');
    const product = sources.listTrackedProductSources(root, sourceCommit);
    const selected = dependencies.loadSelectedPackages(root);
    const host = windowsHost.load(root);
    const hostPaths = new Set(host.files.map(item=>item.path));
    const npm=inheritedNpm.load(root),npmPaths=new Set(npm.files.map(item=>item.path));
    const candidates = classify(manifest.files, product.map(item => item.runtimePath),
        overlays.WEB_OVERLAY_CONTRACT.map(item => item.runtimePath), selected.packages.map(item => item.packagePath))
        .filter(item => !webSnapshot.isLegacyWeb(item.path) && !hostPaths.has(item.path));
    const oldNpm=candidates.filter(item=>item.reason==='inherited-npm-dependency');
    if(oldNpm.length!==npm.files.length||oldNpm.some(item=>!npm.files.some(entry=>entry.path===item.path&&entry.size===item.size&&entry.sha256===item.sha256)))throw new Error('Inherited npm component differs from current retained package selection.');
    const template=templates.load(root),templatePaths=new Set(template.files.map(e=>e.runtimePath));
    for(const entry of template.files)if(!candidates.some(item=>item.path===entry.runtimePath&&item.size===entry.size&&item.sha256===entry.sha256))throw Error('Runtime template differs from historical baseline identity.');
    const legacyCandidates=candidates.filter(item=>!npmPaths.has(item.path)&&!templatePaths.has(item.path));
    const compatibilityInput=compatibility.load(root),compatibilityHistory=webSnapshot.migrationHistory(root,compatibilityInput,require('./runtime-exclusions.cjs').RETIRED_COMPATIBILITY_PATHS),compatibilityPaths=new Set(compatibilityHistory.files.map(e=>e.path));
    const oldCompatibility=legacyCandidates.filter(e=>compatibility.isCompatibility(e.path));
    if(oldCompatibility.length!==compatibilityHistory.files.length||oldCompatibility.some(e=>e.action!==(RETIRED_RUNTIME_PATHS.includes(e.path)?'exclude':'copy')||!compatibilityHistory.files.some(f=>f.path===e.path&&f.size===e.size&&f.sha256===e.sha256)))throw Error('Compatibility snapshot differs from retained historical identity.');
    const afterCompatibility=legacyCandidates.filter(e=>!compatibilityPaths.has(e.path));
    const smallInput=smallRuntime.load(root),smallHistory=webSnapshot.migrationHistory(root,smallInput,require('./runtime-exclusions.cjs').RETIRED_SMALL_RUNTIME_PATHS,smallRuntime.SMALL_PATHS),smallPaths=new Set(smallHistory.files.map(e=>e.path));
    const oldSmall=afterCompatibility.filter(e=>smallRuntime.isSmallRuntime(e.path));
    if(oldSmall.length!==smallHistory.files.length||oldSmall.some(e=>e.action!==(RETIRED_RUNTIME_PATHS.includes(e.path)?'exclude':'copy')||!smallHistory.files.some(f=>f.path===e.path&&f.size===e.size&&f.sha256===e.sha256)))throw Error('Small runtime snapshot differs from retained historical identity.');
    const afterSmall=afterCompatibility.filter(e=>!smallPaths.has(e.path));
    const modelInput=modelCompatibility.load(root),modelPaths=new Set(modelInput.files.map(e=>e.path));
    const oldModel=afterSmall.filter(e=>modelCompatibility.isModelCompatibility(e.path));
    // Retire the historical path, not its bytes: the separately locked official
    // Model intentionally differs from the old compatibility variant.
    if(oldModel.length!==1||oldModel[0].action!=='copy')throw Error('Historical Model selection must contain exactly one replaced path.');
    const otherCandidates=afterSmall.filter(e=>!modelPaths.has(e.path));
    const required = item => item.action === 'copy' || ['generated-host-config','generated-preload'].includes(item.reason);
    const entries = otherCandidates.filter(required);
    if(entries.length)throw new Error('Unmanaged legacy runtime input remains; explicit independent component required.');
    const historicalEntries = otherCandidates.filter(item => !required(item));
    const ignoredInputPaths = [...new Set(['electronapp/www','electronapp/node_modules','external',...modelPaths,...smallPaths,...compatibilityPaths,...hostPaths,...npmPaths,...templatePaths,...historicalEntries.map(item=>item.path),
        'x64/electron',...selected.packages.map(item=>'electronapp/'+item.packagePath)])];
    if(entries.some(item=>ignoredInputPaths.some(prefix=>item.path===prefix||item.path.startsWith(prefix+'/')))) {
        throw new Error('Historical input exclusion overlaps a consumed input.');
    }
    const web = webSnapshot.load(root);
    return {schemaVersion: 1, sourceCommit: sourceCommit.toLowerCase(), sourceManifestSha256,
        relation: 'existing vendor manifest + committed product paths + Web overlay contract + npm lock',
        groups: summarize(entries), entries,historicalEntries,ignoredInputPaths,
        historicalReference:{fileCount:historicalEntries.length,groups:summarize(historicalEntries),
            evidence:'tracked historical manifest only; no physical predecessor input is required'},
        webSnapshot: {...webSnapshot.runtimeSelection(web),manifestPath:webSnapshot.MANIFEST_PATH,
            treeSha256:web.treeSha256,fileCount:web.fileCount,bytes:web.bytes},windowsHost:{manifestPath:windowsHost.MANIFEST_PATH,
            treeSha256:host.treeSha256,fileCount:host.fileCount,bytes:host.bytes,...windowsHost.runtimeSelection(host)},inheritedNpm:{manifestPath:inheritedNpm.MANIFEST_PATH,
            sourceCommit:npm.source.commit,treeSha256:npm.treeSha256,fileCount:npm.fileCount,bytes:npm.bytes},runtimeTemplates:{manifestPath:templates.MANIFEST_PATH,fileCount:3,bytes:template.bytes},compatibilityResources:{...compatibility.runtimeSelection(compatibilityInput),manifestPath:compatibility.MANIFEST_PATH,fileCount:compatibilityInput.fileCount,bytes:compatibilityInput.bytes,treeSha256:compatibilityInput.treeSha256},smallRuntime:{...smallRuntime.runtimeSelection(root,smallInput),manifestPath:smallRuntime.MANIFEST_PATH,fileCount:smallInput.fileCount,bytes:smallInput.bytes,treeSha256:smallInput.treeSha256},modelCompatibility:{manifestPath:modelCompatibility.MANIFEST_PATH,fileCount:modelInput.fileCount,bytes:modelInput.bytes,treeSha256:modelInput.treeSha256}};
}

function physical(absolute, directory) {
    const resolved = path.resolve(absolute);
    const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
    let current = path.parse(resolved).root;
    for (const part of path.relative(current, resolved).split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || normalize(fs.realpathSync.native(current)) !== normalize(current)) {
            throw new Error('Assembly path contains a link or redirect.');
        }
    }
    const stat = fs.lstatSync(resolved);
    if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error('Assembly path has an unexpected file type.');
}

function verifyInputs(carnivalRoot, entries, ignored = []) {
    physical(carnivalRoot, true);
    const expected = new Map(entries.map(entry => [entry.path, entry]));
    const found = new Set();
    const pending = [{absolute: carnivalRoot, relative: ''}];
    while (pending.length) {
        const current = pending.pop();
        for (const child of fs.readdirSync(current.absolute, {withFileTypes: true})) {
            const name = current.relative ? current.relative + '/' + child.name : child.name;
            relativeFile(name);
            // These paths are no longer input authorities. Do not traverse or
            // hash an optional historical www/ or retired Web patch payload.
            if (ignored.some(prefix => name === prefix || name.startsWith(prefix + '/'))) continue;
            const absolute = path.join(current.absolute, child.name);
            const stat = fs.lstatSync(absolute);
            physical(absolute, stat.isDirectory());
            if (stat.isDirectory()) { pending.push({absolute, relative: name}); continue; }
            const entry = expected.get(name);
            if (!entry) throw new Error('Unexpected Carnival input: ' + name);
            const bytes = fs.readFileSync(absolute);
            if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error('Carnival input identity mismatch: ' + name);
            found.add(name);
        }
    }
    for (const entry of entries) if (!found.has(entry.path)) throw new Error('Missing Carnival input: ' + entry.path);
}

function assemble(rootArg, sourceCommit, runtimeArg, token) {
    const {root, runtime} = dependencies.assertRepoLayout(rootArg, runtimeArg);
    const owner = dependencies.loadOwner(root, runtime, token);
    if (owner.sourceCommit !== sourceCommit.toLowerCase()) throw new Error('Assembly owner source commit mismatch.');
    if (fs.readdirSync(runtime).some(name => name !== dependencies.OWNER_FILE)) {
        throw new Error('Assembly requires a fresh owned runtime.');
    }
    const result = plan(root, sourceCommit);
    webSnapshot.validate(root);
    windowsHost.validate(root);
    inheritedNpm.validate(root);
    templates.validate(root);
    compatibility.validate(root);
    smallRuntime.validate(root);
    modelCompatibility.validate(root);
    // All production inputs are independently validated components; legacy trees are not read.
    const webInput = webSnapshot.assemble(root, runtime);
    const hostInput = windowsHost.assemble(root,runtime);
    const npmInput = inheritedNpm.assemble(root,runtime);
    const templateInput=templates.assemble(root,runtime);
    const compatibilityInput=compatibility.assemble(root,runtime);
    const smallInput=smallRuntime.assemble(root,runtime);
    const modelInput=modelCompatibility.assemble(root,runtime);
    return {schemaVersion: result.schemaVersion, status: 'passed', sourceCommit: result.sourceCommit,
        sourceManifestSha256: result.sourceManifestSha256, groups: result.groups,
        historicalReference:result.historicalReference,webInput,hostInput,inheritedNpm:npmInput,runtimeTemplates:templateInput,compatibilityResources:compatibilityInput,smallRuntime:smallInput,modelCompatibility:modelInput};
}

if (require.main === module) {
    try {
        const [command, root, commit, runtime, token] = process.argv.slice(2);
        if (!root || !commit || !['plan', 'summary', 'assemble'].includes(command) ||
            (command === 'assemble' ? !runtime || !token || process.argv.length !== 7 : process.argv.length !== 5)) {
            throw new Error('Usage: assemble-runtime-base.cjs <plan|summary> <root> <sourceCommit> OR assemble <root> <sourceCommit> <runtime> <ownerToken>');
        }
        const result = command === 'assemble' ? assemble(root, commit, runtime, token) : plan(root, commit);
        if (command === 'summary') { delete result.entries;delete result.historicalEntries;delete result.ignoredInputPaths; }
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (error) {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
    }
}

module.exports = {classify, summarize, plan, verifyInputs, assemble};
