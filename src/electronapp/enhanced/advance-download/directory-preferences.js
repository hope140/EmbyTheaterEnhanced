'use strict';

// Adapted from ETE's app-update-preferences ownership/atomic-write pattern.
// Only the chosen directory string is stored. No media directory is enumerated,
// created, migrated or cleaned by this module.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fail = reason => Error('advance-download-' + reason);
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const validDirectory = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value) && path.isAbsolute(value);
function physicalDirectory(value) {
    if (!validDirectory(value)) throw fail('directory-invalid');
    try {
        const root = path.resolve(value), actual = fs.realpathSync.native(root), stat = fs.lstatSync(root);
        if (!samePath(actual, root) || !stat.isDirectory() || stat.isSymbolicLink()) throw Error();
        return actual;
    } catch (_) {throw fail('directory-unavailable');}
}

function createStore(settingsDirectory) {
    if (!validDirectory(settingsDirectory)) throw fail('settings-invalid');
    const root = path.resolve(settingsDirectory), file = path.join(root, 'advance-download-directory.json');
    function physical() {physicalDirectory(root);}
    function identity() {
        try {
            const stat = fs.lstatSync(file, {bigint: true});
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768n) throw fail('settings-invalid');
            return stat;
        } catch (error) {if (error.code === 'ENOENT') return null; throw fail('settings-invalid');}
    }
    const same = (a, b) => !!a === !!b && (!a || a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs);
    function read() {
        physical();
        if (!identity()) return null;
        try {
            const value = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (value?.schemaVersion !== 1 || Object.keys(value).sort().join(',') !== 'directory,schemaVersion' || !validDirectory(value.directory)) throw Error();
            return value.directory;
        } catch (_) {throw fail('settings-invalid');}
    }
    function save(directory) {
        const chosen = physicalDirectory(directory);
        physical();
        const parent = fs.statSync(root, {bigint: true}), previous = identity();
        read(); // Preserve malformed existing settings rather than replacing them.
        const temporary = path.join(root, '.advance-download-directory-' + crypto.randomBytes(16).toString('hex') + '.tmp');
        let fd, own;
        try {
            fd = fs.openSync(temporary, 'wx', 0o600); own = fs.fstatSync(fd, {bigint: true});
            fs.writeFileSync(fd, JSON.stringify({schemaVersion: 1, directory: chosen}) + '\n');
            fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
            physical();
            const current = fs.statSync(root, {bigint: true});
            if (current.dev !== parent.dev || current.ino !== parent.ino || !same(previous, identity())) throw fail('settings-changed');
            fs.renameSync(temporary, file);
            return chosen;
        } catch (_) {throw fail('settings-save-failed');}
        finally {
            if (fd !== undefined) fs.closeSync(fd);
            try {physical(); const stat = fs.lstatSync(temporary, {bigint: true}); if (own && stat.dev === own.dev && stat.ino === own.ino) fs.unlinkSync(temporary);} catch (_) {}
        }
    }
    return Object.freeze({read, save});
}

function createSelector({store, dialog, getWindow = () => null}) {
    let pending;
    async function select({force = false, signal} = {}) {
        if (signal?.aborted) return {status: 'cancelled'};
        if (pending) return {status: 'busy'};
        const saved = store.read();
        if (saved && !force) return {status: 'selected', directory: physicalDirectory(saved)};
        const operation = Promise.resolve().then(() => dialog.showOpenDialog(getWindow(), {properties: ['openDirectory'], ...(saved ? {defaultPath: saved} : {})}));
        pending = operation;
        try {
            const result = await operation;
            if (signal?.aborted || result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length !== 1) return {status: 'cancelled'};
            return {status: 'selected', directory: store.save(result.filePaths[0])};
        } finally {if (pending === operation) pending = null;}
    }
    return Object.freeze({select});
}

module.exports = {createStore, createSelector};
