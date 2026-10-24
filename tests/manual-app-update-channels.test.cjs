'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const maintenance = require('../src/electronapp/enhanced/maintenance');
const update = require('../src/electronapp/enhanced/manual-app-update');
const ipc = require('../src/electronapp/enhanced/maintenance-ipc');
const {eventFor} = require('./helpers/trusted-renderer.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function release(version, flags = {}) {
    const name = 'EmbyTheaterEnhanced-' + version + '-win-x64-setup.exe';
    return {tag_name: 'v' + version, draft: false, prerelease: false,
        html_url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v' + version,
        body: '[docs](https://example.invalid/docs)', assets: [{id: 123, state: 'uploaded', name, size: 10,
            digest: 'sha256:' + 'a'.repeat(64), browser_download_url: update.API.replace('api.github.com/repos/', 'github.com/').replace('/releases/', '/releases/download/v' + version + '/') + name}], ...flags};
}
function listed(rows, currentVersion = '0.4.0') {
    const urls = [];
    return {urls, result: maintenance.checkLatestRelease({channel: 'testing', currentVersion, requestJson: async url => {
        urls.push(url); const page = Number(new URL(url).searchParams.get('page')) - 1;
        return page < rows.length ? rows[page] : [];
    }})};
}

test('formal channel keeps the official latest contract and excludes flags, drafts and SemVer prereleases', async () => {
    for (const item of [release('0.4.1', {prerelease: true}), release('0.5.0', {draft: true}), release('0.4.1-rc.1')]) {
        const result = await maintenance.checkLatestRelease({currentVersion: '0.4.0', channel: 'stable', requestJson: async url => {
            assert.equal(url, maintenance.LATEST_RELEASE_API_URL); return item;
        }});
        assert.equal(result.status, 'error');
    }
    assert.equal((await maintenance.checkLatestRelease({currentVersion: '0.4.0', requestJson: async () => release('0.4.0')})).status, 'latest');
});

test('testing channel paginates unsorted releases and chooses SemVer, not publication order or lexical order', async () => {
    const h = listed([[release('99.0.0', {draft: true}), release('0.4.2'), release('0.4.10-rc.2', {prerelease: true}),
        release('0.4.9'), {...release('9.0.0'), html_url: 'https://other.invalid/'}],
    [release('0.4.10-rc.10', {prerelease: true}), release('0.4.10', {prerelease: true}), release('0.3.0')]]);
    const result = await h.result;
    assert.equal(result.latestVersion, '0.4.10'); assert.equal(result.prerelease, true); assert.equal(result.channel, 'testing');
    assert.equal(result.status, 'update-available');
    assert.deepEqual(h.urls, [maintenance.RELEASE_LIST_API_URL + '1', maintenance.RELEASE_LIST_API_URL + '2']);
});

test('same-version promotion and build metadata never cause an update or downgrade; final SemVer outranks rc', async () => {
    for (const rows of [[release('0.4.1', {prerelease: true})], [release('0.4.1')], [release('0.4.1+build.2')]]) {
        assert.equal((await listed([rows], '0.4.1+build.1').result).status, 'latest');
    }
    assert.equal((await listed([[release('0.4.1')]], '0.4.2').result).status, 'ahead');
    const promoted = await listed([[release('0.4.1-rc.10', {prerelease: true}), release('0.4.1')]], '0.4.1-rc.10').result;
    assert.equal(promoted.status, 'update-available'); assert.equal(promoted.prerelease, false);
    const tie = await listed([[release('0.4.1', {prerelease: true}), release('0.4.1+promoted')]]).result;
    assert.equal(tie.prerelease, false);
});

test('incomplete or failed pagination is never reported as latest and unreviewed channels do no traffic', async () => {
    const full = Array.from({length: 5}, () => release('0.4.1'));
    let calls = 0;
    const limit = await maintenance.checkLatestRelease({channel: 'testing', currentVersion: '0.4.0', requestJson: async () => { calls++; return full; }});
    assert.equal(limit.reason, 'pagination-limit'); assert.equal(calls, maintenance.MAX_RELEASE_PAGES);
    for (const bad of [null, {}, [release('0.4.1'), ...full]]) assert.equal((await listed([bad]).result).reason, 'invalid-release-list');
    assert.equal((await listed([[release('9.0.0', {draft: true})]]).result).reason, 'no-channel-release');
    assert.equal((await maintenance.checkLatestRelease({channel: 'other', currentVersion: '0.4.0', requestJson: () => { throw Error('must not call'); }})).reason, 'invalid-channel');
    let count = 0;
    assert.equal((await maintenance.checkLatestRelease({channel: 'testing', currentVersion: '0.4.0', requestJson: async () => {
        if (++count === 1) return full; throw Error('synthetic offline');
    }})).reason, 'network-error');
});

test('prerelease installer identity uses the exact full tag/version and retains official size and digest requirements', () => {
    const item = release('0.4.2-beta.1+build.2', {prerelease: true});
    const asset = update.installerFromRelease(item);
    assert.equal(asset.name, 'EmbyTheaterEnhanced-0.4.2-beta.1+build.2-win-x64-setup.exe');
    assert.equal(asset.sha256, 'a'.repeat(64));
    assert.equal(update.installerFromRelease({...item, assets: [{...item.assets[0], digest: undefined}]}), null);
    assert.equal(update.installerFromRelease(release('0.4.2-beta.01', {prerelease: true})), null);
});

function harness(options = {}) {
    const handlers = new Map(), sender = {}, event = eventFor(sender);
    let saved = options.channel || 'stable', saves = 0, picker = 0, download = 0;
    let requester = options.requestJson || (async url => url.includes('?') ? [release('0.4.1', {prerelease: true})] : release(url.endsWith('latest') ? '0.4.1' : '0.4.1', {prerelease: !url.endsWith('latest')}));
    const unregister = ipc.register({ipcMain: {handle: (channel, fn) => handlers.set(channel, fn), removeHandler: channel => handlers.delete(channel)},
        getWebContents: () => sender, getAppInfo: async () => ({appVersion: options.currentVersion || '0.4.0'}),
        preferences: {read: options.read || (() => saved), save: async value => { saves++; if (options.saveFailure) throw Error('synthetic save failed'); saved = value; }},
        requestJson: (url, settings) => requester(url, settings), checkTimeoutMs: options.timeout || 30000,
        dialog: {showOpenDialog: async () => { picker++; return options.picker ? options.picker() : {canceled: true}; }},
        downloadInstaller: async () => { download++; return {status: 'downloaded'}; }});
    return {handlers, event, unregister, request(fn) { requester = fn; }, counts: () => ({saves, picker, download}),
        invoke: (channel, payload) => handlers.get(channel)(event, payload)};
}

test('switching aborts and drains the old check, clears its candidate/links and does not check automatically', async () => {
    let finish, signal;
    const h = harness({requestJson: async (_url, settings) => { signal = settings.signal; return new Promise(resolve => { finish = resolve; }); }});
    const old = h.invoke(ipc.CHANNELS.CHECK_UPDATE); await tick();
    const switching = h.invoke(ipc.CHANNELS.SET_CHANNEL, {channel: 'testing'}); await tick();
    assert.equal(signal.aborted, true); assert.equal(h.counts().saves, 0);
    assert.equal((await h.invoke(ipc.CHANNELS.CHECK_UPDATE)).reason, 'busy');
    const reading = h.invoke(ipc.CHANNELS.GET_CHANNEL);
    finish(release('0.4.9'));
    assert.equal((await old).status, 'cancelled'); assert.equal((await switching).channel, 'testing');
    assert.equal((await reading).channel, 'testing'); assert.equal(h.counts().saves, 1);
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'verification-unavailable');
    assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, {url: 'https://example.invalid/docs'})).reason, 'invalid-note-link');
    await h.unregister();
});

test('download locks the channel through revalidation/picker; after cancellation switching clears the candidate', async () => {
    let chosen;
    const h = harness({channel: 'testing', picker: () => new Promise(resolve => { chosen = resolve; })});
    assert.equal((await h.invoke(ipc.CHANNELS.CHECK_UPDATE)).latestVersion, '0.4.1');
    const downloading = h.invoke(ipc.CHANNELS.DOWNLOAD); await tick();
    assert.equal(h.counts().picker, 1);
    assert.equal((await h.invoke(ipc.CHANNELS.SET_CHANNEL, {channel: 'stable'})).reason, 'busy');
    assert.equal((await h.invoke(ipc.CHANNELS.GET_CHANNEL)).channel, 'testing'); assert.equal(h.counts().saves, 0);
    await h.invoke(ipc.CHANNELS.CANCEL); assert.equal((await downloading).status, 'cancelled');
    chosen({filePaths: ['/late-selection']});
    assert.equal((await h.invoke(ipc.CHANNELS.SET_CHANNEL, {channel: 'stable'})).status, 'saved');
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'verification-unavailable');
    assert.equal(h.counts().download, 0); await h.unregister();
});

test('failed persistence keeps the previous channel but retires old candidate and link permissions', async () => {
    const h = harness({saveFailure: true}); await h.invoke(ipc.CHANNELS.CHECK_UPDATE);
    assert.equal((await h.invoke(ipc.CHANNELS.SET_CHANNEL, {channel: 'testing'})).status, 'error');
    assert.equal((await h.invoke(ipc.CHANNELS.GET_CHANNEL)).channel, 'stable');
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'verification-unavailable');
    assert.equal((await h.invoke(ipc.CHANNELS.OPEN_NOTE_LINK, {url: 'https://example.invalid/docs'})).reason, 'invalid-note-link');
    await h.unregister();
});

test('promotion after checking requires a fresh explicit check rather than silently changing release identity', async () => {
    const h = harness({channel: 'testing'}); await h.invoke(ipc.CHANNELS.CHECK_UPDATE);
    h.request(async url => { assert.equal(url, update.API + 'tags/v0.4.1'); return release('0.4.1'); });
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'release-changed');
    assert.equal(h.counts().picker, 0); await h.unregister();
});

test('an installed testing version has no downloadable candidate for the same version or an older formal release', async () => {
    const h = harness({channel: 'testing', currentVersion: '0.4.1'});
    assert.equal((await h.invoke(ipc.CHANNELS.CHECK_UPDATE)).status, 'latest');
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'verification-unavailable');
    await h.invoke(ipc.CHANNELS.SET_CHANNEL, {channel: 'stable'}); h.request(async () => release('0.4.0'));
    assert.equal((await h.invoke(ipc.CHANNELS.CHECK_UPDATE)).status, 'ahead');
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'verification-unavailable');
    assert.equal(h.counts().picker, 0); await h.unregister();
});

test('channel IPC validates schema and frame before preferences, and shutdown prevents a pending save', async () => {
    let finish;
    const h = harness({read: () => new Promise(resolve => { finish = resolve; })});
    assert.equal((await h.handlers.get(ipc.CHANNELS.SET_CHANNEL)({sender: {}}, {channel: 'testing'})).reason, 'untrusted_sender');
    for (const request of [null, [], {}, {channel: 'other'}, {channel: 'testing', extra: 1}, Object.create({channel: 'testing'})]) {
        assert.equal((await h.invoke(ipc.CHANNELS.SET_CHANNEL, request)).reason, 'invalid-request');
    }
    assert.equal((await h.invoke(ipc.CHANNELS.GET_CHANNEL, {})).reason, 'invalid-request');
    const saving = h.invoke(ipc.CHANNELS.SET_CHANNEL, {channel: 'testing'}); await tick();
    const closing = h.unregister(); finish('stable');
    assert.equal((await saving).reason, 'closed'); await closing; assert.equal(h.counts().saves, 0);
});

test('the manual multi-page check has one total deadline and leaves no cached candidate', async () => {
    const h = harness({timeout: 10, requestJson: (_url, settings) => new Promise((_resolve, reject) => settings.signal.addEventListener('abort', () => reject(Error('aborted')), {once: true}))});
    assert.equal((await h.invoke(ipc.CHANNELS.CHECK_UPDATE)).reason, 'timeout');
    assert.equal((await h.invoke(ipc.CHANNELS.DOWNLOAD)).reason, 'verification-unavailable'); await h.unregister();
});
