'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const appHostCommand = require('../src/electronapp/apphost-command');

const mainSource = fs.readFileSync(process.env.ETE_EXTERNAL_URL_MAIN_SOURCE ||
    path.join(__dirname, '../src/electronapp/main.js'), 'utf8').replace(/\r\n/g, '\n');
const mainRequire = createRequire(path.join(__dirname, '../src/electronapp/main.js'));

function excerpt(start, end) {
    const startIndex = mainSource.indexOf(start);
    const endIndex = mainSource.indexOf(end, startIndex + start.length);
    assert.ok(startIndex >= 0 && endIndex > startIndex, 'main call-site anchors must exist');
    return mainSource.slice(startIndex, endIndex);
}

function callSites(openExternal) {
    let windowHandler;
    let appHostHandler;
    const logs = [];
    const context = {
        electron: {
            shell: {openExternal},
            protocol: {registerStringProtocol(_scheme, handler) { appHostHandler = handler; }},
            dialog: {showMessageBox() { return Promise.resolve({response: 1}); }}
        },
        appHostCommand,
        getWebContents() { return {setWindowOpenHandler(handler) { windowHandler = handler; }}; },
        require: mainRequire,
        process: {env: {APPDATA: 'fixture-appdata'}},
        console: {log(...args) { logs.push(args); }, warn(...args) { logs.push(args); }, error(...args) { logs.push(args); }}
    };
    vm.createContext(context);
    const helperImport = mainSource.match(/var externalUrl = require\([^\n]+\);/);
    if (helperImport) vm.runInContext(helperImport[0], context);
    vm.runInContext(excerpt('getWebContents().setWindowOpenHandler(function (details)', 'var url = getAppUrl();'), context);
    vm.runInContext(excerpt('function registerAppHost()', 'function onLoaded()') + '\nregisterAppHost();', context);
    vm.runInContext(excerpt('function showMessage(message)', 'function registerFileSystem()'), context);
    return {
        window(value) {
            assert.equal(windowHandler({url: value}).action, 'deny', 'every window-open stays denied');
        },
        apphost(value) {
            let replies = 0;
            appHostHandler({url: 'electronapphost://OpenURL/?url=' + value}, () => replies++);
            assert.equal(replies, 1, 'host protocol callback always completes');
        },
        shader() { context.showMessage('fixture'); },
        logs
    };
}

async function settle() {
    await new Promise(resolve => setImmediate(resolve));
}

for (const entry of ['window', 'apphost']) {
    test(entry + ' rejects unapproved protocols at the real main call site', async () => {
        const opened = [];
        const calls = callSites(url => { opened.push(url); return Promise.resolve(); });
        for (const value of ['file:///fixture.txt', 'MAILTO:user@example.test', 'magnet:?xt=fixture',
            'custom-launch:payload', 'javascript:alert(1)', 'data:text/plain,fixture']) calls[entry](value);
        await settle();
        assert.deepEqual(opened, []);
    });

    test(entry + ' preserves valid HTTP/HTTPS URL bytes and query/fragment', async () => {
        const opened = [];
        const calls = callSites(url => { opened.push(url); return Promise.resolve(); });
        const allowed = [
            'https://github.com/hope140/EmbyTheaterEnhanced/releases/latest',
            'http://server.test:8096/metadata?Case=MiXeD&Token=a%2Bb#Fragment',
            'HTTPS://Example.test/Case/%E4%B8%AD?x=%252F&y=%23&z=%250A#Mixed',
            'https://example.test/path%20with%20space?q=+&empty=#part',
            'https://[::1]:8096/web/index.html'
        ];
        for (const value of allowed) calls[entry](value);
        await settle();
        assert.deepEqual(opened, allowed, 'validation must not decode or rewrite payload bytes');
    });

    test(entry + ' rejects malformed browser URLs and credentials', async () => {
        const opened = [];
        const calls = callSites(url => { opened.push(url); return Promise.resolve(); });
        for (const value of ['', ' ', '//example.test/path', 'https:example.test', 'https:/example.test',
            'https:///example.test', 'https://', 'https://example.test:bad/',
            'https://user:secret@example.test/', 'https://user@example.test/', 'https://@example.test/',
            'https://example.test/\nnext', '\thttps://example.test/', 'https://example.test/path\u0000',
            'https://example.test/a\\b', 'https://example.test/%5cpath', 'https://example.test/?x=%0A',
            'https://example.test/%C2%85', 'https://example.test/%1f', 'https://example.test/%ff',
            'https://example.test/%00', 'https://example.test/%7F', 'https://example.test/%',
            'https://example.test/%0', 'https://example.test/%GG', 'https://example.test/%E4%B8']) calls[entry](value);
        await settle();
        assert.deepEqual(opened, []);
    });

    test(entry + ' contains synchronous shell failures and rejected promises without URL logging', async () => {
        const sensitive = 'https://example.test/path?private=fixture-secret';
        let attempts = 0;
        const calls = callSites(() => {
            attempts++;
            if (attempts === 1) throw new Error(sensitive);
            return Promise.reject(new Error(sensitive));
        });
        assert.doesNotThrow(() => calls[entry](sensitive));
        assert.doesNotThrow(() => calls[entry](sensitive));
        await settle();
        assert.equal(attempts, 2);
        assert.deepEqual(calls.logs, []);
    });
}

test('window-open rejects non-string values without coercion', async () => {
    const opened = [];
    const calls = callSites(url => { opened.push(url); });
    for (const value of [undefined, null, 7, false, {}, [], new String('https://example.test/'),
        {toString() { throw new Error('must not coerce'); }}]) assert.doesNotThrow(() => calls.window(value));
    await settle();
    assert.deepEqual(opened, []);
});

test('the fixed shader help link uses the real main call site', async () => {
    const opened = [];
    const calls = callSites(url => { opened.push(url); return Promise.resolve(); });
    calls.shader();
    await settle();
    assert.deepEqual(opened, ['https://hooke007.github.io/unofficial/mpv_shaders.html']);
});

test('shader help shell rejection is contained', async () => {
    const calls = callSites(() => Promise.reject(new Error('fixture failure')));
    calls.shader();
    await settle();
    assert.deepEqual(calls.logs, []);
});

test('external URL helper returns a bounded outcome when shell is unavailable', async () => {
    const externalUrl = mainRequire('./enhanced/external-url');
    assert.equal(await externalUrl.openExternalUrl(null, 'https://example.test/'), false);
    assert.equal(await externalUrl.openExternalUrl({}, 'https://example.test/'), false);
    assert.equal(await externalUrl.openExternalUrl({openExternal() { return undefined; }}, 'https://example.test/'), true);
});
