'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {patchVideoOsd} = require('../tools/patch-videoosd-lifecycle.cjs');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = process.env.ETE_VIDEOOSD_SOURCE ||
    path.join(ROOT, 'vendor/carnival/electronapp/www/videoosd/videoosd.js');
const SOURCE_SHA256 = '86ab60c897e827b5152435350fe7b3801d8afd6b8889eef96e9996e71bb5eeab';
const MATERIAL_PATH = 'electronapp/www/videoosd/videoosd.js';
const REGISTRATION_START = '_dom.default.addEventListener(window, "keydown", function (event)';
const NEXT_LISTENER = '_dom.default.addEventListener(\n        view,\n        "dblclick"';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function excerpt(source, start, end) {
    const first = source.indexOf(start);
    const last = source.indexOf(end, first + start.length);
    assert.ok(first >= 0 && last > first, 'locked VideoOSD excerpt anchors must exist');
    return source.slice(first, last);
}

function keyTable(source, patched = false) {
    const first = source.indexOf('var keyMap = {');
    const last = source.indexOf(patched ? 'self.clearRateKey' : 'var handleKeyDown', first);
    assert.ok(first >= 0 && last > first, 'frozen VideoOSD rate key table must exist');
    const block = source.slice(first, last);
    const context = vm.createContext({});
    const value = vm.runInContext('(function () {' + block + '\nreturn keyMap;})()', context);
    return {block, value: JSON.parse(JSON.stringify(value))};
}

function fixture(source, patched) {
    const listeners = new Map();
    const timers = new Map();
    const allTimerCallbacks = new Map();
    const rateCalls = [];
    const toastCalls = [];
    const window = {};
    let timerId = 0;
    let activePlayer = {id: 'A'};
    const self = {
        currentPlayer: activePlayer,
        paused: false,
        bottomTabs: {selectedIndex() {}},
        nowPlayingPositionSlider: {dragging: false}
    };
    const context = {
        self,
        window,
        console: {log() {}},
        onStateChanged() {},
        resetUpNextDialog() {},
        resetRatingText() {},
        showHideSkipIntro() {},
        currentRuntimeTicks: 0,
        _dom: {default: {
            addEventListener(target, type, callback) {
                assert.equal(target, window);
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(callback);
            },
            removeEventListener(target, type, callback) {
                assert.equal(target, window);
                listeners.set(type, (listeners.get(type) || []).filter(item => item !== callback));
            }
        }},
        _playbackmanager: {default: {setPlaybackRate(rate, player) {
            rateCalls.push({rate, player: player ? player.id : activePlayer.id});
        }}},
        _toast: {default(message) { toastCalls.push(message); }},
        document: {querySelector() { return null; }},
        setTimeout(callback, delay) {
            const id = ++timerId;
            timers.set(id, {callback, delay});
            allTimerCallbacks.set(id, callback);
            return id;
        },
        clearTimeout(id) { timers.delete(id);}
    };
    vm.createContext(context);

    const registration = patched ?
        excerpt(source, '(function () {\n        var keyMap = {', NEXT_LISTENER).replace(/,\s*$/, '') :
        excerpt(source, REGISTRATION_START, NEXT_LISTENER).trim().replace(/,$/, ';');
    vm.runInContext(registration, context, {filename: 'videoosd.js#rate-key-registration'});
    vm.runInContext(excerpt(source, '    function onPlaybackStart(e, state) {', '    function onRepeatModeChange') +
        excerpt(source, '    function onPlaybackStopped(e, state) {', '    function onMediaStreamsChanged'), context,
        {filename: 'videoosd.js#original-playback-lifecycle-handlers'});
    if (patched) self.bindRateKeys();

    return {
        self,
        listeners,
        timers,
        allTimerCallbacks,
        rateCalls,
        toastCalls,
        activePlayer,
        mediaEvent(name, player = activePlayer) {context[name].call(player, {type: name}, {NextMediaType: 'Video'});},
        key(type, key, repeat = false) {
            for (const callback of (listeners.get(type) || []).slice()) callback({key, repeat});
        },
        fireTimers() {
            const current = [...timers.values()];
            timers.clear();
            for (const timer of current) timer.callback();
        },
        changePlayer(id) {
            activePlayer = {id};
            self.currentPlayer = activePlayer;
        },
        resume() { if (patched) self.bindRateKeys(); },
        pause() { if (patched) self.releaseRateKeys(); },
        releasePlayer() { if (patched) self.clearRateKey(); },
        destroy() {
            if (patched) {
                self._eteRateKeysDestroyed = true;
                self.releaseRateKeys();
            }
        },
        release() {
            if (patched) self.releaseRateKeys();
            else {
                for (const [type, callbacks] of listeners) {
                    for (const callback of callbacks.slice()) {
                        context._dom.default.removeEventListener(window, type, callback);
                    }
                }
            }
        }
    };
}

if (!fs.existsSync(SOURCE_PATH) || !fs.statSync(SOURCE_PATH).isFile()) {
    throw new Error('Required pinned VideoOSD source is missing: ' + SOURCE_PATH +
        ' (set ETE_VIDEOOSD_SOURCE to the source file)');
}

const sourceBytes = fs.readFileSync(SOURCE_PATH);
assert.equal(sha256(sourceBytes), SOURCE_SHA256, 'pinned VideoOSD source hash changed');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor/runtime-manifest.json'), 'utf8'));
const manifestEntry = manifest.files.find(item => item.path === MATERIAL_PATH);
assert.ok(manifestEntry, 'runtime manifest must include VideoOSD');
assert.equal(manifestEntry.sha256.toLowerCase(), SOURCE_SHA256);

const source = sourceBytes.toString('utf8').replace(/\r\n/g, '\n');
const transformed = patchVideoOsd(source);
const originalTable = keyTable(source);
const patchedTable = keyTable(transformed, true);
assert.equal(patchedTable.block.trim(), originalTable.block.trim(),
    'the frozen rate key table must remain byte-identical');
assert.equal(transformed.includes(REGISTRATION_START), false, 'the anonymous registration must be replaced');
assert.equal((transformed.match(/this\.bindRateKeys\(\);/g) || []).length, 1,
    'resume must bind the rate-key owner');
assert.equal((transformed.match(/this\.releaseRateKeys\(\);/g) || []).length, 2,
    'pause and destroy must retire the rate-key owner');
assert.ok(transformed.includes('if (self.clearRateKey) self.clearRateKey();'),
    'current-player release must clear the pending rate timer');
assert.ok(transformed.includes('(VideoOsd.prototype.resume = function (options) {\n      this.paused = !1;\n      this.bindRateKeys();'));
assert.ok(transformed.includes('(VideoOsd.prototype.pause = function () {\n      this.paused = !0;\n      this.releaseRateKeys();'));
assert.ok(transformed.includes('(VideoOsd.prototype.destroy = function () {\n      this._eteRateKeysDestroyed = true;\n      this.releaseRateKeys();'));

const baseline = process.env.ETE_VIDEOOSD_UNPATCHED === '1';
const executionSource = baseline ? source : transformed;
const expectedRates = Object.values(originalTable.value);

for (const [key, setting] of Object.entries(originalTable.value)) {
    const run = fixture(executionSource, !baseline);
    run.key('keydown', key);
    assert.equal([...run.timers.values()][0].delay, 500, 'long-hold threshold stays at 500ms');
    run.fireTimers();
    assert.deepEqual(run.rateCalls, [{rate: setting.rate, player: 'A'}], 'mapped key preserves rate and player');
}

const shortHold = fixture(executionSource, !baseline);
shortHold.key('keydown', Object.keys(originalTable.value)[0]);
shortHold.key('keyup', Object.keys(originalTable.value)[0]);
shortHold.fireTimers();
assert.deepEqual(shortHold.rateCalls, [], 'short holds do not change playback rate');

const unmappedThenMapped = fixture(executionSource, !baseline);
unmappedThenMapped.key('keydown', 'Escape');
unmappedThenMapped.key('keyup', 'Escape');
unmappedThenMapped.key('keydown', Object.keys(originalTable.value)[0]);
unmappedThenMapped.fireTimers();
assert.equal(unmappedThenMapped.rateCalls.length, 1, 'unmapped keys do not block a later mapped hold');

const unrelatedKeyup = fixture(executionSource, !baseline);
const heldKey = Object.keys(originalTable.value)[0];
unrelatedKeyup.key('keydown', heldKey);
unrelatedKeyup.key('keyup', 'ArrowLeft');
assert.equal(unrelatedKeyup.timers.size, 1, 'unrelated keyup leaves the held key timer active');
unrelatedKeyup.fireTimers();
assert.equal(unrelatedKeyup.rateCalls.length, 1);

const repeated = fixture(executionSource, !baseline);
repeated.key('keydown', heldKey);
repeated.key('keydown', heldKey, true);
assert.equal(repeated.timers.size, 1, 'auto-repeat does not create another hold');

const cycles = fixture(executionSource, !baseline);
cycles.resume();
cycles.resume();
for (let i = 0; i < 8; i++) {
    cycles.key('keydown', heldKey);
    cycles.key('keyup', heldKey);
}
assert.equal((cycles.listeners.get('keydown') || []).length, 1);
assert.equal((cycles.listeners.get('keyup') || []).length, 1, 'key-up listener does not accumulate');

const lifecycleResults = {};
for (const event of ['onPlaybackStart', 'onPlaybackStopped']) {
    const samePlayer = fixture(executionSource, !baseline);
    samePlayer.key('keydown', heldKey);
    const late = [...samePlayer.allTimerCallbacks.values()][0];
    samePlayer.mediaEvent(event);
    late();
    assert.equal(samePlayer.self._eteRateKey, null, event + ' retires a hold across media changes on the same Player');
    assert.deepEqual(samePlayer.rateCalls, [], event + ' prevents the old media hold from targeting the next media');
}
for (const action of ['pause', 'releasePlayer', 'destroy']) {
    const lifecycle = fixture(executionSource, !baseline);
    lifecycle.resume();
    lifecycle.key('keydown', heldKey);
    const lateCallback = [...lifecycle.allTimerCallbacks.values()][0];
    lifecycle[action]();
    lifecycle.changePlayer('B');
    lateCallback();
    assert.equal(lifecycle.timers.size, 0, action + ' cancels the timer');
    assert.deepEqual(lifecycle.rateCalls, [], action + ' prevents a late change to player B');
    if (action !== 'releasePlayer') {
        assert.equal((lifecycle.listeners.get('keydown') || []).length, 0, action + ' removes keydown');
        assert.equal((lifecycle.listeners.get('keyup') || []).length, 0, action + ' removes keyup');
    }
    lifecycleResults[action] = {lateRateCalls: lifecycle.rateCalls,
        keydownListeners: (lifecycle.listeners.get('keydown') || []).length,
        keyupListeners: (lifecycle.listeners.get('keyup') || []).length};
}

const evidenceDir = path.join(ROOT, '.work/v037');
fs.mkdirSync(evidenceDir, {recursive: true});
fs.writeFileSync(path.join(evidenceDir, 'osd-material-results.json'), JSON.stringify({
    sourceSha256: sha256(sourceBytes),
    outputSha256: sha256(Buffer.from(transformed)),
    evidenceLayer: 'pinned VideoOSD keyboard excerpt in a synthetic DOM/event/timer/player fixture',
    execution: baseline ? 'UNPATCHED_REPAIR_REGRESSION' : 'PATCHED_CONTRACT_PASS',
    mappedRateCount: expectedRates.length,
    shortHoldRateCalls: shortHold.rateCalls.length,
    unrelatedKeyupRateCalls: unrelatedKeyup.rateCalls.length,
    listenerCountsAfterCycles: {keydown: (cycles.listeners.get('keydown') || []).length,
        keyup: (cycles.listeners.get('keyup') || []).length},
    cleanupResults: lifecycleResults,
    fullApplicationOrDevice: 'NOT_VERIFIED'
}, null, 2) + '\n');

process.stdout.write('Pinned VideoOSD lifecycle material self-test passed (' +
    (baseline ? 'unpatched baseline unexpectedly passed' : 'patched excerpt fixture') + ').\n');
