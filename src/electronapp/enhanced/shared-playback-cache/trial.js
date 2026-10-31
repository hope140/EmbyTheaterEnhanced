'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FLAG = '--ete-shared-cache-trial';
const OWNER_FILE = '.shared-playback-cache-trial-owner';
const OWNER = 'ETE shared playback cache trial v1\n';
const DIRECTORIES = Object.freeze({appData: 'appdata', userData: 'userdata', sessionData: 'session',
    localAppData: 'localappdata', mpv: 'mpv', temp: 'temp', logs: 'logs', crashDumps: 'crashes'});
const SOURCE_FILES = Object.freeze(['electronapp/main.js', 'electronapp/native-helper/service.js',
    'electronapp/enhanced/playback-range-session.js', ...['store', 'index', 'proxy', 'adapter', 'deferred-store', 'trial']
        .map(name => 'electronapp/enhanced/shared-playback-cache/' + name + '.js')]);
function fail() {throw new Error('Isolated shared playback cache trial startup rejected.');}
function normalized(value) {const result = path.resolve(value); return process.platform === 'win32' ? result.toLowerCase() : result;}
function inside(parent, child) {
    const relative = path.relative(normalized(parent), normalized(child));
    return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}
function absolute(value) {
    if (typeof value !== 'string' || !value || /[\x00-\x1f]/.test(value) || !path.isAbsolute(value) ||
        /^(?:\\\\|\/\/)/.test(value)) fail();
    return path.resolve(value);
}
function physical(value, directory) {
    const target = absolute(value); let cursor = path.parse(target).root;
    for (const part of path.relative(cursor, target).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        if (fs.lstatSync(cursor).isSymbolicLink() || normalized(fs.realpathSync.native(cursor)) !== normalized(cursor)) fail();
    }
    const stat = fs.lstatSync(target);
    if (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1) fail();
    return target;
}
function layout(root) {return Object.fromEntries(Object.entries(DIRECTORIES).map(([key, name]) => [key, path.join(root, name)]));}
function profile(root) {
    root = physical(root, true);
    if (root === path.parse(root).root) fail();
    const owner = physical(path.join(root, OWNER_FILE), false);
    if (fs.statSync(owner).size !== Buffer.byteLength(OWNER) || fs.readFileSync(owner, 'utf8') !== OWNER) fail();
    const paths = layout(root);
    for (const directory of [root, ...Object.values(paths)]) {
        physical(directory, true);
        if (typeof process.getuid === 'function' && fs.statSync(directory).uid !== process.getuid()) fail();
    }
    return {root, paths};
}
// Explicit tooling entry only. Never adopt, repair or empty an existing directory.
function createProfile({root}) {
    root = absolute(root);
    if (root === path.parse(root).root) fail();
    physical(path.dirname(root), true);
    fs.mkdirSync(root, {mode: 0o700});
    for (const directory of Object.values(layout(root))) fs.mkdirSync(directory, {mode: 0o700});
    fs.writeFileSync(path.join(root, OWNER_FILE), OWNER, {flag: 'wx', mode: 0o600});
    return Object.freeze({root, userDataPath: path.join(root, 'userdata')});
}
function identity(runtimeRoot) {
    const manifestPath = physical(path.join(runtimeRoot, 'runtime-provenance.json'), false);
    if (fs.statSync(manifestPath).size > 16 * 1024 * 1024) fail();
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')), scope = manifest.validatedProductScope;
    if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit) || !scope || scope.sourceCommit !== manifest.sourceCommit ||
        scope.sourceSelection !== 'git-commit-blobs' || !Array.isArray(scope.files)) fail();
    for (const file of SOURCE_FILES) {
        const rows = scope.files.filter(row => row && row.runtimePath === file);
        if (rows.length !== 1 || rows[0].sourcePath !== 'src/' + file || !/^[a-f0-9]{64}$/i.test(rows[0].sourceSha256 || '') ||
            rows[0].runtimeSha256 !== rows[0].sourceSha256) fail();
        const source = physical(path.join(runtimeRoot, file), false);
        if (fs.statSync(source).size > 8 * 1024 * 1024 || crypto.createHash('sha256').update(fs.readFileSync(source))
            .digest('hex') !== rows[0].sourceSha256.toLowerCase()) fail();
    }
    return manifest.sourceCommit;
}
function prepare({app, argv, execPath, platform, environment, runtimeRoot}) {
    const args = argv.slice(2), flags = args.filter(arg => typeof arg === 'string' && arg.startsWith(FLAG));
    if (!flags.length) return null; // No profile, provenance, app-path or environment access in ordinary startup.
    try {
        if (flags.length !== 1 || !flags[0].startsWith(FLAG + '=') || !flags[0].slice(FLAG.length + 1) ||
            args.some(arg => typeof arg === 'string' && arg.startsWith('--ete-page-cache')) || platform !== 'win32' || app.isReady()) fail();
        const owned = profile(absolute(flags[0].slice(FLAG.length + 1)));
        runtimeRoot = physical(runtimeRoot, true);
        if (normalized(physical(execPath, false)) !== normalized(path.join(runtimeRoot, 'x64/electron/electron.exe')) ||
            normalized(physical(argv[1], true)) !== normalized(path.join(runtimeRoot, 'electronapp'))) fail();
        const forbidden = [runtimeRoot, absolute(app.getPath('userData')), path.join(absolute(app.getPath('appData')), 'EmbyTheaterEnhanced')];
        if (forbidden.some(directory => inside(directory, owned.root) || inside(owned.root, directory))) fail();
        const sourceCommit = identity(runtimeRoot);
        const paths = owned.paths;
        for (const name of ['appData', 'userData', 'sessionData', 'logs', 'temp', 'crashDumps']) app.setPath(name, paths[name]);
        Object.assign(environment, {APPDATA: paths.appData, LOCALAPPDATA: paths.localAppData, MPV_HOME: paths.mpv,
            TMP: paths.temp, TEMP: paths.temp, TMPDIR: paths.temp});
        return Object.freeze({root: owned.root, userDataPath: paths.userData, sourceCommit});
    } catch (_) {fail();}
}
module.exports = {prepare, createProfile, identity, SOURCE_FILES, OWNER_FILE, OWNER};
