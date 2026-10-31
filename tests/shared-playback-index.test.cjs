'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {temporaryRoot} = require('./helpers/range-fixture-root.cjs');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {createStore} = require('../tools/shared-playback-cache/store.cjs');
const {
  MAX_ROWS, MAX_INDEX_BYTES, MAX_JOURNAL_BYTES,
  decodeCheckpoint, encodeCheckpoint, encodeFrame, replayJournal,
} = require('../tools/shared-playback-cache/index.cjs');

const helper = path.join(__dirname, 'helpers', 'shared-cache-crash.cjs');
const SENTINEL = 'external-journal-sentinel-must-stay-unchanged\n';
const identity = {
  server: 'crash-test-server', account: 'crash-test-account', item: 'crash-test-item',
  mediaSource: 'crash-test-source', resource: 'crash-test-resource', representation: 'crash-test-v1',
};
const metadata = {total: 2048, version: 'crash-test'};
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

async function freshRoot(t) {
  const parent = temporaryRoot('ete-index-recovery-', ['cache']);
  const root = path.join(parent, 'cache');
  const stores = new Set();
  t.after(async () => {
    const results = await Promise.allSettled([...stores].map(store => Promise.resolve().then(() => store.close())));
    results.push(...await Promise.allSettled([fs.rm(parent, {recursive: true, force: true})]));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'owned-shared-index-fixture-cleanup-failed');
  });
  return {root, async create(options) {
    const store = await createStore({root, ...options}); stores.add(store); return store;
  }};
}

function crash(mode, root) {
  const result = spawnSync(process.execPath, [helper, mode, root], {encoding: 'utf8', timeout: 30000});
  assert.equal(result.error, undefined, 'crash helper should finish');
  assert.equal(result.status, 0, `crash helper exit status: ${result.status}`);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, '', 'helper must not print test paths');
  assert.equal(result.stderr, '', 'helper must not print diagnostics containing paths');
}

function makeState(total = 1024) {
  const key = sha('codec-key');
  return {version: 1, sequence: 0, actual: key, entries: [{key,
    baseKey: sha('codec-base'), meta: {total}, role: 'current', touched: 1, blocks: []}]};
}
function block(start = 0, length = 8) {
  return {start, length, hash: sha('codec-payload'), touched: 2};
}

test('checkpoint v2 codec uses bounded tuples and migrates v1 object blocks', () => {
  const key = sha('codec-key'), baseKey = sha('codec-base'), payload = Buffer.from('codec-data');
  const row = {start: 3, length: payload.length, hash: sha(payload), touched: 7,
    file: `${key}-3-${payload.length}-${sha(payload)}.bin`};
  const state = {version: 1, sequence: 4, actual: key,
    entries: [{key, baseKey, meta: {total: 1024}, role: 'current', touched: 9, blocks: [row]}]};
  const encoded = encodeCheckpoint(state, 5);
  const parsed = JSON.parse(encoded);
  assert.equal(parsed.version, 2);
  assert.deepEqual(parsed.entries[0].blocks[0], [3, payload.length, sha(payload), 7]);
  const decoded = decodeCheckpoint(parsed);
  assert.equal(decoded.sequence, 5);
  assert.deepEqual(decoded.entries[0].blocks[0], row);

  const v1 = {version: 1, actual: key, entries: [{key, baseKey, meta: {total: 1024},
    role: 'current', touched: 9, blocks: [row]}]};
  const migrated = decodeCheckpoint(v1);
  assert.equal(migrated.sequence, 0);
  assert.deepEqual(migrated.entries[0].blocks[0], row);
});

test('journal replay keeps complete frames and discards only an incomplete final tail', () => {
  const state = makeState();
  const key = state.actual;
  const first = encodeFrame(1, 'add', key, block(0));
  const second = encodeFrame(2, 'add', key, block(16));
  const tail = Buffer.from('{"sequence":3\tpartial');
  const bytes = Buffer.concat([first, second, tail]);
  const result = replayJournal(state, bytes);
  assert.equal(result.sequence, 2);
  assert.equal(result.replayedRecords, 2);
  assert.equal(result.discardedTailBytes, tail.length);
  assert.deepEqual(state.entries[0].blocks.map(row => [row.start, row.length]), [[0, 8], [16, 8]]);
});

test('journal replay rejects bad digest, duplicate sequence, sequence gaps, and out-of-range blocks', () => {
  const validState = makeState();
  const key = validState.actual;
  const valid = encodeFrame(1, 'add', key, block());
  const badDigest = Buffer.from(valid);
  const digestStart = badDigest.lastIndexOf(9) + 1;
  badDigest[digestStart] = badDigest[digestStart] === 48 ? 49 : 48;
  assert.throws(() => replayJournal(makeState(), badDigest), /invalid cache journal/);
  assert.throws(() => replayJournal(makeState(), Buffer.concat([valid, valid])), /invalid cache journal/);
  assert.throws(() => replayJournal(makeState(), encodeFrame(2, 'add', key, block())), /invalid cache journal/);
  assert.throws(() => replayJournal(makeState(), encodeFrame(1, 'add', key, block(1020, 8))), /invalid cache journal/);
});

test('checkpoint, journal byte, and serialized row ceilings are enforced', () => {
  assert.equal(MAX_INDEX_BYTES, 2 * 1024 * 1024);
  assert.equal(MAX_JOURNAL_BYTES, 1024 * 1024);
  assert.equal(MAX_ROWS, 16384);
  const hugeEntry = {...makeState().entries[0], padding: 'x'.repeat(MAX_INDEX_BYTES)};
  assert.throws(() => encodeCheckpoint({...makeState(), entries: [hugeEntry]}, 0), /cache index limit/);
  const tooManyRows = {version: 1, actual: null, entries: [{blocks: Array(MAX_ROWS).fill(null)}]};
  assert.throws(() => decodeCheckpoint(tooManyRows), /invalid cache journal/);
  assert.throws(() => replayJournal(makeState(), Buffer.alloc(MAX_JOURNAL_BYTES + 1)), /invalid cache journal/);
  assert.throws(() => replayJournal(makeState(), encodeFrame(1, 'add', makeState().actual, block()), {maxEntries: 1}),
    /invalid cache journal/);
});

test('abrupt process exit after a complete add frame reopens with matching bytes and span', async t => {
  const {root, create} = await freshRoot(t);
  crash('add-crash', root);
  const journal = await fs.readFile(path.join(root, 'index.log'));
  assert.equal(journal.toString().trim().split('\n').length, 1);
  const store = await create({currentBytes: 2048, nextBytes: 2048});
  const key = await store.open(identity, metadata, 'current');
  const payload = Buffer.from('process-exit-committed-block');
  assert.equal(store.status().currentKey, key);
  assert.deepEqual(await store.span(key, 0), {start: 0, end: payload.length});
  assert.deepEqual(await store.read(key, 0, payload.length), payload);
  assert.equal(store.status().indexMetrics.replayedRecords, 1);
});

test('abrupt exit with a half final frame preserves earlier adds and records discarded tail bytes', async t => {
  const {root, create} = await freshRoot(t);
  crash('tail-crash', root);
  const tail = Buffer.from('{"sequence":3\tpartial');
  await fs.appendFile(path.join(root, 'index.log'), tail);
  const store = await create({currentBytes: 2048, nextBytes: 2048});
  const key = await store.open(identity, metadata, 'current');
  assert.deepEqual(await store.read(key, 0, Buffer.byteLength('process-exit-committed-block')),
    Buffer.from('process-exit-committed-block'));
  assert.deepEqual(await store.read(key, 128, Buffer.byteLength('second-complete-block')),
    Buffer.from('second-complete-block'));
  assert.equal(store.status().indexMetrics.replayedRecords, 2);
  assert.equal(store.status().indexMetrics.discardedTailBytes, tail.length);
});

test('checkpoint rename before journal reset crash skips old frames without duplicate blocks', async t => {
  const {root, create} = await freshRoot(t);
  crash('compact-crash', root);
  const checkpoint = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8'));
  const oldLog = await fs.readFile(path.join(root, 'index.log'));
  assert.equal(checkpoint.sequence, 512);
  assert.equal(checkpoint.entries[0].blocks.length, 512);
  assert.ok(oldLog.length > 0);

  const store = await create({currentBytes: 2048, nextBytes: 2048, maxEntries: 2048});
  const key = await store.open(identity, metadata, 'current');
  assert.equal(store.status().blocks, 512, 'old journal frames are checkpointed, not applied twice');
  assert.equal(store.status().indexMetrics.replayedRecords, 0);
  assert.deepEqual(await store.span(key, 511), {start: 0, end: 512});
  assert.deepEqual(await store.read(key, 510, 2), Buffer.from([254, 255]));
  assert.equal((await fs.readdir(path.join(root, 'blocks'))).length, 512,
    'unindexed block written just before the crash is discarded');
});

test('short successful journal append faults and never publishes the added block', async t => {
  const {root, create} = await freshRoot(t);
  let shorten = false, shortWriteCalls = 0;
  const io = new Proxy(fs, {get(target, property) {
    if (property === 'open') return async (file, flags, ...args) => {
      const handle = await fs.open(file, flags, ...args);
      if (!shorten || path.basename(String(file)) !== 'index.log') return handle;
      return new Proxy(handle, {get(fileHandle, member) {
        if (member === 'write') return async (...writeArgs) => {
          if (shortWriteCalls++ === 0) {
            const [buffer, offset, length, position] = writeArgs;
            return fileHandle.write(buffer, offset, Math.max(1, Math.floor(length / 2)), position);
          }
          if (shortWriteCalls === 2) {
            shorten = false;
            return {bytesWritten: 0, buffer: writeArgs[0]};
          }
          return fileHandle.write(...writeArgs);
        };
        const value = fileHandle[member];
        return typeof value === 'function' ? value.bind(fileHandle) : value;
      }});
    };
    const value = target[property];
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const store = await create({currentBytes: 2048, nextBytes: 2048, io});
  const key = await store.open(identity, metadata, 'current');
  await store.actual(key);
  shorten = true;
  assert.equal(await store.put(key, 0, Buffer.from('short-frame')), false);
  assert.equal(shortWriteCalls, 2, 'writer handles a partial write followed by zero progress');
  assert.equal(store.status().faulted, true);
  assert.equal(await store.span(key, 0), null);
  assert.equal(store.status().committed, 0);
});

for (const [mode, name] of [
  ['append-lstat-swap', 'append refuses a journal symlink swapped after lstat and preserves the external sentinel'],
  ['append-open-swap', 'append refuses a journal path swapped after open but before descriptor identity validation'],
  ['reset-lstat-swap', 'checkpoint reset refuses a journal symlink swapped after lstat and preserves the external sentinel'],
]) test(name, async t => {
  const {root, create} = await freshRoot(t);
  const sentinel = path.join(path.dirname(root), 'external-sentinel');
  await fs.writeFile(sentinel, SENTINEL, {mode: 0o600});
  crash(mode, root);
  assert.equal(await fs.readFile(sentinel, 'utf8'), SENTINEL);
  const journalStat = await fs.lstat(path.join(root, 'index.log'));
  assert.equal(journalStat.isSymbolicLink(), true);
  if (mode === 'reset-lstat-swap') {
    const checkpoint = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8'));
    assert.equal(checkpoint.sequence, 512, 'checkpoint rename completed before the rejected reset');
    assert.equal((await fs.stat(path.join(root, 'index.log-displaced'))).size > 0, true);
  }
});

test('committed remove tombstone prevents block resurrection after pre-unlink process exit', async t => {
  const {root, create} = await freshRoot(t);
  crash('remove-crash', root);
  const journal = (await fs.readFile(path.join(root, 'index.log'), 'utf8')).trim().split('\n');
  assert.equal(journal.length, 2);
  assert.equal(JSON.parse(journal[0].slice(0, journal[0].lastIndexOf('\t'))).op, 'add');
  assert.equal(JSON.parse(journal[1].slice(0, journal[1].lastIndexOf('\t'))).op, 'remove');
  assert.equal((await fs.readdir(path.join(root, 'blocks'))).length, 1, 'crash happened before physical unlink');

  const store = await create({currentBytes: 8, nextBytes: 8});
  const key = await store.open(identity, {...metadata, total: 32}, 'current');
  assert.equal(store.status().currentKey, key);
  assert.equal(store.status().committed, 0);
  assert.equal(await store.span(key, 0), null);
  assert.equal((await fs.readdir(path.join(root, 'blocks'))).length, 0,
    'recovery removes the tombstoned orphan instead of reviving it');
});

test('legacy v1 checkpoint with object blocks migrates and reopens intact', async t => {
  const {root, create} = await freshRoot(t);
  let store = await create({currentBytes: 2048, nextBytes: 2048});
  const key = await store.open(identity, metadata, 'current');
  await store.actual(key);
  const payload = Buffer.from('legacy-checkpoint-payload');
  assert.equal(await store.put(key, 17, payload), true);
  await store.close();
  const checkpoint = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8'));
  const legacy = {version: 1, actual: checkpoint.actual, entries: checkpoint.entries.map(entry => ({
    ...entry,
    blocks: entry.blocks.map(([start, length, hash, touched]) => ({start, length, hash, touched,
      file: `${entry.key}-${start}-${length}-${hash}.bin`})),
  }))};
  await fs.writeFile(path.join(root, 'index.json'), JSON.stringify(legacy));
  store = await create({currentBytes: 2048, nextBytes: 2048});
  const reopened = await store.open(identity, metadata, 'current');
  assert.equal(reopened, key);
  assert.deepEqual(await store.read(reopened, 17, payload.length), payload);
});

test('bounded rolling window writes add and remove journal frames and keeps the final eight blocks across reopen', async t => {
  const {root, create} = await freshRoot(t);
  const blockBytes = 16, windowBlocks = 8, blockCount = 700;
  const currentBytes = blockBytes * windowBlocks, nextBytes = blockBytes;
  const meta = {total: blockBytes * blockCount, version: 'rolling-window'};
  let store = await create({currentBytes, nextBytes, maxPendingBytes: 4 * blockBytes});
  const key = await store.open(identity, meta, 'current');
  await store.actual(key);
  const dataFor = index => {
    const bytes = Buffer.alloc(blockBytes, index & 255);
    bytes.writeUInt32BE(index, 0);
    return bytes;
  };
  for (let index = 0; index < blockCount; index++) {
    const start = index * blockBytes, payload = dataFor(index);
    let committed = false;
    for (let attempt = 0; attempt < 200 && !committed; attempt++) {
      committed = await store.put(key, start, payload);
      const status = store.status();
      assert.ok(status.current + status.next <= currentBytes + nextBytes,
        'committed plus reserved bytes stay within the configured total budget');
      if (!committed) await new Promise(resolve => setTimeout(resolve, 1));
    }
    assert.equal(committed, true, `bounded retry should admit block ${index}: ${JSON.stringify(store.status())}`);
  }

  const beforeClose = store.status();
  assert.equal(beforeClose.current, currentBytes, 'the final current window fills exactly eight blocks');
  assert.equal(beforeClose.next, 0);
  assert.equal(beforeClose.blocks, windowBlocks);
  assert.ok(beforeClose.indexMetrics.journalWrites >= blockCount,
    'journal includes add and eviction remove records');
  assert.ok(beforeClose.indexMetrics.compactions >= 1, 'long rolling writes compact the journal');
  assert.ok(beforeClose.indexMetrics.checkpointWrites < blockCount / 10,
    'metadata checkpoint writes remain far fewer than payload block writes');
  assert.equal(beforeClose.pending, 0);
  assert.equal(beforeClose.reserved, 0);

  const finalStart = (blockCount - windowBlocks) * blockBytes;
  const expected = Buffer.concat(Array.from({length: windowBlocks}, (_, offset) => dataFor(blockCount - windowBlocks + offset)));
  assert.deepEqual(await store.span(key, finalStart), {start: finalStart, end: meta.total});
  assert.deepEqual(await store.read(key, finalStart, expected.length), expected);
  await store.close();

  store = await create({currentBytes, nextBytes, maxPendingBytes: 4 * blockBytes});
  const reopened = await store.open(identity, meta, 'current');
  assert.equal(reopened, key);
  assert.equal(store.status().current, currentBytes);
  assert.equal(store.status().blocks, windowBlocks);
  assert.deepEqual(await store.span(reopened, finalStart), {start: finalStart, end: meta.total});
  assert.deepEqual(await store.read(reopened, finalStart, expected.length), expected);
});
