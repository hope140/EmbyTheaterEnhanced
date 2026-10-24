'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const {hashTrackedTextFile} = require('./tracked-file-hash.cjs');
const verifier = require('./host-verifier-input.cjs');

// Only consumed metadata, generators, validators and delivered notices belong
// here. Ordinary product source is already materialized from commit blobs.
const NOTICE_PATHS = Object.freeze([
    'LICENSE', 'THIRD_PARTY_NOTICES.md', 'src/electronapp/www/modules/emby-apiclient/LICENSE.md', 'native/windows-host/LICENSE.md', 'native/windows-host/LICENSE-Helpers-MIT.txt', 'native/windows-host/LICENSE-Newtonsoft-MIT.md', 'native/windows-host/README.md', 'docs/LICENSING.md', 'docs/SOURCE_MATERIALS.md', 'docs/WINDOWS_HOST_INPUT.md', 'docs/INHERITED_NPM_INPUT.md', 'docs/RUNTIME_TEMPLATES.md', 'docs/LIBMPV_INPUT.md', 'docs/COMPATIBILITY_RESOURCES_INPUT.md', 'docs/SMALL_RUNTIME_INPUT.md', 'docs/MODEL_COMPATIBILITY_INPUT.md'
]);
const INPUT_PATHS = Object.freeze([
    'package.json', 'package-lock.json', 'src/web-api/selection.json', 'src/config/system-defaults.json',
    'src/localization/mpvplayer/zh-CN.json',
    'src/web-api/INPUT_MANIFEST.json',
    'src/web-api/LICENSE.md',
    'src/web-api/licensed/LICENSE.md',
    'src/web-api/licensed/apiclient.js',
    'src/web-api/licensed/connectionmanager.js',
    'src/web-api/licensed/events.js',
    'src/web-api/src/apiclient.js',
    'src/web-api/src/connectionmanager.js',
    'src/web-api/src/events.js',
    'src/web-api/src/mit-apiclient.js',
    'src/web-api/src/mit-connectionmanager.js',
    'src/web-api/src/transport.js',
    'src/web-api/tools/build-amd.mjs',
    'src/web-api/tools/prepare-base.py',
    'vendor/runtime-manifest.json', 'vendor/electron-runtime-manifest.json',
    'vendor/web-snapshot-manifest.json',
    'vendor/snapshot-history/web-snapshot-v1-manifest.json',
    'vendor/snapshot-history/compatibility-resources-v1-manifest.json',
    'vendor/snapshot-history/small-runtime-v1-manifest.json',
    'vendor/windows-host-manifest.json', 'vendor/inherited-npm-manifest.json', 'vendor/runtime-templates-manifest.json', 'vendor/libmpv-input-manifest.json', 'vendor/compatibility-resources-manifest.json', 'vendor/small-runtime-manifest.json', 'vendor/model-compatibility-manifest.json',
    'tools/templates/runtime/package.json','tools/templates/runtime/preload.js','tools/templates/runtime/Emby.Theater.exe.config',
    'vendor/native-helper-manifest.json', 'vendor/toolchain-manifest.json',
    'installer/EmbyTheaterEnhanced.iss', 'installer/installer-guard.iss',
    'installer/retired-runtime.iss', 'installer/retired-runtime-identities.iss', 'installer/retired-runtime.json',
    'native/windows-host/change-manifest.json', 'native/windows-host/upstream-source-manifest.json',
    'native/windows-host/host-retirement.patch', 'native/windows-host/Apply-SourceChanges.ps1',
    'native/windows-host/changes/Emby.Theater/Program.cs', 'native/windows-host/changes/Emby.Theater/Emby.Theater.csproj',
    'native/windows-host/changes/Emby.Theater/App/ApplicationHost.cs', 'native/windows-host/changes/Emby.Theater/App/ElectronApp.cs',
    'tools/source-built-host-input.cjs', 'tools/host-json-input.cjs', 'tools/prepare-host-json.py', 'vendor/host-json-manifest.json', 'native/windows-host/json-zip-input.json',
    'tools/ci-source-built-host-plan.cjs', 'tools/ci-source-built-host.ps1', 'tools/runner-host-receipt.cjs',
    'tools/ci-phase-timing.ps1',
    'tools/Test-SourceBuiltHost.ps1', 'tools/host-verifier-input.cjs', ...verifier.PATHS,
    'tools/windows-host-build/Build-UnifiedHost.ps1', 'tools/windows-host-build/Get-SourceIdentity.ps1',
    'tools/windows-host-build/New-VerifiedRuntime.ps1', 'tools/windows-host-build/EXPECTED-ASSEMBLY-REFERENCES.json',
    'tools/windows-host-build/EXPECTED-SOURCE-IDENTITY.json', 'tools/windows-host-build/REFERENCES.json',
    'tools/windows-host-build/VERIFIED-RUNTIME.schema.json',
    'native/windows-host/changes/Emby.Theater/Serialization/JsonSerializer.cs',
    'native/windows-host/changes/Emby.Theater/Serialization/CompatibleJsonCodec.cs',
    'native/windows-host/changes/Emby.Theater/Archiving/ZipClient.cs',
    'native/windows-host/changes/Emby.Theater/Archiving/FrameworkZipExtractor.cs',
    'installer/languages/ChineseSimplified.isl',
    'installer/languages/LICENSE.txt', 'installer/languages/SOURCE.md',
    'installer/languages/SHA256SUMS.txt',
    'tools/build.ps1', 'tools/package.ps1', 'tools/build-input-contract.cjs',
    'tools/build-input-provenance.cjs', 'tools/copy-tracked-product-sources.cjs',
    'tools/build-toolchains.cjs', 'tools/build-toolchains.lock.json',
    'tools/tracked-file-hash.cjs', 'tools/prepare-preload.cjs',
    'tools/prepare-web-overlays.cjs', 'tools/patch-videoosd-lifecycle.cjs', 'tools/patch-connectionmanager-transport.cjs',
    'tools/patch-externalplayer-residue.cjs', 'tools/patch-item-controls.cjs',
    'tools/patch-content-width.cjs',
    'tools/patch-actionsheet-layout.cjs',
    'tools/patch-item-lifecycle.cjs',
        'tools/patch-search-ui.cjs', 'tools/patch-select-cancel.cjs', 'tools/patch-startup.cjs',
    'tools/patch-external-player-registration.cjs', 'tools/patch-plugin-settings.cjs', 'tools/patch-server-home.cjs', 'tools/patch-movie-browser.cjs',
    'tools/patch-playbackmanager.cjs', 'tools/runtime-exclusions.cjs',
    'tools/copy-runtime-dependencies.cjs', 'tools/electron-runtime-input.cjs',
    'tools/assemble-runtime-base.cjs',
    'tools/web-snapshot-input.cjs', 'tools/validate-build-materials.cjs',
    'tools/windows-host-input.cjs', 'tools/inherited-npm-input.cjs', 'tools/runtime-template-input.cjs', 'tools/libmpv-input.cjs', 'tools/prepare-libmpv.cjs', 'tools/download-libmpv.ps1', 'tools/compatibility-resources-input.cjs', 'tools/small-runtime-input.cjs', 'tools/model-compatibility-input.cjs', 'tools/prepare-model-compatibility.ps1', 'tools/prepare-windows-host.ps1',
    'tools/runtime-dependency-contract.cjs',
    'tools/windows-native-media-input.cjs','tools/windows-native-preview-deps.cjs','tools/download-native-preview-deps.py',
    'native/windows-media/dwm.cjs','native/windows-media/winrt.cjs','native/windows-media/system-libraries.cjs',
    'native/windows-media/package.json','native/windows-media/package-lock.json','native/windows-media/registry-input.json','native/windows-media/loader-input.json',
    'tools/build-native-helper.ps1', 'tools/materialize-native-helper-source.cjs',
    'tools/native-helper-contract.cjs', 'tools/native-helper-provenance.cjs',
    'tools/source-provenance.cjs', 'tools/runtime-provenance.cjs',
    'tools/verify-product-version.cjs', ...NOTICE_PATHS
].sort());

function git(root, args) {
    const result = cp.spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
    if (result.error || result.status !== 0) throw new Error('Unable to read committed build inputs.');
    return result.stdout.trim();
}

function physicalInput(root, relativePath) {
    const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
    let current = root;
    for (const segment of ['', ...relativePath.split('/')]) {
        if (segment) current = path.join(current, segment);
        if (fs.lstatSync(current).isSymbolicLink() ||
            normalize(fs.realpathSync.native(current)) !== normalize(current)) {
            throw new Error('Build input links or redirects are forbidden: ' + relativePath);
        }
    }
}

function blobObjectId(bytes) {
    return crypto.createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}

function committedInputs(root, sourceCommit, inputPaths = INPUT_PATHS) {
    if (!/^[a-f0-9]{40}$/i.test(sourceCommit || '') || !Array.isArray(inputPaths) ||
        new Set(inputPaths).size !== inputPaths.length || inputPaths.some(p => typeof p !== 'string' ||
            !p || /[\\:\x00-\x1f]/.test(p) || p.startsWith('/') || p.split('/').some(s => !s || s === '.' || s === '..'))) {
        throw new Error('Invalid committed input selection.');
    }
    // Keep batches invocation-local. HEAD and every physical working path are
    // checked afresh by inspect; no successful validation is cached.
    let tree;
    try { tree = git(root, ['ls-tree', '-z', sourceCommit, '--', ...inputPaths]); }
    catch { return null; }
    const lines = new Map();
    for (const line of tree.split('\0').filter(Boolean)) {
        const tab = line.indexOf('\t');
        const relativePath = line.slice(tab + 1);
        if (tab < 0 || !inputPaths.includes(relativePath) || lines.has(relativePath)) return null;
        lines.set(relativePath, line);
    }
    const regular = inputPaths.flatMap(relativePath => {
        const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(lines.get(relativePath) || '');
        return match ? [{relativePath, objectId: match[2]}] : [];
    });
    const blobs = new Map();
    if (!regular.length) return {lines, blobs};
    let result;
    try {
        result = cp.spawnSync('git', ['-C', root, 'cat-file', '--batch'], {
            input: regular.map(entry => entry.objectId + '\n').join(''),
            encoding: null,
            maxBuffer: 16 * 1024 * 1024
        });
    } catch { return {lines, blobs}; }
    // A combined output can exceed the old per-file limit, or Git can fail
    // after an otherwise valid prefix. Fall back to the original per-file
    // reads, preserving their limits and first-error order.
    if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) return {lines, blobs};
    const output = result.stdout;
    let offset = 0;
    for (const entry of regular) {
        const end = output.indexOf(0x0a, offset);
        if (end < 0) return {lines, blobs: new Map()};
        const header = output.subarray(offset, end).toString('latin1');
        offset = end + 1;
        if (header === entry.objectId + ' missing') continue;
        const match = /^([0-9a-f]{40}) blob (0|[1-9][0-9]*)$/.exec(header);
        if (!match || match[1] !== entry.objectId) return {lines, blobs: new Map()};
        const size = Number(match[2]);
        if (!Number.isSafeInteger(size) || size > 16 * 1024 * 1024 ||
            offset + size >= output.length || output[offset + size] !== 0x0a) {
            return {lines, blobs: new Map()};
        }
        const bytes = output.subarray(offset, offset + size);
        const objectId = blobObjectId(bytes);
        if (objectId !== entry.objectId) return {lines, blobs: new Map()};
        blobs.set(entry.relativePath, bytes);
        offset += size + 1;
    }
    if (offset !== output.length) return {lines, blobs: new Map()};
    return {lines, blobs};
}

function inspect(rootArg, sourceCommit) {
    const root = path.resolve(rootArg);
    if (!/^[0-9a-f]{40}$/i.test(sourceCommit || '') || git(root, ['rev-parse', 'HEAD']) !== sourceCommit.toLowerCase()) {
        throw new Error('Build input sourceCommit must equal HEAD.');
    }
    const committed = committedInputs(root, sourceCommit);
    const files = INPUT_PATHS.map(relativePath => {
        const line = committed ? committed.lines.get(relativePath) || '' : git(root, ['ls-tree', sourceCommit, '--', relativePath]);
        const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
        if (!match || match[3] !== relativePath) throw new Error('Build input must be a committed regular blob: ' + relativePath);
        physicalInput(root, relativePath);
        let blob = committed?.blobs.get(relativePath);
        if (verifier.BINARY_PATHS.includes(relativePath)) {
            if (blob === undefined) {
                const result = cp.spawnSync('git', ['-C', root, 'show', 'HEAD:' + relativePath], {encoding: null, maxBuffer: 16 * 1024 * 1024});
                if (result.error || result.status !== 0) throw new Error('Unable to read committed build inputs.');
                blob = result.stdout;
            }
            if (!fs.readFileSync(path.join(root, relativePath)).equals(blob)) throw new Error('Tracked generator differs from HEAD: ' + relativePath);
        }
        return {path: relativePath, gitBlobObjectId: match[2],
            sha256: hashTrackedTextFile(root, relativePath, blob).toLowerCase()};
    });
    return {schemaVersion: 1, sourceCommit: sourceCommit.toLowerCase(),
        relation: 'HEAD Git blobs; working text must match after CRLF-to-LF normalization', files};
}

function materializeNotices(root, runtime, contract) {
    // Keep the existing public entry point while centralizing destination
    // preflight and safe creation with the build-input provenance writer.
    return require('./build-input-provenance.cjs').materializeNotices(root, runtime, contract);
}

module.exports = {INPUT_PATHS, NOTICE_PATHS, inspect, materializeNotices, committedInputs, physicalInput, blobObjectId};
if (require.main === module) {
    const [root, sourceCommit] = process.argv.slice(2);
    process.stdout.write(JSON.stringify(inspect(root, sourceCommit)) + '\n');
}
