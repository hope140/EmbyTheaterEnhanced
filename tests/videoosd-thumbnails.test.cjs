'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');
const {patchVideoOsd} = require('../tools/patch-videoosd-lifecycle.cjs');
const {harness, storage} = require('./helpers/api-client-amd.cjs');
const root = path.resolve(__dirname, '..');
const original = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/videoosd/videoosd.js'), 'utf8');
assert.equal(crypto.createHash('sha256').update(original).digest('hex'), '86ab60c897e827b5152435350fe7b3801d8afd6b8889eef96e9996e71bb5eeab');
const source = process.env.ETE_THUMBNAIL_BASELINE === '1' ? original : patchVideoOsd(original);
new vm.Script(source, {filename: 'transformed-videoosd.js'});
function span(start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
    assert(a >= 0 && b > a, 'fixed source anchors'); return source.slice(a, b);
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject}; }
function thumbnails(tag = 'A') { return {Thumbnails: [{PositionTicks: 0, ImageTag: tag}], AspectRatio: 16 / 9}; }
function fixture() {
    const classes = new Set();
    const bubble = {style: {}, classList: {add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)), contains: v => classes.has(v)}};
    const player = {};
    let item = {Id: 'item-A', ServerId: 'server-A', MediaType: 'Video'}, media = {Id: 'version-A'}, session = 'session-A';
    let account = 'user-A', address = 'https://server-a.invalid', selectedApi;
    const requests = [], images = [], pending = [], itemRequests = [], itemPending = [];
    const api = {serverId: () => 'server-A', getCurrentUserId: () => account, serverAddress: () => address,
        accessToken: () => 'synthetic-token', getThumbnails(id, options, signal) {const row = {id, options, signal}; requests.push(row); const task = deferred(); pending.push(task); return task.promise;},
        getImageUrl(id, options) {images.push({id, options}); return address + '/Items/' + id + '/Images/Thumbnail?' + new URLSearchParams(options);},
        getItem(user, id) {itemRequests.push({user, id}); const task = deferred(); itemPending.push(task); return task.promise;}, getCurrentUser: () => Promise.resolve({Configuration: {IntroSkipMode: 'None'}})};
    selectedApi = api;
    const manager = {currentItem: () => item, currentMediaSource: () => media, playSessionId: () => session,
        getCurrentPlayer: () => player, audioTracks: () => [], subtitleTracks: () => []};
    const self = {currentPlayer: player, currentItem: item, paused: false, showOsd() {}, bottomTabs: {selectedIndex() {}},
        nowPlayingPositionSlider: {getBubbleElement: () => bubble}, btnVideoOsdSettingsRight: {}, boundShowOsdDefaultParams() {}};
    const context = {self, Promise, AbortController, URL, console: {log() {}}, currentItemThumbnails: null, currentItemThumbnailsPromise: null,
        VideoOsd: function () {}, isEnabled: false,
        clearBlurFromDocumentElement() {}, stopOsdHideTimer() {}, destroyPlayQueue() {}, destroyLyricsRenderer() {},
        _mouse: {default: {releaseMouseListening() {}}}, _backdrop: {default: {clear() {}}},
        currentMediaSource: media, currentDisplayChapters: [], currentRuntimeTicks: 1000000000, enableProgressByTimeOfDay: false,
        _connectionmanager: {default: {getApiClient: () => selectedApi}}, _playbackmanager: {default: manager},
        _dom: {default: {htmlEncode: s => String(s), addEventListener() {}}}, _layoutmanager: {default: {tv: false}},
        _datetime: {default: {getDisplayRunningTime: value => String(value)}},
        resetUpNextDialog() {}, resetRatingText() {}, showHideSkipIntro() {}, destroyStats() {}, destroySubtitleOffsetOverlay() {},
        _events: {default: {off() {}}}, updateDisplayItem: info => { self.currentItem = info.originalItem; },
        nowPlayingVolumeSlider: {}, btnFastForward: {classList: {remove() {}}}, btnRewind: {classList: {remove() {}}}, btnAudio: {classList: {add() {}}}, btnSubtitles: {classList: {add() {}}},
        hideButton() {}, supportsSubtitleDownloading: () => false, _itemhelper: {default: {canDownloadSubtitles: () => false}}};
    for (const name of ['onPlaybackStart', 'onMediaStreamsChanged', 'onVolumeChanged', 'onPlayPauseStateChanged', 'onTimeUpdate', 'updateFullscreenIcon', 'onStateChanged', 'onRepeatModeChange', 'onSubtitleTrackChange', 'onPlaylistItemAdd', 'onPlaylistItemMove', 'onPlaylistItemRemove']) context[name] = () => {};
    vm.createContext(context);
    vm.runInContext(span('    var lastPointerEvent = 0;', '    function onStop()'), context);
    vm.runInContext(span('      (self.nowPlayingPositionSlider.getBubbleHtml = function (value) {', '      _dom.default.addEventListener(\n        self.osdBottomElement,').trim().replace(/,$/, ';'), context);
    vm.runInContext(span('    function onPlaybackStopped(e, state) {', '    function onMediaStreamsChanged(') +
        span('    function releaseCurrentPlayer() {', '    function resetRatingText() {') +
        span('    function updateNowPlayingInfo(player, state) {', '    function setPoster(') +
        span('    function onTimeUpdate(e) {', '    function hideButton('), context);
    vm.runInContext(span('(VideoOsd.prototype.pause = function () {', '    (_exports.default = VideoOsd);').trim().replace(/,$/, ';'), context);
    self.headerElement = self.backdropContainer = self.backgroundContainer = {classList: bubble.classList};
    self.releaseRateKeys = () => {};
    self.releaseCurrentPlayer = () => context.releaseCurrentPlayer();
    return {context, self, player, api, manager, bubble, classes, requests, pending, images, itemRequests, itemPending,
        render: (percent = 10) => self.nowPlayingPositionSlider.getBubbleHtml(percent),
        invalidate() {if (self.clearThumbnailPreview) self.clearThumbnailPreview(); else {context.currentItemThumbnails = context.currentItemThumbnailsPromise = null; bubble.style.backgroundImage = ''; }},
        setItem(id) {item = {...item, Id: id}; self.currentItem = item;},
        setServer(id) {item = {...item, ServerId: id}; self.currentItem = item;},
        setVersion(id) {media = {Id: id}; context.currentMediaSource = media;},
        setSession(id) {session = id;}, setAccount(id) {account = id;}, setAddress(value) {address = value;}, setApi(value) {selectedApi = value;},
        stop() {context.onPlaybackStopped.call(player, {}, {NextMediaType: 'Video'});},
        release() {context.releaseCurrentPlayer();},
        pause() {context.VideoOsd.prototype.pause.call(self);},
        destroy() {context.VideoOsd.prototype.destroy.call(self);},
        displayState() {context.updateNowPlayingInfo(player, {NowPlayingItem: item, MediaSource: media, PlayState: {MediaSourceId: media.Id}});}};
}

test('both thumbnail requests bind to the actual playing version', async () => {
    const f = fixture(); f.render(); await flush();
    assert.equal(f.requests.length, 1); assert.equal(f.requests[0].options.MediaSourceId, 'version-A');
    f.pending[0].resolve(thumbnails()); await flush(); f.render();
    assert.equal(f.images.length, 1); assert.equal(f.images[0].options.MediaSourceId, 'version-A');
    assert.match(f.bubble.style.backgroundImage, /Images\/Thumbnail/);
});
test('thumbnail preview appears even when the video has no chapters', async () => {
    const f = fixture(); f.render(); await flush();
    f.pending[0].resolve(thumbnails()); await flush(); f.render();
    assert.equal(f.images.length, 1); assert.match(f.bubble.style.backgroundImage, /Images\/Thumbnail/);
});
test('empty result is reused without requests or an old image, and chapter text still works', async () => {
    const f = fixture(); f.context.currentDisplayChapters = [{Name: 'Chapter', StartPositionTicks: 0}];
    f.render(); await flush(); f.pending[0].resolve({Thumbnails: []}); await flush();
    assert.match(f.render(), /Chapter/); f.render(); await flush(); assert.equal(f.requests.length, 1); assert.equal(f.images.length, 0);
});
test('a failed request may be retried, while in-flight and successful metadata remain reused', async () => {
    const f = fixture(); f.render(); f.render(); await flush(); assert.equal(f.requests.length, 1);
    f.pending[0].reject(Error('fixture-network')); await flush(); f.render(); await flush(); assert.equal(f.requests.length, 2);
    f.pending[1].resolve(thumbnails()); await flush(); f.render(); f.render(); await flush(); assert.equal(f.requests.length, 2);
});
test('an unsupported scoped thumbnail interface falls back to text without an unscoped version retry', async () => {
    const f = fixture(); f.render(); await flush(); f.pending[0].reject({status: 404}); await flush();
    f.render(); await flush(); assert.equal(f.images.length, 0); assert.equal(f.requests.length, 1);
});
for (const [name, change] of [
    ['item', f => f.setItem('item-B')], ['version', f => f.setVersion('version-B')],
    ['account', f => f.setAccount('user-B')], ['server ID', f => f.setServer('server-B')],
    ['player', f => {f.self.currentPlayer = {}; }], ['server address', f => f.setAddress('https://server-b.invalid')],
    ['session', f => f.setSession('session-B')], ['ApiClient object', f => f.setApi({...f.api})]
]) {
    test('late old thumbnail response cannot overwrite the new ' + name + ' context', async () => {
        const f = fixture(); f.render(); await flush(); const old = f.requests[0];
        change(f); f.render(); await flush(); assert.equal(f.requests.length, 2);
        assert.ok(old.signal && old.signal.aborted);
        f.pending[1].resolve(thumbnails('new')); await flush();
        f.pending[0].resolve(thumbnails('old')); await flush(); f.render();
        assert.equal(f.context.currentItemThumbnails.Thumbnails[0].ImageTag, 'new');
        assert.equal(f.images.at(-1).options.tag, 'new');
    });
}
test('a late rejection cannot retire a newer pending request', async () => {
    const f = fixture(); f.render(); await flush(); f.setVersion('version-B'); f.render(); await flush();
    f.pending[0].reject(Error('old')); await flush(); f.render(); await flush(); assert.equal(f.requests.length, 2);
    f.pending[1].resolve(thumbnails('B')); await flush(); f.render(); assert.equal(f.images.at(-1).options.tag, 'B');
});
for (const action of ['stop', 'release', 'pause', 'destroy']) test(action + ' clears the image, aborts its request and rejects late results', async () => {
    const f = fixture(); f.render(); await flush(); const old = f.requests[0]; f.bubble.style.backgroundImage = 'old'; f[action]();
    assert.ok(old.signal && old.signal.aborted); assert.equal(f.bubble.style.backgroundImage, '');
    f.pending[0].resolve(thumbnails('late')); await flush(); assert.equal(f.context.currentItemThumbnails, null);
});
test('late display-item metadata cannot relabel the current preview after a fast source change', async () => {
    const f = fixture(); f.displayState(); f.setItem('item-B'); f.setVersion('version-B'); f.displayState();
    f.itemPending[1].resolve({Id: 'item-B', ServerId: 'server-A'}); await flush();
    f.itemPending[0].resolve({Id: 'item-A', ServerId: 'server-A'}); await flush();
    assert.equal(f.self.currentItem.Id, 'item-B');
});
test('a missing actual playing version does not silently choose a version from item metadata', async () => {
    const f = fixture(); f.setVersion(null); f.self.currentItem.MediaSources = [{Id: 'guess'}];
    f.render(); await flush(); assert.equal(f.requests.length, 0); assert.equal(f.images.length, 0);
});
test('maintained ApiClient keeps the legacy unsupported-server result and propagates cancellation for supported requests', async t => {
    let signal, aborts = 0, rejectFetch;
    t.after(() => rejectFetch && rejectFetch(new DOMException('fixture cleanup', 'AbortError')));
    const h = harness((_url, options) => {signal = options.signal; return new Promise((_, reject) => {rejectFetch = reject; options.signal.addEventListener('abort', () => {aborts++; reject(new DOMException('cancelled', 'AbortError'));}, {once: true});});});
    const Api = h.load('apiclient.js').default, api = new Api(storage(), () => Promise.resolve(), 'https://fixture.invalid', 'ETE', 'fixture', 'fixture', 'fixture', 1);
    api.serverInfo({Id: 'server', UserId: 'user', AccessToken: 'synthetic-only'});
    api.setSystemInfo({Version: '4.0.0.0'}); assert.equal((await api.getThumbnails('item', {MediaSourceId: 'version'})).Thumbnails.length, 0); assert.equal(h.requests.length, 0);
    api.setSystemInfo({Version: '4.9.0.0'}); const controller = new AbortController(); const pending = api.getThumbnails('item', {MediaSourceId: 'version', Width: 400}, controller.signal);
    pending.catch(() => {}); await flush(); assert.equal(h.requests.length, 1); controller.abort();
    assert.equal(signal.aborted, true); assert.equal(aborts, 1); await assert.rejects(pending, {name: 'AbortError'}); assert.equal(h.timers.size, 0);
});

// The actual selected API/transport must cancel a response body, not merely ignore its result.
test('loopback ThumbnailSet cancellation closes an in-progress HTTP response and releases timers', {timeout: 5000}, async t => {
    const http = require('node:http');
    const received = deferred(), closed = deferred();
    const server = http.createServer((req, res) => {
        assert.match(req.url, /^\/emby\/Items\/fixture-item\/ThumbnailSet\?/);
        const url = new URL(req.url, 'http://127.0.0.1');
        assert.equal(url.searchParams.get('MediaSourceId'), 'fixture-version');
        res.on('close', closed.resolve);
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.write('{"Thumbnails":[');
        received.resolve();
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {server.closeAllConnections(); return new Promise(resolve => server.close(resolve));});
    const h = harness((url, options) => fetch(url, options));
    const Api = h.load('apiclient.js').default;
    const api = new Api(storage(), () => Promise.resolve(), 'http://127.0.0.1:' + server.address().port, 'ETE', 'fixture', 'fixture', 'fixture', 1);
    api.serverInfo({Id: 'fixture-server', UserId: 'fixture-user', AccessToken: 'synthetic-only'});
    api.setSystemInfo({Version: '4.9.0.0'}); api.enableAutomaticNetworking = false;
    const controller = new AbortController();
    const pending = api.getThumbnails('fixture-item', {MediaSourceId: 'fixture-version'}, controller.signal);
    pending.catch(() => {});
    await received.promise; controller.abort();
    await assert.rejects(pending, {name: 'AbortError'});
    await closed.promise; assert.equal(h.timers.size, 0);
});
test('the first hover does not invalidate pending current-item metadata', async () => {
    const f = fixture(); f.displayState(); f.render(); await flush();
    f.itemPending[0].resolve({Id: 'item-A', ServerId: 'server-A', Name: 'fresh'}); await flush();
    assert.equal(f.self.currentItem.Name, 'fresh');
});
test('an identity change before completion clears old metadata without requiring another hover', async () => {
    const f = fixture(); f.render(); await flush(); f.setAccount('user-B');
    f.pending[0].resolve(thumbnails('stale')); await flush();
    assert.equal(f.context.currentItemThumbnails, null); assert.equal(f.bubble.style.backgroundImage, '');
});
test('periodic validation clears an already displayed image after credentials or server identity change', async () => {
    const f = fixture(); f.render(); await flush(); f.pending[0].resolve(thumbnails()); await flush(); f.render();
    f.api._identityEpoch = 1; f.context.onTimeUpdate.call(f.player, {});
    assert.equal(f.context.currentItemThumbnails, null); assert.equal(f.bubble.style.backgroundImage, '');
});

test('a normal single-source video preserves the public query and image URL contract', async () => {
    const h = harness(() => ({status: 200, headers: {get: () => 'application/json'}, json: async () => thumbnails()}));
    const Api = h.load('apiclient.js').default, api = new Api(storage(), () => Promise.resolve(), 'https://fixture.invalid', 'ETE', 'fixture', 'fixture', 'fixture', 1);
    api.serverInfo({Id: 'server', UserId: 'user', AccessToken: 'synthetic-only'}); api.setSystemInfo({Version: '4.8.0.0'});
    const result = await api.getThumbnails('one-item', {MediaSourceId: 'only-source', Width: 400});
    assert.equal(result.Thumbnails.length, 1);
    assert.equal(new URL(h.requests[0].url).searchParams.get('MediaSourceId'), 'only-source');
    const image = new URL(api.getImageUrl('one-item', {type: 'Thumbnail', tag: 'A', PositionTicks: 0, MediaSourceId: 'only-source'}));
    assert.equal(image.searchParams.get('MediaSourceId'), 'only-source');
    assert.match(image.pathname, /Items\/one-item\/Images\/Thumbnail$/);
    await api.getThumbnails('one-item'); // Existing optional-options callers remain valid.
    assert.equal(h.requests.length, 2); assert.equal(h.timers.size, 0);
});

// Combination boundary: the real adapter/renderer endpoint emits observed Seek
// events into the frozen OSD fragments; the PlaybackManager/DOM facade remains
// synthetic. Full generated PlaybackManager/Session reporting is covered by the
// separate EWT suite, not claimed by these two component checks.
async function combinedPlayer(f, t) {
    const events = harness().load('events.js').default;
    const native = require('./fixtures/ewt-player.cjs').decorate(f.player, events);
    events.on(f.player, 'timeupdate', function () { f.context.onTimeUpdate.call(f.player, {}); });
    events.on(f.player, 'stopped', function () { f.stop(); });
    let seekEvents = 0;
    events.on(f.player, 'seek', function () { seekEvents++; });
    const play = async (id = 'item-A', source = 'version-A', request = 101) => f.player.play({
        _etePlayRequestId: request, url: 'fixture-' + id + '.mkv', mediaType: 'Video', playMethod: 'DirectPlay', fullscreen: false,
        item: {Id: id, ServerId: 'server-A', MediaType: 'Video', Type: 'Movie', Path: '/fixture/media.mkv'},
        mediaSource: {Id: source, Path: '/fixture/media.mkv', MediaStreams: [], RunTimeTicks: 1000000000}, playerStartPositionTicks: 0
    });
    t.after(() => f.player.destroy());
    await play();
    return {native, play, seekEvents: () => seekEvents};
}

test('combined paused native Seek completion preserves the current-version thumbnail and explicit pause', async t => {
    const f = fixture(), c = await combinedPlayer(f, t);
    f.player.pause(); c.native.property('pause', true); c.native.property('time-pos', 3.8);
    f.render(); await flush(); f.pending[0].resolve(thumbnails('current')); await flush(); f.render();
    f.player.currentTime(0); c.native.acknowledge(); await flush();
    assert.equal(c.seekEvents(), 0, 'command acceptance is not observed completion');
    assert.equal(f.player.currentTime(), 3800);
    c.native.restart(0); await flush(); f.render();
    assert.equal(c.seekEvents(), 1); assert.equal(f.player.currentTime(), 0); assert.equal(f.player.paused(), true);
    assert.equal(f.requests.length, 1, 'a Seek within the same identity/session does not retire its ThumbnailSet');
    assert.equal(f.images.at(-1).options.MediaSourceId, 'version-A'); assert.equal(f.images.at(-1).options.tag, 'current');
});

test('combined Stop and replacement retire both pending thumbnail data and the old native Seek', async t => {
    const f = fixture(), c = await combinedPlayer(f, t);
    f.render(); await flush(); const oldRequest = f.requests[0];
    f.player.currentTime(0); const oldGeneration = c.native.generation();
    await f.player.stop(false); c.native.acknowledge(); await flush();
    assert.equal(oldRequest.signal.aborted, true); assert.equal(c.seekEvents(), 0);
    f.setItem('item-B'); f.setVersion('version-B'); f.setSession('session-B');
    await c.play('item-B', 'version-B', 102);
    // The synthetic manager must supply B's start-state runtime after the real Stop cleared A's value.
    f.context.currentRuntimeTicks = 1000000000;
    f.render(); await flush();
    f.pending[1].resolve(thumbnails('new')); await flush();
    f.pending[0].resolve(thumbnails('old')); c.native.restart(0, oldGeneration); await flush(); f.render();
    assert.equal(c.seekEvents(), 0); assert.equal(f.context.currentItemThumbnails.Thumbnails[0].ImageTag, 'new');
    assert.equal(f.images.at(-1).options.MediaSourceId, 'version-B'); assert.equal(f.images.at(-1).options.tag, 'new');
});
