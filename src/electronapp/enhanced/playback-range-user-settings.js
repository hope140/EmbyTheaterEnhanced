'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const boundary = require('./renderer-boundary');
const {selection} = require('./playback-range-policy');
const CHANNELS = Object.freeze({GET: 'enhanced-playback-range-settings-get', SAVE: 'enhanced-playback-range-settings-save'});
function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['schema', 'enabled', 'progressPercent', 'preloadMB', 'maxBytes', 'bytesPerSecond'].includes(k)) || value.schema !== 1 || typeof value.enabled !== 'boolean') throw Error('invalid-config');
    const policy = selection(value), maxBytes = value.maxBytes == null ? null : value.maxBytes, bytesPerSecond = value.bytesPerSecond == null ? null : value.bytesPerSecond;
    if (maxBytes !== null && (!Number.isSafeInteger(maxBytes) || maxBytes < 262144 || maxBytes > 17179869184) || bytesPerSecond !== null && (!Number.isSafeInteger(bytesPerSecond) || bytesPerSecond <= 0)) throw Error('invalid-config');
    if (value.enabled && (maxBytes === null || bytesPerSecond === null)) throw Error('resources-required');
    return {schema: 1, enabled: value.enabled, progressPercent: policy.progressPercent, preloadMB: policy.preloadMB, maxBytes, bytesPerSecond};
}
function physical(file, directory) {
    const absolute = path.resolve(file), same = value => process.platform === 'win32' ? value.toLowerCase() : value;
    if (/^\\\\/.test(absolute)) throw Error('profile-unavailable');
    let cursor = path.parse(absolute).root;
    for (const part of path.relative(cursor, absolute).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part); const stat = fs.lstatSync(cursor);
        if (stat.isSymbolicLink() || same(fs.realpathSync.native(cursor)) !== same(cursor)) throw Error('profile-unavailable');
    }
    const stat = fs.lstatSync(absolute);
    if (directory ? !stat.isDirectory() : !stat.isFile()) throw Error('profile-unavailable');
}
function createStore({profileRoot}) {
    if (typeof profileRoot !== 'string' || !path.isAbsolute(profileRoot)) throw Error('profile-unavailable');
    physical(profileRoot, true);
    const directory = path.join(profileRoot, 'config'), file = path.join(directory, 'playback-range.json');
    let config = normalize({schema: 1, enabled: false});
    try {
        if (fs.existsSync(file)) {physical(file, false); if (fs.statSync(file).size > 4096) throw Error('invalid-config'); config = normalize(JSON.parse(fs.readFileSync(file)));}
    } catch (_) { /* Damaged settings fail closed; explicit Save may repair the owned file. */ }
    function checkRetainedBudget(next) {
        if (!next.enabled) return;
        const cacheRoot = path.join(profileRoot, 'playback-ranges'), indexFile = path.join(cacheRoot, 'index.json');
        if (!fs.existsSync(indexFile)) return;
        physical(indexFile, false); physical(path.join(cacheRoot, 'owner'), false);
        if (fs.statSync(path.join(cacheRoot, 'owner')).size !== 19 || fs.readFileSync(path.join(cacheRoot, 'owner'), 'utf8') !== 'ETE byte ranges v2\n' || fs.statSync(indexFile).size > 16777216) throw Error('invalid-config');
        const index = JSON.parse(fs.readFileSync(indexFile));
        if (index.schema !== 1 || !index.entries || Object.keys(index.entries).length > 8) throw Error('invalid-config');
        let bytes = 0;
        for (const entry of Object.values(index.entries)) {
            if (!entry.blocks || Object.keys(entry.blocks).length > 65536) throw Error('invalid-config');
            for (const row of Object.values(entry.blocks)) {if (!Number.isSafeInteger(row.size) || row.size < 0 || !Number.isSafeInteger(bytes + row.size)) throw Error('invalid-config'); bytes += row.size;}
        }
        if (next.maxBytes < bytes) throw Error('budget-below-retained-cache');
    }
    const get = () => ({...config});
    return {get,
        save(value) {
            const next = normalize(value); physical(profileRoot, true); checkRetainedBudget(next);
            if (!fs.existsSync(directory)) fs.mkdirSync(directory, {mode: 0o700}); physical(directory, true);
            if (fs.existsSync(file)) physical(file, false);
            const temporary = path.join(directory, crypto.randomUUID() + '.pending'); let fd;
            try {
                fd = fs.openSync(temporary, 'wx', 0o600); fs.writeFileSync(fd, JSON.stringify(next) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
                fs.renameSync(temporary, file); config = next;
            } finally {if (fd !== undefined) fs.closeSync(fd); fs.rmSync(temporary, {force: true});}
            return get();
        },
        runtimeConfig() {
            if (!config.enabled) return null;
            // Engineering request deadline; no smoke disk/bandwidth values are reused.
            // Space errors/quota stop writes/preload while foreground reads retain fallback.
            return {...config, ...selection(config), root: path.join(profileRoot, 'playback-ranges'), minFreeBytes: 0, timeoutMs: 30000};
        }
    };
}
function register({ipcMain, store, getWebContents, getRuntimeStatus = () => ({enabled: false})}) {
    function snapshot(status, config) {return {status, config, runtime: getRuntimeStatus()};}
    function handler(save) {return (event, request) => {
        if (!boundary.isTrusted(event, getWebContents())) return {status: 'error', reason: 'untrusted_sender'};
        if (!store) return {status: 'error', reason: 'settings-unavailable'};
        try {
            if (!save && request !== undefined) throw Error('invalid-config');
            if (save) {
                const next = normalize(request), active = getRuntimeStatus();
                if (next.enabled && active && active.enabled && Number.isSafeInteger(active.maxBytes) && next.maxBytes < active.maxBytes) throw Error('active-budget-reduction');
                return {...snapshot('saved', store.save(next)), requiresRestart: true};
            }
            return snapshot('ok', store.get());
        } catch (error) {return {status: 'error', reason: ['resources-required', 'budget-below-retained-cache', 'active-budget-reduction'].includes(error.message) ? error.message : 'invalid-config'};}
    };}
    ipcMain.handle(CHANNELS.GET, handler(false)); ipcMain.handle(CHANNELS.SAVE, handler(true));
    return () => {ipcMain.removeHandler(CHANNELS.GET); ipcMain.removeHandler(CHANNELS.SAVE);};
}
module.exports = {normalize, createStore, register, CHANNELS};
