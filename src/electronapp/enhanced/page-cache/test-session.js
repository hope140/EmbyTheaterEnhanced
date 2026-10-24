'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const config = require('./test-options');
function fail() { throw new Error('Isolated page cache test startup rejected.'); }
function normalized(value) { const result = path.resolve(value); return process.platform === 'win32' ? result.toLowerCase() : result; }
function inside(parent, child) {
    const rel = path.relative(normalized(parent), normalized(child));
    return rel === '' || rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}
function physical(target, directory) {
    const absolute = path.resolve(target); let part = path.parse(absolute).root;
    for (const segment of path.relative(part, absolute).split(path.sep).filter(Boolean)) {
        part = path.join(part, segment);
        const stat = fs.lstatSync(part);
        if (stat.isSymbolicLink() || normalized(fs.realpathSync.native(part)) !== normalized(part)) fail();
    }
    const stat = fs.lstatSync(absolute);
    if (directory ? !stat.isDirectory() : !stat.isFile()) fail();
    return absolute;
}
const SOURCE_FILES = Object.freeze(['electronapp/main.js', 'electronapp/enhanced/home/home-tab.js',
    'electronapp/enhanced/home/server-sections.js', 'electronapp/enhanced/page-cache/page-data-cache.js',
    'electronapp/enhanced/page-cache/home-layout-cache.js', 'electronapp/enhanced/page-cache/test-options.js',
    'electronapp/enhanced/page-cache/test-session.js', 'electronapp/enhanced/cache-management-ipc.js',
    'electronapp/plugins/mpvplayer/cache-settings.js', 'electronapp/plugins/mpvplayer/about.js', 'electronapp/plugins/mpvplayer/about.html']);
const FLOW_OVERLAYS = Object.freeze([
    Object.freeze({path: 'electronapp/www/modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js', sha256: '4F3633D1B23CA2B15B6ACDF6AD013B0F704733D8BB17B37F4527EF310D52DFDA'}),
    Object.freeze({path: 'electronapp/www/modules/virtual-scroller/virtual-scroller.js', sha256: '4F7F014519217712350B156F86C710654CE1D48F39DA98B2811C8314BAB63DEC'})
]);
function identity(runtimeRoot, homeFlow) {
    const manifestPath = physical(path.join(runtimeRoot, 'runtime-provenance.json'), false);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const scope = manifest.validatedProductScope;
    if (!/^[a-f0-9]{40}$/.test(manifest.sourceCommit) || !scope || scope.sourceCommit !== manifest.sourceCommit ||
        scope.sourceSelection !== 'git-commit-blobs' || !Array.isArray(scope.files)) fail();
    const digest = file => crypto.createHash('sha256').update(fs.readFileSync(physical(path.join(runtimeRoot, file), false))).digest('hex').toUpperCase();
    for (const file of SOURCE_FILES) {
        const rows = scope.files.filter(row => row.runtimePath === file);
        if (rows.length !== 1 || !/^[A-Fa-f0-9]{64}$/.test(rows[0].sourceSha256) ||
            rows[0].sourceSha256.toUpperCase() !== digest(file) || rows[0].runtimeSha256 !== rows[0].sourceSha256) fail();
    }
    const prepared = (manifest.preparedArtifacts || []).filter(row => row.runtimePath === 'electronapp/preload.js');
    if (prepared.length !== 1 || prepared[0].runtimeSha256 !== digest('electronapp/preload.js')) fail();
    if (homeFlow && homeFlow !== 'baseline') for (const overlay of FLOW_OVERLAYS) if (digest(overlay.path) !== overlay.sha256) fail();
    return manifest.sourceCommit;
}
function prepare(options) {
    const testOptions = config.parse(options.argv.slice(2));
    if (!testOptions) return null; // Ordinary startup performs no trial filesystem/path/environment work.
    const app = options.app, environment = options.environment;
    if (options.platform !== 'win32' || app.isReady()) fail();
    const runtimeRoot = physical(options.runtimeRoot, true);
    if (normalized(physical(options.execPath, false)) !== normalized(path.join(runtimeRoot, 'x64/electron/electron.exe')) ||
        normalized(physical(options.argv[1], true)) !== normalized(path.join(runtimeRoot, 'electronapp'))) fail();
    const sourceCommit = identity(runtimeRoot, testOptions.homeFlow);
    const parent = physical(options.tempParent || os.tmpdir(), true);
    const originalAppData = app.getPath('appData'), originalUserData = app.getPath('userData');
    const forbidden = [runtimeRoot, path.join(originalAppData, 'EmbyTheaterEnhanced'), originalUserData];
    if (forbidden.some(root => inside(root, parent))) fail();
    const root = fs.mkdtempSync(path.join(parent, 'ETE-page-cache-test-'));
    physical(root, true);
    if (forbidden.some(original => inside(original, root))) fail();
    const paths = {appData: path.join(root, 'appdata'), userData: path.join(root, 'userdata'),
        sessionData: path.join(root, 'session'), logs: path.join(root, 'logs'), temp: path.join(root, 'temp'),
        crashDumps: path.join(root, 'crashes')};
    for (const directory of Object.values(paths)) fs.mkdirSync(directory, {mode: 0o700});
    const local = path.join(root, 'localappdata'), mpv = path.join(root, 'mpv');
    fs.mkdirSync(local); fs.mkdirSync(mpv);
    for (const [name, directory] of Object.entries(paths)) app.setPath(name, directory);
    environment.APPDATA = paths.appData; environment.LOCALAPPDATA = local; environment.MPV_HOME = mpv;
    environment.TMP = paths.temp; environment.TEMP = paths.temp;
    const receipt = {schemaVersion: 1, sourceCommit, mode: 'isolated-page-cache-test', state: 'PREPARED',
        hostStarted: false, installed: false, profileReused: false, options: testOptions};
    fs.writeFileSync(path.join(root, 'page-cache-test-session.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    return Object.freeze({root, userDataPath: paths.userData, options: testOptions,
        rendererArgument: config.rendererArgument(testOptions), sourceCommit});
}
module.exports = {prepare, identity, SOURCE_FILES, FLOW_OVERLAYS};
