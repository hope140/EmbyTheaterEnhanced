'use strict';

// Opt-in local byte store. No network client; callers own authentication and playback leases.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const HASH = /^[a-f0-9]{64}$/;
const OWNER = 'ETE offline playback-cache prototype v1\n';
const identityFields = ['serverId', 'accountId', 'itemId', 'mediaSourceId', 'versionId', 'representationId'];
const proofFields = ['authorized', 'mode', 'rangeSupported', 'contentLength', 'strongETag', 'validUntil'];
const recordFields = ['id', 'length', 'committed', 'digest', 'createdAt', 'lastUsedAt', 'expiresAt'];
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const exact = (value, fields) => value && typeof value === 'object' &&
    Object.keys(value).sort().join('|') === fields.slice().sort().join('|');
function fail(code) { const error = new Error(code); error.code = code; throw error; }

// The caller must obtain a fresh authorized response proving these facts. This
// function does not make HTTP claims, validate authorization, or accept a URL.
function identify(identity, proof, now) {
    if (!exact(identity, identityFields) || identityFields.some(field =>
        typeof identity[field] !== 'string' || !identity[field].length || identity[field].length > 512)) fail('identity-invalid');
    if (!exact(proof, proofFields) || proof.authorized !== true || proof.mode !== 'direct-file' ||
        proof.rangeSupported !== true || !integer(proof.contentLength) || proof.contentLength === 0 ||
        !integer(proof.validUntil) || proof.validUntil <= now ||
        typeof proof.strongETag !== 'string' || !/^"[\x21\x23-\x7e]{1,256}"$/.test(proof.strongETag)) fail('proof-invalid');
    return digest(JSON.stringify([1, ...identityFields.map(field => identity[field]), proof.contentLength, proof.strongETag]));
}

function createStore(options = {}) {
    if (options.enabled !== true) return Object.freeze({enabled: false});
    const policy = options.policy;
    if (!exact(policy, ['maxBytes', 'maxEntries', 'ttlMs', 'minFreeBytes']) ||
        Object.values(policy).some(value => !integer(value)) ||
        !policy.maxBytes || !policy.maxEntries || !policy.ttlMs || policy.maxEntries > 10000) fail('policy-required');
    // Freeze a copy: changing external configuration must not invalidate a lease.
    const limits = {...policy};
    const io = options.fs || fs;
    const clock = options.now || Date.now;
    const now = () => { const value = clock(); if (!integer(value)) fail('clock-invalid'); return value; };
    if (typeof options.parent !== 'string' || !path.isAbsolute(options.parent) ||
        io.realpathSync(options.parent) !== path.resolve(options.parent)) fail('parent-invalid');
    const root = path.join(options.parent, 'playback-cache-prototype-v1');
    const file = name => path.join(root, name);
    const records = new Map();
    const pins = new Map();
    const writers = new Set();
    let closed = false;
    let poisoned = false;
    let locked = false;

    function regular(name) {
        const stat = io.lstatSync(file(name));
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail('file-unsafe');
        return stat;
    }
    function guard() {
        if (closed) fail('store-closed');
        if (poisoned) fail('store-reopen-required');
        const stat = io.lstatSync(root);
        if (!stat.isDirectory() || stat.isSymbolicLink() || io.realpathSync(root) !== root) fail('root-unsafe');
    }
    function writeNew(name, data, onCreated) {
        const fd = io.openSync(file(name), 'wx', 0o600);
        try { if (onCreated) onCreated(); io.writeFileSync(fd, data); io.fsyncSync(fd); } finally { io.closeSync(fd); }
    }
    function checkpoint(record) {
        const temp = record.id + '.json.tmp';
        // Existing temporary files are recovered only during exclusive startup.
        writeNew(temp, JSON.stringify(record));
        io.renameSync(file(temp), file(record.id + '.json'));
        records.set(record.id, record);
    }
    function hashPrefix(name, size) {
        regular(name);
        const fd = io.openSync(file(name), 'r');
        const hash = crypto.createHash('sha256');
        const buffer = Buffer.alloc(65536);
        try {
            let offset = 0;
            while (offset < size) {
                const count = io.readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
                if (!count) fail('bytes-truncated');
                hash.update(buffer.subarray(0, count)); offset += count;
            }
        } finally { io.closeSync(fd); }
        return hash.digest('hex');
    }
    function remove(id) {
        // Metadata is retired first. A crash leaves an owned orphan, never a hit.
        for (const suffix of ['.json', '.bytes']) {
            const name = id + suffix;
            if (io.existsSync(file(name))) { regular(name); io.unlinkSync(file(name)); }
        }
        records.delete(id);
    }
    function prune() {
        guard();
        const time = now();
        for (const record of records.values()) if (record.expiresAt <= time && !pins.has(record.id)) remove(record.id);
    }
    const reserved = () => [...records.values()].reduce((sum, record) => sum + record.length, 0);
    function reserve(length) {
        if (length > limits.maxBytes) fail('quota-exceeded');
        prune();
        const candidates = [...records.values()].filter(record => !pins.has(record.id))
            .sort((a, b) => a.lastUsedAt - b.lastUsedAt || a.id.localeCompare(b.id));
        while (reserved() + length > limits.maxBytes || records.size >= limits.maxEntries) {
            const candidate = candidates.shift();
            if (!candidate) fail('quota-pinned');
            remove(candidate.id);
        }
    }
    function space(bytes) {
        const stat = io.statfsSync(root);
        const available = stat.bavail * stat.bsize;
        if (!Number.isFinite(available) || available < limits.minFreeBytes + bytes) fail('space-low');
    }
    function pin(id) { pins.set(id, (pins.get(id) || 0) + 1); }
    function unpin(id) { const count = pins.get(id); if (count === 1) pins.delete(id); else pins.set(id, count - 1); }

    try {
        if (!io.existsSync(root)) { io.mkdirSync(root, {mode: 0o700}); writeNew('owner', OWNER); }
        guard();
        if (regular('owner').size !== Buffer.byteLength(OWNER) || io.readFileSync(file('owner'), 'utf8') !== OWNER) fail('owner-invalid');
        // Never guess that a lock is stale or terminate another process. A crash
        // lock needs explicit operator verification/removal before recovery.
        writeNew('lock', String(process.pid), () => { locked = true; });
        const names = io.readdirSync(root);
        for (const name of names) {
            if (!['owner', 'lock'].includes(name) && !/^[a-f0-9]{64}\.(bytes|json|json\.tmp)$/.test(name)) fail('root-unknown-file');
            regular(name);
        }
        for (const name of names.filter(name => /^[a-f0-9]{64}\.json$/.test(name))) {
            if (regular(name).size > 2048) fail('metadata-invalid');
            let record;
            try { record = JSON.parse(io.readFileSync(file(name), 'utf8')); } catch { fail('metadata-invalid'); }
            if (!exact(record, recordFields) || record.id !== name.slice(0, 64) || !HASH.test(record.digest) ||
                ['length', 'committed', 'createdAt', 'lastUsedAt', 'expiresAt'].some(field => !integer(record[field])) ||
                !record.length || record.committed > record.length || record.createdAt > record.lastUsedAt ||
                record.createdAt >= record.expiresAt) fail('metadata-invalid');
            const bytes = record.id + '.bytes';
            if (!io.existsSync(file(bytes)) || regular(bytes).size < record.committed ||
                hashPrefix(bytes, record.committed) !== record.digest) { remove(record.id); continue; }
            // Extra bytes were never checkpointed; they cannot be returned as data.
            io.truncateSync(file(bytes), record.committed);
            records.set(record.id, record);
        }
        for (const name of names) {
            if (name.endsWith('.json.tmp') || (name.endsWith('.bytes') && !records.has(name.slice(0, 64)))) {
                if (io.existsSync(file(name))) io.unlinkSync(file(name));
            }
        }
        prune();
        const candidates = [...records.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
        while (reserved() > limits.maxBytes || records.size > limits.maxEntries) remove(candidates.shift().id);
    } catch (error) {
        if (locked) { try { io.unlinkSync(file('lock')); } catch { fail('store-lock-cleanup-failed'); } }
        // Raw filesystem errors can contain private paths; expose fixed codes.
        fail(error.code === 'EEXIST' ? 'store-busy' : 'store-open-failed');
    }

    function execute(operation) {
        try { guard(); return operation(); }
        catch (error) {
            if (typeof error.code === 'string' && /^[a-z]+(?:-[a-z]+)+$/.test(error.code)) throw error;
            poisoned = true;
            fail('store-io-failed');
        }
    }
    function checked(identity, proof) {
        const time = now();
        const id = identify(identity, proof, time);
        const record = records.get(id);
        if (record && record.expiresAt <= time) {
            if (pins.has(id)) fail('entry-expired');
            remove(id); return {id, record: null, time};
        }
        return {id, record, time};
    }
    function begin(identity, proof) {
        return execute(() => {
            let {id, record, time} = checked(identity, proof);
            if (writers.has(id)) fail('writer-busy');
            if (!record) {
                if (!integer(time + limits.ttlMs)) fail('policy-invalid');
                reserve(proof.contentLength); space(0);
                record = {id, length: proof.contentLength, committed: 0, digest: digest(Buffer.alloc(0)),
                    createdAt: time, lastUsedAt: time, expiresAt: time + limits.ttlMs};
                writeNew(id + '.bytes', Buffer.alloc(0)); checkpoint(record);
            }
            const validUntil = proof.validUntil;
            pin(id); writers.add(id);
            let released = false;
            let ownedRecord = record;
            return Object.freeze({
                offset: record.committed,
                append(offset, buffer) {
                    return execute(() => {
                        const current = records.get(id);
                        if (released) fail('lease-released');
                        if (now() >= validUntil || now() >= current.expiresAt) fail('lease-expired');
                        if (offset !== current.committed || !Buffer.isBuffer(buffer) || !buffer.length ||
                            buffer.length > current.length - offset) fail('append-invalid');
                        space(buffer.length); regular(id + '.bytes');
                        const fd = io.openSync(file(id + '.bytes'), 'r+');
                        try {
                            let written = 0;
                            while (written < buffer.length) {
                                const count = io.writeSync(fd, buffer, written, buffer.length - written, offset + written);
                                if (!count) fail('write-stalled');
                                written += count;
                            }
                            io.fsyncSync(fd);
                        } finally { io.closeSync(fd); }
                        const committed = offset + buffer.length;
                        const updated = {...current, committed, digest: hashPrefix(id + '.bytes', committed), lastUsedAt: now()};
                        checkpoint(updated); ownedRecord = updated;
                        return committed;
                    });
                },
                release() { if (!released) { released = true; writers.delete(id); unpin(id); } },
                discardPartial() {
                    return execute(() => {
                        if (!released) fail('lease-active');
                        const current = records.get(id);
                        if (!current || current !== ownedRecord || current.committed === current.length || pins.has(id)) return false;
                        remove(id); return true;
                    });
                }
            });
        });
    }
    function inspect(identity, proof) {
        return execute(() => {
            const {record} = checked(identity, proof);
            return record ? Object.freeze({committed: record.committed, length: record.length,
                complete: record.committed === record.length}) : null;
        });
    }
    function acquireComplete(identity, proof, sourceLease = false) {
        return execute(() => {
            const {id, record, time} = checked(identity, proof);
            if (!record || record.committed !== record.length) return null;
            if (hashPrefix(id + '.bytes', record.length) !== record.digest) fail('bytes-corrupt');
            checkpoint({...record, lastUsedAt: time}); pin(id);
            const validUntil = proof.validUntil;
            let released = false;
            return Object.freeze({
                ...(sourceLease ? {source: file(id + '.bytes'), canStart: () => !released && !closed && !poisoned &&
                    now() < validUntil && now() < record.expiresAt} : {}),
                // A local test reader; never a path/mpv source or playback hook.
                read(offset, length) {
                    return execute(() => {
                        if (released) fail('lease-released');
                        if (now() >= validUntil || now() >= record.expiresAt) fail('lease-expired');
                        if (!integer(offset) || !integer(length) || length > 65536 ||
                            offset > record.length || length > record.length - offset) fail('read-invalid');
                        regular(id + '.bytes');
                        const fd = io.openSync(file(id + '.bytes'), 'r');
                        try {
                            const buffer = Buffer.alloc(length);
                            let read = 0;
                            while (read < length) {
                                const count = io.readSync(fd, buffer, read, length - read, offset + read);
                                if (!count) fail('bytes-truncated');
                                read += count;
                            }
                            return buffer;
                        } finally { io.closeSync(fd); }
                    });
                },
                release() { if (!released) { released = true; unpin(id); } }
            });
        });
    }
    return Object.freeze({enabled: true, begin, inspect, acquireComplete,
        acquireCompleteSource: (identity, proof) => acquireComplete(identity, proof, true),
        prune: () => execute(prune),
        status: () => execute(() => Object.freeze({entries: records.size, reservedBytes: reserved(),
            committedBytes: [...records.values()].reduce((sum, record) => sum + record.committed, 0), pinnedEntries: pins.size})),
        close() {
            if (closed) return;
            if (pins.size) fail('leases-active');
            try { io.unlinkSync(file('lock')); closed = true; } catch { fail('store-close-failed'); }
        }
    });
}

module.exports = {createStore};
