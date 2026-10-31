'use strict';

// Bounded, credential-free metadata codec. The store owns the physical paths,
// serialization queue, block hashes and write ordering; this module does no IO.
const crypto = require('node:crypto');
const MAX_ROWS = 16384, MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_JOURNAL_BYTES = 1024 * 1024, MAX_RECORDS = 512;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const keyOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const natural = value => Number.isSafeInteger(value) && value >= 0;
const bad = () => {throw new Error('invalid cache journal');};
const blockFile = (key, row) => `${key}-${row[0]}-${row[1]}-${row[2]}.bin`;

function packBlock(block) {return [block.start, block.length, block.hash, block.touched];}
function unpackBlock(key, row) {
  if (!keyOk(key) || !Array.isArray(row) || row.length !== 4 || !natural(row[0]) ||
      !Number.isSafeInteger(row[1]) || row[1] <= 0 || row[1] > 256 * 1024 ||
      !Number.isSafeInteger(row[0] + row[1]) || !keyOk(row[2]) || !natural(row[3])) bad();
  return {start: row[0], length: row[1], hash: row[2], touched: row[3], file: blockFile(key, row)};
}
function rowCount(state) {
  return state.entries.reduce((count, entry) => count + 1 + entry.blocks.length, 0);
}
function decodeCheckpoint(value) {
  if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.entries) ||
      value.entries.length > MAX_ROWS || value.version === 2 && !natural(value.sequence)) bad();
  let count = 0;
  for (const entry of value.entries) {
    if (!entry || !Array.isArray(entry.blocks) || (count += 1 + entry.blocks.length) > MAX_ROWS) bad();
  }
  return {version: 1, sequence: value.version === 2 ? value.sequence : 0, actual: value.actual,
    entries: value.entries.map(entry => ({...entry, blocks: value.version === 2
      ? entry.blocks.map(row => unpackBlock(entry.key, row)) : entry.blocks}))};
}
function encodeCheckpoint(state, sequence) {
  if (!natural(sequence) || rowCount(state) > MAX_ROWS) bad();
  const text = JSON.stringify({version: 2, sequence, actual: state.actual,
    entries: state.entries.map(entry => ({...entry, blocks: entry.blocks.map(packBlock)}))});
  if (Buffer.byteLength(text) > MAX_INDEX_BYTES) throw new Error('cache index limit');
  return text;
}
function encodeFrame(sequence, op, key, block) {
  if (!natural(sequence) || sequence === 0 || !['add', 'remove'].includes(op) || !keyOk(key)) bad();
  const row = packBlock(block); unpackBlock(key, row);
  const text = JSON.stringify({sequence, op, key, block: row});
  return Buffer.from(text + '\t' + hash(text) + '\n');
}
function replayJournal(state, bytes, {maxEntries = MAX_ROWS} = {}) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_JOURNAL_BYTES || !natural(state.sequence) ||
      !Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_ROWS || rowCount(state) > maxEntries) bad();
  const entries = new Map(state.entries.map(entry => [entry.key, entry]));
  if (entries.size !== state.entries.length) bad();
  let position = 0, previous, sequence = state.sequence, records = 0, replayed = 0, rows = rowCount(state);
  while (position < bytes.length) {
    const end = bytes.indexOf(10, position);
    if (end < 0) break; // Only an incomplete final frame is discardable.
    if (end - position > 2048 || ++records > MAX_RECORDS) bad();
    const line = bytes.subarray(position, end), tab = line.lastIndexOf(9);
    if (tab <= 0 || line.length - tab !== 65) bad();
    const text = line.subarray(0, tab), digest = line.subarray(tab + 1).toString('ascii');
    if (!/^[a-f0-9]{64}$/.test(digest) || hash(text) !== digest) bad();
    let frame; try {frame = JSON.parse(text.toString('utf8'));} catch {bad();}
    if (!frame || !natural(frame.sequence) || frame.sequence === 0 || !['add', 'remove'].includes(frame.op) ||
        !keyOk(frame.key) || previous !== undefined && frame.sequence !== previous + 1) bad();
    const block = unpackBlock(frame.key, frame.block);
    previous = frame.sequence;
    if (frame.sequence > state.sequence) {
      if (frame.sequence !== sequence + 1) bad();
      const entry = entries.get(frame.key); if (!entry) bad();
      if (frame.op === 'add') {
        if (!entry.meta || block.start + block.length > entry.meta.total || ++rows > maxEntries ||
            entry.blocks.some(old => block.start < old.start + old.length && old.start < block.start + block.length)) bad();
        entry.blocks.push(block);
      } else {
        const index = entry.blocks.findIndex(old => old.file === block.file);
        if (index < 0) bad();
        entry.blocks.splice(index, 1); rows--;
      }
      sequence = frame.sequence; replayed++;
    }
    position = end + 1;
  }
  state.sequence = sequence;
  return {state, sequence, goodBytes: position, discardedTailBytes: bytes.length - position,
    records, replayedRecords: replayed};
}

module.exports = {MAX_ROWS, MAX_INDEX_BYTES, MAX_JOURNAL_BYTES, MAX_RECORDS,
  packBlock, decodeCheckpoint, encodeCheckpoint, encodeFrame, replayJournal};
