'use strict';
// Fixed production plugin/bootstrap code in an isolated harness; no GUI or server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const web = require('../tools/web-snapshot-input.cjs');
const overlays = require('../tools/prepare-web-overlays.cjs');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
const manifest = web.load(root);
const appBytes = fs.readFileSync(path.join(root, web.INPUT_ROOT, 'www/app.js'));
assert.equal(hash(appBytes).toLowerCase(), manifest.files.find(x => x.path === 'www/app.js').sha256);
const original = appBytes.toString('utf8');
const before = require('../tools/patch-search-ui.cjs').patchApp(
    require('../tools/patch-movie-browser.cjs').patchApp(
        require('../tools/patch-server-home.cjs').patchApp(
            require('../tools/patch-plugin-settings.cjs').patchApp(
                require('../tools/patch-external-player-registration.cjs').patchText(original).text))));
const output = overlays.retireCustomCssJs(before);

test('canonical app delta is exactly the optional registration line; other CSS and plugins remain', () => {
    assert.equal(hash(before), 'E3A883851255A196231266B5060D28E637A538DB3337CD12D47F060C6820CD5C');
    assert.equal(output, before.replace('                list.push("./modules/CustomCssJS.js"),\n', ''));
    assert.equal(Buffer.byteLength(before) - Buffer.byteLength(output), 55);
    assert.equal(hash(output), overlays.WEB_OVERLAY_CONTRACT.find(x => x.id === 'app-js').expectedOutputSha256);
    assert.ok(output.includes('self.ApiClient.getUrl("Branding/Css")'));
    assert.ok(output.includes('"css!modules/windowdrag.css"'));
    assert.equal(output.includes('CustomCssJS'), false);
    assert.equal(overlays.WEB_OVERLAY_CONTRACT.some(x => x.id === 'custom-css-js'), false);
});
test('retirement rejects missing, duplicate and unrecognized registrations', () => {
    assert.throws(() => overlays.retireCustomCssJs(output), /contract mismatch/);
    assert.throws(() => overlays.retireCustomCssJs(before + '\n                list.push("./modules/CustomCssJS.js"),\n'), /contract mismatch/);
    assert.throws(() => overlays.retireCustomCssJs(before.replace('list.push("./modules/CustomCssJS.js")', 'list.push("modules/CustomCssJS.js")')), /contract mismatch/);
    assert.throws(() => overlays.retireCustomCssJs(before + '\n// CustomCssJS unknown second entry'), /remains/);
});

async function mainPluginStage(endpointAvailable) {
    const requests = [], loaded = [], css = [], header = [];
    let ready = false, appHost;
    const context = vm.createContext({window: {}, self: {appMode: 'electron'}, navigator: {},
        document: {querySelector: selector => { assert.equal(selector, '.skinHeader'); return {insertAdjacentHTML: (_position, value) => header.push(value)}; }},
        console: {log() {}, warn() {}, error() {}}, startInfo: {plugins: ['plugins/libmpv', 'plugins/cec']},
        ApiClient: {getJSON: url => { requests.push(url); return endpointAvailable ? Promise.resolve({customcss: []}) : Promise.reject(new Error('synthetic unavailable plugin endpoint')); }},
        require: names => { css.push(...names); return Promise.resolve([]); },
        loadPlugin: async url => {
            loaded.push(url);
            if (/CustomCssJS/i.test(url)) await context.ApiClient.getJSON('CustomCssJS/Scripts');
        }
    });
    context.define = (_deps, factory) => { appHost = factory({}); };
    vm.runInContext(fs.readFileSync(path.join(root, 'src/electronapp/apphost.js'), 'utf8'), context);
    context.importFromPath = async name => name.endsWith('servicelocator.js') ? {appHost} : name.endsWith('browser.js') ? {electron: true} : {};
    const start = output.indexOf('          function () {\n            console.log("loadPlugins");');
    const endToken = '          }.bind(startInfo)';
    const end = output.indexOf(endToken, start);
    assert.ok(start >= 0 && end > start);
    const stage = vm.runInContext('(' + output.slice(start, end + endToken.length) + ')', context);
    await stage().then(() => { ready = true; });
    return {requests, loaded, css, header, ready};
}
for (const available of [false, true]) test('main plugin stage completes without requesting CustomCssJS when endpoint is ' + (available ? 'available' : 'unavailable'), async () => {
    const result = await mainPluginStage(available);
    assert.equal(result.ready, true);
    assert.deepEqual(result.requests, []);
    for (const url of ['./modules/htmlaudioplayer/plugin.js', './modules/htmlvideoplayer/plugin.js', './modules/photoplayer/plugin.js', './modules/confirmstillplaying/plugin.js', 'plugins/libmpv', 'plugins/cec']) assert.ok(result.loaded.includes(url), url);
    assert.deepEqual(result.css, ['css!modules/windowdrag.css']);
    assert.equal(result.header.length, 1);
    assert.equal(result.loaded.some(url => /CustomCssJS/i.test(url)), false);
});

test('Web assembly omits the approved module and logo while retaining immutable source identities', t => {
    fs.mkdirSync(path.join(root, 'dist'), {recursive: true});
    const runtime = fs.mkdtempSync(path.join(root, 'dist', 'custom-css-retirement-'));
    t.after(() => fs.rmSync(runtime, {recursive: true}));
    const report = web.assemble(root, runtime);
    assert.equal(report.fileCount, 720);
    assert.equal(report.runtimeFileCount, 718);
    assert.deepEqual(report.excludedFiles.map(x => x.path), ['www/modules/CustomCssJS.js','www/modules/themes/logo.png']);
    assert.equal(fs.existsSync(path.join(runtime, 'electronapp/www/modules/CustomCssJS.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'tools/patch-custom-css-js.cjs')), false);
    for (const entry of manifest.files) {
        if (['www/modules/CustomCssJS.js','www/modules/themes/logo.png'].includes(entry.path)) continue;
        const bytes = fs.readFileSync(path.join(runtime, 'electronapp', entry.path));
        assert.equal(bytes.length, entry.size);
        assert.equal(hash(bytes).toLowerCase(), entry.sha256, entry.path);
    }
});
