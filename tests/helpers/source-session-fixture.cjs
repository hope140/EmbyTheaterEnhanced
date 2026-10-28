'use strict';
// Real loopback HTTP, authority, both stores and budget reader. Helper/clock
// are synthetic: these ownership cases do not assert a cold filesystem SLA.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {EventEmitter} = require('node:events');
const {createRequire} = require('node:module');
const {temporaryRoot} = require('./range-fixture-root.cjs');
const {createAuthority} = require('../../src/electronapp/enhanced/preload-source-authority');
const {createStore} = require('../../src/electronapp/enhanced/shared-playback-cache/store');
const {createSourceSession} = require('../../src/electronapp/enhanced/playback-range-source-session');
const {createBudgetReader} = require('../../src/electronapp/native-helper/shared-cache-budget');
const BLOCK = 262144;
function gate() {let release; const promise = new Promise(resolve => {release = resolve;}); return {release, promise};}
async function waitFor(check) {for (let n = 0; n < 1000; n++) {if (check()) return; await new Promise(resolve => setTimeout(resolve, 2));} assert.fail('owned fixture condition did not settle');}
function functionalSession(options) {
    const filename = require.resolve('../../src/electronapp/enhanced/playback-range-session');
    const source = readFileSync(filename, 'utf8'), module = {exports: {}};
    assert.match(source, /const SHARED_PREPARE_TIMEOUT_MS = 50;/);
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', source)(createRequire(filename), module, module.exports,
        (_callback, ms) => {assert.equal(ms, 50); return {};}, () => {});
    return module.exports.createSession({...options, now: () => 0});
}
async function fixture(t, options = {}) {
    const root = temporaryRoot('ete-source-aware-', ['legacy', 'shared']), requests = [], sockets = new Set(), totalBytes = options.bytes || BLOCK;
    const server = http.createServer((req, res) => {
        const item = new URL(req.url, 'http://127.0.0.1').pathname.slice(1, 2), match = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
        const start = match ? Number(match[1]) : 0, end = match ? Number(match[2]) : totalBytes - 1;
        requests.push({item, start, end});
        res.writeHead(206, {'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${totalBytes}`, ETag: '"' + item + '-v1"'});
        res.end(Buffer.alloc(end - start + 1, item.charCodeAt(0)));
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const authority = createAuthority(), web = new EventEmitter(); web.isDestroyed = () => false;
    const principal = authority.principalFor(web), propertyReads = [], helper = {currentGenerationId: 1};
    helper.getProperty = async (...args) => {propertyReads.push(args); return options.budgetBytes || BLOCK;};
    const budget = createBudgetReader((owned, generation) => owned === helper && generation === helper.currentGenerationId);
    const config = {kind: 'source-aware', root: path.join(root, 'legacy'), sharedRoot: path.join(root, 'shared'), preloadMB: 100, progressPercent: 70, timeoutMs: 1000};
    let cleanupCreates = 0, cleanupCloses = 0, cleanupAcquired = 0, cleanupCloseEntered = 0, maintenanceStore = null;
    const makeSession = () => createSourceSession({config, readCurrentBytes: async (...args) => {
        if (options.budgetGate) await options.budgetGate.promise;
        return budget.read(...args);
    }, authorize(value, role, signal) {
        const prefix = 'g' + helper.currentGenerationId;
        return authority.bind({principal, source: value.source, sourceProof: value.sourceProof, signal,
            ...(role === 'current' ? {requestId: prefix} : {requestPrefix: prefix + '-next-'})});
    }}, {createSession: functionalSession, async createStore(value) {
        cleanupCreates++;
        if (options.cleanupGate) await options.cleanupGate.promise;
        const store = await createStore(value);
        maintenanceStore=store;cleanupAcquired++;
        if(options.cleanupReadyGate)await options.cleanupReadyGate.promise;
        const close = store.close;
        store.close = async () => {cleanupCloseEntered++;if(options.cleanupCloseGate)await options.cleanupCloseGate.promise;await close(); cleanupCloses++; if (options.failClose) throw Error('synthetic-owned-close-failure');};
        return store;
    }});
    let session = makeSession();
    t.after(async () => {
        if (options.budgetGate) options.budgetGate.release(); if (options.cleanupGate) options.cleanupGate.release();
        if(options.cleanupReadyGate)options.cleanupReadyGate.release();if(options.cleanupCloseGate)options.cleanupCloseGate.release();
        if (options.failClose) await assert.rejects(session.close(), /synthetic-owned-close-failure/); else await session.close(); authority.close();
        for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve));
        await fs.rm(root, {recursive: true, force: true});
    });
    function context(item, proof = false) {
        const source = origin + '/' + item + '.mkv?Static=true';
        return {source, serverOrigin: origin, serverId: 'server', accountId: 'account', itemId: item, mediaSourceId: 'media-' + item,
            playSessionId: 'play', mode: 'DirectPlay', mediaType: 'Video', container: 'mkv',
            ...(proof ? {sourceProof: authority.issue({principal, source, requestId: 'g' + helper.currentGenerationId + (proof === 'next' ? '-next-1' : ''),
                sourceKind: 'direct-url', resourceKey: 'resource-' + item, expectedSize: totalBytes})} : {})};
    }
    async function bind(value) {await session.setContext(value, helper, helper.currentGenerationId); return session.select(value.source, helper, helper.currentGenerationId, ['loadfile', value.source]);}
    async function read(selected, item) {
        const response = await fetch(selected.source, {headers: {Range: 'bytes=0-' + (totalBytes - 1)}});
        assert.equal(response.status, 206); assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.alloc(totalBytes, item.charCodeAt(0)));
    }
    return {get session() {return session;}, helper, config, origin, requests, context, bind, read, budget, propertyReads,
        async reopen() {await session.close(); helper.currentGenerationId++; budget.retire(); session = makeSession();},
        nextGeneration() {helper.currentGenerationId++; budget.retire();}, get cleanupCreates() {return cleanupCreates;}, get cleanupCloses() {return cleanupCloses;},
        get cleanupAcquired(){return cleanupAcquired;},get cleanupCloseEntered(){return cleanupCloseEntered;},get maintenanceStore(){return maintenanceStore;}};
}


module.exports = {fixture,waitFor,gate,BLOCK};
