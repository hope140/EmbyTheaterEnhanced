'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {selection} = require('./playback-range-policy');
function parseLaunch(argv) {
    const off = Object.freeze({enabled: false});
    if (argv.filter(arg => arg === '--ete-range-cache-trial').length !== 1) return off;
    const value = name => {const values = argv.filter(v => v.startsWith(name + '=')); return values.length === 1 ? values[0].slice(name.length + 1) : null;};
    try {
        const file = value('--ete-range-cache-config'), profile = value('--ete-range-cache-profile');
        if (!file || !profile || !path.isAbsolute(file) || !path.isAbsolute(profile) || /^\\\\/.test(profile) ||
            fs.realpathSync(file) !== path.resolve(file) || fs.realpathSync(profile) !== path.resolve(profile)) return off;
        if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 4096 || !fs.statSync(profile).isDirectory()) return off;
        const config = JSON.parse(fs.readFileSync(file, 'utf8'));
        const keys = ['maxBytes', 'minFreeBytes', 'bytesPerSecond', 'timeoutMs', 'progressPercent', 'preloadMB'];
        if (Object.keys(config).some(k => !keys.includes(k)) || !Number.isSafeInteger(config.maxBytes) || config.maxBytes < 262144 || config.maxBytes > 17179869184 ||
            !Number.isSafeInteger(config.minFreeBytes) || config.minFreeBytes < 0 || !Number.isSafeInteger(config.bytesPerSecond) || config.bytesPerSecond <= 0 ||
            !Number.isSafeInteger(config.timeoutMs) || config.timeoutMs <= 0 || config.timeoutMs > 30000) return off;
        const policy = selection(config), marker = path.join(profile, 'ete-range-cache-trial-owner');
        if (!fs.readdirSync(profile).length) fs.writeFileSync(marker, 'ETE range trial v1\n', {flag: 'wx', mode: 0o600});
        if (!fs.lstatSync(marker).isFile() || fs.lstatSync(marker).isSymbolicLink() || fs.readFileSync(marker, 'utf8') !== 'ETE range trial v1\n') return off;
        const directories = {};
        for (const name of ['cache', 'electron', 'local', 'mpv']) {
            const dir = path.join(profile, name); fs.mkdirSync(dir, {recursive: true, mode: 0o700});
            if (fs.realpathSync(dir) !== dir || fs.lstatSync(dir).isSymbolicLink()) return off;
            directories[name] = dir;
        }
        return Object.freeze({enabled: true, profile, directories, config: Object.freeze({...config, ...policy, root: directories.cache})});
    } catch (_) {return off;}
}
// A rejected explicit trial must never become an ordinary-profile launch.
function prepareLaunch(argv) {
    const launch = parseLaunch(argv);
    if (argv.some(arg => /^--ete-range-cache(?:-|=|$)/i.test(arg)) && !launch.enabled) throw Error('range-cache-trial-launch-invalid');
    return launch;
}
function activateProfile(app, launch, environment) {
    if (!launch.enabled) return;
    app.setPath('appData', launch.profile); app.setPath('userData', launch.directories.electron); app.setPath('sessionData', launch.directories.electron);
    environment.APPDATA = launch.profile; environment.LOCALAPPDATA = launch.directories.local; environment.MPV_HOME = launch.directories.mpv;
}
module.exports = {parseLaunch, prepareLaunch, activateProfile};
