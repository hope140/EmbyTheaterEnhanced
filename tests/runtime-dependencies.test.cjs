'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const contract = require('../tools/runtime-dependency-contract.cjs');
const tool = path.resolve(__dirname, '..', 'tools', 'copy-runtime-dependencies.cjs');

const INTEGRITY = 'sha512-YWJjZA==';

function writeFile(file, content) {
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, content);
}

function writeJson(file, value) {
    writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writePackage(projectRoot, packagePath, name, version, files = {}) {
    const packageRoot = path.join(projectRoot, ...packagePath.split('/'));
    writeJson(path.join(packageRoot, 'package.json'), {name, version, main: 'index.js'});
    writeFile(path.join(packageRoot, 'index.js'), files['index.js'] || `module.exports = ${JSON.stringify(`${name}@${version}`)};\n`);
    for (const [relative, content] of Object.entries(files)) {
        if (relative !== 'index.js') writeFile(path.join(packageRoot, relative), content);
    }
}

function makeFixture(temporaryRoot = os.tmpdir()) {
    // Resolve only the test fixture root, never an untrusted production input.
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(temporaryRoot, 'ete-runtime-deps-')));
    const runtime = path.join(root, 'dist', 'candidate');
    const source = path.join(root, '.work', 'runtime-dependencies-fixture');
    fs.mkdirSync(runtime, {recursive: true});
    fs.mkdirSync(source, {recursive: true});
    const packageJson = {
        name: 'fixture',
        version: '1.0.0',
        dependencies: {'@scope/tool': '2.0.0', long: '5.3.2'}
    };
    const packageLock = {
        name: 'fixture',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
            '': {name: 'fixture', version: '1.0.0', dependencies: {'@scope/tool': '2.0.0', long: '5.3.2'}},
            'node_modules/@scope/tool': {version: '2.0.0', integrity: INTEGRITY},
            'node_modules/long': {version: '5.3.2', integrity: INTEGRITY}
        }
    };
    writeJson(path.join(root, 'package.json'), packageJson);
    writeJson(path.join(root, 'package-lock.json'), packageLock);
    fs.copyFileSync(path.join(root, 'package.json'), path.join(source, 'package.json'));
    fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(source, 'package-lock.json'));

    const vendorProject = path.join(root, 'vendor', 'carnival', 'electronapp');
    for (const retained of contract.RETAINED_PACKAGES) {
        const name = retained.packagePath.endsWith('/node_modules/is-windows') ? 'is-windows' : retained.packagePath.split('/').at(-1);
        writePackage(vendorProject, retained.packagePath, name, retained.version);
    }
    const stale = {};
    for (let index = 0; index < 30; index += 1) stale[`legacy-${String(index).padStart(2, '0')}.txt`] = `legacy-${index}\n`;
    writePackage(vendorProject, 'node_modules/long', 'long', '3.2.0', stale);

    const fresh = {};
    for (let index = 0; index < 10; index += 1) fresh[`fresh-${String(index).padStart(2, '0')}.txt`] = `fresh-${index}\n`;
    writePackage(source, 'node_modules/long', 'long', '5.3.2', {
        ...fresh,
        'index.js': 'module.exports = {version: "5.3.2", source: "fresh"};\n'
    });
    writePackage(source, 'node_modules/@scope/tool', '@scope/tool', '2.0.0');
    const vendorFiles = contract.collectTree(vendorProject, 'electronapp');
    writeJson(path.join(root, 'vendor', 'runtime-manifest.json'), {
        schemaVersion: 1,
        files: vendorFiles.map(entry => ({...entry, category: 'C'}))
    });
    assert.equal(childProcess.spawnSync('git', ['init', root], {encoding: 'utf8'}).status, 0);
    childProcess.spawnSync('git', ['-C', root, 'config', 'user.name', 'ETE Test'], {encoding: 'utf8'});
    childProcess.spawnSync('git', ['-C', root, 'config', 'user.email', 'ete-test@example.invalid'], {encoding: 'utf8'});
    childProcess.spawnSync('git', ['-C', root, 'config', 'core.autocrlf', 'false'], {encoding: 'utf8'});
    assert.equal(childProcess.spawnSync('git', ['-C', root, 'add', 'package.json', 'package-lock.json', 'vendor/runtime-manifest.json'], {encoding: 'utf8'}).status, 0);
    assert.equal(childProcess.spawnSync('git', ['-C', root, 'commit', '-m', 'fixture'], {encoding: 'utf8'}).status, 0);
    const sourceCommit = childProcess.spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).stdout.trim();
    for (const relative of ['package.json', 'package-lock.json']) {
        const crlf = fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r?\n/g, '\r\n');
        fs.writeFileSync(path.join(root, relative), crlf);
        fs.writeFileSync(path.join(source, relative), crlf);
    }
    return {root, runtime, source, vendorProject, packageLock, sourceCommit};
}

function prepareRuntime(fixture) {
    const token = contract.createOwner(fixture.root, fixture.runtime, fixture.sourceCommit);
    fs.cpSync(fixture.vendorProject, path.join(fixture.runtime, 'electronapp'), {recursive: true});
    return token;
}

function cleanup(fixture) {
    fs.rmSync(fixture.root, {recursive: true, force: true});
}

test('temporary parent aliases produce a physical dependency fixture', t => {
    const parent = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-runtime-temp-alias-')));
    const physical = path.join(parent, 'physical');
    const alias = path.join(parent, 'alias');
    fs.mkdirSync(physical);
    fs.symlinkSync(physical, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const fixture = makeFixture(alias);
    try {
        assert.equal(path.dirname(fixture.root), physical);
        assert.equal(fs.lstatSync(fixture.root).isSymbolicLink(), false);
        assert.equal(fs.realpathSync.native(fixture.root), fixture.root);
        const token = prepareRuntime(fixture);
        contract.copyRuntimeDependencies(fixture.root, fixture.runtime, fixture.source, token);
        assert.equal(contract.inspectRuntime(fixture.root, fixture.runtime, fixture.sourceCommit).valid, true);
        const external = path.join(parent, 'external');
        fs.mkdirSync(external);
        fs.symlinkSync(external, path.join(fixture.source, 'node_modules', 'long', 'linked'),
            process.platform === 'win32' ? 'junction' : 'dir');
        // A successful copy consumes ownership; the rejection needs a fresh output.
        const rejectedFixture = {...fixture, runtime: path.join(fixture.root, 'dist', 'junction-candidate')};
        fs.mkdirSync(rejectedFixture.runtime);
        const rejectedToken = prepareRuntime(rejectedFixture);
        assert.throws(() => contract.copyRuntimeDependencies(
            rejectedFixture.root, rejectedFixture.runtime, rejectedFixture.source, rejectedToken), /symlink or junction/);
    } finally {
        cleanup(fixture);
        fs.rmSync(parent, {recursive: true, force: true});
    }
});

test('fresh locked package directories replace stale Carnival bytes and remain loadable', () => {
    const fixture = makeFixture();
    try {
        const token = prepareRuntime(fixture);
        const result = contract.copyRuntimeDependencies(fixture.root, fixture.runtime, fixture.source, token);
        assert.equal(result.packageCount, 2);
        assert.equal(fs.existsSync(path.join(fixture.runtime, contract.OWNER_FILE)), false);
        assert.equal(fs.existsSync(path.join(fixture.runtime, contract.PROVENANCE_FILE)), true);
        assert.equal(fs.existsSync(path.join(fixture.runtime, 'electronapp', 'node_modules', 'long', 'legacy-00.txt')), false);
        assert.equal(fs.existsSync(path.join(fixture.runtime, 'electronapp', 'node_modules', 'long', 'fresh-09.txt')), true);
        const loaded = require(path.join(fixture.runtime, 'electronapp', 'node_modules', 'long'));
        assert.deepEqual(loaded, {version: '5.3.2', source: 'fresh'});
        assert.equal(contract.inspectRuntime(fixture.root, fixture.runtime, fixture.sourceCommit).valid, true);
        const record = JSON.parse(fs.readFileSync(path.join(fixture.runtime, contract.PROVENANCE_FILE), 'utf8'));
        const trackedHash = require('../tools/tracked-file-hash.cjs');
        assert.equal(record.installContract.packageJsonSha256, trackedHash.hashTrackedTextFile(fixture.root, 'package.json'));
        assert.equal(record.installContract.packageLockSha256, trackedHash.hashTrackedTextFile(fixture.root, 'package-lock.json'));
        assert.equal(record.selected.sourceTreeSha256, record.selected.treeSha256);
        assert.equal(record.selected.files.some(file => file.path.endsWith('legacy-00.txt')), false);
        assert.equal(record.retainedPackages.length, 7);
    } finally {
        cleanup(fixture);
    }
});

test('wrong ownership token cannot mutate the runtime', () => {
    const fixture = makeFixture();
    try {
        prepareRuntime(fixture);
        assert.throws(() => contract.copyRuntimeDependencies(
            fixture.root, fixture.runtime, fixture.source, 'b'.repeat(64)), /ownership marker does not match/);
        assert.equal(fs.existsSync(path.join(fixture.runtime, 'electronapp', 'node_modules', 'long', 'legacy-00.txt')), true);
        assert.equal(fs.existsSync(path.join(fixture.runtime, contract.OWNER_FILE)), true);
    } finally {
        cleanup(fixture);
    }
});

test('unowned Carnival dependency files fail before selected directories are deleted', () => {
    const fixture = makeFixture();
    try {
        const token = prepareRuntime(fixture);
        writeFile(path.join(fixture.runtime, 'electronapp', 'node_modules', 'surprise', 'index.js'), 'unexpected\n');
        assert.throws(() => contract.copyRuntimeDependencies(
            fixture.root, fixture.runtime, fixture.source, token), /unowned dependency file/);
        assert.equal(fs.existsSync(path.join(fixture.runtime, 'electronapp', 'node_modules', 'long', 'legacy-00.txt')), true);
    } finally {
        cleanup(fixture);
    }
});

test('retained Carnival bytes must match the immutable vendor source', () => {
    const fixture = makeFixture();
    try {
        const token = prepareRuntime(fixture);
        writeFile(path.join(fixture.runtime, 'electronapp', 'node_modules', 'detect-rpi', 'index.js'), 'tampered\n');
        assert.throws(() => contract.copyRuntimeDependencies(
            fixture.root, fixture.runtime, fixture.source, token), /Inherited Carnival dependency bytes mismatch/);
    } finally {
        cleanup(fixture);
    }
});

test('retained Carnival source is bound to the committed runtime manifest', () => {
    const fixture = makeFixture();
    try {
        const token = prepareRuntime(fixture);
        writeFile(path.join(fixture.vendorProject, 'node_modules', 'detect-rpi', 'index.js'), 'tampered vendor\n');
        assert.throws(() => contract.copyRuntimeDependencies(
            fixture.root, fixture.runtime, fixture.source, token), /source versus committed manifest mismatch/);
    } finally {
        cleanup(fixture);
    }
});

test('source package lock and package identity must match the gated inputs', () => {
    const lockFixture = makeFixture();
    try {
        const token = prepareRuntime(lockFixture);
        writeFile(path.join(lockFixture.source, 'package-lock.json'), '{}\n');
        assert.throws(() => contract.copyRuntimeDependencies(
            lockFixture.root, lockFixture.runtime, lockFixture.source, token), /package-lock.json does not match/);
    } finally {
        cleanup(lockFixture);
    }

    const identityFixture = makeFixture();
    try {
        const token = prepareRuntime(identityFixture);
        const manifest = path.join(identityFixture.source, 'node_modules', 'long', 'package.json');
        writeJson(manifest, {name: 'long', version: '5.3.1'});
        assert.throws(() => contract.copyRuntimeDependencies(
            identityFixture.root, identityFixture.runtime, identityFixture.source, token), /package identity mismatch/);
    } finally {
        cleanup(identityFixture);
    }
});

test('missing lock integrity and native addons are rejected', () => {
    const integrityFixture = makeFixture();
    try {
        const token = prepareRuntime(integrityFixture);
        delete integrityFixture.packageLock.packages['node_modules/long'].integrity;
        writeJson(path.join(integrityFixture.root, 'package-lock.json'), integrityFixture.packageLock);
        fs.copyFileSync(path.join(integrityFixture.root, 'package-lock.json'), path.join(integrityFixture.source, 'package-lock.json'));
        assert.throws(() => contract.copyRuntimeDependencies(
            integrityFixture.root, integrityFixture.runtime, integrityFixture.source, token), /Locked sha512 integrity/);
    } finally {
        cleanup(integrityFixture);
    }

    const addonFixture = makeFixture();
    try {
        const token = prepareRuntime(addonFixture);
        writeFile(path.join(addonFixture.source, 'node_modules', 'long', 'binding.node'), 'native\n');
        assert.throws(() => contract.copyRuntimeDependencies(
            addonFixture.root, addonFixture.runtime, addonFixture.source, token), /native addon/);
    } finally {
        cleanup(addonFixture);
    }
});

test('non-canonical lock package paths are rejected before filesystem mutation', () => {
    for (const unsafePath of ['node_modules/../escape', 'node_modules/bad:name', 'node_modules//empty']) {
        const fixture = makeFixture();
        try {
            const token = prepareRuntime(fixture);
            fixture.packageLock.packages[unsafePath] = {version: '1.0.0', integrity: INTEGRITY};
            writeJson(path.join(fixture.root, 'package-lock.json'), fixture.packageLock);
            fs.copyFileSync(path.join(fixture.root, 'package-lock.json'), path.join(fixture.source, 'package-lock.json'));
            assert.throws(() => contract.copyRuntimeDependencies(
                fixture.root, fixture.runtime, fixture.source, token), /non-canonical production package path/i);
            assert.equal(fs.existsSync(path.join(fixture.runtime, 'electronapp', 'node_modules', 'long', 'legacy-00.txt')), true);
        } finally {
            cleanup(fixture);
        }
    }
});

test('source and destination path boundaries reject repository, source, vendor, and reparse trees', t => {
    const fixture = makeFixture();
    try {
        const token = prepareRuntime(fixture);
        for (const unsafe of [fixture.root, path.join(fixture.root, 'src'), path.join(fixture.root, 'vendor')]) {
            if (!fs.existsSync(unsafe)) fs.mkdirSync(unsafe, {recursive: true});
            assert.throws(() => contract.copyRuntimeDependencies(
                fixture.root, fixture.runtime, unsafe, token), /Source project root must be/);
        }
        const external = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-runtime-deps-link-'));
        const linked = path.join(fixture.source, 'node_modules', 'long', 'linked');
        try {
            fs.symlinkSync(external, linked, 'junction');
        } catch (error) {
            if (error.code === 'EPERM') {
                t.diagnostic('Junction creation is unavailable; reparse assertion was not exercised.');
                return;
            }
            throw error;
        }
        assert.throws(() => contract.copyRuntimeDependencies(
            fixture.root, fixture.runtime, fixture.source, token), /symlink or junction/);
        fs.rmSync(external, {recursive: true, force: true});
    } finally {
        cleanup(fixture);
    }
});

test('a reparse-point runtime ancestor is rejected before deletion', t => {
    const fixture = makeFixture();
    const externalParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-runtime-deps-target-'));
    try {
        const token = prepareRuntime(fixture);
        const electronapp = path.join(fixture.runtime, 'electronapp');
        const redirected = path.join(externalParent, 'electronapp');
        fs.renameSync(electronapp, redirected);
        try {
            fs.symlinkSync(redirected, electronapp, 'junction');
        } catch (error) {
            if (error.code === 'EPERM') {
                t.diagnostic('Junction creation is unavailable; target-ancestor assertion was not exercised.');
                return;
            }
            throw error;
        }
        assert.throws(() => contract.copyRuntimeDependencies(
            fixture.root, fixture.runtime, fixture.source, token), /Runtime node_modules contains a symlink or junction/);
        assert.equal(fs.existsSync(path.join(redirected, 'node_modules', 'long', 'legacy-00.txt')), true);
    } finally {
        cleanup(fixture);
        fs.rmSync(externalParent, {recursive: true, force: true});
    }
});

test('validate detects later selected-package additions and byte changes', () => {
    const fixture = makeFixture();
    try {
        const token = prepareRuntime(fixture);
        contract.copyRuntimeDependencies(fixture.root, fixture.runtime, fixture.source, token);
        const longRoot = path.join(fixture.runtime, 'electronapp', 'node_modules', 'long');
        writeFile(path.join(longRoot, 'extra.txt'), 'extra\n');
        assert.throws(() => contract.inspectRuntime(fixture.root, fixture.runtime, fixture.sourceCommit), /file count mismatch/);
        fs.rmSync(path.join(longRoot, 'extra.txt'));
        writeFile(path.join(longRoot, 'index.js'), 'changed\n');
        assert.throws(() => contract.inspectRuntime(fixture.root, fixture.runtime, fixture.sourceCommit), /mismatch at/);
    } finally {
        cleanup(fixture);
    }
});

test('validate binds provenance to the caller expected source commit and committed manifest', () => {
    const fixture = makeFixture();
    try {
        const token = prepareRuntime(fixture);
        contract.copyRuntimeDependencies(fixture.root, fixture.runtime, fixture.source, token);
        assert.throws(() => contract.inspectRuntime(
            fixture.root, fixture.runtime, 'f'.repeat(40)), /source commit mismatch/);
        const manifest = path.join(fixture.root, 'vendor', 'runtime-manifest.json');
        fs.appendFileSync(manifest, ' ');
        assert.throws(() => contract.inspectRuntime(
            fixture.root, fixture.runtime, fixture.sourceCommit), /differs from HEAD/);
    } finally {
        cleanup(fixture);
    }
});

test('CLI owner, copy, and commit-bound validate commands form one build contract', () => {
    const fixture = makeFixture();
    try {
        const owner = childProcess.spawnSync(process.execPath, [tool, 'create-owner', fixture.root, fixture.runtime, fixture.sourceCommit], {encoding: 'utf8'});
        assert.equal(owner.status, 0, owner.stderr);
        const token = owner.stdout.trim();
        assert.match(token, /^[0-9a-f]{64}$/);
        fs.cpSync(fixture.vendorProject, path.join(fixture.runtime, 'electronapp'), {recursive: true});
        const copy = childProcess.spawnSync(process.execPath,
            [tool, 'copy', fixture.root, fixture.runtime, fixture.source, token], {encoding: 'utf8'});
        assert.equal(copy.status, 0, copy.stderr);
        assert.equal(JSON.parse(copy.stdout).packageCount, 2);
        const validate = childProcess.spawnSync(process.execPath,
            [tool, 'validate', fixture.root, fixture.runtime, fixture.sourceCommit], {encoding: 'utf8'});
        assert.equal(validate.status, 0, validate.stderr);
        assert.equal(JSON.parse(validate.stdout).valid, true);
        const wrongCommit = childProcess.spawnSync(process.execPath,
            [tool, 'validate', fixture.root, fixture.runtime, '0'.repeat(40)], {encoding: 'utf8'});
        assert.equal(wrongCommit.status, 1);
        assert.match(wrongCommit.stderr, /source commit mismatch/);
    } finally {
        cleanup(fixture);
    }
});
