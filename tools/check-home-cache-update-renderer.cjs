'use strict';

// Optional controlled Chromium integration; never bootstraps Electron or a real profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
const native = require('../tests/helpers/home-native-renderer.cjs');
const routes = require('../tests/helpers/home-route-renderer.cjs');

async function main(args = process.argv.slice(2)) {
    if (args.length !== 2 || !args.every(path.isAbsolute)) throw Error('Usage: node tools/check-home-cache-update-renderer.cjs <installed Chromium> <new evidence directory>');
    const root = path.resolve(__dirname, '..'), output = args[1];
    fs.mkdirSync(output);
    const browser = await require('playwright').chromium.launch({headless: true, executablePath: args[0]});
    const passed = [];
    try {
        for (const mode of ['retain', 'sections']) {
            const input = routes.augment(root, native.augment(root, sources(root)), true);
            // HTTP is entirely intercepted. The plugin manager still supplies the real mapped controller URL.
            input.routeSetup = input.routeSetup.replace('window.require=(ids,callback)=>{const values=ids.map', 'window.require=(ids,callback)=>{if(trial.route.amdNavigate && ids.some(id=>/plugins\\/.*\\.js$/.test(id)))return trial.route.amdNavigate(ids,callback);const values=ids.map');
            input.routeSetup = input.routeSetup.replaceAll('file:///synthetic/runtime/electronapp/', 'http://synthetic.invalid/').replace('enabled:false,ttlMs', 'enabled:true,ttlMs');
            const page = await openTrial(browser, input, mode, {native: true, nativeItems: 8, origin: 'http://synthetic.invalid/'});
            page.setDefaultTimeout(5000);
            const errors = [], requested = [];
            page.on('pageerror', error => errors.push(error.message));
            try {
                await page.evaluate(() => (0, eval)(trial.runtime.input.routeSetup)(trial));
                await page.evaluate(() => { trial.route.fixtureRequire = window.require; delete window.require; delete window.define; });
                await page.addScriptTag({content: fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/alameda/alameda.js'), 'utf8')});
                await page.route('http://synthetic.invalid/**', route => {
                    const file = new URL(route.request().url()).pathname;
                    requested.push(file);
                    const allowed = {
                        '/plugins/mpvplayer/about.js': 'src/electronapp/plugins/mpvplayer/about.js',
                        '/plugins/mpvplayer/cache-management.js': 'src/electronapp/plugins/mpvplayer/cache-management.js',
                        '/plugins/mpvplayer/cache-settings.js': 'src/electronapp/plugins/mpvplayer/cache-settings.js',
                        '/enhanced/detail-cache/store.js': 'src/electronapp/enhanced/detail-cache/store.js',
                        '/enhanced/release-note-links.js': 'src/electronapp/enhanced/release-note-links.js'
                    };
                    if (!allowed[file]) return route.abort();
                    return route.fulfill({contentType: 'application/javascript', body: '(function(define){\n' + fs.readFileSync(path.join(root, allowed[file]), 'utf8') + '\n})(trial.route.amdDefine);'});
                });
                await page.evaluate(alias => {
                    const r = trial.route, runtime = trial.runtime;
                    r.amdRequire = window.require; r.amdDefine = window.define;
                    r.amdRequire.config({baseUrl: 'http://synthetic.invalid/', noRequireCss: true});
                    r.amdDefine('baseView', [], () => runtime.load('modules/viewmanager/baseview.js').default);
                    r.amdDefine('loading', [], () => runtime.load('loading'));
                    for (const id of ['emby-button', 'emby-select', 'emby-scroller']) r.amdDefine(id, [], () => ({}));
                    r.amdDefine('ete-home-layout-cache', [], () => runtime.load('enhanced/page-cache/home-layout-cache.js'));
                    new Function('define',alias)(r.amdDefine);
                    r.amdNavigate = (ids, callback) => {
                        if (!ids.some(id => /plugins\/.*\.js$/.test(id))) return r.fixtureRequire(ids, callback);
                        return new Promise((resolve, reject) => {
                            const timer = setTimeout(() => reject(Error('Alameda plugin navigation deadline')), 4000);
                            r.amdRequire(ids, (...values) => { clearTimeout(timer); callback?.(...values); resolve(values); }, error => { clearTimeout(timer); reject(error); });
                        });
                    };
                    window.require = r.fixtureRequire;
                    const originalImport = Emby.importModule;
                    Emby.importModule = url => url.startsWith('http://synthetic.invalid/plugins/')
                        ? new Promise((resolve, reject) => {
                            const timer = setTimeout(() => reject(Error('Alameda controller loading deadline')), 4000);
                            r.amdRequire([url], value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
                        }) : originalImport(url);
                    r.updateChannel = 'stable'; r.ipcCalls = []; r.opened = []; r.progress = new Map();
                    window.ipc = {
                        invoke(channel, payload) {
                            r.ipcCalls.push(channel);
                            if (channel === 'enhanced-http-cache-status') return Promise.resolve({status: 'ok', bytes: 128});
                            if (channel === 'enhanced-http-cache-clear') return Promise.resolve({status: 'cleared', bytes: 0});
                            if (channel === 'enhanced-maintenance-info') return Promise.resolve({status: 'ok', info: {appVersion: '0.4.1'}});
                            if (channel === 'enhanced-maintenance-get-channel') return Promise.resolve({status: 'ok', channel: r.updateChannel});
                            if (channel === 'enhanced-maintenance-set-channel') { r.updateChannel = payload.channel; return Promise.resolve({status: 'saved', channel: r.updateChannel}); }
                            if (channel === 'enhanced-maintenance-check-update') return Promise.resolve({status: 'update-available', latestVersion: '0.4.2-beta.1', currentVersion: '0.4.1', installer: {id: 7}, notes: '[说明](https://example.invalid/notes) <img src=x>', releaseUrl: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/v0.4.2-beta.1'});
                            if (channel === 'enhanced-maintenance-open-note-link') { r.opened.push(payload.url); return Promise.resolve({status: 'opened'}); }
                            if (channel === 'enhanced-maintenance-download-update') return new Promise(resolve => { r.resolveDownload = resolve; });
                            if (channel === 'enhanced-maintenance-cancel-update') { r.resolveDownload?.({status: 'cancelled'}); return Promise.resolve({status: 'cancelled'}); }
                            return Promise.resolve({status: 'unavailable'});
                        },
                        on(channel, listener) { r.progress.set(channel, listener); },
                        removeListener(channel, listener) { if (r.progress.get(channel) === listener) r.progress.delete(channel); }
                    };
                }, require('./patch-server-home.cjs').DETAIL_CACHE_ALIAS);
                await page.evaluate(() => trial.route.navigate('home'));
                await page.evaluate(() => trial.route.settleHome());
                await page.evaluate(() => { trial.route.original = trial.route.manager.currentView(); return trial.route.navigate('settings'); });
                await page.evaluate(() => { trial.config.holdAllItems = true; return trial.route.navigate('home'); });
                assert.equal(await page.evaluate(() => trial.route.original === trial.route.manager.currentView()), true);
                assert.equal(await page.evaluate(() => trial.route.state().created), 1);
                assert.equal(await page.evaluate(() => trial.route.state().cards), 16);
                await page.evaluate(() => { trial.config.holdAllItems = false; trial.release(); });
                await page.evaluate(() => trial.route.settleHome());
                await page.evaluate(() => trial.route.navigate('settings'));
                await page.locator('.navMenuOption-settings:visible').filter({hasText: '缓存管理'}).click();
                await page.waitForFunction(() => document.querySelector('.cacheHttpValue')?.textContent.includes('128 bytes'));
                const pageCache=await page.evaluate(async()=>{const r=trial.route,[module]=await new Promise((resolve,reject)=>r.amdRequire(['ete-detail-cache-store'],(...values)=>resolve(values),reject));r.detailStore=module.default.shared();const snapshot=await r.detailStore.snapshot();return {layout:trial.runtime.load('enhanced/page-cache/home-layout-cache.js').default.management.snapshot(),detail:snapshot};});
                assert.equal(pageCache.detail.status,'ok');assert.equal(pageCache.layout.entries,1);assert.ok(pageCache.layout.serializedBytes>0);assert.match(await page.locator('.cachePageValue').textContent(),new RegExp((pageCache.layout.serializedBytes+pageCache.detail.serializedBytes)+' bytes'));
                await page.locator('.btnClearAllCaches').click();
                await page.waitForFunction(() => document.querySelector('.cacheOperationState')?.textContent === '以上缓存已清理。');
                assert.equal(await page.evaluate(() => trial.runtime.load('enhanced/page-cache/home-layout-cache.js').default.management.snapshot().entries), 0);
                assert.deepEqual(await page.evaluate(() => trial.route.detailStore.snapshot()),{status:'ok',entries:0,serializedBytes:0});
                await page.evaluate(() => trial.route.navigate('settings'));
                await page.locator('.navMenuOption-settings:visible').filter({hasText: '关于 Enhanced'}).click();
                await page.waitForFunction(() => document.querySelector('.selectUpdateChannel')?.disabled === false);
                assert.equal(await page.locator('.selectUpdateChannel').inputValue(), 'stable');
                assert.equal(await page.evaluate(() => trial.route.ipcCalls.includes('enhanced-maintenance-check-update')), false);
                await page.locator('.selectUpdateChannel').selectOption('testing');
                await page.waitForFunction(() => !document.querySelector('.selectUpdateChannel').disabled);
                assert.equal(await page.evaluate(() => trial.route.updateChannel), 'testing');
                await page.locator('.btnCheckUpdates').click();
                await page.waitForFunction(() => document.querySelector('.aboutNoteLink')).catch(async error => { throw Error(error.message + '; synthetic diagnostics=' + JSON.stringify(await page.evaluate(() => ({calls:trial.route.ipcCalls,state:document.querySelector('.aboutUpdateState')?.textContent,notes:document.querySelector('.aboutReleaseNotes')?.outerHTML,changing:trial.route.manager.currentView().controller.changingChannel,channel:trial.route.manager.currentView().controller.updateChannel}))) + '; requested=' + requested.join(',')); });
                assert.equal(await page.locator('.aboutReleaseNotes img').count(), 0);
                await page.locator('.about-update-disclosure summary').filter({hasText: '更新说明'}).click();
                await page.locator('.aboutNoteLink').click();
                assert.deepEqual(await page.evaluate(() => trial.route.opened), ['https://example.invalid/notes']);
                assert.equal(await page.evaluate(() => trial.route.manager.currentViewInfo().url), '/plugins/libmpvmediaplayer/mpvplayer/about.html');
                await page.locator('.btnDownloadUpdate').click();
                await page.waitForFunction(() => document.querySelector('.selectUpdateChannel').disabled);
                await page.evaluate(() => { const controller = trial.route.manager.currentView().controller; trial.route.oldAbout = controller; trial.route.oldInfoId = controller.infoRequestId; });
                await page.evaluate(() => trial.route.navigate('home'));
                await page.evaluate(() => trial.route.settleHome());
                assert.equal(await page.evaluate(() => trial.route.progress.size), 0);
                assert.ok(await page.evaluate(() => trial.route.oldAbout.paused));
                await page.evaluate(() => trial.route.navigate('controlled-one'));
                await page.evaluate(() => trial.route.navigate('controlled-two'));
                assert.equal(await page.evaluate(() => trial.route.oldAbout.view), null);
                await page.evaluate(() => trial.route.navigate('home'));
                await page.evaluate(() => trial.route.settleHome());
                assert.ok(await page.evaluate(() => trial.route.oldAbout.infoRequestId > trial.route.oldInfoId));
                assert.ok(await page.evaluate(() => trial.route.ipcCalls.includes('enhanced-maintenance-cancel-update')));
                assert.equal(await page.evaluate(() => trial.route.state().cards), 16);
                assert.deepEqual(errors, []);
                assert.ok(requested.includes('/enhanced/release-note-links.js'));
                assert.ok(requested.includes('/plugins/mpvplayer/cache-settings.js'));
                assert.equal(requested.filter(file=>file==='/enhanced/detail-cache/store.js').length,1);
                await page.screenshot({path: path.join(output, mode + '-return.png')});
                passed.push({mode, requested, ipc: await page.evaluate(() => trial.route.ipcCalls)});
            } catch (error) {
                throw Error(error.stack + '; synthetic requests=' + JSON.stringify(requested) + '; pageerrors=' + JSON.stringify(errors) + '; state=' + JSON.stringify(await page.evaluate(() => ({route:trial.route.manager.currentViewInfo(),calls:trial.route.ipcCalls}))));
            } finally { await page.close(); }
        }
        const report = {status: 'passed', browser: browser.version(), passed, scope: 'real frozen Alameda plugin URL resolution, controllers, BaseView and composed router/viewmanager/Home/card/settings sources in isolated Chromium; API/IPC/system-browser/download modeled, no external requests or real profiles; not Windows or real-server acceptance'};
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    } finally { await browser.close(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = {main};
