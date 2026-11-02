'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const patch = require('../tools/patch-subtitle-language-preference.cjs');

const root = path.resolve(__dirname, '..');
const source = patch.patchScript(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/settings/subtitles.js'), 'utf8'));
const template = patch.patchHtml(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/settings/subtitles.html'), 'utf8'));

function harness(preference) {
    const controls = new Map();
    function control(selector) {
        if (!controls.has(selector)) {
            const events = new Map();
            controls.set(selector, {
                value: '', checked: false,
                classList: {add() {}, remove() {}},
                addEventListener(type, callback) { events.set(type, callback); },
                dispatchEvent(event) {
                    if (!event.target) event.target = this;
                    if (events.has(event.type)) events.get(event.type).call(this, event);
                },
                closest() { return container; }
            });
        }
        return controls.get(selector);
    }
    const container = {
        classList: {add() {}},
        querySelector: control,
        querySelectorAll() { return []; }
    };
    const select = control('.selectSubtitleLanguage');
    select._values = [];
    select.getValues = function () { return this._values; };
    Object.defineProperty(select, 'values', {
        get() { return this._values; },
        set(value) { this._values = Array.from(value); }
    });
    select.choose = function (values) {
        this.values = values;
        this.dispatchEvent({type: 'change', target: this});
    };
    const user = {Id: 'user', Configuration: {
        SubtitleLanguagePreference: preference, SubtitleMode: 'Smart', RememberSubtitleSelections: true
    }};
    const cultures = [
        {DisplayName: 'Chinese Simplified', TwoLetterISOLanguageName: 'zh-CN'},
        {DisplayName: 'Chinese', TwoLetterISOLanguageName: 'zh'},
        {DisplayName: 'English', TwoLetterISOLanguageName: 'en'},
        {DisplayName: 'Japanese', TwoLetterISOLanguageName: 'ja'}
    ];
    const writes = [];
    const cleared = [];
    const apiClient = {
        serverId() { return 'server'; }, getCurrentUserId() { return 'user'; },
        getUser() { return Promise.resolve(user); }, getCultures() { return Promise.resolve(cultures); },
        updateUserConfiguration(_id, config) {
            writes.push({...config});
            return Promise.resolve();
        },
        clearUserTrackSelections(_id, mode) { cleared.push(mode); return Promise.resolve(); }
    };
    const userSettings = {
        setUserInfo() { return Promise.resolve(); },
        getSubtitleAppearanceSettings() { return {}; },
        setSubtitleAppearanceSettings() {}
    };
    const view = {querySelector() { return container; }};
    const exports = {};
    function BaseView() {}
    BaseView.prototype.onResume = function () {};
    BaseView.prototype.onPause = function () {};
    BaseView.prototype.destroy = function () {};
    const context = {
        define(_dependencies, factory) {
            factory(exports,
                {default: BaseView}, {}, {},
                {default: {show() {}, hide() {}}},
                {default: {translate(value) { return value; }, getCurrentLocales() { return 'en'; }}},
                {}, {}, {}, {}, {},
                {default: {getApiClient() { return apiClient; }}},
                {default: userSettings}, {default: function () {}},
                {default: {applyStyles() {}}},
                {default: {tv: false}},
                {appHost: {supports() { return false; }}}
            );
        },
        require(value) {
            if (Array.isArray(value) && value[0] === 'confirm') {
                return Promise.resolve([() => Promise.resolve()]);
            }
        },
        CustomEvent: class { constructor(type) { this.type = type; } },
        Intl, Promise, console
    };
    // The dependency count follows the frozen AMD module contract.
    vm.runInNewContext(source, context, {filename: 'subtitles.js'});
    const View = exports.default;
    const instance = new View(view, {serverId: 'server'});
    async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
    async function open() { instance.onResume({refresh: true}); await flush(); }
    async function submit() {
        control('form').dispatchEvent({type: 'submit', preventDefault() {}});
        await flush();
    }
    return {open, submit, select, control, writes, cleared, user, instance, flush};
}

test('template enables the existing Emby multi-select control', () => {
    assert.match(template, /class="selectSubtitleLanguage" multiple label=/);
    assert.match(template, /class="selectSubtitlePlaybackMode"/);
    assert.match(template, /class="chkRememberSubtitles"/);
});

test('opening and leaving settings preserves ordered multi-language configuration', async () => {
    const h = harness('zh-CN,zh');
    await h.open();
    assert.deepEqual(Array.from(h.select.getValues()), ['zh-CN', 'zh']);
    assert.equal(h.writes.length, 0);
    const items = await h.select.getItems({Ids: ['zh-CN', 'zh']});
    assert.deepEqual(Array.from(items.Items, item => item.Name), ['Chinese Simplified', 'Chinese']);
    h.instance.onPause();
    await h.flush();
    assert.equal(h.writes.at(-1).SubtitleLanguagePreference, 'zh-CN,zh');
    h.control('.selectSubtitlePlaybackMode').value = 'Always';
    await h.submit();
    assert.equal(h.writes.at(-1).SubtitleLanguagePreference, 'zh-CN,zh');
    assert.equal(h.writes.at(-1).SubtitleMode, 'Always');
    assert.equal(h.writes.at(-1).RememberSubtitleSelections, true);
});

test('leaving an untouched page keeps a newer preference from the server', async () => {
    const h = harness('en');
    await h.open();
    h.user.Configuration.SubtitleLanguagePreference = 'ja,zh';
    h.instance.onPause();
    await h.flush();
    assert.equal(h.writes.at(-1).SubtitleLanguagePreference, 'ja,zh');
});

test('multi-select saves in selection order and reloads without changing the playback fields', async () => {
    const h = harness('en');
    await h.open();
    h.select.choose(['ja', 'en', 'zh']);
    h.instance.onPause();
    await h.flush();
    assert.equal(h.writes.at(-1).SubtitleLanguagePreference, 'ja,en,zh');
    assert.equal(h.writes.at(-1).SubtitleMode, 'Smart');
    assert.equal(h.writes.at(-1).RememberSubtitleSelections, true);
    h.user.Configuration = {...h.writes.at(-1)};
    await h.open();
    assert.deepEqual(Array.from(h.select.getValues()), ['ja', 'en', 'zh']);
    const menu = await h.select.getItems({});
    assert.deepEqual(Array.from(menu.Items.slice(0, 3), item => item.Id), ['ja', 'en', 'zh']);
});

test('clearing language selection writes empty string; default and unknown codes survive', async () => {
    const h = harness('zh');
    await h.open();
    h.select.choose([]);
    await h.submit();
    assert.equal(h.writes.at(-1).SubtitleLanguagePreference, '');
    const unknown = harness('sr-Latn,zz');
    await unknown.open();
    assert.deepEqual(Array.from(unknown.select.getValues()), ['sr-Latn', 'zz']);
    const labels = await unknown.select.getItems({Ids: ['sr-Latn', 'zz']});
    assert.deepEqual(Array.from(labels.Items, item => item.Name), ['sr-Latn', 'zz']);
    await unknown.submit();
    assert.equal(unknown.writes.at(-1).SubtitleLanguagePreference, 'sr-Latn,zz');
    const empty = harness(null);
    await empty.open();
    assert.deepEqual(Array.from(empty.select.getValues()), []);
    await empty.submit();
    assert.equal(empty.writes.at(-1).SubtitleLanguagePreference, null);
});

test('multi-language save retains disabled subtitles and disabled track memory', async () => {
    const h = harness('en');
    h.user.Configuration.SubtitleMode = 'None';
    h.user.Configuration.RememberSubtitleSelections = false;
    await h.open();
    h.select.choose(['en', 'ja']);
    await h.submit();
    assert.equal(h.writes.at(-1).SubtitleLanguagePreference, 'en,ja');
    assert.equal(h.writes.at(-1).SubtitleMode, 'None');
    assert.equal(h.writes.at(-1).RememberSubtitleSelections, false);
});

test('saved track clearing remains a separate server request', async () => {
    const h = harness('en,ja');
    await h.open();
    h.control('.btnClearTrackSelections').dispatchEvent({type: 'click', target: {closest() { return {getAttribute() { return 'subtitles'; }}; }}});
    await h.flush();
    assert.deepEqual(h.cleared, ['subtitles']);
    assert.equal(h.writes.length, 0);
});
