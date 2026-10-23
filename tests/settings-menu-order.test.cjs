'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pluginRoutes} = require('./fixtures/settings-menu-routes.cjs');
const root = path.resolve(__dirname, '..');
const expected = [
    ['mpvplayer/video.html', 4, '视频设置', 'Playback', 'tv'],
    ['mpvplayer/audio.html', 5, '音频设置', 'Playback', 'audiotrack'],
    ['mpvplayer/strm.html', 6, 'STRM 智能解析', 'Playback', 'folder_open'],
    ['mpvplayer/diagnostics.html', 7, '诊断与日志', 'Playback', 'description'],
    ['mpvplayer/about.html', 8, '关于 Enhanced', 'General', 'info']
];

test('Enhanced settings retain the five non-CEC native sort ranks after keyboard rank two', () => {
    const routes = pluginRoutes(root);
    assert.equal(routes.length, expected.length);
    assert.equal(routes.some(route=>route.path.startsWith('cec/')),false);
    for (const [routePath, order] of expected) assert.equal(routes.find(route => route.path === routePath).order, order, routePath);
});

test('Enhanced route identities, native controllers and presentation metadata stay intact', () => {
    const routes = pluginRoutes(root);
    for (const [routePath, , title, category, icon] of expected) {
        const route = routes.find(value => value.path === routePath);
        const pluginId = 'libmpvmediaplayer';
        assert.equal(route.pluginId, pluginId);
        assert.equal(route.type, 'settings');
        assert.equal(route.title, title);
        assert.equal(route.category, category);
        assert.equal(route.icon, icon);
        assert.equal(route.controller, '/plugins/' + pluginId + '/' + routePath.replace('.html', '.js'));
        assert.equal(route.transition, 'slide');
        assert.equal(route.settingsTheme, true);
        assert.equal(route.adjustHeaderForEmbeddedScroll, true);
        assert.equal(route.settingsType, undefined);
        assert.equal(route.tabIndex, undefined);
    }
});
