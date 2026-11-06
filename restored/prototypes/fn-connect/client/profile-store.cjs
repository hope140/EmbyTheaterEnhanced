'use strict';

// Local connection registry only: no cookies, tokens, passwords or URLs here.
// Chromium owns the independent Session storage at the returned absolute path.
const fs = require('node:fs');
const path = require('node:path');
const {randomBytes, createHash} = require('node:crypto');
const {fail} = require('./policy.cjs');
const marker = 'ETE_FN_PROTOTYPE_PROFILES_V1\n';
const validId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
function binding(config) {
    return createHash('sha256').update(JSON.stringify({bootstrap: config.bootstrap.href, emby: config.emby.href,
        authOrigins: [...config.authOrigins].sort(), externalMediaOrigins: [...config.externalMediaOrigins].sort(),
        probePath: config.probePath, expectedServerId: config.expectedServerId || null})).digest('hex');
}
function createProfileStore(root) {
    if (!path.isAbsolute(root)) throw fail('PROFILE_ROOT_INVALID');
    const registry = path.join(root, 'profiles.json');
    function plain(file, directory = false) {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) throw fail('PROFILE_STORAGE_INVALID');
        return stat;
    }
    function checkRoot(create = false) {
        if (!fs.existsSync(root)) {
            if (!create) return false;
            fs.mkdirSync(root, {mode: 0o700});
            fs.writeFileSync(path.join(root, '.owner'), marker, {flag: 'wx', mode: 0o600});
            for (const name of ['Profiles', 'Locks', 'Control']) fs.mkdirSync(path.join(root, name), {mode: 0o700});
            fs.writeFileSync(registry, '{"version":1,"profiles":[]}\n', {flag: 'wx', mode: 0o600});
        }
        plain(root, true); plain(path.join(root, '.owner'));
        if (fs.readFileSync(path.join(root, '.owner'), 'utf8') !== marker) throw fail('PROFILE_STORAGE_INVALID');
        for (const name of ['Profiles', 'Locks', 'Control']) plain(path.join(root, name), true);
        return true;
    }
    function read(create = false) {
        if (!checkRoot(create)) return {version: 1, profiles: []};
        if (plain(registry).size > 65536) throw fail('PROFILE_STORAGE_INVALID');
        let data;
        try { data = JSON.parse(fs.readFileSync(registry, 'utf8')); } catch { throw fail('PROFILE_STORAGE_INVALID'); }
        if (!data || data.version !== 1 || !Array.isArray(data.profiles) || data.profiles.length > 64 || data.profiles.some(p => !p || typeof p !== 'object') ||
            new Set(data.profiles.map(p => p.id)).size !== data.profiles.length || data.profiles.some(p =>
                !validId(p.id) || !/^[a-f0-9]{64}$/.test(p.binding) || !Number.isInteger(p.number) || p.number < 1)) throw fail('PROFILE_STORAGE_INVALID');
        return data;
    }
    function write(data) {
        const temporary = path.join(root, 'registry-' + randomBytes(12).toString('hex') + '.tmp');
        try {
            fs.writeFileSync(temporary, JSON.stringify(data) + '\n', {flag: 'wx', mode: 0o600});
            fs.renameSync(temporary, registry);
        } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    }
    function mutate(action) {
        checkRoot(true);
        const lock = path.join(root, 'registry.lock');
        try { fs.closeSync(fs.openSync(lock, 'wx', 0o600)); } catch { throw fail('PROFILE_REGISTRY_BUSY'); }
        try { return action(); } finally { fs.unlinkSync(lock); }
    }
    return {
        initialize() { checkRoot(true); return path.join(root, 'Control'); },
        lockApplication() {
            checkRoot(true);
            const file = path.join(root, 'application.lock');
            try { fs.closeSync(fs.openSync(file, 'wx', 0o600)); } catch { throw fail('PROFILE_APPLICATION_IN_USE'); }
            let released = false;
            return () => { if (!released) { plain(file); fs.unlinkSync(file); released = true; } };
        },
        list(config) {
            return read().profiles.filter(p => p.binding === binding(config)).map(p => ({profileId: p.id, label: '本机登录分区 ' + p.number}));
        },
        acquire(config, profileId) {
            return mutate(() => {
            const data = read(true), hash = binding(config);
            let record;
            if (profileId !== undefined) {
                if (!validId(profileId)) throw fail('PROFILE_ID_INVALID');
                record = data.profiles.find(p => p.id === profileId);
                if (!record || record.binding !== hash) throw fail('PROFILE_BINDING_MISMATCH');
            } else {
                if (data.profiles.length >= 64) throw fail('PROFILE_LIMIT');
                record = {id: randomBytes(16).toString('hex'), binding: hash,
                    number: Math.max(0, ...data.profiles.map(p => p.number)) + 1};
                fs.mkdirSync(path.join(root, 'Profiles', record.id), {mode: 0o700});
                data.profiles.push(record); write(data);
            }
            const directory = path.join(root, 'Profiles', record.id);
            plain(directory, true);
            const lock = path.join(root, 'Locks', record.id + '.lock');
            try { fs.closeSync(fs.openSync(lock, 'wx', 0o600)); } catch { throw fail('PROFILE_IN_USE'); }
            let released = false;
            return Object.freeze({persistent: true, profileId: record.id, path: directory,
                release() {
                    if (released) return;
                    plain(lock); fs.unlinkSync(lock); released = true;
                },
                forget() {
                    mutate(() => {
                        const latest = read();
                        latest.profiles = latest.profiles.filter(p => p.id !== record.id);
                        write(latest);
                    });
                    // Do not delete a directory still owned by Chromium.
                }});
            });
        }
    };
}
module.exports = {createProfileStore};
