'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {enumerate, episodeTitle} = require('../src/electronapp/enhanced/advance-download/collection');
const {createManager} = require('../src/electronapp/enhanced/advance-download/manager');
const {createStore, validTask} = require('../src/electronapp/enhanced/advance-download/task-store');
const {fixture, media, token} = require('./helpers/advance-download-fixture.cjs');
const probe = require('../src/electronapp/enhanced/advance-download/source-probe');

async function setup(t, count = 3) {
    const f = await fixture(t), root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-collection-')));
    t.after(() => fs.rmSync(root, {recursive: true, force: true}));
    const directory = path.join(root, 'videos'); fs.mkdirSync(directory);
    const context = {serverId: 'server', accountId: 'account', itemId: 'season', serverAddress: f.emby + '/base', token};
    const episodes = Array.from({length: count}, (_, i) => ({Id: 'ep' + i, Type: 'Episode', ServerId: 'server', MediaType: 'Video', CanDownload: true,
        SeriesId: 'series', SeasonId: 'season', ParentId: 'season', SeriesName: 'Fixture Series', Name: 'Episode', ParentIndexNumber: 1, IndexNumber: i + 1,
        Path: '/server/episode.strm', MediaSources: [{Id: 'source', Container: 'mkv', Size: media.length, Path: 'X:\\Media\\episode.mkv'}]}));
    f.state.library = {season: {Id: 'season', Type: 'Season', Name: 'Season One', SeriesName: 'Fixture Series'}, series: {Id: 'series', Type: 'Series', Name: 'Fixture Series'},
        ...Object.fromEntries(episodes.map(item => [item.Id, item]))};
    f.state.catalogues = {season: episodes, series: episodes};
    const options = {profileRoot: root, createSession: ctx => f.session({...ctx, mediaSourceId: ctx.mediaSourceId}), selectDirectory: async () => ({status: 'selected', directory}), confirmCollection: async () => true};
    function manager(extra = {}) {const result = createManager({...options, ...extra}); t.after(() => result.close()); return result;}
    return {...f, root, directory, context, episodes, manager};
}

test('season and series enumeration page the authenticated catalogue, validate membership and sort episode numbers', async t => {
    const f = await setup(t, 105);
    f.state.catalogues.season = [...f.episodes].reverse();
    const season = await enumerate(f.context);
    assert.equal(season.episodes.length, 105); assert.equal(season.episodes[0].id, 'ep0'); assert.equal(season.episodes.at(-1).id, 'ep104');
    assert.match(season.episodes[0].title, /Fixture Series - S01E01 - Episode/);
    assert.equal((await enumerate({...f.context, itemId: 'series'})).type, 'Series');
    const pages = f.calls.filter(call => call.url.startsWith('/base/Users/account/Items?'));
    assert.equal(pages.length, 4); assert.ok(pages.every(call => call.headers['x-emby-token'] === token));
    f.state.catalogues.season[0] = {...f.episodes[0], SeasonId: 'another'};
    await assert.rejects(enumerate(f.context), error => probe.reasonOf(error) === 'collection-invalid');
    f.state.downloadAllowed = false;
    const before = f.calls.length;
    await assert.rejects(enumerate(f.context), error => probe.reasonOf(error) === 'download-not-permitted');
    assert.equal(f.calls.length - before, 2, 'permission denial does not enumerate children');
    assert.equal(episodeTitle({Type: 'Movie', Name: 'Movie'}), 'Movie');
});

test('invalid or changing catalogues never admit a partial batch', async t => {
    const f = await setup(t), original = f.episodes;
    for (const [list, reason] of [[[], 'collection-empty'], [[original[0], original[0]], 'collection-invalid'],
        [Array.from({length: 513}, (_, i) => ({...original[0], Id: 'ep' + i})), 'collection-too-large']]) {
        f.state.catalogues.season = list;
        const manager = f.manager(), result = await manager.enqueueCollection(f.context);
        assert.equal(result.reason, reason); assert.deepEqual(manager.list(f.context), []); await manager.close();
    }
    const manager = f.manager({sourceDependencies: {jsonRequest: async url => {
        const u = new URL(url);
        if (u.pathname.endsWith('/Public')) return {Id: 'server'};
        if (u.pathname.endsWith('/account')) return {Id: 'account', Policy: {EnableContentDownloading: true}};
        if (u.pathname.endsWith('/season')) return f.state.library.season;
        return {Items: u.searchParams.get('StartIndex') === '0' ? [original[0]] : [original[1]], TotalRecordCount: u.searchParams.get('StartIndex') === '0' ? 2 : 3};
    }}});
    assert.equal((await manager.enqueueCollection(f.context)).reason, 'collection-changed');
    assert.deepEqual(manager.list(f.context), []); assert.deepEqual(fs.readdirSync(f.directory), []);
});

test('queued episodes persist before probing, restart safely, skip existing tasks and publish distinct playable files', async t => {
    const f = await setup(t); f.state.pauseTransfer = true;
    let stop, stopped;
    const closed = new Promise(resolve => {stopped = resolve;});
    const manager = f.manager({onChange(value) {if (value.bytes >= 1024 && !stop) {stop = manager.close(); stop.then(stopped);}}});
    assert.equal((await manager.enqueueCollection(f.context)).added, 3); await closed;
    const store = createStore(f.root), before = store.list();
    assert.equal(before.length, 3); assert.equal(before.filter(task => task.schemaVersion === 2).length, 2);
    assert.ok(before.every(task => ['paused', 'queued'].includes(task.state)), 'shutdown leaves no active transfer; unstarted requests may remain queued until restore');
    for (const task of before.filter(task => !task.source)) {
        assert.equal(validTask({...task, state: 'complete'}), false);
        assert.equal(validTask({...task, partial: {offset: 0}}), false);
        assert.equal(validTask({...task, file: {name: 'foreign.mkv'}}), false);
        assert.equal(validTask({...task, token}), false);
    }
    f.state.pauseTransfer = false;
    const next = f.manager(); next.attach(f.context); await next.idle();
    assert.ok(store.list().every(task => task.state === 'complete'));
    assert.equal((await next.enqueueCollection(f.context)).added, 0); await next.idle();
    assert.equal(store.list().length, 3);
    const files = fs.readdirSync(f.directory).filter(name => name.endsWith('.mkv'));
    assert.equal(files.length, 3); assert.ok(files.every(name => /S01E0[123]/.test(name)));
    for (const file of files) assert.deepEqual(fs.readFileSync(path.join(f.directory, file)), media);
    assert.ok(f.calls.some(call => call.headers.range === 'bytes=1024-'));
    const text = store.list().map(task => fs.readFileSync(path.join(f.root, 'advance-downloads', task.id + '.json'), 'utf8')).join('');
    assert.ok(!text.includes(token) && !text.includes('signature='));
});

test('all episode preflight failures remain persistent beyond transient-diagnostic capacity and support retry by task id', async t => {
    const f = await setup(t, 70);
    const manager = f.manager({createSession() {return {acquire: async () => {throw probe.failure('source-selection-required');}, close() {}};}});
    assert.equal((await manager.enqueueCollection(f.context)).added, 70); await manager.idle();
    assert.equal(manager.list(f.context).length, 70); assert.ok(manager.list(f.context).every(task => task.state === 'failed'));
    assert.equal((await manager.enqueueCollection(f.context)).reused, 70);
    await manager.close();
    const next = f.manager(); next.attach(f.context);
    const task = createStore(f.root).list()[0];
    assert.equal(next.list(f.context).length, 70);
    assert.equal(next.retry(f.context, task.id).status, 'queued'); await next.idle();
    assert.equal(createStore(f.root).get(task.id).state, 'complete');
    assert.equal(next.list(f.context).filter(task => task.state === 'failed').length, 69);
});

test('individual selected-version download promotes a failed episode request without a duplicate task', async t => {
    const f = await setup(t, 1);
    f.episodes[0].MediaSources.push({...f.episodes[0].MediaSources[0], Id: 'other'});
    const manager = f.manager();
    await manager.enqueueCollection(f.context); await manager.idle();
    const before = createStore(f.root).list()[0]; assert.equal(before.reason, 'source-selection-required');
    const result = await manager.enqueue({...f.context, itemId: 'ep0', mediaSourceId: 'source'}); await manager.idle();
    assert.equal(result.task.id, before.id); assert.equal(createStore(f.root).list().length, 1);
    assert.equal(createStore(f.root).get(before.id).state, 'complete');
});

test('late native batch confirmation cannot admit tasks or hold shutdown open', async t => {
    const f = await setup(t); let release, entered;
    const blocked = new Promise(resolve => {entered = resolve;}), gate = new Promise(resolve => {release = resolve;});
    const manager = f.manager({confirmCollection: async () => {entered(); return gate;}});
    const pending = manager.enqueueCollection(f.context); await blocked;
    await manager.close(); release(true);
    assert.equal((await pending).status, 'cancelled'); assert.deepEqual(createStore(f.root).list(), []);
    assert.deepEqual(fs.readdirSync(f.directory), []);
});
