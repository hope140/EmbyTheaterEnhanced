'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const appUrl = pathToFileURL(path.resolve(__dirname, '../src/electronapp/www/index.html')).href;
const entries = [
  ['cd2', require('../src/electronapp/enhanced/cd2-ipc'), 'RESOLVE_CHANNEL'],
  ['config', require('../src/electronapp/enhanced/strm-config-ipc'), 'GET'],
  ['diagnostics', require('../src/electronapp/enhanced/diagnostics-ipc'), 'GET_STATUS'],
  ['maintenance', require('../src/electronapp/enhanced/maintenance-ipc'), 'GET_INFO'],
  ['native', require('../src/electronapp/native-helper/service'), 'CALL_CHANNEL']
];
for (const [name, api, channel] of entries) {
  test(name + ' denies child, absent, detached and foreign-document frames before service access', async () => {
    const handlers = new Map();
    const ipcMain = Object.assign(new EventEmitter(), {handle: (key, fn) => handlers.set(key, fn)});
    const sender = {mainFrame: {url: appUrl}};
    let calls = 0;
    api.register({ipcMain, getWebContents: () => sender,
      service: {resolve() {calls++; return {status: 'hit'};}, call() {calls++; return {status: 'ok'};}},
      store: {getPublicConfig() {calls++; return {};}}});
    const handler = handlers.get(api[channel] || api.CHANNELS[channel]);
    for (const event of [{sender}, {sender, senderFrame: null},
      {sender, senderFrame: {url: appUrl}}, {sender: {}, senderFrame: sender.mainFrame}]) {
      assert.equal((await handler(event, {})).reason, 'untrusted_sender');
    }
    for (const url of ['https://untrusted.invalid/', 'about:blank', appUrl.replace('index.html', 'other.html')]) {
      sender.mainFrame.url = url;
      assert.equal((await handler({sender, senderFrame: sender.mainFrame}, {})).reason, 'untrusted_sender');
    }
    sender.mainFrame.url = appUrl;
    const accepted = await handler({sender, senderFrame: sender.mainFrame}, {});
    assert.notEqual(accepted && accepted.reason, 'untrusted_sender');
    const admittedCalls = calls;
    Object.defineProperty(sender, 'mainFrame', {get() {throw new Error('detached');}});
    assert.equal((await handler({sender, senderFrame: {}})).reason, 'untrusted_sender');
    assert.equal(calls, admittedCalls);
  });
}

const boundary = require('../src/electronapp/enhanced/renderer-boundary');
test('application document admits encoded file URL and query/hash routes only', () => {
  for (const value of [appUrl, appUrl + '?autostart=false#!/settings', appUrl + '#!/item?id=1']) {
    assert.equal(boundary.isApplicationDocument(value), true);
    const sender = {mainFrame: {url: value}, isDestroyed: () => false};
    assert.equal(boundary.isTrusted({sender, senderFrame: sender.mainFrame}, sender), true);
    sender.isDestroyed = () => true;
    assert.equal(boundary.isTrusted({sender, senderFrame: sender.mainFrame}, sender), false);
  }
  for (const value of [undefined, '', {}, 'javascript:void(0)', 'https://example.invalid/',
    appUrl.replace('index.html', 'index.html/extra'), appUrl.replace('index.html', 'other.html'),
    appUrl.replace('file:///', 'file://remote/'), appUrl.replace('index.html', 'index.html%2f..')]) {
    assert.equal(boundary.isApplicationDocument(value), false);
  }
});

test('navigation and redirects prevent external documents and retain application routes', () => {
  const contents = new EventEmitter();
  boundary.restrictNavigation(contents);
  for (const name of ['will-navigate', 'will-redirect']) {
    for (const url of [appUrl + '?autostart=false#home', 'https://example.invalid', 'file:///C:/other.html', 'data:text/html,test']) {
      for (const modern of [false, true]) {
        let denied = false;
        const event = {preventDefault() {denied = true;}};
        if (modern) event.url = url;
        contents.emit(name, event, modern ? undefined : url);
        assert.equal(denied, !url.startsWith(appUrl));
      }
    }
  }
});

test('notify and cancel channels reject child frames without side effects', () => {
  for (const [name, api] of entries.filter(entry => ['cd2', 'native', 'diagnostics'].includes(entry[0]))) {
    const ipcMain = Object.assign(new EventEmitter(), {handle() {}});
    const sender = {mainFrame: {url: appUrl}};
    let calls = 0;
    const logger = () => {calls++;};
    api.register({ipcMain, getWebContents: () => sender, logger,
      service: {cancel() {calls++;}, notify() {calls++;}}});
    const channel = api.CANCEL_CHANNEL || api.NOTIFY_CHANNEL || api.CHANNELS.LOG;
    const request = name === 'diagnostics' ? {category: 'test'} : {requestId: 'fake'};
    ipcMain.emit(channel, {sender, senderFrame: {url: appUrl}}, request);
    ipcMain.emit(channel, {sender}, request);
    assert.equal(calls, 0);
    ipcMain.emit(channel, {sender, senderFrame: sender.mainFrame}, request);
    assert.equal(calls, 1);
  }
});

test('main wires navigation gate before loading the application and gates legacy diagnostics', () => {
  const source = require('node:fs').readFileSync(path.resolve(__dirname, '../src/electronapp/main.js'), 'utf8');
  assert.ok(source.indexOf('rendererBoundary.restrictNavigation(getWebContents())') < source.indexOf('mainWindow.loadURL('));
  assert.match(source, /if \(rendererBoundary\.isTrusted\(event, getWebContents\(\)\)\)/);
});
