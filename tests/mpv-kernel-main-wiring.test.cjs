'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {resolveMode} = require('../src/electronapp/native-helper/service');

test('main captures and validates the existing bridge selector before deleting its environment variable', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/electronapp/main.js'), 'utf8');
  const capture = source.indexOf('var nativeHelperMode = nativeHelperServiceModule.resolveMode(process.env.ETE_MPV_BRIDGE_MODE);');
  const cleanup = source.indexOf("delete process.env[name]", source.indexOf("'ETE_CD2_ENABLED'"));
  const use = source.indexOf('mode: nativeHelperMode');
  assert.ok(capture >= 0 && cleanup > capture && use > capture);
  assert.match(source.slice(capture, cleanup), /var nativeHelperMode = nativeHelperServiceModule\.resolveMode/);
});

test('captured bridge mode keeps the existing default and fail-closed rejection', () => {
  assert.equal(resolveMode(undefined), 'native-helper');
  assert.equal(resolveMode('native-helper'), 'native-helper');
  assert.throws(() => resolveMode('pepper'), /legacy-mode-removed/);
  assert.throws(() => resolveMode('unknown'), /unsupported-bridge-mode/);
});

test('candidate startup resolution and prewarm complete before renderer page load', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/electronapp/main.js'), 'utf8');
  const resolve = source.indexOf('readyStartupPromise = initializeNativeHelperForStartup()');
  const windowCreate = source.indexOf('mainWindow = new BrowserWindow(windowOptions)', resolve);
  const prewarm = source.indexOf('await nativeHelperService.prewarm()', windowCreate);
  const pageLoad = source.indexOf('mainWindow.loadURL(`file://${__dirname}/www/index.html?autostart=false`)', prewarm);
  assert.ok(resolve >= 0 && windowCreate > resolve && prewarm > windowCreate && pageLoad > prewarm);
  assert.match(source.slice(prewarm, pageLoad), /if \(appIsShuttingDown\) return/);
});
