'use strict';
// Fixed Web/plugin code in an isolated AMD/DOM harness. No Electron process,
// user storage, real server, CSS rendering or GUI acceptance is involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const patcher = require('../tools/patch-custom-css-js.cjs');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'vendor/web-snapshot-manifest.json')));
function fixed(name) {
    const entry = manifest.files.find(item => item.path === 'www/' + name);
    assert.ok(entry, name);
    const bytes = fs.readFileSync(path.join(root, manifest.inputRoot, entry.path));
    assert.equal(bytes.length, entry.size);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    return bytes.toString('utf8');
}
const appBase = fixed('app.js');
const app = require('../tools/patch-search-ui.cjs').patchApp(
    require('../tools/patch-movie-browser.cjs').patchApp(
        require('../tools/patch-server-home.cjs').patchApp(
            require('../tools/patch-plugin-settings.cjs').patchApp(
                require('../tools/patch-external-player-registration.cjs').patchText(appBase).text))));
const appContract = require('../tools/prepare-web-overlays.cjs').WEB_OVERLAY_CONTRACT.find(item => item.id === 'app-js');
assert.equal(crypto.createHash('sha256').update(app).digest('hex').toUpperCase(), appContract.expectedOutputSha256);
const eventsSource = fixed('modules/emby-apiclient/events.js');
const managerSource = fixed('modules/common/pluginmanager.js');
const customSource = patcher.patchText(fixed('modules/CustomCssJS.js'));
const loadStart = app.indexOf('  function loadPlugin(url) {');
const loadEnd = app.indexOf('  function returnFalse()', loadStart);
assert.ok(loadStart >= 0 && loadEnd > loadStart);

async function desktop(config, values = {}, reject = false) {
    const styles = [], requests = [], toasts = [];
    const storage = new Map(Object.entries(values));
    const window = {platform: 'win32', location: {href: 'ete://app/index.html'}};
    const context = vm.createContext({
        window, console: {log() {}, warn() {}, error() {}},
        document: {createElement: type => ({type}), head: {appendChild: style => styles.push(style.innerHTML)}},
        localStorage: {getItem: name => storage.get(name) ?? null, setItem: (name, value) => storage.set(name, value)},
        ApiClient: {serverId: () => 'server-a', getUrl: name => name,
            getJSON: url => { requests.push(url); return reject ? Promise.reject(new Error('synthetic missing endpoint')) : Promise.resolve(config); }},
        require: names => { assert.deepEqual(Array.from(names), ['appRouter']); return Promise.resolve([{baseUrl: () => 'ete://app'}]); }
    });
    let events, manager, factory;
    context.define = (_deps, fn) => { const exports = {}; fn(exports); events = exports.default; };
    vm.runInContext(eventsSource, context);
    const connectionManager = {};
    context.define = (_deps, fn) => {
        const exports = {};
        fn(exports, {default: events}, {default: connectionManager},
            {appHost: {supports: feature => feature === 'multiserver'}},
            {default: {loadStrings: () => Promise.resolve()}});
        manager = exports.default;
    };
    vm.runInContext(managerSource, context);
    context.define = (_deps, fn) => { factory = fn(events, connectionManager, message => toasts.push(message)); };
    vm.runInContext(customSource, context);
    context.importFromPath = async () => manager;
    context.getDynamicImport = url => { assert.equal(url, './modules/CustomCssJS.js'); return async () => factory; };
    vm.runInContext(app.slice(loadStart, loadEnd), context);
    assert.equal(window.MainActivity, undefined);
    await context.loadPlugin('./modules/CustomCssJS.js');
    assert.equal(manager.plugins().length, 1);
    assert.equal(requests.length, 0, 'plugin construction waits for the sign-in event');
    events.trigger(connectionManager, 'localusersignedin', ['server-a', 'user-a']);
    await Promise.resolve(); await Promise.resolve();
    return {styles, requests, storage, window, toasts};
}

test('fixed app loader and plugin manager reach server forced CSS without Android/MainActivity', async () => {
    const result = await desktop({customcss: [{name: 'forced', state: 'forced_on', content: '.desktop-canary { color: red; }'}], customjs: []});
    assert.deepEqual(result.requests, ['CustomCssJS/Scripts']);
    assert.deepEqual(result.styles, ['.desktop-canary { color: red; }']);
    assert.equal(result.window.isCustomCssJSLoad, true);
});
test('ordinary server CSS needs a saved client selection; no selection means inactive', async () => {
    const config = {customcss: [{name: 'optional', state: 'on', content: '.selected-canary {}'}], customjs: []};
    assert.deepEqual((await desktop(config)).styles, []);
    // The actual key is server-scoped; use the literal hyphenated server id.
    const selected = await desktop(config, {'customcssServerConfig_server-a': '["optional"]'});
    assert.deepEqual(selected.styles, ['.selected-canary {}']);
});
test('saved local CSS also requires a successful server endpoint response and preserves storage on failure', async () => {
    const values = {customcssLocal: '[{"name":"local","content":".local-canary {}"}]', customcssLocalConfig: '["local"]'};
    const config = {customcss: [], customjs: []};
    assert.deepEqual((await desktop(config, values)).styles, ['.local-canary {}']);
    const unavailable = await desktop(config, values, true);
    assert.deepEqual(unavailable.styles, []);
    assert.equal(unavailable.storage.get('customcssLocal'), values.customcssLocal);
    assert.notEqual(unavailable.window.isCustomCssJSLoad, true);
});
test('the desktop-reachable server path retains the disabled-JavaScript boundary', async () => {
    const result = await desktop({customcss: [{name: 'css', state: 'forced_on', content: '.css-still-works {}'}],
        customjs: [{name: 'js', state: 'forced_on', content: 'window.executedCanary = true;'}]});
    assert.deepEqual(result.styles, ['.css-still-works {}']);
    assert.equal(result.window.executedCanary, undefined);
    assert.equal(result.toasts.length, 1);
});
