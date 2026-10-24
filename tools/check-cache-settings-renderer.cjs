'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
async function main(args = process.argv.slice(2)) {
    if (args.length !== 1 || !path.isAbsolute(args[0])) throw Error('Usage: node tools/check-cache-settings-renderer.cjs <absolute installed Chromium executable>');
    const root = path.resolve(__dirname, '..'), files = {
        html: 'src/electronapp/plugins/mpvplayer/cache-management.html', controller: 'src/electronapp/plugins/mpvplayer/cache-management.js',
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
                t.ui = amd(input.ui, {'ete-home-layout-cache': {default: t.adapter}});
                const Base = amd(input.base, {'./../dom.js': {default: {supportsEventListenerOnce: () => false}}, './../layoutmanager.js': {default: {tv: false}}, './../browser.js': {default: {}}}).default;
                window.ipc = {invoke: (channel, payload) => {
                    t.calls.push({channel, payload});
                    if (!channel.startsWith('enhanced-http-cache-')) return Promise.resolve(channel === 'enhanced-maintenance-info' ? {status: 'ok', info: {}} : {status: 'unavailable'});
                    return new Promise((resolve, reject) => {
                        function done() { if (t.config.fail) reject(Error('PRIVATE synthetic error')); else resolve(t.config.measurementUnavailable ? {status: 'cleared', measurement: 'unavailable'} : t.config.busy ? {status: 'busy'} : {status: channel.endsWith('clear') ? 'cleared' : 'ok', bytes: 512}); }
                        if (t.config.hold) t.held.push(done); else done();
                    });
                }};
                t.CacheView = amd(input.controller, {loading: {show() {}, hide() {}}, baseView: Base, './cache-settings.js': t.ui});
                t.view = document.querySelector('.view'); t.controller = new t.CacheView(t.view);
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
        } finally { await page.evaluate(() => { t.controller.destroy(); t.owners.forEach(owner => owner.dispose()); }).catch(() => {}); await page.close(); }
    }
    try {
        await scenario('actual independent cache page onResume loads its two owners; defaults show disabled DTO cache and total HTTP bytes', async p => {
            await p.evaluate(() => t.controller.onResume({}));
            await p.waitForFunction(() => document.querySelector('.cacheHttpValue').textContent.includes('512'));
            assert.match(await p.locator('.cachePageValue').textContent(), /0 条/);
            assert.match(await p.locator('.cacheHttpValue').textContent(), /session HTTP 总量/);
            assert.match(await p.locator('.cachePageBudget').textContent(), /未启用/);
            assert.equal(await p.locator('.btnClearHttpCache').isDisabled(), false);
        });
        await scenario('page clear uses the real layout owner, preserves retained stage and never sends HTTP clear', async p => {
            await p.evaluate(async () => {await t.addOwner();t.controller.onResume({});});
            await p.waitForFunction(() => !document.querySelector('.btnClearPageCache').disabled);
            assert.match(await p.locator('.cachePageValue').textContent(), /1 条/);
            const result = await p.evaluate(async () => {
                await t.controller.cacheManagement.resume(); document.querySelector('.btnClearPageCache').click();
                for(let i=0;i<20;i++)await Promise.resolve();
                return {snapshot:t.adapter.management.snapshot(),stage:t.domStage.textContent,httpClears:t.calls.filter(x=>x.channel==='enhanced-http-cache-clear').length};
            });
            assert.equal(result.snapshot.entries,0);assert.equal(result.stage,'retained Home stage');assert.equal(result.httpClears,0);
            assert.match(await p.locator('.cachePageState').textContent(), /当前界面保留/);
        });
        await scenario('duplicate DOM clicks share one clear and controls recover on success', async p => {
            await p.evaluate(async () => {await t.controller.cacheManagement.resume();t.config.hold=true;const b=document.querySelector('.btnClearHttpCache');b.click();b.click();});
            await p.waitForFunction(() => t.held.length === 1);assert.equal(await p.locator('.btnClearPageCache').isDisabled(),true);
            assert.equal(await p.evaluate(() => t.calls.filter(x=>x.channel==='enhanced-http-cache-clear').length),1);
            await p.evaluate(() => t.release());await p.waitForFunction(() => !document.querySelector('.btnClearHttpCache').disabled);
            assert.match(await p.locator('.cacheOperationState').textContent(), /清理已完成/);
        });
        await scenario('pause ignores a late response; resume during pending work avoids another operation and settles explicitly', async p => {
            await p.evaluate(async () => {await t.controller.cacheManagement.resume();t.config.hold=true;document.querySelector('.btnClearHttpCache').click();});
            await p.waitForFunction(() => t.held.length === 1);
            const count=await p.evaluate(() => {t.controller.onPause();t.controller.cacheManagement.resume();return t.httpCalls().length;});
            assert.match(await p.locator('.cacheOperationState').textContent(), /收尾/);
            await p.evaluate(() => t.release());await p.waitForFunction(() => !document.querySelector('.btnRefreshCache').disabled);
            assert.match(await p.locator('.cacheOperationState').textContent(), /已结束，请刷新/);
            assert.equal(await p.evaluate(() => t.httpCalls().length),count);
        });
        await scenario('destroy through native BaseView viewdestroy prevents late UI mutation and removes handlers', async p => {
            await p.evaluate(async () => {await t.controller.cacheManagement.resume();t.config.hold=true;document.querySelector('.btnClearHttpCache').click();});
            await p.waitForFunction(() => t.held.length === 1);
            const result=await p.evaluate(async () => {
                t.view.dispatchEvent(new Event('viewdestroy'));const text=t.view.textContent,count=t.httpCalls().length;
                t.release();for(let i=0;i<20;i++)await Promise.resolve();document.querySelector('.btnRefreshCache').click();
                return {same:t.view.textContent===text,calls:t.httpCalls().length,count,destroyed:t.controller.isDestroyed()};
            });assert.equal(result.same,true);assert.equal(result.calls,result.count);assert.equal(result.destroyed,true);
        });
        await scenario('IPC failure uses a fixed inline error and explicit retry recovers', async p => {
            await p.evaluate(async () => {t.config.fail=true;await t.controller.cacheManagement.resume();});
            assert.equal(await p.locator('.cacheOperationState').getAttribute('role'),'alert');assert.match(await p.locator('.cacheOperationState').textContent(),/未能全部完成/);
            assert.equal((await p.locator('.cacheOperationState').textContent()).includes('PRIVATE'),false);
            await p.evaluate(() => {t.config.fail=false;document.querySelector('.btnRefreshCache').click();});
            await p.waitForFunction(() => document.querySelector('.cacheHttpValue').textContent.includes('512'));
        });
        await scenario('a completed clear with unavailable size remains success without a false zero-byte total', async p => {
            await p.evaluate(async () => {await t.controller.cacheManagement.resume();t.config.measurementUnavailable=true;document.querySelector('.btnClearHttpCache').click();});
            await p.waitForFunction(() => !document.querySelector('.btnClearHttpCache').disabled);
            assert.match(await p.locator('.cacheHttpState').textContent(),/清理完成；统计暂不可用/);
            assert.equal(await p.locator('.cacheHttpValue').textContent(),'无法读取');
        });
        await scenario('identity changes are retired before displaying counts; unknown/busy HTTP data is not fabricated as zero', async p => {
            await p.evaluate(async () => {await t.addOwner();t.user(null);t.config.busy=true;await t.controller.cacheManagement.resume();});
            assert.match(await p.locator('.cachePageValue').textContent(), /0 条/);assert.equal(await p.locator('.cacheHttpValue').textContent(),'操作进行中');
            assert.match(await p.locator('.cacheManagementPage').textContent(), /图片解码内存无法准确分项统计/);
        });
        // Exercise actual loader normalization too: Home and the plugin must share one AMD cache owner module.
        const loaderPage = await browser.newPage(), loaderErrors = [];
        loaderPage.on('pageerror', error => loaderErrors.push(error.name));
        try {
            const routes = {'/plugins/mpvplayer/cache-settings.js': input.ui, '/plugins/mpvplayer/cache-management.js': input.controller,
                '/modules/viewmanager/baseview.js': input.base,
                '/plugins/mpvplayer/cache-management.css':fs.readFileSync(path.join(root,'src/electronapp/plugins/mpvplayer/cache-management.css'),'utf8'),
                '/plugins/mpvplayer/enhanced-settings.css':fs.readFileSync(path.join(root,'src/electronapp/plugins/mpvplayer/enhanced-settings.css'),'utf8'),
                '/modules/listview/listview.css':fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/listview/listview.css'),'utf8'),
                '/enhanced/home/home-flow.css':fs.readFileSync(path.join(root,'src/electronapp/enhanced/home/home-flow.css'),'utf8'),
                '/enhanced/page-cache/home-layout-cache.js': input.adapter, '/enhanced/page-cache/page-data-cache.js': input.cache,
                '/modules/emby-apiclient/events.js': input.events};
            const requested = [];
            await loaderPage.route('**/*', route => {
                requested.push(new URL(route.request().url()).pathname);
                const text = routes[new URL(route.request().url()).pathname];
                return text ? route.fulfill({status:200,contentType:new URL(route.request().url()).pathname.endsWith('.css')?'text/css':'application/javascript',body:text}) : route.abort();
            });
            await loaderPage.setContent('<base href="http://synthetic.invalid/">' + input.html);
            await loaderPage.addScriptTag({content:fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/alameda/alameda.js'),'utf8')});
            const result = await loaderPage.evaluate(async alias => {
                require.config({baseUrl:'http://synthetic.invalid/'});
                (0,eval)(alias);
                define('loading',[],()=>({show(){},hide(){}}));
                define('emby-button',[],()=>({})); define('emby-scroller',[],()=>({}));
                define('modules/dom.js',[],()=>({default:{supportsEventListenerOnce:()=>false}}));
                define('modules/layoutmanager.js',[],()=>({default:{tv:false}}));
                define('modules/browser.js',[],()=>({default:{}}));
                define('baseView',['modules/viewmanager/baseview.js'],base=>base.default);
                define('enhanced/home/sheet-probe.js',['css!./home-flow.css'],()=>true);
                window.ipc={invoke:channel=>Promise.resolve(channel==='enhanced-http-cache-status'?{status:'ok',bytes:128}:channel==='enhanced-maintenance-info'?{status:'ok',info:{}}:{status:'unavailable'})};
                const [adapter,CacheView,events] = await new Promise((resolve,reject) => {
                    const timer=setTimeout(()=>reject(Error('AMD loading deadline exceeded')),5000);
                    require(['ete-home-layout-cache','plugins/mpvplayer/cache-management','modules/emby-apiclient/events.js','enhanced/home/sheet-probe.js'],(...loaded)=>{clearTimeout(timer);resolve(loaded);},error=>{clearTimeout(timer);reject(error);});
                });
                const api={isLoggedIn:()=>true,serverId:()=> 'synthetic-server',getCurrentUserId:()=> 'synthetic-user',_identityEpoch:1,getCurrentLocale:()=> 'zh-CN',serverVersion:()=> '4.10.0.40'};
                const owner=adapter.default.create({currentApiClient:()=>api},{enabled:true,ttlMs:10000,maxEntries:2,maxBytes:4096},events.default);
                try {
                    await owner.load({displayMode:'desktop'},()=>Promise.resolve([{Id:'safe'}]));
                    const cacheView=new CacheView(document.querySelector('.view')); cacheView.onResume({});
                    for(let i=0;i<30;i++)await Promise.resolve();
                    const before=document.querySelector('.cachePageValue').textContent, http=document.querySelector('.cacheHttpValue').textContent;
                    const pending=document.createElement('div');pending.className='eteHomeFlowPending';pending.innerHTML='<div class="itemProgressBar">stale</div>';document.body.append(pending);const masked=getComputedStyle(pending.firstChild).visibility;
                    document.querySelector('.btnClearPageCache').click();for(let i=0;i<20;i++)await Promise.resolve();
                    const remaining=adapter.default.management.snapshot().entries;cacheView.destroy();return {before,http,remaining,masked};
                } finally {owner.dispose();}
            }, require('./patch-server-home.cjs').CACHE_ALIAS).catch(error => {throw Error(error.message + '; synthetic requested paths=' + requested.join(','));});
            assert.match(result.before,/1 条/);assert.equal(result.remaining,0);assert.match(result.http,/128 bytes/);assert.equal(result.masked,'hidden');assert.deepEqual(loaderErrors,[]);
            passed.push('actual Alameda loads the independent cache page, its real management dependency and shared Home owner');
        } finally {await loaderPage.close();}
        console.log(JSON.stringify({status:'passed',browser:browser.version(),scenarios:passed.length,passed,
            scope:'real independent cache controller/HTML, native BaseView, layout/cache/events and DOM in Chromium; main session IPC modeled, no Electron or Windows/full GUI acceptance'}));
    } finally {await browser.close();}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={main};
