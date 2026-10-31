'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {patchVideoOsd} = require('../tools/patch-videoosd-lifecycle.cjs');

const source = patchVideoOsd(fs.readFileSync(path.join(__dirname, '../vendor/web-snapshot/www/videoosd/videoosd.js'), 'utf8'));
new vm.Script(source);
function span(start, end) {
    const first = source.indexOf(start), last = source.indexOf(end, first + start.length);
    assert(first >= 0 && last > first, 'production source anchors');
    return source.slice(first, last);
}
const flush = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};
function deferred() {
    let resolve, reject;
    const promise = new Promise((a, b) => {resolve = a; reject = b;});
    return {promise, resolve, reject};
}
const ticks = seconds => seconds * 1e7;
const markers = (end = 60, start = 0) => [
    {MarkerType: 'IntroStart', StartPositionTicks: ticks(start)},
    {MarkerType: 'IntroEnd', StartPositionTicks: ticks(end)}
];

function fixture() {
    const pending = [], seeks = [], reports = [], listeners = new Map();
    let item = {Id: 'private-item-A', ServerId: 'private-server', MediaType: 'Video'};
    let media = {Id: 'private-source-A', RunTimeTicks: ticks(600)}, session = 'private-session-A', nativeDuration = ticks(600);
    const player = {getIntroSkipDurationTicks: () => nativeDuration, reportIntroSkipDiagnostic: details => reports.push(details)};
    const classes = {add() {}, remove() {}, contains() {return false;}};
    const button = {classList: classes, click() {return listeners.get('intro')();}};
    const slider = {value: '25', getBubbleElement() {return null;}};
    const api = {getCurrentUserId: () => 'private-user', serverAddress: () => 'https://private-server.invalid',
        getItem() {const work = deferred(); pending.push(work); return work.promise;},
        getCurrentUser: () => Promise.resolve({Configuration: {IntroSkipMode: 'None'}})};
    const self = {currentItem: item, currentPlayer: player, paused: false, currentVisibleMenu: null,
        nowPlayingPositionSlider: slider, bottomTabs: {selectedIndex() {}}, hideOsd() {self.hideCount = (self.hideCount || 0) + 1;}};
    const manager = {currentItem: () => item, currentMediaSource: () => media, playSessionId: () => session,
        duration: () => media.RunTimeTicks, currentTime: () => 0, audioTracks: () => [], subtitleTracks: () => [],
        seek(target, owner, details) {seeks.push({target, owner, details});},
        seekPercent(target, owner, details) {seeks.push({percent: target, owner, details});}};
    const context = {self, player, Promise, AbortController, Number, console: {log() {}},
        currentIntroInfo: null, currentDisplayItem: null, currentDisplayChapters: null,
        currentItemThumbnails: null, currentItemThumbnailsPromise: null, currentRuntimeTicks: ticks(600),
        currentMediaSource: media, enableProgressByTimeOfDay: false, skipIntroValidated: true,
        enableSkipIntro: true, enableAutoSkipIntro: false, btnSkipIntro: button,
        nowPlayingVolumeSlider: {}, btnFastForward: {classList: classes}, btnRewind: {classList: classes},
        btnAudio: {classList: classes}, btnSubtitles: {classList: classes},
        _connectionmanager: {default: {getApiClient: () => api}}, _playbackmanager: {default: manager},
        _focusmanager: {default: {focus() {}}}, _appsettings: {default: {introSkipDisplayCount() {return 0;}}},
        _itemhelper: {default: {canDownloadSubtitles: () => false}},
        _dom: {default: {addEventListener(target, type, handler) {assert.equal(type, 'click'); listeners.set('intro', handler);}}},
        view: {querySelector: () => button}, document: {}, supportsSubtitleDownloading: () => false,
        resetUpNextDialog() {}, resetRatingText() {}, destroyStats() {}, destroySubtitleOffsetOverlay() {},
        _events: {default: {off() {}, on() {}}}, setTimeout() {return 1;}, focusMainOsdControls() {}};
    for (const name of ['onVolumeChanged', 'onPlayPauseStateChanged', 'onTimeUpdate', 'updateFullscreenIcon', 'onMediaStreamsChanged',
        'onRepeatModeChange', 'onSubtitleTrackChange', 'onPlaylistItemAdd', 'onPlaylistItemMove', 'onPlaylistItemRemove']) context[name] = () => {};
    vm.createContext(context);
    vm.runInContext(span('    var currentIntroOwner = null,', '    function onStop()') +
        span('    function showHideSkipIntro(show) {', '    function validateSkipIntroFeature(') +
        span('    function updateNowPlayingInfo(player, state) {', '    function setPoster(') +
        span('    function onSkipIntroClickInternal(', '    var my_touches_type') +
        span('    function onPlaybackStart(e, state) {', '    function onRepeatModeChange(') +
        span('    function onPlaybackStopped(e, state) {', '    function onMediaStreamsChanged(') +
        span('    function releaseCurrentPlayer() {', '    function resetRatingText() {'), context);
    // Execute the actual marker parser; unrelated title/poster rendering is outside this fixture.
    vm.runInContext('function updateDisplayItem(info) { self.currentItem = info.originalItem; var itemInfo = info.displayItem || info.originalItem;\n' +
        span('      for (\n        var introStart,', '    function getDisplayTimeWithoutAmPm('), context);
    vm.runInContext(span('      _dom.default.addEventListener(\n        view.querySelector(".btnSkipIntro"),',
        '      _dom.default.addEventListener(view.querySelector(".btnPlayQueue")').trim().replace(/,$/, ';'), context);
    const display = () => context.updateNowPlayingInfo(player, {NowPlayingItem: item, MediaSource: media});
    context.onStateChanged = display;
    manager.getPlayerState = () => ({NowPlayingItem: item, MediaSource: media});
    vm.runInContext(span('      (self.bindToPlayer = function (player, forceStateChange) {', '    var stepSeconds = 10;'), context);
    assert(source.includes('this.bindToPlayer(_playbackmanager.default.getCurrentPlayer(), !0)'), 'resume force-refreshes the real binding');
    return {context, self, player, manager, button, slider, pending, seeks, reports, display,
        setItem(id = 'private-item-B') {item = {...item, Id: id}; media = {...media, Id: 'private-source-B'}; session = 'private-session-B';},
        setNativeDuration(value) {nativeDuration = value;},
        setMediaDuration(value) {media.RunTimeTicks = value;},
        async fill(index = pending.length - 1, chapters = markers()) {pending[index].resolve({...item, Chapters: chapters}); await flush();},
        click: () => button.click(),
        tick() {vm.runInContext(span('        (function (currentTime) {', '        (function (player) {').trim().replace(/,$/, ';'), context);},
        stop() {context.onPlaybackStopped.call(player, {type: 'playbackstop'}, {NextMediaType: 'Video'});},
        start() {context.onPlaybackStart.call(player, {type: 'playbackstart'}, {NowPlayingItem: item, MediaSource: media});},
        release() {context.releaseCurrentPlayer();},
        resume() {self.paused = false; self.bindToPlayer(player, true);},
        sliderChange() {
            context._dom.default.addEventListener = (target, type, handler) => {assert.equal(target, slider); assert.equal(type, 'change'); listeners.set('slider', handler);};
            vm.runInContext(span('      _dom.default.addEventListener(\n        self.nowPlayingPositionSlider,',
                '      (self.nowPlayingPositionSlider.getBubbleHtml = function (value) {').trim().replace(/,$/, ';'), context);
            listeners.get('slider').call(slider);
        }
    };
}

test('normal intro preserves target and reports only bounded context without private identities', async () => {
    const f = fixture(); f.display(); await f.fill(); f.click();
    assert.equal(f.seeks.length, 1); assert.equal(f.seeks[0].target, ticks(60)); assert.equal(f.seeks[0].owner, f.player);
    assert.deepEqual(JSON.parse(JSON.stringify(f.seeks[0].details)), {
        introStartTicks: 0, introEndTicks: ticks(60), introOwnerMatches: true, introClickOwnerMatches: true,
        introEndSource: 'explicit', introDurationTicks: ticks(600), introDurationSource: 'native-current',
        disposition: 'requested', origin: 'intro-button'
    });
    assert.doesNotMatch(JSON.stringify(f.seeks[0].details), /private|https|user|source-A|session-A/);
    assert.equal(f.self.hideCount, 1); assert.equal(f.reports.length, 0);
});

test('replacement retires intro before metadata waits and failure cannot restore it', async () => {
    const f = fixture(); f.display(); await f.fill(); f.setItem(); f.display();
    assert.equal(f.context.currentIntroInfo, null); f.click(); assert.equal(f.seeks.length, 0);
    f.pending[1].reject(Error('private-failure')); await flush(); f.click();
    assert.equal(f.seeks.length, 0); assert.equal(f.reports.at(-1).disposition, 'unavailable');
});

test('late A metadata remains rejected, while current B metadata restores a B intro', async () => {
    const f = fixture(); f.display(); f.setItem(); f.display();
    await f.fill(1, markers(30)); await f.fill(0, markers(500)); f.click();
    assert.equal(f.seeks.length, 1); assert.equal(f.seeks[0].target, ticks(30));
});

test('stop/start and release/resume retire and re-fetch valid intro metadata', async () => {
    const f = fixture(); f.display(); await f.fill(); f.stop(); assert.equal(f.context.currentIntroInfo, null);
    f.start(); assert.equal(f.pending.length, 2); await f.fill(); f.click(); assert.equal(f.seeks.length, 1);
    f.release(); assert.equal(f.context.currentIntroInfo, null); assert.equal(f.self.currentPlayer, null);
    f.resume(); await f.fill(); f.click(); assert.equal(f.seeks.length, 2);
});

test('thumbnail hover retirement alone does not retire a valid intro record', async () => {
    const f = fixture(); f.display(); await f.fill(); f.self.clearThumbnailPreview(); f.click();
    assert.equal(f.seeks.length, 1); assert.equal(f.seeks[0].details.introOwnerMatches, true);
});

test('delayed feature validation cannot apply an A click to B even after B metadata arrives', async () => {
    const f = fixture(), validation = deferred(); f.display(); await f.fill();
    f.context.skipIntroValidated = false; f.context.validateSkipIntroFeature = () => validation.promise;
    const completion = f.click(); f.setItem(); f.display(); await f.fill(1, markers(30));
    validation.resolve(); await completion;
    assert.equal(f.seeks.length, 0); assert.equal(f.reports.at(-1).disposition, 'rejected-owner');
    assert.equal(f.reports.at(-1).introClickOwnerMatches, false); assert.equal(f.reports.at(-1).introOwnerMatches, true);
});

test('retired validation cannot seek a resumed context even when item/source/session values are identical', async () => {
    const f = fixture(), validation = deferred(); f.display(); await f.fill();
    f.context.skipIntroValidated = false; f.context.validateSkipIntroFeature = () => validation.promise;
    const completion = f.click(); f.release(); f.resume(); await f.fill();
    validation.resolve(); await completion;
    assert.equal(f.seeks.length, 0); assert.equal(f.reports.at(-1).disposition, 'rejected-owner');
    assert.equal(f.reports.at(-1).introClickOwnerMatches, false);
});

test('same-owner delayed validation and auto-click preserve valid seeks with distinct origins', async () => {
    const f = fixture(), validation = deferred(); f.display(); await f.fill();
    f.context.skipIntroValidated = false; f.context.validateSkipIntroFeature = () => validation.promise;
    f.context.enableSkipIntro = true; f.context.enableAutoSkipIntro = true; f.tick();
    assert.equal(f.seeks.length, 0); validation.resolve(); await flush();
    assert.equal(f.seeks.length, 1); assert.equal(f.seeks[0].details.origin, 'intro-auto');
    f.context.skipIntroValidated = true; f.click(); assert.equal(f.seeks[1].details.origin, 'intro-button');
});

for (const [name, chapters] of [
    ['end equal to duration', markers(600)], ['end beyond duration', markers(601)],
    ['negative start', markers(60, -1)], ['end before start', markers(30, 40)],
    ['nonfinite end', [{MarkerType: 'IntroStart', StartPositionTicks: 0}, {MarkerType: 'IntroEnd', StartPositionTicks: Infinity}]],
    ['string target', [{MarkerType: 'IntroStart', StartPositionTicks: 0}, {MarkerType: 'IntroEnd', StartPositionTicks: 'private-secret'}]]
]) test('intro rejects ' + name + ' without clamping or sending Seek', async () => {
    const f = fixture(); f.display(); await f.fill(0, chapters); f.click();
    assert.equal(f.seeks.length, 0); assert.equal(f.reports.at(-1).disposition, 'rejected-target');
    assert.doesNotMatch(JSON.stringify(f.reports), /private-secret/);
});

test('next-chapter fallback stays supported and receives the same bounds check', async () => {
    const f = fixture(); f.display(); await f.fill(0, [markers()[0], {MarkerType: 'Chapter', StartPositionTicks: ticks(30)}]);
    f.click(); assert.equal(f.seeks[0].target, ticks(30)); assert.equal(f.seeks[0].details.introEndSource, 'next-chapter');
    f.display(); await f.fill(1, [markers()[0], {MarkerType: 'Chapter', StartPositionTicks: ticks(600)}]); f.click();
    assert.equal(f.seeks.length, 1); assert.equal(f.reports.at(-1).disposition, 'rejected-target');
});

test('unknown current native duration does not fall back to metadata, then auto-skip can resume after observation', async () => {
    const f = fixture(); f.display(); await f.fill(); f.setNativeDuration(null); f.click();
    assert.equal(f.seeks.length, 0); assert.equal(f.reports.at(-1).disposition, 'duration-unavailable');
    f.context.enableSkipIntro = f.context.enableAutoSkipIntro = true; f.tick();
    assert.equal(f.button._visible, undefined); assert.equal(f.reports.length, 1, 'no periodic rejection logging');
    f.setNativeDuration(ticks(600)); f.tick();
    assert.equal(f.seeks.length, 1); assert.equal(f.seeks[0].details.origin, 'intro-auto');
});

test('other players use current MediaSource or manager duration with explicit source', async () => {
    const f = fixture(); delete f.player.getIntroSkipDurationTicks; f.display(); await f.fill(); f.click();
    assert.equal(f.seeks[0].details.introDurationSource, 'media-source');
    f.setMediaDuration(null); f.manager.duration = () => ticks(600); f.click();
    assert.equal(f.seeks[1].details.introDurationSource, 'manager-fallback');
});

test('rejection reporting exceptions and rejected promises cannot submit or throw through playback', async () => {
    const f = fixture(); f.display(); await f.fill(0, markers(601));
    f.player.reportIntroSkipDiagnostic = () => {throw Error('private');}; assert.doesNotThrow(f.click);
    f.player.reportIntroSkipDiagnostic = () => Promise.reject(Error('private')); f.click(); await flush();
    assert.equal(f.seeks.length, 0);
});

test('ordinary and live sliders preserve original targets and only add numeric origin context', () => {
    const f = fixture(); f.sliderChange();
    assert.equal(f.seeks[0].percent, 25);
    assert.deepEqual(JSON.parse(JSON.stringify(f.seeks[0].details)), {origin: 'position-slider', percent: 25});
    f.context.enableProgressByTimeOfDay = true; f.context.programStartDateMs = 1000; f.context.programEndDateMs = 11000;
    f.context.playbackStartTimeTicks = 10000; f.sliderChange();
    assert.equal(f.seeks[1].target, 34990000);
    assert.deepEqual(JSON.parse(JSON.stringify(f.seeks[1].details)), {origin: 'position-slider', percent: 25});
});
