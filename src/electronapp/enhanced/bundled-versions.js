'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CHUNK_BYTES = 64 * 1024;
const FILES = [
    ['native-helper-provenance.json', 64 * 1024],
    ['build-manifest.json', 2 * 1024 * 1024],
    ['electronapp/native-helper/ete-mpv-helper.exe', 128 * 1024 * 1024],
    ['electronapp/libmpv/x64/mpv-1.dll', 128 * 1024 * 1024]
];

function sameFile(left, right) {
    return right.isFile() && !right.isSymbolicLink() &&
        ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs', 'birthtimeNs'].every(key => left[key] === right[key]);
}

async function snapshot(runtimeRoot) {
    const result = [];
    for (const [relative, limit] of FILES) {
        const file = path.join(runtimeRoot, relative);
        const stat = await fs.promises.lstat(file, {bigint: true});
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > BigInt(limit)) throw new Error('invalid bundled file');
        result.push({file, stat});
    }
    return result;
}

// Each read and SHA256 update is bounded. In particular, moving readFile to an
// async API alone would still hash the entire DLL synchronously on main.
async function readFile(record, collect) {
    const handle = await fs.promises.open(record.file, 'r');
    try {
        if (!sameFile(record.stat, await handle.stat({bigint: true}))) throw new Error('bundled file replaced');
        const buffer = Buffer.alloc(CHUNK_BYTES);
        const hash = crypto.createHash('sha256');
        const chunks = [];
        const size = Number(record.stat.size);
        let position = 0;
        while (position < size) {
            const {bytesRead} = await handle.read(buffer, 0, Math.min(CHUNK_BYTES, size - position), position);
            if (!bytesRead) throw new Error('bundled file truncated');
            const chunk = buffer.subarray(0, bytesRead);
            hash.update(chunk);
            if (collect) chunks.push(Buffer.from(chunk));
            position += bytesRead;
        }
        if (!sameFile(record.stat, await handle.stat({bigint: true}))) throw new Error('bundled file changed');
        return {sha256: hash.digest('hex'), bytes: collect ? Buffer.concat(chunks) : null};
    } finally {
        await handle.close();
    }
}

// Only the package's fixed provenance and binary paths are admitted. Renderer
// requests never supply paths, versions or hashes.
async function readBundledVersions(runtimeRoot, sourceCommit) {
    try {
        if (!/^[0-9a-f]{40}$/.test(sourceCommit || '')) return null;
        const files = await snapshot(runtimeRoot);
        const provenance = await readFile(files[0], true);
        const manifest = JSON.parse((await readFile(files[1], true)).bytes.toString('utf8'));
        if (manifest.schemaVersion !== 3 || manifest.sourceCommit !== sourceCommit || !Array.isArray(manifest.files)) return null;
        const bindings = manifest.files.filter(entry => entry.path === 'native-helper-provenance.json');
        if (bindings.length !== 1 || bindings[0].sha256 !== provenance.sha256) return null;
        const record = JSON.parse(provenance.bytes.toString('utf8'));
        if (record.schemaVersion !== 1 || record.protocolVersion !== 1 || record.sourceCommit !== sourceCommit) return null;
        const helper = record.helper;
        const mpv = record.libmpv;
        if (!helper || helper.testing !== false || !/^\d+\.\d+\.\d+$/.test(helper.version || '') ||
            !mpv || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(mpv.version || '')) return null;
        const entries = [[helper, 'electronapp/native-helper/ete-mpv-helper.exe'], [mpv, 'electronapp/libmpv/x64/mpv-1.dll']];
        for (let index = 0; index < entries.length; index++) {
            const [entry, relative] = entries[index];
            if (entry.runtimePath !== relative || !/^[0-9a-f]{64}$/.test(entry.sha256 || '')) return null;
            if ((await readFile(files[index + 2], false)).sha256 !== entry.sha256) return null;
        }
        const after = await snapshot(runtimeRoot);
        if (!files.every((file, index) => sameFile(file.stat, after[index].stat))) return null;
        return Object.freeze({helperVersion: helper.version, libmpvVersion: mpv.version});
    } catch (_) {
        return null;
    }
}

// A main-process reader binds one package identity. Only overlapping queries
// share work; completion (including UNKNOWN) clears it so the next query fully
// revalidates bytes and can recover from missing/replaced files.
function createBundledVersionReader(runtimeRoot, sourceCommit) {
    let pending = null;
    return function () {
        if (!pending) {
            pending = readBundledVersions(runtimeRoot, sourceCommit).finally(function () { pending = null; });
        }
        return pending;
    };
}

module.exports = {readBundledVersions, createBundledVersionReader};
