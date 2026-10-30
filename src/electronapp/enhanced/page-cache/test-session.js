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
const SOURCE_FILES = Object.freeze(['electronapp/main.js', 'electronapp/apphost.js',
    ...['response-contract', 'source-probe', 'source-session', 'directory-preferences', 'transfer', 'publication', 'deletion', 'file-state', 'task-store', 'manager', 'ipc', 'renderer']
        .map(name => 'electronapp/enhanced/advance-download/' + name + '.js'),
    'electronapp/enhanced/advance-download/windows-publish.cs', 'electronapp/enhanced/advance-download/windows-delete.cs',
    'electronapp/plugins/mpvplayer/downloads.css', 'electronapp/plugins/mpvplayer/downloads.html', 'electronapp/plugins/mpvplayer/downloads.js', 'electronapp/enhanced/home/home-tab.js',
    'electronapp/enhanced/home/server-sections.js', 'electronapp/enhanced/page-cache/page-data-cache.js',
    'electronapp/enhanced/page-cache/home-layout-cache.js', 'electronapp/enhanced/page-cache/test-options.js',
    'electronapp/enhanced/page-cache/test-session.js', 'electronapp/enhanced/cache-management-ipc.js',
    'electronapp/plugins/mpvplayer/cache-settings.js', 'electronapp/plugins/mpvplayer/about.js', 'electronapp/plugins/mpvplayer/about.html', 'electronapp/enhanced/home/home-flow.css', 'electronapp/plugins/libmpv.js',
    'electronapp/plugins/mpvplayer/cache-management.js', 'electronapp/plugins/mpvplayer/cache-management.html', 'electronapp/plugins/mpvplayer/cache-management.css', 'electronapp/enhanced/detail-cache/store.js', 'electronapp/enhanced/detail-cache/page.js', 'electronapp/enhanced/detail-cache/page.css', 'electronapp/enhanced/detail-cache/close-owner.js']);
const FLOW_OVERLAYS = Object.freeze([
    Object.freeze({path: 'electronapp/www/modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js', sha256: '4F3633D1B23CA2B15B6ACDF6AD013B0F704733D8BB17B37F4527EF310D52DFDA'}),
    Object.freeze({path: 'electronapp/www/modules/virtual-scroller/virtual-scroller.js', sha256: '4F7F014519217712350B156F86C710654CE1D48F39DA98B2811C8314BAB63DEC'}),
    Object.freeze({path: 'electronapp/www/home/home.js', sha256: 'BA337B1E152FF26787B2D612156A76263A9C41E2149F0504D9D01A7E575E8D5F'}),
    Object.freeze({path: 'electronapp/www/home/hometab.js', sha256: 'EE30D819DE898154D8D6727CE31FE86418F79761368FA4B7075F071DF56635CB'}),
    Object.freeze({path: 'electronapp/www/modules/viewmanager/viewmanager.js', sha256: '4F35A1F33E3540BD95CAAEAECF1B361A077E2A6FC0E566B655E2B603E35E6F83'}),
    Object.freeze({path: 'electronapp/www/modules/approuter.js', sha256: '364CF6818BA4D92D237943FFD1D59FDB8B533E944BE7E4AB06588F203A1E66C5'})
]);
const DETAIL_OVERLAYS = Object.freeze([
    Object.freeze({path: 'electronapp/www/app.js', sha256: '02AC6C7D2206F5BD78F1709A1D1160AE490B2C71DE2C33E98DA40F2ADAF26BF2'}),
    Object.freeze({path: 'electronapp/www/item/item.js', sha256: '9336D92E4B2A7A9150F296E181651E3DC6EA8104C715333E52933FC2913FDA69'})
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
    for (const overlay of DETAIL_OVERLAYS) if (digest(overlay.path) !== overlay.sha256) fail();
    for (const overlay of FLOW_OVERLAYS) if (digest(overlay.path) !== overlay.sha256) fail();
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
module.exports = {prepare, identity, SOURCE_FILES, FLOW_OVERLAYS, DETAIL_OVERLAYS};
