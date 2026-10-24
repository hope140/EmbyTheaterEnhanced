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
    assert.deepEqual(tool.CONFIG, {kind: 'next-prefix', progressPercent: 70, preloadMB: 300, timeoutMs: 30000});
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
test('derived runtime accepts only the fourteen exact maintained overlay paths and retains every other byte', () => {
    const f = inventories(); assert.doesNotThrow(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows));
    f.actual.set('electronapp/native-helper/ete-mpv-helper.exe', {size: 6, sha256: hash('tamper')});
    assert.throws(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows), /derived-file-mismatch/);
});
function loaderInventories() {
    const f = inventories(), loader = {...tool.LOADER, alreadyPresent: true};
    for (const member of [loader.sourcePath, loader.targetPath]) {
        f.base.set(member, {sha256: loader.sha256, size: loader.size});
        f.actual.set(member, {sha256: loader.sha256, size: loader.size});
    }
    return {...f, loader};
}
test('normal 043 loader copies are retained with no new derived member', () => {
    const f = loaderInventories(); assert.doesNotThrow(() => tool.verifyDerivedInventory(f.base, f.actual, f.rows, f.loader));
});
for (const mutation of ['source-hash','destination-hash','relation','missing-base-target']) test('retained 043 loader refuses '+mutation, () => {
    const f = loaderInventories();
    if(mutation==='source-hash') f.base.set(f.loader.sourcePath,{sha256:hash('changed'),size:f.loader.size});
    if(mutation==='destination-hash') f.actual.set(f.loader.targetPath,{sha256:hash('changed'),size:f.loader.size});
    if(mutation==='relation') f.loader.relation='unproven';
    if(mutation==='missing-base-target') f.base.delete(f.loader.targetPath);
    assert.throws(()=>tool.verifyDerivedInventory(f.base,f.actual,f.rows,f.loader));
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
    const total = tool.FIXTURE_SIZES[1], prefix = tool.CONFIG.preloadMB * 1000000;
    return [
        {type: 'manager-play-invocation'}, {type: 'load', item: 'A', generation: 1, direct: false},
        {type: 'native-property', generation: 1, name: 'time-pos', value: 5.7}, {type: 'range-preload', diskBefore: 0},
        {type: 'prefix-ready', bytes: prefix, targetBytes: prefix, diskBytes: prefix},
        {type: 'native-property', generation: 1, name: 'eof-reached', value: true}, {type: 'manager-next-track'},
        {type: 'origin-media', item: 'B', start: 0, end: 0}, {type: 'load', item: 'B', generation: 2, direct: false},
        {type: 'native-property', generation: 2, name: 'file-loaded'}, {type: 'native-property', generation: 2, name: 'core-idle', value: false},
        {type: 'native-property', generation: 2, name: 'time-pos', value: 0.3}, {type: 'decoded-B', width: 320, height: 180, vo: 'gpu-next'},
        {type: 'origin-media', item: 'B', start: 303809024, end: 304071167},
        {type: 'prefix-read', itemId: 'B', start: 0, end: 262143}
    ].map((row, seq) => ({seq, ...row})).concat([{seq: 1.5, type: 'native-property', generation: 1, name: 'duration', value: 8}]);
}
test('receipt validator checks min(P,total), actual automatic order and decoded B (synthetic validator evidence only)', () => {
    assert.equal(tool.validateTrace(validTrace(), tool.FIXTURE_SIZES[1]).targetBytes, 300000000);
});
for (const mutation of ['no-ready', 'no-eof', 'threshold-too-low', 'preload-too-early', 'late-ready', 'refetch', 'same-generation', 'no-decode', 'no-prefix-read', 'second-play', 'foreground-stored', 'wrong-budget-claim', 'renderer-failed', 'no-native-miss']) test('automatic acceptance refuses ' + mutation, () => {
    const trace = validTrace();
    if (mutation === 'no-ready') trace.splice(4, 1);
    if (mutation === 'no-eof') trace.splice(5, 1);
    if (mutation === 'threshold-too-low') trace[2].value = 5.5;
    if (mutation === 'preload-too-early') trace[3].seq = 1;
    if (mutation === 'late-ready') trace[4].seq = 6;
    if (mutation === 'refetch') trace.push({seq: 20, type: 'origin-media', item: 'B', start: 0, end: 262143});
    if (mutation === 'same-generation') trace[8].generation = 1;
    if (mutation === 'no-decode') trace.splice(trace.findIndex(row => row.type === 'decoded-B'), 1);
    if (mutation === 'no-prefix-read') trace.splice(trace.findIndex(row => row.type === 'prefix-read'), 1);
    if (mutation === 'no-native-miss') trace.splice(trace.findIndex(row => row.type === 'origin-media' && row.start > 0), 1);
    if (mutation === 'second-play') trace.push({seq: 20, type: 'manager-play-invocation'});
    if (mutation === 'foreground-stored') trace[3].diskBefore = 262144;
    if (mutation === 'wrong-budget-claim') trace[4].targetBytes = 100000000;
    if (mutation === 'renderer-failed') trace.push({seq: 20, type: 'renderer-failure'});
    assert.throws(() => tool.validateTrace(trace, tool.FIXTURE_SIZES[1]));
});
test('real-renderer boot uses production manager, adapter and queue modules without driving the protected chain', () => {
    const body = tool.rendererBoot.toString(); new Function('return (' + body + ')');
    assert.equal((body.match(/manager\.play\(/g) || []).length, 1);
    for (const forbidden of [/\.nextTrack\s*\(/, /\.tick\s*\(/, /\.preload\s*\(/, /_onStopped\s*\(/, /trigger\([^\n]*['"](?:stopped|timeupdate|core-playing)['"]/]) assert.doesNotMatch(body, forbidden);
    assert.match(body, /load\('playbackManager'\)/); assert.match(body, /load\('\.\.\/plugins\/libmpv\.js'\)/);
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
    Object.assign(window, context); window.window = window;
    vm.createContext(window);
    document.head = {appendChild(script) {
        script.src = new URL(script.src, 'file:///fixture/electronapp/www/').href;
        const member = new URL(script.src).pathname.split('/electronapp/')[1];
        queueMicrotask(() => {
            try {vm.runInContext(window.prefixHarness.source(member), window, {filename: member}); script.fire('load');}
            catch (error) {script.fire('error');}
        });
    }};
    const createElement = document.createElement;
    document.createElement = name => {
        if (name !== 'script') return createElement(name);
        const listeners = new Map();
        return {addEventListener(name, callback) {listeners.set(name, [...(listeners.get(name) || []), callback]);},
            fire(name) {for (const callback of listeners.get(name) || []) callback();}};
    };
    await vm.runInContext('(' + tool.rendererBoot.toString() + ')({origin:"http://127.0.0.1:1",windowId:"1",moduleBaseUrl:"file:///fixture/electronapp/www/"})', window);
    const loaded = reports.filter(row => row.type === 'module-loaded').map(row => row.member);
    for (const member of ['electronapp/www/modules/common/playback/playbackmanager.js', 'electronapp/www/modules/common/playback/playqueuemanager.js',
        'electronapp/plugins/libmpv.js', 'electronapp/enhanced/playback-range-renderer.js', 'electronapp/native-helper/client.js']) assert(loaded.includes(member), member + ': ' + JSON.stringify(reports));
    assert.equal(reports.filter(row => row.type === 'manager-play-invocation').length, 1);
    assert(calls.some(row => row.channel === 'enhanced-native-helper-call' && row.request?.operation === 'create'), JSON.stringify(reports));
    assert(reports.some(row => row.type === 'renderer-failure'));
    assert(!reports.some(row => row.type === 'initial-play-resolved'));
});

test('automatic AVI fixtures put B index beyond P and leave A 64 seconds for natural threshold warming', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prefix-avi-')); t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const support = require('../tools/playback-range-windows-smoke.cjs'), fixtures = tool.automaticFixtures(support, root);
    assert.deepEqual(fixtures.map(row => row.size), tool.FIXTURE_SIZES);
    const a = fs.readFileSync(path.join(root, 'A.avi')), b = fs.readFileSync(path.join(root, 'B.avi'));
    assert.equal(a.readUInt32LE(a.indexOf(Buffer.from('strh')) + 8 + 24), 3);
    const strh = a.indexOf(Buffer.from('strh')) + 8;
    const duration = a.readUInt32LE(strh + 32) * a.readUInt32LE(strh + 20) / a.readUInt32LE(strh + 24);
    assert.equal(duration,64); assert(Math.abs(duration * (1 - tool.CONFIG.progressPercent / 100) - 19.2) < 1e-8);
    const index = b.length - (8 + 192 * 16); assert(index > tool.CONFIG.preloadMB * 1000000);
    assert.equal(b.toString('ascii', index, index + 4), 'idx1'); assert.equal(b.readUInt32LE(4) + 8, b.length);
    assert.equal(hash(b), fixtures[1].sha256); assert(!fs.existsSync(path.join(root, 'B-seed.avi')));
});

test('driver identity accepts only LF/CRLF checkout equivalence and returns exact committed bytes', t => {
    const {execFileSync} = require('node:child_process'), repo = path.resolve(__dirname, '..');
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
    const blob = execFileSync('git', ['show', commit + ':tools/playback-prefix-windows-auto.cjs'], {cwd: repo});
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prefix-driver-eol-')); t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const driver = path.join(directory, 'driver.cjs'), crlf = Buffer.from(blob.toString('utf8').replace(/\r?\n/g, '\r\n'));
    assert.notEqual(hash(crlf), hash(blob), 'the preceding raw-byte guard rejects an ordinary CRLF checkout');
    for (const bytes of [blob, crlf]) {
        fs.writeFileSync(driver, bytes);
        const selected = tool.driverSource(repo, commit, driver);
        assert(selected.equals(blob), 'private driver is generated from exact Git bytes, preserving the later strict plan hash');
    }
    for (const bytes of [Buffer.concat([crlf, Buffer.from('// actual source drift\r\n')]), Buffer.concat([Buffer.from([239, 187, 191]), blob]), Buffer.from(blob.toString('utf8').replace('use strict', 'use unsafe'))]) {
        fs.writeFileSync(driver, bytes); assert.throws(() => tool.driverSource(repo, commit, driver), /driver-source-mismatch/);
    }
});
test('prepare CLI reports its bounded stage and filesystem reason before any runtime/helper execution', t => {
    const {spawnSync} = require('node:child_process'), directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prefix-prepare-error-'));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    const absent = path.join(directory, 'absent-input'), result = spawnSync(process.execPath, [path.join(__dirname, '../tools/playback-prefix-windows-auto.cjs'), 'prepare',
        '--tools=' + absent, '--source=' + directory, '--source-commit=' + 'a'.repeat(40), '--runtime=' + directory, '--zip=' + absent, '--out=' + path.join(directory, 'out')], {encoding: 'utf8'});
    assert.equal(result.status, 1); assert(!fs.existsSync(path.join(directory, 'out')));
    const receipt = JSON.parse(result.stderr.trim());
    assert.deepEqual(receipt, {type: 'next-auto-prepare-failure', stage: 'resolve-inputs', code: 'prepare-filesystem-error', systemCode: 'ENOENT', gitExitCode: null});
    assert(!result.stderr.includes(directory)); assert(!result.stderr.includes(absent));
});
test('prepare diagnostic preserves exact fixed reasons but removes arbitrary exception text', () => {
    const canary = 'synthetic-private-error-canary';
    assert.equal(tool.prepareFailure({message: 'driver-source-mismatch', prepareStage: 'driver-source'}).code, 'driver-source-mismatch');
    assert.equal(tool.prepareFailure({message: 'candidate-maintained-source:' + canary, prepareStage: 'verify-base'}).code, 'candidate-maintained-source');
    const diagnostic = tool.prepareFailure({message: canary, stack: canary, prepareStage: canary, code: canary});
    assert.equal(diagnostic.code, 'prepare-unexpected-error'); assert(!JSON.stringify(diagnostic).includes(canary));
});


test('043 derivation binds all fourteen exact maintained paths and excludes old persistent range engine', () => {
    assert.equal(tool.OVERLAY.length,14); assert(tool.OVERLAY.includes('enhanced/playback-range-identity.js'));
    assert(!tool.OVERLAY.includes('enhanced/playback-range-store.js'));
    assert(tool.OVERLAY.includes('main.js')); assert(tool.OVERLAY.includes('plugins/libmpv.js'));
    const body=fs.readFileSync(path.join(__dirname,'../tools/playback-prefix-windows-auto.cjs'),'utf8');
    assert.doesNotMatch(body,/COPYFILE_EXCL/); assert.match(body,/verifyNativeMedia\(source, derived\)/);
    assert.match(body,/Promise\.all\(\[pending, destroy\]\)/);
    assert.match(body,/service\.capturePreview\(owner\)/);
    assert.match(body,/previewOwner: \(\) => mainWindow/);
});

const zlib = require('node:zlib'), support = require('../tools/playback-range-windows-smoke.cjs');
async function temporary(t) {const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-043-archive-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function zip(body, method = 8, flags = 0) {
    const name = Buffer.from('candidate.exe.provenance.json'), raw = Buffer.from(body), packed = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(name.length, 28);
    const offset = local.length + name.length + packed.length, end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat([local, name, packed, central, name, end]);
}
for (const method of [0, 8]) test('bounded ZIP provenance reader accepts archived JSON, method ' + method, async t => {
    const dir = await temporary(t), file = path.join(dir, 'artifact.zip'), body = {sourceCommit: support.CANDIDATE.commit, runtimeManifestSha256: 'a'.repeat(64)};
    fs.writeFileSync(file, zip(JSON.stringify(body), method)); assert.deepEqual(support.zipReceipts(file), [body]);
});
for (const [label, value] of [['encrypted', zip('{}', 8, 1)], ['unsupported codec', zip('{}', 9)], ['oversized', zip(' '.repeat(65537))], ['truncated', Buffer.from('PK')]]) test('ZIP reader refuses ' + label, async t => {
    const dir = await temporary(t), file = path.join(dir, 'bad.zip'); fs.writeFileSync(file, value); assert.throws(() => support.zipReceipts(file));
});

test('exact current source overlays and already-present 043 loader bind to committed Git bytes',()=>{
    const repo=path.resolve(__dirname,'..'), cp=require('node:child_process');
    const commit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim();
    const base=new Map([tool.LOADER.sourcePath,tool.LOADER.targetPath].map(p=>[p,{size:tool.LOADER.size,sha256:tool.LOADER.sha256}]));
    const descriptor=tool.loaderDescriptor(repo,commit,base);
    assert.equal(descriptor.alreadyPresent,true); assert.equal(descriptor.generatorPath,'tools/windows-native-media-input.cjs');
    const rows=tool.overlayRows(repo,commit,base);assert.equal(rows.length,14);
    const changed=cp.execFileSync('git',['diff','--name-only',support.CANDIDATE.commit,tool.PRODUCT_INPUT_COMMIT,'--','src'],{cwd:repo,encoding:'utf8'}).trim().split(/\r?\n/).sort();
    assert.deepEqual(rows.map(row=>row.source).sort(),changed);
    for(const row of rows) assert.equal(hash(row.bytes),row.sha256);
});
for(const mutation of ['none','file-hash','source','extra','missing','manifest-hash']) test('physical 043 manifest gate: '+mutation,t=>{
    const dir=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-043-manifest-')));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    fs.writeFileSync(path.join(dir,'payload.asar'),'physical archive bytes');
    const row={path:'payload.asar',sha256:hash('physical archive bytes')};
    const manifest={schemaVersion:3,sourceCommit:support.CANDIDATE.commit,files:[row],payload:{fileCount:1,payloadSetSha256:hash(row.path+'\0'+row.sha256+'\n')}};
    if(mutation==='source') manifest.sourceCommit='0'.repeat(40);
    const bytes=Buffer.from(JSON.stringify(manifest));fs.writeFileSync(path.join(dir,'build-manifest.json'),bytes);
    if(mutation==='file-hash') fs.writeFileSync(path.join(dir,'payload.asar'),'changed');
    if(mutation==='extra') fs.writeFileSync(path.join(dir,'unexpected'),'changed');
    if(mutation==='missing') fs.unlinkSync(path.join(dir,'payload.asar'));
    let reads=0;const inventory=base=>{reads++;return require('../tools/verify-installer-runtime.cjs').inventory(base);};
    const check=()=>support.verifyPayload(dir,mutation==='manifest-hash'?'0'.repeat(64):hash(bytes),inventory);
    if(mutation==='none'){assert.equal(check().inventory.get('payload.asar').size,22);assert.equal(reads,1);}
    else assert.throws(check,/candidate-runtime-/);
});

function jointFixture(failure) {
    const owner={endpointId:'11111111-1111-1111-1111-111111111111',generationId:101};
    const trace=[{seq:0,type:'load',item:'A',generation:101},{seq:1,type:'native-property',generation:101,name:'duration',value:64},{seq:2,type:'native-property',generation:101,name:'time-pos',value:45},
        {seq:3,type:'origin-client-open',item:'B',start:262144,end:524287,clientRequest:1,backgroundActive:1},
        {seq:4,type:'matrix-held',item:'B',start:262144,end:524287}];
    let destroyed=false,captures=0,resolvePreview;const origin={held:{response:{destroyed:false}},releaseHeld:()=>origin.held.response.destroyed?0:1};
    const record=(type,data={})=>trace.push({seq:trace.length,type,...data});
    const service={rangeStatus:()=>({kind:'next-prefix',maxBytes:300000000,diskBytes:destroyed?0:262144}),
        isPreviewOwner:()=>!destroyed&&failure!=='owner',
        capturePreview:()=>++captures===1?Promise.resolve(failure==='frame'?null:{owner,width:1,height:1,pixels:Buffer.alloc(4)}):new Promise(resolve=>{resolvePreview=resolve;}),
        destroy:async()=>{destroyed=true;origin.held.response.destroyed=true;record('origin-client-closed',{clientRequest:1});resolvePreview(failure==='late'?{}:null);}};
    return {phase:'matrix-exit',service,origin,trace,record,fatal:()=>false,previewOwner:async()=>owner,
        action:async operation=>{assert.equal(operation,'pause');record('native-property',{generation:101,name:'pause',value:true});}};
}
test('existing held-exit coordinator requires real-owner preview, pending work, retirement and late-drop gates (synthetic validator only)',async()=>{
    const result=await tool.matrixCase(jointFixture());assert.equal(result.jointDrainCompleted,true);
    assert.equal(result.nativePreviewDecoded,true);assert.equal(result.previewWidth,1);assert.equal(result.previewHeight,1);assert.equal(result.heldRequestClosed,true);assert.equal(result.lateBytes,0);
});
for(const [failure,reason] of [['owner','joint-preview-owner-unavailable'],['frame','joint-preview-native-decode-missing'],['late','joint-late-preview-published']])
 test('held-exit acceptance refuses '+failure+' in its synthetic validator',async()=>{await assert.rejects(tool.matrixCase(jointFixture(failure)),new RegExp(reason));});

test('incomplete EOF preserves original-next progress but cannot satisfy ready-before-EOF acceptance (synthetic diagnostic fixture)',()=>{
    const trace=validTrace().filter(row=>row.type!=='prefix-ready');
    trace.push({seq:7.5,type:'range-preload-result',state:'cancelled',source:'must-not-be-published'});
    const order=tool.automaticOrder(trace);assert.equal(order.readySeq,null);
    assert.equal(order.naturalEOFSeq,5);assert.equal(order.originalNextSeq,6);assert.equal(order.bLoadSeq,8);assert.equal(order.preloadCancelledSeq,7.5);
    assert.throws(()=>tool.validateTrace(trace,tool.FIXTURE_SIZES[1]),/automatic-chain-order-missing/);
    assert(!JSON.stringify(order).includes('must-not-be-published'));
});
