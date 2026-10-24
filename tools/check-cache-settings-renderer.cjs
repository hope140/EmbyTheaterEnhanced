'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
async function main(args = process.argv.slice(2)) {
    if (args.length !== 1 || !path.isAbsolute(args[0])) throw Error('Usage: node tools/check-cache-settings-renderer.cjs <absolute installed Chromium executable>');
    const root = path.resolve(__dirname, '..'), files = {
        html: 'src/electronapp/plugins/mpvplayer/about.html', about: 'src/electronapp/plugins/mpvplayer/about.js',
        ui: 'src/electronapp/plugins/mpvplayer/cache-settings.js', adapter: 'src/electronapp/enhanced/page-cache/home-layout-cache.js',
        cache: 'src/electronapp/enhanced/page-cache/page-data-cache.js', events: 'src/electronapp/www/modules/emby-apiclient/events.js',
        base: 'vendor/web-snapshot/www/modules/viewmanager/baseview.js'
    };
    const input = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, fs.readFileSync(path.join(root, v), 'utf8')]));
    const browser = await require('playwright').chromium.launch({executablePath: args[0], headless: true}), passed = [];
    async function scenario(name, run) {
        const page = await browser.newPage(), errors = [];
        await page.route('**/*', route => route.abort());
        page.on('pageerror', error => errors.push(error.name));
        try {
            await page.setContent(input.html);
            await page.evaluate(input => {
                function amd(code, deps) {
                    let result; const exports = {};
                    window.define = (names, factory) => { result = factory(...names.map(name => name === 'exports' ? exports : deps[name])) || exports; };
                    window.define.amd = {};
                    (0, eval)(code); return result;
                }
                window.t = {config: {}, calls: [], held: [], owners: [], domStage: document.createElement('div')};
                t.domStage.textContent = 'retained Home stage'; document.body.append(t.domStage);
                t.events = amd(input.events, {}).default;
                t.cache = amd(input.cache, {}).default;
                t.adapter = amd(input.adapter, {'./page-data-cache.js': {default: t.cache}, 'modules/emby-apiclient/events.js': {default: t.events}}).default;
                t.ui = amd(input.ui, {'../../enhanced/page-cache/home-layout-cache.js': {default: t.adapter}});
                const Base = amd(input.base, {'./../dom.js': {default: {supportsEventListenerOnce: () => false}}, './../layoutmanager.js': {default: {tv: false}}, './../browser.js': {default: {}}}).default;
                window.ipc = {invoke: (channel, payload) => {
                    t.calls.push({channel, payload});
                    if (!channel.startsWith('enhanced-http-cache-')) return Promise.resolve(channel === 'enhanced-maintenance-info' ? {status: 'ok', info: {}} : {status: 'unavailable'});
                    return new Promise((resolve, reject) => {
                        function done() { if (t.config.fail) reject(Error('PRIVATE synthetic error')); else resolve(t.config.measurementUnavailable ? {status: 'cleared', measurement: 'unavailable'} : t.config.busy ? {status: 'busy'} : {status: channel.endsWith('clear') ? 'cleared' : 'ok', bytes: 512}); }
                        if (t.config.hold) t.held.push(done); else done();
                    });
                }};
                t.About = amd(input.about, {loading: {show() {}, hide() {}}, baseView: Base, './cache-settings': t.ui});
                t.view = document.querySelector('.view'); t.about = new t.About(t.view);
                t.addOwner = async () => {
                    let user = 'synthetic-user'; const api = {isLoggedIn: () => !!user, serverId: () => 'synthetic-server', getCurrentUserId: () => user,
                        _identityEpoch: 1, getCurrentLocale: () => 'zh-CN', serverVersion: () => '4.10.0.40'};
                    const owner = t.adapter.create({currentApiClient: () => api}, {enabled: true, ttlMs: 10000, maxEntries: 2, maxBytes: 4096}, t.events);
                    t.owners.push(owner); t.user = value => {user = value; api._identityEpoch++;};
                    await owner.load({displayMode: 'desktop'}, () => Promise.resolve([{Id: 'safe', Name: 'safe'}]));
                };
                t.release = () => { t.held.splice(0).forEach(fn => fn()); };
                t.httpCalls = () => t.calls.filter(x => x.channel.startsWith('enhanced-http-cache-'));
            }, input);
            await run(page); assert.deepEqual(errors, []); passed.push(name);
        } finally { await page.evaluate(() => { t.about.destroy(); t.owners.forEach(owner => owner.dispose()); }).catch(() => {}); await page.close(); }
    }
    try {
        await scenario('actual About onResume wires the management section; defaults show disabled DTO cache and total HTTP bytes', async p => {
            await p.evaluate(() => t.about.onResume({}));
            await p.waitForFunction(() => document.querySelector('.cacheHttpValue').textContent.includes('512'));
            assert.match(await p.locator('.cachePageValue').textContent(), /未启用（0 条）/);
            assert.match(await p.locator('.cacheHttpValue').textContent(), /session HTTP 总量/);
            assert.equal(await p.locator('.btnClearHttpCache').isDisabled(), false);
        });
        await scenario('page clear uses the real layout owner, preserves retained stage and never sends HTTP clear', async p => {
            await p.evaluate(async () => {await t.addOwner();t.about.onResume({});});
            await p.waitForFunction(() => !document.querySelector('.btnClearPageCache').disabled);
            assert.match(await p.locator('.cachePageValue').textContent(), /1 \/ 2 条/);
            const result = await p.evaluate(async () => {
                await t.about.cacheManagement.resume(); document.querySelector('.btnClearPageCache').click();
                for(let i=0;i<20;i++)await Promise.resolve();
                return {snapshot:t.adapter.management.snapshot(),stage:t.domStage.textContent,httpClears:t.calls.filter(x=>x.channel==='enhanced-http-cache-clear').length};
            });
            assert.equal(result.snapshot.entries,0);assert.equal(result.stage,'retained Home stage');assert.equal(result.httpClears,0);
            assert.match(await p.locator('.cacheOperationState').textContent(), /当前界面保留/);
        });
        await scenario('duplicate DOM clicks share one clear and controls recover on success', async p => {
            await p.evaluate(async () => {await t.about.cacheManagement.resume();t.config.hold=true;const b=document.querySelector('.btnClearHttpCache');b.click();b.click();});
            await p.waitForFunction(() => t.held.length === 1);assert.equal(await p.locator('.btnClearPageCache').isDisabled(),true);
            assert.equal(await p.evaluate(() => t.calls.filter(x=>x.channel==='enhanced-http-cache-clear').length),1);
            await p.evaluate(() => t.release());await p.waitForFunction(() => !document.querySelector('.btnClearHttpCache').disabled);
            assert.match(await p.locator('.cacheOperationState').textContent(), /清理完成/);
        });
        await scenario('pause ignores a late response; resume during pending work avoids another operation and settles explicitly', async p => {
            await p.evaluate(async () => {await t.about.cacheManagement.resume();t.config.hold=true;document.querySelector('.btnClearHttpCache').click();});
            await p.waitForFunction(() => t.held.length === 1);
            const count=await p.evaluate(() => {t.about.onPause();t.about.cacheManagement.resume();return t.httpCalls().length;});
            assert.match(await p.locator('.cacheOperationState').textContent(), /收尾/);
            await p.evaluate(() => t.release());await p.waitForFunction(() => !document.querySelector('.btnRefreshCache').disabled);
            assert.match(await p.locator('.cacheOperationState').textContent(), /已结束，请刷新/);
            assert.equal(await p.evaluate(() => t.httpCalls().length),count);
        });
        await scenario('destroy through native BaseView viewdestroy prevents late UI mutation and removes handlers', async p => {
            await p.evaluate(async () => {await t.about.cacheManagement.resume();t.config.hold=true;document.querySelector('.btnClearHttpCache').click();});
            await p.waitForFunction(() => t.held.length === 1);
            const result=await p.evaluate(async () => {
                t.view.dispatchEvent(new Event('viewdestroy'));const text=t.view.textContent,count=t.httpCalls().length;
                t.release();for(let i=0;i<20;i++)await Promise.resolve();document.querySelector('.btnRefreshCache').click();
                return {same:t.view.textContent===text,calls:t.httpCalls().length,count,destroyed:t.about.isDestroyed()};
            });assert.equal(result.same,true);assert.equal(result.calls,result.count);assert.equal(result.destroyed,true);
        });
        await scenario('IPC failure uses a fixed inline error and explicit retry recovers', async p => {
            await p.evaluate(async () => {t.config.fail=true;await t.about.cacheManagement.resume();});
            assert.equal(await p.locator('.cacheOperationState').getAttribute('role'),'alert');assert.match(await p.locator('.cacheOperationState').textContent(),/操作失败/);
            assert.equal((await p.locator('.cacheOperationState').textContent()).includes('PRIVATE'),false);
            await p.evaluate(() => {t.config.fail=false;document.querySelector('.btnRefreshCache').click();});
            await p.waitForFunction(() => document.querySelector('.cacheHttpValue').textContent.includes('512'));
        });
        await scenario('a completed clear with unavailable size remains success without a false zero-byte total', async p => {
            await p.evaluate(async () => {await t.about.cacheManagement.resume();t.config.measurementUnavailable=true;document.querySelector('.btnClearHttpCache').click();});
            await p.waitForFunction(() => !document.querySelector('.btnClearHttpCache').disabled);
            assert.match(await p.locator('.cacheOperationState').textContent(),/清理完成；统计暂不可用/);
            assert.equal(await p.locator('.cacheHttpValue').textContent(),'无法读取');
        });
        await scenario('identity changes are retired before displaying counts; unknown/busy HTTP data is not fabricated as zero', async p => {
            await p.evaluate(async () => {await t.addOwner();t.user(null);t.config.busy=true;await t.about.cacheManagement.resume();});
            assert.match(await p.locator('.cachePageValue').textContent(), /0 \/ 2 条/);assert.equal(await p.locator('.cacheHttpValue').textContent(),'正在清理');
            assert.match(await p.locator('.aboutCacheManagement').textContent(), /图片解码内存无法准确统计/);
        });
        // Exercise actual loader normalization too: Home and the plugin must share one AMD cache owner module.
        const loaderPage = await browser.newPage(), loaderErrors = [];
        loaderPage.on('pageerror', error => loaderErrors.push(error.name));
        try {
            const routes = {'/plugins/mpvplayer/cache-settings.js': input.ui,
                '/enhanced/page-cache/home-layout-cache.js': input.adapter, '/enhanced/page-cache/page-data-cache.js': input.cache,
                '/modules/emby-apiclient/events.js': input.events};
            const requested = [];
            await loaderPage.route('**/*', route => {
                requested.push(new URL(route.request().url()).pathname);
                const text = routes[new URL(route.request().url()).pathname];
                return text ? route.fulfill({status:200,contentType:'application/javascript',body:text}) : route.abort();
            });
            await loaderPage.setContent('<base href="http://synthetic.invalid/">' + input.html);
            await loaderPage.addScriptTag({content:fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/alameda/alameda.js'),'utf8')});
            const result = await loaderPage.evaluate(async () => {
                require.config({baseUrl:'http://synthetic.invalid/'});
                const [adapter,ui,events] = await new Promise((resolve,reject) => {
                    const timer=setTimeout(()=>reject(Error('AMD loading deadline exceeded')),5000);
                    require(['enhanced/page-cache/home-layout-cache.js','plugins/mpvplayer/cache-settings','modules/emby-apiclient/events.js'],(...loaded)=>{clearTimeout(timer);resolve(loaded);},error=>{clearTimeout(timer);reject(error);});
                });
                const api={isLoggedIn:()=>true,serverId:()=> 'synthetic-server',getCurrentUserId:()=> 'synthetic-user',_identityEpoch:1,getCurrentLocale:()=> 'zh-CN',serverVersion:()=> '4.10.0.40'};
                const owner=adapter.default.create({currentApiClient:()=>api},{enabled:true,ttlMs:10000,maxEntries:2,maxBytes:4096},events.default);
                try {
                    await owner.load({displayMode:'desktop'},()=>Promise.resolve([{Id:'safe'}]));
                    const manager=ui.create(document.querySelector('.view'),()=>Promise.resolve({status:'ok',bytes:128}));
                    await manager.resume(); const before=document.querySelector('.cachePageValue').textContent;
                    document.querySelector('.btnClearPageCache').click();for(let i=0;i<20;i++)await Promise.resolve();
                    const remaining=adapter.default.management.snapshot().entries;manager.dispose();return {before,remaining};
                } finally {owner.dispose();}
            }).catch(error => {throw Error(error.message + '; synthetic requested paths=' + requested.join(','));});
            assert.match(result.before,/1 \/ 2 条/);assert.equal(result.remaining,0);assert.deepEqual(loaderErrors,[]);
            passed.push('actual Alameda resolves plugin and Home relative paths to the same managed layout owner');
        } finally {await loaderPage.close();}
        console.log(JSON.stringify({status:'passed',browser:browser.version(),scenarios:passed.length,passed,
            scope:'real About/controller/HTML, native BaseView, layout/cache/events and DOM in Chromium; main session IPC modeled, no Electron or Windows/full GUI acceptance'}));
    } finally {await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
