'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const validChannel = value => value === 'stable' || value === 'testing';

function createStore(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw Error('invalid-update-settings-path');
    const root = path.resolve(directory), file = path.join(root, 'app-update.json');
    function physical() {
        const actual = fs.realpathSync.native(root);
        if ((process.platform === 'win32' ? actual.toLowerCase() !== root.toLowerCase() : actual !== root) ||
            !fs.lstatSync(root).isDirectory()) throw Error('invalid-update-settings-path');
    }
    function identity() {
        try {
            const stat = fs.lstatSync(file, {bigint: true});
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024n) throw Error('invalid-update-settings');
            return stat;
        } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    function same(left, right) { return !!left === !!right && (!left || (left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs)); }
    function read() {
        physical();
        if (!identity()) return 'stable';
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!value || Object.keys(value).sort().join(',') !== 'channel,schemaVersion' || value.schemaVersion !== 1 || !validChannel(value.channel)) throw Error('invalid-update-settings');
        return value.channel;
    }
    function save(channel) {
        if (!validChannel(channel)) throw Error('invalid-update-channel');
        physical();
        const directoryIdentity = fs.statSync(root, {bigint: true}), previous = identity();
        // Existing malformed preferences are preserved rather than overwritten.
        read();
        const temporary = path.join(root, '.app-update-' + crypto.randomBytes(16).toString('hex') + '.tmp');
        let fd, own;
        try {
            fd = fs.openSync(temporary, 'wx', 0o600); own = fs.fstatSync(fd, {bigint: true});
            fs.writeFileSync(fd, JSON.stringify({schemaVersion: 1, channel}) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
            physical();
            const currentDirectory = fs.statSync(root, {bigint: true});
            if (currentDirectory.dev !== directoryIdentity.dev || currentDirectory.ino !== directoryIdentity.ino || !same(previous, identity())) throw Error('update-settings-changed');
            fs.renameSync(temporary, file);
            return channel;
        } finally {
            if (fd !== undefined) fs.closeSync(fd);
            try { physical(); const stat = fs.lstatSync(temporary, {bigint: true}); if (own && stat.dev === own.dev && stat.ino === own.ino) fs.unlinkSync(temporary); } catch (_) {}
        }
    }
    return {read, save};
}

module.exports = {createStore, validChannel};
