'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createAuthority, isTransport} = require('../src/electronapp/enhanced/preload-source-authority');
const SOURCE = 'https://cd2.invalid/download/movie?signature=private-original';
const CANARY = 'PRIVATE_CANARY https://private.invalid/media?api_key=SECRET_TOKEN';
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
function contents() {const web = new EventEmitter(); web.isDestroyed = () => false; return web;}
function fixture(t, settings = {}) {
    let clock = 10000;
    const authority = createAuthority({now: () => clock}), web = contents(), principal = authority.principalFor(web);
    t.after(() => authority.close());
    function issue(overrides = {}) {return authority.issue({principal, requestId: 'next-play-1-1', source: SOURCE, sourceKind: 'direct-url', resourceKey: 'synthetic-cloud-file:one', ...settings, ...overrides});}
    function bind(overrides = {}, issued = {}) {
        const owner = new AbortController(), sourceProof = issue(issued);
        return {owner, sourceProof, transport: authority.bind({sourceProof, principal, source: issued.source || SOURCE, requestId: 'next-play-1-1', signal: owner.signal, ...overrides})};
    }
    return {authority, web, principal, issue, bind, time: value => {clock = value;}};
}
function checkError(error, reason) {
    assert.equal(error.preloadReason, reason);
    assert.equal(error.message, 'preload-source-' + reason);
    assert.doesNotMatch(JSON.stringify({message: error.message, preloadReason: error.preloadReason, stack: error.stack}), /PRIVATE_CANARY|SECRET_TOKEN|private-original/);
    return true;
}
function rejects(promise, reason) {return assert.rejects(promise, error => checkError(error, reason));}
function throws(action, reason) {assert.throws(action, error => checkError(error, reason));}
const refreshed = value => ({source: SOURCE.replace('private-original', 'private-refreshed'), sourceKind: 'direct-url', resourceKey: 'synthetic-cloud-file:one', acquiredAt: 10000, expiresAt: 20000, ...value});

test('opaque principal and one-time UUID proof yield a privately branded frozen transport', async t => {
    const f = fixture(t), proof = f.issue();
    assert.equal(f.authority.principalFor(f.web), f.principal);
    assert.deepEqual(Object.keys(f.principal), []); assert(Object.isFrozen(f.principal));
    assert.match(proof, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    const owner = new AbortController(), transport = f.authority.bind({sourceProof: proof, principal: f.principal, source: SOURCE, requestId: 'next-play-1-1', signal: owner.signal});
    assert(isTransport(transport)); assert(Object.isFrozen(transport));
    assert.equal(isTransport({...transport}), false); assert.equal(isTransport({representation: transport.representation}), false);
    assert.equal(isTransport(null), false); assert.equal(isTransport('opaque'), false);
    assert.match(transport.representation, /^[a-f0-9]{64}$/);
    assert.deepEqual(await transport.access(), {source: SOURCE, origin: 'https://cd2.invalid'});
    throws(() => f.authority.bind({sourceProof: proof, principal: f.principal, source: SOURCE, requestId: 'next-play-1-1', signal: owner.signal}), 'source-proof-invalid');
});

for (const phase of ['details-navigation', 'positional-navigation', 'destroyed', 'render-process-gone', 'close']) test('document retirement revokes pending and bound grants: ' + phase, async t => {
    const f = fixture(t), pending = f.issue(), {transport} = f.bind();
    if (phase === 'details-navigation') f.web.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
    if (phase === 'positional-navigation') f.web.emit('did-start-navigation', {}, 'https://navigation.invalid', false, true);
    if (phase === 'destroyed') f.web.emit('destroyed');
    if (phase === 'render-process-gone') f.web.emit('render-process-gone');
    if (phase === 'close') f.authority.close();
    assert.equal(transport.signal.aborted, true);
    assert.equal(transport.matchesLoadOptions(['loadfile', SOURCE]), false);
    await rejects(transport.access(), 'generation-retired');
    throws(() => f.authority.bind({sourceProof: pending, principal: f.principal, source: SOURCE, requestId: 'next-play-1-1', signal: new AbortController().signal}), 'source-proof-invalid');
    throws(() => f.issue(), 'generation-retired');
    if (phase.includes('navigation') || phase === 'render-process-gone') assert.notEqual(f.authority.principalFor(f.web), f.principal);
});

test('subframe and same-document navigation preserve the exact principal and grants', async t => {
    const f = fixture(t), {transport} = f.bind();
    f.web.emit('did-start-navigation', {isMainFrame: false, isSameDocument: false});
    f.web.emit('did-start-navigation', {isMainFrame: true, isSameDocument: true});
    f.web.emit('did-start-navigation', {}, 'https://navigation.invalid', false, false);
    f.web.emit('did-start-navigation', {}, SOURCE, true, true);
    assert.equal(f.authority.principalFor(f.web), f.principal);
    assert.equal(transport.signal.aborted, false); await transport.access();
});

test('observation installs once and close removes every owned listener', t => {
    const f = fixture(t);
    for (let n = 0; n < 20; n++) f.authority.principalFor(f.web);
    for (const name of ['did-start-navigation', 'destroyed', 'render-process-gone']) assert.equal(f.web.listenerCount(name), 1);
    f.authority.close(); f.authority.close();
    for (const name of ['did-start-navigation', 'destroyed', 'render-process-gone']) assert.equal(f.web.listenerCount(name), 0);
    throws(() => f.authority.principalFor(f.web), 'generation-retired');
    const other = createAuthority(); t.after(() => other.close());
    const web = contents(); web.isDestroyed = () => true;
    throws(() => other.principalFor(web), 'generation-retired');
});

for (const change of [
    {sourceProof: 'forged'}, {source: SOURCE + 'tampered'}, {principal: {}}, {requestId: 'next-play-OTHER-1'},
    {requestId: undefined, requestPrefix: 'next-play-OTHER-'}, {requestId: undefined}, {requestPrefix: 'next-play-1-'},
    {signal: {}}, {requestId: 'PRIVATE_CANARY https://private.invalid'}
]) test('unknown source, document, request or signal cannot bind: ' + JSON.stringify(Object.keys(change)), t => {
    const f = fixture(t), proof = f.issue(), owner = new AbortController();
    throws(() => f.authority.bind({sourceProof: proof, principal: f.principal, source: SOURCE, requestId: 'next-play-1-1', signal: owner.signal, ...change}), 'source-proof-invalid');
});

test('request prefix is main-selected, exact and consumes the proof on rejection', t => {
    const f = fixture(t), proof = f.issue();
    const transport = f.authority.bind({sourceProof: proof, principal: f.principal, source: SOURCE, requestPrefix: 'next-play-1-', signal: new AbortController().signal});
    assert(isTransport(transport));
    const burned = f.issue(), controls = {sourceProof: burned, principal: f.principal, source: SOURCE, requestId: 'wrong', signal: new AbortController().signal};
    throws(() => f.authority.bind(controls), 'source-proof-invalid');
    throws(() => f.authority.bind({...controls, requestId: 'next-play-1-1'}), 'source-proof-invalid');
});

test('another authority and another webContents cannot reuse a principal or proof', t => {
    const f = fixture(t), other = createAuthority({now: () => 10000}); t.after(() => other.close());
    throws(() => other.issue({principal: f.principal, requestId: 'request', source: SOURCE, sourceKind: 'direct-url', resourceKey: 'file'}), 'generation-retired');
    const second = f.authority.principalFor(contents()), proof = f.issue();
    throws(() => f.authority.bind({sourceProof: proof, principal: second, source: SOURCE, requestId: 'next-play-1-1', signal: new AbortController().signal}), 'source-proof-invalid');
});

test('pending proofs expire at sixty seconds and capacity is released by successful binds', t => {
    const f = fixture(t), old = f.issue(); f.time(70000);
    throws(() => f.authority.bind({sourceProof: old, principal: f.principal, source: SOURCE, requestId: 'next-play-1-1', signal: new AbortController().signal}), 'source-proof-invalid');
    const proofs = Array.from({length: 64}, () => f.issue());
    throws(() => f.issue(), 'source-proof-invalid');
    f.authority.bind({sourceProof: proofs[0], principal: f.principal, source: SOURCE, requestId: 'next-play-1-1', signal: new AbortController().signal});
    assert.equal(typeof f.issue(), 'string');
    f.web.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
    const principal = f.authority.principalFor(f.web);
    for (let n = 0; n < 64; n++) f.issue({principal});
});

test('owner cancellation aborts transport immediately while a scoped cancellation does not retire its owner', async t => {
    const f = fixture(t), {transport, owner} = f.bind(), scoped = new AbortController();
    scoped.abort(); await rejects(transport.access(scoped.signal), 'request-cancelled');
    assert.equal(transport.signal.aborted, false); await transport.access();
    owner.abort(); assert.equal(transport.signal.aborted, true);
    await rejects(transport.access(), 'request-cancelled');
    assert.equal(transport.matchesLoadOptions(['loadfile', SOURCE]), false);
    const cancelled = new AbortController(); cancelled.abort();
    throws(() => f.bind({signal: cancelled.signal}), 'request-cancelled');
});

test('only exact original loadfile options match and refresh never rewrites the load-source check', async t => {
    const f = fixture(t), plain = f.bind().transport;
    assert.equal(plain.matchesLoadOptions(['loadfile', SOURCE]), true);
    for (const args of [['loadfile', SOURCE, 'replace'], ['loadfile', SOURCE, 'replace', '-1', 'user-agent=Agent'], ['loadfile', SOURCE + 'changed'], ['stop', SOURCE]]) assert.equal(plain.matchesLoadOptions(args), false);
    const withUA = fixture(t, {requestOptions: {userAgent: 'OriginalAgent'}}), {transport} = withUA.bind({}, {acquiredAt: 9000, expiresAt: 11000, refresh: async () => refreshed({requestOptions: {userAgent: 'OriginalAgent'}})});
    const options = ['loadfile', SOURCE, 'replace', '-1', 'user-agent=OriginalAgent'];
    assert.equal(transport.matchesLoadOptions(options), true);
    for (const args of [['loadfile', SOURCE], [...options, 'http-header-fields=private'], [...options.slice(0, 4), 'user-agent=Other'], [...options.slice(0, 3), -1, options[4]]]) assert.equal(transport.matchesLoadOptions(args), false);
    const next = await transport.access(); assert.equal(next.userAgent, 'OriginalAgent');
    assert.equal(transport.matchesLoadOptions(options), true);
    assert.equal(transport.matchesLoadOptions(['loadfile', next.source, 'replace', '-1', 'user-agent=OriginalAgent']), false);
});

for (const [overrides, reason] of [
    [{source: 'file:///private/media'}, 'source-proof-invalid'], [{source: 'invalid'}, 'source-proof-invalid'],
    [{source: 'https://user:PRIVATE_CANARY@cd2.invalid/media'}, 'source-proof-invalid'], [{source: SOURCE + '#PRIVATE_CANARY'}, 'source-proof-invalid'],
    [{sourceKind: 'native'}, 'source-proof-invalid'], [{resourceKey: ''}, 'source-proof-invalid'], [{requestId: ''}, 'source-proof-invalid'],
    [{requestOptions: {headers: {Authorization: CANARY}}}, 'source-options-changed'], [{requestOptions: {userAgent: 'unsafe\r\nPRIVATE_CANARY'}}, 'source-options-changed'],
    [{requestOptions: {userAgent: 'Agent,private'}}, 'source-options-changed'], [{requestOptions: {userAgent: 'Agent\\private'}}, 'source-options-changed'],
    [{acquiredAt: 10001}, 'source-proof-invalid'], [{acquiredAt: 9000, expiresAt: 8000}, 'source-proof-invalid'], [{expiresAt: 20000}, 'source-proof-invalid'], [{refresh: true}, 'source-proof-invalid']
]) test('issue rejects unsupported descriptor fields without sensitive error text: ' + reason, t => {
    const f = fixture(t); throws(() => f.issue(overrides), reason);
});

test('representation uses main resource, kind, origin and UA semantics; signed queries and proof IDs do not identify media', t => {
    const f = fixture(t), baseline = f.bind().transport.representation;
    assert.equal(f.bind({}, {source: SOURCE.replace('private-original', 'new-private-signature')}).transport.representation, baseline);
    for (const fields of [{resourceKey: 'synthetic-cloud-file:two'}, {sourceKind: 'cd2-url'}, {source: SOURCE.replace('cd2.invalid', 'other.invalid')}, {requestOptions: {userAgent: 'Agent'}}]) assert.notEqual(f.bind({}, fields).transport.representation, baseline);
    assert.doesNotMatch(baseline, /synthetic|signature|private/);
});

test('unknown expiry needs no refresh; known expiry refreshes once at the safety margin', async t => {
    let count = 0;
    const f = fixture(t), unknown = f.bind({}, {refresh: () => {count++; throw Error(CANARY);}}).transport;
    await unknown.access(); assert.equal(count, 0);
    const {transport} = f.bind({}, {acquiredAt: 9000, expiresAt: 11001, refresh: async signal => {assert.equal(signal.aborted, false); count++; return refreshed();}});
    await transport.access(); assert.equal(count, 0);
    f.time(10001); const result = await transport.access(); assert.equal(count, 1);
    assert.equal(result.source, refreshed().source); assert.equal(result.origin, 'https://cd2.invalid');
    await transport.access(); assert.equal(count, 1);
});

test('expired authority without refresh refuses access with a fixed reason', async t => {
    const f = fixture(t), {transport} = f.bind({}, {acquiredAt: 8000, expiresAt: 9000});
    await rejects(transport.access(), 'source-expired');
});

test('concurrent access shares one refresh and a cancelled follower settles independently', async t => {
    const f = fixture(t), gate = deferred(), started = deferred(); let count = 0;
    const {transport} = f.bind({}, {acquiredAt: 9000, expiresAt: 11000, refresh: async () => {count++; started.resolve(); return gate.promise;}});
    const first = transport.access(); await started.promise;
    const scoped = new AbortController(), second = transport.access(scoped.signal); scoped.abort();
    await rejects(second, 'request-cancelled'); assert.equal(count, 1);
    gate.resolve(refreshed()); assert.equal((await first).source, refreshed().source);
    assert.equal((await transport.access()).source, refreshed().source); assert.equal(count, 1);
});

for (const [value, reason] of [
    [refreshed({source: 'https://other.invalid/media?PRIVATE_CANARY'}), 'source-origin-changed'],
    [refreshed({requestOptions: {userAgent: 'OtherAgent'}}), 'source-options-changed'],
    [refreshed({requestOptions: {headers: {Cookie: CANARY}}}), 'source-options-changed'],
    [refreshed({sourceKind: 'cd2-url'}), 'source-refresh-failed'], [refreshed({resourceKey: 'another-resource'}), 'source-refresh-failed'],
    [refreshed({expiresAt: 11000}), 'source-expired'], [refreshed({expiresAt: undefined}), 'source-expired'],
    [refreshed({acquiredAt: 10001}), 'source-proof-invalid'], [refreshed({source: 'https://name:PRIVATE_CANARY@cd2.invalid/media'}), 'source-proof-invalid']
]) test('refresh refuses changed authority or unsafe freshness: ' + reason, async t => {
    let count = 0;
    const f = fixture(t), {transport} = f.bind({}, {acquiredAt: 9000, expiresAt: 11000, refresh: async () => {count++; return value;}});
    await rejects(transport.access(), reason); assert.equal(count, 1, 'one access never loops refresh');
});

for (const phase of ['owner', 'caller', 'navigation']) test('cancelled refresh aborts work and never commits a late signature: ' + phase, async t => {
    const f = fixture(t), gate = deferred(), started = deferred(), caller = new AbortController(); let refreshSignal, count = 0;
    const {transport, owner} = f.bind({}, {acquiredAt: 9000, expiresAt: 11000, refresh: async signal => {refreshSignal = signal; count++; started.resolve(); return gate.promise;}});
    const pending = transport.access(caller.signal); await started.promise;
    if (phase === 'owner') owner.abort();
    if (phase === 'caller') caller.abort();
    if (phase === 'navigation') f.web.emit('did-start-navigation', {isMainFrame: true, isSameDocument: false});
    await rejects(pending, phase === 'navigation' ? 'generation-retired' : 'request-cancelled');
    assert.equal(refreshSignal.aborted, true); gate.resolve(refreshed()); await Promise.resolve();
    if (phase === 'caller') {
        // A fresh access must still reacquire: the cancelled callback did not publish.
        await transport.access(); assert.equal(count, 2);
    } else await rejects(transport.access(), phase === 'navigation' ? 'generation-retired' : 'request-cancelled');
});

test('a refresh failure never propagates callback text, stack, or spoofed error metadata', async t => {
    const f = fixture(t), {transport} = f.bind({}, {acquiredAt: 9000, expiresAt: 11000, refresh: async () => {throw Object.assign(Error(CANARY), {preloadReason: CANARY, source: CANARY});}});
    await rejects(transport.access(), 'source-refresh-failed');
    throws(() => f.issue({requestOptions: {get userAgent() {throw Error(CANARY);}}}), 'source-proof-invalid');
});

test('refresh timeout is exactly 3000ms, aborts ignored work, and never commits late output', async t => {
    let installed, cleared = 0, clock = 10000, observedSignal;
    const module = {exports: {}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/electronapp/enhanced/preload-source-authority.js'), 'utf8'), {
        module, require, URL, AbortSignal, AbortController,
        setTimeout(callback, ms) {assert.equal(ms, 3000); installed = callback; return 1;}, clearTimeout() {cleared++;}
    });
    const authority = module.exports.createAuthority({now: () => clock}), principal = authority.principalFor(contents()); t.after(() => authority.close());
    const late = deferred(), started = deferred(); let count = 0;
    const proof = authority.issue({principal, requestId: 'play', source: SOURCE, sourceKind: 'direct-url', resourceKey: 'file', acquiredAt: 9000, expiresAt: 11000,
        refresh: async signal => {observedSignal = signal; count++; started.resolve(); return late.promise;}});
    const transport = authority.bind({sourceProof: proof, principal, source: SOURCE, requestId: 'play', signal: new AbortController().signal});
    const pending = transport.access(); await started.promise; installed(); await rejects(pending, 'timeout');
    assert.equal(observedSignal.aborted, true); assert.equal(cleared, 1);
    late.resolve(refreshed({resourceKey: 'file'})); await Promise.resolve();
    clock = 10001; await transport.access(); assert.equal(count, 2, 'timed-out result was not committed');
});
