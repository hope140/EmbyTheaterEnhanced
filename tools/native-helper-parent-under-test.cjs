'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const {decimalWindowHandle, EXPECTED_LIBMPV_VERSION} = require('../src/electronapp/native-helper/service');

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 4) throw new Error('Usage: electron native-helper-parent-under-test.cjs <helper> <libmpv> <media> <ready-json>');
const [helperPath, libmpvPath, mediaPath, readyPath] = args;

app.whenReady().then(async function () {
  const host = new BrowserWindow({width: 640, height: 360, frame: false, show: false, backgroundColor: '#000'});
  await host.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:#000}</style>'));
  const client = new NativeHelperClient({helperPath, libmpvPath, parentWindowHandle: decimalWindowHandle(host), expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION});
  await client.start();
  const generationId = client.beginGeneration('parent-death', ['core-idle']);
  client.load(['loadfile', mediaPath]);
  fs.mkdirSync(path.dirname(readyPath), {recursive: true});
  fs.writeFileSync(readyPath, JSON.stringify({parentPid: process.pid, helperPid: client.child.pid, generationId, helperInstanceId: client.helperInstanceId}) + '\n', 'utf8');
  setInterval(function () {}, 60 * 60 * 1000);
}).catch(function (error) {
  fs.mkdirSync(path.dirname(readyPath), {recursive: true});
  fs.writeFileSync(readyPath, JSON.stringify({error: error.message}) + '\n', 'utf8');
  app.exit(1);
});
