'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const cd2 = require('../src/electronapp/enhanced/cd2-service');
const cd2Ipc = require('../src/electronapp/enhanced/cd2-ipc');
const {createAuthority, isTransport} = require('../src/electronapp/enhanced/preload-source-authority');
const {eventFor} = require('./helpers/trusted-renderer.cjs');
const SOURCE_ORIGIN = 'https://media-provider.invalid';
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
function fixture(t, settings = {}) {
    let clock = 10000, serial = 0;
    const calls = [], issued = [], events = [], web = new EventEmitter(); web.isDestroyed = () => false;
    const authority = createAuthority({now: () => clock}), principal = authority.principalFor(web);
    const sourceAuthority = {...authority, issue(value) {issued.push(value); return authority.issue(value);}};
    const client = {close() {}, waitForReady(_deadline, callback) {calls.push({method: 'ready'}); callback(null);}};
    for (const method of ['FindFileByPath', 'GetDownloadUrlPath']) client[method] = (request, metadata, options, callback) => {
        const call = {method, request, metadata, options, cancelled: false}; calls.push(call);
        if (settings[method]) settings[method](call, callback);
        else if (method === 'FindFileByPath') callback(null, {fullPathName: request.path, size: '10', fileType: 'File', isDirectory: false});
        else callback(null, request.get_direct_url ? {directUrl: SOURCE_ORIGIN + '/file?synthetic-signature=' + (++serial), expiresIn: 60,
            ...(settings.userAgent ? {userAgent: settings.userAgent} : {})} : {downloadUrlPath: '/download?synthetic-signature=' + (++serial)});
        return {cancel() {call.cancelled = true;}};
    };
    const config = {enabled: true, origin: cd2.parseOrigin('https://cd2.invalid'), token: 'synthetic-private-cd2-token',
        localPrefix: '/mapped/media', cloudPrefix: '/cloud/media', directUrlEnabled: true, totalBudgetMs: 1200, ...settings.config};
    const service = cd2.createService({config, now: () => clock, sourceAuthority,
        transportFactory: () => ({client, metadata: {}, status: {CANCELLED: 1, NOT_FOUND: 5, DEADLINE_EXCEEDED: 4, UNAVAILABLE: 14}}), onDiagnostic: event => events.push(event)});
    t.after(() => {service.close(); authority.close();});
    const request = {requestId: 'play-request', candidates: ['/mapped/media/show/next.mkv'], mode: 'direct'};
    function bind(reply, overrides = {}) {
        const controller = new AbortController();
        const transport = authority.bind({sourceProof: reply.sourceProof, principal, source: reply.source, requestId: 'play-request', signal: controller.signal, ...overrides});
        return {transport, controller};
    }
    return {authority, sourceAuthority, principal, web, service, calls, issued, events, request, bind, now: value => {clock = value;}};
}

for (const mode of ['direct', 'same-origin', undefined]) test('only validated mapped CD2 hits issue a usable opaque proof: ' + (mode || 'legacy'), async t => {
    const f = fixture(t), reply = await f.service.resolve({...f.request, mode}, f.principal);
    assert.equal(reply.status, 'hit'); assert.equal(typeof reply.sourceProof, 'string');
    assert.equal(f.issued.length, 1); assert.match(f.issued[0].resourceKey, /^[a-f0-9]{64}$/);
    assert.equal(f.issued[0].requestId, 'play-request');
    const {transport} = f.bind(reply); assert(isTransport(transport));
    const access = await transport.access(); assert.equal(access.source, reply.source);
    assert.equal(access.origin, mode === 'same-origin' ? 'https://cd2.invalid' : SOURCE_ORIGIN);
    assert.doesNotMatch(JSON.stringify(f.events), /synthetic-private-cd2-token|synthetic-signature|media-provider\.invalid|\/cloud\/media|\/mapped\/media/);
});

test('ordinary direct resolve without trusted main principal remains playable but issues no proof', async t => {
    const f = fixture(t), reply = await f.service.resolve({...f.request, principal: f.principal, sourceProof: 'renderer-forgery'});
    assert.equal(reply.status, 'hit'); assert.equal(reply.sourceProof, undefined); assert.equal(f.issued.length, 0);
});

for (const candidate of ['/mapped/media/private.txt', '/mapped/media/no-extension', '/outside/media/movie.mkv']) test('nonvideo extension or mapping miss cannot issue a proof: ' + candidate.split('/').pop(), async t => {
    const f = fixture(t), reply = await f.service.resolve({...f.request, candidates: [candidate]}, f.principal);
    assert.equal(reply.sourceProof, undefined); assert.equal(f.issued.length, 0);
    if (candidate.startsWith('/outside')) assert.equal(reply.status, 'miss');
});

for (const file of [
    {fullPathName: '/cloud/media/directory.mkv', size: '10', fileType: 'Directory', isDirectory: true},
    {fullPathName: '/cloud/media/invalid.mkv', size: '-1', fileType: 'File'},
    {fullPathName: '', size: '10', fileType: 'File'}
]) test('regular-file validation precedes all proof issuance', async t => {
    const f = fixture(t, {FindFileByPath(_call, callback) {callback(null, file);}});
    const reply = await f.service.resolve(f.request, f.principal);
    assert.equal(reply.status, 'miss'); assert.equal(reply.sourceProof, undefined); assert.equal(f.issued.length, 0);
    assert.equal(f.calls.filter(call => call.method === 'GetDownloadUrlPath').length, 0);
});

test('invalid or retired principal cannot gain authority while original source dispatch stays available', async t => {
    const f = fixture(t);
    const invalid = await f.service.resolve(f.request, {}); assert.equal(invalid.status, 'hit'); assert.equal(invalid.sourceProof, undefined);
    f.web.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
    const stale = await f.service.resolve({...f.request, requestId: 'stale-request'}, f.principal);
    assert.equal(stale.status, 'hit'); assert.equal(stale.sourceProof, undefined);
});

test('origin, configured token, rule and canonical cloud file separate stable authority identities', async t => {
    const f = fixture(t), first = await f.service.resolve(f.request, f.principal), a = f.bind(first).transport;
    const second = await f.service.resolve(f.request, f.principal), b = f.bind(second).transport;
    assert.notEqual(first.source, second.source); assert.equal(a.representation, b.representation);
    const otherFile = await f.service.resolve({...f.request, candidates: ['/mapped/media/show/other.mkv']}, f.principal);
    assert.notEqual(f.bind(otherFile).transport.representation, a.representation);
    for (const config of [{token: 'another-synthetic-token'}, {origin: cd2.parseOrigin('https://another-cd2.invalid')}]) {
        const other = fixture(t, {config}); const reply = await other.service.resolve(other.request, other.principal);
        assert.notEqual(other.bind(reply).transport.representation, a.representation);
    }
});

test('known-expiry refresh reuses original bounded CD2 pipeline, not stale deadlines or new proof issuance', async t => {
    const f = fixture(t, {userAgent: 'ValidatedAgent'}), reply = await f.service.resolve({...f.request, deadlineAt: 11200, refreshDeadlineAt: 13000}, f.principal);
    assert.equal(reply.expiresAt, 70000); const {transport} = f.bind(reply), representation = transport.representation;
    f.now(69500); const access = await transport.access();
    assert.notEqual(access.source, reply.source); assert.equal(access.origin, SOURCE_ORIGIN); assert.equal(access.userAgent, 'ValidatedAgent');
    assert.equal(f.calls.filter(call => call.method === 'FindFileByPath').length, 2);
    const downloads = f.calls.filter(call => call.method === 'GetDownloadUrlPath');
    assert.equal(downloads.length, 2); assert.equal(downloads[1].request.path, '/cloud/media/show/next.mkv');
    assert.equal(downloads[1].request.get_direct_url, true);
    assert(downloads[1].options.deadline.getTime() > 69500);
    assert(downloads[1].options.deadline.getTime() <= 70700);
    assert.equal(f.issued.length, 1, 'refresh uses mint=false instead of recursive pending proofs');
    assert.equal(transport.representation, representation);
    assert.equal(transport.matchesLoadOptions(['loadfile', reply.source, 'replace', '-1', 'user-agent=ValidatedAgent']), true);
});

test('owner cancellation reaches the refresh RPC and late CD2 completion cannot publish a new source', async t => {
    const held = deferred(); let downloads = 0, late;
    const f = fixture(t, {GetDownloadUrlPath(call, callback) {
        downloads++;
        if (downloads === 1) callback(null, {directUrl: SOURCE_ORIGIN + '/file?synthetic-signature=one', expiresIn: 60});
        else {late = callback; held.resolve(call);}
    }});
    const reply = await f.service.resolve(f.request, f.principal), {transport, controller} = f.bind(reply); f.now(69500);
    const pending = transport.access(), call = await held.promise; controller.abort();
    await assert.rejects(pending, error => error.preloadReason === 'request-cancelled');
    assert.equal(call.cancelled, true);
    late(null, {directUrl: SOURCE_ORIGIN + '/file?synthetic-signature=LATE', expiresIn: 60}); await Promise.resolve();
    await assert.rejects(transport.access(), error => error.preloadReason === 'request-cancelled');
    assert.equal(f.issued.length, 1);
});

test('refresh after CD2 service close returns a finite failure and cannot issue another grant', async t => {
    const f = fixture(t), reply = await f.service.resolve(f.request, f.principal), {transport} = f.bind(reply);
    f.service.close(); f.now(69500);
    await assert.rejects(transport.access(), error => error.preloadReason === 'source-refresh-failed' && !/signature|token|media-provider/.test(error.message));
    assert.equal(f.issued.length, 1);
});

test('only trusted CD2 IPC attaches a main document principal and renderer fields cannot substitute for it', async t => {
    const f = fixture(t), handlers = new Map(), ipc = new EventEmitter();
    ipc.handle = (name, handler) => handlers.set(name, handler); ipc.removeHandler = name => handlers.delete(name);
    const seen = [], service = {resolve(request, principal) {seen.push({request, principal}); return {status: 'miss', reason: 'fixture'};}, cancel() {}, close() {}};
    const unregister = cd2Ipc.register({ipcMain: ipc, service, sourceAuthority: f.authority, getWebContents: () => f.web}); t.after(unregister);
    const resolve = handlers.get(cd2Ipc.RESOLVE_CHANNEL), request = {...f.request, principal: 'renderer-spoof'};
    assert.equal((await resolve(eventFor(f.web), request)).reason, 'fixture');
    assert.equal(seen.length, 1); assert.equal(seen[0].principal, f.principal);
    const other = contents();
    assert.equal((await resolve(eventFor(other), request)).reason, 'untrusted_sender');
    assert.equal((await resolve({sender: f.web, senderFrame: {url: 'https://outside.invalid'}}, request)).reason, 'untrusted_sender');
    assert.equal(seen.length, 1);
});

function contents() {const web = new EventEmitter(); web.isDestroyed = () => false; return web;}

for (const freshSize of ['11', undefined]) test('URL renewal uses a new Find size instead of copying the old size: ' + freshSize, async t => {
    let finds = 0;
    const f = fixture(t, {FindFileByPath(call, callback) {
        finds++;
        callback(null, {fullPathName: call.request.path, fileType: 'File', isDirectory: false,
            ...(finds === 1 ? {size: '10'} : freshSize === undefined ? {} : {size: freshSize})});
    }});
    const reply = await f.service.resolve(f.request, f.principal), {transport} = f.bind(reply);
    assert.equal((await transport.access()).expectedSize, 10);
    f.now(69500);
    await assert.rejects(transport.access(), error => error.preloadReason === (freshSize === undefined ? 'source-refresh-failed' : 'representation-changed'));
    assert.equal(finds, 2); assert.equal(f.issued.length, 1);
});
