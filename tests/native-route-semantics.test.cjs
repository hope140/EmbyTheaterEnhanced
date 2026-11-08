'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const resolver = require('../src/electronapp/resolvers/strm-resolver');
const stats = require('../src/electronapp/enhanced/playback-route-stats');

function context() {
    return {item: {Path: 'C:\\Library\\movie.strm'}, mediaSource: {Path: '/media/movie.mkv', Container: 'strm'},
        url: 'https://emby.example.test/native', playMethod: 'DirectPlay'};
}
function dependencies(order, hit) {
    const calls = [];
    return {calls, requestId: 'synthetic-route', config: {version: 1, enabled: true, rules: [{
        id: 'synthetic', enabled: true, sourcePrefix: '/media', mountPrefix: 'X:\\Media', strategy: 'custom', order
    }]}, fs: {existsSync(value) { calls.push('mount'); return hit === 'mount' && value === 'X:\\Media\\movie.mkv'; }},
    cd2Transport: {resolve: async request => {
        calls.push(request.mode);
        return hit === 'cd2' ? {status: 'hit', type: 'url', source: 'https://cdn.example.test/movie', sourceKind: 'direct-url'}
            : {status: 'miss', reason: 'missing_file'};
    }}};
}
function values(result) {
    return Object.fromEntries(stats.makeStats({...result, route: resolver.routeForResult(result)}).stats.map(s => [s.label, s.value]));
}

test('native first is selected without probing later routes, including sequence continuation', async () => {
    for (const sequence of [false, true]) {
        const deps = dependencies(['native', 'mount', 'direct-url', 'cd2-http'], 'mount');
        const cursor = sequence && resolver.createSequence(context(), deps);
        const result = await (cursor ? cursor.next() : resolver.resolveAsync(context(), deps));
        assert.equal(result.reason, 'native_selected');
        assert.equal(result.fallback, false);
        assert.deepEqual(deps.calls, []);
        assert.equal(values(result)['Fallback:'], '否');
        assert.equal(values(result)['Mount:'], '未使用');
        assert.equal(values(result)['CD2:'], '未使用');
        if (cursor) assert.equal(resolver.routeForResult(await cursor.next()), 'mount', 'native load failure still advances');
    }
});

for (const first of ['mount', 'direct-url']) test(first + ' miss then native preserves only attempted resolution outcomes', async () => {
    const order = first === 'mount' ? ['mount', 'native', 'direct-url', 'cd2-http'] : ['direct-url', 'native', 'mount', 'cd2-http'];
    const result = await resolver.resolveAsync(context(), dependencies(order));
    assert.equal(result.reason, 'native_fallback');
    assert.equal(result.fallback, true);
    assert.equal(values(result)['Fallback:'], '是');
    assert.equal(values(result)['Mount:'], first === 'mount' ? '未命中' : '未使用');
    assert.equal(values(result)['CD2:'], first === 'mount' ? '未使用' : '未命中');
});

for (const first of ['mount', 'direct-url']) test(first + ' source delivery then playback failure keeps fallback on the next pass', async () => {
    const order = first === 'mount' ? ['mount', 'native', 'direct-url', 'cd2-http'] : ['direct-url', 'native', 'mount', 'cd2-http'];
    const cursor = resolver.createSequence(context(), dependencies(order, first === 'mount' ? 'mount' : 'cd2'));
    assert.equal(resolver.routeForResult(await cursor.next()), first);
    const result = await cursor.next(); // The player advances only after a failed load.
    assert.equal(result.reason, 'native_fallback');
    assert.equal(result.fallback, true);
    assert.equal(values(result)[first === 'mount' ? 'Mount:' : 'CD2:'], '命中', 'resolution hit does not mean playback succeeded');
    assert.equal(values(result)[first === 'mount' ? 'CD2:' : 'Mount:'], '未使用');
});

test('disabled, unmatched, ordinary and transcode bypasses are not fallback attempts', async () => {
    for (const kind of ['disabled', 'unmatched', 'ordinary', 'transcode']) {
        const ctx = context(), deps = dependencies(['native', 'mount', 'direct-url', 'cd2-http']);
        if (kind === 'disabled') deps.config.enabled = false;
        if (kind === 'unmatched') deps.config.rules = [];
        if (kind === 'ordinary') {ctx.item.Path = 'movie.mkv'; ctx.mediaSource.Container = 'mkv';}
        if (kind === 'transcode') ctx.playMethod = 'Transcode';
        const result = await resolver.resolveAsync(ctx, deps);
        assert.equal(result.type, 'native');
        assert.equal(result.fallback, false, kind);
        assert.deepEqual(deps.calls, []);
        if (kind !== 'ordinary') {
            assert.equal(values(result)['Fallback:'], '否');
            assert.equal(values(result)['Mount:'], '未使用');
        }
    }
});

test('route state retains explicit mount outcome and does not infer a miss from native fallback', () => {
    const state = stats.create(), request = {};
    state.begin(request);
    state.commit(request, {isStrm: true, route: 'native', reason: 'native_fallback', fallback: true, mountReason: 'mount_not_configured'});
    assert.equal(Object.fromEntries(state.category().stats.map(s => [s.label, s.value]))['Mount:'], '未使用');
    assert.equal(values({type: 'native', isStrm: true, reason: 'native_fallback', fallback: true})['Mount:'], '未使用');
});
