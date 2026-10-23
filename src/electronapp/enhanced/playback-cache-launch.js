'use strict';
const fs = require('node:fs');
const path = require('node:path');
const exact = (v, keys) => v && Object.keys(v).sort().join('|') === keys.slice().sort().join('|');
function valid(config) {
    return exact(config, ['policy', 'download', 'networkPolicy', 'activeLeasePolicy']) && config.networkPolicy === 'same-origin-paused-only' &&
        config.activeLeasePolicy === 'retain-until-media-close' &&
        exact(config.policy, ['maxBytes', 'maxEntries', 'ttlMs', 'minFreeBytes']) &&
        Object.values(config.policy).every(v => Number.isSafeInteger(v) && v >= 0) &&
        config.policy.maxBytes > 0 && config.policy.maxBytes <= 67108864 && config.policy.maxEntries > 0 && config.policy.maxEntries <= 16 && config.policy.ttlMs > 0 &&
        exact(config.download, ['maxFileBytes', 'bytesPerSecond', 'chunkBytes', 'maxDurationMs', 'authorizationMaxAgeMs']) &&
        Object.values(config.download).every(v => Number.isSafeInteger(v) && v > 0) &&
        config.download.maxFileBytes <= 16777216 && config.download.maxFileBytes <= config.policy.maxBytes &&
        config.download.chunkBytes <= 65536 && config.download.maxDurationMs <= 3600000 && config.download.authorizationMaxAgeMs <= 2000;
}
function parseLaunch(argv) {
    const off = Object.freeze({enabled: false});
    if (!argv.includes('--ete-cache-trial')) return off;
    function value(name) { const found = argv.filter(v => v.startsWith(name + '=')); return found.length === 1 ? found[0].slice(name.length + 1) : null; }
    const filename = value('--ete-cache-trial-config'), profile = value('--ete-cache-trial-profile');
    try {
        if (!filename || !profile || !path.isAbsolute(filename) || !path.isAbsolute(profile) || /^\\\\/.test(profile) ||
            fs.realpathSync(filename) !== path.resolve(filename) || fs.realpathSync(profile) !== path.resolve(profile)) return off;
        const stat = fs.lstatSync(filename), root = fs.lstatSync(profile);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096 || !root.isDirectory() || root.isSymbolicLink()) return off;
        const config = JSON.parse(fs.readFileSync(filename, 'utf8')); if (!valid(config)) return off;
        const marker = path.join(profile, 'ete-cache-trial-owner');
        const names = fs.readdirSync(profile);
        if (names.length && (!fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink() || fs.readFileSync(marker, 'utf8') !== 'ETE isolated cache trial v1\n')) return off;
        if (!names.length) fs.writeFileSync(marker, 'ETE isolated cache trial v1\n', {flag: 'wx', mode: 0o600});
        const storage = path.join(profile, 'cache'), userData = path.join(profile, 'electron');
        const localData = path.join(profile, 'local'), mpvHome = path.join(profile, 'mpv');
        for (const directory of [storage, userData, localData, mpvHome]) {
            fs.mkdirSync(directory, {recursive: true, mode: 0o700});
            if (fs.realpathSync(directory) !== directory) return off;
        }
        return Object.freeze({enabled: true, profileRoot: profile, parent: storage, userData, localData, mpvHome, config});
    } catch { return off; }
}
function activateProfile(app, launch, environment) {
    if (!launch || launch.enabled !== true) return;
    app.setPath('appData', launch.profileRoot);
    app.setPath('userData', launch.userData);
    app.setPath('sessionData', launch.userData);
    environment.APPDATA = launch.profileRoot;
    environment.LOCALAPPDATA = launch.localData;
    environment.MPV_HOME = launch.mpvHome;
}
module.exports = {parseLaunch, valid, activateProfile};
