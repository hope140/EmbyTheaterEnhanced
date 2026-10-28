'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const boundary = require('./renderer-boundary');
const {selection} = require('./playback-range-policy');
const CHANNELS = Object.freeze({GET: 'enhanced-playback-range-settings-get', SAVE: 'enhanced-playback-range-settings-save'});
function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['schema', 'enabled', 'progressPercent', 'preloadMB'].includes(k)) || value.schema !== 1 || typeof value.enabled !== 'boolean') throw Error('invalid-config');
    const policy = selection(value);
    return {schema: 1, enabled: value.enabled, progressPercent: policy.progressPercent, preloadMB: policy.preloadMB};
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
        if (fs.existsSync(file)) {physical(file, false); if (fs.statSync(file).size > 4096) throw Error('invalid-config'); const old = JSON.parse(fs.readFileSync(file));
            // The prior experimental resource fields cannot authorize a product policy.
            const legacy = Object.keys(old).some(k => !['schema', 'enabled', 'progressPercent', 'preloadMB'].includes(k));
            config = normalize({schema: old.schema, enabled: legacy ? false : old.enabled, progressPercent: old.progressPercent, preloadMB: old.preloadMB});}
    } catch (_) { /* Damaged settings fail closed; explicit Save may repair the owned file. */ }
    const get = () => ({...config});
    return {get,
        save(value) {
            const next = normalize(value); physical(profileRoot, true);
            if (!fs.existsSync(directory)) fs.mkdirSync(directory, {mode: 0o700}); physical(directory, true);
            if (fs.existsSync(file)) physical(file, false);
            const temporary = path.join(directory, crypto.randomUUID() + '.pending'); let fd;
            try {
                fd = fs.openSync(temporary, 'wx', 0o600); fs.writeFileSync(fd, JSON.stringify(next) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
                fs.renameSync(temporary, file); config = next;
            } finally {if (fd !== undefined) fs.closeSync(fd); fs.rmSync(temporary, {force: true});}
            return get();
        },
        // P is the selected next-prefix budget, not a second last-play quota.
        runtimeConfig() {return config.enabled ? {kind: 'source-aware', root: path.join(profileRoot, 'next-episode-prefix-v1'),
            sharedRoot: path.join(profileRoot, 'shared-playback-byte-cache-v2'),
            ...selection(config), timeoutMs: 30000} : null;}

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
                return {...snapshot('saved', store.save(request)), requiresRestart: false, applyMode: 'next-play'};
            }
            return snapshot('ok', store.get());
        } catch (_) {return {status: 'error', reason: 'invalid-config'};}
    };}
    ipcMain.handle(CHANNELS.GET, handler(false)); ipcMain.handle(CHANNELS.SAVE, handler(true));
    return () => {ipcMain.removeHandler(CHANNELS.GET); ipcMain.removeHandler(CHANNELS.SAVE);};
}
module.exports = {normalize, createStore, register, CHANNELS};
