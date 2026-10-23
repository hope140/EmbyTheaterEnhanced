'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {createStore} = require('../src/electronapp/enhanced/playback-cache-store');
const {createTrial} = require('../src/electronapp/enhanced/playback-cache-trial');
const {createService} = require('../src/electronapp/native-helper/service');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');

const identity = {serverId: 'fixture-server', accountId: 'fixture-account', itemId: 'fixture-item',
    mediaSourceId: 'fixture-source', versionId: 'version-one', representationId: 'pcm-wav'};
const policy = {maxBytes: 1024, maxEntries: 2, ttlMs: 1000, minFreeBytes: 0};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function wav() {
    const bytes = Buffer.alloc(60); bytes.write('RIFF'); bytes.writeUInt32LE(52, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24);
    bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
    bytes.write('data', 36); bytes.writeUInt32LE(16, 40); return bytes;
}
function inputs(t, partial = false) {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-source-trial-')));
    const sourceRoot = path.join(parent, 'sources'); fs.mkdirSync(sourceRoot);
    const source = path.join(sourceRoot, 'original.wav'); fs.writeFileSync(source, wav());
    let now = 1000, context = {serverId: identity.serverId, accountId: identity.accountId, authEpoch: 1};
    const proof = () => ({authorized: true, mode: 'direct-file', rangeSupported: true, contentLength: wav().length,
        strongETag: '"version-one"', validUntil: 5000});
    const store = createStore({enabled: true, parent, policy, now: () => now});
    const writer = store.begin(identity, proof()); writer.append(0, partial ? wav().subarray(0, 30) : wav()); writer.release(); store.close();
    const args = {config: {enabled: true, testOnly: true, policy: {...policy}, networkPolicy: 'offline-fixtures-only',
        activeLeasePolicy: 'retain-until-media-close', verificationTimeoutMs: 100},
        parent, fixtureSourceRoot: sourceRoot, catalog: [{source, identity}], now: () => now,
        getContext: () => context, revalidate: () => ({identity, context: {...context}, proof: proof()})};
    const cleanups = [];
    t.after(async () => { try { for (const cleanup of cleanups.reverse()) await cleanup(); } finally { fs.rmSync(parent, {recursive: true, force: true}); } });
    return {parent, source, args, proof, cleanup: callback => cleanups.push(callback), time(value) { now = value; }, context(value) { context = {...context, ...value}; },
        bytesPath: () => path.join(parent, 'playback-cache-prototype-v1', fs.readdirSync(path.join(parent, 'playback-cache-prototype-v1')).find(name => name.endsWith('.bytes')))};
}
function helper() {
    const exit = deferred();
    return {exitPromise: exit.promise, exit: exit.resolve};
}

test('no explicit full trial policy means no initialization or verification', t => {
    const f = inputs(t); let calls = 0;
    for (const config of [undefined, {...f.args.config, enabled: false}, {...f.args.config, networkPolicy: undefined},
        {...f.args.config, policy: {...policy, ttlMs: undefined}}, {...f.args.config, activeLeasePolicy: undefined}]) {
        assert.deepEqual(createTrial({...f.args, config, revalidate() { calls++; }}), {enabled: false});
    }
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(path.join(f.parent, 'playback-cache-prototype-v1', 'lock')), false);
});

test('a complete source is pinned beyond TTL until the exact media closes; logical retirement is insufficient', async t => {
    const f = inputs(t), trial = createTrial(f.args), owned = helper();
    f.cleanup(() => trial.close());
    const selection = await trial.select(f.source, owned, 1, () => true);
    assert.equal(fs.readFileSync(selection.source).equals(wav()), true); selection.started(7);
    f.time(2500); trial.prune(); assert.equal(fs.existsSync(selection.source), true); assert.equal(trial.status().pinnedEntries, 1);
    trial.mediaClosed(owned, 2, 7); trial.mediaClosed(owned, 1, 8); trial.mediaClosed(helper(), 1, 7);
    trial.prune(); assert.equal(fs.existsSync(selection.source), true);
    trial.mediaClosed(owned, 1, 7); trial.mediaClosed(owned, 1, 7); trial.prune();
    assert.equal(fs.existsSync(selection.source), false); assert.equal(trial.status().pinnedEntries, 0);
});

test('actual owned process exit releases an unattributed lease; uncertain or unrelated exit does not', async t => {
    const f = inputs(t), trial = createTrial(f.args), owned = helper(); f.cleanup(() => trial.close());
    const selection = await trial.select(f.source, owned, 1, () => true);
    helper().exit(); await flush(); assert.equal(trial.status().pinnedEntries, 1);
    owned.exit(); await flush(); assert.equal(trial.status().pinnedEntries, 0);
    f.time(2500); trial.prune(); assert.equal(fs.existsSync(selection.source), false);
});

test('authorization or TTL changing after acquisition prevents first dispatch without deleting a pinned object', async t => {
    const f = inputs(t), trial = createTrial(f.args), owned = helper(); f.cleanup(() => trial.close());
    const selection = await trial.select(f.source, owned, 1, () => true);
    assert.equal(selection.canDispatch(), true); f.context({authEpoch: 2}); assert.equal(selection.canDispatch(), false);
    f.context({authEpoch: 1}); f.time(2500); assert.equal(selection.canDispatch(), false);
    trial.prune(); assert.equal(fs.existsSync(selection.source), true);
    selection.cancelBeforeDispatch(); trial.prune(); assert.equal(trial.status().entries, 0);
});

test('fresh authorization must match server/account/version/representation and remain current throughout verification', async t => {
    const f = inputs(t); const entered = deferred(), grant = deferred();
    f.args.revalidate = () => { entered.resolve(); return grant.promise; };
    const trial = createTrial(f.args); f.cleanup(() => trial.close()); const owned = helper();
    const pending = trial.select(f.source, owned, 1, () => true); await entered.promise;
    f.context({authEpoch: 2}); grant.resolve({identity, context: {serverId: identity.serverId, accountId: identity.accountId, authEpoch: 1}, proof: f.proof()});
    assert.equal(await pending, null); assert.equal(trial.status().pinnedEntries, 0);
    for (const field of ['serverId', 'accountId', 'versionId', 'representationId']) {
        f.args.revalidate = () => ({identity: {...identity, [field]: 'different'},
            context: {serverId: identity.serverId, accountId: identity.accountId, authEpoch: 2}, proof: f.proof()});
        assert.equal(await trial.select(f.source, owned, (owned.generation = (owned.generation || 1) + 1), () => true), null);
    }
});

test('missing, corrupt and unauthorized cache objects yield no local source', async t => {
    const f = inputs(t); let grantProof = f.proof();
    f.args.revalidate = request => ({identity, context: request.context, proof: grantProof});
    const trial = createTrial(f.args); f.cleanup(() => trial.close()); const owned = helper();
    grantProof = {...f.proof(), authorized: false}; assert.equal(await trial.select(f.source, owned, 1, () => true), null);
    grantProof = f.proof(); fs.writeFileSync(f.bytesPath(), Buffer.alloc(60, 1));
    assert.equal(await trial.select(f.source, owned, 2, () => true), null);
    fs.unlinkSync(f.bytesPath()); assert.equal(await trial.select(f.source, owned, 3, () => true), null);
    assert.equal(trial.status().pinnedEntries, 0);
});

test('a valid partial checkpoint cannot become a local playback source', async t => {
    const f = inputs(t, true), trial = createTrial(f.args); f.cleanup(() => trial.close());
    assert.equal(await trial.select(f.source, helper(), 1, () => true), null);
    assert.equal(trial.status().committedBytes, 30); assert.equal(trial.status().pinnedEntries, 0);
});

test('timeout falls back without blocking playback and bounds an uncooperative verifier to one pending record', async t => {
    const f = inputs(t), grant = deferred(); let calls = 0;
    f.args.config.verificationTimeoutMs = 10;
    f.args.revalidate = request => { calls++; return grant.promise.then(() => ({identity, context: request.context, proof: f.proof()})); };
    const trial = createTrial(f.args); f.cleanup(() => trial.close()); const owned = helper();
    assert.equal(await trial.select(f.source, owned, 1, () => true), null);
    assert.equal(await trial.select(f.source, owned, 2, () => true), null); assert.equal(calls, 1);
    assert.equal(trial.status().pendingVerification, true); assert.equal(trial.status().pinnedEntries, 0);
    grant.resolve(); await flush(); assert.equal(trial.status().pendingVerification, false);
    assert.equal(trial.status().pinnedEntries, 0);
});

class Window extends EventEmitter {
    constructor() { super(); this.messages = []; this.webContents = {isDestroyed: () => false, send: (_channel, message) => this.messages.push(message)}; this.bounds = {x: 0, y: 0, width: 100, height: 100}; }
    isDestroyed() { return false; } isVisible() { return false; } isMinimized() { return false; }
    getBounds() { return this.bounds; } setBounds() {} getNativeWindowHandle() { return Buffer.alloc(8, 1); }
    setMenu() {} loadURL() { return Promise.resolve(); } showInactive() {} hide() {} destroy() {}
}
let generation = 100;
class FakeHelper {
    constructor(options) { this.options = options; this.handshake = {helperVersion: 'fixture', libmpvVersion: 'fixture'};
        this.currentGenerationId = null; this.loads = []; this.exit = deferred(); this.exitPromise = this.exit.promise; }
    start() { return Promise.resolve(this); } allocateGenerationId() { return ++generation; }
    beginGeneration() { this.currentGenerationId = ++generation; return generation; }
    retireGeneration() { this.currentGenerationId = null; } request() { return Promise.resolve({attached: true}); }
    load(args) {
        this.loads.push([...args]); const generationId = this.currentGenerationId, mediaIdentity = this.loads.length;
        if (this.rejectCached && args[1].endsWith('.bytes')) return {generationId, promise: Promise.reject(Error('synthetic-load-failure'))};
        queueMicrotask(() => this.options.onEvent({name: 'start-file', generationId, mediaIdentity}));
        return {generationId, promise: Promise.resolve({commandAccepted: true, mediaIdentity})};
    }
    stop() { this.currentGenerationId = null; return Promise.resolve(); }
    kill() { this.exited = true; this.exit.resolve(); return this.exitPromise; }
    end(generationId, mediaIdentity, reason = 0) {
        const message = {scope: 'generation', name: 'end-file', rawEventId: 7, generationId, mediaIdentity, value: {reason}};
        if (this.options.onMediaClosed) this.options.onMediaClosed(message);
        if (generationId === this.currentGenerationId) this.options.onEvent(message);
    }
}
async function serviceFixture(t, f) {
    let owned; class Client extends FakeHelper { constructor(options) { super(options); owned = this; } }
    const main = new Window();
    const service = createService({electron: {BrowserWindow: Window}, NativeHelperClient: Client,
        fs: {existsSync: () => true}, runtimeRoot: f.parent, getMainWindow: () => main, getWebContents: () => main.webContents,
        playbackCacheTrial: f.args});
    f.cleanup(() => service.destroy());
    const {endpointId} = await service.call('create');
    const {generationId} = await service.call('begin-generation', {label: 'fixture', requestEpoch: 1}, endpointId);
    return {service, owned, main, endpointId, generationId, load: source => service.call('command', {data: ['loadfile', source || f.source], generationId}, endpointId)};
}

test('the actual service dispatches a verified complete local source, preserving endpoint/generation and release ownership', async t => {
    const f = inputs(t); const s = await serviceFixture(t, f);
    await s.load(); await flush();
    assert.equal(s.owned.loads.length, 1); assert.match(s.owned.loads[0][1], /[a-f0-9]{64}\.bytes$/);
    assert.equal(s.owned.currentGenerationId, s.generationId);
    assert.equal(fs.readFileSync(s.owned.loads[0][1]).equals(wav()), true);
    await s.service.call('command', {data: ['stop'], generationId: s.generationId}, s.endpointId);
    // Stop acceptance is not physical close; the file remains until end-file/exit.
    assert.equal(fs.existsSync(s.owned.loads[0][1]), true);
    s.owned.end(s.generationId, 1); await s.service.destroy();
    const store = createStore({enabled: true, parent: f.parent, policy, now: () => 2500});
    assert.equal(store.status().entries, 0); store.close();
});

test('service miss or failed reauthorization keeps the exact original source and file-local options', async t => {
    const f = inputs(t); f.args.revalidate = () => null; const s = await serviceFixture(t, f);
    const original = ['loadfile', f.source, 'replace', '-1', 'user-agent=fixture'];
    await s.service.call('command', {data: original, generationId: s.generationId}, s.endpointId);
    assert.deepEqual(s.owned.loads, [original]);
});

test('cached load rejection and native media error retry the original source at most once in the same session', async t => {
    const f = inputs(t); const s = await serviceFixture(t, f); s.owned.rejectCached = true;
    await s.load(); await flush(); assert.equal(s.owned.loads.length, 2); assert.equal(s.owned.loads[1][1], f.source);
    assert.equal(s.owned.currentGenerationId, s.generationId);
    await s.service.destroy();
});

test('native cached media error falls back once; its late end event cannot cancel the replacement source', async t => {
    const f = inputs(t); const s = await serviceFixture(t, f); await s.load(); await flush();
    s.owned.end(s.generationId, 1, 4); await flush(); assert.equal(s.owned.loads.length, 2);
    assert.equal(s.main.messages.filter(message => message.type === 'bridge_error').length, 0);
    s.owned.end(s.generationId, 2, 4);
    assert.equal(s.main.messages.filter(message => message.type === 'bridge_error').length, 1);
    assert.equal(s.owned.loads[1][1], f.source);
    s.owned.end(s.generationId, 1, 4); await flush(); assert.equal(s.owned.loads.length, 2);
});

test('Next during authorization retires the previous load and preserves the new generation source', async t => {
    const f = inputs(t), entered = deferred(), grant = deferred();
    f.args.revalidate = request => { entered.resolve(); return grant.promise.then(() => ({identity, context: request.context, proof: f.proof()})); };
    const s = await serviceFixture(t, f); const old = s.load(); await entered.promise;
    const next = await s.service.call('begin-generation', {label: 'next', requestEpoch: 2}, s.endpointId);
    const args = ['loadfile', f.source];
    await s.service.call('command', {data: args, generationId: next.generationId}, s.endpointId);
    grant.resolve(); await assert.rejects(old, /generation-superseded/);
    assert.deepEqual(s.owned.loads, [args]); assert.equal(s.owned.currentGenerationId, next.generationId);
});

test('transport terminal does not release cache storage until the exact helper exit promise settles', async t => {
    const f = inputs(t); const s = await serviceFixture(t, f); await s.load(); await flush();
    const source = s.owned.loads[0][1];
    s.owned.kill = () => s.owned.exitPromise;
    s.owned.transportTerminated = true; s.owned.options.onTerminal({name: 'stdout-end'});
    let finished = false; const closing = s.service.destroy().then(() => { finished = true; });
    await flush(); assert.equal(finished, false); assert.equal(fs.existsSync(source), true);
    s.owned.exited = true; s.owned.exit.resolve(); await closing; assert.equal(finished, true);
    const store = createStore({enabled: true, parent: f.parent, policy, now: () => 2500});
    assert.equal(store.status().entries, 0); store.close();
});

test('Stop while verification is pending cancels selection; late authorization cannot load old media', async t => {
    const f = inputs(t), entered = deferred(), grant = deferred();
    f.args.revalidate = request => { entered.resolve(); return grant.promise.then(() => ({identity, context: request.context, proof: f.proof()})); };
    const s = await serviceFixture(t, f); const load = s.load(); await entered.promise;
    await s.service.call('command', {data: ['stop'], generationId: s.generationId}, s.endpointId);
    grant.resolve(); await assert.rejects(load, /generation-superseded/); assert.equal(s.owned.loads.length, 0);
});

test('controller sends only verified physical end-file to the resource callback while stale renderer events remain dropped', () => {
    const closed = [], delivered = [];
    const client = new NativeHelperClient({onMediaClosed: message => closed.push(message), onEvent: message => delivered.push(message)});
    client.currentGenerationId = 2;
    const end = {type: 'event', scope: 'generation', helperInstanceId: client.helperInstanceId,
        generationId: 1, name: 'end-file', rawEventId: 7, mediaIdentity: 9, value: {reason: 2}};
    client.dispatch({...end, helperInstanceId: 'wrong-helper'}); client.dispatch({...end, rawEventId: 0});
    assert.equal(closed.length, 0); client.dispatch(end);
    assert.equal(closed.length, 1); assert.equal(delivered.length, 0);
    client.transportTerminated = true; client.dispatch(end); assert.equal(closed.length, 1);
});
