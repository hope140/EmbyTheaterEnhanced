'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');
const overlays = require('../tools/prepare-web-overlays.cjs');
const {namedFunction, pluginRoutes, appSettingsRoutes} = require('./fixtures/settings-menu-routes.cjs');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/navdrawer/navdrawercontent.js'), 'utf8');
assert.equal(crypto.createHash('sha256').update(source).digest('hex'), 'c235a30e0523abfddcd8050da004e20ae2ea0f7cb42a44189f12f4c827dfae18');

test('actual pinned app settings owner orders only the Enhanced section and retains user routes', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-menu-order-'));
    t.after(() => {
        assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
        fs.rmSync(directory, {recursive: true, force: true});
    });
    overlays.apply(root, directory);
    const appSource = fs.readFileSync(path.join(directory, 'electronapp/www/app.js'), 'utf8');
    for (const sync of [false, true]) {
        const builtins = appSettingsRoutes(appSource, feature => feature === 'keyboardsettings' || feature === 'fileinput' || sync && feature === 'sync');
        const userBefore = JSON.stringify(builtins.filter(route => route.settingsType === 'user'));
        assert.deepEqual(builtins.filter(route => route.settingsType !== 'user').map(route => route.path),
            ['/settings/keyboard.html'].concat(sync ? ['/settings/download.html', '/settings/managedownloads.html'] : []));
        const keyboard = builtins.find(route => route.path === '/settings/keyboard.html');
        assert.equal(keyboard.order, 2);
        const routes = builtins.concat(pluginRoutes(root).map(route => ({...route, path: '/plugins/' + route.pluginId + '/' + route.path})));
        const translations = JSON.parse(fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/common/strings/zh-CN.json')));
        const context = {
            Promise,
            _globalize: {default: {translate: key => translations[key] || key}},
            _approuter: {default: {getRoutes: () => routes}},
            _servicelocator: {appHost: {supports: () => false, appName: () => 'Emby Theater Enhanced'}},
            _layoutmanager: {default: {tv: false}}
        };
        vm.runInNewContext(['sortRoutes', 'mapRouteToMenuItem', 'getAppSettingsMenuItems'].map(name => namedFunction(source, name)).join('\n'), context, {timeout: 1000});
        const items = await context.getAppSettingsMenuItems({home: false, user: {Name: 'Fixture User', Id: 'fixture', ServerId: 'fixture'}});
        assert.equal(items[1].Name, 'Emby Theater Enhanced');
        assert.equal(Array.from(items.slice(2)).some(item => item.href === '/plugins/cecinput/cec/cec.html'), false);
        const targetPaths = [
            '/settings/keyboard.html',
            '/plugins/libmpvmediaplayer/mpvplayer/video.html', '/plugins/libmpvmediaplayer/mpvplayer/audio.html',
            '/plugins/libmpvmediaplayer/mpvplayer/strm.html', '/plugins/libmpvmediaplayer/mpvplayer/diagnostics.html',
            '/plugins/libmpvmediaplayer/mpvplayer/cache.html', '/plugins/libmpvmediaplayer/mpvplayer/about.html'
        ];
        const targetItems = Array.from(items.slice(2)).filter(item => targetPaths.includes(item.href));
        assert.deepEqual(targetItems.map(item => item.Name), ['操作快捷键', '视频设置', '音频设置', 'STRM 智能解析', '诊断与日志', '下一集预载', '关于 Enhanced']);
        assert.deepEqual(targetItems.map(item => item.href), targetPaths);
        assert.deepEqual(Array.from(items.slice(2)).filter(item => !targetPaths.includes(item.href)).map(item => item.href),
            sync ? ['/settings/download.html', '/settings/managedownloads.html'] : []);
        assert.equal(JSON.stringify(builtins.filter(route => route.settingsType === 'user')), userBefore);
    }
});
