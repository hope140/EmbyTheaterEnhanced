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
        else if (retired.has(name)) { action = 'exclude'; reason = 'retired-bridge'; }
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
    const entries = classify(manifest.files, product.map(item => item.runtimePath),
        overlays.WEB_OVERLAY_CONTRACT.map(item => item.runtimePath), selected.packages.map(item => item.packagePath))
        .filter(item => !webSnapshot.isLegacyWeb(item.path));
    const web = webSnapshot.load(root);
    return {schemaVersion: 1, sourceCommit: sourceCommit.toLowerCase(), sourceManifestSha256,
        relation: 'existing vendor manifest + committed product paths + Web overlay contract + npm lock',
        groups: summarize(entries), entries, webSnapshot: {manifestPath:webSnapshot.MANIFEST_PATH,
            treeSha256:web.treeSha256,fileCount:web.fileCount,bytes:web.bytes}};
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
    const carnivalRoot = path.join(root, 'vendor', 'carnival');
    webSnapshot.validate(root);
    // Historical non-Web inputs still have their existing gate. Web identity
    // comes only from its independent component manifest, never old www/.
    verifyInputs(carnivalRoot, result.entries.filter(item => !webSnapshot.isLegacyWeb(item.path)), ['electronapp/www']);
    for (const entry of result.entries.filter(item => item.action === 'copy' && !webSnapshot.isLegacyWeb(item.path))) {
        const target = path.join(runtime, ...entry.path.split('/'));
        fs.mkdirSync(path.dirname(target), {recursive: true});
        physical(path.dirname(target), true);
        fs.copyFileSync(path.join(carnivalRoot, ...entry.path.split('/')), target, fs.constants.COPYFILE_EXCL);
        const bytes = fs.readFileSync(target);
        if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) throw new Error('Assembled input identity mismatch: ' + entry.path);
    }
    const webInput = webSnapshot.assemble(root, runtime);
    return {schemaVersion: result.schemaVersion, status: 'passed', sourceCommit: result.sourceCommit,
        sourceManifestSha256: result.sourceManifestSha256, groups: result.groups, webInput};
}

if (require.main === module) {
    try {
        const [command, root, commit, runtime, token] = process.argv.slice(2);
        if (!root || !commit || !['plan', 'summary', 'assemble'].includes(command) ||
            (command === 'assemble' ? !runtime || !token || process.argv.length !== 7 : process.argv.length !== 5)) {
            throw new Error('Usage: assemble-runtime-base.cjs <plan|summary> <root> <sourceCommit> OR assemble <root> <sourceCommit> <runtime> <ownerToken>');
        }
        const result = command === 'assemble' ? assemble(root, commit, runtime, token) : plan(root, commit);
        if (command === 'summary') delete result.entries;
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (error) {
        process.stderr.write(error.message + '\n');
        process.exitCode = 1;
    }
}

module.exports = {classify, summarize, plan, verifyInputs, assemble};
