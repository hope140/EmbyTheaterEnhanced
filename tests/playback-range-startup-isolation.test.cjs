'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(process.env.ETE_RANGE_MAIN_SOURCE || path.join(root, 'src/electronapp/main.js'), 'utf8');
const launchPath = path.resolve(__dirname, '../src/electronapp/enhanced/playback-range-launch.js');
let launch = require(launchPath);
if (process.env.ETE_RANGE_LAUNCH_SOURCE) {
    const module = {exports: {}};
    vm.runInNewContext(fs.readFileSync(process.env.ETE_RANGE_LAUNCH_SOURCE, 'utf8'), {module, exports: module.exports, require: createRequire(launchPath)});
    launch = module.exports;
}
const bootstrap = require('../src/electronapp/enhanced/bootstrap');
const identity = require('../src/electronapp/device-identity');
const fixedId = '00000000-0000-4000-8000-000000000001';
function snapshot(directory) {
    const rows = [];
    function visit(dir) {for (const e of fs.readdirSync(dir, {withFileTypes: true})) {const file = path.join(dir, e.name); rows.push([path.relative(directory, file), e.isDirectory() ? 'dir' : fs.readFileSync(file).toString('hex')]); if (e.isDirectory()) visit(file);}}
    visit(directory); return rows;
}
function fixture(t) {
    const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete range startup-')));
    t.after(() => fs.rmSync(base, {recursive: true, force: true}));
    const profile = path.join(base, 'trial'), config = path.join(base, 'policy.json'), ordinary = path.join(base, 'ordinary');
    const appData = path.join(ordinary, 'appdata'), userData = path.join(ordinary, 'electron'), sessionData = path.join(ordinary, 'session'), hostData = path.join(ordinary, 'host-data');
    const runtime = path.join(base, 'runtime'), appDirectory = path.join(runtime, 'electronapp');
    for (const dir of [profile, appData, userData, sessionData, hostData, appDirectory, path.join(runtime, 'config')]) fs.mkdirSync(dir, {recursive: true});
    for (const dir of [appData, userData, sessionData, hostData]) fs.writeFileSync(path.join(dir, 'ordinary-canary.txt'), 'synthetic-existing-state\n');
    fs.writeFileSync(path.join(runtime, 'config/system.xml'), '<configuration />\n');
    const policy = {maxBytes: 1048576, minFreeBytes: 0, bytesPerSecond: 100000, timeoutMs: 1000};
    fs.writeFileSync(config, JSON.stringify(policy));
    return {base, profile, config, ordinary, appData, userData, sessionData, hostData, runtime, appDirectory, policy,
        flags: ['--ete-range-cache-trial', '--ete-range-cache-config=' + config, '--ete-range-cache-profile=' + profile],
        // Matches ElectronApp.cs: electron.exe, app directory, dataPath, old mpv executable.
        argv: [path.join(runtime, 'electron.exe'), appDirectory], legacy: [hostData, path.join(runtime, 'mpv.exe')]};
}
async function runMain(f, argv, platform = 'win32', failSetPath) {
    const app = new EventEmitter(), paths = {appData: f.appData, userData: f.userData, sessionData: f.sessionData};
    const calls = {setPath: [], bootstrap: [], identity: [], strm: [], reads: [], kernel: [], range: [], modules: []};
    const env = {APPDATA: f.appData, LOCALAPPDATA: f.appData, MPV_HOME: path.join(f.ordinary, 'mpv')};
    app.setName = () => {}; app.getVersion = () => 'fixture'; app.quit = () => {};
    app.commandLine = {appendSwitch() {}};
    app.getPath = name => paths[name];
    app.setPath = (name, value) => {
        calls.setPath.push({name, value});
        if (name === failSetPath) throw Error('fixture-setPath-failure');
        if (!path.isAbsolute(value) && !path.win32.isAbsolute(value)) throw Error('fixture-electron-path-not-absolute');
        paths[name] = value;
    };
    const ipcMain = new EventEmitter(); ipcMain.handle = function () {}; ipcMain.removeHandler = function () {};
    const electron = {app, ipcMain, protocol: {registerSchemesAsPrivileged() {}},
        BrowserWindow: class {constructor() {throw Error('fixture-must-stop-before-window');}}, nativeImage: {createFromPath: () => ({})}};
    const noopRegister = {register: () => () => {}};
    const mockFs = new Proxy(fs, {get(target, key) {
        if (key === 'readFileSync') return (file, ...args) => {
            calls.reads.push(file);
            // Never touch a literal Windows profile path while running a Linux fixture.
            if (!path.isAbsolute(file) || path.relative(f.base, file).startsWith('..')) {
                const error = Error('fixture-file-not-found'); error.code = 'ENOENT'; throw error;
            }
            return target.readFileSync(file, ...args);
        };
        return target[key];
    }});
    const modules = {
        electron, path, fs: mockFs,
        'is-windows': () => platform === 'win32', 'is-linux': () => platform === 'linux', 'detect-rpi': () => false,
        './package.json': {name: 'synthetic', productName: 'Synthetic'}, './product-identity': require('../src/electronapp/product-identity'),
        './apphost-command': {}, './enhanced/external-url': {}, './enhanced/playback-range-launch': launch,
        './enhanced/bootstrap': {bootstrap(options) {calls.bootstrap.push(options); return bootstrap.bootstrap(options);}},
        './device-identity': {getOrCreateDeviceId(file) {calls.identity.push(file); return identity.getOrCreateDeviceId(file, {crypto: {randomUUID: () => fixedId, randomBytes: n => Buffer.alloc(n)}});}},
        './enhanced/diagnostics': {createLogger: () => () => {}, hashIdentifier: () => 'synthetic-hash', configEvidence: () => ({})},
        './enhanced/maintenance-ipc': noopRegister, './enhanced/renderer-boundary': {isTrusted: () => false}, './enhanced/windows-media-controls': {},
        './enhanced/bundled-versions': {createBundledVersionReader: () => async () => ({})},
        './enhanced/playback-power-owner': {createOwner: () => ({shutdown() {}})},
        './enhanced/strm-config-store': {createStore(options) {
            calls.strm.push(options);
            if (path.isAbsolute(options.rootDir) && !path.relative(f.base, options.rootDir).startsWith('..')) {
                fs.mkdirSync(options.rootDir, {recursive: true}); fs.writeFileSync(path.join(options.rootDir, 'synthetic-settings.json'), '{}\n');
            }
            return {getRuntimeConfig: () => ({})};
        }},
        './enhanced/playback-range-user-settings': {...require('../src/electronapp/enhanced/playback-range-user-settings'), createStore(options) {
            const store = require('../src/electronapp/enhanced/playback-range-user-settings').createStore(options);
            calls.range.push({options, config: store.get()});
            return store;
        }},
        './enhanced/cd2-service': {createService: () => ({})}, './native-helper/service': {resolveMode: () => 'native-helper'},
        './enhanced/mpv-kernel-store': {}, './enhanced/mpv-kernel-ipc': {},
        './enhanced/mpv-kernel-bootstrap': {async prepare(options) {calls.kernel.push(options.profileRoot); throw Error('fixture-stop-before-native');}},
        './enhanced/cd2-ipc': noopRegister, './enhanced/strm-config-ipc': noopRegister, './enhanced/diagnostics-ipc': noopRegister
    };
    const context = {__dirname: f.appDirectory, process: {argv, platform, arch: 'x64', env, execPath: argv[0], versions: {node: 'fixture'}},
        require(name) {calls.modules.push(name); if (!Object.hasOwn(modules, name)) throw Error('fixture-unknown-module:' + name); return modules[name];}, console: {log() {}}, setTimeout, clearTimeout, Promise, Buffer};
    let error;
    try {
        // Entire production main executes, including the later legacy parser and service setup.
        vm.runInNewContext(source, context, {filename: 'main.js#startup-order', timeout: 2000});
        app.emit('ready'); // Window-state path and kernel-profile owner are checked too.
        for (let i = 0; i < 20; i++) await Promise.resolve();
    } catch (e) {error = e;}
    return {app, paths, env, calls, error};
}
for (const order of ['flags-first', 'host-first', 'flags-between-positionals', 'windows-literal-host']) test('full main keeps valid trial isolated: ' + order, async t => {
    const f = fixture(t), before = snapshot(f.ordinary);
    let args;
    if (order === 'flags-first') args = f.flags;
    else if (order === 'host-first') args = [...f.legacy, ...f.flags];
    else if (order === 'flags-between-positionals') args = [f.legacy[0], ...f.flags, f.legacy[1]];
    else args = ['C:\\synthetic-formal-data\\electron', 'C:\\synthetic-runtime\\mpv.exe', ...f.flags];
    const result = await runMain(f, [...f.argv, ...args]);
    assert.equal(result.error, undefined);
    assert.equal(result.paths.userData, path.join(f.profile, 'electron'));
    assert.equal(result.paths.appData, f.profile); assert.equal(result.paths.sessionData, path.join(f.profile, 'electron'));
    assert(result.calls.setPath.every(row => row.value.startsWith(f.profile + path.sep) || row.value === f.profile));
    assert.equal(result.calls.bootstrap[0].appDataPath, f.profile);
    assert.equal(result.calls.identity[0], path.join(f.profile, 'EmbyTheaterEnhanced/config/device-identity.json'));
    assert.equal(result.calls.strm[0].rootDir, path.join(f.profile, 'electron/config'));
    assert(result.calls.reads.includes(path.join(f.profile, 'electron/windowstate.json')));
    assert.deepEqual(result.calls.kernel, [path.join(f.profile, 'EmbyTheaterEnhanced')]);
    assert.equal(result.env.APPDATA, f.profile); assert.equal(result.env.LOCALAPPDATA, path.join(f.profile, 'local')); assert.equal(result.env.MPV_HOME, path.join(f.profile, 'mpv'));
    assert.deepEqual(snapshot(f.ordinary), before, 'ordinary fixture data has no new or modified file');
});
const invalid = {
    'missing-config-flag': f => f.flags.filter(v => !v.startsWith('--ete-range-cache-config=')),
    'missing-profile-flag': f => f.flags.filter(v => !v.startsWith('--ete-range-cache-profile=')),
    'missing-config-file': f => f.flags.map(v => v.startsWith('--ete-range-cache-config=') ? v + '-absent' : v),
    'invalid-limits': f => {fs.writeFileSync(f.config, '{}'); return f.flags;},
    'invalid-json': f => {fs.writeFileSync(f.config, '{'); return f.flags;},
    'missing-profile-directory': f => f.flags.map(v => v.startsWith('--ete-range-cache-profile=') ? v + '-absent' : v),
    'wrong-owner': f => {fs.writeFileSync(path.join(f.profile, 'ete-range-cache-trial-owner'), 'different-owner'); return f.flags;},
    'ordinary-profile-not-a-trial': f => f.flags.map(v => v.startsWith('--ete-range-cache-profile=') ? '--ete-range-cache-profile=' + f.userData : v),
    'partial-trial-options-without-enable': f => f.flags.slice(1),
    'invalid-choice': f => {fs.writeFileSync(f.config, JSON.stringify({...f.policy, progressPercent: 30})); return f.flags;},
    'unsupported-case-trial-options': f => f.flags.map(v => v.replace('--ete-range-cache-', '--ETE-RANGE-CACHE-')),
    'duplicate-enable': f => [...f.flags, '--ete-range-cache-trial']
};
for (const [name, change] of Object.entries(invalid)) for (const hostFirst of [false, true]) test('explicit rejected trial stops before any ordinary profile work: ' + name + '/host-first=' + hostFirst, async t => {
    const f = fixture(t), before = snapshot(f.ordinary), flags = change(f);
    const result = await runMain(f, [...f.argv, ...(hostFirst ? [...f.legacy, ...flags] : [...flags, ...f.legacy])]);
    assert.equal(result.error && result.error.message, 'range-cache-trial-launch-invalid');
    assert.equal(result.calls.bootstrap.length, 0); assert.equal(result.calls.identity.length, 0); assert.equal(result.calls.strm.length, 0); assert.equal(result.calls.kernel.length, 0);
    assert.equal(result.app.listenerCount('ready'), 0); assert.equal(result.calls.setPath.length, 0);
    assert.deepEqual(snapshot(f.ordinary), before);
});
for (const platform of ['win32', 'linux']) for (const hostArgs of [false, true]) test('no trial retains ordinary startup semantics: ' + platform + '/host=' + hostArgs, async t => {
    const f = fixture(t), result = await runMain(f, [...f.argv, ...(hostArgs ? f.legacy : [])], platform);
    const expectedUserData = platform === 'win32' && hostArgs ? f.hostData : f.userData;
    assert.equal(result.error, undefined); assert.equal(result.paths.userData, expectedUserData); assert.equal(result.paths.appData, f.appData);
    assert.equal(result.calls.setPath.length, platform === 'win32' && hostArgs ? 1 : 0);
    assert.equal(result.calls.bootstrap[0].appDataPath, f.appData); assert.equal(result.calls.strm[0].rootDir, path.join(expectedUserData, 'config'));
    assert.equal(result.calls.kernel[0], path.join(f.appData, 'EmbyTheaterEnhanced'));
});
test('failure while activating an isolated Electron path never falls through to bootstrap', async t => {
    const f = fixture(t), before = snapshot(f.ordinary);
    const result = await runMain(f, [...f.argv, ...f.legacy, ...f.flags], 'win32', 'sessionData');
    assert.equal(result.error && result.error.message, 'fixture-setPath-failure'); assert.equal(result.calls.bootstrap.length, 0); assert.deepEqual(snapshot(f.ordinary), before);
});

test('ordinary main retains confirmed choices but cannot activate pending capacity or redirect the profile', async t => {
    const f = fixture(t), settings = require('../src/electronapp/enhanced/playback-range-user-settings');
    settings.createStore({profileRoot: f.userData}).save({schema: 1, enabled: false, progressPercent: 80, preloadMB: 500});
    const result = await runMain(f, f.argv, 'win32'); assert.equal(result.error, undefined);
    assert.equal(result.calls.range.length, 1); const config = result.calls.range[0].config;
    assert.equal(config.enabled, false); assert.equal(config.progressPercent, 80); assert.equal(config.preloadMB, 500);
    assert.deepEqual(result.calls.setPath, []); assert(!fs.existsSync(path.join(f.userData, 'playback-ranges')));
});
