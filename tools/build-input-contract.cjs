'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const {readBlob, sha256} = require('./copy-tracked-product-sources.cjs');
const {hashTrackedTextFile} = require('./tracked-file-hash.cjs');

// Only consumed metadata, generators, validators and delivered notices belong
// here. Ordinary product source is already materialized from commit blobs.
const NOTICE_PATHS = Object.freeze([
    'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs/LICENSING.md', 'docs/SOURCE_MATERIALS.md'
]);
const INPUT_PATHS = Object.freeze([
    'package.json', 'package-lock.json',
    'vendor/runtime-manifest.json', 'vendor/electron-runtime-manifest.json',
    'vendor/native-helper-manifest.json', 'vendor/toolchain-manifest.json',
    'installer/EmbyTheaterEnhanced.iss',
    'tools/build.ps1', 'tools/package.ps1', 'tools/build-input-contract.cjs',
    'tools/build-input-provenance.cjs', 'tools/copy-tracked-product-sources.cjs',
    'tools/build-toolchains.cjs', 'tools/build-toolchains.lock.json',
    'tools/tracked-file-hash.cjs', 'tools/prepare-preload.cjs',
    'tools/prepare-web-overlays.cjs', 'tools/patch-external-player-registration.cjs',
    'tools/patch-playbackmanager.cjs', 'tools/runtime-exclusions.cjs',
    'tools/copy-runtime-dependencies.cjs', 'tools/electron-runtime-input.cjs',
    'tools/runtime-dependency-contract.cjs',
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

function inspect(rootArg, sourceCommit) {
    const root = path.resolve(rootArg);
    if (!/^[0-9a-f]{40}$/i.test(sourceCommit || '') || git(root, ['rev-parse', 'HEAD']) !== sourceCommit.toLowerCase()) {
        throw new Error('Build input sourceCommit must equal HEAD.');
    }
    const files = INPUT_PATHS.map(relativePath => {
        const line = git(root, ['ls-tree', sourceCommit, '--', relativePath]);
        const match = /^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
        if (!match || match[3] !== relativePath) throw new Error('Build input must be a committed regular blob: ' + relativePath);
        physicalInput(root, relativePath);
        return {path: relativePath, gitBlobObjectId: match[2], sha256: hashTrackedTextFile(root, relativePath).toLowerCase()};
    });
    return {schemaVersion: 1, sourceCommit: sourceCommit.toLowerCase(),
        relation: 'HEAD Git blobs; working text must match after CRLF-to-LF normalization', files};
}

function materializeNotices(root, runtime, contract) {
    for (const relativePath of NOTICE_PATHS) {
        const entry = contract.files.find(item => item.path === relativePath);
        const bytes = readBlob(root, entry.gitBlobObjectId);
        if (sha256(bytes).toLowerCase() !== entry.sha256) throw new Error('Notice blob identity mismatch.');
        const output = path.join(runtime, relativePath);
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, bytes);
    }
}

if (require.main === module) {
    const [root, sourceCommit] = process.argv.slice(2);
    process.stdout.write(JSON.stringify(inspect(root, sourceCommit)) + '\n');
}
module.exports = {INPUT_PATHS, NOTICE_PATHS, inspect, materializeNotices};
