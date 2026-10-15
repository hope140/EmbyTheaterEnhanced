'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const patcher = require('../tools/patch-custom-css-js.cjs');

function sourceFixture() {
    return [
        'define([',
        '  "events",',
        '  "connectionManager",',
        '], function (',
        '  events,',
        '  connectionManager,',
        '  ) {',
        '  "use strict";',
        '  return function () {',
        '    function loadCss(name, content, source) {',
        '      try {',
        '        const style = document.createElement("style");',
        '        style.type = "text/css";',
        '        style.innerHTML = content;',
        '        document.head.appendChild(style);',
        '      } catch (_error) {',
        '        console.error("CSS loading failed.");',
        '      }',
        '    }',
        '    function loadJS(name, content, source) {',
        '      new Function(content)();',
        '    }',
        '    function loadCode(custom, type, source) {',
        '      if (type === "css") {',
        '        custom.forEach(item => loadCss(item.name, item.content, source));',
        '      } else if (type === "js") {',
        '        custom.forEach(item => loadJS(item.name, item.content, source));',
        '      }',
        '    }',
        '    function getCustom(type, config) {',
        '      const serverId = ApiClient.serverId();',
        '      let serverSelection = localStorage.getItem("custom" + type + "ServerConfig_" + serverId);',
        '      if (!serverSelection) {',
        '        serverSelection = [];',
        '        localStorage.setItem("custom" + type + "ServerConfig_" + serverId, JSON.stringify(serverSelection));',
        '      } else {',
        '        serverSelection = JSON.parse(serverSelection);',
        '      }',
        '      const serverItems = config["custom" + type].filter(item =>',
        '        (item.state === "on" && serverSelection.includes(item.name)) || item.state === "forced_on");',
        '      let localSelection = localStorage.getItem("custom" + type + "LocalConfig");',
        '      if (!localSelection) {',
        '        localSelection = [];',
        '        localStorage.setItem("custom" + type + "LocalConfig", JSON.stringify(localSelection));',
        '      } else {',
        '        localSelection = JSON.parse(localSelection);',
        '      }',
        '      let localItems = localStorage.getItem("custom" + type + "Local");',
        '      if (!localItems) {',
        '        localItems = [];',
        '        localStorage.setItem("custom" + type + "Local", JSON.stringify(localItems));',
        '      } else {',
        '        localItems = JSON.parse(localItems).filter(item => localSelection.includes(item.name));',
        '      }',
        '      return [serverItems, localItems];',
        '    }',
        '    function loadConfiguration() {',
        '      ApiClient.getJSON(ApiClient.getUrl("CustomCssJS/Scripts", {})).then((config) => {',
        '        if (!window.isCustomCssJSLoad) {',
        '          window.isCustomCssJSLoad = true;',
        '          let [customjsServer, customjsLocal] = getCustom("js", config);',
        '          let [customcssServer, customcssLocal] = getCustom("css", config);',
        '          loadCode(customcssServer, "css", "Server");',
        '          loadCode(customcssLocal, "css", "Local");',
        '          loadCode(customjsServer, "js", "Server");',
        '          loadCode(customjsLocal, "js", "Local");',
        '        }',
        '      }, () => {',
        '        if (window.isCustomCssJSLoad) {',
        '          reload();',
        '        }',
        '      });',
        '    }',
        '    function reload() {',
        '      window.location.href = "index.html";',
        '    }',
        '    function loadCustomCssJS() {',
        '      return function () {',
        '        const serverId = ApiClient.serverId();',
        '        if (window.serverId && window.serverId !== serverId && window.isCustomCssJSLoad) {',
        '          reload();',
        '        } else {',
        '          window.serverId = serverId;',
        '          loadConfiguration();',
        '        }',
        '      };',
        '    }',
        '    events.on(connectionManager, "localusersignedin", loadCustomCssJS());',
        '  };',
        '});'
    ].join('\n');
}

function serverConfig() {
    return {
        customjs: [
            {name: 'server-forced', state: 'forced_on', content: 'globalThis.__executed.push("server-forced-secret")'},
            {name: 'server-selected', state: 'on', content: 'globalThis.__executed.push("server-selected-secret")'},
            {name: 'server-off', state: 'off', content: 'globalThis.__executed.push("server-off-secret")'},
            {name: 'server-unselected', state: 'on', content: 'globalThis.__executed.push("server-unselected-secret")'}
        ],
        customcss: [
            {name: 'server-css-forced', state: 'forced_on', content: '/* server-css-forced */'},
            {name: 'server-css-selected', state: 'on', content: '/* server-css-selected */'},
            {name: 'server-css-off', state: 'off', content: '/* server-css-off */'},
            {name: 'server-css-unselected', state: 'on', content: '/* server-css-unselected */'}
        ]
    };
}

function initialStorage(overrides = {}) {
    const values = new Map([
        ['customjsServerConfig_server-a', '["server-selected"]'],
        ['customjsLocalConfig', '["local-js-selected"]'],
        ['customjsLocal', '[{"name":"local-js-selected","content":"globalThis.__executed.push(\\"local-selected-secret\\")"},{"name":"local-js-off","content":"globalThis.__executed.push(\\"local-off-secret\\")"}]'],
        ['customcssServerConfig_server-a', '["server-css-selected"]'],
        ['customcssLocalConfig', '["local-css-selected"]'],
        ['customcssLocal', '[{"name":"local-css-selected","content":"/* local-css-selected */"},{"name":"local-css-off","content":"/* local-css-off */"}]']
    ]);
    for (const [key, value] of Object.entries(overrides)) values.set(key, value);
    return values;
}

function makeRuntime(options = {}) {
    const source = patcher.patchText(sourceFixture());
    const storage = initialStorage(options.storage);
    const beforeStorage = new Map(storage);
    const executed = [];
    const styles = [];
    const notices = [];
    const logs = [];
    const registered = [];
    const handlers = new Map();
    const rejectedCalls = new Set(options.rejectCalls || []);
    let currentServerId = 'server-a';
    let apiCalls = 0;
    let dependencies = [];
    const window = {isCustomCssJSLoad: false, location: {href: 'synthetic://home'}};
    const events = {
        on(_target, eventName, handler) {
            registered.push(eventName);
            handlers.set(eventName, handler);
        }
    };
    const ApiClient = {
        serverId() { return currentServerId; },
        getUrl(value) { return value; },
        getJSON() {
            apiCalls++;
            if (rejectedCalls.has(apiCalls)) return Promise.reject(new Error('synthetic API error with private data'));
            const config = options.configForCall ? options.configForCall(apiCalls) :
                (options.config === undefined ? serverConfig() : options.config);
            return Promise.resolve(config);
        }
    };
    let toast;
    if (options.toast !== 'missing') {
        toast = function (message) {
            notices.push(message);
            if (options.toast === 'throws') throw new Error('synthetic toast error with private data');
            if (options.toast === 'rejects') return Promise.reject(new Error('synthetic toast rejection with private data'));
            return Promise.resolve();
        };
    }
    const sandbox = {
        define(moduleDependencies, factory) {
            dependencies = Array.from(moduleDependencies);
            const initializer = factory(events, {}, toast);
            initializer();
        },
        ApiClient,
        window,
        document: {
            head: {appendChild(style) { styles.push(style.innerHTML); }},
            createElement(tag) { return {tag, type: ''}; }
        },
        localStorage: {
            getItem(key) { return storage.has(key) ? storage.get(key) : null; },
            setItem(key, value) { storage.set(key, String(value)); }
        },
        console: {
            warn(...args) { logs.push(['warn', ...args].join(' ')); },
            error(...args) { logs.push(['error', ...args].join(' ')); }
        },
        __executed: executed
    };
    vm.runInNewContext(source, sandbox, {filename: 'CustomCssJS.synthetic.js'});

    async function signIn(serverId) {
        if (serverId) currentServerId = serverId;
        const handler = handlers.get('localusersignedin');
        assert.equal(typeof handler, 'function', 'localusersignedin handler was registered');
        handler();
        await new Promise(resolve => setImmediate(resolve));
    }

    return {
        apiCalls: () => apiCalls,
        dependencies: () => dependencies,
        executed,
        handlers,
        logs,
        notices,
        registered,
        signIn,
        storage,
        storageUnchanged: () => [...beforeStorage].every(([key, value]) => storage.get(key) === value),
        styles,
        window
    };
}

const expectedCss = ['/* server-css-forced */', '/* server-css-selected */', '/* local-css-selected */'];

test('AMD runtime blocks forced, selected, off and local JS while preserving CSS selections and storage', async () => {
    const runtime = makeRuntime();

    assert.deepEqual(runtime.dependencies(), ['events', 'connectionManager', 'toast']);
    assert.deepEqual(runtime.registered, ['localusersignedin']);
    await runtime.signIn();

    assert.deepEqual(runtime.executed, []);
    assert.deepEqual(runtime.styles, expectedCss);
    assert.equal(runtime.notices.length, 1);
    assert.match(runtime.notices[0], /Saved scripts remain inactive/);
    assert.equal(runtime.storageUnchanged(), true);
    assert.equal(runtime.window.isCustomCssJSLoad, true);
});

test('bad JS JSON, non-array preferences and missing fields do not block CSS or expose preference contents', async t => {
    const cases = [
        ['invalid server JSON', {storage: {'customjsServerConfig_server-a': '[PRIVATE_PREF_SENTINEL'}}],
        ['non-array server preferences', {storage: {'customjsServerConfig_server-a': '{}'}}],
        ['invalid local JSON', {storage: {customjsLocalConfig: '[PRIVATE_PREF_SENTINEL'}}],
        ['non-array local preferences', {storage: {customjsLocalConfig: '{}'}}],
        ['non-array server scripts', {config: {...serverConfig(), customjs: {script: 'PRIVATE_PREF_SENTINEL'}}}],
        ['missing server scripts', {config: {customcss: serverConfig().customcss}}]
    ];

    for (const [name, options] of cases) {
        await t.test(name, async () => {
            const runtime = makeRuntime({...options, toast: 'throws'});
            await runtime.signIn();

            assert.deepEqual(runtime.executed, []);
            assert.deepEqual(runtime.styles, expectedCss);
            assert.equal(runtime.window.isCustomCssJSLoad, true);
            assert.equal(runtime.notices.length, 1);
            assert.equal(runtime.storageUnchanged(), true);
            assert.equal(runtime.logs.join('\n').includes('PRIVATE_PREF_SENTINEL'), false);
            assert.equal(runtime.logs.join('\n').includes('secret'), false);
        });
    }
});

test('missing, throwing and rejected toast delivery never blocks CSS or marks a failed load complete', async t => {
    for (const mode of ['missing', 'throws', 'rejects']) {
        await t.test(mode, async () => {
            const runtime = makeRuntime({
                storage: {'customjsServerConfig_server-a': '[PRIVATE_PREF_SENTINEL'},
                toast: mode
            });
            await runtime.signIn();
            assert.deepEqual(runtime.executed, []);
            assert.deepEqual(runtime.styles, expectedCss);
            assert.equal(runtime.window.isCustomCssJSLoad, true);
            assert.equal(runtime.apiCalls(), 1);
            assert.equal(runtime.storageUnchanged(), true);
            assert.equal(runtime.logs.join('\n').includes('PRIVATE_PREF_SENTINEL'), false);
            assert.equal(runtime.logs.join('\n').includes('synthetic toast'), false);
        });
    }

    const retry = makeRuntime({
        storage: {'customjsServerConfig_server-a': '[PRIVATE_PREF_SENTINEL'},
        toast: 'throws'
    });
    await retry.signIn();
    await retry.signIn();
    assert.deepEqual(retry.styles, expectedCss);
    assert.equal(retry.window.isCustomCssJSLoad, true);
    assert.equal(retry.apiCalls(), 2);
});

test('API rejection, server switch and logout event surface preserve the disabled-JS boundary', async () => {
    const initialFailure = makeRuntime({rejectCalls: [1]});
    await initialFailure.signIn();
    assert.deepEqual(initialFailure.styles, []);
    assert.equal(initialFailure.window.isCustomCssJSLoad, false);
    await initialFailure.signIn();
    assert.deepEqual(initialFailure.styles, expectedCss);
    assert.deepEqual(initialFailure.executed, []);

    const afterLoadFailure = makeRuntime({rejectCalls: [2]});
    await afterLoadFailure.signIn();
    await afterLoadFailure.signIn();
    assert.deepEqual(afterLoadFailure.styles, expectedCss);
    assert.equal(afterLoadFailure.window.location.href, 'index.html');
    assert.deepEqual(afterLoadFailure.executed, []);

    const serverSwitch = makeRuntime();
    await serverSwitch.signIn();
    await serverSwitch.signIn('server-b');
    assert.equal(serverSwitch.window.location.href, 'index.html');
    assert.equal(serverSwitch.apiCalls(), 1);
    assert.deepEqual(serverSwitch.executed, []);

    const logoutBoundary = makeRuntime();
    await logoutBoundary.signIn();
    assert.equal(logoutBoundary.handlers.has('localusersignedout'), false);
    assert.deepEqual(logoutBoundary.styles, expectedCss);
    assert.deepEqual(logoutBoundary.executed, []);
});
