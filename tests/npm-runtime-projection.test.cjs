'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const deps = require('../tools/runtime-dependency-contract.cjs');
const inherited = require('../tools/inherited-npm-input.cjs');
const root = path.resolve(__dirname, '..');
const reviewed = require('../docs/evidence/npm-runtime-projection.json');
const selected = deps.loadSelectedPackages(root);
function collect(project) {
    return selected.packages.flatMap(entry => deps.collectTree(path.join(project, entry.packagePath), entry.packagePath))
        .sort((a, b) => a.path.localeCompare(b.path, 'en'));
}
function summary(files) { const {files: ignored, ...value} = deps.treeIdentity(files); return value; }

test('locked npm source remains complete and the reviewed projection differs by exactly twenty pinned files', () => {
    const source = collect(root), projection = deps.projectNpmFiles(source, selected.packages);
    assert.equal(selected.packages.length, 33);
    assert.deepEqual(summary(source), reviewed.source);
    assert.deepEqual(summary(projection.files), reviewed.runtime);
    assert.equal(source.length, 1142); assert.equal(projection.files.length, 1122);
    assert.deepEqual(projection.excludedFiles, reviewed.excludedFiles);
    assert.deepEqual([...deps.NPM_PROJECTION_EXCLUSIONS].sort((a,b) => a.path.localeCompare(b.path,'en')), reviewed.excludedFiles);
    const active = new Map(projection.files.map(file => [file.path, file]));
    for (const file of [...reviewed.retainedCriticalFiles, ...reviewed.noticeFiles]) assert.deepEqual(active.get(file.path), file);
    assert.equal(reviewed.noticeFiles.length, 35);
});

test('changed projection versions and every missing, altered or resized excluded input fail closed', () => {
    const source = collect(root);
    for (const name of Object.keys(deps.NPM_PROJECTION_VERSIONS)) {
        const packages = selected.packages.map(entry => entry.name === name ? {...entry, version: '0.0.0'} : entry);
        assert.throws(() => deps.projectNpmFiles(source, packages), /Unreviewed npm projection package version/);
    }
    for (const expected of reviewed.excludedFiles) {
        assert.throws(() => deps.projectNpmFiles(source.filter(file => file.path !== expected.path), selected.packages), /projection identity mismatch/);
        for (const change of [{sha256: '0'.repeat(64)}, {size: expected.size + 1}]) {
            const changed = source.map(file => file.path === expected.path ? {...file, ...change} : file);
            assert.throws(() => deps.projectNpmFiles(changed, selected.packages), /projection identity mismatch/);
        }
    }
});

test('owned runtime copy records the complete source and exact projection before final validation', t => {
    const fixture = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-npm-projection-')));
    t.after(() => fs.rmSync(fixture, {recursive: true, force: true}));
    const runtime = path.join(fixture, 'dist', 'candidate'), source = path.join(fixture,'.work','runtime-dependencies-projection');
    fs.mkdirSync(runtime, {recursive: true}); fs.mkdirSync(source, {recursive: true});
    for (const name of ['package.json', 'package-lock.json']) {
        fs.copyFileSync(path.join(root, name), path.join(source, name));
        fs.copyFileSync(path.join(root, name), path.join(fixture, name));
    }
    // The reviewed 33 npm packages stay real; unrelated externally restored legacy
    // packages use the same public synthetic fixture as the existing ownership tests.
    const retained = deps.RETAINED_PACKAGES.flatMap(entry => {
        const name = entry.packagePath.split('/').at(-1), prefix = 'electronapp/' + entry.packagePath;
        return [{path:prefix+'/package.json',bytes:Buffer.from(JSON.stringify({name,version:entry.version}))},
            {path:prefix+'/index.js',bytes:Buffer.from('module.exports = "synthetic retained package";\n')}];
    });
    require('./helpers/inherited-npm-fixture.cjs').create(fixture,retained);
    const git = args => execFileSync('git', ['-C',fixture,...args], {encoding:'utf8'});
    git(['init','-q']); git(['config','user.name','ETE Test']); git(['config','user.email','ete-test@example.invalid']);
    git(['config','core.autocrlf','false']); git(['add','package.json','package-lock.json',inherited.MANIFEST_PATH]);
    git(['commit','-q','-m','projection fixture']);
    for (const entry of selected.packages) {
        const target = path.join(source, entry.packagePath); fs.mkdirSync(path.dirname(target), {recursive: true});
        fs.cpSync(path.join(root, entry.packagePath), target, {recursive: true});
    }
    const commit = git(['rev-parse','HEAD']).trim();
    const token = deps.createOwner(fixture, runtime, commit);
    inherited.assemble(fixture, runtime);
    const first = reviewed.excludedFiles[0], sourceFile = path.join(source, first.path), original = fs.readFileSync(sourceFile);
    fs.appendFileSync(sourceFile, 'altered input');
    assert.throws(() => deps.copyRuntimeDependencies(fixture, runtime, source, token), /projection identity mismatch/);
    assert.equal(fs.existsSync(path.join(runtime, deps.PROVENANCE_FILE)), false);
    assert.equal(fs.existsSync(path.join(runtime, 'electronapp/node_modules/@grpc')), false);
    fs.writeFileSync(sourceFile, original);
    const result = deps.copyRuntimeDependencies(fixture, runtime, source, token);
    assert.equal(result.sourceSelectedFileCount, 1142); assert.equal(result.selectedFileCount, 1122); assert.equal(result.excludedFileCount, 20);
    const targetProject = path.join(runtime, 'electronapp');
    assert.deepEqual(summary(collect(source)), reviewed.source);
    assert.deepEqual(summary(collect(targetProject)), reviewed.runtime);
    const probe = project => JSON.parse(execFileSync(process.execPath,
        [path.join(__dirname,'helpers/npm-projection-probe.cjs'),project,path.join(root,'src/electronapp/enhanced/proto/clouddrive-v1.proto')], {encoding:'utf8'}));
    const baseline = probe(source), projected = probe(targetProject);
    assert.equal(baseline.methods.length,3); assert.equal(baseline.wires.length,6);
    assert.equal(baseline.memberCount,121);
    assert.equal(baseline.definitionSha256,'7c78d07cf96b14a6cd9ef7183640dda8ae873f29a34e6bc2007ab841f8cced6c');
    assert.deepEqual(projected,baseline,'actual CJS members, RPC definitions, message wire, Channelz and ORCA must match');
    for (const file of reviewed.excludedFiles) assert.equal(fs.existsSync(path.join(targetProject, file.path)), false);
    for (const file of [...reviewed.retainedCriticalFiles, ...reviewed.noticeFiles]) assert.deepEqual(fs.readFileSync(path.join(targetProject,file.path)), fs.readFileSync(path.join(source,file.path)));
    assert.equal(deps.inspectRuntime(fixture, runtime, commit).valid, true);
    const recordPath = path.join(runtime, deps.PROVENANCE_FILE), record = fs.readFileSync(recordPath);
    const changed = JSON.parse(record); changed.selected.excludedFiles.pop(); fs.writeFileSync(recordPath, JSON.stringify(changed));
    assert.throws(() => deps.inspectRuntime(fixture, runtime, commit), /projection identity mismatch/); fs.writeFileSync(recordPath, record);
    const stale = path.join(targetProject, first.path); fs.mkdirSync(path.dirname(stale), {recursive: true}); fs.writeFileSync(stale, original);
    assert.throws(() => deps.inspectRuntime(fixture, runtime, commit), /file count mismatch/); fs.unlinkSync(stale);
    const descriptor = path.join(targetProject, 'node_modules/protobufjs/google/protobuf/descriptor.json');
    const descriptorBytes = fs.readFileSync(descriptor); fs.unlinkSync(descriptor);
    assert.throws(() => require(path.join(targetProject,'node_modules/protobufjs/ext/descriptor')), error => error.code === 'MODULE_NOT_FOUND');
    assert.throws(() => deps.inspectRuntime(fixture, runtime, commit), /file count mismatch/); fs.writeFileSync(descriptor, descriptorBytes);
    assert.equal(deps.inspectRuntime(fixture, runtime, commit).valid, true);
    assert.deepEqual(summary(collect(source)), reviewed.source);
});
