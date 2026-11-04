'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const patch = require('../tools/patch-subtitle-language-preference.cjs');

const root = path.resolve(__dirname, '..');
const source = patch.patchPlaybackScript(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/settings/playback.js'), 'utf8'));
const template = patch.patchPlaybackHtml(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/settings/playback.html'), 'utf8'));

function harness(preference) {
    const controls = new Map();
    function element() {
        let children = [];
        const classes = new Set();
        const events = new Map();
        return {
            value: '', checked: false, style: {},
            classList: {add(...names) { names.forEach(name => classes.add(name)); }, remove(name) { classes.delete(name); }, toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); }},
            set textContent(value) { this._text = value; children = []; }, get textContent() { return this._text; },
            get children() { return children; }, appendChild(child) { children.push(child); },
            setAttribute() {}, addEventListener(type, callback) { events.set(type, callback); },
            dispatchEvent(event) { if (!event.target) event.target = this; if (events.has(event.type)) events.get(event.type).call(this, event); },
            querySelector(selector) { return children.find(child => child.classList.contains(selector.slice(1))); },
            querySelectorAll(selector) { return children.filter(child => child.classList.contains(selector.slice(1))); },
            focus() { this.focused = true; }
        };
    }
    function control(selector) {
        if (!controls.has(selector)) controls.set(selector, element());
        return controls.get(selector);
    }
    const container = {querySelector: control, querySelectorAll() { return []; }};
    const select = control('.selectAudioLanguage');
    select._values = [];
    select.getValues = function () { return this._values; };
    select.setValues = function (values, trigger) { this.values = values; if (trigger) this.dispatchEvent({type: 'change'}); };
    Object.defineProperty(select, 'values', {get() { return this._values; }, set(value) { this._values = Array.from(value); }});
    select.choose = function (values) { this.setValues(values, true); };
    const user = {Id: 'user', Policy: {EnableAudioPlaybackTranscoding: false}, Configuration: {
        AudioLanguagePreference: preference, PlayDefaultAudioTrack: true, RememberAudioSelections: true,
        EnableNextEpisodeAutoPlay: true, ResumeRewindSeconds: 0, IntroSkipMode: 'None'
    }};
    const cultures = [
        {DisplayName: 'Chinese', TwoLetterISOLanguageName: 'zh'},
        {DisplayName: 'English', TwoLetterISOLanguageName: 'en'},
        {DisplayName: 'Japanese', TwoLetterISOLanguageName: 'ja'}
    ];
    const writes = [];
    const apiClient = {
        serverId() { return 'server'; }, getCurrentUserId() { return 'user'; }, isMinServerVersion() { return false; },
        getUser() { return Promise.resolve(user); }, getCultures() { return Promise.resolve(cultures); },
        getEndpointInfo() { return Promise.resolve({IsInNetwork: true}); },
        updateUserConfiguration(_id, configuration) { writes.push({...configuration}); return Promise.resolve(); }
    };
    const userSettings = new Proxy({setUserInfo() { return Promise.resolve(); }}, {
        get(target, key) { return target[key] || (() => false); }
    });
    const appSettings = new Proxy({}, {get() { return () => false; }});
    const exports = {};
    function BaseView() {}
    BaseView.prototype.onResume = BaseView.prototype.onPause = BaseView.prototype.destroy = function () {};
    vm.runInNewContext(source, {
        define(_dependencies, factory) {
            factory(exports, {default: BaseView}, {}, {appHost: {supports() { return true; }}},
                {default: {getApiClient() { return apiClient; }}}, {default: userSettings}, {default: function () {}},
                {default: {show() {}, hide() {}}}, {default: {translate(value) { return value; }}},
                {}, {}, {}, {}, {}, {default: {tv: false}}, {default: appSettings},
                {default: {getAudioQualityOptions() { return []; }, getVideoQualityOptions() { return []; }}});
        },
        require() {}, document: {createElement: element}, Promise, console
    }, {filename: 'playback.js'});
    const instance = new exports.default({querySelector() { return container; }}, {serverId: 'server'});
    async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
    async function open() { instance.onResume({refresh: true}); await flush(); }
    async function submit() { control('form').dispatchEvent({type: 'submit', preventDefault() {}}); await flush(); }
    return {select, control, user, writes, instance, open, submit, flush};
}

test('audio preference uses the existing multi-select and visible order controls', () => {
    assert.match(template, /class="selectAudioLanguage" multiple data-reordering="true" data-virtualscroll="false" label=/);
    assert.doesNotMatch(template, /ete-language-order/);
    assert.match(template, /class="chkRememberAudioTracks"/);
});

test('audio order, unknown code and existing track settings survive save and reload', async () => {
    const h = harness('zz,en,ja');
    await h.open();
    assert.deepEqual(Array.from(h.select.getValues()), ['zz', 'en', 'ja']);
    const initial = await h.select.getItems({});
    assert.deepEqual(Array.from(initial.Items.slice(0, 3), item => item.Id), ['zz', 'en', 'ja']);
    h.select.choose(['en', 'zz', 'ja']);
    assert.deepEqual(Array.from(h.select.getValues()), ['en', 'zz', 'ja']);
    const menu = await h.select.getItems({});
    assert.deepEqual(Array.from(menu.Items.slice(0, 2), item => item.Id), ['en', 'zz']);
    const labels = await h.select.getItems({Ids: ['en', 'zz']});
    assert.deepEqual(Array.from(labels.Items, item => item.Name), ['English', 'zz']);
    await h.submit();
    assert.equal(h.writes.at(-1).AudioLanguagePreference, 'en,zz,ja');
    assert.equal(h.writes.at(-1).PlayDefaultAudioTrack, true);
    assert.equal(h.writes.at(-1).RememberAudioSelections, true);
    h.user.Configuration = {...h.writes.at(-1)};
    await h.open();
    assert.deepEqual(Array.from(h.select.getValues()), ['en', 'zz', 'ja']);
});

test('untouched audio setting preserves a newer server value; clearing writes empty string', async () => {
    const h = harness('en');
    await h.open();
    h.user.Configuration.AudioLanguagePreference = 'ja,zz';
    h.instance.onPause();
    await h.flush();
    assert.equal(h.writes.at(-1).AudioLanguagePreference, 'ja,zz');
    h.select.choose([]);
    await h.submit();
    assert.equal(h.writes.at(-1).AudioLanguagePreference, '');
    const empty = harness(null);
    await empty.open();
    await empty.submit();
    assert.equal(empty.writes.at(-1).AudioLanguagePreference, null);
});
