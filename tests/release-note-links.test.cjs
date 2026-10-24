'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const links = require('../src/electronapp/enhanced/release-note-links');
const ipc = require('../src/electronapp/enhanced/maintenance-ipc');
const {eventFor} = require('./helpers/trusted-renderer.cjs');

test('only explicit valid HTTP(S) URLs without credentials or normalization surprises are link targets', () => {
    for (const url of ['https://example.invalid/docs#part', 'http://example.invalid:8080/a?q=1', 'HTTPS://EXAMPLE.INVALID/']) {
        assert.equal(links.safeUrl(url), new URL(url).href);
    }
    for (const url of [null, {}, '', '//example.invalid', '/relative', 'https:example.invalid', 'https://',
        'javascript:alert(1)', 'data:text/html,test', 'file:///C:/test', 'emby://test', 'mailto:test@example.invalid',
        ' https://example.invalid', 'https://example.invalid\n', 'https://exa\tmple.invalid',
        'https://user:synthetic@example.invalid/', 'https://example.invalid\\@other.invalid',
        'https://example.invalid/%invalid', 'https://example.invalid:99999/', 'https://example.invalid/' + 'x'.repeat(2048)]) {
        assert.equal(links.safeUrl(url), null, String(url));
    }
});

test('inline labels replace long URLs; bare URLs preserve punctuation and balanced parentheses', () => {
    const long = 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.2/EmbyTheaterEnhanced-0.4.2-win-x64-setup.exe';
    const notes = '# 原标题\n[Windows x64安装包](' + long + ')\nhttps://example.invalid/wiki/A_(B)).\n' + long;
    const parts = links.parse(notes), anchors = parts.filter(part => part.url);
    assert.equal(anchors[0].text, 'Windows x64安装包'); assert.equal(anchors[0].url, long);
    assert.equal(anchors[1].url, 'https://example.invalid/wiki/A_(B)');
    assert.equal(anchors[2].text, 'github.com/…'); assert.equal(anchors[2].url, long);
    assert.ok(parts.some(part => part.text.includes(').\n')));
    assert.equal(parts[0].text, '# 原标题\n');
    assert.equal(links.parse('[括号](https://example.invalid/A_(B))')[0].url, 'https://example.invalid/A_(B)');
});

test('images, unsafe destinations and unsupported markup remain inert text; input work stays bounded', () => {
    for (const text of ['![图片](https://never.invalid/image.png)', '[运行](javascript:alert(1))',
        '[本地](file:///C:/test)', '[自定义](emby://test)', '[坏地址](https://bad host.invalid)',
        '<img src=x onerror=alert(1)><script>alert(1)</script>', '<img src="https://never.invalid/i.png" onerror="evil()">',
        'javascript:https://example.invalid/']) {
        const parts = links.parse(text);
        assert.ok(parts.every(part => !part.url), text);
        assert.equal(parts.map(part => part.text).join(''), text);
    }
    assert.equal(links.parse('x'.repeat(70000)).map(part => part.text).join('').length, 65536);
    const unmatched = '['.repeat(30000) + ' https://example.invalid/';
    assert.equal(links.parse(unmatched).at(-1).url, 'https://example.invalid/');
    assert.equal(links.parse('https://example.invalid/' + ')'.repeat(60000))[0].url, 'https://example.invalid/');
});

test('CommonJS and the actual AMD factory use the same parser and URL policy', () => {
    let amd;
    const define = (deps, factory) => { assert.equal(deps.length, 0); amd = factory(); };
    define.amd = {};
    const commonJs = {exports: {}};
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/electronapp/enhanced/release-note-links.js'), 'utf8'), {
        URL, define, module: commonJs
    });
    const text = '[说明](https://example.invalid/docs) ![image](https://never.invalid/image.png)';
    assert.equal(JSON.stringify(amd.parse(text)), JSON.stringify(links.parse(text)));
    assert.equal(amd.safeUrl('file:///C:/test'), null);
    assert.deepEqual(commonJs.exports, {}, 'AMD takes priority in a renderer that also exposes a CommonJS global');
});

test('frozen Alameda resolves the helper from relative and absolute plugin-manager controller URLs', async () => {
    const root = path.resolve(__dirname, '..'), pageUrl = 'file:///synthetic/electronapp/www/index.html';
    for (const controllerId of ['../plugins/mpvplayer/about.js', 'file:///synthetic/electronapp/plugins/mpvplayer/about.js']) {
        const requested = [], nodes = new Map();
        const view = {querySelector(selector) {
            if (!nodes.has(selector)) nodes.set(selector, {textContent: '', addEventListener() {}, setAttribute() {}, getAttribute() { return null; }});
            return nodes.get(selector);
        }};
        const context = vm.createContext({URL, Promise, console, setTimeout, clearTimeout,
            window: {ipc: {invoke: async () => ({status: 'latest', notes: 'safe text', currentVersion: '0.4.0', latestVersion: '0.4.0'})}},
            document: {createElement(tag) {
                assert.equal(tag, 'script'); const listeners = new Map();
                return {addEventListener(type, callback) { listeners.set(type, callback); }, fire() { listeners.get('load')(); }};
            }, head: {appendChild(script) {
                const filename = new URL(script.src, pageUrl).pathname;
                assert.ok(['/synthetic/electronapp/plugins/mpvplayer/about.js', '/synthetic/electronapp/enhanced/release-note-links.js'].includes(filename), filename);
                requested.push(filename);
                vm.runInContext(fs.readFileSync(path.join(root, 'src', filename.slice('/synthetic/'.length)), 'utf8'), context, {filename});
                queueMicrotask(() => script.fire());
            }}}});
        vm.runInContext(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/alameda/alameda.js'), 'utf8'), context);
        function BaseView() {}
        context.define('baseView', [], () => BaseView);
        context.define('loading', [], () => ({show() {}, hide() {}}));
        context.define('emby-button', [], () => ({})); context.define('emby-scroller', [], () => ({}));
        context.require.config({baseUrl: 'file:///synthetic/electronapp/www/', noRequireCss: true});
        const About = await context.require([controllerId], value => value);
        const controller = new About(view); await controller.checkUpdates();
        assert.equal(view.querySelector('.aboutReleaseNotes').textContent, 'safe text');
        assert.equal(requested.length, 2);
        assert.equal(requested[1], '/synthetic/electronapp/enhanced/release-note-links.js');
    }
});

test('rendering creates only text nodes and explicit anchors, never HTML or image elements', () => {
    function element(tag) {
        const node = {tag, children: [], attributes: {}, setAttribute(k, v) { this.attributes[k] = v; },
            appendChild(child) { this.children.push(child); }};
        Object.defineProperty(node, 'textContent', {get() { return node.text || ''; }, set(value) { node.text = value; node.children = []; }});
        Object.defineProperty(node, 'innerHTML', {set() { throw Error('HTML parsing forbidden'); }});
        return node;
    }
    const root = element('pre'), created = [];
    root.ownerDocument = {createTextNode(text) { return {text}; }, createElement(tag) { created.push(tag); return element(tag); }};
    links.render(root, '<script>inert</script> [<img onerror=evil>](https://example.invalid/) ![image](https://never.invalid/i.png)');
    assert.deepEqual(created, ['a']);
    const anchor = root.children.find(node => node.tag === 'a');
    assert.equal(anchor.textContent, '<img onerror=evil>');
    assert.equal(anchor.href, 'https://example.invalid/'); assert.equal(anchor.rel, 'noopener noreferrer');
    assert.match(anchor.title, /https:\/\/example.invalid\//);
    assert.ok(root.children.some(node => node.text && node.text.includes('<script>inert</script>')));
    links.render(root, 'replacement'); assert.equal(root.children.length, 0); assert.equal(root.textContent, 'replacement');
});

function harness(options = {}) {
    const handlers = new Map(), sender = {}, event = eventFor(sender), opened = [];
    let requestJson = async () => ({tag_name: 'v0.4.0', draft: false, prerelease: false,
        html_url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.0',
        body: '[文档](https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/README.md)\n' +
            '[下载](https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/setup.exe)\n' +
            'http://example.invalid/docs ![image](https://never.invalid/image.png) [bad](javascript:alert(1))'});
    const unregister = ipc.register({ipcMain: {handle: (channel, fn) => handlers.set(channel, fn), removeHandler: channel => handlers.delete(channel)},
        getWebContents: () => sender, getAppInfo: async () => ({appVersion: '0.4.0'}), requestJson: () => requestJson(),
        shell: {openExternal: async (...args) => { opened.push(args); if (options.fail) throw Error('synthetic shell failure'); }}});
    return {handlers, event, opened, unregister, setRequest(fn) { requestJson = fn; },
        invoke(channel, request) { return handlers.get(channel)(event, request); }};
}
const doc = 'https://github.com/hope140/EmbyTheaterEnhanced/blob/main/docs/README.md';

test('note IPC opens only links from the checked official text, with complete schema and frame checks', async () => {
    const h = harness();
    assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, {url: doc})).reason, 'invalid-note-link');
    assert.equal((await h.invoke(ipc.CHANNELS.CHECK_UPDATE)).status, 'latest');
    for (const request of [undefined, null, [], {}, {url: 1}, {url: doc, extra: 1}]) {
        assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, request)).reason, 'invalid-request');
    }
    for (const url of ['javascript:alert(1)', 'file:///C:/test', 'emby://test', 'https://', 'https://not-in-notes.invalid/',
        'https://never.invalid/image.png', 'https://user:synthetic@example.invalid/']) {
        assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, {url})).reason, 'invalid-note-link');
    }
    assert.equal((await h.handlers.get(ipc.CHANNELS.OPEN_NOTE_LINK)({sender: {}}, {url: doc})).reason, 'untrusted_sender');
    assert.equal((await h.handlers.get(ipc.CHANNELS.OPEN_NOTE_LINK)({...h.event, senderFrame: {}}, {url: doc})).reason, 'untrusted_sender');
    assert.equal(h.opened.length, 0);
    for (const url of [doc, 'http://example.invalid/docs', 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v0.4.0/setup.exe']) {
        assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, {url})).status, 'opened');
        assert.deepEqual(h.opened.at(-1), [url], 'only the URL reaches the browser, with no credentials or headers');
    }
    const handler = h.handlers.get(ipc.CHANNELS.OPEN_NOTE_LINK);
    await h.unregister(); assert.equal((await handler(h.event, {url: doc})).reason, 'closed');
});

test('a new manual check retires the prior link set even when the official request fails', async () => {
    const h = harness(); await h.invoke(ipc.CHANNELS.CHECK_UPDATE);
    let fail; h.setRequest(() => new Promise((_resolve, reject) => { fail = reject; }));
    const check = h.invoke(ipc.CHANNELS.CHECK_UPDATE); await new Promise(resolve => setImmediate(resolve));
    assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, {url: doc})).reason, 'invalid-note-link');
    fail(Error('synthetic offline')); await check;
    assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, {url: doc})).reason, 'invalid-note-link');
    assert.equal(h.opened.length, 0); await h.unregister();
});

test('system-browser failure is returned without navigating, downloading or executing software', async () => {
    const h = harness({fail: true}); await h.invoke(ipc.CHANNELS.CHECK_UPDATE);
    assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, {url: doc})).status, 'error');
    assert.deepEqual(h.opened, [[doc]]); await h.unregister();
});
