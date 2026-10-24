'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm');
const session = require('../src/electronapp/enhanced/page-cache/test-session');
const options = require('../src/electronapp/enhanced/page-cache/test-options');
const preload = require('../tools/prepare-preload.cjs');
const bootstrap = require('../src/electronapp/enhanced/bootstrap');
const enabled = ['--ete-page-cache-test=enabled', '--ete-page-cache-ttl-ms=100', '--ete-page-cache-max-entries=2', '--ete-page-cache-max-bytes=4096'];
const digest = value => crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
function fixture(t) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-trial-fixture-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const runtime = path.join(root, 'runtime'), temp = path.join(root, 'trials'), formal = path.join(root, 'formal');
    fs.mkdirSync(temp); fs.mkdirSync(formal);
    fs.mkdirSync(path.join(formal, 'EmbyTheaterEnhanced/config'), {recursive: true});
    fs.writeFileSync(path.join(formal, 'EmbyTheaterEnhanced/config/sentinel'), 'formal-canary');
    const write = (relative, value) => { const file = path.join(runtime, relative); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, value); };
    const files = session.SOURCE_FILES.map(file => {
        const value = fs.readFileSync(path.join(__dirname, '..', 'src', file)); write(file, value);
        return {runtimePath: file, sourceSha256: digest(value), runtimeSha256: digest(value)};
    });
    write('electronapp/preload.js', preload.buildPreparedPreload("window.appdata = process.env.APPDATA;\n"));
    write('x64/electron/electron.exe', 'synthetic-identity-only-not-executable');
    write('config/system.xml', 'test-seed');
    for (const [index, overlay] of session.FLOW_OVERLAYS.entries()) {
        const method = index === 0 ? 'patchItemsContainer' : 'patchVirtualScroller';
        const base = fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www', overlay.path.slice('electronapp/www/'.length)), 'utf8');
        const movie = require('../tools/patch-movie-browser.cjs')[method](base);
        const search = require('../tools/patch-search-ui.cjs').patchBrowseGuard(movie);
        write(overlay.path, require('../tools/patch-server-home.cjs')[method](search));
    }
    const manifest = {sourceCommit: 'a'.repeat(40), validatedProductScope: {sourceCommit: 'a'.repeat(40), sourceSelection: 'git-commit-blobs', files},
        preparedArtifacts: [{runtimePath: 'electronapp/preload.js', runtimeSha256: digest(fs.readFileSync(path.join(runtime, 'electronapp/preload.js')))}]};
    write('runtime-provenance.json', JSON.stringify(manifest));
    const paths = {appData: formal, userData: path.join(formal, 'Emby Theater Enhanced')}, sets = [];
    const app = {isReady: () => false, getPath: key => paths[key], setPath(key, value) { paths[key] = value; sets.push(key); }};
    const environment = {APPDATA: formal, LOCALAPPDATA: formal, MPV_HOME: formal};
    const settings = {app, argv: ['electron', path.join(runtime, 'electronapp'), ...enabled], execPath: path.join(runtime, 'x64/electron/electron.exe'),
        platform: 'win32', environment, runtimeRoot: runtime, tempParent: temp};
    return {root, runtime, temp, formal, paths, sets, environment, settings, manifest, write,
        prepare: () => session.prepare(settings)};
}
test('normal startup performs no trial path, app, environment or filesystem access', () => {
    assert.equal(session.prepare({argv: ['electron', 'app'], get app() { throw Error('must not read'); }}), null);
    assert.equal(options.install({}, ['electron', 'renderer']), false);
});
test('enabled and disabled comparison configurations require explicit TTL and capacities', () => {
    assert.deepEqual(options.parse(enabled), {enabled: true, ttlMs: 100, maxEntries: 2, maxBytes: 4096});
    assert.equal(options.parse(enabled.map(a => a.replace('=enabled', '=disabled'))).enabled, false);
});
test('Home flow is an independent explicit isolated-test option, absent by default', t => {
    assert.equal(Object.hasOwn(options.parse(enabled), 'homeFlow'), false);
    for (const homeFlow of ['baseline', 'retain', 'sections']) {
        const value = options.parse([...enabled.map(arg => arg.replace('=enabled', '=disabled')), '--ete-page-cache-home-flow=' + homeFlow]);
        assert.equal(value.enabled, false); assert.equal(value.homeFlow, homeFlow);
        const target = {}; options.install(target, [options.rendererArgument(value)]);
        assert.equal(target.__etePageCacheTestOptions.homeFlow, homeFlow);
        assert.equal(Object.isFrozen(target.__etePageCacheTestOptions), true);
    }
    for (const value of ['enabled', 'all', 'false']) assert.throws(() => options.parse([...enabled, '--ete-page-cache-home-flow=' + value]));
    assert.throws(() => options.parse([...enabled, '--ete-page-cache-home-flow=retain', '--ete-page-cache-home-flow=sections']));
    const f = fixture(t); f.settings.argv.push('--ete-page-cache-home-flow=sections');
    assert.equal(f.prepare().options.homeFlow, 'sections');
});
test('Home flow requires both exact composed native commit guards before allocating a profile', t => {
    const f = fixture(t), contract = require('../tools/prepare-web-overlays.cjs').WEB_OVERLAY_CONTRACT;
    for (const overlay of session.FLOW_OVERLAYS) {
        const row = contract.find(item => item.runtimePath === overlay.path);
        assert.equal(row.expectedOutputSha256, overlay.sha256);
        assert.ok(row.generatorPaths.includes('tools/patch-server-home.cjs'));
        assert.equal(digest(fs.readFileSync(path.join(f.runtime, overlay.path))), overlay.sha256);
    }
    f.settings.argv.push('--ete-page-cache-home-flow=sections'); f.write(session.FLOW_OVERLAYS[1].path, 'old or tampered native component');
    assert.throws(f.prepare); assert.deepEqual(fs.readdirSync(f.temp), []); assert.deepEqual(f.sets, []);
});
const invalidArgs = [enabled.slice(0, -1), [...enabled, enabled[0]], [...enabled, '--user-data-dir=/existing'],
    [...enabled, '--no-sandbox'], [...enabled, '--remote-debugging-port=9222'], ['--ete-page-cache-renderer={}'],
    enabled.map(a => a.replace('=enabled', '=true')), enabled.map(a => a.replace('ttl-ms=100', 'ttl-ms=0')),
    enabled.map(a => a.replace('ttl-ms=100', 'ttl-ms=300001')), enabled.map(a => a.replace('ttl-ms=100', 'ttl-ms=1e2')),
    enabled.map(a => a.replace('max-entries=2', 'max-entries=1025')), enabled.map(a => a.replace('max-bytes=4096', 'max-bytes=33554433')),
    enabled.map(a => a.replace('max-bytes=4096', 'max-bytes=NaN'))];
for (const [index, args] of invalidArgs.entries()) test('configuration rejection happens before any test/profile writes: ' + index, t => {
    const f = fixture(t); f.settings.argv = ['electron', path.join(f.runtime, 'electronapp'), ...args];
    assert.throws(f.prepare); assert.deepEqual(fs.readdirSync(f.temp), []); assert.deepEqual(f.sets, []);
    assert.equal(f.environment.APPDATA, f.formal);
});
test('fresh isolated paths are assigned before real bootstrap; formal config sentinel remains byte-identical', t => {
    const f = fixture(t), trial = f.prepare();
    const result = bootstrap.bootstrap({appDataPath: f.paths.appData, runtimeRoot: f.runtime});
    assert.ok(result.profileRoot.startsWith(trial.root + path.sep));
    assert.equal(fs.readFileSync(result.systemConfig, 'utf8'), 'test-seed');
    for (const name of ['appData', 'userData', 'sessionData', 'logs', 'temp', 'crashDumps']) assert.ok(f.paths[name].startsWith(trial.root + path.sep));
    for (const name of ['APPDATA', 'LOCALAPPDATA', 'MPV_HOME', 'TMP', 'TEMP']) assert.ok(f.environment[name].startsWith(trial.root + path.sep));
    assert.equal(fs.readFileSync(path.join(f.formal, 'EmbyTheaterEnhanced/config/sentinel'), 'utf8'), 'formal-canary');
    assert.deepEqual(fs.readdirSync(path.join(f.formal, 'EmbyTheaterEnhanced/config')), ['sentinel']);
    const receipt = JSON.parse(fs.readFileSync(path.join(trial.root, 'page-cache-test-session.json')));
    assert.equal(receipt.state, 'PREPARED'); assert.equal(receipt.hostStarted, false); assert.equal(receipt.profileReused, false);
    assert.equal(JSON.stringify(receipt).includes('formal-canary'), false);
});
test('each launch creates a distinct profile and does not import prior account/config data', t => {
    const f = fixture(t), a = f.prepare();
    fs.writeFileSync(path.join(a.root, 'userdata', 'synthetic-account'), 'old-account-canary');
    const b = f.prepare(); assert.notEqual(a.root, b.root);
    assert.deepEqual(fs.readdirSync(path.join(b.root, 'userdata')), []);
    assert.deepEqual(fs.readdirSync(path.join(b.root, 'appdata')), []);
});
for (const mutation of ['ready', 'platform', 'exec', 'appdir', 'provenance', 'source', 'preload', 'temp-in-runtime', 'temp-in-formal']) test('unsafe startup/identity refused before allocation: ' + mutation, t => {
    const f = fixture(t);
    if (mutation === 'ready') f.settings.app.isReady = () => true;
    if (mutation === 'platform') f.settings.platform = 'linux';
    if (mutation === 'exec') f.settings.execPath = process.execPath;
    if (mutation === 'appdir') f.settings.argv[1] = f.formal;
    if (mutation === 'provenance') f.write('runtime-provenance.json', '{}');
    if (mutation === 'source') f.write('electronapp/enhanced/home/home-tab.js', 'tampered');
    if (mutation === 'preload') f.write('electronapp/preload.js', 'tampered');
    if (mutation === 'temp-in-runtime') f.settings.tempParent = f.runtime;
    if (mutation === 'temp-in-formal') f.settings.tempParent = path.join(f.formal, 'EmbyTheaterEnhanced');
    assert.throws(f.prepare); assert.deepEqual(f.sets, []);
    assert.deepEqual(fs.readdirSync(f.temp), []);
});
test('physical-path policy rejects redirected input and profile parent', t => {
    const f = fixture(t), alias = path.join(f.root, 'alias');
    try { fs.symlinkSync(f.temp, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if (process.platform !== 'win32') throw error; assert.fail('Windows junction setup failed: ' + error.code); }
    f.settings.tempParent = alias; assert.throws(f.prepare); assert.deepEqual(f.sets, []);
});
test('prepared preload consumes the finite test arguments; renderer options are immutable and credential fields rejected', t => {
    const f = fixture(t), trial = f.prepare(), window = {};
    const block = preload.DIAGNOSTICS_BLOCK;
    vm.runInNewContext(block, {window, process: {env: {}, argv: ['renderer', trial.rendererArgument]}, ipcRenderer: {send() {}},
        require(name) {
            if (name === './enhanced/page-cache/test-options') return options;
            if (name === './enhanced/diagnostics') return {hashPath() {}};
            if (name === './enhanced/renderer-errors') return {install() {}};
            if (name === './enhanced/windows-media-renderer') return {};
            throw Error('unexpected module');
        }});
    assert.equal(window.__etePageCacheTestOptions.ttlMs, 100); assert.ok(Object.isFrozen(window.__etePageCacheTestOptions));
    assert.throws(() => { window.__etePageCacheTestOptions.enabled = false; }, TypeError);
    assert.throws(() => options.install({}, ['--ete-page-cache-renderer={"enabled":true,"ttlMs":100,"maxEntries":2,"maxBytes":4096,"AccessToken":"synthetic-canary"}']));
    assert.throws(() => options.install({}, [trial.rendererArgument, trial.rendererArgument]));
});
test('actual main startup snippet isolates before bootstrap and late positional parsing cannot override trial userData', t => {
    const f = fixture(t), source = fs.readFileSync(path.join(__dirname, '../src/electronapp/main.js'), 'utf8');
    const start = source.indexOf('    var pageCacheTest = '), end = source.indexOf('    var persistentDeviceId = ');
    const context = {require(name) { assert.equal(name, './enhanced/page-cache/test-session'); return session; },
        app: f.settings.app, process: {argv: f.settings.argv, execPath: f.settings.execPath, platform: 'win32', env: f.environment},
        path, __dirname: path.join(f.runtime, 'electronapp'), appBootstrap: bootstrap};
    // The real startup uses os.tmpdir; keep this fixture allocation local and record cleanup.
    const wrapper = {prepare: value => session.prepare({...value, tempParent: f.temp})};
    context.require = name => { assert.equal(name, './enhanced/page-cache/test-session'); return wrapper; };
    vm.runInNewContext(source.slice(start, end), context);
    assert.ok(context.appBootstrapState.profileRoot.startsWith(context.pageCacheTest.root + path.sep));
    const parseStart = source.indexOf('    var userDataPath = pageCacheTest ?'), parseEnd = source.indexOf('    var strmConfigStoreModule = ', parseStart);
    context.commandLineOptions = {userDataPath: f.formal};
    vm.runInNewContext(source.slice(parseStart, parseEnd), context);
    assert.equal(f.paths.userData, context.pageCacheTest.userDataPath);
    assert.match(source, /if \(pageCacheTest\) windowOptions\.webPreferences\.additionalArguments = \[pageCacheTest\.rendererArgument\]/);
});

for (const relative of ['enhanced/cache-management-ipc.js', 'plugins/mpvplayer/cache-settings.js', 'plugins/mpvplayer/about.js', 'plugins/mpvplayer/about.html', 'enhanced/home/home-flow.css']) test('management startup source binding rejects tampering before profile allocation: ' + relative, t => {
    const f = fixture(t); f.write('electronapp/' + relative, 'tampered');
    assert.throws(f.prepare); assert.deepEqual(f.sets, []); assert.deepEqual(fs.readdirSync(f.temp), []);
});
