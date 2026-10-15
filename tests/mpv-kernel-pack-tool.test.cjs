'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {validateCandidateArchive} = require('../src/electronapp/enhanced/mpv-kernel-package');
const {buildArchive, createMetadata, writeOutput} = require('../tools/package-mpv-kernel-candidate.cjs');

const helper = {sha256: 'a'.repeat(64), version: '1.0.0'};
const source = Buffer.from('Synthetic source record\n');
const notice = Buffer.from('Synthetic notice record\n');
const details = {
  libmpvVersion: 'mpv v0.42.0-example',
  source: {project: 'Synthetic', release: 'test-1', revision: 'deadbeef', reference: 'https://example.org/source'},
  license: {spdxExpression: 'GPL-3.0-or-later', redistribution: 'not-assessed'}
};

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
const exportNames = ['mpv_create','mpv_initialize','mpv_set_option_string','mpv_observe_property','mpv_unobserve_property',
  'mpv_wait_event','mpv_terminate_destroy','mpv_command','mpv_command_async','mpv_get_property','mpv_set_property_string',
  'mpv_get_property_string','mpv_free','mpv_free_node_contents','mpv_client_api_version','mpv_error_string','mpv_event_name'];

function syntheticDll() {
  const bytes = Buffer.alloc(0x700);
  bytes.writeUInt16LE(0x5a4d, 0); bytes.writeUInt32LE(0x80, 0x3c); bytes.writeUInt32LE(0x4550, 0x80);
  const coff = 0x84;
  bytes.writeUInt16LE(0x8664, coff); bytes.writeUInt16LE(1, coff + 2); bytes.writeUInt16LE(0xf0, coff + 16); bytes.writeUInt16LE(0x2022, coff + 18);
  const optional = coff + 20;
  bytes.writeUInt16LE(0x20b, optional); bytes.writeUInt32LE(0x2000, optional + 56); bytes.writeUInt32LE(0x200, optional + 60);
  bytes.writeUInt32LE(16, optional + 108); bytes.writeUInt32LE(0x1000, optional + 112); bytes.writeUInt32LE(0x80, optional + 116);
  const section = optional + 0xf0;
  bytes.writeUInt32LE(0x500, section + 8); bytes.writeUInt32LE(0x1000, section + 12); bytes.writeUInt32LE(0x500, section + 16); bytes.writeUInt32LE(0x200, section + 20);
  const exports = 0x200;
  bytes.writeUInt32LE(1, exports + 16); bytes.writeUInt32LE(18, exports + 20); bytes.writeUInt32LE(17, exports + 24);
  bytes.writeUInt32LE(0x1040, exports + 28); bytes.writeUInt32LE(0x1088, exports + 32); bytes.writeUInt32LE(0x10cc, exports + 36);
  for (let index = 0; index < exportNames.length; index++) {
    bytes.writeUInt32LE(0x10e0 + index * 4, 0x240 + index * 4);
    bytes.writeUInt32LE(0x1100 + index * 32, 0x288 + index * 4);
    bytes.writeUInt16LE(index, 0x2cc + index * 2);
    bytes.write(exportNames[index] + '\0', 0x300 + index * 32, 'ascii');
  }
  return bytes;
}

function createCliFixture(root) {
  const runtimeRoot = path.join(root, 'runtime 树 with spaces');
  const sourceCommit = 'b'.repeat(40);
  const helperBytes = Buffer.from('Synthetic fixed helper bytes');
  const runtimeDllBytes = Buffer.from('Synthetic fixed runtime libmpv bytes');
  const helperPath = 'electronapp/native-helper/ete-mpv-helper.exe';
  const runtimeDllPath = 'electronapp/libmpv/x64/mpv-1.dll';
  for (const [relative, contents] of [[helperPath, helperBytes], [runtimeDllPath, runtimeDllBytes]]) {
    const target = path.join(runtimeRoot, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, contents);
  }
  const provenance = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    protocolVersion: 1,
    sourceCommit,
    helper: {version: '1.0.0', runtimePath: helperPath, sha256: hash(helperBytes), testing: false},
    libmpv: {version: 'v0.42.0-example', runtimePath: runtimeDllPath, sha256: hash(runtimeDllBytes)}
  }));
  fs.writeFileSync(path.join(runtimeRoot, 'native-helper-provenance.json'), provenance);
  fs.writeFileSync(path.join(runtimeRoot, 'runtime-provenance.json'), JSON.stringify({sourceCommit}));
  fs.writeFileSync(path.join(runtimeRoot, 'build-manifest.json'), JSON.stringify({
    schemaVersion: 3,
    sourceCommit,
    files: [{path: 'native-helper-provenance.json', sha256: hash(provenance)}]
  }));

  const paths = {
    scriptPath: path.resolve(__dirname, '..', 'tools', 'package-mpv-kernel-candidate.cjs'),
    runtimeRoot,
    detailsPath: path.join(root, '内核 details.json'),
    dllPath: path.join(root, 'libmpv 动态库.dll'),
    sourcePath: path.join(root, 'SOURCE 来源.txt'),
    noticePath: path.join(root, 'NOTICE 声明.txt'),
    outputPath: path.join(root, 'candidate 输出.zip')
  };
  fs.writeFileSync(paths.detailsPath, JSON.stringify(details));
  fs.writeFileSync(paths.dllPath, syntheticDll());
  fs.writeFileSync(paths.sourcePath, source);
  fs.writeFileSync(paths.noticePath, notice);
  return {paths, helper: {sha256: hash(helperBytes), version: '1.0.0'}};
}

function runCli(paths, outputPath = paths.outputPath) {
  return childProcess.spawnSync(process.execPath, [paths.scriptPath, paths.runtimeRoot, paths.detailsPath,
    paths.dllPath, paths.sourcePath, paths.noticePath, outputPath], {encoding: 'utf8'});
}

test('offline writer emits a four-entry archive accepted by the import validator', () => {
  const dll = syntheticDll();
  const candidate = createMetadata(details, {'mpv-1.dll': dll, SOURCE: source, NOTICE: notice}, helper);
  const members = {'candidate.json': candidate, 'mpv-1.dll': dll, 'SOURCE.txt': source, 'NOTICE.txt': notice};
  const archive = buildArchive(members);
  assert.ok(archive.length < 192 * 1024 * 1024);
  const validated = validateCandidateArchive(archive, helper);
  assert.deepEqual(Object.keys(validated.members).sort(), ['NOTICE.txt','SOURCE.txt','candidate.json','mpv-1.dll']);
  assert.equal(validated.candidateId, hash(dll));
  assert.equal(validated.checks.staticCompatibility, 'PASS');
  assert.equal(hash(dll), JSON.parse(candidate.toString('utf8')).libmpv.sha256);
});

test('writer refuses an existing output without changing its bytes', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-mpv-kernel-pack-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const output = path.join(root, 'candidate.zip');
  fs.writeFileSync(output, 'keep-existing');
  await assert.rejects(writeOutput(output, Buffer.from('new bytes')), error => error.code === 'candidate-output-write-failed');
  assert.equal(fs.readFileSync(output, 'utf8'), 'keep-existing');
});

test('real CLI consumes six user arguments after node and script argv entries', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ete 内核 CLI spaces-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const {paths, helper: cliHelper} = createCliFixture(root);

  const success = runCli(paths);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(success.stderr, '');
  const result = JSON.parse(success.stdout);
  assert.equal(result.status, 'written');
  const archive = fs.readFileSync(paths.outputPath);
  const validated = validateCandidateArchive(archive, cliHelper);
  assert.deepEqual(Object.keys(validated.members).sort(), ['NOTICE.txt','SOURCE.txt','candidate.json','mpv-1.dll']);
  assert.equal(result.candidateId, validated.candidateId);

  const missingArgument = childProcess.spawnSync(process.execPath,
    [paths.scriptPath, paths.runtimeRoot, paths.detailsPath, paths.dllPath, paths.sourcePath, paths.noticePath],
    {encoding: 'utf8'});
  assert.equal(missingArgument.status, 1);
  assert.equal(missingArgument.stderr.trim(), 'candidate-package-failed');
  const extraArgumentPath = path.join(root, 'private-input-path-sentinel');
  const tooManyArguments = childProcess.spawnSync(process.execPath,
    [paths.scriptPath, paths.runtimeRoot, paths.detailsPath, paths.dllPath, paths.sourcePath, paths.noticePath,
      paths.outputPath, extraArgumentPath], {encoding: 'utf8'});
  assert.equal(tooManyArguments.status, 1);
  assert.equal(tooManyArguments.stderr.trim(), 'candidate-package-failed');
  assert.equal(tooManyArguments.stdout.includes(extraArgumentPath), false);
  assert.equal(tooManyArguments.stderr.includes(extraArgumentPath), false);

  const existingOutput = path.join(root, 'existing candidate.zip');
  fs.writeFileSync(existingOutput, 'keep-existing-bytes');
  const collision = runCli(paths, existingOutput);
  assert.equal(collision.status, 1);
  assert.equal(collision.stderr.trim(), 'candidate-output-write-failed');
  assert.equal(fs.readFileSync(existingOutput, 'utf8'), 'keep-existing-bytes');

  const badDll = path.join(root, '坏输入.dll');
  fs.writeFileSync(badDll, 'invalid PE input');
  const badInput = childProcess.spawnSync(process.execPath,
    [paths.scriptPath, paths.runtimeRoot, paths.detailsPath, badDll, paths.sourcePath, paths.noticePath,
      path.join(root, 'must-not-exist.zip')], {encoding: 'utf8'});
  assert.equal(badInput.status, 1);
  assert.equal(badInput.stderr.trim(), 'pe-invalid');
  assert.equal(badInput.stdout.includes(badDll), false);
  assert.equal(badInput.stderr.includes(badDll), false);
  assert.equal(fs.existsSync(path.join(root, 'must-not-exist.zip')), false);
});
