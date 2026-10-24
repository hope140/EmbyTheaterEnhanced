'use strict';
// Raw representation bytes. This index is never a playback/authorization authority.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const mediaKey = identity => sha(JSON.stringify(['serverOrigin', 'serverId', 'accountId', 'itemId', 'mediaSourceId'].map(k => identity[k])));
const strongTag = value => typeof value === 'string' && /^"[\x21\x23-\x7e]{1,255}"$/.test(value);
const integer = value => Number.isSafeInteger(value) && value > 0;
function identityKey(identity, proof) {
    const fields = ['serverId', 'serverOrigin', 'accountId', 'itemId', 'mediaSourceId', 'representation'];
    if (!identity || fields.some(k => typeof identity[k] !== 'string' || !identity[k] || identity[k].length > 2048) ||
        !proof || !strongTag(proof.etag) || !integer(proof.total)) throw Error('range-identity-invalid');
    return sha(JSON.stringify(fields.map(k => identity[k]).concat(proof.etag, proof.total)));
}

async function acquireGuard(root) {
    // OS lifetime, not PID guesses or stale-file timing. A collision disables caching.
    const canonical = process.platform === 'win32' ? root.toLowerCase() : root;
    const port = 40000 + crypto.createHash('sha256').update('ETE-range-v2:' + canonical).digest().readUInt32BE(0) % 20000;
    const guard = net.createServer(socket => socket.destroy()); guard.maxConnections = 1;
    await new Promise((resolve, reject) => {guard.once('error', reject); guard.listen({host: '127.0.0.1', port, exclusive: true, reusePort: false}, resolve);});
    guard.unref();
    return {close: () => new Promise((resolve, reject) => guard.close(error => error ? reject(error) : resolve()))};
}

async function createStore({root, maxBytes, minFreeBytes, blockBytes = 262144}) {
    if (!path.isAbsolute(root) || !integer(maxBytes) || !Number.isSafeInteger(minFreeBytes) || minFreeBytes < 0 ||
        !integer(blockBytes) || blockBytes > 1048576 || maxBytes < blockBytes || Math.ceil(maxBytes / blockBytes) > 65536) throw Error('range-limits-required');
    await fs.mkdir(root, {recursive: true, mode: 0o700});
    if (await fs.realpath(root) !== path.resolve(root)) throw Error('range-root-redirected');
    const guard = await acquireGuard(root);
    const marker = path.join(root, 'owner'), lockPath = path.join(root, 'lock');
    let lock;
    try {
        const names = await fs.readdir(root);
        if (!names.length) await fs.writeFile(marker, 'ETE byte ranges v2\n', {flag: 'wx', mode: 0o600});
        if (!(await fs.lstat(marker)).isFile() || (await fs.lstat(marker)).isSymbolicLink() || await fs.readFile(marker, 'utf8') !== 'ETE byte ranges v2\n') throw Error('range-root-unowned');
        // All v2 writers hold the same OS guard. A leftover marker cannot be a live v2 writer.
        await fs.rm(lockPath, {force: true}); lock = await fs.open(lockPath, 'wx', 0o600);
    } catch (error) {await guard.close(); throw error;}
    let index = {schema: 1, lastKey: null, entries: {}}, closed = false, closing, tail = Promise.resolve(), bytes = 0;
    const refs = new Map(), pendingRows = new Set();
    let pendingBytes = 0;
    async function atomic(name, buffer) {
        const temporary = path.join(root, crypto.randomUUID() + '.pending');
        let handle;
        try {
            handle = await fs.open(temporary, 'wx', 0o600); await handle.writeFile(buffer); await handle.sync(); await handle.close(); handle = null;
            await fs.rename(temporary, path.join(root, name));
        } finally { if (handle) await handle.close(); await fs.rm(temporary, {force: true}); }
    }
    const save = () => atomic('index.json', Buffer.from(JSON.stringify(index)));
    function serial(action, internal = false) {
        if (closing && !internal) return Promise.reject(Error('range-store-closing'));
        const job = tail.then(() => {if (closed) throw Error('range-store-closed'); return action();});
        tail = job.catch(() => {}); return job;
    }
    async function drop(key) {
        const entry = index.entries[key]; if (!entry || refs.get(key)) return;
        delete index.entries[key];
        // Commit removal before deleting bytes; a crash can leave only recoverable orphans.
        await save();
        for (const row of Object.values(entry.blocks)) {await fs.rm(path.join(root, row.file), {force: true}); bytes -= row.size;}
    }
    try {
        await lock.writeFile(String(process.pid)); await lock.sync();
        try {
            const stat = await fs.lstat(path.join(root, 'index.json'));
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16777216) throw Error('range-index-invalid');
            index = JSON.parse(await fs.readFile(path.join(root, 'index.json'), 'utf8'));
            if (index.schema !== 1 || !index.entries || Object.keys(index.entries).length > 8 ||
                index.lastKey !== null && !/^[a-f0-9]{64}$/.test(index.lastKey)) throw Error('range-index-invalid');
        } catch (error) {if (error.code !== 'ENOENT') throw error;}
        // Only the last actually playing video survives a normal application exit/reopen.
        for (const key of Object.keys(index.entries)) {
            const e = index.entries[key];
            if (key !== index.lastKey) {delete index.entries[key]; continue;}
            if (!/^[a-f0-9]{64}$/.test(key) || !e || !strongTag(e.etag) || !integer(e.total) || e.blockBytes !== blockBytes || !e.blocks || Object.keys(e.blocks).length > 65536) throw Error('range-index-invalid');
            for (const [n, row] of Object.entries(e.blocks)) {
                if (!/^(0|[1-9][0-9]*)$/.test(n) || !Number.isSafeInteger(+n) || +n * blockBytes >= e.total ||
                    !row || !/^[a-f0-9-]{36}\.bytes$/.test(row.file) || !/^[a-f0-9]{64}$/.test(row.sha256) ||
                    row.size !== Math.min(blockBytes, e.total - +n * blockBytes)) throw Error('range-index-invalid');
                const file = path.join(root, row.file), stat = await fs.lstat(file).catch(() => null);
                if (!stat || !stat.isFile() || stat.isSymbolicLink() || stat.size !== row.size) {delete e.blocks[n]; continue;}
                bytes += row.size;
            }
        }
        if (bytes > maxBytes) throw Error('range-quota-reduced');
        const keep = new Set(['owner', 'lock', 'index.json']);
        for (const e of Object.values(index.entries)) for (const row of Object.values(e.blocks)) keep.add(row.file);
        for (const name of await fs.readdir(root)) {
            if (keep.has(name)) continue;
            if (!/^[a-f0-9-]{36}\.(?:bytes|pending)$/.test(name)) throw Error('range-root-unexpected-file');
            const stat = await fs.lstat(path.join(root, name));
            if (!stat.isFile() || stat.isSymbolicLink()) throw Error('range-root-redirected');
            await fs.unlink(path.join(root, name));
        }
        await save();
    } catch (error) {try {await lock.close(); await fs.unlink(lockPath);} finally {await guard.close();} throw error;}
    async function acquire(identity, proof, role = 'candidate') {
        const key = identityKey(identity, proof);
        return serial(async () => {
            if (!index.entries[key]) {
                for (const k of Object.keys(index.entries)) if (k !== index.lastKey && !refs.get(k) && index.entries[k].role !== 'next') await drop(k);
                if (Object.keys(index.entries).length >= 8) throw Error('range-object-limit');
                index.entries[key] = {etag: proof.etag, total: proof.total, blockBytes, role, mediaKey: mediaKey(identity), blocks: {}};
                await save();
            }
            refs.set(key, (refs.get(key) || 0) + 1);
            let released = false;
            const assertLease = () => {if (released || !index.entries[key]) throw Error('range-lease-retired');};
            return {
                key, total: proof.total, etag: proof.etag, blockBytes,
                status() {assertLease(); return {bytes: Object.entries(index.entries[key].blocks).reduce((total, [n, row]) => total + (pendingRows.has(key + ':' + n) ? 0 : row.size), 0), total: proof.total};},
                readBlock(n) {return serial(async () => {
                    assertLease(); const row = index.entries[key].blocks[n]; if (!row) return null;
                    const file = path.join(root, row.file), stat = await fs.lstat(file).catch(() => null);
                    const data = stat && stat.isFile() && !stat.isSymbolicLink() && stat.size === row.size ? await fs.readFile(file) : null;
                    if (data && data.length === row.size && sha(data) === row.sha256) return data;
                    delete index.entries[key].blocks[n]; bytes -= row.size; await save(); await fs.rm(file, {force: true}); return null;
                });},
                writeBlock(n, data) {return serial(async () => {
                    assertLease(); const e = index.entries[key];
                    if (!Number.isSafeInteger(n) || n < 0 || n * blockBytes >= e.total || !Buffer.isBuffer(data) || data.length !== Math.min(blockBytes, e.total - n * blockBytes)) throw Error('range-block-invalid');
                    if (e.blocks[n]) return true;
                    const free = await fs.statfs(root);
                    if (bytes + data.length > maxBytes || Number(free.bavail) * Number(free.bsize) - data.length < minFreeBytes) return false;
                    const file = crypto.randomUUID() + '.bytes';
                    await atomic(file, data);
                    e.blocks[n] = {file, size: data.length, sha256: sha(data)}; bytes += data.length;
                    pendingRows.add(key + ':' + n); pendingBytes += data.length;
                    const settled = () => {if (pendingRows.delete(key + ':' + n)) pendingBytes -= data.length;};
                    try {await save();} catch (error) {delete e.blocks[n]; bytes -= data.length; settled(); await fs.rm(path.join(root, file), {force: true}); throw error;}
                    finally {settled();}
                    return true;
                });},
                markPlaying() {return serial(async () => {
                    assertLease(); index.lastKey = key; index.entries[key].role = 'last'; await save();
                    for (const k of Object.keys(index.entries)) if (k !== key && !refs.get(k) && index.entries[k].role !== 'next') await drop(k);
                });},
                release() {return serial(async () => {
                    if (released) return; released = true; refs.set(key, (refs.get(key) || 1) - 1);
                    if (!refs.get(key)) refs.delete(key);
                    if (key !== index.lastKey && index.entries[key].role !== 'next') await drop(key);
                });}
            };
        });
    }
    async function discardNext() {
        for (const [key, e] of Object.entries(index.entries)) if (key !== index.lastKey && e.role === 'next') {e.role = 'candidate'; if (!refs.get(key)) await drop(key);}
    }
    return {
        acquire,
        discardLastUnless: key => serial(async () => {
            const old = index.lastKey;
            if (old && index.entries[old].mediaKey !== key) {index.lastKey = null; await save(); if (!refs.get(old)) await drop(old);}
        }),
        discardNext: () => serial(discardNext),
        status: () => ({bytes: bytes - pendingBytes, leases: [...refs.values()].reduce((a, b) => a + b, 0), maxBytes}),
        close() {
            if (closing) return closing;
            closing = (async () => {
                await tail;
                if (closed) return;
                if (refs.size) throw Error('range-live-leases');
                // Retain only the actual last-played object; an unplayed prefix is disposable.
                await serial(discardNext, true); await tail; closed = true;
                try {await lock.close(); await fs.unlink(lockPath);} finally {await guard.close();}
            })();
            closing.catch(() => {if (!closed) closing = null;});
            return closing;
        }
    };
}
module.exports = {createStore, identityKey, mediaKey, strongTag};
