'use strict';
// Experiment-private single-window lifecycle. No production/auth/session import.
// Only the already verified synthetic raw-AVI/PCM family is admitted.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const OWNER = 'ETE owned synthetic retained window v1\n', KIND = 'owned-raw-avi-pcm48k-v1', MAX = 34 * 1048576;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function physical(file, directory = false) {
    const absolute = path.resolve(file), real = fs.realpathSync(absolute), stat = fs.lstatSync(absolute);
    if (real !== absolute || stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw Error('retention-owned-path');
    return absolute;
}
function identity(value) {
    if (!value || Object.keys(value).sort().join(',') !== 'coreSha256,kind,sourceBytes,sourceSha256' || value.kind !== KIND ||
        !/^[a-f0-9]{64}$/.test(value.sourceSha256 || '') || !/^[a-f0-9]{64}$/.test(value.coreSha256 || '') ||
        !Number.isSafeInteger(value.sourceBytes) || value.sourceBytes <= 0 || value.sourceBytes > MAX) throw Error('retention-identity');
    return {kind: KIND, sourceSha256: value.sourceSha256, sourceBytes: value.sourceBytes, coreSha256: value.coreSha256};
}
function windowOf(value) {
    if (!value || Object.keys(value).sort().join(',') !== 'localStart,sourceEnd,sourceStart' || !Object.values(value).every(Number.isFinite) ||
        value.sourceStart < 0 || value.sourceEnd <= value.sourceStart || value.sourceEnd > 8 || value.sourceEnd - value.sourceStart > 2 || value.localStart < 0) throw Error('retention-window');
    return {...value};
}
function fingerprint(file) {
    physical(file); const stat = fs.statSync(file);
    if (stat.size <= 0 || stat.size > MAX) throw Error('retention-file-limit');
    return {bytes: stat.size, sha256: sha(fs.readFileSync(file))};
}
const keyOf = stat => ({dev: stat.dev, ino: stat.ino});
const sameKey = (a, b) => a.dev === b.dev && a.ino === b.ino;
const fileKey = file => keyOf(fs.statSync(physical(file), {bigint: true}));
function writeAtomic(root, value, claim) {
    const temporary = path.join(root, 'next.json'), fd = fs.openSync(temporary, 'wx', 0o600);
    claim(keyOf(fs.fstatSync(fd, {bigint: true})));
    try {fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
    fs.renameSync(temporary, path.join(root, 'last.json'));
}
class Store {
    static open(options) {return options?.enabled === true ? new Store(options) : null;}
    constructor({root, create = false}) {
        if (!path.isAbsolute(root)) throw Error('retention-owned-path');
        if (create) {physical(path.dirname(root), true); fs.mkdirSync(root, {mode: 0o700}); fs.writeFileSync(path.join(root, 'owner'), OWNER, {flag: 'wx', mode: 0o600});}
        this.root = physical(root, true); this.rootKey = keyOf(fs.statSync(this.root, {bigint: true})); this.namespace = sha(this.root + ':' + this.rootKey.dev + ':' + this.rootKey.ino); this.leases = new Map(); this.retired = new Map(); this.serial = 0; this.active = null; this.cache = null; this.cacheKey = null; this.manifestKey = null; this.invalidating = false; this.busy = false; this.closed = false;
        if (fs.readFileSync(physical(path.join(root, 'owner')), 'utf8') !== OWNER) throw Error('retention-owner');
        // Crash-stale locks fail closed: never inspect/kill an unowned PID or
        // erase a live owner's lock. Product startup ownership is not wired.
        this.lock = fs.openSync(path.join(root, '.writer'), 'wx', 0o600);
        this.lockKey = keyOf(fs.fstatSync(this.lock, {bigint: true}));
        try {
            for (const name of fs.readdirSync(root)) if (!['owner', '.writer', 'last.json', 'next.json'].includes(name) && !/^window-[a-f0-9]{64}\.avi$/.test(name)) throw Error('retention-unknown-member');
            const pointer = path.join(root, 'last.json');
            if (fs.existsSync(pointer)) {
                physical(pointer); if (fs.statSync(pointer).size > 16384) throw Error('retention-manifest');
                const row = JSON.parse(fs.readFileSync(pointer, 'utf8'));
                if (Object.keys(row).sort().join(',') !== 'bytes,file,identity,namespace,schema,sha256,window' || row.schema !== 1 || row.namespace !== this.namespace || !/^window-[a-f0-9]{64}\.avi$/.test(row.file || '') || row.file !== 'window-' + row.sha256 + '.avi') throw Error('retention-manifest');
                row.identity = identity(row.identity); row.window = windowOf(row.window);
                const actual = fingerprint(path.join(root, row.file));
                if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256) throw Error('retention-file-changed');
                this.cache = row; this.cacheKey = fileKey(path.join(root, row.file)); this.manifestKey = fileKey(pointer);
            }
            for (const name of fs.readdirSync(root)) if (name === 'next.json' || /^window-[a-f0-9]{64}\.avi$/.test(name) && name !== this.cache?.file) fs.unlinkSync(physical(path.join(root, name)));
        } catch (error) {
            try {this.releaseLock();} catch (_) {}
            finally {if (!this.closed) {fs.closeSync(this.lock); this.closed = true;}}
            throw error;
        }
    }
    check() {
        if (this.closed) throw Error('retention-closed'); physical(this.root, true);
        if (!sameKey(keyOf(fs.statSync(this.root, {bigint: true})), this.rootKey) || fs.readFileSync(physical(path.join(this.root, 'owner')), 'utf8') !== OWNER) throw Error('retention-owner');
        if (!sameKey(fileKey(path.join(this.root, '.writer')), this.lockKey) || !sameKey(keyOf(fs.fstatSync(this.lock, {bigint: true})), this.lockKey)) throw Error('retention-lock-changed');
    }
    releaseLock() {
        this.check(); fs.closeSync(this.lock); this.closed = true;
        physical(this.root, true);
        if (!sameKey(keyOf(fs.statSync(this.root, {bigint: true})), this.rootKey) || fs.readFileSync(physical(path.join(this.root, 'owner')), 'utf8') !== OWNER || !sameKey(fileKey(path.join(this.root, '.writer')), this.lockKey)) throw Error('retention-owner');
        fs.unlinkSync(physical(path.join(this.root, '.writer')));
    }
    remove(name, expected) {
        this.check(); const candidate = path.join(this.root, name); if (!fs.existsSync(candidate)) return; const full = physical(candidate);
        if (!sameKey(fileKey(full), expected)) throw Error('retention-file-changed');
        fs.unlinkSync(full);
    }
    collect() {
        for (const [file, expected] of this.retired) if (!this.leases.get(file)) {
            try {this.remove(file, expected); this.retired.delete(file);} catch (_) { /* retry on release/close; retain identity */ }
        }
    }
    beginActual(value, generation) {
        this.check(); const media = identity(value);
        if (!Number.isSafeInteger(generation) || generation <= 0) throw Error('retention-generation');
        const key = JSON.stringify(media), token = Object.freeze({serial: ++this.serial, generation, key}); this.active = token;
        if (this.invalidating || this.cache && JSON.stringify(this.cache.identity) !== key) {
            this.invalidating = true; this.invalidate();
        }
        return token;
    }
    invalidate() {
        if (!this.invalidating) return;
        const old = this.cache.file, oldKey = this.cacheKey;
        this.remove('last.json', this.manifestKey); // failure retains retryable state
        this.cache = null; this.cacheKey = null; this.manifestKey = null; this.invalidating = false;
        this.retired.set(old, oldKey); this.collect();
    }
    matches(token) {return !this.closed && token === this.active;}
    acquire(value, position) {
        this.check(); const media = identity(value), row = this.cache;
        if (this.invalidating || !row || JSON.stringify(media) !== JSON.stringify(row.identity) || !Number.isFinite(position) || position < row.window.sourceStart || position >= row.window.sourceEnd) return null;
        const full = path.join(this.root, row.file); let actual;
        try {actual = fingerprint(full);} catch (_) {return null;}
        if (actual.bytes !== row.bytes || actual.sha256 !== row.sha256) return null;
        this.leases.set(row.file, (this.leases.get(row.file) || 0) + 1); let released = false;
        return {path: full, window: {...row.window}, release: () => {
            if (released) return;
            const count = this.leases.get(row.file) - 1;
            if (count) this.leases.set(row.file, count); else {
                const pending = this.retired.get(row.file);
                if (pending) {this.remove(row.file, pending); this.retired.delete(row.file);}
                this.leases.delete(row.file);
            }
            released = true;
        }};
    }
    async commit(token, clip, value) {
        this.check(); const window = windowOf(value);
        if (!this.matches(token)) return {stored: false, reason: 'obsolete'};
        if (this.invalidating) return {stored: false, reason: 'invalidation-pending'};
        if (this.busy || this.leases.size) return {stored: false, reason: 'leased-or-busy'};
        this.collect(); if (this.retired.size) return {stored: false, reason: 'cleanup-pending'};
        clip = physical(clip); if (path.dirname(clip) !== path.dirname(this.root)) throw Error('retention-owned-path');
        if (fs.statSync(clip).nlink !== 1) throw Error('retention-input-alias');
        const proof = fingerprint(clip), file = 'window-' + proof.sha256 + '.avi', destination = path.join(this.root, file);
        let created = false, published = false, candidateKey = null, tempKey = null; this.busy = true;
        try {
            if (!fs.existsSync(destination)) {await fs.promises.rename(clip, destination); created = true; candidateKey = fileKey(destination);} // adopt, no byte copy or writable sibling
            this.check(); const after = fingerprint(destination);
            if (after.bytes !== proof.bytes || after.sha256 !== proof.sha256) throw Error('retention-file-changed');
            if (!this.matches(token)) return {stored: false, reason: 'obsolete'};
            if (this.leases.size) return {stored: false, reason: 'leased-or-busy'};
            const row = {schema: 1, namespace: this.namespace, identity: identity(JSON.parse(token.key)), window, file, ...proof};
            const newKey = fileKey(destination), old = this.cache, oldKey = this.cacheKey;
            writeAtomic(this.root, row, key => {tempKey = key;}); published = true;
            this.manifestKey = tempKey; tempKey = null; this.cache = row; this.cacheKey = newKey;
            if (old && old.file !== file) this.retired.set(old.file, oldKey);
            this.collect();
            return {stored: true, bytes: proof.bytes, sha256: proof.sha256, cleanupPending: this.retired.size > 0};
        } finally {
            try {
                if (created && !published && candidateKey) this.retired.set(file, candidateKey);
                if (tempKey) this.retired.set('next.json', tempKey);
                if (!published || tempKey) this.collect();
            } finally {this.busy = false;}
        }
    }
    close() {
        if (this.closed) throw Error('retention-closed');
        if (this.busy || this.leases.size) throw Error('retention-live-reader-or-work');
        try {this.check();} catch (error) {fs.closeSync(this.lock); this.closed = true; throw error;}
        this.invalidate(); this.collect(); if (this.retired.size) throw Error('retention-cleanup-pending');
        this.releaseLock();
    }
}
module.exports = {Store, KIND, MAX, fingerprint};
