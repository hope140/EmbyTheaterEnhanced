'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');
const SOURCE_PATHS = ['electronapp/main.js', 'electronapp/plugins/libmpv.js',
    ...['api-bridge.cjs', 'identity.cjs', 'ipc.cjs', 'manual-server.js', 'renderer.js', 'service.cjs', 'startup.cjs',
        ...['anonymous-media', 'bridge', 'controller', 'diagnostics', 'electron-io', 'external-header-probe', 'external-media-check', 'media-check', 'policy', 'profile-store'].map(name => 'core/' + name + '.cjs')]
        .map(name => 'electronapp/enhanced/fn-connect/' + name),
    ...['apiclient', 'mit-apiclient', 'transport'].map(name => 'electronapp/www/modules/emby-apiclient/' + name + '.js')];
function fail() { throw new Error('FN_TRIAL_STARTUP_REJECTED'); }
const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function physical(value, directory = false) {
    const full = path.resolve(value); let part = path.parse(full).root;
    for (const segment of path.relative(part, full).split(path.sep).filter(Boolean)) {
        part = path.join(part, segment); const stat = fs.lstatSync(part);
        if (stat.isSymbolicLink() || normalized(fs.realpathSync.native(part)) !== normalized(part)) fail();
    }
    const stat = fs.lstatSync(full); if (directory ? !stat.isDirectory() : !stat.isFile()) fail(); return full;
}
function inside(parent, child) { const value = path.relative(normalized(parent), normalized(child)); return !value || value !== '..' && !value.startsWith('..' + path.sep) && !path.isAbsolute(value); }
const sha = file => createHash('sha256').update(fs.readFileSync(physical(file))).digest('hex').toUpperCase();
function identity(root, execPath) {
    const m = JSON.parse(fs.readFileSync(physical(path.join(root, 'runtime-provenance.json')), 'utf8')), scope = m.validatedProductScope;
    if (!/^[a-f0-9]{40}$/.test(m.sourceCommit || '') || scope?.sourceCommit !== m.sourceCommit || scope?.sourceSelection !== 'git-commit-blobs') fail();
    for (const file of SOURCE_PATHS) {
        const rows = scope.files?.filter(row => row.runtimePath === file);
        if (rows?.length !== 1 || rows[0].sourceSha256?.toUpperCase() !== sha(path.join(root, file)) || rows[0].runtimeSha256 !== rows[0].sourceSha256) fail();
    }
    const preload = m.preparedArtifacts?.filter(row => row.runtimePath === 'electronapp/preload.js');
    if (preload?.length !== 1 || preload[0].runtimeSha256 !== sha(path.join(root, 'electronapp/preload.js')) ||
        m.electronRuntime?.electronExeSha256 !== sha(execPath)) fail();
    if (m.sourceProvenance?.path !== 'source-provenance.json' || m.sourceProvenance.sha256 !== sha(path.join(root, 'source-provenance.json'))) fail();
    const source = JSON.parse(fs.readFileSync(path.join(root, 'source-provenance.json'), 'utf8'));
    if (source.sourceCommit !== m.sourceCommit) fail();
    for (const file of ['electronapp/www/startup/manualserver.js', 'electronapp/www/modules/emby-apiclient/connectionmanager.js']) {
        const rows = source.webSnapshot?.overlays?.filter(row => row.runtimePath === file);
        if (rows?.length !== 1 || rows[0].runtimeSha256 !== sha(path.join(root, file)) || rows[0].expectedOutputSha256 !== rows[0].runtimeSha256) fail();
    }
    return m.sourceCommit;
}
function prepareTrial({app, argv, execPath, runtimeRoot, platform = process.platform, environment = process.env, tempParent} = {}) {
    if (!argv.includes('--fn-connect-experiment')) return null; // No filesystem or profile side effects for ordinary startup.
    if (argv.filter(value => value === '--fn-connect-experiment').length !== 1 || platform !== 'win32' || app.isReady() ||
        argv.some(value => /^--(?:no-sandbox|disable-setuid-sandbox|disable-web-security|ignore-certificate-errors(?:-spki-list)?|remote-debugging-(?:port|pipe))(?:=|$)/i.test(value) || /^--ete-/.test(value))) fail();
    const runtime = physical(runtimeRoot, true);
    if (normalized(physical(execPath)) !== normalized(path.join(runtime, 'x64/electron/electron.exe')) || normalized(physical(argv[1], true)) !== normalized(path.join(runtime, 'electronapp'))) fail();
    const sourceCommit = identity(runtime, execPath);
    const parent = physical(fs.realpathSync.native(tempParent || os.tmpdir()), true);
    if ([runtime, app.getPath('userData'), app.getPath('appData')].some(value => inside(value, parent))) fail();
    const root = fs.mkdtempSync(path.join(parent, 'ETE-fn-trial-'));
    const directories = {appData: 'appdata', userData: 'userdata', sessionData: 'session', logs: 'logs', temp: 'temp', crashDumps: 'crashes'};
    for (const [name, suffix] of Object.entries(directories)) { const dir = path.join(root, suffix); fs.mkdirSync(dir); app.setPath(name, dir); }
    const local = path.join(root, 'localappdata'), mpv = path.join(root, 'mpv'); fs.mkdirSync(local); fs.mkdirSync(mpv);
    environment.APPDATA = app.getPath('appData'); environment.LOCALAPPDATA = local; environment.MPV_HOME = mpv;
    environment.TEMP = environment.TMP = app.getPath('temp');
    fs.writeFileSync(path.join(root, 'fn-trial.json'), JSON.stringify({schemaVersion: 1, sourceCommit,
        mode: 'isolated-fn-trial', profileReused: false, installed: false}) + '\n', {flag: 'wx', mode: 0o600});
    // Retain the owned trial directory after exit; do not claim deletion or move
    // its local login data to another profile. The user can review/forget it.
    return {root, sourceCommit, userDataPath: app.getPath('userData')};
}
function prepare(options) { try { return prepareTrial(options); } catch { fail(); } }
module.exports = {prepare, identity, SOURCE_PATHS};
