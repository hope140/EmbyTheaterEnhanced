'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const pluginRoot = path.join(repoRoot, 'src', 'electronapp', 'plugins', 'mpvplayer');
const maintenance = require('../src/electronapp/enhanced/maintenance');
const maintenanceIpc = require('../src/electronapp/enhanced/maintenance-ipc');

function readPluginFile(name) {
    return fs.readFileSync(path.join(pluginRoot, name), 'utf8');
}

function fakeIpcMain() {
    const handlers = new Map();
    return {
        handlers,
        handle(channel, handler) { handlers.set(channel, handler); },
        removeHandler(channel) { handlers.delete(channel); }
    };
}

function splitSelectorList(selector) {
    const parts = [];
    let start = 0;
    let depth = 0;
    for (let index = 0; index < selector.length; index++) {
        if (selector[index] === '(') depth++;
        else if (selector[index] === ')') depth--;
        else if (selector[index] === ',' && depth === 0) {
            parts.push(selector.slice(start, index).trim());
            start = index + 1;
        }
    }
    parts.push(selector.slice(start).trim());
    return parts;
}

test('maintenance version ordering and update states use injected release fixtures only', async () => {
    assert.equal(maintenance.compareVersions('0.2.3-rc.2', '0.2.3-rc.10'), -1);
    assert.equal(maintenance.compareVersions('0.2.3-rc.10', '0.2.3'), -1);
    assert.equal(maintenance.compareVersions('v0.2.3+build.4', '0.2.3'), 0);
    assert.equal(maintenance.compareVersions('invalid', '0.2.3'), null);

    const requested = [];
    const result = await maintenance.checkLatestRelease({
        currentVersion: '0.2.2',
        requestJson: async function (url) {
            requested.push(url);
            return {
                tag_name: 'v0.2.3',
                html_url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.3'
            };
        }
    });
    assert.deepEqual(requested, [maintenance.LATEST_RELEASE_API_URL]);
    assert.deepEqual(result, {
        status: 'update-available',
        currentVersion: '0.2.2',
        latestVersion: '0.2.3',
        releaseUrl: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.3'
    });
    assert.equal((await maintenance.checkLatestRelease({
        currentVersion: '0.2.3',
        requestJson: async function () { return {tag_name: '0.2.3'}; }
    })).status, 'latest');
    assert.deepEqual(await maintenance.checkLatestRelease({
        currentVersion: '0.2.2',
        requestJson: async function () { throw new Error('fixture offline'); }
    }), {status: 'error', reason: 'network-error'});
    assert.deepEqual(await maintenance.checkLatestRelease({
        currentVersion: 'bad',
        requestJson: async function () { throw new Error('must not be called'); }
    }), {status: 'error', reason: 'invalid-current-version'});
});

test('About environment summary is read-only and hides libmpv until helper readiness', () => {
    const appInfo = Object.freeze({
        appVersion: '0.2.3',
        electron: '44.4.2',
        chromium: '152.0.7977.130',
        node: '24.21.0',
        buildCommit: 'a'.repeat(40),
        nativeHelper: Object.freeze({helperVersion: '0.2.1-helper', libmpvVersion: 'mpv v0.41.0', state: 'starting'})
    });
    const platformInfo = Object.freeze({windows: 'Windows test build'});
    const displayInfo = Object.freeze({summary: 'scaleFactor 1.50'});
    const info = maintenance.buildEnvironmentInfo(appInfo, platformInfo, displayInfo);

    assert.deepEqual(info, {
        appVersion: '0.2.3', electron: '44.4.2', chromium: '152.0.7977.130', node: '24.21.0',
        nativeHelper: '0.2.1-helper', libmpv: 'UNKNOWN', sourceCommit: 'a'.repeat(40),
        windows: 'Windows test build', displayDpi: 'scaleFactor 1.50'
    });
    assert.match(maintenance.formatEnvironmentText(info), /libmpv: UNKNOWN/);
    assert.equal(maintenance.buildEnvironmentInfo({nativeHelper: {helperVersion: 'helper'}}).libmpv, 'UNKNOWN');
    assert.equal(maintenance.buildEnvironmentInfo({nativeHelper: {state: 'ready', libmpvVersion: 'mpv v0.41.0'}}).libmpv, 'mpv v0.41.0');
    assert.equal(appInfo.nativeHelper.libmpvVersion, 'mpv v0.41.0');
    assert.equal(displayInfo.summary, 'scaleFactor 1.50');
});

test('maintenance IPC checks sender trust, supports unregister and limits clipboard and release actions', async () => {
    const ipcMain = fakeIpcMain();
    const trusted = {};
    const untrusted = {};
    let copiedText = '';
    const opened = [];
    let fixtureCalls = 0;
    const unregister = maintenanceIpc.register({
        ipcMain,
        getWebContents: function () { return trusted; },
        getAppInfo: function () { return {appVersion: '0.2.2', nativeHelper: {helperVersion: 'helper', libmpvVersion: 'mpv', state: 'ready'}}; },
        getPlatformInfo: function () { return {windows: 'Windows test'}; },
        getDisplayInfo: function () { return {}; },
        clipboard: {writeText: function (value) { copiedText = value; }},
        shell: {openExternal: function (url) { opened.push(url); }},
        requestJson: async function () {
            fixtureCalls++;
            return {tag_name: '0.2.3', html_url: 'https://attacker.example/releases/tag/0.2.3'};
        }
    });

    assert.equal((await ipcMain.handlers.get(maintenanceIpc.CHANNELS.GET_INFO)({sender: trusted})).status, 'ok');
    assert.deepEqual(await ipcMain.handlers.get(maintenanceIpc.CHANNELS.CHECK_UPDATE)({sender: untrusted}), {
        status: 'error', reason: 'untrusted_sender'
    });
    assert.equal(fixtureCalls, 0);
    assert.equal((await ipcMain.handlers.get(maintenanceIpc.CHANNELS.COPY_ENVIRONMENT)({sender: trusted})).status, 'copied');
    assert.match(copiedText, /Emby Theater Enhanced: 0\.2\.2/);
    assert.equal((await ipcMain.handlers.get(maintenanceIpc.CHANNELS.CHECK_UPDATE)({sender: trusted})).status, 'update-available');
    assert.equal(fixtureCalls, 1);
    assert.equal((await ipcMain.handlers.get(maintenanceIpc.CHANNELS.OPEN_RELEASES)({sender: trusted}, {
        url: 'https://github.com.evil.example/hope140/EmbyTheaterEnhanced/releases/tag/v9'
    })).status, 'opened');
    assert.deepEqual(opened, [maintenance.RELEASES_URL]);
    assert.equal(maintenance.safeReleaseUrl('https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.3'),
        'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.2.3');

    unregister();
    assert.equal(ipcMain.handlers.size, 0);
});

test('About loads environment on entry and checks updates only after a user click', async () => {
    const invoked = [];
    let finishUpdate;
    const nodes = new Map();
    const loadingCalls = [];
    function fakeNode() {
        return {
            textContent: '', disabled: false, hidden: false, attributes: {}, listeners: {},
            addEventListener: function (type, listener) { this.listeners[type] = listener; },
            setAttribute: function (name, value) { this.attributes[name] = value; },
            getAttribute: function (name) { return this.attributes[name] || null; }
        };
    }
    const view = {
        querySelector: function (selector) {
            if (!nodes.has(selector)) nodes.set(selector, fakeNode());
            return nodes.get(selector);
        }
    };
    function BaseView() {}
    BaseView.prototype.onResume = function () {};
    BaseView.prototype.onPause = function () {};
    let AboutView;
    const source = readPluginFile('about.js');
    const context = {
        define: function (_dependencies, factory) {
            AboutView = factory({show: function () { loadingCalls.push('show'); }, hide: function () { loadingCalls.push('hide'); }}, BaseView);
        },
        window: {
            ipc: {
                invoke: function (channel) {
                    invoked.push(channel);
                    if (channel === 'enhanced-maintenance-info') {
                        return Promise.resolve({
                            status: 'ok',
                            info: {appVersion: '0.2.3', electron: '44.4.2', chromium: '152', node: '24', nativeHelper: 'helper 0.2.1', libmpv: 'UNKNOWN', sourceCommit: 'abc', windows: 'Windows', displayDpi: 'NOT AVAILABLE'}
                        });
                    }
                    if (channel === 'enhanced-maintenance-check-update') {
                        return new Promise(function (resolve) { finishUpdate = resolve; });
                    }
                    return Promise.resolve({status: 'copied'});
                }
            }
        }
    };
    vm.runInNewContext(source, context, {filename: 'about.js'});
    const controller = new AboutView(view);

    await controller.loadInfo();
    assert.deepEqual(invoked, ['enhanced-maintenance-info']);
    assert.equal(view.querySelector('.aboutAppVersion').textContent, '0.2.3');
    for (const [selector, value] of [
        ['.aboutElectron', '44.4.2'], ['.aboutChromium', '152'], ['.aboutNativeHelper', 'helper 0.2.1'],
        ['.aboutLibmpv', 'UNKNOWN'], ['.aboutSourceCommit', 'abc'], ['.aboutNode', '24'], ['.aboutWindows', 'Windows']
    ]) {
        assert.equal(view.querySelector(selector).textContent, value);
    }
    assert.deepEqual(loadingCalls, ['show', 'hide']);

    const updateButton = view.querySelector('.btnCheckUpdates');
    updateButton.listeners.click();
    assert.equal(updateButton.disabled, true);
    assert.deepEqual(invoked, ['enhanced-maintenance-info', 'enhanced-maintenance-check-update']);
    finishUpdate({status: 'latest', currentVersion: '0.2.3'});
    await new Promise(function (resolve) { setImmediate(resolve); });
    assert.equal(updateButton.disabled, false);
});

test('main registers maintenance IPC for the current renderer and unregisters it before quit', () => {
    const main = fs.readFileSync(path.join(repoRoot, 'src', 'electronapp', 'main.js'), 'utf8');
    assert.match(main, /var maintenanceIpc = require\('\.\/enhanced\/maintenance-ipc'\)/);
    assert.match(main, /unregisterMaintenanceIpc\s*=\s*maintenanceIpc\.register\(\{[\s\S]*?getWebContents:\s*getWebContents[\s\S]*?getAppInfo:\s*getCurrentEnhancedAppInfo/);
    assert.match(main, /app\.once\('before-quit'[\s\S]*?unregisterMaintenanceIpc\(\);/);
});

test('About route and all three settings pages use Emby native page and control styles', () => {
    const routes = fs.readFileSync(path.join(pluginRoot, '..', 'libmpv.js'), 'utf8');
    assert.match(routes, /path:\s*'mpvplayer\/about\.html'[\s\S]{0,400}title:\s*'关于 Enhanced'/);

    for (const page of ['strm', 'diagnostics', 'about']) {
        const html = readPluginFile(page + '.html');
        const controller = readPluginFile(page + '.js');
        assert.match(controller, /css!\.\/enhanced-settings(?:['"]|\s*,)/, page + ' controller should load shared settings CSS');
        assert.match(html, /class="(?:[^"]*\s)?ete-settings-page(?:\s|")/, page + ' page root namespace');
        assert.match(html, /<section\b[^>]*class="[^"]*\bverticalSection\b/, page + ' sections inherit Emby verticalSection spacing');
        assert.match(html, /<h2\b[^>]*class="[^"]*\bsectionTitle\b/, page + ' section headings inherit Emby sectionTitle styling');
        assert.match(html, /<button\b[^>]*is="emby-button"/, page + ' buttons use Emby button elements');
        for (const control of ['raised', 'button-submit', 'button-link']) {
            assert.match(html, new RegExp('class="[^"]*\\b' + control + '\\b'), page + ' preserves Emby ' + control + ' hierarchy');
        }
    }

    const strm = readPluginFile('strm.html');
    assert.match(strm, /<input\b[^>]*is="emby-input"/);
    assert.match(strm, /<input\b[^>]*is="emby-checkbox"/);
    assert.match(readPluginFile('strm.js'), /select\.setAttribute\('is', 'emby-select'\)/);
    const about = readPluginFile('about.html');
    assert.match(about, /<details\b[^>]*class="[^"]*ete-about-advanced[^"]*"[\s\S]*?<\/details>/);
    for (const label of ['Electron', 'Chromium', 'Native Helper', 'libmpv', 'Source Commit']) {
        assert.match(about, new RegExp('<span>' + label + '</span>'), 'About advanced details include ' + label);
    }
    assert.match(about, /<code class="aboutAppVersion">/);
    assert.match(about, /class="raised button-submit ete-settings-button ete-settings-button--primary btnCheckUpdates"/);
});

test('functional STRM control classes remain available in the page or its generated controls', () => {
    const html = readPluginFile('strm.html');
    const controller = readPluginFile('strm.js');
    const source = html + '\n' + controller;
    const controlClasses = [
        'chkEnabled', 'txtCd2Origin', 'txtCd2Token', 'btnSetToken', 'btnClearToken', 'chkCd2Enabled',
        'chkDirectUrlEnabled', 'connectionState', 'btnTestConnection', 'btnAddRule', 'txtSmartSourcePath',
        'txtSmartCloudPath', 'txtSmartMountPath', 'btnAnalyzeMapping', 'btnAddSample', 'btnRemoveSample',
        'btnAddSuggestedRule', 'btnSave', 'rule-sourcePrefix', 'rule-cloudPrefix', 'rule-mountPrefix',
        'rule-storageType', 'rule-strategy', 'rule-order-stage', 'btnTestRule', 'btnRestoreAuto', 'btnDisableRule'
    ];
    for (const className of controlClasses) {
        assert.ok(source.includes(className), 'missing functional control class ' + className);
    }
});

test('shared CSS stays scoped and adjusts layout, light boundaries, and the theme-derived primary fill', () => {
    const css = readPluginFile('enhanced-settings.css');
    const selectorBlocks = Array.from(css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g), function (match) { return match[1].trim(); })
        .filter(function (selector) { return selector && !selector.startsWith('@'); });
    assert.ok(selectorBlocks.length > 0, 'shared stylesheet contains component rules');
    for (const selector of selectorBlocks) {
        for (const item of splitSelectorList(selector)) {
            assert.match(item, /^\.ete-settings-page(?:\s|$|[.#:[>+~])/, 'selector must be scoped to the page root: ' + item);
        }
    }
    for (const [page, namespace] of [
        ['strm', 'strm-settings-page'],
        ['diagnostics', 'diagnostics-settings-page'],
        ['about', 'about-settings-page']
    ]) {
        const pageCss = readPluginFile(page + '.css');
        const blocks = Array.from(pageCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g), function (match) {
            return match[1].trim();
        }).filter(function (selector) { return selector && !selector.startsWith('@'); });
        for (const selector of blocks) {
            for (const item of splitSelectorList(selector)) {
                assert.ok(item.startsWith('.' + namespace + ' ') || item.startsWith('.' + namespace + ':'),
                    page + ' selector escapes its page namespace: ' + item);
            }
        }
    }

    assert.match(css, /\.ete-settings-page\s*\{[^}]*max-width:\s*1240px;[^}]*width:\s*100%;/s,
        'shared root gives pages a bounded, responsive content width');
    assert.match(css, /\.ete-settings-page \.ete-settings-section\s*\{[^}]*margin:\s*0 0 2em;/s,
        'shared section spacing stays scoped to settings pages');
    assert.match(css, /border:\s*1px solid var\(--line-background/,
        'shared surfaces use Emby light-boundary color');
    assert.doesNotMatch(css, /--ete-settings-[\w-]+\s*:|color-scheme\s*:\s*dark/i,
        'shared CSS does not define a separate palette or dark control scheme');
    assert.match(css, /\.ete-settings-page \.ete-settings-button--primary\s*\{[^}]*background:\s*hsl\(var\(--theme-primary-color-hue\),\s*var\(--theme-primary-color-saturation\),\s*calc\(var\(--theme-primary-color-lightness\)\s*-\s*16%\)\)/s,
        'primary action fill darkens the Emby theme HSL color');
    assert.match(css, /\.ete-settings-page \.ete-settings-button--primary:hover[^{}]*\{[^}]*background:\s*hsl\(var\(--theme-primary-color-hue\)/s,
        'primary hover state continues to derive from the Emby theme');
});
