'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const residue = require('../tools/patch-externalplayer-residue.cjs');
const lifecycle = require('../tools/patch-item-lifecycle.cjs');

const ROOT = path.resolve(__dirname, '..');
const ITEM_PATH = 'vendor/carnival/electronapp/www/item/item.js';
const EXPECTED_SOURCE_SHA256 = 'C8F51119365ECD2881B0A33F1F9E9DD6DA90E305572621188FB31A15FDCB4623';

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function replaceBetween(source, startToken, endToken, replacement, label) {
    const start = source.indexOf(startToken);
    const end = start < 0 ? -1 : source.indexOf(endToken, start + startToken.length);
    if (start < 0 || end < 0 || source.indexOf(startToken, start + startToken.length) >= 0 ||
        source.indexOf(endToken, end + endToken.length) >= 0) {
        throw new Error('Item lifecycle test fixture mismatch: ' + label);
    }
    return source.slice(0, start) + replacement + source.slice(end);
}

function replaceFunctionBody(source, signature, body, label) {
    const start = source.indexOf(signature);
    if (start < 0 || source.indexOf(signature, start + signature.length) >= 0) {
        throw new Error('Item lifecycle test fixture mismatch: ' + label);
    }
    const open = source.indexOf('{', start + signature.length);
    if (open < 0) throw new Error('Missing function body: ' + label);
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    let regex = false;
    let regexClass = false;
    let previous = '';
    for (let index = open; index < source.length; index++) {
        const character = source[index];
        const next = source[index + 1];
        if (lineComment) {
            if (character === '\n') lineComment = false;
            continue;
        }
        if (blockComment) {
            if (character === '*' && next === '/') { blockComment = false; index++; }
            continue;
        }
        if (quote) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = null;
            continue;
        }
        if (regex) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '[') regexClass = true;
            else if (character === ']') regexClass = false;
            else if (character === '/' && !regexClass) regex = false;
            continue;
        }
        if (character === '/' && next === '/') { lineComment = true; index++; continue; }
        if (character === '/' && next === '*') { blockComment = true; index++; continue; }
        if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
        if (character === '/' && /[=(:,!{;?&|+*%~^-]/.test(previous)) { regex = true; continue; }
        if (character === '{') depth++;
        else if (character === '}' && --depth === 0) {
            return source.slice(0, open + 1) + body + source.slice(index);
        }
        if (!/\s/.test(character)) previous = character;
    }
    throw new Error('Unclosed function body: ' + label);
}

function functionText(source, startToken, endToken) {
    const start = source.indexOf(startToken);
    const end = start < 0 ? -1 : source.indexOf(endToken, start + startToken.length);
    if (start < 0 || end < 0 || source.indexOf(startToken, start + startToken.length) >= 0) {
        throw new Error('Missing unique function text: ' + startToken);
    }
    return source.slice(start, end).trimEnd();
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return {promise, resolve, reject};
}

function makeView(events) {
    const classList = {add() {}, remove() {}, contains() { return false; }};
    return {
        classList,
        style: {},
        dispatchEvent(event) { events.push(event.type); return true; },
        querySelectorAll() { return []; }
    };
}

function makeRuntime() {
    const materialPath = path.join(ROOT, ...ITEM_PATH.split('/'));
    assert.ok(fs.existsSync(materialPath), 'fixed Carnival item.js material is present');
    const canonicalBytes = fs.readFileSync(materialPath);
    assert.equal(sha256(canonicalBytes), EXPECTED_SOURCE_SHA256,
        'item material matches its frozen source identity');
    const canonical = canonicalBytes.toString('utf8').replace(/\r\n/g, '\n');

    let transformed = lifecycle.patchItemLifecycle(residue.patchItemText(canonical));
    assert.match(transformed, /getItemWithMediaSource\(instance, apiClient, epoch, detailView\)/,
        'material transform guards the original media-source lookup');
    assert.match(transformed, /isCurrentDetail\(instance, epoch, detailView\)\) throw retiredDetail\(\);\n      var playbackMediaSourcesPromise/,
        'stale item responses stop before PlaybackManager media-source work');

    transformed = replaceFunctionBody(transformed,
        '  function onDataFetched(responses)',
        '\n    return globalThis.__recordOnDataFetched.call(this, responses);\n  ',
        'stub onDataFetched body');
    transformed = replaceFunctionBody(transformed,
        '  function getItemWithMediaSource(instance, apiClient, epoch, detailView)',
        '\n    globalThis.__mediaSourceCalls.push({instance: instance, apiClient: apiClient, epoch: epoch, view: detailView});\n' +
            '    return globalThis.__detailRequests.shift().promise;\n  ',
        'stub deferred media-source request');

    const end = '    ItemPage\n  );\n});';
    assert.equal(transformed.split(end).length - 1, 1, 'unique AMD factory return hook');
    transformed = transformed.replace(end,
        '    (globalThis.__itemLifecycleHooks = {startDataLoad: startDataLoad, ' +
        'consumeDetailReload: consumeDetailReload, isCurrentDetail: isCurrentDetail, ' +
        'ItemPage: ItemPage, BaseView: BaseView}),\n' + end);

    const rendered = [];
    const events = [];
    const focusCalls = [];
    const requests = [];
    const mediaSourceCalls = [];
    const user = {Policy: {IsAdministrator: true}};
    const apiClient = {
        getCurrentUser() { return Promise.resolve(user); },
        getCurrentUserId() { return 'synthetic-user'; },
        serverId() { return 'synthetic-server'; }
    };
    const moduleStub = new Proxy({}, {
        get(target, key) {
            if (key === 'default') return target;
            if (key === 'prototype') return {};
            return () => undefined;
        }
    });
    function BaseView() {}
    BaseView.prototype.onBeginResume = function () {};
    BaseView.prototype.onResume = function () { this.paused = false; };
    BaseView.prototype.onPause = function () { this.paused = true; };
    BaseView.prototype.destroy = function () { this.view = null; };

    const dependencies = {
        appSettings: {get() { return null; }, set() {}},
        textEncoding: {htmlEncode(value) { return String(value); }},
        backdrop: {hasBackdrop() { return false; }, setBackdrops() {}},
        loading: {hide() {}},
        globalize: {translate(value) { return value; }},
        layoutManager: {tv: false},
        focusManager: {focus(element) { focusCalls.push(element); }, isCurrentlyFocusable() { return false; }},
        connectionManager: {getApiClient() { return apiClient; }, currentApiClient() { return apiClient; }},
        events: {on() {}, off() {}},
        playbackManager: {getPlaybackMediaSources() { throw new Error('unexpected PlaybackManager call in deferred stub'); }},
        BaseView
    };

    const backdropElement = {classList: {add() {}, remove() {}}};
    const sandbox = {
        console: {log() {}},
        document: {querySelector() { return backdropElement; }},
        window: {},
        self: {},
        CustomEvent: function CustomEvent(type, init) { this.type = type; Object.assign(this, init); },
        require() {},
        __detailRequests: requests,
        __mediaSourceCalls: mediaSourceCalls,
        __recordOnDataFetched(responses) {
            rendered.push(responses[0].item.Id);
            return Promise.resolve([responses[0].item, responses[1]]);
        },
        define(_names, factory) {
            const match = /^function\s*\(([^)]*)\)/.exec(Function.prototype.toString.call(factory));
            assert.ok(match, 'original AMD factory exposes its formal argument list');
            const names = match[1].split(',').map(name => name.trim()).filter(Boolean);
            sandbox.ItemPage = factory(...names.map(name => dependencies[name] || moduleStub));
        }
    };
    vm.runInNewContext(transformed, sandbox, {filename: ITEM_PATH});
    assert.equal(typeof sandbox.ItemPage, 'function', 'patched original AMD factory evaluates');
    assert.strictEqual(sandbox.__itemLifecycleHooks.BaseView, BaseView,
        'original factory receives the configured BaseView stub');
    assert.equal(typeof sandbox.__itemLifecycleHooks.BaseView.prototype.onBeginResume, 'function',
        'test BaseView stub is passed into the original factory');
    assert.deepEqual(Object.keys(sandbox.__itemLifecycleHooks).sort(),
        ['BaseView', 'ItemPage', 'consumeDetailReload', 'isCurrentDetail', 'startDataLoad'].sort());

    function createOwner() {
        const viewEvents = [];
        const view = makeView(viewEvents);
        const owner = Object.create(sandbox.ItemPage.prototype);
        Object.assign(owner, {
            view,
            params: {id: 'synthetic-item', serverId: 'synthetic-server'},
            backgroundContainer: {classList: {add() {}, remove() {}}},
            paused: true,
            currentItem: null,
            dataPromise: null
        });
        return {owner, view, viewEvents};
    }

    return {sandbox, rendered, events, focusCalls, requests, mediaSourceCalls, createOwner, user};
}

function syntheticItem(id) {
    return {Id: id, ServerId: 'synthetic-server', Type: 'Movie'};
}

function flush() {
    return new Promise(resolve => setImmediate(resolve));
}

async function observeStaleRequest(runtime, retirement, outcome) {
    const {owner, view, viewEvents} = runtime.createOwner();
    const request = deferred();
    runtime.requests.push(request);
    owner.onBeginResume({});
    assert.equal(owner.paused, true, 'viewmanager may begin a request before resume clears paused');
    assert.equal(runtime.mediaSourceCalls.length, 1);
    runtime.sandbox.__itemLifecycleHooks.consumeDetailReload(owner, false);
    const originalPromise = owner.dataPromise;

    if (retirement === 'pause') owner.onPause();
    else if (retirement === 'destroy') owner.destroy();
    else {
        const latest = deferred();
        runtime.requests.push(latest);
        runtime.sandbox.__itemLifecycleHooks.startDataLoad(owner);
        runtime.sandbox.__itemLifecycleHooks.consumeDetailReload(owner, false);
        request.latest = latest;
    }

    if (outcome === 'success') request.resolve({item: syntheticItem('stale-item'), mediaSources: []});
    else request.reject(new Error('synthetic stale request failure'));
    await assert.rejects(originalPromise, error => error && error.name === 'AbortError');
    await flush();
    assert.deepEqual(viewEvents, [], retirement + ' ' + outcome + ' does not dispatch itemshow');
    assert.deepEqual(runtime.rendered, [], retirement + ' ' + outcome + ' does not render item data');
    assert.deepEqual(runtime.focusCalls, [], retirement + ' ' + outcome + ' does not steal focus');

    if (retirement === 'refresh') {
        const latest = request.latest;
        const latestItem = syntheticItem('latest-item');
        latest.resolve({item: latestItem, mediaSources: []});
        await owner.dataPromise;
        await flush();
        assert.deepEqual(runtime.rendered, ['latest-item'], 'only the current refresh is delivered');
        assert.deepEqual(runtime.focusCalls, [], 'normal desktop detail delivery does not focus an unrelated control');
    }
    return {owner, view};
}

async function runScenarios() {
    for (const retirement of ['pause', 'destroy', 'refresh']) {
        for (const outcome of ['success', 'failure']) {
            const runtime = makeRuntime();
            await observeStaleRequest(runtime, retirement, outcome);
        }
    }

    const runtime = makeRuntime();
    const {owner, viewEvents} = runtime.createOwner();
    const request = deferred();
    runtime.requests.push(request);
    owner.onBeginResume({});
    const promise = owner.dataPromise;
    runtime.sandbox.__itemLifecycleHooks.consumeDetailReload(owner, false);
    const item = syntheticItem('current-item');
    request.resolve({item, mediaSources: []});
    await promise;
    await flush();
    assert.deepEqual(runtime.rendered, ['current-item'], 'current request reaches the original detail delivery point');
    assert.deepEqual(viewEvents, ['itemshow'], 'current request dispatches the native itemshow event');
    assert.equal(runtime.sandbox.__itemLifecycleHooks.isCurrentDetail(owner, owner._eteDetailEpoch, owner.view), true);

    const canonical = fs.readFileSync(path.join(ROOT, ...ITEM_PATH.split('/')), 'utf8');
    const afterResidue = residue.patchItemText(canonical);
    const afterLifecycle = lifecycle.patchItemLifecycle(afterResidue);
    for (const [start, end] of [
        ['  function playCurrentItem(instance, mode) {', '  function onPlayClick(e) {'],
        ['  function renderTrackSelections(page, instance, item, user, forceReload, mediaSources) {', '  function renderVideoSelections(page, mediaSources) {'],
        ['  function renderVideoSelections(page, mediaSources) {', '  function renderAudioSelections(page, mediaSources) {'],
        ['  function renderAudioSelections(page, mediaSources) {', '  function renderSubtitleSelections(page, mediaSources) {'],
        ['  function renderSubtitleSelections(page, mediaSources) {', '  function hideAll(']
    ]) {
        let actualFunction = functionText(afterLifecycle, start, end);
        if (start.startsWith('  function renderTrackSelections(')) {
            actualFunction = actualFunction
                .replace('    var epoch = instance._eteDetailEpoch;\n', '')
                .replace('      if (!isCurrentDetail(instance, epoch, page)) return;\n', '')
                .replace('if (isCurrentDetail(instance, epoch, page)) renderTrackSelections(page, instance, item, user, forceReload);',
                    'renderTrackSelections(page, instance, item, user, forceReload);')
                .replace('    }, onPromiseFailure);', '    });');
        }
        assert.equal(actualFunction, functionText(afterResidue, start, end),
            start + ' remains byte-identical');
    }
    const playCurrent = functionText(afterLifecycle,
        '  function playCurrentItem(instance, mode) {', '  function onPlayClick(e) {');
    for (const selector of ['.selectSource', '.selectAudio', '.selectSubtitles']) {
        assert.ok(playCurrent.includes(selector), 'playCurrentItem still consumes ' + selector);
    }
    const videoSelection = functionText(afterLifecycle,
        '  function renderVideoSelections(page, mediaSources) {', '  function renderAudioSelections(page, mediaSources) {');
    assert.ok(videoSelection.includes('page.querySelector(".selectVideo")'),
        'renderVideoSelections still populates the native video selector');
    assert.ok(videoSelection.includes('v.Index === selectedId'),
        'video selector keeps the existing selected-stream value contract');
}

runScenarios().then(() => {
    process.stdout.write('Item lifecycle material self-test passed: fixed Carnival controller lifecycle and frozen playback/selection functions.\n');
}, error => {
    process.stderr.write((error && error.stack) || String(error));
    process.exitCode = 1;
});
