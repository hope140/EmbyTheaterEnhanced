'use strict';

// An owned, bounded byte-range store. All names and on-disk metadata are derived
// from hashes; source URLs, authorization headers and account IDs are never saved.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {acquireGuard} = require('../playback-range-identity');
const {MAX_ROWS, MAX_INDEX_BYTES, MAX_JOURNAL_BYTES, MAX_RECORDS,
  packBlock, decodeCheckpoint, encodeCheckpoint, encodeFrame, replayJournal} = require('./index');

const MAX_BLOCK = 256 * 1024;
const OWNER = 'ete-shared-playback-cache-v1';
const INDEX = 'index.json';
const JOURNAL = 'index.log';
const BLOCKS = 'blocks';
const MAX_READ_BLOCKS = 128;
const IDENTITY_FIELDS = ['server', 'account', 'item', 'mediaSource', 'resource', 'representation'];
const META_FIELDS = ['etag', 'lastModified', 'version'];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonnegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function identityKey(identity) {
  if (!identity || typeof identity !== 'object') throw new TypeError('identity required');
  const parts = IDENTITY_FIELDS.map((field) => {
    const value = identity[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`identity.${field} required`);
    }
    return value;
  });
  return sha256(JSON.stringify(parts));
}

function mediaKey(identity) {
  if (!identity || ['server', 'account', 'item', 'mediaSource'].some(key => typeof identity[key] !== 'string' || !identity[key])) return null;
  return sha256(JSON.stringify(['server', 'account', 'item', 'mediaSource'].map(key => identity[key])));
}

function metadataRecord(metadata) {
  if (!metadata || !positiveSafeInteger(metadata.total)) {
    throw new TypeError('metadata.total must be a positive safe integer');
  }
  const record = {total: metadata.total};
  for (const field of META_FIELDS) {
    const value = metadata[field];
    if (value !== undefined && value !== null) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new TypeError(`metadata.${field} must be a nonempty string`);
      }
      record[field] = sha256(value);
    }
  }
  return record;
}

function sameMetadata(a, b) {
  return a.total === b.total && META_FIELDS.every((field) => a[field] === b[field]);
}

function versionKey(baseKey, meta) {
  return sha256(JSON.stringify([baseKey, meta.total, ...META_FIELDS.map((field) => meta[field] ?? null)]));
}

function isLive(check) {
  try { return check() === true; }
  catch { return false; }
}

function blockName(key, start, length, hash) {
  return `${key}-${start}-${length}-${hash}.bin`;
}

async function readMetadataBounded(io, indexPath, limit) {
  const pathStat = await io.lstat(indexPath);
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.nlink !== 1 ||
      pathStat.size > limit) throw new Error('unsafe cache index');
  const handle = await io.open(indexPath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > limit ||
        stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) {
      throw new Error('unsafe cache index');
    }
    const data = Buffer.alloc(stat.size);
    let position = 0;
    while (position < data.length) {
      const {bytesRead} = await handle.read(data, position, data.length - position, position);
      if (!bytesRead) throw new Error('truncated cache index');
      position += bytesRead;
    }
    return data;
  } finally {
    await handle.close();
  }
}

async function createStore({
  root,
  currentBytes,
  nextBytes,
  maxPendingBytes = 2 * 1024 * 1024,
  maxEntries = MAX_ROWS,
  recoveryMode = 'verified',
  existingOnly = false,
  retainPlayback = true,
  io = fs,
} = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new TypeError('root must be an absolute path');
  }
  if (!positiveSafeInteger(currentBytes) || !positiveSafeInteger(nextBytes) ||
      !positiveSafeInteger(maxPendingBytes) || !positiveSafeInteger(maxEntries)) {
    throw new TypeError('cache limits must be positive safe integers');
  }
  if (typeof retainPlayback !== 'boolean') throw new TypeError('invalid retention policy');
  if (maxEntries > MAX_ROWS || !['verified', 'on-demand'].includes(recoveryMode)) throw new TypeError('cache entry limit or recovery mode is invalid');
  if (!Number.isSafeInteger(currentBytes + nextBytes)) {
    throw new TypeError('combined cache limit is unsafe');
  }
  const ownedRoot = path.resolve(root);
  const ownerPath = path.join(ownedRoot, '.owner');
  const indexPath = path.join(ownedRoot, INDEX);
  const journalPath = path.join(ownedRoot, JOURNAL);
  const blocksPath = path.join(ownedRoot, BLOCKS);
  let rootStat;
  try {
    rootStat = await io.lstat(ownedRoot);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (rootStat && (!rootStat.isDirectory() || rootStat.isSymbolicLink())) {
    throw new Error('cache root is not an owned directory');
  }
  if (!rootStat && existingOnly) throw new Error('existing cache root is unavailable');
  if (!rootStat) await io.mkdir(ownedRoot, {mode: 0o700});
  rootStat = await io.lstat(ownedRoot);
  if (process.platform !== 'win32' && (rootStat.mode & 0o077) !== 0) {
    throw new Error('cache root is not private');
  }
  if (await io.realpath(ownedRoot) !== ownedRoot) {
    throw new Error('cache root traverses a symlink');
  }
  const guard = await acquireGuard(ownedRoot);
  try {
  let owner;
  try {
    owner = await io.readFile(ownerPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (existingOnly) throw new Error('existing cache owner is unavailable');
    const existing = await io.readdir(ownedRoot);
    if (existing.length) throw new Error('cache root is not empty or owned');
    await io.writeFile(ownerPath, `${OWNER}\n`, {flag: 'wx', mode: 0o600});
    owner = `${OWNER}\n`;
  }
  if (owner !== `${OWNER}\n`) throw new Error('cache root owner mismatch');
  const ownerStat = await io.lstat(ownerPath);
  if (!ownerStat.isFile() || ownerStat.isSymbolicLink() || ownerStat.nlink !== 1) {
    throw new Error('unsafe cache owner marker');
  }
  for (const filename of await io.readdir(ownedRoot)) {
    if (filename === '.owner' || filename === INDEX || filename === JOURNAL || filename === BLOCKS) continue;
    if (!/^\.index-[a-f0-9-]+\.tmp$/.test(filename)) {
      throw new Error('unexpected file in cache root');
    }
    const candidate = path.join(ownedRoot, filename);
    const stat = await io.lstat(candidate);
    if (stat.isDirectory()) throw new Error('unexpected cache directory');
    await io.unlink(candidate);
  }
  try {
    const stat = await io.lstat(blocksPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('unsafe cache blocks directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (existingOnly) throw new Error('existing cache blocks are unavailable');
    await io.mkdir(blocksPath, {mode: 0o700});
  }
  const rootIdentity = await io.lstat(ownedRoot);
  const blocksIdentity = await io.lstat(blocksPath);
  const ownerIdentity = await io.lstat(ownerPath);
  if (process.platform !== 'win32' && (blocksIdentity.mode & 0o077) !== 0) {
    throw new Error('cache blocks directory is not private');
  }
  async function assertOwnedPaths() {
    if (await io.realpath(ownedRoot) !== ownedRoot) throw new Error('cache root redirected');
    for (const [name, original, directory] of [
      [ownedRoot, rootIdentity, true], [blocksPath, blocksIdentity, true],
      [ownerPath, ownerIdentity, false],
    ]) {
      const now = await io.lstat(name);
      if (now.dev !== original.dev || now.ino !== original.ino || now.isSymbolicLink() ||
          (directory ? !now.isDirectory() : !now.isFile() || now.nlink !== 1)) {
        throw new Error('cache owned path changed');
      }
    }
  }
  async function readBlockBounded(block) {
    await assertOwnedPaths();
    const filename = path.join(blocksPath, block.file);
    const pathStat = await io.lstat(filename);
    if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.nlink !== 1 ||
        pathStat.size !== block.length) return null;
    const handle = await io.open(filename, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size !== block.length ||
          stat.dev !== pathStat.dev || stat.ino !== pathStat.ino) return null;
      const data = Buffer.alloc(block.length);
      let position = 0;
      while (position < data.length) {
        const {bytesRead} = await handle.read(data, position, data.length - position, position);
        if (!bytesRead) return null;
        position += bytesRead;
      }
      return data;
    } finally {
      await handle.close();
    }
  }

  const entries = new Map();
  const retired = new Map();
  const orphans = new Map();
  const indexOrphans = new Set();
  const corruptBlocks = new Set();
  let actualKey = null;
  let reservedCurrent = 0;
  let reservedNext = 0;
  let pendingBytes = 0;
  let pendingCount = 0;
  let reservedBlocks = 0;
  let peakBytes = 0;
  let readers = 0;
  let closed = false;
  let closing = false;
  let faulted = false;
  let queue = Promise.resolve();
  let reclaimScheduled = false;
  let closePromise;
  let sequence = 0, journalRecords = 0, journalBytes = 0, estimatedIndexBytes = 0;
  const indexMetrics = {checkpointBytes: 0, journalBytes: 0, checkpointWrites: 0,
    checkpointWriteBytes: 0, journalWrites: 0, journalWriteBytes: 0, compactions: 0,
    replayedRecords: 0, discardedTailBytes: 0};
  const readJobs = new Set();

  function activeBytes(role) {
    let total = 0;
    for (const entry of entries.values()) {
      if (entry.role === role) for (const block of entry.blocks) total += block.length;
    }
    for (const block of retired.values()) if (block.role === role) total += block.length;
    for (const orphan of orphans.values()) if (orphan.role === role) total += orphan.length;
    return total;
  }

  function blockCount() {
    let count = retired.size + reservedBlocks;
    for (const entry of entries.values()) count += entry.blocks.length;
    return count;
  }

  function used(role) {
    return activeBytes(role) + (role === 'current' ? reservedCurrent : reservedNext);
  }

  function updatePeak() {
    peakBytes = Math.max(peakBytes, used('current') + used('next'));
  }

  function snapshot(extra = null) {
    return {
      version: 1,
      actual: actualKey,
      entries: [...entries.values()].map((entry) => ({
        key: entry.key,
        baseKey: entry.baseKey,
        mediaKey: entry.mediaKey,
        meta: entry.meta,
        role: entry.role,
        touched: entry.touched,
        blocks: entry.blocks.concat(extra?.entry === entry ? [extra.block] : [])
          .map(({start, length, hash, file, touched}) => ({
          start, length, hash, file, touched,
          })),
      })),
    };
  }

  async function unlinkQuietly(file) {
    try {
      await assertOwnedPaths();
      await io.unlink(file);
      orphans.delete(file);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        orphans.delete(file);
        return true;
      }
      faulted = true;
      return false;
    }
  }

  async function persist(extra = null) {
    if (extra) return appendMutation('add', extra.entry, extra.block);
    const temp = path.join(ownedRoot, `.index-${crypto.randomUUID()}.tmp`);
    try {
      await assertOwnedPaths();
      const serialized = encodeCheckpoint(snapshot(), sequence);
      await io.writeFile(temp, serialized, {flag: 'wx', mode: 0o600});
      indexMetrics.checkpointWrites++;
      indexMetrics.checkpointWriteBytes += Buffer.byteLength(serialized);
      await io.rename(temp, indexPath);
      // Rename commits the checkpoint first. A crash before reset leaves old
      // frames, which recovery validates but skips through this sequence.
      const journal = await openJournal(true);
      try {
        await journal.handle.truncate(0);
        await verifyJournalHandle(journal.handle, journal.stat, 0);
      } finally {await journal.handle.close();}
      if (journalRecords) indexMetrics.compactions++;
      journalBytes = 0; journalRecords = 0;
      estimatedIndexBytes = Buffer.byteLength(serialized);
      indexMetrics.checkpointBytes = estimatedIndexBytes;
      indexMetrics.journalBytes = 0;
    } catch (error) {
      if (!await unlinkQuietly(temp)) indexOrphans.add(temp);
      faulted = true;
      throw error;
    }
  }

  async function verifyJournalHandle(handle, expected, size = expected.size) {
    await assertOwnedPaths();
    const opened = await handle.stat(), current = await io.lstat(journalPath);
    for (const stat of [opened, current]) {
      if (!stat.isFile() || stat.isSymbolicLink?.() || stat.nlink !== 1 || stat.size !== size ||
          stat.dev !== expected.dev || stat.ino !== expected.ino || stat.size > MAX_JOURNAL_BYTES) {
        throw new Error('unsafe cache journal');
      }
    }
  }

  async function openJournal(missing = false) {
    await assertOwnedPaths();
    let before;
    try {before = await io.lstat(journalPath);}
    catch (error) {if (!missing || error.code !== 'ENOENT') throw error;}
    if (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_JOURNAL_BYTES)) {
      throw new Error('unsafe cache journal');
    }
    // Never open an existing path with create/truncate/append flags. A swapped
    // symlink must be rejected by fstat before ANY write reaches its target.
    const handle = await io.open(journalPath, before ? 'r+' : 'wx', 0o600);
    try {
      before ||= await handle.stat();
      await verifyJournalHandle(handle, before);
      return {handle, stat: before};
    } catch (error) {await handle.close(); throw error;}
  }

  async function appendMutation(op, entry, block) {
    try {
      if (!Number.isSafeInteger(sequence + 1)) throw new Error('cache journal sequence');
      const frame = encodeFrame(sequence + 1, op, entry.key, block);
      // Compact only already-published memory state BEFORE the next frame.
      // put() publishes its new block only after this append has completed.
      if (journalRecords >= MAX_RECORDS || journalBytes + frame.length > MAX_JOURNAL_BYTES) await persist();
      const journal = await openJournal();
      try {
        if (journal.stat.size !== journalBytes) throw new Error('cache journal changed');
        let written = 0;
        while (written < frame.length) {
          const {bytesWritten} = await journal.handle.write(frame, written, frame.length - written, journalBytes + written);
          if (!Number.isSafeInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > frame.length - written) {
            throw new Error('cache journal short write');
          }
          written += bytesWritten;
        }
        await verifyJournalHandle(journal.handle, journal.stat, journalBytes + frame.length);
        indexMetrics.journalWrites++; indexMetrics.journalWriteBytes += frame.length;
      } finally {await journal.handle.close();}
      sequence++; journalRecords++; journalBytes += frame.length;
      indexMetrics.journalBytes = journalBytes;
      // An overestimate between checkpoints is intentional. Removes never free
      // serialized capacity until compact; no full-index stringify per block.
      if (op === 'add') estimatedIndexBytes += Buffer.byteLength(JSON.stringify(packBlock(block))) + 4;
    } catch (error) {faulted = true; throw error;}
  }

  async function deleteRetired(block) {
    if (retired.get(block.file) !== block) return;
    if (block.readers) return;
    if (block.deletePromise) return block.deletePromise;
    block.deletePromise = (async () => {
      if (await unlinkQuietly(path.join(blocksPath, block.file))) retired.delete(block.file);
    })();
    try { await block.deletePromise; }
    finally { block.deletePromise = null; }
  }

  function retire(block, role) {
    block.role = role;
    retired.set(block.file, block);
  }

  async function retireEntry(entry) {
    entries.delete(entry.key);
    if (actualKey === entry.key) actualKey = null;
    for (const block of entry.blocks) retire(block, entry.role);
    entry.blocks = [];
  }

  async function drainRetired() {
    for (const block of [...retired.values()]) await deleteRetired(block);
  }

  async function removeCorruptBlock(block) {
    for (const entry of entries.values()) {
      if (!entry.blocks.includes(block)) continue;
      await appendMutation('remove', entry, block);
      entry.blocks.splice(entry.blocks.indexOf(block), 1);
      retire(block, entry.role);
      await drainRetired();
      return;
    }
  }

  function enqueue(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }

  // Fail closed on malformed or foreign indexes. A crash can leave unindexed
  // block files; they are discarded rather than inferred as valid spans.
  let diskIndex;
  try {
    await assertOwnedPaths();
    const indexStat = await io.lstat(indexPath);
    if (!indexStat.isFile() || indexStat.isSymbolicLink() || indexStat.nlink !== 1 ||
        indexStat.size > MAX_INDEX_BYTES) throw new Error('unsafe cache index');
    diskIndex = decodeCheckpoint(JSON.parse((await readMetadataBounded(io, indexPath, MAX_INDEX_BYTES)).toString('utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    diskIndex = {version: 1, sequence: 0, actual: null, entries: []};
  }
  let journalData;
  try {journalData = await readMetadataBounded(io, journalPath, MAX_JOURNAL_BYTES);}
  catch (error) {if (error.code !== 'ENOENT') throw error; journalData = Buffer.alloc(0);}
  const replayed = replayJournal(diskIndex, journalData, {maxEntries});
  diskIndex = replayed.state; sequence = replayed.sequence;
  journalBytes = journalData.length; journalRecords = replayed.records;
  indexMetrics.replayedRecords = replayed.replayedRecords;
  indexMetrics.discardedTailBytes = replayed.discardedTailBytes;
  if (diskIndex.version !== 1 || !Array.isArray(diskIndex.entries) ||
      diskIndex.entries.length > maxEntries ||
      diskIndex.entries.reduce((count, entry) => count +
        1 + (Array.isArray(entry?.blocks) ? entry.blocks.length : maxEntries + 1), 0) > maxEntries ||
      (diskIndex.actual !== null && !/^[a-f0-9]{64}$/.test(diskIndex.actual))) {
    throw new Error('invalid cache index');
  }
  const knownFiles = new Set();
  for (const stored of diskIndex.entries) {
    if (!stored || !/^[a-f0-9]{64}$/.test(stored.key) ||
        !/^[a-f0-9]{64}$/.test(stored.baseKey) ||
        !stored.meta || !positiveSafeInteger(stored.meta.total) ||
        !['next', 'current'].includes(stored.role) || !Array.isArray(stored.blocks) ||
        entries.has(stored.key) || stored.key !== versionKey(stored.baseKey, stored.meta)) {
      throw new Error('invalid cache entry');
    }
    // Only the last actually played object survives restart. Other entries
    // remain untrusted until an application open() establishes fresh authority.
    if (!retainPlayback || stored.key !== diskIndex.actual) continue;
    if (stored.mediaKey !== undefined && !/^[a-f0-9]{64}$/.test(stored.mediaKey)) throw new Error('invalid cache media owner');
    const entry = {key: stored.key, baseKey: stored.baseKey, mediaKey: stored.mediaKey, meta: stored.meta, role: 'current',
      touched: Number.isSafeInteger(stored.touched) ? stored.touched : Date.now(), blocks: []};
    for (const b of stored.blocks) {
      if (!b || !nonnegativeSafeInteger(b.start) || !positiveSafeInteger(b.length) ||
          b.length > MAX_BLOCK || b.start + b.length > entry.meta.total ||
          !/^[a-f0-9]{64}$/.test(b.hash) ||
          b.file !== blockName(entry.key, b.start, b.length, b.hash) || knownFiles.has(b.file)) {
        throw new Error('invalid cache block index');
      }
      if (recoveryMode === 'on-demand') {
        // Establish physical occupancy without reading the media bytes. These
        // spans are candidates only: read() must verify SHA before delivery.
        let stat;
        try {stat = await io.lstat(path.join(blocksPath, b.file));} catch {continue;}
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== b.length) continue;
      } else {
        let data;
        try { data = await readBlockBounded(b); } catch { continue; }
        if (!data || sha256(data) !== b.hash) continue;
      }
      knownFiles.add(b.file);
      entry.blocks.push({start: b.start, length: b.length, hash: b.hash, file: b.file,
        touched: Number.isSafeInteger(b.touched) ? b.touched : entry.touched, readers: 0,
        verified: recoveryMode === 'verified'});
    }
    entry.blocks.sort((a, b) => a.start - b.start);
    for (let i = 1; i < entry.blocks.length; i++) {
      if (entry.blocks[i - 1].start + entry.blocks[i - 1].length > entry.blocks[i].start) {
        throw new Error('overlapping cache index');
      }
    }
    entries.set(entry.key, entry);
    actualKey = entry.key;
  }
  for (const filename of await io.readdir(blocksPath)) {
    if (!knownFiles.has(filename)) {
      const candidate = path.join(blocksPath, filename);
      const stat = await io.lstat(candidate);
      if (stat.isDirectory()) throw new Error('unexpected cache subdirectory');
      if (!await unlinkQuietly(candidate)) throw new Error('cannot clean unindexed cache file');
    }
  }
  const recoveredActual = entries.get(actualKey);
  if (recoveredActual) {
    recoveredActual.blocks.sort((a, b) => a.touched - b.touched);
    let retainedBytes = recoveredActual.blocks.reduce((total, block) => total + block.length, 0);
    while ((retainedBytes > currentBytes || recoveredActual.blocks.length + 1 >= maxEntries) &&
           recoveredActual.blocks.length) {
      const block = recoveredActual.blocks.shift();
      retainedBytes -= block.length;
      retire(block, 'current');
    }
    // Span merging and forward hole lookup require byte order after LRU trimming.
    recoveredActual.blocks.sort((a, b) => a.start - b.start);
  }
  await persist();
  await drainRetired();
  updatePeak();

  function ensureOpen() {
    if (closing || closed) throw new Error('cache closed');
    if (faulted) throw new Error('cache unavailable');
  }

  async function evictOne(role, protectedKey = null) {
    let victimEntry;
    let victim;
    for (const entry of entries.values()) {
      if (entry.role !== role || entry.key === protectedKey) continue;
      for (const block of entry.blocks) {
        if (!victim || block.touched < victim.touched) {
          victimEntry = entry;
          victim = block;
        }
      }
    }
    if (!victim) return false;
    await appendMutation('remove', victimEntry, victim);
    victimEntry.blocks.splice(victimEntry.blocks.indexOf(victim), 1);
    retire(victim, role);
    await deleteRetired(victim);
    return true;
  }

  async function trim(role, limit, protectedKey = null) {
    while (used(role) > limit) {
      if (!await evictOne(role, protectedKey)) break;
    }
  }

  async function open(identity, metadata, role = 'next', {
    isCurrent = () => true, retainActualFrom = null,
  } = {}) {
    ensureOpen();
    if (!['next', 'current'].includes(role)) throw new TypeError('invalid cache role');
    if (typeof isCurrent !== 'function') throw new TypeError('isCurrent must be a function');
    if (retainActualFrom !== null &&
        (typeof retainActualFrom !== 'string' || !/^[a-f0-9]{64}$/.test(retainActualFrom))) {
      throw new TypeError('retainActualFrom must be a cache key or null');
    }
    const baseKey = identityKey(identity);
    const meta = metadataRecord(metadata);
    const key = versionKey(baseKey, meta);
    return enqueue(async () => {
      if (closed || faulted) throw new Error('cache unavailable');
      // The caller's route may retire while earlier disk work holds the queue.
      // Check synchronously at execution, before touching any version or span.
      if (!isLive(isCurrent)) throw new Error('cache request retired');
      // Metadata enrichment may replace this route's actual version, but cannot
      // select it after another queued route has become actual.
      const retainActual = retainActualFrom !== null && actualKey === retainActualFrom &&
        entries.get(retainActualFrom)?.baseKey === baseKey;
      const effectiveRole = retainActual ? 'current' : role;
      let retiredVersion = false;
      for (const stale of [...entries.values()]) {
        if (stale.baseKey === baseKey && stale.key !== key) {
          retireEntry(stale);
          retiredVersion = true;
        }
      }
      if (retiredVersion) {
        await persist();
        await drainRetired();
      }
      if (!isLive(isCurrent)) throw new Error('cache request retired');
      let entry = entries.get(key);
      if (entry && !sameMetadata(entry.meta, meta)) throw new Error('cache version collision');
      // A prepared next-source hit needs its existing key, not a new durable
      // checkpoint just to touch recency. Keep the queue/liveness and physical
      // ownership barriers; role/version/actual changes still persist below.
      if (entry && entry.role === effectiveRole && entry.mediaKey === mediaKey(identity) &&
          !retiredVersion && !retainActual && !retired.size && !orphans.size && !indexOrphans.size) {
        try {await assertOwnedPaths();} catch (error) {faulted = true; throw error;}
        if (!isLive(isCurrent)) throw new Error('cache request retired');
        entry.touched = Date.now();
        return key;
      }
      if (!entry) {
        while (entries.size + blockCount() >= maxEntries) {
          const candidate = [...entries.values()]
            .filter((item) => item.key !== actualKey && item.role === 'next')
            .sort((a, b) => a.touched - b.touched)[0];
          if (!candidate) throw new Error('cache entry limit');
          if (!isLive(isCurrent)) throw new Error('cache request retired');
          retireEntry(candidate);
          await persist();
          await drainRetired();
        }
        if (!isLive(isCurrent)) throw new Error('cache request retired');
        entry = {key, baseKey, mediaKey: mediaKey(identity), meta, role: effectiveRole, touched: Date.now(), blocks: []};
        entries.set(key, entry);
      } else if (entry.key !== actualKey && entry.role !== effectiveRole) {
        if (!isLive(isCurrent)) throw new Error('cache request retired');
        entry.role = effectiveRole;
        await trim(effectiveRole, effectiveRole === 'current' ? currentBytes : nextBytes,
          effectiveRole === 'current' ? actualKey : null);
      }
      if (!isLive(isCurrent)) throw new Error('cache request retired');
      entry.mediaKey = mediaKey(identity);
      if (retainActual) actualKey = key;
      entry.touched = Date.now();
      await persist();
      await drainRetired();
      return key;
    });
  }

  async function actual(key, {isCurrent = () => true} = {}) {
    ensureOpen();
    if (typeof isCurrent !== 'function') throw new TypeError('isCurrent must be a function');
    return enqueue(async () => {
      if (closed || faulted) return false;
      if (!isLive(isCurrent)) return false;
      const entry = entries.get(key);
      if (!entry) return false;
      for (const other of [...entries.values()]) {
        if (other.key !== key && (other.key === actualKey || other.role === 'next')) {
          retireEntry(other);
        }
      }
      entry.role = 'current';
      entry.touched = Date.now();
      actualKey = key;
      await persist();
      await drainRetired();
      await trim('current', currentBytes);
      await persist();
      await drainRetired();
      return true;
    });
  }

  function validOffset(offset) {
    return nonnegativeSafeInteger(offset);
  }

  async function span(key, offset) {
    if (!validOffset(offset)) throw new TypeError('invalid offset');
    if (closing || closed || faulted) return null;
    const entry = entries.get(key);
    if (!entry) return null;
    const blocks = entry.blocks;
    const index = blocks.findIndex((b) => b.start <= offset && offset < b.start + b.length);
    if (index < 0) return null;
    let first = index;
    let last = index;
    while (first > 0 && blocks[first - 1].start + blocks[first - 1].length === blocks[first].start) {
      first--;
    }
    while (last + 1 < blocks.length &&
           blocks[last + 1].start === blocks[last].start + blocks[last].length) {
      last++;
    }
    return {start: blocks[first].start, end: blocks[last].start + blocks[last].length};
  }

  async function nextOffset(key, offset) {
    if (!validOffset(offset)) throw new TypeError('invalid offset');
    if (closing || closed || faulted) return null;
    const entry = entries.get(key);
    return entry ? (entry.blocks.find((b) => b.start > offset)?.start ?? null) : null;
  }

  async function read(key, offset, length) {
    if (!validOffset(offset) || !positiveSafeInteger(length) || length > MAX_BLOCK ||
        !Number.isSafeInteger(offset + length)) throw new TypeError('invalid read range');
    if (closing || closed || faulted) return null;
    const entry = entries.get(key);
    if (!entry || offset + length > entry.meta.total) return null;
    const selected = [];
    let position = offset;
    while (position < offset + length) {
      const block = entry.blocks.find((b) => b.start <= position && position < b.start + b.length);
      if (!block) return null;
      selected.push(block);
      if (selected.length > MAX_READ_BLOCKS) return null;
      position = Math.min(offset + length, block.start + block.length);
    }
    for (const block of selected) block.readers++;
    readers++;
    let finishRead;
    const job = new Promise((resolve) => { finishRead = resolve; });
    readJobs.add(job);
    try {
      const result = [];
      for (const block of selected) {
        const data = await readBlockBounded(block);
        if (!data || sha256(data) !== block.hash) {
          if (closing) corruptBlocks.add(block);
          else enqueue(() => removeCorruptBlock(block)).catch(() => {});
          return null;
        }
        const from = Math.max(offset, block.start);
        const to = Math.min(offset + length, block.start + block.length);
        result.push(data.subarray(from - block.start, to - block.start));
        block.verified = true;
        block.touched = Date.now();
      }
      entry.touched = Date.now();
      return Buffer.concat(result, length);
    } catch {
      return null;
    } finally {
      for (const block of selected) block.readers--;
      readers--;
      for (const block of selected) if (retired.has(block.file)) await deleteRetired(block);
      readJobs.delete(job);
      finishRead();
    }
  }

  function put(key, start, data) {
    if (!Buffer.isBuffer(data) || !positiveSafeInteger(data.length) || data.length > MAX_BLOCK ||
        !validOffset(start) || !Number.isSafeInteger(start + data.length)) {
      return Promise.resolve(false);
    }
    if (closing || closed || faulted || pendingBytes + data.length > maxPendingBytes ||
        pendingCount >= maxEntries) return Promise.resolve(false);
    const entry = entries.get(key);
    if (!entry || start + data.length > entry.meta.total) return Promise.resolve(false);
    if (entry.blocks.some((b) => start < b.start + b.length && b.start < start + data.length)) {
      return Promise.resolve(false);
    }
    const role = entry.role;
    if (!retainPlayback && role === 'current') return Promise.resolve(false);
    const limit = role === 'current' ? currentBytes : nextBytes;
    // Keep one metadata row available to open the next actual route without
    // evicting the last played object's bytes during speculative open().
    // A role transfer can leave retired files charged to the destination while
    // old read leases still own them. That does not free their original bytes
    // for another role. Check the global disk admission before making a copy.
    if (used(role) + data.length > limit ||
        used('current') + used('next') + data.length > currentBytes + nextBytes ||
        entries.size + blockCount() >= maxEntries - 1) {
      if (!reclaimScheduled) {
        reclaimScheduled = true;
        enqueue(async () => {
          try {
            if (!closed && !faulted) await evictOne(role, key === actualKey ? null : actualKey);
          } finally { reclaimScheduled = false; }
        }).catch(() => {});
      }
      return Promise.resolve(false);
    }
    // Reserve before enqueueing disk IO so slow writes cannot accumulate an
    // unbounded in-memory queue or overcommit either role's byte budget.
    const copy = Buffer.from(data);
    pendingBytes += copy.length;
    pendingCount++;
    reservedBlocks++;
    if (role === 'current') reservedCurrent += copy.length;
    else reservedNext += copy.length;
    updatePeak();
    return enqueue(async () => {
      let reservationHeld = true;
      try {
        const active = entries.get(key);
        if (!active || active !== entry || active.role !== role || faulted || closed ||
            active.blocks.some((b) => start < b.start + b.length && b.start < start + copy.length)) {
          return false;
        }
        const hash = sha256(copy);
        const file = blockName(key, start, copy.length, hash);
        if (retired.has(file)) return false;
        const block = {start, length: copy.length, hash, file, touched: Date.now(), readers: 0, verified: true};
        if (estimatedIndexBytes + Buffer.byteLength(JSON.stringify(packBlock(block))) + 4 > MAX_INDEX_BYTES) {
          return false;
        }
        const temp = path.join(blocksPath, `.block-${crypto.randomUUID()}.tmp`);
        const target = path.join(blocksPath, file);
        let renamed = false;
        try {
          await assertOwnedPaths();
          await io.writeFile(temp, copy, {flag: 'wx', mode: 0o600});
          await assertOwnedPaths();
          await io.rename(temp, target);
          renamed = true;
          await persist({entry: active, block});
          // The durable row replaces, rather than adds to, its pending reservation.
          reservedBlocks--;
          if (role === 'current') reservedCurrent -= copy.length;
          else reservedNext -= copy.length;
          reservationHeld = false;
          active.blocks.push(block);
          active.blocks.sort((a, b) => a.start - b.start);
          active.touched = Date.now();
          return true;
        } catch {
          if (renamed && !await unlinkQuietly(target)) {
            orphans.set(target, {length: copy.length, role});
          }
          if (!await unlinkQuietly(temp)) {
            orphans.set(temp, {length: copy.length, role});
          }
          faulted = true;
          return false;
        }
      } finally {
        pendingBytes -= copy.length;
        pendingCount--;
        if (reservationHeld) {
          reservedBlocks--;
          if (role === 'current') reservedCurrent -= copy.length;
          else reservedNext -= copy.length;
        }
      }
    }).catch(() => false);
  }

  async function invalidate(key) {
    if (closing || closed) return false;
    return enqueue(async () => {
      const entry = entries.get(key);
      if (!entry) return false;
      await retireEntry(entry);
      await persist();
      await drainRetired();
      return true;
    });
  }

  function discardNext() {
    if (closing || closed) return Promise.resolve(false);
    return enqueue(async () => {
      for (const entry of [...entries.values()]) {
        if (entry.key !== actualKey && entry.role === 'next') await retireEntry(entry);
      }
      await persist(); await drainRetired(); return true;
    });
  }

  function forgetActualUnlessMedia(identity, {isCurrent = () => true} = {}) {
    if (closing || closed) return Promise.resolve(false);
    if (typeof isCurrent !== 'function') return Promise.reject(new TypeError('invalid media owner guard'));
    const owner = mediaKey(identity);
    return enqueue(async () => {
      if (!isLive(isCurrent)) return false;
      const actual = entries.get(actualKey);
      if (!actual || owner && actual.mediaKey === owner) return false;
      await retireEntry(actual); await persist(); await drainRetired(); return true;
    });
  }

  function status() {
    const current = used('current');
    const next = used('next');
    return {
      committed: activeBytes('current') + activeBytes('next'),
      reserved: reservedCurrent + reservedNext,
      pending: pendingBytes,
      pendingCount,
      peak: peakBytes,
      readers,
      current,
      next,
      currentKey: actualKey,
      entries: entries.size,
      blocks: blockCount(),
      faulted,
      closed,
      indexMetrics: {...indexMetrics},
      recoveryMode,
      unverifiedBytes: [...entries.values()].reduce((sum, entry) => sum + entry.blocks.reduce((n, block) => n + (block.verified ? 0 : block.length), 0), 0),
    };
  }

  function coverage(key) {
    const entry = entries.get(key);
    if (!entry || closed || faulted) return {bytes: 0, total: entry?.meta.total || 0, verifiedBytes: 0};
    return {bytes: entry.blocks.reduce((n, block) => n + block.length, 0), total: entry.meta.total,
      verifiedBytes: entry.blocks.reduce((n, block) => n + (block.verified ? block.length : 0), 0)};
  }

  function close() {
    if (closePromise) return closePromise;
    if (closed) return Promise.resolve();
    closing = true;
    closePromise = enqueue(async () => {
      for (const entry of [...entries.values()]) {
        if (!retainPlayback || entry.key !== actualKey) await retireEntry(entry);
      }
      await persist();
      await drainRetired();
      await Promise.all([...readJobs]);
      for (const block of corruptBlocks) await removeCorruptBlock(block);
      corruptBlocks.clear();
      await persist();
      await drainRetired();
      for (const file of [...orphans.keys()]) await unlinkQuietly(file);
      for (const file of [...indexOrphans]) {
        if (await unlinkQuietly(file)) indexOrphans.delete(file);
      }
      if (orphans.size || retired.size || indexOrphans.size) {
        throw new Error('cache cleanup incomplete');
      }
      await guard.close();
      closed = true;
    });
    return closePromise;
  }

  return {open, actual, span, nextOffset, read, put, invalidate, discardNext, forgetActualUnlessMedia, coverage, status, close};
  } catch (error) {
    await guard.close().catch(() => {});
    throw error;
  }
}

module.exports = {createStore};
