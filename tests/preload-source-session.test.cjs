'use strict';
// Main session ownership with an in-memory cache; network behavior is separately
// exercised by preload-authorized-transport and the actual Alameda integration.
const test = require('node:test'), assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createAuthority, isTransport} = require('../src/electronapp/enhanced/preload-source-authority');
const {createSession, parseContext} = require('../src/electronapp/enhanced/playback-range-session');
const emby = 'https://emby.invalid', media = 'https://media.invalid';
function fixture(t) {
    const authority = createAuthority(), web = new EventEmitter(); web.isDestroyed = () => false;
    const principal = authority.principalFor(web), helper = {currentGenerationId: 1}, calls = [];
    const owner = {label: 'play-A', scope: 'unique-generation-scope'};
    const session = createSession({config: {kind: 'next-prefix', root: '/unused-synthetic-root', progressPercent: 70, preloadMB: 300, timeoutMs: 1000},
        authorize(value, role, signal) {return authority.bind({principal, signal, sourceProof: value.sourceProof, source: value.source,
            ...(role === 'current' ? {requestId: owner.label} : {requestPrefix: owner.scope + '-next-'})});},
        create: async () => ({open: async input => {
            assert(isTransport(input.transport)); calls.push(input);
            return {source: 'http://127.0.0.1:19001/owned-route', stop: async () => {}, markPlaying: async () => {},
                status: () => ({total: 40, bytes: 0}), prefetch: async () => ({bytes: 40})};
        }, discardNext: async () => {}, status: () => ({bytes: 0}), close: async () => {}})});
    t.after(async () => {await session.close(); authority.close();});
    function candidate(id, requestId, overrides = {}) {
        const source = media + '/' + id + '.mkv?signature=synthetic';
        const sourceProof = authority.issue({principal, source, requestId, sourceKind: 'direct-url', resourceKey: 'mapped-' + id,
            requestOptions: {userAgent: 'Synthetic/1.0'}});
        return {source, sourceProof, serverOrigin: emby, serverId: 'server', accountId: 'account', itemId: id, mediaSourceId: 'source-' + id,
            playSessionId: 'current-owner-session', mediaType: 'Video', mode: 'DirectStream', container: 'strm', live: false, ...overrides};
    }
    const args = value => ['loadfile', value.source, 'replace', '-1', 'user-agent=Synthetic/1.0'];
    return {authority, session, helper, calls, owner, candidate, args};
}
test('external STRM requires exact main proof and UA, while next and actual B retain the same representation', async t => {
    const f = fixture(t), a = f.candidate('A', 'play-A');
    await f.session.setContext(a, f.helper, 1);
    assert(await f.session.select(a.source, f.helper, 1, f.args(a)));
    await f.session.started(f.helper, 1);
    const b = f.candidate('B', f.owner.scope + '-next-1');
    assert.equal((await f.session.preload(b, f.helper, 1)).state, 'ready');
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].identity.serverOrigin, emby);
    assert.equal((await f.calls[1].transport.access()).origin, media);
    const representation = f.calls[1].identity.representation;
    await f.session.retire(); f.helper.currentGenerationId = 2; f.owner.label = 'play-B';
    const actualB = f.candidate('B', 'play-B');
    await f.session.setContext(actualB, f.helper, 2);
    assert(await f.session.select(actualB.source, f.helper, 2, f.args(actualB)));
    assert.equal(f.calls[2].identity.representation, representation);
    await assert.rejects(f.calls[1].transport.access(), error => error.preloadReason === 'request-cancelled');
});
test('wrong current request proof safely leaves original playback without cache IO', async t => {
    const f = fixture(t), a = f.candidate('A', 'old-play-request');
    await f.session.setContext(a, f.helper, 1);
    assert.equal(await f.session.select(a.source, f.helper, 1, f.args(a)), null);
    assert.equal(f.calls.length, 0);
    assert.equal(f.session.status().current.diagnostic.reason, 'source-proof-invalid');
});
test('wrong current UA does not establish the foreground proxy or allow next work', async t => {
    const f = fixture(t), a = f.candidate('A', 'play-A');
    await f.session.setContext(a, f.helper, 1);
    assert.equal(await f.session.select(a.source, f.helper, 1, f.args(a).slice(0, 4).concat('user-agent=Other/1.0')), null);
    await f.session.started(f.helper, 1);
    assert.equal((await f.session.preload(f.candidate('B', f.owner.scope + '-next-1'), f.helper, 1)).diagnostic.reason, 'source-options-changed');
    assert.equal(f.calls.length, 0);
});
for (const requestId of ['play-A', 'old-scope-next-1']) test('next proof rejects foreign resolution ownership ' + requestId, async t => {
    const f = fixture(t), a = f.candidate('A', 'play-A');
    await f.session.setContext(a, f.helper, 1); await f.session.select(a.source, f.helper, 1, f.args(a)); await f.session.started(f.helper, 1);
    const result = await f.session.preload(f.candidate('B', requestId), f.helper, 1);
    assert.equal(result.diagnostic.reason, 'source-proof-invalid'); assert.equal(f.calls.length, 1);
});
test('a valid proof cannot cross account or active-session ownership', async t => {
    const f = fixture(t), a = f.candidate('A', 'play-A');
    await f.session.setContext(a, f.helper, 1); await f.session.select(a.source, f.helper, 1, f.args(a)); await f.session.started(f.helper, 1);
    const result = await f.session.preload(f.candidate('B', f.owner.scope + '-next-1', {accountId: 'other'}), f.helper, 1);
    assert.equal(result.diagnostic.reason, 'next-identity'); assert.equal(f.calls.length, 1);
});
test('ordinary parser never treats an opaque string or arbitrary external source as authorization', () => {
    const ordinary = {source: emby + '/video.mkv?Static=true', serverOrigin: emby, serverId: 's', accountId: 'a', itemId: 'i', mediaSourceId: 'm',
        playSessionId: 'p', mode: 'DirectStream', mediaType: 'Video', container: 'mkv', live: false};
    assert(parseContext(ordinary));
    assert.equal(parseContext({...ordinary, sourceProof: 'forged'}), null);
    assert.equal(parseContext({...ordinary, source: media + '/video.mkv?Static=true'}), null);
    assert.equal(parseContext({...ordinary, container: 'strm'}), null);
    assert.equal(parseContext({...ordinary, source: emby + '/video.mkv'}), null);
});
