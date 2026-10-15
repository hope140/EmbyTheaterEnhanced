'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createProvider, prepareSections, supportedVersion} = require('../src/electronapp/enhanced/home/server-sections.js');
const rows = () => [{Id: 'section/one', SectionType: 'resume', Name: 'Continue', ViewType: 'cards'},
    {Id: 'second', SectionType: 'userviews', Name: 'Library', ViewType: 'buttons'}];
function fixture(handler = () => Promise.resolve(rows()), timeoutMs = 1000) {
    const calls = [];
    let user = 'user 1', server = 'server-1', version = '4.10.1.0', current;
    const client = {getCurrentUserId: () => user, serverId: () => server, serverVersion: () => version,
        getUrl(route, query) { return {route, query}; },
        getJSON(request, signal) { calls.push({request, signal}); return handler(request, signal); }};
    current = client;
    return {calls, client, provider: createProvider(() => current, {timeoutMs}),
        user(value) { user = value; }, server(value) { server = value; }, version(value) { version = value; }, switchClient() { current = {...client}; }};
}
const start = fixture => fixture.provider.loadSections({displayMode: 'mobile,desktop'});
test('strict version gate skips old, malformed and missing server versions', async () => {
    for (const version of ['4.9.0.0', '4.10.0.3', '', 'garbage', '4.10.a.4', '4.10.0.4-beta']) {
        assert.equal(supportedVersion(version), false);
        const f = fixture(); f.version(version); assert.equal((await start(f)).status, 'fallback'); assert.equal(f.calls.length, 0);
    }
    assert.equal(supportedVersion('4.10.0.4'), true); assert.equal(supportedVersion('4.11.0'), true);
});
test('preserves server section order and titles, projects commands and URLs away', async () => {
    const input = rows(); input[0].Href = 'https://unused.invalid'; input[0].QueryOptions = {UserId: 'wrong'};
    const f = fixture(() => Promise.resolve(input));
    const result = await start(f);
    assert.equal(result.status, 'server'); assert.deepEqual(result.sections.map(row => row.Id), ['section/one', 'second']);
    assert.equal(result.sections[0].Href, undefined); assert.equal(result.sections[0].QueryOptions, undefined);
    assert.ok(Object.isFrozen(result.sections[0]));
    assert.deepEqual(f.calls[0].request, {route: 'Users/user%201/HomeSections', query: {displayMode: 'mobile,desktop'}});
    f.provider.dispose();
});
test('empty layout is retained, invalid or unsupported layout falls back as a whole', async () => {
    assert.deepEqual(await start(fixture(() => Promise.resolve([]))), {status: 'server', sections: []});
    for (const input of [null, {Items: rows()}, [rows()[0], rows()[0]], [{...rows()[0], ViewType: 'script'}],
        [{...rows()[0], HeaderButtons: [{ButtonBehavior: 'taskbutton'}]}], [{...rows()[0], SectionType: 'unknown'}],
        [{...rows()[0], Name: '\0bad'}], Array.from({length: 65}, (_, i) => ({...rows()[0], Id: String(i)}))]) {
        assert.equal((await start(fixture(() => Promise.resolve(input)))).status, 'fallback');
    }
});
test('items requests use encoded server section ID, stable random seed, fixed query and original Item DTO', async () => {
    const item = {Id: 'item-1', ServerId: 'server-1', UserData: {PlaybackPositionTicks: 123}};
    const f = fixture(request => Promise.resolve(request.route.endsWith('/HomeSections') ? rows() : {Items: [item], TotalRecordCount: 50}));
    const section = (await start(f)).sections[0];
    const result = await f.provider.loadItems(section, {startIndex: 2, limit: 5});
    assert.equal(result.status, 'server'); assert.equal(result.result.Items[0], item);
    assert.equal(f.calls[1].request.route, 'Users/user%201/Sections/section%2Fone/Items');
    assert.equal(f.calls[1].request.query.StartIndex, 2); assert.equal(f.calls[1].request.query.Limit, 5);
    await f.provider.loadItems(section);
    assert.equal(f.calls[1].request.query.RandomSeed, f.calls[2].request.query.RandomSeed);
    assert.equal((await f.provider.loadItems({...section})).status, 'cancelled');
    assert.equal((await f.provider.loadItems(section, {limit: 101})).status, 'fallback');
    f.provider.dispose();
});
test('new refresh cancels old request even when underlying API ignores AbortSignal', async () => {
    let resolveOld;
    const f = fixture(() => f.calls.length === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(rows()));
    const old = start(f); await Promise.resolve();
    const current = await start(f); assert.equal(current.status, 'server');
    assert.deepEqual(await old, {status: 'cancelled'}); assert.equal(f.calls[0].signal.aborted, true);
    resolveOld(rows()); await Promise.resolve(); f.provider.dispose();
});
test('server, user or client switch rejects late data without returning fallback for the obsolete owner', async () => {
    for (const change of ['user', 'server', 'switchClient']) {
        let resolve;
        const f = fixture(() => new Promise(done => { resolve = done; }));
        const pending = start(f); await Promise.resolve(); f[change]('different'); resolve(rows());
        assert.deepEqual(await pending, {status: 'cancelled'}); f.provider.dispose();
    }
});
test('pause/cancel, destroy and external abort settle pending requests and reject late sections', async () => {
    for (const action of ['cancel', 'dispose']) {
        const f = fixture(() => new Promise(() => {}));
        const pending = start(f); await Promise.resolve(); f.provider[action]();
        assert.deepEqual(await pending, {status: 'cancelled'}); assert.ok(f.calls[0].signal.aborted);
        if (action === 'dispose') assert.equal((await start(f)).status, 'cancelled');
    }
    const f = fixture(() => new Promise(() => {})), controller = new AbortController();
    const pending = f.provider.loadSections({displayMode: 'tv', signal: controller.signal});
    await Promise.resolve(); controller.abort(); assert.deepEqual(await pending, {status: 'cancelled'});
    assert.ok(f.calls[0].signal.aborted); f.provider.dispose();
});
test('timeout and HTTP failures request whole-page fallback without exposing error text', async () => {
    const f = fixture(() => new Promise(() => {}), 5);
    assert.deepEqual(await start(f), {status: 'fallback', reason: 'timeout'});
    assert.ok(f.calls[0].signal.aborted); f.provider.dispose();
    for (const status of [401, 403, 404, 500]) {
        const error = Object.assign(new Error('private url token'), {status});
        const result = await start(fixture(() => Promise.reject(error)));
        assert.deepEqual(result, {status: 'fallback', reason: 'request-or-schema-failed'});
        assert.ok(!JSON.stringify(result).includes('token'));
    }
});
test('invalid Item payload or cross-server identity falls back and does not manufacture playback IDs', async () => {
    for (const data of [null, [], {Items: [{}]}, {Items: [{Id: 'one', ServerId: 'other'}]}, {Items: [], TotalRecordCount: -1}]) {
        const f = fixture(request => Promise.resolve(request.route.endsWith('/HomeSections') ? rows() : data));
        const section = (await start(f)).sections[0];
        assert.equal((await f.provider.loadItems(section)).status, 'fallback'); f.provider.dispose();
    }
});
test('stale section objects are retired by refresh, and pre-aborted work never issues GET', async () => {
    const f = fixture(); const old = (await start(f)).sections[0]; await start(f);
    assert.deepEqual(await f.provider.loadItems(old), {status: 'cancelled'});
    const controller = new AbortController(); controller.abort(); const before = f.calls.length;
    assert.equal((await f.provider.loadSections({displayMode: 'tv', signal: controller.signal})).status, 'cancelled');
    assert.equal(f.calls.length, before); f.provider.dispose();
});
test('AMD registration is inert and exports the same provider surface without loading other modules', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/electronapp/enhanced/home/server-sections.js'), 'utf8');
    let exported;
    vm.runInNewContext(source, {define(dependencies, factory) {
        assert.deepEqual(Array.from(dependencies), ['exports']); const exports = {}; factory(exports); exported = exports.default;
    }}, {timeout: 1000});
    assert.deepEqual(Object.keys(exported).sort(), ['createProvider', 'prepareSections', 'supportedVersion']);
    assert.equal(exported.supportedVersion('4.10.1.0'), true);
});
test('server display and monitor fields are projected and invalid values reject the full layout', () => {
    const value = prepareSections([{...rows()[0], CollectionType: 'tvshows', Monitor: ['markplayed', 'videoplayback'], CardSizeOffset: -1}])[0];
    assert.equal(value.CollectionType, 'tvshows'); assert.equal(value.CardSizeOffset, -1);
    assert.deepEqual(value.Monitor, ['markplayed', 'videoplayback']); assert.ok(Object.isFrozen(value.Monitor));
    for (const field of [{Monitor: ['unknown-command']}, {Monitor: 'videoplayback'}, {CardSizeOffset: 0.5}, {CardSizeOffset: 9}, {CollectionType: 'https://invalid'}]) {
        assert.throws(() => prepareSections([{...rows()[0], ...field}]), /sections-unsupported/);
    }
});
test('dot path segment identities are rejected before an HTTP URL can normalize them', async () => {
    for (const id of ['.', '..']) {
        assert.throws(() => prepareSections([{...rows()[0], Id: id}]), /sections-unsupported/);
        const f = fixture(); f.user(id); assert.equal((await start(f)).status, 'fallback'); assert.equal(f.calls.length, 0); f.provider.dispose();
    }
});
