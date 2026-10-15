'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const patcher = require('../tools/patch-externalplayer-residue.cjs');

function sourceFixture() {
    return [
        'define([',
        '  "userSettings",',
        '  "../modules/commandprocessor.js",',
        '  "appSettings",',
        '  "toast"',
        '], function (',
        '  userSettings,',
        '  commandprocessor,',
        '  appSettings,',
        '  toast',
        ') {',
        '  "use strict";',
        '  function renderDetails(view, item) {',
        '      (function (page, item) {',
        '        var btnAutoPlays = page.querySelectorAll(".btnAutoPlay");',
        '        var enabled = navigator.userAgent.includes("wv")',
        '          ? appSettings.enableSystemExternalPlayers()',
        '          : JSON.parse(appSettings.get("externalplayers") || "[]").some(item => {',
        '              return item["videotype-file"];',
        '            });',
        '        for (var i = 0, length = btnAutoPlays.length; i < length; i++) {',
        '          var btnAutoPlay = btnAutoPlays[i];',
        '          enabled && (item.Type == "Series" || item.Type == "Season" || item.Type == "Episode")',
        '            ? btnAutoPlay.classList.remove("hide")',
        '            : btnAutoPlay.classList.add("hide");',
        '        }',
        '        updateAutoplayButton();',
        '      })(view, item),',
        '      (function (page, item) {',
        '        window.otherDetailWork = true;',
        '      })(view, item);',
        '  }',
        '  function onAutoPlayClick(e) {',
        '    appSettings.set("autoplay", "true");',
        '  }',
        '  function updateAutoplayButton() {',
        '    document.querySelectorAll(".btnAutoPlayIcon");',
        '  }',
        '  function onQueueClick() {',
        '    return appSettings.get("queue");',
        '  }',
        '  function bind(view) {',
        '      bindAll(view, ".btnAutoPlay", "click", onAutoPlayClick.bind(this)),',
        '      bindAll(view, ".btnQueue", "click", onQueueClick.bind(this));',
        '  }',
        '  var ItemPage = function (item) { this.currentItem = item; };',
        '  ItemPage.prototype.onResume = function (options) {',
        '      window.itemPage = this;',
        '      if (options.fromPlayEnded) {',
        '        window.timeout1 = setTimeout(function () {',
        '          window.timeout2 = setTimeout(function () {',
        '            commandprocessor.default.executeCommand("resume", {Id: "old-next"});',
        '          }, 1000);',
        '        }, 1000);',
        '      }',
        '      BaseView.prototype.onResume.apply(this, arguments);',
        '  };',
        '  return {renderDetails: renderDetails, bind: bind, ItemPage: ItemPage};',
        '});'
    ].join('\n');
}

function executeFixture(options = {}) {
    const transformed = patcher.patchItemText(sourceFixture());
    const settings = new Map(Object.entries(options.settings || {}));
    const beforeSettings = new Map(settings);
    const writes = [];
    const notices = [];
    const binds = [];
    const timers = [];
    const commandCalls = [];
    let baseResumeCalls = 0;
    let moduleExports;
    let dependencies = [];
    const window = {};
    const appSettings = {
        get(key) { return settings.has(key) ? settings.get(key) : null; },
        set(key, value) { writes.push([key, value]); settings.set(key, value); },
        enableSystemExternalPlayers() { return options.systemExternalPlayers === true; }
    };
    const toast = options.toast === 'throws' ? function () { throw new Error('private setting text'); } :
        function (message) { notices.push(message); return Promise.resolve(); };
    const sandbox = {
        define(moduleDependencies, factory) {
            dependencies = Array.from(moduleDependencies);
            moduleExports = factory({}, appSettings, toast);
        },
        window,
        navigator: {userAgent: options.userAgent || 'Emby-Theater'},
        document: {querySelectorAll() { throw new Error('legacy button query must not execute'); }},
        BaseView: {prototype: {onResume() { baseResumeCalls++; }}},
        bindAll(_view, selector, _event, _handler) { binds.push(selector); },
        setTimeout(callback) { timers.push(callback); return timers.length; },
        commandprocessor: {default: {executeCommand(...args) { commandCalls.push(args); }}}
    };
    vm.runInNewContext(transformed, sandbox, {filename: 'item.externalplayer.transformed.js'});
    return {
        baseResumeCalls: () => baseResumeCalls,
        binds,
        commandCalls,
        dependencies,
        moduleExports,
        notices,
        settings,
        settingsUnchanged: () => [...beforeSettings].every(([key, value]) => settings.get(key) === value),
        timers,
        writes,
        window
    };
}

test('item overlay removes only the legacy external-player detail controls and timer consumers', () => {
    const output = patcher.patchItemText(sourceFixture());
    const html = patcher.patchItemHtmlText([
        '<div>',
        '                            <button is="emby-button" type="button" class="btnAutoPlay hide fab detailButton detailButton-autotext" title="连播">',
        '                                <i class="md-icon button-icon btnAutoPlayIcon detailButton-autotext-icon autortl">sync</i>',
        '                                <span class="detailButton-autotext-text secondaryText autoplayButtonText">连播</span>',
        '                            </button>',
        '                            <button class="btnQueue"></button>',
        '</div>'
    ].join('\n'));

    assert.equal(/\b(?:new\s+Function|eval)\s*\(/.test(output), false);
    for (const legacyToken of [
        '.btnAutoPlay',
        'onAutoPlayClick',
        'updateAutoplayButton',
        'window.timeout1',
        'window.timeout2',
        'window.timeout3',
        'commandprocessor.default.executeCommand("resume", nextItem)',
        'appSettings.set("autoplay"'
    ]) assert.equal(output.includes(legacyToken), false, legacyToken);
    assert.equal(html.includes('btnAutoPlay'), false);
    assert.equal(html.includes('btnQueue'), true);
});

test('synthetic detail and play-ended events retain old settings but never schedule or dispatch legacy autoplay', () => {
    const runtime = executeFixture({
        settings: {
            autoplay: 'true',
            externalplayers: '[{"videotype-file":"/synthetic/player"}]'
        }
    });
    assert.equal(runtime.dependencies.includes('../modules/commandprocessor.js'), false);

    runtime.moduleExports.renderDetails({}, {Type: 'Episode'});
    runtime.moduleExports.bind({});
    const page = new runtime.moduleExports.ItemPage({Type: 'Episode'});
    page.onResume({fromPlayEnded: true});

    assert.deepEqual(runtime.binds, ['.btnQueue']);
    assert.equal(runtime.notices.length, 1);
    assert.match(runtime.notices[0], /saved settings remain unchanged/);
    assert.equal(runtime.timers.length, 0);
    assert.deepEqual(runtime.commandCalls, []);
    assert.deepEqual(runtime.writes, []);
    assert.equal(runtime.settingsUnchanged(), true);
    assert.equal(runtime.baseResumeCalls(), 1);
    assert.equal(runtime.window.otherDetailWork, true);
});

test('invalid legacy settings and notice failure do not interrupt normal item resume', () => {
    const runtime = executeFixture({
        settings: {autoplay: 'false', externalplayers: '{PRIVATE_SETTING_SENTINEL'},
        toast: 'throws'
    });
    const page = new runtime.moduleExports.ItemPage({Type: 'Season'});

    assert.doesNotThrow(() => page.onResume({fromPlayEnded: true}));
    assert.equal(runtime.timers.length, 0);
    assert.deepEqual(runtime.commandCalls, []);
    assert.deepEqual(runtime.writes, []);
    assert.equal(runtime.baseResumeCalls(), 1);
    assert.equal(runtime.settingsUnchanged(), true);
});

test('items without legacy external-player settings keep the ordinary detail path without a migration notice', () => {
    const runtime = executeFixture({settings: {autoplay: 'false', externalplayers: '[]'}});
    runtime.moduleExports.renderDetails({}, {Type: 'Episode'});

    assert.equal(runtime.notices.length, 0);
    assert.equal(runtime.window.otherDetailWork, true);
    assert.equal(runtime.settingsUnchanged(), true);
});
