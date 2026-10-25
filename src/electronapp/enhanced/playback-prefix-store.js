'use strict';
// Process-local next-episode payloads only. Never restore or create a last-play index.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const {identityKey, acquireGuard} = require('./playback-range-identity');
const {selection} = require('./playback-range-policy');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
async function createStore(options) {
    const {root, blockBytes = 262144} = options, maxBytes = selection(options).prefetchBytes;
    if (!path.isAbsolute(root) || !Number.isSafeInteger(blockBytes) || blockBytes <= 0 || blockBytes > 1048576) throw Error('prefix-limits-invalid');
    await fs.mkdir(root, {recursive: true, mode: 0o700});
    if (await fs.realpath(root) !== path.resolve(root)) throw Error('prefix-root-redirected');
    const guard = await acquireGuard(root), entries = new Map(), pendingFiles = new Map();
    let bytes = 0, tail = Promise.resolve(), closed = false, closing, writeFailure = false;
    const reserved = () => [...pendingFiles.values()].reduce((n, size) => n + size, 0);
    const serial = action => {
        if (closing || closed) return Promise.reject(Error('prefix-store-closed'));
        const job = tail.then(action); tail = job.catch(() => {}); return job;
    };
    async function clear(entry) {
        for (const [n, row] of entry.blocks) {
            await fs.rm(path.join(root, row.file), {force: true});
            entry.blocks.delete(n); bytes -= row.size;
        }
        if (!entry.refs) entries.delete(entry.key);
    }
    try {
        const marker = path.join(root, 'owner'), names = await fs.readdir(root);
        if (!names.length) await fs.writeFile(marker, 'ETE disposable next prefix v1\n', {flag: 'wx', mode: 0o600});
        const stat = await fs.lstat(marker);
        if (!stat.isFile() || stat.isSymbolicLink() || await fs.readFile(marker, 'utf8') !== 'ETE disposable next prefix v1\n') throw Error('prefix-root-unowned');
        // Recovery discards all preceding-process media, including interrupted writes.
        const disposable = [];
        for (const name of await fs.readdir(root)) {
            if (name === 'owner') continue;
            const stat = await fs.lstat(path.join(root, name));
            if (!/^[a-f0-9-]{36}\.(bytes|pending)$/.test(name) || !stat.isFile() || stat.isSymbolicLink()) throw Error('prefix-root-unexpected');
            disposable.push(path.join(root, name));
        }
        for (const file of disposable) await fs.unlink(file);
    } catch (error) {await guard.close(); throw error;}
    return {
        acquire(identity, proof, role = 'candidate') {
            const key = identityKey(identity, proof);
            return serial(async () => {
                if (role === 'next') {
                    // A consumed prefix is disposable. Reuse its space, even while its
                    // route stays live; serialized reads finish before file deletion.
                    for (const entry of entries.values()) if (entry.key !== key) {
                        if (entry.role === 'next' && entry.refs) throw Error('prefix-next-still-retiring');
                        await clear(entry);
                    }
                }
                let entry = entries.get(key);
                if (!entry) {
                    if (entries.size >= 8) throw Error('prefix-entry-limit');
                    entry = {key, role, refs: 0, blocks: new Map()}; entries.set(key, entry);
                }
                entry.refs++;
                let released = false;
                const assert = () => {if (released || entries.get(key) !== entry) throw Error('prefix-lease-retired');};
                return {
                    key, total: proof.total, etag: proof.etag, lastModified: proof.lastModified, blockBytes,
                    status() {assert(); return {bytes: [...entry.blocks.values()].reduce((n, r) => n + r.size, 0), total: proof.total};},
                    readBlock(n) {return serial(async () => {
                        assert(); const row = entry.blocks.get(n); if (!row) return null;
                        const stat = await fs.lstat(path.join(root, row.file)).catch(() => null);
                        const data = stat && stat.isFile() && !stat.isSymbolicLink() && stat.size === row.size ? await fs.readFile(path.join(root, row.file)) : null;
                        if (data && data.length === row.size && digest(data) === row.sha256) return data;
                        await fs.rm(path.join(root, row.file), {force: true}); bytes -= row.size; entry.blocks.delete(n); return null;
                    });},
                    writeBlock(n, data) {return serial(async () => {
                        assert();
                        const size = Math.min(blockBytes, proof.total - n * blockBytes, maxBytes - n * blockBytes);
                        if (!Number.isSafeInteger(n) || n < 0 || size <= 0 || !Buffer.isBuffer(data) || data.length !== size) throw Error('prefix-block-invalid');
                        if (entry.blocks.has(n)) return true;
                        if (writeFailure || bytes + reserved() + size > maxBytes) return false;
                        const free = await fs.statfs(root);
                        if (Number(free.bavail) * Number(free.bsize) < size) return false;
                        const id = crypto.randomUUID(), pending = path.join(root, id + '.pending'), file = id + '.bytes'; let handle;
                        pendingFiles.set(pending, size);
                        try {
                            // All writes are serialized; committed + in-flight payload <= P.
                            handle = await fs.open(pending, 'wx', 0o600); await handle.writeFile(data); await handle.sync(); await handle.close(); handle = null;
                            await fs.rename(pending, path.join(root, file));
                            entry.blocks.set(n, {file, size, sha256: digest(data)}); bytes += size; pendingFiles.delete(pending); return true;
                        } finally {
                            try {if (handle) await handle.close(); await fs.rm(pending, {force: true}); pendingFiles.delete(pending);}
                            catch (error) {writeFailure = true; throw error;}
                        }
                    });},
                    markPlaying() {return serial(async () => {
                        assert(); entry.role = 'playing';
                        for (const other of entries.values()) if (other !== entry && other.role !== 'next') await clear(other);
                    });},
                    release() {return serial(async () => {
                        if (released) return; released = true; entry.refs--;
                        if (!entry.refs && entry.role !== 'next') await clear(entry);
                    });}
                };
            });
        },
        discardNext: () => serial(async () => {for (const entry of entries.values()) if (entry.role === 'next') {entry.role = 'retired'; if (!entry.refs) await clear(entry);}}),
        status: () => ({bytes: bytes + reserved(), maxBytes, leases: [...entries.values()].reduce((n, e) => n + e.refs, 0)}),
        close() {
            if (closing) return closing;
            closing = tail.then(async () => {
                if ([...entries.values()].some(e => e.refs)) throw Error('prefix-live-leases');
                for (const entry of entries.values()) await clear(entry);
                for (const file of pendingFiles.keys()) {await fs.rm(file, {force: true}); pendingFiles.delete(file);}
                await guard.close(); closed = true;
            });
            closing.catch(() => {if (!closed) closing = null;}); return closing;
        }
    };
}
module.exports = {createStore};
