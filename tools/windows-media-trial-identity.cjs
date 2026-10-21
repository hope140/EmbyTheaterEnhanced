'use strict';

const fs = require('node:fs'), path = require('node:path');
const APP_ID = 'ETE.WindowsMediaProbe.Trial';
const SHORTCUT_NAME = 'Emby Theater Enhanced - Native Trial.lnk';

function details(runtime, privateRoot) {
    const profile = path.join(privateRoot, 'appdata/EmbyTheaterEnhanced/data/electron');
    const appDirectory = path.join(runtime, 'electronapp');
    return {target: path.join(runtime, 'x64/electron/electron.exe'), cwd: appDirectory,
        // The bootstrap supplies the legacy profile/CEC arguments itself.
        // Avoid duplicating them here: shell readback truncates long args.
        args: '"--user-data-dir=' + profile + '" "' + appDirectory + '"',
        description: 'Emby Theater Enhanced local media integration trial',
        icon: path.join(appDirectory, 'icon.ico'), iconIndex: 0, appUserModelId: APP_ID};
}

function matches(actual, expected) {
    const samePath = (a, b) => typeof a === 'string' && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
    return actual && samePath(actual.target, expected.target) && samePath(actual.cwd, expected.cwd) &&
        actual.args === expected.args && samePath(actual.icon, expected.icon) && actual.iconIndex === 0 && actual.appUserModelId === APP_ID;
}

function register(options) {
    const io = options.fs || fs, {shell, runtime, privateRoot, appData} = options;
    for (const value of [runtime, privateRoot, appData]) if (typeof value !== 'string' || !path.isAbsolute(value) || /["\r\n]/.test(value)) throw Error('Absolute identity paths required');
    const programs = path.join(appData, 'Microsoft/Windows/Start Menu/Programs');
    const shortcut = path.join(programs, SHORTCUT_NAME), expected = details(runtime, privateRoot);
    if (io.existsSync(shortcut)) {
        if (!io.lstatSync(shortcut).isFile() || io.lstatSync(shortcut).isSymbolicLink() || !matches(shell.readShortcutLink(shortcut), expected)) throw Error('Trial shortcut is owned by another target');
        return {created: false, verified: true, shortcut};
    }
    io.mkdirSync(programs, {recursive: true});
    if (!shell.writeShortcutLink(shortcut, 'create', expected)) throw Error('Trial identity shortcut could not be created');
    if (!matches(shell.readShortcutLink(shortcut), expected)) throw Error('Trial identity shortcut readback failed');
    return {created: true, verified: true, shortcut};
}

module.exports = {APP_ID, SHORTCUT_NAME, details, matches, register};
