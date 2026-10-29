'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const settings = require('../src/electronapp/plugins/mpvplayer/preload-settings.js');
const GET = 'enhanced-playback-range-settings-get', SAVE = 'enhanced-playback-range-settings-save';
const html = fs.readFileSync(path.join(__dirname, '../src/electronapp/plugins/mpvplayer/video.html'), 'utf8');
const config = overrides => ({schema: 1, enabled: false, progressPercent: 70, preloadMB: 300, ...overrides});
function deferred() {let resolve, reject; const promise = new Promise((a, b) => {resolve = a; reject = b;}); return {promise, resolve, reject};}
function fixture(invoke) {
    const nodes = Object.fromEntries(['.chkRangeEnabled', '.selectRangeProgress', '.selectRangePreload', '.rangeSettingsState'].map(key => [key, {
        value: '', checked: false, disabled: false, textContent: '', listeners: {},
        addEventListener(name, callback) {this.listeners[name] = callback;},
        removeEventListener(name, callback) {if (this.listeners[name] === callback) delete this.listeners[name];}
    }]));
    const view = {querySelector(selector) {assert.ok(nodes[selector], selector); return nodes[selector];}};
    const page = settings.create(view, invoke);
    return {page, nodes, enabled: nodes['.chkRangeEnabled'], progress: nodes['.selectRangeProgress'], amount: nodes['.selectRangePreload'], state: nodes['.rangeSettingsState']};
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('preload appears once under the original video Advanced section with confirmed defaults and no runtime display or save button', () => {
    assert.equal((html.match(/<form\b/g) || []).length, 1);
    assert.equal((html.match(/<\/form>/g) || []).length, 1);
    const advanced = html.indexOf('<h1>${Advanced}</h1>'), preload = html.indexOf('<div class="checkboxContainer checkboxContainer-withDescription">');
    assert(advanced >= 0 && advanced < preload, 'preload follows the existing Advanced heading');
    assert.equal((html.match(/<h1>\$\{Advanced\}<\/h1>/g) || []).length, 1);
    assert.doesNotMatch(html, /<h[1-6]>播放暂存与预载<\/h[1-6]>/);
    for (const name of ['chkRangeEnabled', 'selectRangeProgress', 'selectRangePreload']) {
        const marker = 'class="' + name + '"';
        assert.equal(html.split(marker).length - 1, 1, name + ' is not duplicated');
        assert(preload < html.indexOf(marker) && html.indexOf(marker) < html.indexOf('</form>'), name + ' remains in the original Advanced form');
    }
    assert.match(html, /启用播放暂存与下一集预载/); assert.doesNotMatch(html, /下次播放生效/);
    assert.match(html, /来源支持时保留最近播放的视频暂存/);
    assert.match(html, /只限制下一集预载量/); assert.match(html, /未播放的预载在退出时清除/);
    assert.doesNotMatch(html, /rangeRuntimeState|当前运行|btnSaveRange|type="submit"|maxBytes|bytesPerSecond/);
    const choices = name => html.match(new RegExp('class="' + name + '"[^>]*>([\\s\\S]*?)<\\/select>'))[1];
    assert.deepEqual([...choices('selectRangeProgress').matchAll(/value="(\d+)"/g)].map(m => Number(m[1])), [50, 60, 70, 80, 90]);
    assert.deepEqual([...choices('selectRangePreload').matchAll(/value="(\d+)"/g)].map(m => Number(m[1])), [100, 300, 500]);
    assert.match(choices('selectRangeProgress'), /value="70" selected/); assert.match(choices('selectRangePreload'), /value="300" selected/);
    assert.doesNotMatch(html, /class="chkRangeEnabled"[^>]*checked/);
});

test('GET unlocks only confirmed preload values and opening or leaving untouched settings never saves', async () => {
    const calls = [], f = fixture(async (channel, value) => {calls.push([channel, value]); return {status: 'ok', config: config()};});
    assert.equal(f.enabled.disabled, true); await f.page.resume();
    assert.equal(f.enabled.disabled, false); assert.equal(f.enabled.checked, false);
    assert.equal(f.progress.value, '70'); assert.equal(f.amount.value, '300');
    await f.page.pause(); assert.deepEqual(calls, [[GET, undefined]]);
});

test('each change autosaves an immutable snapshot for next play without disabling editable controls', async () => {
    const writes = [], first = deferred();
    const f = fixture(async (channel, value) => {if (channel === GET) return {status: 'ok', config: config()}; writes.push(value); return writes.length === 1 ? first.promise : {status: 'saved'};});
    await f.page.resume(); f.enabled.checked = true; const one = f.enabled.listeners.change();
    await turn(); assert.equal(writes.length, 1); assert.equal(f.enabled.disabled, false);
    f.progress.value = '80'; f.amount.value = '500'; const two = f.progress.listeners.change();
    await turn(); assert.equal(writes.length, 1, 'second save waits for the first');
    first.resolve({status: 'saved'}); await Promise.all([one, two]);
    assert.deepEqual(writes, [config({enabled: true}), config({enabled: true, progressPercent: 80, preloadMB: 500})]);
    assert.equal(f.state.textContent, '');
});

for (const result of [null, {status: 'ok', config: config({progressPercent: 55})}]) test('failed or malformed GET keeps controls locked and pause cannot write defaults: ' + JSON.stringify(result), async () => {
    const calls = [], f = fixture(async channel => {calls.push(channel); return result;});
    await f.page.resume(); f.enabled.checked = true; await f.enabled.listeners.change(); await f.page.pause();
    assert.deepEqual(calls, [GET]); assert.equal(f.enabled.disabled, true); assert.match(f.state.textContent, /无法读取/);
});

test('failed autosave preserves the draft, reports fixed feedback and later changes still save', async () => {
    let count = 0; const f = fixture(async channel => {
        if (channel === GET) return {status: 'ok', config: config()};
        if (++count === 1) throw Error('secret transport details'); return {status: 'saved'};
    });
    await f.page.resume(); f.enabled.checked = true; await f.enabled.listeners.change();
    assert.equal(f.enabled.checked, true); assert.equal(f.enabled.disabled, false); assert.match(f.state.textContent, /保存失败/); assert.doesNotMatch(f.state.textContent, /secret/);
    f.progress.value = '90'; await f.progress.listeners.change(); assert.equal(count, 2); assert.equal(f.state.textContent, '');
});

test('saved settings with a failed runtime application keep visible fixed error feedback',async()=>{
    const f=fixture(async channel=>channel===GET?{status:'ok',config:config()}:{status:'saved',applyError:'runtime-unavailable'});
    await f.page.resume();f.enabled.checked=true;await f.enabled.listeners.change();
    assert.equal(f.enabled.checked,true);assert.equal(f.state.textContent,'设置已保存，暂存暂不可用。');
});

test('pause captures the final edited values before retiring the page, without waiting for async completion', async () => {
    const save = deferred(), writes = []; const f = fixture(async (channel, value) => {
        if (channel === GET) return {status: 'ok', config: config()}; writes.push(value); return save.promise;
    });
    await f.page.resume(); f.enabled.checked = true; f.amount.value = '100'; const pending = f.page.pause();
    await turn(); assert.deepEqual(writes, [config({enabled: true, preloadMB: 100})]); assert.equal(f.enabled.disabled, true);
    const text = f.state.textContent; save.resolve({status: 'saved'}); await pending; assert.equal(f.state.textContent, text);
});

test('resumed GET waits for queued writes, and stale save feedback cannot replace the resumed page state', async () => {
    const save = deferred(), calls = []; let read = 0;
    const f = fixture(async (channel, value) => {
        calls.push(channel);
        if (channel === GET) return {status: 'ok', config: config(++read === 1 ? {} : {enabled: true})};
        return save.promise;
    });
    await f.page.resume(); f.enabled.checked = true; f.enabled.listeners.change(); f.page.pause(); const resumed = f.page.resume();
    await turn(); assert.deepEqual(calls, [GET, SAVE]); assert.equal(f.enabled.disabled, true);
    save.resolve({status: 'saved'}); await resumed;
    assert.deepEqual(calls, [GET, SAVE, GET]); assert.equal(f.enabled.checked, true); assert.equal(f.state.textContent, '');
});

test('a late read from the paused epoch cannot fill the resumed view', async () => {
    const old = deferred(), fresh = deferred(); let reads = 0;
    const f = fixture(() => ++reads === 1 ? old.promise : fresh.promise);
    const first = f.page.resume(); await turn(); f.page.pause(); const second = f.page.resume(); await turn();
    fresh.resolve({status: 'ok', config: config({enabled: true, progressPercent: 90, preloadMB: 100})}); await second;
    old.resolve({status: 'ok', config: config()}); await first;
    assert.equal(f.enabled.checked, true); assert.equal(f.progress.value, '90'); assert.equal(f.amount.value, '100');
});

test('destroy retires pending reads and removes change listeners', async () => {
    const read = deferred(), f = fixture(() => read.promise); const pending = f.page.resume(); await turn(); f.page.dispose();
    read.resolve({status: 'ok', config: config({enabled: true})}); await pending;
    assert.equal(f.enabled.checked, false); assert.equal(f.enabled.disabled, true); assert.equal(f.enabled.listeners.change, undefined);
});
