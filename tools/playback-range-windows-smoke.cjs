'use strict';
// Preparation is Node-only. Native execution requires a separate, explicit Windows command.
const fileSystemBackend = process.versions.electron ? 'original-fs' : 'node:fs';
const fs = require(fileSystemBackend); // Fail closed if original-fs is unavailable in Electron.
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {execFileSync, spawn} = require('node:child_process');
const CANDIDATE = Object.freeze({commit: 'b8938f4ba9149e700ea1437b3f5fbe3535a2f5e5',
    zipSize: 165275527, zipSha256: '60eb9f6eb306df3e03db910f4f5af7bd05c1a9237c73b5688df12da3ed5dad94',
    installerSha256: '40a99cc4281c9a7d958d424902982f781c12072a183013b9002713fa24c7af62'});
const LIMITS = Object.freeze({maxBytes: 16 * 1048576, minFreeBytes: 64 * 1048576, bytesPerSecond: 1048576,
    timeoutMs: 5000, progressPercent: 70, preloadMB: 300}); // Fixture values, never product defaults.
const OWNER = 'ETE hidden range smoke v1\n';
function sha(data) {return crypto.createHash('sha256').update(data).digest('hex');}
function hashFile(file) {
    const hash = crypto.createHash('sha256'), fd = fs.openSync(file, 'r'), buffer = Buffer.alloc(1048576);
    try {let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n));}
    finally {fs.closeSync(fd);} return hash.digest('hex');
}
function regular(file) {if (!fs.lstatSync(file).isFile() || fs.realpathSync.native(file) !== path.resolve(file)) throw Error('nonphysical-file'); return file;}
function writeNew(file, value) {fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});}
function argumentsOf(argv, allowed) {
    const result = {};
    for (const arg of argv) {
        const n = arg.indexOf('='), key = n < 0 ? arg : arg.slice(0, n), value = n < 0 ? true : arg.slice(n + 1);
        if (!allowed.includes(key) || Object.hasOwn(result, key) || value === '') throw Error('invalid-or-duplicate-argument'); result[key] = value;
    }
    return result;
}
// Read only small provenance entries from the already hash-verified, ordinary ZIP.
// ZIP64, encryption and other compression formats fail closed; no entries are extracted.
function zipReceipts(file) {
    const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size;
    const read = (offset, length) => {const b = Buffer.alloc(length); if (fs.readSync(fd, b, 0, length, offset) !== length) throw Error('zip-short'); return b;};
    try {
        const tail = read(Math.max(0, size - 65557), Math.min(size, 65557)); let end = -1;
        for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) {end = i; break;}
        if (end < 0 || tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6)) throw Error('zip-layout');
        const count = tail.readUInt16LE(end + 10), centralSize = tail.readUInt32LE(end + 12), centralStart = tail.readUInt32LE(end + 16);
        if (count === 65535 || centralSize > 4 * 1048576 || centralStart + centralSize > size) throw Error('zip-layout');
        const central = read(centralStart, centralSize), results = []; let cursor = 0;
        for (let i = 0; i < count; i++) {
            if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== 0x02014b50) throw Error('zip-central');
            const flags = central.readUInt16LE(cursor + 8), method = central.readUInt16LE(cursor + 10), compressed = central.readUInt32LE(cursor + 20), uncompressed = central.readUInt32LE(cursor + 24);
            const nameSize = central.readUInt16LE(cursor + 28), extra = central.readUInt16LE(cursor + 30), comment = central.readUInt16LE(cursor + 32), offset = central.readUInt32LE(cursor + 42);
            const name = central.subarray(cursor + 46, cursor + 46 + nameSize).toString('utf8'); cursor += 46 + nameSize + extra + comment;
            if (cursor > central.length) throw Error('zip-central');
            if (!name.endsWith('.exe.provenance.json')) continue;
            if (flags & 1 || ![0, 8].includes(method) || compressed > 65536 || uncompressed > 65536 || offset + 30 > centralStart) throw Error('zip-receipt-layout');
            const local = read(offset, 30);
            if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(8) !== method) throw Error('zip-local');
            const start = offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
            if (start + compressed > centralStart) throw Error('zip-local');
            const packed = read(start, compressed), data = method === 0 ? packed : zlib.inflateRawSync(packed, {maxOutputLength: 65536});
            if (data.length !== uncompressed) throw Error('zip-receipt-size'); results.push(JSON.parse(data.toString('utf8')));
        }
        if (cursor !== central.length) throw Error('zip-central'); return results;
    } finally {fs.closeSync(fd);}
}
function source(repo, relative) {return execFileSync('git', ['show', CANDIDATE.commit + ':' + relative], {cwd: repo, maxBuffer: 4 * 1048576, windowsHide: true});}
function safeMember(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\\:\x00-\x1f\x7f?#]/.test(value) &&
        !value.split('/').some(part => !part || part === '.' || part === '..') ? value : '[invalid-member]';
}
function integrityError(code, member, expected, actual, operation = 'compare') {
    const validHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
    const validSize = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
    const diagnostic = {code, member: safeMember(member), fileSystemBackend, operation,
        expectedSha256: validHash(expected?.sha256), actualSha256: validHash(actual?.sha256),
        sizeDeclared: !!expected && Object.hasOwn(expected, 'size'), expectedBytes: validSize(expected?.size), actualBytes: validSize(actual?.size), actualReadBytes: validSize(actual?.readBytes ?? actual?.size)};
    const error = Error(code + ':' + diagnostic.member); error.integrity = diagnostic; return error;
}
// Never serialize an arbitrary filesystem Error, absolute root, URL or contents.
function integrityDiagnostic(error) {
    const data = error && error.integrity;
    if (!data || !/^candidate-[a-z-]+$/.test(data.code || '') || !['node:fs', 'original-fs'].includes(data.fileSystemBackend)) return null;
    return {...integrityError(data.code, data.member, {sha256: data.expectedSha256, ...(data.sizeDeclared ? {size: data.expectedBytes} : {})},
        {sha256: data.actualSha256, size: data.actualBytes, readBytes: data.actualReadBytes}, /^[a-z-]{1,48}$/.test(data.operation || '') ? data.operation : 'compare').integrity, fileSystemBackend: data.fileSystemBackend};
}
// Schema v3's producer emits path/hash rows. Optional size is an additional
// assertion, never a prerequisite for the archive-bound hash/set/source checks.
function verifyPayload(runtime, expectedManifestSha256, inventoryReader = require('./verify-installer-runtime.cjs').inventory) {
    const manifestFile = regular(path.join(runtime, 'build-manifest.json')), manifestSha256 = hashFile(manifestFile);
    if (manifestSha256 !== expectedManifestSha256) throw integrityError('candidate-runtime-manifest', 'build-manifest.json', {sha256: expectedManifestSha256}, {sha256: manifestSha256, size: fs.statSync(manifestFile).size});
    const manifest = JSON.parse(fs.readFileSync(manifestFile));
    if (manifest.schemaVersion !== 3 || manifest.sourceCommit !== CANDIDATE.commit || !Array.isArray(manifest.files)) throw Error('candidate-runtime-source');
    let inventory;
    try {inventory = inventoryReader(runtime);} catch (error) {throw integrityError('candidate-runtime-inventory', error.member, manifest.files.find(row => row?.path === error.member), error.fileSystemFacts, error.operation || 'inventory');}
    const expected = new Set(['build-manifest.json']); let digest = '';
    for (const row of manifest.files) {
        if (!row || typeof row.path !== 'string' || row.path.includes('\\') || row.path.split('/').some(p => !p || p === '.' || p === '..') || row.path.includes(':') ||
            expected.has(row.path.toLowerCase()) || !/^[a-f0-9]{64}$/.test(row.sha256 || '')) throw Error('candidate-runtime-path');
        expected.add(row.path.toLowerCase()); const actual = inventory.get(row.path);
        if (!actual || actual.sha256 !== row.sha256 || Object.hasOwn(row, 'size') &&
            (!Number.isSafeInteger(row.size) || row.size < 0 || actual.size !== row.size)) throw integrityError('candidate-runtime-file', row.path, row, actual);
        digest += row.path + '\0' + row.sha256 + '\n';
    }
    if (inventory.size !== expected.size || [...inventory.keys()].some(k => !expected.has(k.toLowerCase())) ||
        !manifest.payload || manifest.payload.fileCount !== manifest.files.length || manifest.payload.payloadSetSha256 !== sha(digest)) throw Error('candidate-runtime-set');
    return {inventory, manifestSha256};
}
function physicalPayloadProof(inventory) {
    const ordered = [...inventory].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return {files: inventory.size, sha256: sha(ordered.map(([name, row]) => name + '\0' + row.sha256 + '\0' + row.size + '\n').join('')),
        asarFiles: ordered.filter(([name]) => name.endsWith('.asar')).map(([member, row]) => ({member, sha256: row.sha256, bytes: row.size}))};
}
function verifyRuntime(repo, runtime, zip, inventoryReader) {
    regular(zip);
    if (fs.statSync(zip).size !== CANDIDATE.zipSize || hashFile(zip) !== CANDIDATE.zipSha256) throw Error('candidate-zip-identity');
    const receipts = zipReceipts(zip).filter(r => r.sourceCommit === CANDIDATE.commit && r.installer && r.installer.sha256 === CANDIDATE.installerSha256);
    if (receipts.length !== 1) throw Error('candidate-installer-receipt');
    const {inventory, manifestSha256} = verifyPayload(runtime, receipts[0].runtimeManifestSha256, inventoryReader);
    for (const relative of [...inventory.keys()].filter(k => /^electronapp\/(enhanced\/playback-range[^/]*\.js|native-helper\/(service|controller)\.js)$/.test(k))) {
        const expectedHash = sha(source(repo, 'src/' + relative));
        if (inventory.get(relative).sha256 !== expectedHash) throw integrityError('candidate-maintained-source', relative, {sha256: expectedHash}, inventory.get(relative));
    }
    const native = JSON.parse(source(repo, 'vendor/native-helper-manifest.json'));
    const electron = JSON.parse(source(repo, 'vendor/electron-runtime-manifest.json'));
    const nativeRecord = JSON.parse(fs.readFileSync(path.join(runtime, native.provenancePath)));
    if (nativeRecord.sourceCommit !== CANDIDATE.commit || nativeRecord.helper.testing !== false ||
        nativeRecord.source.sha256 !== sha(source(repo, native.sourcePath)) ||
        nativeRecord.helper.sha256 !== inventory.get(native.runtimePath)?.sha256 ||
        inventory.get(native.libmpv.runtimePath)?.sha256 !== native.libmpv.sha256 ||
        inventory.get(electron.runtime.runtimePath + '/' + electron.runtime.electronPath)?.sha256 !== electron.runtime.electronExeSha256) throw Error('candidate-fixed-native-identity');
    const physicalPayload = physicalPayloadProof(inventory);
    return {sourceCommit: CANDIDATE.commit, manifestSha256, zipSha256: CANDIDATE.zipSha256, physicalPayload,
        helperSha256: nativeRecord.helper.sha256, libmpvSha256: native.libmpv.sha256, electronSha256: electron.runtime.electronExeSha256};
}
function chunk(id, body) {const size = Buffer.alloc(4); size.writeUInt32LE(body.length); return Buffer.concat([Buffer.from(id), size, body, body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);}
// Small, deterministic raw AVI: no external encoder/download, audio or private media.
function avi(file, variant, frames = 192) {
    const width = 320, height = 180, fps = 24, stride = width * 3, frameSize = stride * height;
    if (!Number.isInteger(frames) || frames < 1 || frames > 192 || !['A', 'B'].includes(variant)) throw Error('fixture-arguments');
    const avih = Buffer.alloc(56); [Math.round(1e6 / fps), frameSize * fps, 0, 16, frames, 0, 1, frameSize, width, height].forEach((v, i) => avih.writeUInt32LE(v, i * 4));
    const strh = Buffer.alloc(56); strh.write('vidsDIB '); strh.writeUInt32LE(1, 20); strh.writeUInt32LE(fps, 24); strh.writeUInt32LE(frames, 32); strh.writeUInt32LE(frameSize, 36); strh.writeUInt32LE(0xffffffff, 40); strh.writeInt16LE(width, 52); strh.writeInt16LE(height, 54);
    const strf = Buffer.alloc(40); strf.writeUInt32LE(40); strf.writeInt32LE(width, 4); strf.writeInt32LE(height, 8); strf.writeUInt16LE(1, 12); strf.writeUInt16LE(24, 14); strf.writeUInt32LE(frameSize, 20);
    const hdrl = chunk('LIST', Buffer.concat([Buffer.from('hdrl'), chunk('avih', avih), chunk('LIST', Buffer.concat([Buffer.from('strl'), chunk('strh', strh), chunk('strf', strf)]))]));
    const moviSize = 4 + frames * (8 + frameSize), idx = Buffer.alloc(frames * 16), head = Buffer.alloc(12); head.write('RIFF'); head.writeUInt32LE(4 + hdrl.length + 8 + moviSize + 8 + idx.length, 4); head.write('AVI ', 8);
    const fd = fs.openSync(file, 'wx');
    try {
        fs.writeSync(fd, head); fs.writeSync(fd, hdrl); const movi = Buffer.alloc(12); movi.write('LIST'); movi.writeUInt32LE(moviSize, 4); movi.write('movi', 8); fs.writeSync(fd, movi);
        for (let i = 0; i < frames; i++) {
            const frame = Buffer.alloc(frameSize); for (let p = 0; p < frame.length; p += 3) {frame[p] = i % 2 ? 32 : 16; frame[p + (variant === 'A' ? 2 : 1)] = 180;}
            fs.writeSync(fd, chunk('00db', frame)); idx.write('00db', i * 16); idx.writeUInt32LE(16, i * 16 + 4); idx.writeUInt32LE(4 + i * (8 + frameSize), i * 16 + 8); idx.writeUInt32LE(frameSize, i * 16 + 12);
        }
        fs.writeSync(fd, chunk('idx1', idx));
    } finally {fs.closeSync(fd);}
    return {file: path.basename(file), size: fs.statSync(file).size, sha256: hashFile(file), etag: '"' + hashFile(file) + '"'};
}

module.exports = {CANDIDATE, fileSystemBackend, integrityDiagnostic, physicalPayloadProof, sha, hashFile, regular, zipReceipts, verifyPayload, verifyRuntime, avi};
