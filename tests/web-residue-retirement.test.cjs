'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const web = require('../tools/web-snapshot-input.cjs'), overlays = require('../tools/prepare-web-overlays.cjs');
const root = path.resolve(__dirname, '..');
const removed = ['www/components/directorybrowser/directorybrowser.css', 'www/modules/emby-apiclient/appstorage-cache.js', 'www/serviceworker-app.js'];
const app = fs.readFileSync(path.join(root, web.WEB_ROOT, 'app.js'), 'utf8');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('directory picker keeps its active shared styles and desktop storage chooses localStorage or memory', async () => {
    let dependencies;
    const directory = fs.readFileSync(path.join(root,web.WEB_ROOT,'components/directorybrowser/directorybrowser.js'),'utf8');
    vm.runInNewContext(directory, {define: deps => { dependencies = Array.from(deps); }});
    assert.ok(dependencies.includes('listViewStyle')); assert.ok(dependencies.includes('formDialogStyle'));
    assert.equal(dependencies.some(name => name.includes('directorybrowser.css')), false);
    assert.doesNotMatch(directory, /ulDirectoryPickerList|lblDirectoryPickerPath/);
    const start = app.indexOf('  function loadAppStorage()'), end = app.indexOf('  function loadWebFullscreenManager(', start);
    assert.ok(start >= 0 && end > start);
    for (const mode of ['localstorage', 'memory', 'winjs']) {
        const calls = [], storage = {init: () => Promise.resolve()}, sandbox = {
            self: {appMode: mode === 'winjs' ? 'winjs' : 'electron'},
            localStorage: {setItem() { if (mode === 'memory') throw Error('fixture unavailable'); }, removeItem() {}},
            getDynamicImport: name => () => { calls.push(name); return Promise.resolve(storage); },
            require: names => { calls.push(...names); return Promise.resolve(storage); },
            returnFirstDependencyDefault: value => value, Promise
        };
        vm.runInNewContext(app.slice(start,end), sandbox);
        assert.equal(await sandbox.loadAppStorage(), storage);
        assert.deepEqual(calls, [mode === 'winjs' ? 'native/windows/appstorage' : './modules/emby-apiclient/appstorage-' + mode + '.js']);
    }
});

test('actual loader still registers the existing empty worker without the retired worker application', async () => {
    const registrations = [], scripts = [], cache = {put: () => Promise.resolve()};
    const self = {Promise, caches: {open: () => Promise.resolve(cache)}};
    const navigator = {serviceWorker: {register: name => { registrations.push(name); return Promise.resolve({}); }, ready: Promise.resolve({})}};
    const document = {createElement: () => ({noModule: true}), head: {appendChild: script => scripts.push(script.src)},
        documentElement: {getAttribute: name => name === 'data-appmode' ? 'electron' : 'fixture-version'}};
    vm.runInNewContext(fs.readFileSync(path.join(root,web.WEB_ROOT,'apploader.js'),'utf8'),
        {self, document, navigator, caches: self.caches, Promise, Response: class Response {}, console: {log() {}}, Emby: self.Emby = {}});
    for (let index = 0; index < 12; index++) await Promise.resolve();
    assert.deepEqual(registrations, ['serviceworker.js']);
    assert.equal(fs.readFileSync(path.join(root,web.WEB_ROOT,'serviceworker.js')).length, 0);
    assert.equal(scripts.some(name => name.includes('serviceworker-app')), false);
});

test('source and production Web output omit exactly the reviewed residues and retain active neighboring resources', t => {
    const manifest = web.load(root), previous = JSON.parse(fs.readFileSync(path.join(root,manifest.migration.historicalManifestPath)));
    assert.equal(manifest.fileCount,713);
    for (const name of removed) assert.equal(fs.existsSync(path.join(root,web.INPUT_ROOT,name)),false,name);
    const kept = ['www/components/directorybrowser/directorybrowser.js','www/modules/emby-apiclient/appstorage-localstorage.js',
        'www/modules/emby-apiclient/appstorage-memory.js','www/modules/common/playback/playqueueconfirmation.js','www/css/detailtable.css','www/robots.txt','www/serviceworker.js'];
    for (const name of kept) {
        const original = previous.files.find(entry => entry.path === name); assert.ok(original,name);
        assert.equal(sha(fs.readFileSync(path.join(root,web.INPUT_ROOT,name))),original.sha256,name);
    }
    for (const entry of manifest.files.filter(file => /\.(?:js|html|css)$/.test(file.path))) {
        const source = fs.readFileSync(path.join(root,web.INPUT_ROOT,entry.path),'utf8');
        assert.doesNotMatch(source,/directorybrowser\.css|appstorage-cache|serviceworker-app/,entry.path);
    }
    fs.mkdirSync(path.join(root,'dist'),{recursive:true});const runtime=fs.mkdtempSync(path.join(root,'dist','web-residue-'));
    t.after(()=>fs.rmSync(runtime,{recursive:true,force:true}));
    assert.equal(web.assemble(root,runtime).runtimeFileCount,713);overlays.apply(root,runtime);
    assert.equal(overlays.inspect(root,runtime).status,'passed');
    const exclusions = require('../tools/runtime-exclusions.cjs');
    for (const name of kept) assert.equal(fs.existsSync(path.join(runtime,'electronapp',name)),true,name);
    for (const name of removed) {
        const file=path.join(runtime,'electronapp',name);assert.equal(fs.existsSync(file),false);
        fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic stale residue');
        assert.equal(exclusions.verify(runtime).status,'failed');exclusions.remove(runtime);assert.equal(fs.existsSync(file),false);
    }
});
