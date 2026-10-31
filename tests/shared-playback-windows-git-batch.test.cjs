'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const contract = require('../tools/shared-playback-cache/windows-contract.cjs');

const objectId = bytes => crypto.createHash('sha1').update(Buffer.concat([
  Buffer.from(`blob ${bytes.length}\0`), bytes,
])).digest('hex');
const objectId256 = bytes => crypto.createHash('sha256').update(Buffer.concat([
  Buffer.from(`blob ${bytes.length}\0`), bytes,
])).digest('hex');
const frame = (oid, bytes, type = 'blob') => Buffer.concat([
  Buffer.from(`${oid} ${type} ${bytes.length}\n`), bytes, Buffer.from('\n'),
]);

function gitFixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-git-batch-'));
  t.after(() => fs.rmSync(repo, {recursive: true, force: true}));
  cp.execFileSync('git', ['-C', repo, 'init', '-q']);
  const put = bytes => cp.execFileSync('git', ['-C', repo, 'hash-object', '-w', '--stdin'], {input: bytes, encoding: 'utf8'}).trim();
  return {repo, put};
}

test('readGitBlobBatch reads binary, newline, empty and identical-content blobs by unique object id', t => {
  const {repo, put} = gitFixture(t);
  const values = [Buffer.from([0, 255, 10, 0, 128]), Buffer.from('line one\nline two\n'), Buffer.alloc(0)];
  const ids = values.map(put);
  const identicalId = put(values[1]);
  assert.equal(identicalId, ids[1]);
  let calls = 0;
  const result = contract.readGitBlobBatch(repo, ids, {run(repository, args, input) {
    calls++;
    assert.equal(repository, repo);
    assert.deepEqual(args, ['cat-file', '--batch']);
    assert.ok(Buffer.isBuffer(input));
    assert.deepEqual(input, Buffer.from([...new Set(ids)].join('\n') + '\n'));
    return cp.execFileSync('git', ['-C', repository, ...args], {input});
  }});
  assert.equal(calls, 1);
  assert.ok(result instanceof Map);
  assert.deepEqual([...result.keys()], ids);
  values.forEach((bytes, index) => assert.deepEqual(result.get(ids[index]), bytes));
});

test('readGitBlobBatch rejects invalid ids, empty requests and oversized batches before invoking git', () => {
  let calls = 0;
  const run = () => {calls++; return Buffer.alloc(0);};
  for (const ids of [[], [''], ['z'.repeat(40)], ['a'.repeat(39)], ['a'.repeat(41)], Array(16385).fill('a'.repeat(40))]) {
    assert.throws(() => contract.readGitBlobBatch('/owned/repo', ids, {run}), /^Error: windows-contract-git-batch-invalid$/);
  }
  assert.equal(calls, 0);
});

test('readGitBlobBatch deduplicates repeated object ids while preserving map lookup identity', t => {
  const {repo, put} = gitFixture(t);
  const bytes = Buffer.from('shared blob with a final newline\n');
  const oid = put(bytes);
  let calls = 0;
  const result = contract.readGitBlobBatch(repo, [oid, oid, oid], {run(repository, args, input) {
    calls++;
    assert.deepEqual(input, Buffer.from(oid + '\n'));
    return cp.execFileSync('git', ['-C', repository, ...args], {input});
  }});
  assert.equal(calls, 1);
  assert.deepEqual([...result.keys()], [oid]);
  assert.deepEqual(result.get(oid), bytes);
});

test('readGitBlobBatch accepts and verifies SHA-256 Git object ids', () => {
  const bytes = Buffer.from([0, 255, 10, 0, 128]);
  const oid = objectId256(bytes);
  const result = contract.readGitBlobBatch('/owned/repo', [oid], {run(repository, args, input) {
    assert.deepEqual(input, Buffer.from(oid + '\n'));
    return frame(oid, bytes);
  }});
  assert.deepEqual(result.get(oid), bytes);
});

test('readGitBlobBatch refuses malformed batch frames and incomplete output', () => {
  const bytes = Buffer.from('owned\nbytes'), otherBytes = Buffer.from('other');
  const a = objectId(bytes), b = objectId(otherBytes);
  const validA = frame(a, bytes), validB = frame(b, otherBytes);
  const nonAsciiHeader = Buffer.from(validA);
  nonAsciiHeader[0] = 0xff;
  const malformed = [
    {ids: [a, b], output: Buffer.concat([validB, validA])}, // wrong object order
    {ids: [a], output: nonAsciiHeader}, // non-ASCII header byte
    {ids: [a], output: frame(a, bytes, 'tree')}, // non-blob
    {ids: [a], output: Buffer.concat([Buffer.from(`${a} blob nope\n`), bytes, Buffer.from('\n')])}, // nonnumeric size
    {ids: [a], output: Buffer.concat([Buffer.from(`${a} blob 01\n`), bytes, Buffer.from('\n')])}, // noncanonical size
    {ids: [a], output: Buffer.concat([Buffer.from(`${a} blob 67108865\n`), Buffer.alloc(0), Buffer.from('\n')])}, // per-blob cap
    {ids: [a], output: Buffer.concat([Buffer.from(`${a} blob ${bytes.length}\n`), bytes.subarray(0, 4)])}, // short body
    {ids: [a], output: Buffer.concat([validA, Buffer.from('extra')])}, // trailing bytes
    {ids: [a], output: Buffer.from(`${a} missing\n`)}, // missing object
  ];
  for (const {ids, output} of malformed) {
    assert.throws(() => contract.readGitBlobBatch('/owned/repo', ids, {run: () => output}),
      /^Error: windows-contract-git-batch-invalid$/);
  }
  assert.throws(() => contract.readGitBlobBatch('/owned/repo', [a, b], {run: () => validA}),
    /^Error: windows-contract-git-batch-invalid$/);
});

test('readGitBlobBatch verifies the recomputed Git object id', () => {
  const requested = 'a'.repeat(40), bytes = Buffer.from('content whose id does not match');
  assert.throws(() => contract.readGitBlobBatch('/owned/repo', [requested], {run: () => frame(requested, bytes)}),
    /^Error: windows-contract-git-batch-object-mismatch$/);
});
