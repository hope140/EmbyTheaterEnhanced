'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const helper = path.resolve(__dirname, '..', 'tools', 'verify-product-version.cjs');

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), {recursive: true});
    fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}

function makeSyntheticRoot(t, overrides = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-product-version-'));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const paths = {
        rootPackage: path.join(root, 'package.json'),
        rootLock: path.join(root, 'package-lock.json'),
        runtimePackage: path.join(root, 'dist', 'runtime', 'electronapp', 'package.json'),
        buildManifest: path.join(root, 'dist', 'runtime', 'build-manifest.json')
    };
    const version = '0.2.4';
    writeJson(paths.rootPackage, {name: 'synthetic-root', version: overrides.rootVersion || version});
    writeJson(paths.rootLock, {
        name: 'synthetic-root',
        version: overrides.lockVersion || version,
        lockfileVersion: 3,
        packages: {'': {name: 'synthetic-root', version: overrides.lockPackageVersion || version}}
    });
    writeJson(paths.runtimePackage, {name: 'emby-theater-enhanced', version: overrides.runtimeVersion || version});
    writeJson(paths.buildManifest, {schemaVersion: 2, sourceCommit: 'a'.repeat(40), version: overrides.buildVersion || version});
    return {root, paths};
}

function runHelper(paths) {
    return spawnSync(process.execPath, [helper, paths.rootPackage, paths.rootLock, paths.runtimePackage, paths.buildManifest], {
        encoding: 'utf8'
    });
}

test('synthetic package inputs with matching versions pass', t => {
    const fixture = makeSyntheticRoot(t);
    const result = runHelper(fixture.paths);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {status: 'passed', version: '0.2.4'});
});

test('one runtime version drift is rejected with an actionable mismatch', t => {
    const fixture = makeSyntheticRoot(t, {runtimeVersion: '0.2.3'});
    const result = runHelper(fixture.paths);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Product version mismatch/);
    assert.match(result.stderr, /runtime electronapp\/package\.json=0\.2\.3/);
});

test('missing and invalid version fields are rejected', t => {
    const missing = makeSyntheticRoot(t);
    const runtimePackage = JSON.parse(fs.readFileSync(missing.paths.runtimePackage, 'utf8'));
    delete runtimePackage.version;
    writeJson(missing.paths.runtimePackage, runtimePackage);
    const missingResult = runHelper(missing.paths);
    assert.equal(missingResult.status, 1);
    assert.match(missingResult.stderr, /runtime electronapp\/package\.json version is missing or invalid/);

    const invalid = makeSyntheticRoot(t, {lockPackageVersion: 'v0.2.4'});
    const invalidResult = runHelper(invalid.paths);
    assert.equal(invalidResult.status, 1);
    assert.match(invalidResult.stderr, /root package-lock\.json packages\[""\]\.version version is missing or invalid/);
});

test('package gate invokes the version verifier before VerifyOnly can return', () => {
    const packageScript = fs.readFileSync(path.resolve(__dirname, '..', 'tools', 'package.ps1'), 'utf8');
    const verifierCall = packageScript.indexOf('verify-product-version.cjs');
    const verifyOnlyReturn = packageScript.indexOf('if ($VerifyOnly)');
    const compilerCall = packageScript.indexOf("& $Compiler '/Q'");
    assert.notEqual(verifierCall, -1);
    assert.ok(verifierCall < verifyOnlyReturn);
    assert.ok(verifierCall < compilerCall);
    assert.match(packageScript, /Product version consistency validation failed before packaging/);
});
