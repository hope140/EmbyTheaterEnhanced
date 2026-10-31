'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {createStore} = require('../../tools/shared-playback-cache/store.cjs');

const BLOCK = 256 * 1024;
const id = {server: 'crash-test-server', account: 'crash-test-account', item: 'crash-test-item',
  mediaSource: 'crash-test-source', resource: 'crash-test-resource', representation: 'crash-test-v1'};
const meta = {total: 2048, version: 'crash-test'};
const fail = () => process.exit(31);

async function ordinary(root, twoBlocks = false) {
  const store = await createStore({root, currentBytes: 2048, nextBytes: 2048, maxPendingBytes: 2 * BLOCK});
  const key = await store.open(id, meta, 'current');
  await store.actual(key);
  const first = Buffer.from('process-exit-committed-block');
  if (await store.put(key, 0, first) !== true) fail();
  if (twoBlocks) {
    const second = Buffer.from('second-complete-block');
    if (await store.put(key, 128, second) !== true) fail();
  }
  // Deliberately skip store.close(): the next process must recover from durable
  // checkpoint/journal/block state after an abrupt process exit.
  process.exit(0);
}

async function compactCrash(root) {
  let armed = false;
  const io = new Proxy(fs, {get(target, property) {
    if (property === 'open') return async (file, flags, ...args) => {
      const handle = await fs.open(file, flags, ...args);
      if (!armed || path.basename(String(file)) !== 'index.log') return handle;
      return new Proxy(handle, {get(fileHandle, member) {
        if (member === 'truncate') return async length => {
          if (length === 0) process.exit(0); // Checkpoint was renamed; preserve the old log.
          return fileHandle.truncate(length);
        };
        const value = fileHandle[member];
        return typeof value === 'function' ? value.bind(fileHandle) : value;
      }});
    };
    const value = target[property];
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const store = await createStore({root, currentBytes: 2048, nextBytes: 2048,
    maxPendingBytes: 2 * BLOCK, maxEntries: 2048, io});
  const key = await store.open(id, meta, 'current');
  await store.actual(key);
  armed = true;
  for (let offset = 0; offset < 513; offset++) {
    if (await store.put(key, offset, Buffer.from([offset & 255])) !== true) fail();
  }
  process.exit(32); // The compaction hook should have exited before this point.
}

const SENTINEL = 'external-journal-sentinel-must-stay-unchanged\n';
async function journalSwap(root, stage) {
  const journal = path.join(root, 'index.log');
  const sentinel = path.join(path.dirname(root), 'external-sentinel');
  const displaced = path.join(root, 'index.log-displaced');
  let armed = false, swapped = false;
  const swap = async () => {
    if (swapped) return;
    await fs.rename(journal, displaced);
    await fs.symlink(sentinel, journal);
    swapped = true;
  };
  const io = new Proxy(fs, {get(target, property) {
    if (property === 'lstat') return async file => {
      const stat = await fs.lstat(file);
      if (armed && ['after-lstat', 'reset'].includes(stage) && path.resolve(String(file)) === journal) {
        await swap();
        return stat; // Return the original regular-file identity to the caller.
      }
      return stat;
    };
    if (property === 'open') return async (file, flags, ...args) => {
      const handle = await fs.open(file, flags, ...args);
      if (armed && stage === 'after-open' && path.resolve(String(file)) === journal) await swap();
      return handle;
    };
    const value = target[property];
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const limits = stage === 'reset' ? {currentBytes: 2048, nextBytes: 2048, maxEntries: 2048}
    : {currentBytes: 2048, nextBytes: 2048};
  const store = await createStore({root, ...limits, io});
  const key = await store.open(id, meta, 'current');
  await store.actual(key);
  if (stage === 'reset') {
    for (let offset = 0; offset < 512; offset++) {
      if (await store.put(key, offset, Buffer.from([offset & 255])) !== true) fail();
    }
    armed = true;
    await store.close().catch(() => {}); // The checkpoint rename precedes the protected reset.
  } else {
    armed = true;
    await store.put(key, 0, Buffer.from('journal-swap-payload'));
  }
  if (!swapped || !store.status().faulted || await fs.readFile(sentinel, 'utf8') !== SENTINEL) fail();
  process.exit(0);
}

async function removeCrash(root) {
  let armed = false;
  const io = new Proxy(fs, {get(target, property) {
    if (property === 'unlink') return async file => {
      if (armed && String(file).endsWith('.bin')) process.exit(0);
      return fs.unlink(file);
    };
    const value = target[property];
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const store = await createStore({root, currentBytes: 8, nextBytes: 8,
    maxPendingBytes: 2 * BLOCK, io});
  const key = await store.open(id, {...meta, total: 32}, 'current');
  await store.actual(key);
  if (await store.put(key, 0, Buffer.from('four')) !== true) fail();
  armed = true;
  await store.put(key, 4, Buffer.from('five!')); // Schedules an eviction; its tombstone is journaled before unlink.
  await new Promise(resolve => setTimeout(resolve, 3000));
  process.exit(33);
}

async function main() {
  const [, , mode, root] = process.argv;
  if (!path.isAbsolute(root || '')) fail();
  if (mode === 'add-crash') return ordinary(root);
  if (mode === 'tail-crash') return ordinary(root, true);
  if (mode === 'compact-crash') return compactCrash(root);
  if (mode === 'remove-crash') return removeCrash(root);
  if (mode === 'append-lstat-swap') return journalSwap(root, 'after-lstat');
  if (mode === 'append-open-swap') return journalSwap(root, 'after-open');
  if (mode === 'reset-lstat-swap') return journalSwap(root, 'reset');
  fail();
}

main().catch(fail);
