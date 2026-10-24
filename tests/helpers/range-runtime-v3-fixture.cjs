'use strict';
const {temporaryRoot} = require('./range-fixture-root.cjs');
// Regenerate a small real-format v3 manifest with the pinned production PS block.
// This is not a full runtime/build/native acceptance fixture.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {CANDIDATE, sha} = require('../../tools/playback-range-windows-smoke.cjs');
const repo = path.resolve(__dirname, '../..');
const filesPath = path.join(repo, 'tests/fixtures/range-runtime-v3-inputs.json');
const manifestPath = path.join(repo, 'tests/fixtures/range-runtime-v3-manifest.json');
function git(relative) {return execFileSync('git', ['show', CANDIDATE.commit + ':' + relative], {cwd: repo, windowsHide: true});}
function generator() {
    const source = git('tools/build.ps1').toString('utf8'), start = source.indexOf('$files = @(Get-ChildItem'), end = source.indexOf('Write-Output "Build complete:', start);
    if (start < 0 || end < 0) throw Error('pinned-v3-generator-not-found'); return source.slice(start, end);
}
function regenerate() {
    const root = temporaryRoot('ete-v3-generator-'), runtime = path.join(root, 'runtime'); fs.mkdirSync(runtime);
    const payload = {'LICENSE.txt': 'Synthetic public fixture.\n', 'electronapp/fixture.txt': 'Range payload verifier fixture.\n',
        'build-input-provenance.json': '{"fixture":"inputs"}\n', 'source-provenance.json': '{"fixture":"source"}\n', 'runtime-provenance.json': '{"fixture":"runtime"}\n'};
    try {
        for (const [name, body] of Object.entries(payload)) {const file = path.join(runtime, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, body);}
        const metadata = {sourceCommit: CANDIDATE.commit, version: JSON.parse(git('package.json')).version, manifest: JSON.parse(git('vendor/runtime-manifest.json')),
            inputContract: {files: ['vendor/runtime-manifest.json', 'package-lock.json'].map(name => ({path: name, sha256: sha(git(name))}))}};
        fs.writeFileSync(path.join(root, 'inputs.json'), JSON.stringify(metadata));
        const block = generator();
        fs.writeFileSync(path.join(root, 'generate.ps1'), 'param([string]$destination, [string]$metadataFile)\n$ErrorActionPreference="Stop"\n' +
            '$data=Get-Content -LiteralPath $metadataFile -Raw | ConvertFrom-Json\n$sourceCommit=$data.sourceCommit\n$version=$data.version\n$manifest=$data.manifest\n$inputContract=$data.inputContract\n$utf8=[Text.UTF8Encoding]::new($false)\n' + block);
        execFileSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(root, 'generate.ps1'), runtime, path.join(root, 'inputs.json')], {windowsHide: true, stdio: 'pipe'});
        fs.copyFileSync(path.join(runtime, 'build-manifest.json'), manifestPath);
        fs.writeFileSync(filesPath, JSON.stringify({schema: 1, generator: {commit: CANDIDATE.commit, path: 'tools/build.ps1', blockSha256: sha(block)},
            payload: Object.fromEntries(Object.entries(payload).map(([name, body]) => [name, Buffer.from(body).toString('base64')]))}, null, 2) + '\n');
    } finally {fs.rmSync(root, {recursive: true, force: true});}
}
if (require.main === module) {
    if (process.argv.length !== 3 || process.argv[2] !== '--generate') throw Error('explicit --generate required'); regenerate();
}
module.exports = {generator, filesPath, manifestPath};
