'use strict';

// Only the main process chooses this store. Receipts are ownership bookkeeping,
// never authority to execute: each click still refreshes the official release.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const update = require('./manual-app-update');
const maintenance = require('./maintenance');
const fail = code => Object.assign(Error(code), {code});
const id = stat => ({dev: String(stat.dev), ino: String(stat.ino)});
const same = (stat, expected) => expected && String(stat.dev) === expected.dev && String(stat.ino) === expected.ino;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const attemptName = /^update-[0-9a-f]{32}$/;
const partialName = /^\.ete-download-[0-9a-f]{32}\.part$/;

function physical(directory) {
    const actual = fs.realpathSync.native(directory);
    if ((process.platform === 'win32' ? actual.toLowerCase() !== directory.toLowerCase() : actual !== directory) ||
        !fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw fail('cache-unsafe');
}
function identity(file) {
    const stat = fs.lstatSync(file, {bigint: true});
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) throw fail('cache-unsafe');
    return stat;
}
function createStore(options) {
    const settings = options || {};
    if (!path.isAbsolute(settings.profileRoot || '') || !path.isAbsolute(settings.executable || '')) throw fail('cache-unsafe');
    const root = path.join(settings.profileRoot, 'updates');
    let rootId;
    function openRoot() {
        physical(settings.profileRoot);
        try { fs.mkdirSync(root, {mode: 0o700}); } catch (error) { if (error.code !== 'EEXIST') throw error; }
        physical(root);
        const stat = fs.lstatSync(root, {bigint: true});
        if (rootId && !same(stat, rootId)) throw fail('cache-unsafe');
        rootId = id(stat);
    }
    function ownDirectory(directory, expected) {
        openRoot(); physical(directory);
        if (path.dirname(directory) !== root || !attemptName.test(path.basename(directory)) ||
            !same(fs.lstatSync(directory, {bigint: true}), expected)) throw fail('cache-unsafe');
    }
    function save(directory, record) {
        ownDirectory(directory, record.directoryId);
        const target = path.join(directory, 'receipt.json');
        let previous;
        try { previous = identity(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const temporary = path.join(directory, '.receipt-' + crypto.randomBytes(16).toString('hex') + '.tmp');
        let temporaryId;
        try {
            const fd = fs.openSync(temporary, 'wx', 0o600);
            try { temporaryId = id(fs.fstatSync(fd, {bigint: true})); fs.writeFileSync(fd, JSON.stringify(record) + '\n'); fs.fsyncSync(fd); }
            finally { fs.closeSync(fd); }
            ownDirectory(directory, record.directoryId);
            if (previous && !same(identity(target), id(previous))) throw fail('cache-unsafe');
            if (!previous && fs.existsSync(target)) throw fail('cache-unsafe');
            fs.renameSync(temporary, target);
        } finally {
            try { ownDirectory(directory, record.directoryId); if (same(identity(temporary), temporaryId)) fs.unlinkSync(temporary); } catch (_) {}
        }
    }
    function read(directory) {
        const file = path.join(directory, 'receipt.json');
        const before = identity(file);
        if (before.size > 16384n) throw fail('cache-unsafe');
        const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        let record, receiptBytes;
        try {
            if (!same(fs.fstatSync(fd, {bigint: true}), id(before))) throw fail('cache-unsafe');
            const bytes = Buffer.alloc(16385), length = fs.readSync(fd, bytes, 0, bytes.length, 0);
            if (length > 16384) throw fail('cache-unsafe');
            receiptBytes = bytes.subarray(0, length);
            record = JSON.parse(receiptBytes.toString('utf8'));
        } finally { fs.closeSync(fd); }
        if (!same(identity(file), id(before)) || record.schemaVersion !== 1 ||
            !['downloading', 'ready', 'armed'].includes(record.state) || !maintenance.parseVersion(record.targetVersion) ||
            !maintenance.parseVersion(record.currentVersion) || maintenance.compareVersions(record.targetVersion, record.currentVersion) !== 1 ||
            record.executable !== settings.executable || !Array.isArray(record.partials) || record.partials.length > 2 ||
            record.partials.some(item => !partialName.test(item.name) || !validId(item.identity) || item.identity.dev !== record.rootId.dev) ||
            !validId(record.directoryId) || !validId(record.rootId) || !same(fs.lstatSync(root, {bigint: true}), record.rootId)) throw fail('cache-unsafe');
        const expected = update.installerFromRelease({tag_name: record.tag,
            assets: [{...record.installer, state: 'uploaded', digest: 'sha256:' + record.installer.sha256, browser_download_url: record.installer.url}]});
        if (!expected || JSON.stringify(expected) !== JSON.stringify(record.installer) ||
            record.installer.name !== 'EmbyTheaterEnhanced-' + record.targetVersion + '-win-x64-setup.exe' ||
            (record.state !== 'downloading' && (!validId(record.fileId) || !update.SOURCES.some(source => source.id === record.source)))) throw fail('cache-unsafe');
        ownDirectory(directory, record.directoryId);
        Object.defineProperty(record, 'receiptProof', {value: {ino: String(before.ino), size: receiptBytes.length, sha256: digest(receiptBytes)}});
        return record;
    }
    function entries() {
        openRoot();
        const names = fs.readdirSync(root).filter(name => attemptName.test(name));
        if (names.length > 1000) throw fail('cache-unsafe');
        return names.map(name => path.join(root, name));
    }
    async function verified(directory, record, signal) {
        ownDirectory(directory, record.directoryId);
        const file = path.join(directory, record.installer.name), before = identity(file);
        if (!same(before, record.fileId) || Number(before.size) !== record.installer.size) throw fail('cache-unsafe');
        const hash = crypto.createHash('sha256');
        const handle = await fs.promises.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
        let count = 0;
        try {
            if (!same(await handle.stat({bigint: true}), record.fileId)) throw fail('cache-unsafe');
            for await (const bytes of handle.createReadStream({autoClose: false})) {
                if (signal && signal.aborted) throw fail('cancelled');
                count += bytes.length;
                if (count > record.installer.size) throw fail('cache-unsafe');
                hash.update(bytes);
            }
        } finally { await handle.close(); }
        ownDirectory(directory, record.directoryId);
        if (!same(identity(file), record.fileId) || count !== record.installer.size || hash.digest('hex') !== record.installer.sha256) throw fail('cache-unsafe');
    }
    async function download(installer, options) {
        const request = options || {};
        if (request.signal && request.signal.aborted) throw fail('cancelled');
        let retry;
        for (const directory of entries()) {
            if (request.signal && request.signal.aborted) throw fail('cancelled');
            let record;
            try { record = read(directory); } catch (_) { continue; } // Unknown files are never removed or executed.
            if (record.state !== 'downloading' && JSON.stringify(record.installer) === JSON.stringify(installer)) {
                await verified(directory, record, request.signal);
                return {...record, directory, reused: true};
            }
            if (record.state === 'downloading' && JSON.stringify(record.installer) === JSON.stringify(installer) &&
                fs.readdirSync(directory).join(',') === 'receipt.json') retry = {directory, record};
        }
        const available = (settings.statfs || fs.statfsSync)(root, {bigint: true});
        if (available.bavail * available.bsize < BigInt(installer.size) + 65536n) throw fail('disk-full');
        const directory = retry ? retry.directory : path.join(root, 'update-' + crypto.randomBytes(16).toString('hex'));
        if (!retry) fs.mkdirSync(directory, {mode: 0o700});
        physical(directory);
        const record = retry ? retry.record : {schemaVersion: 1, state: 'downloading', rootId, directoryId: id(fs.lstatSync(directory, {bigint: true})),
            currentVersion: request.currentVersion, targetVersion: request.targetVersion, tag: request.tag,
            executable: settings.executable, installer, partials: []};
        record.partials = [];
        save(directory, record);
        const result = await (settings.downloadInstaller || update.downloadInstaller)(installer, directory, {...request,
            onTemporary: (name, stat) => { record.partials = [{name, identity: id(stat)}]; save(directory, record); }});
        record.state = 'ready'; record.source = result.source;
        record.fileId = id(identity(path.join(directory, installer.name)));
        save(directory, record);
        await verified(directory, record, request.signal);
        return {...record, directory, reused: false};
    }
    async function prepare(record, signal) {
        // Re-read the receipt and file: the renderer never supplies a path or digest.
        const current = read(record.directory);
        for (const key of ['installer', 'fileId', 'directoryId', 'rootId', 'source', 'targetVersion', 'currentVersion', 'tag', 'executable']) {
            if (JSON.stringify(current[key]) !== JSON.stringify(record[key])) throw fail('cache-unsafe');
        }
        await verified(record.directory, current, signal);
        // Persist intent before the guard denies directory mutation. This is
        // only a retry hint; neither intent nor launch proves installation.
        current.state = 'armed'; save(record.directory, current);
        const lease = await settings.handoff.prepare({...current, root, directory: record.directory}, signal);
        let committed = false;
        return {
            async commit() {
                if (signal && signal.aborted) { await lease.abort(); throw fail('cancelled'); }
                try { await lease.commit(); committed = true; }
                catch (error) { await lease.abort(); throw error; }
            },
            abort() { if (!committed) return lease.abort(); }
        };
    }
    async function reconcile(version) {
        const outcome = {removed: 0, retained: 0};
        for (const directory of entries()) {
            try {
                const record = read(directory);
                // A download or wizard launch alone is never proof of installation.
                if (maintenance.compareVersions(version, record.targetVersion) < 0 ||
                    maintenance.compareVersions(version, record.targetVersion) === null) { outcome.retained++; continue; }
                const files = record.partials.map(item => ({name: item.name, ino: item.identity.ino}));
                if (record.fileId) files.push({name: record.installer.name, ino: record.fileId.ino, size: record.installer.size, sha256: record.installer.sha256});
                files.push({name: 'receipt.json', ...record.receiptProof});
                await settings.handoff.cleanup({...record, root, directory, files});
                outcome.removed++;
            } catch (_) { outcome.retained++; }
        }
        return outcome;
    }
    function recovery() {
        return entries().some(directory => { try { return read(directory).state === 'armed'; } catch (_) { return false; } });
    }
    return {download, prepare, reconcile, recovery};
}
function validId(value) { return value && /^\d+$/.test(value.dev) && /^\d+$/.test(value.ino) && value.ino !== '0'; }

module.exports = {createStore};
