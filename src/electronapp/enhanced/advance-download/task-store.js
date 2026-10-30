'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {failure, sourceUrl} = require('./source-probe');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const keys = (value, allowed) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
const fileId = value => keys(value, ['dev', 'ino']) && /^\d+$/.test(value.dev) && /^\d+$/.test(value.ino);
const plainFile = value => text(value) && path.basename(value) === value && !/[\\/:]/.test(value) && value !== '.' && value !== '..';
const strong = value => value === null || typeof value === 'string' && value.length <= 1024 && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value);
const sourceKinds = ['direct-url', 'cd2-url', 'media-source-http', 'emby-original', 'emby-static'];
const stages = ['server-check', 'permission-check', 'item-check', 'version-check', 'resolve-source', 'probe-source', 'prepare', 'transfer', 'collection-list'];
function diagnostic(value) {return value === undefined || value === null || keys(value, ['stage', 'httpStatus', 'sourceKind']) &&
    (value.stage === undefined || stages.includes(value.stage)) && (value.httpStatus === undefined || Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599) &&
    (value.sourceKind === undefined || sourceKinds.includes(value.sourceKind));}
const states = ['queued', 'checking', 'downloading', 'paused', 'failed', 'complete'];
// Longer than every generated final name. FAT can change the ID when rename
// needs more directory-entry slots; reserve those slots from the first write.
const partialName = id => '.ete-media-' + id + '-' + '_'.repeat(80) + '.part';

function sourceRecord(source) {
    const result = {identity: source.identity, total: source.total, etag: source.etag,
        extension: source.extension, title: source.title || 'Video', prefixSha256: source.prefixSha256 || null,
        prefixBytes: source.prefixBytes || null, ...(sourceKinds.includes(source.kind) ? {kind: source.kind} : {})};
    if (!validSource(result)) throw failure('task-invalid');
    return result;
}
function validSource(value) {
    return (value?.kind === undefined || sourceKinds.includes(value.kind)) && keys(value, ['identity', 'total', 'etag', 'extension', 'title', 'prefixSha256', 'prefixBytes', 'kind']) && hash(value.identity) &&
        integer(value.total) && value.total > 0 && strong(value.etag) && /^(?:mkv|mp4|mov|webm|avi|mpg|ts|m2ts|flv|wmv)$/.test(value.extension) &&
        text(value.title) && (value.prefixSha256 === null ? value.prefixBytes === null : hash(value.prefixSha256) &&
            integer(value.prefixBytes) && value.prefixBytes > 0 && value.prefixBytes <= Math.min(65536, value.total));
}
function validTask(value) {
    if (!keys(value, ['schemaVersion', 'id', 'serverId', 'accountId', 'itemId', 'mediaSourceId', 'serverAddress', 'directory', 'state', 'reason', 'source', 'partial', 'file', 'diagnostic', 'requestTitle']) ||
        !diagnostic(value.diagnostic) || ![1, 2].includes(value.schemaVersion) || !uuid(value.id) || !['serverId', 'accountId', 'itemId'].every(key => text(value[key])) ||
        !text(value.directory) || !path.isAbsolute(value.directory) || !states.includes(value.state) ||
        value.reason !== null && (typeof value.reason !== 'string' || !/^[a-z-]{1,64}$/.test(value.reason))) return false;
    try {const url = sourceUrl(value.serverAddress); if (url.search || url.hash) return false;} catch (_) {return false;}
    // Schema 2 is only a persistent request, not a verified media receipt. It
    // cannot own a partial/completed file or enter the transfer without a fresh
    // permission/source probe and atomic promotion to schema 1.
    if (value.schemaVersion === 2) return value.source === null && value.partial === null && value.file === null &&
        text(value.requestTitle) && (value.mediaSourceId === null || text(value.mediaSourceId)) &&
        ['queued', 'checking', 'paused', 'failed'].includes(value.state);
    if (!validSource(value.source) || !text(value.mediaSourceId) || value.requestTitle !== undefined || value.state === 'checking') return false;
    if (value.partial !== null) {
        const p = value.partial;
        if (!keys(p, ['name', 'rootId', 'fileId', 'offset', 'sha256', 'messageComplete', 'publishing', 'publishMethod']) ||
            ![partialName(value.id), '.ete-media-' + value.id + '.part'].includes(p.name) || !fileId(p.rootId) || !fileId(p.fileId) || !integer(p.offset) ||
            p.offset > value.source.total || !hash(p.sha256) || typeof p.messageComplete !== 'boolean' ||
            p.publishing !== null && !plainFile(p.publishing) ||
            p.publishMethod !== undefined && (p.publishMethod !== 'move' || !p.publishing || !p.messageComplete || p.offset !== value.source.total)) return false;
    }
    if (value.file !== null) {
        const f = value.file;
        if (!keys(f, ['name', 'fileId', 'rootId', 'size', 'mtimeNs', 'sha256']) || !plainFile(f.name) || !fileId(f.fileId) || !fileId(f.rootId) ||
            f.size !== value.source.total || !/^\d+$/.test(f.mtimeNs) || !hash(f.sha256)) return false;
    }
    return value.state !== 'complete' || value.file !== null;
}
function identity(stat) {return {dev: String(stat.dev), ino: String(stat.ino)};}
function sameId(stat, id) {return !!id && String(stat.dev) === id.dev && String(stat.ino) === id.ino;}
function physical(directory) {
    const actual = fs.realpathSync.native(directory), expected = path.resolve(directory);
    if ((process.platform === 'win32' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected) ||
        !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw failure('task-store-unsafe');
    return actual;
}

function createStore(profileRoot) {
    if (!path.isAbsolute(profileRoot)) throw failure('task-store-unsafe');
    const profile = physical(profileRoot), root = path.join(profile, 'advance-downloads');
    try {fs.mkdirSync(root, {mode: 0o700});} catch (error) {if (error.code !== 'EEXIST') throw failure('task-store-unavailable');}
    physical(root);
    function inspect(file) {
        physical(root);
        try {
            const stat = fs.lstatSync(file, {bigint: true});
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536n) throw failure('task-store-unsafe');
            return stat;
        } catch (error) {if (error.code === 'ENOENT') return null; throw failure('task-store-unsafe');}
    }
    function get(id) {
        if (!uuid(id)) throw failure('task-invalid');
        const file = path.join(root, id + '.json');
        if (!inspect(file)) return null;
        let value;
        try {value = JSON.parse(fs.readFileSync(file, 'utf8'));} catch (_) {throw failure('task-store-unsafe');}
        if (!validTask(value) || value.id !== id) throw failure('task-store-unsafe');
        return value;
    }
    function save(value) {
        if (!validTask(value)) throw failure('task-invalid');
        physical(root);
        const file = path.join(root, value.id + '.json'), previous = inspect(file), rootId = identity(fs.statSync(root, {bigint: true}));
        if (previous) get(value.id);
        const temporary = path.join(root, '.save-' + crypto.randomUUID() + '.tmp');
        let fd, own;
        try {
            fd = fs.openSync(temporary, 'wx', 0o600); own = fs.fstatSync(fd, {bigint: true});
            fs.writeFileSync(fd, JSON.stringify(value) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
            physical(root);
            const current = inspect(file);
            if (!sameId(fs.statSync(root, {bigint: true}), rootId) || !!previous !== !!current || previous &&
                (!sameId(current, identity(previous)) || current.size !== previous.size || current.mtimeNs !== previous.mtimeNs)) throw failure('task-store-changed');
            fs.renameSync(temporary, file);
            return JSON.parse(JSON.stringify(value));
        } finally {
            if (fd !== undefined) fs.closeSync(fd);
            try {physical(root); if (own && sameId(fs.lstatSync(temporary, {bigint: true}), identity(own))) fs.unlinkSync(temporary);} catch (_) {}
        }
    }
    function list() {
        physical(root);
        const names = fs.readdirSync(root).filter(name => name.endsWith('.json') && uuid(name.slice(0, -5)));
        if (names.length > 1024) throw failure('task-limit');
        const tasks = [];
        for (const name of names) {try {tasks.push(get(name.slice(0, -5)));} catch (_) { /* Preserve unknown files; never infer ownership from a filename. */ }}
        return tasks;
    }
    function remove(id) {
        const value = get(id);
        if (!value) return;
        const file = path.join(root, id + '.json'), before = inspect(file), rootId = identity(fs.statSync(root, {bigint: true}));
        get(id); physical(root);
        const now = inspect(file);
        if (!now || !sameId(now, identity(before)) || now.size !== before.size || now.mtimeNs !== before.mtimeNs ||
            !sameId(fs.statSync(root, {bigint: true}), rootId)) throw failure('task-store-changed');
        fs.unlinkSync(file);
    }
    return Object.freeze({get, save, list, remove});
}

module.exports = {createStore, sourceRecord, identity, sameId, validTask, physical, partialName};
