'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');
const support = require('../tools/playback-range-windows-smoke.cjs');
const producerFixture = require('./helpers/range-runtime-v3-fixture.cjs');
const inputs = JSON.parse(fs.readFileSync(producerFixture.filesPath));
// Chromium pickle header + one inert member; no executable code or dependency.
function asar() {
    const body = Buffer.from('Synthetic ASAR marker.\n'), json = Buffer.from(JSON.stringify({files: {'marker.txt': {size: body.length, offset: '0'}}}));
    const payloadBytes = Math.ceil((4 + json.length) / 4) * 4, header = Buffer.alloc(4 + payloadBytes), size = Buffer.alloc(8);
    header.writeUInt32LE(payloadBytes); header.writeUInt32LE(json.length, 4); json.copy(header, 8);
    size.writeUInt32LE(4); size.writeUInt32LE(header.length, 4); return {bytes: Buffer.concat([size, header, body]), body};
}
function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-physical-asar-'))); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    for (const [name, body] of Object.entries(inputs.payload)) {const file = path.join(root, name); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, Buffer.from(body, 'base64'));}
    const packed = asar(), member = 'resources/fixture.asar', archive = path.join(root, member), unpacked = member + '.unpacked/extra.bin';
    fs.mkdirSync(path.dirname(archive), {recursive: true}); fs.writeFileSync(archive, packed.bytes); fs.mkdirSync(path.dirname(path.join(root, unpacked)), {recursive: true}); fs.writeFileSync(path.join(root, unpacked), 'unpacked fixture\n');
    const manifest = JSON.parse(fs.readFileSync(producerFixture.manifestPath));
    for (const name of [member, unpacked]) manifest.files.push({path: name, sha256: support.hashFile(path.join(root, name))});
    const write = () => {manifest.payload.fileCount = manifest.files.length; manifest.payload.payloadSetSha256 = support.sha(manifest.files.map(row => row.path + '\0' + row.sha256 + '\n').join('')); fs.writeFileSync(path.join(root, 'build-manifest.json'), JSON.stringify(manifest));}; write();
    return {root, member, archive, unpacked, packed, manifest, write, expectedHash: () => support.hashFile(path.join(root, 'build-manifest.json'))};
}
// Model documented ASAR virtualization only. This is not actual Electron evidence.
function electronModules(f, options = {}) {
    let virtualCalls = 0, originalRequests = 0;
    const virtual = Object.create(fs);
    virtual.lstatSync = file => {
        if (file === f.archive) {virtualCalls++; return {size: 0, isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false};}
        if (file === path.join(f.archive, 'marker.txt')) {virtualCalls++; return {size: f.packed.body.length, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false};}
        return fs.lstatSync(file);
    };
    virtual.readdirSync = (file, settings) => file === f.archive ? (virtualCalls++, [{name: 'marker.txt'}]) : fs.readdirSync(file, settings);
    virtual.readFileSync = (file, ...args) => file === path.join(f.archive, 'marker.txt') ? (virtualCalls++, f.packed.body) : fs.readFileSync(file, ...args);
    const physical = options.physical || fs, runtime = {versions: {electron: '44.4.2'}, noAsar: 'unchanged'}, cache = new Map();
    function load(name) {
        const filename = path.resolve(__dirname, '../tools', name);
        if (cache.has(filename)) return cache.get(filename);
        const module = {exports: {}}, actualRequire = createRequire(filename);
        const localRequire = id => {
            if (id === 'node:fs') return virtual;
            if (id === 'original-fs') {originalRequests++; if (options.missingOriginal) throw Error('original-fs-unavailable-fixture'); return physical;}
            if (id === './verify-installer-runtime.cjs') return load('verify-installer-runtime.cjs');
            return actualRequire(id);
        };
        const code = options.old ? execFileSync('git', ['show', 'f1d84fdee3bba3ab5c2a5c1c13070d353823efa8:tools/' + name], {cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true}) : fs.readFileSync(filename, 'utf8');
        vm.runInNewContext(code, {require: localRequire, module, __filename: filename, __dirname: path.dirname(filename), process: runtime, Buffer, console, setTimeout, clearTimeout});
        cache.set(filename, module.exports); return module.exports;
    }
    return {load, runtime, virtualCalls: () => virtualCalls, originalRequests: () => originalRequests};
}
test('physical Node inventory hashes the whole ASAR and every unpacked file', t => {
    const f = fixture(t), result = support.verifyPayload(f.root, f.expectedHash()), proof = support.physicalPayloadProof(result.inventory);
    assert.equal(result.inventory.get(f.member).size, f.packed.bytes.length); assert.equal(result.inventory.get(f.member).sha256, support.sha(f.packed.bytes));
    assert(result.inventory.has(f.unpacked)); assert(!result.inventory.has(f.member + '/marker.txt'));
    assert.equal(proof.files, f.manifest.files.length + 1); assert.equal(proof.asarFiles.length, 1); assert.equal(proof.asarFiles[0].bytes, f.packed.bytes.length);
    const headerSize = f.packed.bytes.readUInt32LE(4); assert.equal(f.packed.bytes.readUInt32LE(0), 4);
    const length = f.packed.bytes.readUInt32LE(12), header = JSON.parse(f.packed.bytes.subarray(16, 16 + length));
    assert.equal(header.files['marker.txt'].size, f.packed.body.length); assert(f.packed.bytes.subarray(8 + headerSize).equals(f.packed.body));
});
test('preceding verifier disagrees under the substituted virtual ASAR tree while physical Node passes', t => {
    const f = fixture(t); support.verifyPayload(f.root, f.expectedHash()); const old = electronModules(f, {old: true});
    assert.throws(() => old.load('playback-range-windows-smoke.cjs').verifyPayload(f.root, f.expectedHash()), /candidate-runtime-file/); assert(old.virtualCalls() > 0);
});
test('same verifier logic uses original-fs in substituted Electron and yields exactly the Node physical proof', t => {
    const f = fixture(t), electron = electronModules(f), other = electron.load('playback-range-windows-smoke.cjs');
    const nodeProof = support.physicalPayloadProof(support.verifyPayload(f.root, f.expectedHash()).inventory);
    const result = other.verifyPayload(f.root, f.expectedHash()), electronProof = other.physicalPayloadProof(result.inventory);
    assert.deepEqual(JSON.parse(JSON.stringify(electronProof)), nodeProof); assert.equal(other.fileSystemBackend, 'original-fs');
    assert.equal(electron.load('verify-installer-runtime.cjs').fileSystemBackend, 'original-fs'); assert.equal(electron.virtualCalls(), 0); assert.equal(electron.originalRequests(), 2); assert.equal(electron.runtime.noAsar, 'unchanged');
});
for (const name of ['playback-range-windows-smoke.cjs', 'verify-installer-runtime.cjs']) test('missing original-fs fails closed without a patched-fs fallback: ' + name, t => {
    const f = fixture(t), electron = electronModules(f, {missingOriginal: true}); assert.throws(() => electron.load(name), /original-fs-unavailable/); assert.equal(electron.virtualCalls(), 0);
});
for (const member of ['resources/fixture.asar', 'resources/fixture.asar.unpacked/extra.bin']) test('modified physical archive/unpacked bytes remain rejected with member/hash/length evidence: ' + member, t => {
    const f = fixture(t), file = path.join(f.root, member), row = f.manifest.files.find(row => row.path === member); fs.appendFileSync(file, 'changed');
    let failure; try {support.verifyPayload(f.root, f.expectedHash());} catch (error) {failure = error;}
    assert(failure); const detail = support.integrityDiagnostic(failure);
    assert.equal(detail.member, member); assert.equal(detail.expectedSha256, row.sha256); assert.equal(detail.actualSha256, support.hashFile(file));
    assert.equal(detail.expectedBytes, null); assert.equal(detail.sizeDeclared, false); assert.equal(detail.actualBytes, fs.statSync(file).size); assert.equal(detail.actualReadBytes, detail.actualBytes);
    assert(!JSON.stringify(detail).includes(f.root));
});
test('missing archive and a declared size mismatch retain distinct safe facts', t => {
    const f = fixture(t), row = f.manifest.files.find(row => row.path === f.member); row.size = f.packed.bytes.length + 1; f.write();
    let error; try {support.verifyPayload(f.root, f.expectedHash());} catch (caught) {error = caught;}
    const size = support.integrityDiagnostic(error); assert.equal(size.expectedBytes, row.size); assert.equal(size.actualBytes, f.packed.bytes.length); assert.equal(size.sizeDeclared, true);
    fs.unlinkSync(f.archive); try {support.verifyPayload(f.root, f.expectedHash());} catch (caught) {error = caught;}
    const missing = support.integrityDiagnostic(error); assert.equal(missing.member, f.member); assert.equal(missing.actualSha256, null); assert.equal(missing.actualBytes, null);
});
test('inventory refuses stat/read disagreement and reports actual byte counts without contents or absolute paths', t => {
    const f = fixture(t), physical = Object.create(fs); physical.lstatSync = file => {
        const stat = fs.lstatSync(file); if (file === f.archive) return {size: 0, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false}; return stat;
    };
    const electron = electronModules(f, {physical}), verifier = electron.load('playback-range-windows-smoke.cjs');
    let error; try {verifier.verifyPayload(f.root, f.expectedHash());} catch (caught) {error = caught;}
    const detail = verifier.integrityDiagnostic(error); assert.equal(detail.member, f.member); assert.equal(detail.operation, 'stat-read-length-mismatch');
    assert.equal(detail.actualBytes, 0); assert.equal(detail.actualReadBytes, f.packed.bytes.length); assert.equal(detail.expectedSha256, support.sha(f.packed.bytes)); assert.equal(detail.actualSha256, detail.expectedSha256);
    assert(!JSON.stringify(detail).includes(f.root)); assert(!JSON.stringify(detail).includes('Synthetic ASAR marker'));
});
test('diagnostic serialization strips unsafe paths, contents, extra fields and preserves the originating backend', () => {
    const value = support.integrityDiagnostic({integrity: {code: 'candidate-runtime-file', member: 'C:/Users/secret-do-not-log', fileSystemBackend: 'original-fs',
        expectedSha256: 'secret-do-not-log', actualSha256: '0'.repeat(64), actualBytes: 12, operation: 'https://secret-do-not-log', contents: 'secret-do-not-log', root: 'secret-do-not-log'}});
    assert.equal(value.fileSystemBackend, 'original-fs'); assert.equal(value.member, '[invalid-member]'); assert.equal(value.expectedSha256, null); assert.equal(value.operation, 'compare');
    assert(!JSON.stringify(value).includes('secret-do-not-log'));
});
