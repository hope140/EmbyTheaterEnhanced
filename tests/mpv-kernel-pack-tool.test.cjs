'use strict';

const assert = require('node:assert/strict');
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
