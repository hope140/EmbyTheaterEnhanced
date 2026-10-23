'use strict';
// Exact input recovery and kit projection only. Never accepts a Work binary/receipt.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const host = require('./source-built-host-input.cjs');
const verifier = require('./host-verifier-input.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const COMMIT = '708fadc068cbf66ced6aece4a32f3e12bb2c4e13';
const REPOSITORY = 'https://github.com/MediaBrowser/emby-theater-windows';
const KIT_FILES = Object.freeze(['Build-UnifiedHost.ps1', 'Get-SourceIdentity.ps1', 'New-VerifiedRuntime.ps1',
    'EXPECTED-ASSEMBLY-REFERENCES.json', 'EXPECTED-SOURCE-IDENTITY.json', 'REFERENCES.json', 'VERIFIED-RUNTIME.schema.json']);
const KIT_INPUTS = Object.freeze(['native/windows-host/Apply-SourceChanges.ps1', 'native/windows-host/LICENSE.md',
    'native/windows-host/LICENSE-Helpers-MIT.txt', 'native/windows-host/LICENSE-Newtonsoft-MIT.md',
    'native/windows-host/upstream-source-manifest.json', 'native/windows-host/change-manifest.json',
    'native/windows-host/host-retirement.patch', 'native/windows-host/json-zip-input.json', 'vendor/host-json-manifest.json']);
function safeRelative(p) {
    if (typeof p !== 'string' || !p || /[\\:<>"|?*\x00-\x1f]/.test(p) || p.startsWith('/') ||
        p.split('/').some(s => !s || s === '.' || s === '..' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s))) {
        throw Error('Unsafe Host recovery path.');
    }
    return p;
}
function physical(p) {
    p = path.resolve(p);
    for (let cursor = p;; cursor = path.dirname(cursor)) {
        if (fs.lstatSync(cursor).isSymbolicLink()) throw Error('Host recovery redirects forbidden.');
        if (cursor === path.dirname(cursor)) break;
    }
    if (path.resolve(fs.realpathSync.native(p)).toLowerCase() !== p.toLowerCase()) throw Error('Host recovery redirects forbidden.');
    return p;
}
function bytes(root, relative) {
    const p = physical(path.join(root, safeRelative(relative)));
    if (!fs.lstatSync(p).isFile()) throw Error('Host recovery ordinary input required.');
    return fs.readFileSync(p);
}
function createPlan(root) {
    const upstream = JSON.parse(bytes(root, 'native/windows-host/upstream-source-manifest.json'));
    if (upstream.repository !== REPOSITORY || upstream.commit !== COMMIT || upstream.files.length !== 55) throw Error('Host upstream recovery identity mismatch.');
    const names = new Set();
    for (const f of upstream.files) {
        safeRelative(f.path);
        if (names.has(f.path.toLowerCase()) || !/^[a-f0-9]{40}$/.test(f.gitBlob) || !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size <= 0) throw Error('Host recovery member mismatch.');
        names.add(f.path.toLowerCase());
    }
    const json = require('./host-json-input.cjs').load(root);
    if (json.package.url !== 'https://api.nuget.org/v3-flatcontainer/newtonsoft.json/13.0.4/newtonsoft.json.13.0.4.nupkg') throw Error('Unexpected Host JSON acquisition URL.');
    const identity = host.sourceIdentity(root);
    const expected = JSON.parse(bytes(root, 'tools/windows-host-build/EXPECTED-SOURCE-IDENTITY.json'));
    if (identity.sha256 !== expected.sha256) throw Error('Runner build kit source identity is stale.');
    return {schemaVersion: 1, repository: REPOSITORY, commit: COMMIT, sourceFiles: upstream.files,
        sourceIdentitySha256: identity.sha256, files: [
            {id: 'newtonsoft', url: json.package.url, name: 'newtonsoft.json.13.0.4.nupkg', sha256: json.package.sha256},
            {id: 'net462', url: 'https://api.nuget.org/v3-flatcontainer/microsoft.netframework.referenceassemblies.net462/1.0.3/microsoft.netframework.referenceassemblies.net462.1.0.3.nupkg',
                name: 'microsoft.netframework.referenceassemblies.net462.1.0.3.nupkg', sha256: 'ee692a845743500910855d4c330ca6e9ef87c16e16f740e4474d187185d66e21'}
        ]};
}
function verifyPackage(root, file, id) {
    const item = createPlan(root).files.find(f => f.id === id);
    if (!item || !fs.lstatSync(physical(file)).isFile() || sha(fs.readFileSync(file)) !== item.sha256) throw Error('Host recovery package identity mismatch.');
    return item;
}
function newDirectory(out) {
    out = path.resolve(out); physical(path.dirname(out));
    if (fs.existsSync(out)) throw Error('Host recovery output must be absent.');
    fs.mkdirSync(out); return out;
}
function write(out, rel, b) {
    const p = path.join(out, safeRelative(rel)); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, b, {flag: 'wx'});
}
function restoreSource(root, objectStore, out) {
    const plan = createPlan(root); physical(objectStore);
    const git = args => cp.execFileSync('git', ['-C', objectStore, ...args], {maxBuffer: 16 * 1024 * 1024});
    if (git(['rev-parse', plan.commit + '^{commit}']).toString('utf8').trim() !== plan.commit) throw Error('Host recovery commit mismatch.');
    const buffers = plan.sourceFiles.map(f => {
        // No checkout, autocrlf conversion, hooks, LFS or source archive executables.
        if (git(['rev-parse', plan.commit + ':' + f.path]).toString('utf8').trim() !== f.gitBlob) throw Error('Host recovery Git blob mismatch.');
        const b = git(['cat-file', 'blob', f.gitBlob]);
        if (b.length !== f.size || sha(b) !== f.sha256) throw Error('Host recovery source bytes mismatch: ' + f.path);
        return {f, b};
    });
    out = newDirectory(out); for (const {f, b} of buffers) write(out, f.path, b);
    return {files: buffers.length, commit: plan.commit};
}
function materializeKit(root, out) {
    const plan = createPlan(root), buffers = KIT_FILES.map(p => ({path: p, bytes: bytes(root, 'tools/windows-host-build/' + p)}))
        .concat(KIT_INPUTS.map(p => ({path: p, bytes: bytes(root, p)})));
    out = newDirectory(out); for (const f of buffers) write(out, f.path, f.bytes);
    const manifest = {schemaVersion: 1, scope: 'cec-update-json-zip-unified', containsJsonZipReplacements: true,
        sourceIdentitySha256: plan.sourceIdentitySha256, files: buffers.map(f => ({path: f.path, size: f.bytes.length, sha256: sha(f.bytes)}))};
    write(out, 'HANDOFF-MANIFEST.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n')); return manifest;
}
function prepareVerificationInput(root, buildRoot) {
    verifier.validate(root);
    physical(buildRoot);
    const record = JSON.parse(bytes(buildRoot, 'build-receipt.json'));
    if (record.scope !== 'cec-update-json-zip-unified' || record.sourceIdentitySha256 !== host.sourceIdentity(root).sha256) throw Error('Host verification input build scope mismatch.');
    const contract = JSON.parse(bytes(root, 'tools/windows-host-verifier/expected-build-contract.json'));
    const value = bytes(root, 'vendor/windows-host/3.0.20/System.Configuration.dll');
    if (value.length !== 93200 || sha(value) !== contract.privateConfigSha256) throw Error('Private configuration verification input mismatch.');
    const out = newDirectory(path.join(buildRoot, 'verification-inputs'));
    write(out, 'System.Configuration.dll', value);
    return {purpose: 'controlled private-versus-omitted probe only; never product runtime', sha256: sha(value)};
}
// The CLI loads receipt staging, which imports these guards back from this module.
module.exports = {COMMIT, REPOSITORY, KIT_FILES, KIT_INPUTS, safeRelative, physical, createPlan, verifyPackage, restoreSource, materializeKit, prepareVerificationInput};
if (require.main === module) {
    try {
        const [command, root, a, b] = process.argv.slice(2);
        let result;
        if (command === 'plan') result = createPlan(root);
        else if (command === 'verify-package') result = verifyPackage(root, a, b);
        else if (command === 'source') result = restoreSource(root, a, b);
        else if (command === 'kit') result = materializeKit(root, a);
        else if (command === 'verify-verifier') result = verifier.validate(root);
        else if (command === 'verification-input') result = prepareVerificationInput(root, a);
        else if (command === 'install-runner') result = require('./runner-host-receipt.cjs').install(root, a);
        else if (command === 'new-work') {
            if (path.resolve(a) !== path.resolve(root, '.work/actions-host-build')) throw Error('Unexpected Host runner work path.');
            result = {path: newDirectory(a)};
        }
        else throw Error('Usage: ci-source-built-host-plan.cjs <plan|verify-package|source|kit> root [input] [output/id]');
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    } catch (e) { process.stderr.write(e.message + '\n'); process.exitCode = 1; }
}
