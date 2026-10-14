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
    const systemActions = [];
    const mainActions = [];
    const powerActions = [];
    const activePowerLocks = new Set();
    let nextPowerLock = 0;
    const mainWindow = {focus() { mainActions.push('focus'); }};
    const context = {
        electron: {
            shell: {openExternal},
            protocol: {registerStringProtocol(_scheme, handler) { appHostHandler = handler; }},
            dialog: {showMessageBox() { return Promise.resolve({response: 1}); }}
        },
        appHostCommand,
        getWebContents() { return {setWindowOpenHandler(handler) { windowHandler = handler; }}; },
        mainWindow,
        windowStateOnLoad: null,
        hasAppLoaded: false,
        sleepLock: 0,
        setWindowState(state) { mainActions.push('windowstate:' + state); },
        closeWindow() { mainActions.push('close'); },
        onLoaded() { mainActions.push('loaded'); },
        powerSaveBlocker: {
            start(reason) {
                const id = ++nextPowerLock;
                activePowerLocks.add(id);
                powerActions.push(['start', reason, id]);
                return id;
            },
            isStarted(id) { return activePowerLocks.has(id); },
            stop(id) {
                activePowerLocks.delete(id);
                powerActions.push(['stop', id]);
            }
        },
        require(moduleName) {
            if (moduleName === 'sleep-mode') return callback => { systemActions.push('sleep'); callback(); };
            if (moduleName === 'power-off') return callback => { systemActions.push('shutdown'); callback(); };
            return mainRequire(moduleName);
        },
        process: {env: {APPDATA: 'fixture-appdata'}},
        console: {log(...args) { logs.push(args); }, warn(...args) { logs.push(args); }, error(...args) { logs.push(args); }}
    };
    vm.createContext(context);
    const helperImport = mainSource.match(/var externalUrl = require\([^\n]+\);/);
    if (helperImport) vm.runInContext(helperImport[0], context);
    vm.runInContext(excerpt('getWebContents().setWindowOpenHandler(function (details)', 'var url = getAppUrl();'), context);
    vm.runInContext(excerpt('function registerAppHost()', 'function onLoaded()') + '\nregisterAppHost();', context);
    return {
        window(value) {
            assert.equal(windowHandler({url: value}).action, 'deny', 'every window-open stays denied');
        },
        apphost(value) {
            let replies = 0;
            appHostHandler({url: 'electronapphost://OpenURL/?url=' + value}, () => replies++);
            assert.equal(replies, 1, 'host protocol callback always completes');
        },
        apphostRequest(url, method = 'GET', referrer = '') {
            let replies = 0;
            appHostHandler({url, method, referrer}, () => replies++);
            assert.equal(replies, 1, 'host protocol callback always completes');
        },
        mainActions,
        powerActions,
        systemActions,
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
            'https%3A//example.test/', 'https%3A%2F%2Fexample.test/',
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

test('the real AppHost dispatcher rejects wrong sources and encoded commands before system actions', () => {
    const opened = [];
    const calls = callSites(url => { opened.push(url); return Promise.resolve(); });
    for (const url of [
        'https://remote.example/electronapphost://shutdown',
        'file:///app/index.html#electronapphost://sleep',
        'javascript:electronapphost://shutdown',
        'electronapphost://%73leep/',
        'electronapphost://shut%64own/',
        'electronapphost://unknown-command/'
    ]) calls.apphostRequest(url);

    assert.deepEqual(opened, []);
    assert.deepEqual(calls.systemActions, []);
});

test('the real AppHost dispatcher completes but ignores legacy system-action requests', () => {
    const opened = [];
    const calls = callSites(url => { opened.push(url); return Promise.resolve(); });
    for (const url of [
        'electronapphost://sleep',
        'electronapphost://SLEEP/',
        'electronapphost://sleep//',
        'electronapphost://shutdown',
        'electronapphost://Shutdown/',
        'electronapphost://shutdown//',
        'electronapphost://restart',
        'electronapphost://RESTART/',
        'electronapphost://restart//',
        'electronapphost://%73leep/',
        'electronapphost://shut%64own/',
        'electronapphost://restart%2f'
    ]) calls.apphostRequest(url);

    assert.deepEqual(opened, []);
    assert.deepEqual(calls.mainActions, []);
    assert.deepEqual(calls.powerActions, []);
    assert.deepEqual(calls.systemActions, []);
});

test('the real AppHost dispatcher preserves window, loaded and audio/video lifecycle calls', () => {
    const calls = callSites(() => Promise.resolve());
    for (const [url, method] of [
        ['electronapphost://windowstate-Normal/', 'GET'],
        ['electronapphost://loaded/', 'GET'],
        ['electronapphost://video-on/', 'POST'],
        ['electronapphost://video-off/', 'POST'],
        ['electronapphost://audio-on/', 'POST'],
        ['electronapphost://audio-off/', 'POST']
    ]) {
        calls.apphostRequest(url, method, 'file:///synthetic-trusted-window');
    }

    assert.deepEqual(calls.mainActions, ['windowstate:Normal', 'focus', 'loaded']);
    assert.deepEqual(calls.powerActions, [
        ['start', 'prevent-display-sleep', 1],
        ['stop', 1],
        ['start', 'prevent-app-suspension', 2],
        ['stop', 2]
    ]);
    assert.deepEqual(calls.systemActions, []);
});

test('external URL helper returns a bounded outcome when shell is unavailable', async () => {
    const externalUrl = mainRequire('./enhanced/external-url');
    assert.equal(await externalUrl.openExternalUrl(null, 'https://example.test/'), false);
    assert.equal(await externalUrl.openExternalUrl({}, 'https://example.test/'), false);
    assert.equal(await externalUrl.openExternalUrl({openExternal() { return undefined; }}, 'https://example.test/'), true);
});
