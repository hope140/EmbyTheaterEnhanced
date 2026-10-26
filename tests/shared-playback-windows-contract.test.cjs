'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const trial = require('../src/electronapp/enhanced/shared-playback-cache/trial');
const contract = require('../tools/shared-playback-cache/windows-contract.cjs');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('invalid public arguments produce only a fixed safe contract code', () => {
    for (const value of [undefined, null, {}, {repo: 'https://private.invalid/?token=secret'}]) {
        assert.throws(() => contract.verifyCandidate(value), /^Error: windows-contract-physical-path-invalid$/);
    }
});

function fixture(t) {
    const parent = temporaryRoot('ete-windows-contract-');
    t.after(() => fs.rmSync(parent, {recursive: true, force: true}));
    const repo = path.join(parent, 'repo'), runtime = path.join(parent, 'runtime');
    fs.mkdirSync(repo); fs.mkdirSync(runtime);
    const put = (root, member, bytes) => {
        const file = path.join(root, member); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, bytes);
    };
    const json = (root, member, value) => put(root, member, JSON.stringify(value, null, 2) + '\n');
    const git = (...args) => cp.execFileSync('git', ['-C', repo, ...args], {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}).trim();
    git('init', '-q'); git('config', 'user.name', 'Owned Fixture'); git('config', 'user.email', 'owned@fixture.invalid');
    const sourceMembers = [...trial.SOURCE_FILES, 'electronapp/enhanced/extra-product-source.js'];
    sourceMembers.forEach((member, index) => put(repo, 'src/' + member, `// exact frozen Git source fixture ${index}\n`));
    const helperBytes = Buffer.from('owned helper executable; never launched'), libmpvBytes = Buffer.from('owned native library; never loaded');
    const executable = Buffer.from('owned Electron executable; never launched'), asarBytes = Buffer.from('physical ASAR archive fixture');
    const nativeSource = 'constexpr const char* HELPER_VERSION = "1.0.0";\n';
    const native = {schemaVersion: 1, protocolVersion: 1, sourcePath: 'native/mpv-helper/helper.cpp',
        runtimePath: 'electronapp/native-helper/helper.exe', provenancePath: 'native-helper-provenance.json',
        libmpv: {runtimePath: 'electronapp/libmpv/x64/mpv.dll', sha256: hash(libmpvBytes), version: 'owned-1', clientApi: '2.5'},
        clientHeader: {sha256: hash('owned-header')}, compiler: {sha256: hash('owned-compiler'), version: 'owned', flags: ['-O2'], linkerFlags: ['-lowned']}};
    const electronRows = [{path: 'electron.exe', sha256: hash(executable).toUpperCase()},
        {path: 'resources/default_app.asar', sha256: hash(asarBytes).toUpperCase()}].sort((a, b) => a.path.localeCompare(b.path));
    const electron = {schemaVersion: 1, version: 'owned-electron', runtime: {runtimePath: 'x64/electron',
        electronPath: 'electron.exe', electronExeSha256: hash(executable), fileCount: electronRows.length,
        treeSha256: contract.payloadSetSha256(electronRows)}};
    put(repo, native.sourcePath, nativeSource);
    json(repo, 'vendor/native-helper-manifest.json', native); json(repo, 'vendor/electron-runtime-manifest.json', electron);
    json(repo, 'vendor/runtime-manifest.json', {schemaVersion: 1, owned: true});
    json(repo, 'package-lock.json', {name: 'owned-fixture', lockfileVersion: 3});
    json(repo, 'package.json', {name: 'owned-fixture'});
    put(repo, 'installer/owned.iss', '; owned fixture\n');
    git('add', '.'); git('commit', '-q', '-m', 'owned frozen product fixture');
    const productCommit = git('rev-parse', 'HEAD');
    const rows = sourceMembers.map(member => {
        const sourcePath = 'src/' + member;
        const exact = cp.execFileSync('git', ['-C', repo, 'show', productCommit + ':' + sourcePath]);
        put(runtime, member, exact);
        return {sourcePath, runtimePath: member, sourceCommit: productCommit, gitMode: '100644',
            gitBlobObjectId: git('rev-parse', productCommit + ':' + sourcePath), relation: 'git-blob-copy',
            sourceSha256: hash(exact).toUpperCase(), runtimeSha256: hash(exact).toUpperCase()};
    });
    put(runtime, native.runtimePath, helperBytes); put(runtime, native.libmpv.runtimePath, libmpvBytes);
    put(runtime, 'x64/electron/electron.exe', executable); put(runtime, 'x64/electron/resources/default_app.asar', asarBytes);
    const runtimeRecord = {schemaVersion: 1, sourceCommit: productCommit, validatedProductScope: {
        sourceRoot: 'src/electronapp', runtimeRoot: 'electronapp', sourceSelection: 'git-commit-blobs',
        includesIgnoredSourceFiles: false, sourceCommit: productCommit, fileCount: rows.length, files: rows},
        electronRuntime: {manifestPath: 'vendor/electron-runtime-manifest.json',
            manifestSha256: hash(fs.readFileSync(path.join(repo, 'vendor/electron-runtime-manifest.json'))),
            electronExeSha256: hash(executable), version: electron.version}};
    const nativeRecord = {schemaVersion: 1, protocolVersion: 1, sourceCommit: productCommit,
        source: {path: native.sourcePath, gitBlobObjectId: git('rev-parse', productCommit + ':' + native.sourcePath),
            sha256: hash(nativeSource), size: Buffer.byteLength(nativeSource), relation: 'git-commit-blob'},
        helper: {runtimePath: native.runtimePath, sha256: hash(helperBytes), size: helperBytes.length, testing: false, version: '1.0.0'},
        libmpv: native.libmpv, clientHeader: native.clientHeader,
        compiler: {...native.compiler, flags: [...native.compiler.flags, ...native.compiler.linkerFlags]}};
    const saveRecords = () => {
        json(runtime, 'runtime-provenance.json', runtimeRecord); json(runtime, native.provenancePath, nativeRecord);
    };
    saveRecords();
    for (const member of ['source-provenance.json', 'build-input-provenance.json']) json(runtime, member, {schemaVersion: 1, sourceCommit: productCommit});
    const installer = path.join(parent, 'candidate.exe'); fs.writeFileSync(installer, 'owned published installer fixture; never executed');
    const installerSha256 = hash(fs.readFileSync(installer));
    const build = {schemaVersion: 3, sourceCommit: productCommit, version: 'owned-1',
        sourceManifestSha256: hash(fs.readFileSync(path.join(repo, 'vendor/runtime-manifest.json'))),
        packageLockSha256: hash(fs.readFileSync(path.join(repo, 'package-lock.json')))};
    const receipt = {schemaVersion: 1, sourceCommit: productCommit, version: build.version,
        installer: {fileName: path.basename(installer), size: fs.statSync(installer).size, sha256: installerSha256}};
    function bindBuild() {
        json(runtime, 'build-manifest.json', build);
        receipt.runtimeManifestSha256 = hash(fs.readFileSync(path.join(runtime, 'build-manifest.json')));
        json(parent, 'candidate.exe.provenance.json', receipt);
    }
    function refresh() {
        build.files = contract.physicalInventory(runtime).filter(row => row.path !== 'build-manifest.json')
            .map(({path: member, sha256}) => ({path: member, sha256}));
        build.payload = {fileCount: build.files.length, payloadSetSha256: contract.payloadSetSha256(build.files)};
        build.provenance = Object.fromEntries(Object.entries({inputs: 'build-input-provenance.json',
            source: 'source-provenance.json', runtime: 'runtime-provenance.json'}).map(([key, member]) =>
            [key, {path: member, sha256: hash(fs.readFileSync(path.join(runtime, member)))}]));
        bindBuild();
    }
    refresh();
    const verify = contract.createVerifier({productCommit});
    const options = {repo, runtime, installer, installerSha256};
    return {parent, repo, runtime, installer, productCommit, installerSha256, options, verify,
        build, receipt, runtimeRecord, nativeRecord, saveRecords, refresh, bindBuild, put, json, git};
}

test('schema-3 physical inventory without size fields binds installer, all Git sources and native identities', t => {
    const f = fixture(t), result = f.verify(f.options);
    assert.equal(result.productCommit, f.productCommit);
    assert.equal(result.toolCommit, f.productCommit);
    assert.equal(result.installerSha256, f.installerSha256);
    assert.equal(result.manifestSha256, f.receipt.runtimeManifestSha256);
    assert.equal(result.fileCount, f.build.files.length + 1);
    assert.equal(result.physicalPayloadSha256, contract.payloadSetSha256(contract.physicalInventory(f.runtime)));
    assert.match(result.helperSha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.isFrozen(result), true);
    assert.ok(f.build.files.every(row => !Object.hasOwn(row, 'size')));
    assert.equal(contract.PRODUCT_COMMIT, 'b608cf2afa67d8d5a76964898c52a334c4a34aa1');
    assert.throws(() => contract.verifyCandidate(f.options), /windows-contract-candidate-commit-required/);
    assert.throws(() => contract.verifyCandidate({...f.options, candidateCommit: f.productCommit}), /windows-contract-git-read-failed/);
});

test('reviewed compatibility permits the explicit base or tool-only HEAD and validates the exact candidate provenance', t => {
    const f = fixture(t);
    f.put(f.repo, 'tools/owned.cjs', '// reviewed tool only\n'); f.git('add', 'tools'); f.git('commit', '-q', '-m', 'owned reviewed tooling');
    const head = f.git('rev-parse', 'HEAD');
    for (const candidateCommit of [f.productCommit, head]) {
        assert.deepEqual(contract.reviewedCandidate({repo: f.repo, candidateCommit}, {baseCommit: f.productCommit}),
            {productCommit: candidateCommit, toolCommit: head});
    }
    assert.equal(f.verify(f.options).productCommit, f.productCommit);
    const verifyHead = contract.createVerifier({productCommit: head});
    assert.throws(() => verifyHead(f.options), /windows-contract-installer-receipt-invalid/,
        'unchanged source bytes cannot substitute for exact candidate provenance');
    f.build.sourceCommit = f.receipt.sourceCommit = f.nativeRecord.sourceCommit = f.runtimeRecord.sourceCommit = head;
    f.runtimeRecord.validatedProductScope.sourceCommit = head;
    for (const row of f.runtimeRecord.validatedProductScope.files) row.sourceCommit = head;
    for (const member of ['source-provenance.json', 'build-input-provenance.json']) {
        f.json(f.runtime, member, {schemaVersion: 1, sourceCommit: head});
    }
    f.saveRecords(); f.refresh();
    assert.equal(verifyHead(f.options).productCommit, head);
});

test('an arbitrary existing off-branch candidate is refused instead of becoming the source automatically', t => {
    const f = fixture(t);
    f.put(f.repo, 'tools/owned-side.cjs', '// off-branch tool fixture\n');
    f.git('add', 'tools'); f.git('commit', '-q', '-m', 'owned off-branch tooling');
    const offBranch = f.git('rev-parse', 'HEAD');
    f.git('checkout', '-q', '--detach', f.productCommit);
    assert.throws(() => contract.reviewedCandidate({repo: f.repo, candidateCommit: offBranch}, {baseCommit: f.productCommit}),
        /windows-contract-candidate-commit-not-reviewed/);
    assert.throws(() => contract.reviewedCandidate({repo: f.repo}, {baseCommit: f.productCommit}),
        /windows-contract-candidate-commit-required/);
});

test('choosing HEAD cannot bypass protected product changes or dirty tracked product inputs', t => {
    const f = fixture(t);
    f.put(f.repo, 'src/electronapp/main.js', '// changed product\n');
    assert.throws(() => contract.reviewedCandidate({repo: f.repo, candidateCommit: f.productCommit}, {baseCommit: f.productCommit}),
        /windows-contract-product-tree-changed/);
    f.git('add', 'src'); f.git('commit', '-q', '-m', 'owned changed product');
    const head = f.git('rev-parse', 'HEAD');
    assert.throws(() => contract.reviewedCandidate({repo: f.repo, candidateCommit: head}, {baseCommit: f.productCommit}),
        /windows-contract-product-tree-changed/);
});

test('tool-only descendants are compatible while protected tracked local changes are rejected', t => {
    const f = fixture(t);
    f.put(f.repo, 'tools/owned.cjs', '// tool only\n'); f.git('add', 'tools'); f.git('commit', '-q', '-m', 'owned tool fixture');
    assert.equal(f.verify(f.options).toolCommit, f.git('rev-parse', 'HEAD'));
    f.put(f.repo, 'src/electronapp/main.js', '// modified tracked product\n');
    assert.throws(() => f.verify(f.options), /windows-contract-product-tree-changed/);
});

test('a protected product change committed after the frozen product is rejected', t => {
    const f = fixture(t);
    f.put(f.repo, 'native/mpv-helper/helper.cpp', 'changed'); f.git('add', 'native'); f.git('commit', '-q', '-m', 'owned product change');
    assert.throws(() => f.verify(f.options), /windows-contract-product-tree-changed/);
});

for (const kind of ['extra', 'missing', 'duplicate', 'hash', 'size', 'unknown-schema', 'payload-set', 'binding']) {
    test('physical candidate refuses ' + kind, t => {
        const f = fixture(t);
        if (kind === 'extra') f.put(f.runtime, 'unlisted-owned-file', 'extra');
        if (kind === 'missing') fs.unlinkSync(path.join(f.runtime, f.build.files[0].path));
        if (kind === 'duplicate') {f.build.files.push({...f.build.files[0]}); f.build.payload.fileCount++; f.bindBuild();}
        if (kind === 'hash') {f.build.files[0].sha256 = '0'.repeat(64); f.bindBuild();}
        if (kind === 'size') {f.build.files[0].size = 999999; f.bindBuild();}
        if (kind === 'unknown-schema') {f.build.schemaVersion = 2; f.bindBuild();}
        if (kind === 'payload-set') {f.build.payload.payloadSetSha256 = '0'.repeat(64); f.bindBuild();}
        if (kind === 'binding') {f.build.provenance.runtime.sha256 = '0'.repeat(64); f.bindBuild();}
        assert.throws(() => f.verify(f.options), /^Error: windows-contract-/);
    });
}

test('optional sizes are checked when present and do not become mandatory', t => {
    const f = fixture(t);
    for (const row of f.build.files) row.size = fs.statSync(path.join(f.runtime, row.path)).size;
    f.bindBuild();
    assert.equal(f.verify(f.options).fileCount, f.build.files.length + 1);
});

for (const kind of ['wrong-source', 'missing-source', 'duplicate-source', 'changed-unlisted-source', 'native-source', 'electron-tree']) {
    test('resigned self-consistent manifests cannot hide ' + kind, t => {
        const f = fixture(t);
        if (kind === 'wrong-source') f.runtimeRecord.validatedProductScope.files[0].sourcePath = 'src/electronapp/wrong.js';
        if (kind === 'missing-source') {
            f.runtimeRecord.validatedProductScope.files.pop(); f.runtimeRecord.validatedProductScope.fileCount--;
        }
        if (kind === 'duplicate-source') {
            const rows = f.runtimeRecord.validatedProductScope.files; rows[rows.length - 1] = {...rows[0]};
        }
        if (kind === 'changed-unlisted-source') {
            const row = f.runtimeRecord.validatedProductScope.files.find(value => value.runtimePath.endsWith('extra-product-source.js'));
            const forged = Buffer.from('// self-consistent forged source\n');
            f.put(f.runtime, row.runtimePath, forged); row.sourceSha256 = row.runtimeSha256 = hash(forged);
        }
        if (kind === 'native-source') f.nativeRecord.source.sha256 = '0'.repeat(64);
        if (kind === 'electron-tree') f.put(f.runtime, 'x64/electron/resources/default_app.asar', 'changed physical ASAR');
        f.saveRecords(); f.refresh();
        assert.throws(() => f.verify(f.options), /^Error: windows-contract-/);
    });
}

test('installer hash and receipt binding are required independently of runtime manifest claims', t => {
    const f = fixture(t);
    assert.throws(() => f.verify({...f.options, installerSha256: '0'.repeat(64)}), /installer-hash-mismatch/);
    f.receipt.runtimeManifestSha256 = '0'.repeat(64); f.json(f.parent, 'candidate.exe.provenance.json', f.receipt);
    assert.throws(() => f.verify(f.options), /installer-runtime-binding-mismatch/);
});

test('Electron inventory selects original-fs and treats an ASAR archive as one physical file', t => {
    const f = fixture(t), loaded = [];
    const original = contract.selectPhysicalFs({electron: true, load: name => {loaded.push(name); return fs;}});
    assert.deepEqual(loaded, ['original-fs']);
    const verify = contract.createVerifier({productCommit: f.productCommit, io: original});
    assert.equal(verify(f.options).fileCount, f.build.files.length + 1);
    const rows = contract.physicalInventory(f.runtime, original);
    assert.equal(rows.filter(row => row.path.endsWith('.asar')).length, 1);
    assert.equal(rows.some(row => row.path.includes('.asar/')), false);
    const patched = new Proxy(fs, {get(target, property) {
        if (property === 'lstatSync') return file => {
            const stat = fs.lstatSync(file);
            return String(file).endsWith('.asar') ? new Proxy(stat, {get(value, field) {
                if (field === 'isDirectory') return () => true;
                if (field === 'isFile') return () => false;
                const member = value[field]; return typeof member === 'function' ? member.bind(value) : member;
            }}) : stat;
        };
        return target[property];
    }});
    assert.throws(() => contract.physicalInventory(f.runtime, patched), /^Error: windows-contract-/,
        'a patched ASAR directory view must not be mistaken for the physical payload inventory');
    assert.throws(() => contract.selectPhysicalFs({electron: true, load: () => {throw Error('private backend detail');}}),
        /^Error: windows-contract-physical-backend-required$/);
});

test('symlinked payload rejects without exposing absolute paths', t => {
    const f = fixture(t), original = path.join(f.runtime, f.build.files[0].path);
    const target = path.join(f.parent, 'private-owned-target'); fs.writeFileSync(target, 'keep');
    fs.unlinkSync(original); fs.symlinkSync(target, original);
    assert.throws(() => f.verify(f.options), error => {
        assert.match(error.message, /^windows-contract-/);
        assert.equal(error.message.includes(f.parent), false);
        return true;
    });
});

test('Windows case aliases in the declared payload reject as duplicate members', t => {
    const f = fixture(t);
    f.build.files.push({...f.build.files[0], path: f.build.files[0].path.toUpperCase()});
    f.bindBuild();
    assert.throws(() => f.verify(f.options), /windows-contract-payload-member-duplicate/);
});
