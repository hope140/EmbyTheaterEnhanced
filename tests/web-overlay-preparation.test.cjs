'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const preparation = require('../tools/prepare-web-overlays.cjs');

function copyFile(root, relativePath) {
    const source = path.join(repoRoot, relativePath);
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(source, target);
}

function createContractRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-web-overlay-root-'));
    const paths = new Set([
        'tools/prepare-web-overlays.cjs',
        'tools/patch-external-player-registration.cjs',
        'tools/tracked-file-hash.cjs'
    ]);
    for (const contract of preparation.WEB_OVERLAY_CONTRACT) {
        paths.add(contract.basePath);
        if (contract.inputPath) paths.add(contract.inputPath);
        for (const generatorPath of contract.generatorPaths) paths.add(generatorPath);
    }
    for (const relativePath of paths) copyFile(root, relativePath);
    for (const args of [
        ['init', root],
        ['-C', root, 'config', 'user.name', 'ETE Test'],
        ['-C', root, 'config', 'user.email', 'ete-test@example.invalid'],
        ['-C', root, 'add', 'tools'],
        ['-C', root, 'commit', '-m', 'fixture']
    ]) {
        const result = childProcess.spawnSync('git', args, {encoding: 'utf8'});
        assert.equal(result.status, 0, result.stderr);
    }
    return root;
}

function outputHashes(runtime) {
    return preparation.WEB_OVERLAY_CONTRACT.map(contract => ({
        path: contract.runtimePath,
        hash: preparation.sha256(fs.readFileSync(path.join(runtime, contract.runtimePath)))
    }));
}

test('generates exact Web overlays without an ignored src/electronapp/www snapshot', () => {
    const root = createContractRoot();
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-web-overlay-runtime-'));
    try {
        const report = preparation.apply(root, runtime);
        assert.equal(report.status, 'passed');
        assert.equal(report.entries.some(entry => ['apiclient', 'toast-css'].includes(entry.id)), false);
        assert.equal(fs.existsSync(path.join(root, 'vendor/web-snapshot/user-patches')), false);
        assert.deepEqual(
            report.entries.map(entry => ({path: entry.runtimePath, hash: entry.runtimeSha256})),
            preparation.WEB_OVERLAY_CONTRACT.map(contract => ({
                path: contract.runtimePath,
                hash: contract.expectedOutputSha256
            }))
        );
        assert.equal(fs.existsSync(path.join(runtime, 'src', 'electronapp', 'www')), false);

        const first = outputHashes(runtime);
        const layoutContract = preparation.WEB_OVERLAY_CONTRACT.find(entry => entry.id === 'item-track-selection-layout');
        const layoutEntry = report.entries.find(entry => entry.id === 'item-track-selection-layout');
        const layoutOutput = fs.readFileSync(path.join(runtime, layoutContract.runtimePath), 'utf8');
        assert.equal(layoutEntry.baseSha256, layoutContract.expectedBaseSha256);
        assert.equal(layoutEntry.runtimeSha256, '0F3224D9266E4D69C1707DA19A125268CBAD717469A9F3F85F7F17405C7CC84B');
        assert.match(layoutOutput, /\.readOnlyContent,\r?\n  form \{\r?\n    max-width: 90ch;/);
        assert.match(layoutOutput, /\.secondaryText\.focusPreviewOverview \{\r?\n  max-width: 90ch !important;\r?\n\}/);
        assert.doesNotMatch(layoutOutput, /\.readOnlyContent \{\r?\n  -webkit-line-clamp: 3;\r?\n  max-width: 90ch !important;/);
        preparation.apply(root, runtime);
        assert.deepEqual(outputHashes(runtime), first);
        assert.equal(preparation.inspect(root, runtime).status, 'passed');
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
        fs.rmSync(runtime, {recursive: true, force: true});
    }
});

test('rejects an uncommitted compatibility generator before writing any output', () => {
    const root = createContractRoot();
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-web-overlay-dirty-'));
    try {
        fs.appendFileSync(path.join(root, 'tools/patch-plugin-settings.cjs'), '\n// dirty fixture\n');
        assert.throws(() => preparation.apply(root, runtime), /differs from HEAD/);
        assert.deepEqual(fs.readdirSync(runtime), []);
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
        fs.rmSync(runtime, {recursive: true, force: true});
    }
});

test('fails closed before writing when a required base is missing', () => {
    const root = createContractRoot();
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-web-overlay-missing-'));
    try {
        const inputPath = preparation.WEB_OVERLAY_CONTRACT.find(entry => entry.id === 'videoosd-lifecycle').basePath;
        fs.rmSync(path.join(root, inputPath));
        assert.throws(() => preparation.apply(root, runtime), /Web overlay base missing/);
        for (const contract of preparation.WEB_OVERLAY_CONTRACT) {
            assert.equal(fs.existsSync(path.join(runtime, contract.runtimePath)), false);
        }
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
        fs.rmSync(runtime, {recursive: true, force: true});
    }
});

test('fails closed before writing when a frozen base hash changes', () => {
    const root = createContractRoot();
    const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-web-overlay-base-'));
    try {
        const basePath = preparation.WEB_OVERLAY_CONTRACT.find(entry => entry.id === 'app-js').basePath;
        fs.appendFileSync(path.join(root, basePath), '\n// tampered\n', 'utf8');
        assert.throws(() => preparation.apply(root, runtime), /Web overlay base hash mismatch/);
        for (const contract of preparation.WEB_OVERLAY_CONTRACT) {
            assert.equal(fs.existsSync(path.join(runtime, contract.runtimePath)), false);
        }
    } finally {
        fs.rmSync(root, {recursive: true, force: true});
        fs.rmSync(runtime, {recursive: true, force: true});
    }
});
