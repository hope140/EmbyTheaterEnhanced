'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {spawn} = require('node:child_process'), readline = require('node:readline');
const {fixture, media, token} = require('./helpers/advance-download-fixture.cjs');
const {createStore} = require('../src/electronapp/enhanced/advance-download/task-store');

function child(t, input) {
    const process = spawn(global.process.execPath, [path.join(__dirname, 'helpers/advance-download-process.cjs')], {stdio: ['pipe', 'pipe', 'pipe']});
    let stderr = '';
    process.stderr.on('data', chunk => {stderr += chunk;});
    const exited = new Promise(resolve => {process.once('exit', (code, signal) => resolve({code, signal}));});
    const marker = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('owned download process deadline')), 10000);
        const lines = readline.createInterface({input: process.stdout});
        lines.once('line', value => {clearTimeout(timer); try {resolve(JSON.parse(value));} catch (_) {reject(Error('invalid process marker'));}});
        process.once('error', error => {clearTimeout(timer); reject(error);});
        process.once('exit', code => {clearTimeout(timer); if (code) reject(Error('download child failed: ' + stderr));});
    });
    t.after(async () => {if (process.exitCode === null && process.signalCode === null) process.kill('SIGKILL'); await exited;});
    process.stdin.end(JSON.stringify(input));
    return {process, marker, exited};
}

for (const mode of ['pause', 'crash']) test('a real second process resumes after ' + mode + ' without trusting uncommitted file length', {timeout: 20000}, async t => {
    const f = await fixture(t);
    f.state.sourcePath = f.cdn + '/direct'; f.state.pauseTransfer = true;
    if (mode === 'crash') {f.state.body = Buffer.alloc(12582912, 7); media.subarray(0, 4).copy(f.state.body); f.state.pauseBytes = 9437184;}
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-two-process-download-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const profile = path.join(root, 'profile'), directory = path.join(root, 'media');
    fs.mkdirSync(profile); fs.mkdirSync(directory);
    const context = {serverId: 'server', accountId: 'account', itemId: 'item', mediaSourceId: 'source', serverAddress: f.emby + '/base', token};
    const first = child(t, {mode, profile, directory, context});
    const mark = await first.marker;
    if (mode === 'crash') {assert.equal(mark.phase, 'durable'); first.process.kill('SIGKILL');}
    else assert.equal(mark.phase, 'paused');
    const firstExit = await first.exited;
    assert.ok(mode === 'crash' ? firstExit.signal : firstExit.code === 0);
    const task = createStore(profile).get(mark.id), offset = task.partial.offset;
    assert.ok(offset > 0 && offset < f.state.body.length);
    if (mode === 'crash') assert.ok(fs.statSync(path.join(directory, task.partial.name)).size >= offset);
    f.state.pauseTransfer = false;
    const second = child(t, {mode: 'resume', profile, directory, context});
    const completed = await second.marker;
    assert.equal(completed.phase, 'complete');
    assert.equal((await second.exited).code, 0);
    assert.ok(f.calls.some(call => call.headers.range === 'bytes=' + offset + '-'));
    assert.deepEqual(fs.readFileSync(path.join(directory, completed.fileName)), f.state.body);
    assert.equal(createStore(profile).get(mark.id).state, 'complete');
});
