'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const vm = require('node:vm');
const tool = require('../tools/playback-prefix-windows-auto.cjs');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

test('import and argument gates provide no implicit Windows or native execution', () => {
    assert.equal(tool.TOOLS_COMMIT, 'c9cd9bacf81445c9c10befd121951b1c63c86faa');
    assert.deepEqual(tool.CONFIG, {kind: 'next-prefix', progressPercent: 70, preloadMB: 100, timeoutMs: 30000});
    for (const args of [[], ['run', '--plan=a'], ['entry-smoke', '--plan=a'], ['run', '--plan=a', '--plan=b', '--execute-native'], ['run', '--plan=a', '--execute-native', '--force']]) assert.throws(() => tool.argumentsOf(args));
    assert.deepEqual(tool.argumentsOf(['run', '--plan=a', '--execute-native']).values, {plan: 'a', 'execute-native': true});
});
test('invalid candidate preparation fails before creating the output', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prefix-plan-gate-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const out = path.join(root, 'out');
    assert.throws(() => tool.prepare({tools: path.join(root, 'absent-tools'), source: root, sourceCommit: '0'.repeat(40), runtime: root, zip: path.join(root, 'missing.zip'), out}));
    assert.equal(fs.existsSync(out), false);
});
test('test children have owned profile paths and no token or Node/proxy injection', () => {
    const original = {GITHUB_TOKEN: 'secret', gh_token: 'secret', ACTIONS_RUNTIME_TOKEN: 'secret', NODE_OPTIONS: '--inspect', https_proxy: 'sensitive', PATH: 'kept'};
    const environment = tool.cleanEnvironment({out: path.resolve('owned')}, original);
    for (const name of Object.keys(original).filter(key => key !== 'PATH')) assert.equal(environment[name], undefined);
    assert.equal(environment.PATH, 'kept'); assert.equal(original.GITHUB_TOKEN, 'secret');
    assert.equal(environment.APPDATA, path.resolve('owned/profile')); assert.equal(environment.NO_PROXY, '127.0.0.1,localhost');
});
function inventories() {
    const base = new Map([['build-manifest.json', {size: 3, sha256: hash('old')}], ['electronapp/native-helper/ete-mpv-helper.exe', {size: 6, sha256: hash('native')}]]);
    const actual = new Map(base), rows = tool.OVERLAY.map(relative => {
        const member = 'electronapp/' + relative, row = {member, source: 'src/' + member, sourceCommit: '1'.repeat(40), beforeSha256: null, sha256: hash(relative), size: relative.length};
        actual.set(member, row); return row;
    }); return {base, actual, rows};
}
test('derived runtime accepts only the six exact maintained overlay paths and retains every other byte', () => {
    const f = inventories(); assert.doesNotThrow(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows));
    f.actual.set('electronapp/native-helper/ete-mpv-helper.exe', {size: 6, sha256: hash('tamper')});
    assert.throws(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows), /derived-file-mismatch/);
});
test('reviewed loader is a unique locked addition while every original member stays unchanged', () => {
    const f = inventories(), loader = {...tool.LOADER};
    f.base.set(loader.sourcePath, {sha256: loader.sha256, size: loader.size});
    f.actual.set(loader.sourcePath, {sha256: loader.sha256, size: loader.size});
    f.actual.set(loader.targetPath, {sha256: loader.sha256, size: loader.size});
    assert.doesNotThrow(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows, loader));
    f.actual.delete(loader.targetPath); assert.throws(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows, loader));
});
for (const mutation of ['source-hash', 'destination-hash', 'relation', 'already-present']) test('loader derivation refuses ' + mutation, () => {
    const f = inventories(), loader = {...tool.LOADER};
    f.base.set(loader.sourcePath, {sha256: loader.sha256, size: loader.size});
    f.actual.set(loader.sourcePath, {sha256: loader.sha256, size: loader.size}); f.actual.set(loader.targetPath, {sha256: loader.sha256, size: loader.size});
    if (mutation === 'source-hash') f.base.set(loader.sourcePath, {sha256: hash('changed'), size: loader.size});
    if (mutation === 'destination-hash') f.actual.set(loader.targetPath, {sha256: hash('changed'), size: loader.size});
    if (mutation === 'relation') loader.relation = 'unproven';
    if (mutation === 'already-present') f.base.set(loader.targetPath, f.actual.get(loader.targetPath));
    assert.throws(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows, loader));
});
for (const mutation of ['extra', 'missing', 'wrong-source', 'duplicate', 'dll-overlay', 'changed-hash', 'new-manifest']) test('derived identity refuses ' + mutation, () => {
    const f = inventories();
    if (mutation === 'extra') f.actual.set('unexpected.js', {size: 1, sha256: hash('x')});
    if (mutation === 'missing') f.actual.delete(f.rows[0].member);
    if (mutation === 'wrong-source') f.rows[0].source = 'src/other.js';
    if (mutation === 'duplicate') f.rows[0] = f.rows[1];
    if (mutation === 'dll-overlay') f.rows[0] = {...f.rows[0], member: 'electronapp/libmpv/x64/mpv-1.dll'};
    if (mutation === 'changed-hash') f.actual.set(f.rows[0].member, {...f.rows[0], sha256: hash('changed')});
    if (mutation === 'new-manifest') f.actual.set('build-manifest.json', {size: 3, sha256: hash('new')});
    assert.throws(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows));
});
test('overlay rows bind every source hash to the exact declared source commit', () => {
    const {rows} = inventories(), sources = rows.map(row => ({...row, bytes: Buffer.alloc(row.size)}));
    assert.doesNotThrow(() => tool.verifyOverlaySource(rows, sources, '1'.repeat(40)));
    assert.throws(() => tool.verifyOverlaySource(rows, sources, '2'.repeat(40)), /source-relationship/);
    const changed = structuredClone(rows); changed[0].sha256 = hash('other-source');
    assert.throws(() => tool.verifyOverlaySource(changed, sources, '1'.repeat(40)), /source-relationship/);
});
function validTrace() {
    const total = 33182440;
    return [
        {type: 'manager-play-invocation'}, {type: 'load', item: 'A', generation: 1, direct: false},
        {type: 'native-property', generation: 1, name: 'time-pos', value: 5.7}, {type: 'range-preload', diskBefore: 0},
        {type: 'prefix-ready', bytes: total, targetBytes: total, diskBytes: total},
        {type: 'native-property', generation: 1, name: 'eof-reached', value: true}, {type: 'adapter-next'},
        {type: 'origin-media', item: 'B', start: 0, end: 0}, {type: 'load', item: 'B', generation: 2, direct: false},
        {type: 'native-property', generation: 2, name: 'file-loaded'}, {type: 'native-property', generation: 2, name: 'core-idle', value: false},
        {type: 'native-property', generation: 2, name: 'time-pos', value: 0.3}, {type: 'decoded-B', width: 320, height: 180, vo: 'gpu-next'},
        {type: 'prefix-read', itemId: 'B', start: 0, end: 262143}
    ].map((row, seq) => ({seq, ...row}));
}
test('receipt validator checks min(P,total), actual automatic order and decoded B (synthetic validator evidence only)', () => {
    assert.equal(tool.validateTrace(validTrace(), 33182440).targetBytes, 33182440);
});
for (const mutation of ['no-eof', 'threshold-too-low', 'preload-too-early', 'late-ready', 'refetch', 'same-generation', 'no-decode', 'no-prefix-read', 'second-play', 'foreground-stored', '300MB-claim', 'renderer-failed']) test('automatic acceptance refuses ' + mutation, () => {
    const trace = validTrace();
    if (mutation === 'no-eof') trace.splice(5, 1);
    if (mutation === 'threshold-too-low') trace[2].value = 5.5;
    if (mutation === 'preload-too-early') trace[3].seq = 1;
    if (mutation === 'late-ready') trace[4].seq = 6;
    if (mutation === 'refetch') trace.push({seq: 20, type: 'origin-media', item: 'B', start: 0, end: 262143});
    if (mutation === 'same-generation') trace[8].generation = 1;
    if (mutation === 'no-decode') trace.splice(trace.findIndex(row => row.type === 'decoded-B'), 1);
    if (mutation === 'no-prefix-read') trace.pop();
    if (mutation === 'second-play') trace.push({seq: 20, type: 'manager-play-invocation'});
    if (mutation === 'foreground-stored') trace[3].diskBefore = 262144;
    if (mutation === '300MB-claim') trace[4].targetBytes = 300000000;
    if (mutation === 'renderer-failed') trace.push({seq: 20, type: 'renderer-failure'});
    assert.throws(() => tool.validateTrace(trace, 33182440));
});
test('real-renderer boot uses production manager, adapter and queue modules without driving the protected chain', () => {
    const body = tool.rendererBoot.toString(); new Function('return (' + body + ')');
    assert.equal((body.match(/manager\.play\(/g) || []).length, 1);
    for (const forbidden of [/\.nextTrack\s*\(/, /\.tick\s*\(/, /\.preload\s*\(/, /_onStopped\s*\(/, /trigger\([^\n]*['"](?:stopped|timeupdate|core-playing)['"]/]) assert.doesNotMatch(body, forbidden);
    assert.match(body, /load\('playbackManager'\)/); assert.match(body, /load\('plugins\/libmpv\.js'\)/);
    assert.doesNotMatch(body, /stubs\[[^\n]*(?:managerId|eventsId|playqueuemanager|range-renderer|native-helper)/);
    assert(tool.BOUNDARIES.includes('hidden-window-show-focus-suppression'));
});
test('Node substituted document loads real AMD manager/queue/adapter and refuses an unavailable native boundary; not Windows evidence', {timeout: 4000}, async () => {
    const repo = path.resolve(__dirname, '..'), reports = [], calls = [];
    const body = {insertBefore(element) {element.parentNode = body;}, removeChild(element) {element.parentNode = null;}, firstChild: null};
    const document = {body, querySelector: () => null, createElement: () => ({style: {}, classList: {add() {}, remove() {}}, parentNode: null})};
    const item = id => ({Id: id, ServerId: 'prefix-server', Name: id, Type: 'Episode', MediaType: 'Video', SeriesId: 'synthetic-series', Path: id + '.avi', RunTimeTicks: 80000000,
        MediaSources: [{Id: id + '-avi', Protocol: 'Http', Container: 'avi', SupportsDirectPlay: false, SupportsDirectStream: true, RunTimeTicks: 80000000, MediaStreams: []}]});
    const window = {document, localStorage: {getItem: () => null, setItem() {}}, addEventListener() {}, innerWidth: 320, innerHeight: 180,
        prefixHarness: {report: row => reports.push(row), source(member) {
            const file = member.startsWith('www/') ? path.join(repo, 'vendor/web-snapshot', member) : path.join(repo, 'src/electronapp', member);
            return fs.readFileSync(file, 'utf8');
        }, invoke(channel, request) {calls.push({channel, request}); return Promise.reject(Error('native-deliberately-unavailable'));}, send() {}, listen() {}, unlisten() {}}};
    const context = {window, document, console: {log() {}, warn() {}, error() {}}, URL, AbortController, TextDecoder, Event, CustomEvent,
        setTimeout, clearTimeout, setInterval, clearInterval, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
        MutationObserver: class {observe() {} disconnect() {}}, screen: {width: 640, height: 480},
        fetch: async value => ({ok: true, json: async () => {
            const url = new URL(value); if (url.pathname === '/Users/anonymous') return {Configuration: {EnableNextEpisodeAutoPlay: true}};
            const id = /\/(A|B)(?:\/PlaybackInfo)?$/.exec(url.pathname)?.[1];
            if (url.pathname.endsWith('/PlaybackInfo')) return {PlaySessionId: 'fixture-' + id, MediaSources: item(id).MediaSources};
            return item(id);
        }})};
    await vm.runInNewContext('(' + tool.rendererBoot.toString() + ')({origin:"http://127.0.0.1:1",windowId:"1"})', context);
    const loaded = reports.filter(row => row.type === 'module-loaded').map(row => row.member);
    for (const member of ['electronapp/www/modules/common/playback/playbackmanager.js', 'electronapp/www/modules/common/playback/playqueuemanager.js',
        'electronapp/plugins/libmpv.js', 'electronapp/enhanced/playback-range-renderer.js', 'electronapp/native-helper/client.js']) assert(loaded.includes(member), member + ': ' + JSON.stringify(reports));
    assert.equal(reports.filter(row => row.type === 'manager-play-invocation').length, 1);
    assert(calls.some(row => row.channel === 'enhanced-native-helper-call' && row.request?.operation === 'create'), JSON.stringify(reports));
    assert(reports.some(row => row.type === 'renderer-failure'));
    assert(!reports.some(row => row.type === 'initial-play-resolved'));
});
