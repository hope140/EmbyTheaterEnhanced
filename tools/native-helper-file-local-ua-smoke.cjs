'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {app, BrowserWindow} = require('electron');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const {decimalWindowHandle, EXPECTED_LIBMPV_VERSION} = require('../src/electronapp/native-helper/service');

const args = process.argv.slice(2).map(value => path.resolve(value));
if (args.length !== 4) throw new Error('Usage: electron native-helper-file-local-ua-smoke.cjs <helper> <libmpv> <media> <output>');
const [helperPath, libmpvPath, mediaPath, outputPath] = args;
const result = {schemaVersion: 1, status: 'running'};
let host;
let client;
let server;

function startServer() {
  const bytes = fs.readFileSync(mediaPath);
  const requests = [];
  server = http.createServer(function (request, response) {
    const label = new URL(request.url, 'http://127.0.0.1').searchParams.get('case') || 'unknown';
    requests.push({label, userAgent: request.headers['user-agent'] || null, authorizationPresent: !!request.headers.authorization, rangePresent: !!request.headers.range});
    let start = 0, end = bytes.length - 1;
    const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    if (match) {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
      response.writeHead(206, {'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1});
    } else response.writeHead(200, {'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': bytes.length});
    response.end(bytes.subarray(start, end + 1));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({port: server.address().port, requests}));
  });
}

async function play(label, loadArgs) {
  const generation = client.beginGeneration(label, ['core-idle', 'path']);
  client.load(loadArgs);
  await client.waitFor(() => client.timeline.some(event => event.generationId === generation && event.name === 'core-idle' && event.value === false && event.action === 'ACCEPT'), 10000, label + ':playing');
}

async function run() {
  const fixture = await startServer();
  host = new BrowserWindow({width: 640, height: 360, frame: false, show: true, backgroundColor: '#000'});
  await host.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<style>html,body{margin:0;background:#000}</style>'));
  client = new NativeHelperClient({helperPath, libmpvPath, parentWindowHandle: decimalWindowHandle(host), expectedLibmpvVersion: EXPECTED_LIBMPV_VERSION});
  await client.start();
  const base = `http://127.0.0.1:${fixture.port}/media.mp4?case=`;
  await play('A', ['loadfile', base + 'A', 'replace', '-1', 'user-agent=ETE-A/1.0']);
  await play('B', ['loadfile', base + 'B', 'replace', '-1', 'user-agent=ETE-B/1.0']);
  await play('C', ['loadfile', base + 'C']);
  await new Promise(resolve => setTimeout(resolve, 300));
  const byLabel = Object.fromEntries(['A', 'B', 'C'].map(label => [label, fixture.requests.filter(entry => entry.label === label)]));
  const pass = byLabel.A.length > 0 && byLabel.B.length > 0 && byLabel.C.length > 0 &&
    byLabel.A.every(entry => entry.userAgent === 'ETE-A/1.0' && !entry.authorizationPresent) &&
    byLabel.B.every(entry => entry.userAgent === 'ETE-B/1.0' && !entry.authorizationPresent) &&
    byLabel.C.every(entry => entry.userAgent !== 'ETE-A/1.0' && entry.userAgent !== 'ETE-B/1.0' && !entry.authorizationPresent);
  result.status = pass ? 'passed' : 'failed';
  result.cases = byLabel;
  result.fileLocalUserAgentIsolation = pass;
}

app.whenReady().then(run).catch(error => {
  result.status = 'failed';
  result.error = {name: error.name, message: error.message};
}).finally(async () => {
  try { if (client) await client.kill(); } catch (_) { }
  try { if (server) await new Promise(resolve => server.close(resolve)); } catch (_) { }
  try { if (host && !host.isDestroyed()) host.destroy(); } catch (_) { }
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  app.exit(result.status === 'passed' ? 0 : 1);
});
