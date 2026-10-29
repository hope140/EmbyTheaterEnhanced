'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {appUrl, eventFor} = require('./helpers/trusted-renderer.cjs');
const settings = require('../src/electronapp/enhanced/playback-range-user-settings');

const temporaryRoots = new Set();
test.after(() => {for (const root of temporaryRoots) fs.rmSync(root, {recursive: true, force: true});});
function temporaryRoot(prefix) {
    const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
    temporaryRoots.add(root);
    return root;
}
function config(overrides) {return Object.assign({schema: 1, enabled: false, progressPercent: 70, preloadMB: 300}, overrides || {});}

test('normalize applies defaults and accepts enabled next-prefix settings without user resource fields', () => {
    assert.deepEqual(settings.normalize({schema: 1, enabled: false}), config());
    const enabled = config({enabled: true, progressPercent: 80, preloadMB: 500});
    assert.deepEqual(settings.normalize(enabled), enabled);
    for (const value of [null, undefined, [], 'config', 1]) assert.throws(() => settings.normalize(value));
    for (const field of ['maxBytes', 'minFreeBytes', 'bytesPerSecond', 'root', 'url', 'profileRoot']) {
        assert.throws(() => settings.normalize(Object.assign(config(), {[field]: 1024})));
    }
    for (const value of [49, 55, 100, '80']) assert.throws(() => settings.normalize(config({progressPercent: value})));
    for (const value of [0, 200, 250, '300']) assert.throws(() => settings.normalize(config({preloadMB: value})));
    assert.throws(() => settings.normalize({schema: 2, enabled: true}));
});

test('legacy resource-bearing experiment config preserves choices but cannot restore enabled state', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-old-config-');
    const directory = path.join(profileRoot, 'config'), file = path.join(directory, 'playback-range.json');
    fs.mkdirSync(directory);
    const bytes = JSON.stringify({schema: 1, enabled: true, progressPercent: 90, preloadMB: 100,
        maxBytes: 16777216, minFreeBytes: 67108864, bytesPerSecond: 1048576});
    fs.writeFileSync(file, bytes);
    const store = settings.createStore({profileRoot});
    assert.deepEqual(store.get(), config({progressPercent: 90, preloadMB: 100}));
    assert.equal(store.runtimeConfig(), null);
    assert.equal(fs.readFileSync(file, 'utf8'), bytes, 'loading legacy input does not migrate or rewrite the file');
});

test('store clones snapshots, atomically persists enabled choices, reopens, and exposes source-aware runtime routing', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-store-'), store = settings.createStore({profileRoot});
    assert.deepEqual(store.get(), config());
    assert.equal(store.runtimeConfig(), null);
    const saved = config({enabled: true, progressPercent: 60, preloadMB: 100});
    const returned = store.save(saved);
    returned.enabled = false;
    assert.equal(store.get().enabled, true);
    assert.deepEqual(settings.createStore({profileRoot}).get(), saved);
    assert.deepEqual(store.runtimeConfig(), {
        kind: 'source-aware', root: path.join(profileRoot, 'next-episode-prefix-v1'), sharedRoot: path.join(profileRoot, 'shared-playback-byte-cache-v2'),
        progressPercent: 60, preloadMB: 100, prefetchBytes: (100 * 1024 * 1024), timeoutMs: 30000
    });
    assert.equal(fs.existsSync(path.join(profileRoot, 'cache')), false);
    assert.deepEqual(Object.keys(store.runtimeConfig()).sort(),
        ['kind', 'prefetchBytes', 'preloadMB', 'progressPercent', 'root', 'sharedRoot', 'timeoutMs']);
});

test('store refuses a symlinked profile root without touching its target', t => {
    const outside = temporaryRoot('ete-next-prefix-outside-'), parent = temporaryRoot('ete-next-prefix-parent-');
    const alias = path.join(parent, 'profile-link');
    fs.symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => settings.createStore({profileRoot: alias}));
    assert.deepEqual(fs.readdirSync(outside), []);
});

test('failed Save leaves the prior snapshot unchanged and does not echo rejected values', () => {
    const profileRoot = temporaryRoot('ete-next-prefix-save-failure-'), store = settings.createStore({profileRoot});
    const previous = store.get(), directory = path.join(profileRoot, 'config');
    fs.mkdirSync(directory);
    fs.mkdirSync(path.join(directory, 'playback-range.json'));
    let failure;
    try {store.save(config({enabled: true}));} catch (error) {failure = error;}
    assert.ok(failure);
    assert.deepEqual(store.get(), previous);
    let rejected;
    try {store.save(Object.assign(config(), {secret: 'save-canary'}));} catch (error) {rejected = error;}
    assert.ok(rejected);
    assert.doesNotMatch(String(rejected), /save-canary/);
});

test('IPC applies accepted settings on next play, reports effective state separately, and keeps trusted boundary', async () => {
    const profileRoot = temporaryRoot('ete-next-prefix-ipc-'), store = settings.createStore({profileRoot});
    const handlers = new Map(), removed = [], trusted = {mainFrame: {url: appUrl}, isDestroyed: () => false};
    const effective = {enabled: false};
    const unregister = settings.register({ipcMain: {
        handle(channel, handler) {handlers.set(channel, handler);},
        removeHandler(channel) {removed.push(channel); handlers.delete(channel);}
    }, store, getWebContents: () => trusted, getRuntimeStatus: () => effective});
    const get = handlers.get(settings.CHANNELS.GET), save = handlers.get(settings.CHANNELS.SAVE);
    const saved = config({enabled: true, progressPercent: 80, preloadMB: 500});
    assert.deepEqual(await get(eventFor(trusted)), {status: 'ok', config: config(), runtime: effective});
    assert.deepEqual(await save(eventFor(trusted), saved), {
        status: 'saved', requiresRestart: false, applyMode: 'next-play', config: saved, runtime: effective
    });
    assert.deepEqual(store.get(), saved);
    assert.equal(Object.hasOwn(await get(eventFor(trusted)), 'capacityPending'), false);

    const foreign = {mainFrame: {url: appUrl}, isDestroyed: () => false};
    for (const event of [{sender: foreign, senderFrame: foreign.mainFrame}, {sender: trusted},
        {sender: trusted, senderFrame: {url: appUrl}}]) {
        assert.equal((await get(event)).reason, 'untrusted_sender');
    }
    const bad = await save(eventFor(trusted), Object.assign({}, saved, {maxBytes: 1234}));
    assert.equal(bad.status, 'error');
    assert.deepEqual(store.get(), saved);
    unregister();
    assert.equal(handlers.size, 0);
    assert.deepEqual(removed.sort(), [settings.CHANNELS.GET, settings.CHANNELS.SAVE].sort());
});

test('saved settings await safe runtime application without confusing application failure with persistence failure', async () => {
    const profileRoot = temporaryRoot('ete-range-apply-'), store = settings.createStore({profileRoot}), handlers = new Map();
    const trusted = {mainFrame: {url: appUrl}, isDestroyed: () => false}; let applications = 0;
    const unregister = settings.register({ipcMain: {handle(k,v) {handlers.set(k,v);}, removeHandler() {}}, store,
        getWebContents: () => trusted, applyRuntimeSettings: async () => {if (++applications === 2) throw Error('synthetic-close-failure'); return {applyMode: 'immediate'};}});
    try {
        const save = handlers.get(settings.CHANNELS.SAVE);
        assert.equal((await save(eventFor(trusted), config({enabled:true}))).applyMode,'immediate');
        const pending = await save(eventFor(trusted),config({enabled:true,preloadMB:500}));
        assert.equal(pending.status,'saved'); assert.equal(pending.applyMode,'next-play'); assert.equal(pending.applyError,'runtime-unavailable'); assert.equal(store.get().preloadMB,500);
        assert.equal((await save({sender:{}},config())).reason,'untrusted_sender'); assert.equal(applications,2);
    } finally {unregister();}
});

function runtimeFixture({playing=false,oldClose,failClose=false}={}) {
    const source=fs.readFileSync(require.resolve('../src/electronapp/native-helper/service'),'utf8');
    const begin=source.indexOf('  function applyRangeConfig('),end=source.indexOf('  function requireEndpoint(',begin);
    const old={kind:'source-aware',preloadMB:300},next={kind:'source-aware',preloadMB:500};let closes=0,creates=0;
    const sandbox={destroyed:false,generationEpoch:1,client:playing?{currentGenerationId:2}:null,rangeApplyTail:Promise.resolve(),rangePreloadEpoch:0,
        rangeSession:{async close(){closes++;if(oldClose)await oldClose;if(failClose)throw Error('owned-close-failure');}},rangeConfigKey:JSON.stringify(old),rangeConfigKind:old.kind,
        rangeCloseFailure:null,desired:next,readRangeConfig(){return sandbox.desired;},rangeKey:JSON.stringify,createRangeSession(value){creates++;return{config:value};}};
    vm.runInNewContext(source.slice(begin,end)+'; apply = applyRangeSettings;',sandbox);
    return {sandbox,apply:()=>sandbox.apply(),counts:()=>({closes,creates})};
}
test('idle runtime applies saved policy immediately without creating a Native helper',async()=>{
    const f=runtimeFixture();assert.equal((await f.apply()).applyMode,'immediate');assert.deepEqual(f.counts(),{closes:1,creates:1});assert.equal(f.sandbox.client,null);
});
test('active runtime keeps its source and defers structural changes instead of closing the playing proxy',async()=>{
    const f=runtimeFixture({playing:true}),old=f.sandbox.rangeSession;assert.equal((await f.apply()).applyMode,'next-play');assert.equal(f.sandbox.rangeSession,old);assert.deepEqual(f.counts(),{closes:0,creates:0});
});
test('queued idle apply rechecks generation ownership and publishes only the latest saved policy',async()=>{
    let release;const close=new Promise(resolve=>{release=resolve;}),f=runtimeFixture({oldClose:close}),applying=f.apply();
    await new Promise(resolve=>setImmediate(resolve));f.sandbox.desired={kind:'source-aware',preloadMB:100};release();
    assert.equal((await applying).applyMode,'immediate');assert.equal(f.sandbox.rangeSession.config.preloadMB,100);
    const g=runtimeFixture();g.sandbox.rangeApplyTail=Promise.resolve().then(()=>{g.sandbox.generationEpoch++;g.sandbox.client={currentGenerationId:3};});
    assert.equal((await g.apply()).applyMode,'next-play');assert.deepEqual(g.counts(),{closes:0,creates:0});
});
test('failed idle close remains failed and cannot create a replacement cache session',async()=>{
    const f=runtimeFixture({failClose:true});await assert.rejects(f.apply(),/owned-close-failure/);assert.deepEqual(f.counts(),{closes:1,creates:0});
    await assert.rejects(f.apply(),/owned-close-failure/);assert.deepEqual(f.counts(),{closes:1,creates:0});
});
test('disable then failed close cannot hide the runtime error on another disabled Save',async()=>{
    const f=runtimeFixture({failClose:true});f.sandbox.desired=null;
    const profileRoot=temporaryRoot('ete-range-disable-failed-'),store=settings.createStore({profileRoot}),handlers=new Map();store.save(config({enabled:true}));
    const trusted={mainFrame:{url:appUrl},isDestroyed:()=>false};
    const unregister=settings.register({ipcMain:{handle(k,v){handlers.set(k,v);},removeHandler(){}},store,getWebContents:()=>trusted,applyRuntimeSettings:f.apply});
    try {
        for(let i=0;i<2;i++) {
            const saved=await handlers.get(settings.CHANNELS.SAVE)(eventFor(trusted),config());
            assert.equal(saved.status,'saved');assert.equal(saved.applyError,'runtime-unavailable');assert.equal(saved.applyMode,'next-play');
        }
        assert.equal(store.get().enabled,false);assert.deepEqual(f.counts(),{closes:1,creates:0});
    } finally {unregister();}
});
