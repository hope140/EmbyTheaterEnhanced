'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {sources, openTrial} = require('../tests/helpers/home-flow-renderer.cjs');
const {augment} = require('../tests/helpers/home-native-renderer.cjs');

async function main(args = process.argv.slice(2)) {
    if (args.length !== 2 || !args.every(path.isAbsolute)) throw Error('Usage: node tools/check-native-listcontroller-visual.cjs <installed Chromium> <new absolute evidence directory>');
    const root = path.resolve(__dirname, '..'), out = args[1]; fs.mkdirSync(out, {recursive: false});
    const vendor = path.join(root, 'vendor/web-snapshot/www');
    const itemsTemplate = fs.readFileSync(path.join(vendor, 'modules/tabbedview/itemstab.template.html'), 'utf8');
    const extra = {};
    for (const [id, file] of Object.entries({
        'modules/tabbedview/listcontroller.js': 'modules/tabbedview/listcontroller.js',
        'modules/tabbedview/itemstab.js': 'modules/tabbedview/itemstab.js',
        'modules/tabbedview/seriestab.js': 'modules/tabbedview/seriestab.js',
        'modules/tabbedview/videostab.js': 'modules/tabbedview/videostab.js',
        'list/list.js': 'list/list.js'
    })) extra[id] = fs.readFileSync(path.join(vendor, file), 'utf8');
    const browser = await require('playwright').chromium.launch({headless: true, executablePath: args[0]});
    const input = augment(root, {...sources(root), ...extra});
    const page = await openTrial(browser, input, 'sections', {native: true, nativeItems: 3, sectionTypes: ['resume','onnow'], viewport: {width: 1920, height: 1080}});
    const errors = []; page.on('pageerror', e => errors.push(e.stack || e.message));
    try {
        const sourceSha = Object.fromEntries(Object.keys(extra).map(id => [id, require('node:crypto').createHash('sha256').update(extra[id]).digest('hex')]));
        sourceSha['modules/tabbedview/itemstab.template.html'] = require('node:crypto').createHash('sha256').update(itemsTemplate).digest('hex');
        await page.evaluate(async () => {
            const {runtime, api} = trial;
            const baseTab = function BaseTab(view, params) { this.view = view; this.params = params; this.scroller = null; };
            baseTab.prototype.onResume = function () {};
            baseTab.prototype.onPause = function () {};
            baseTab.prototype.destroy = function () {};
            runtime.modules.set('modules/tabbedview/basetab.js', {default: baseTab});
            runtime.modules.set('modules/loading/loading.js', {default: {show(){}, hide(){}}});
            const list = runtime.load('modules/tabbedview/listcontroller.js').default;
            const ItemsTab = runtime.load('modules/tabbedview/itemstab.js').default;
            const SeriesTab = runtime.load('modules/tabbedview/seriestab.js').default;
            const VideosTab = runtime.load('modules/tabbedview/videostab.js').default;
            function BaseView(view, params) { this.view=view; this.params=params; this.scroller=view.querySelector('.scrollFrameY');
                this.supportsViewSettings=false; this.enableTotalRecordCountDisplay=false; this.supportsSorting=()=>false;
                this.configureScrollingForView=()=>{}; this.updateSortText=()=>{}; this.setTitle=()=>{};
                this.getViewSettings=()=>({imageType:'primary',fields:['Name','ProductionYear']}); this.getSortMenuOptions=()=>[];
                this.getSortValues=()=>({sortBy:'SortName',sortOrder:'Ascending'}); this.enableAlphaPicker=()=>false;
                this.getItems=async function(){this.syntheticCalls=(this.syntheticCalls||0)+1;if(this.hold)await new Promise(resolve=>this.release=resolve);return {TotalRecordCount:12,Items:Array.from({length:12},(_,i)=>({Id:'library-'+i,Name:'Library Item '+i,Type:'Movie',MediaType:'Video',ServerId:'synthetic-server',PrimaryImageAspectRatio:16/9,ImageUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#397e69"/><circle cx="160" cy="90" r="35" fill="#d6c078"/></svg>'),UserData:{PlaybackPositionTicks:0}}))};}; }
            BaseView.prototype.onResume=function(){}; BaseView.prototype.onPause=function(){}; BaseView.prototype.destroy=function(){};
            runtime.modules.set('modules/viewmanager/baseview.js',{default:BaseView});
            runtime.modules.set('modules/common/inputmanager.js',{default:{on(){},off(){},trigger(){return false;}}});
            runtime.modules.set('modules/common/usersettings/usersettings.js',{default:{get(){return null;},setFilter(){},getFilter(){return null;}}});
            runtime.modules.set('modules/common/playback/playbackmanager.js',{default:{canQueue(){return false;}}});
            runtime.modules.set('modules/appheader/appheader.js',{default:{setTitle(){}}});
            runtime.modules.set('modules/backdrop/backdrop.js',{default:{clear(){},setBackdrops(){}}});
            runtime.modules.set('modules/search/searchfields.js',{default:function(){}});
            runtime.modules.set('modules/emby-elements/emby-scroller/emby-scroller.js',{default:function(){}});
            runtime.modules.set('modules/emby-elements/emby-tabs/emby-tabs.js',{default:function(){}});
            const ItemsView=runtime.load('list/list.js').default;
            window.listVisual = {list, ItemsTab, SeriesTab, VideosTab, ItemsView, api, runtime};
        });
        const start = await page.evaluate(async () => {
            const view = document.createElement('div'); view.className = 'view scrollFrameY';
            view.style.cssText = 'position:fixed;inset:0;z-index:100000;height:100vh;overflow:auto;padding:24px;background:#101820;color:white';
            view.innerHTML = '<h1>Native Series/Episode list</h1><div class="itemsViewSettingsContainer"></div><div is="emby-scroller" class="padded-top" style="height:680px;overflow:auto"><div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" style="min-height:640px;width:100%" data-virtualscrolllayout="vertical-grid"></div></div>';
            document.body.append(view);
            const {SeriesTab, VideosTab, api} = listVisual;
            const owner = new VideosTab(view, {serverId:'synthetic-server', parentId:'synthetic-parent'}, {itemType:'Episode'});
            owner.supportsAlphaPicker = () => false;
            owner.configureScrollingForView = () => {};
            owner.getViewSettings = () => ({imageType:'primary', fields:['Name','ProductionYear']});
            owner.getContext = () => 'video'; owner.isGlobalQuery = () => false;
            owner.getSortValues = () => ({sortBy:'SortName', sortOrder:'Ascending'});
            owner.getSortMenuOptions = () => [];
            owner.enableAlphaPicker = () => false; owner.supportsPlay = owner.supportsShuffle = owner.supportsQueue = () => false;
            owner.getApiClient = () => api;
            owner.updateSortText = () => {};
            owner.getItems = async function (query) {
                this.syntheticCalls = (this.syntheticCalls || 0) + 1;
                if (this.hold) await new Promise(resolve => this.release = resolve);
                return {TotalRecordCount: 12, Items: Array.from({length:12}, (_,i) => ({Id:'episode-'+i, Name:'Episode '+i, SeriesName:'Synthetic Series', Type:'Episode', MediaType:'Video', ServerId:'synthetic-server', PrimaryImageAspectRatio:16/9, ImageUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#386a83"/><circle cx="160" cy="90" r="35" fill="#cda76d"/></svg>'), UserData:{PlaybackPositionTicks:0}}))};
            };
            owner.initItemsContainer();
            owner.itemsContainer.parentContainer = view;
            window.nativeEpisodeOwner = owner;
            const query = owner.getBaseQuery();
            const cardFields = owner.getCardOptions([], owner.getViewSettings()).fields;
            owner.onResume({refresh:true});
            return {query, cardFields, itemTypes: owner.getItemTypes(), cardOptions: owner.getListOptions([]).options, initAttached: owner.itemsContainer.fetchData instanceof Function && owner.itemsContainer.onDataFetched instanceof Function};
        });
        await page.waitForFunction(() => nativeEpisodeOwner.itemsContainer.querySelectorAll('.card').length >= 8, null, {timeout: 6000}).catch(async error => {
            const state = await page.evaluate(() => {const c=nativeEpisodeOwner.itemsContainer,v=c.virtualScroller;return {calls:nativeEpisodeOwner.syntheticCalls, html:c.outerHTML.slice(0,1200), itemCount:c.items?.length||null, optionKeys:Object.keys(c.currentListOptions||{}), optionShape:c.currentListOptions?.options?.shape, source:v?._itemSource?.length||null, error:c._lastError||null};});
            throw new Error(error.message + ' start='+JSON.stringify(start)+' state=' + JSON.stringify(state));
        });
        await page.waitForTimeout(300);
        const loaded = await page.evaluate(() => ({calls:nativeEpisodeOwner.syntheticCalls, count:nativeEpisodeOwner.itemsContainer.querySelectorAll('.card').length, images:[...nativeEpisodeOwner.itemsContainer.querySelectorAll('img')].filter(x=>x.complete&&x.naturalWidth>0).length, virtual:!!nativeEpisodeOwner.itemsContainer.virtualScroller, tvClass:nativeEpisodeOwner.itemsContainer.classList.contains('itemsContainer-tv')}));
        assert.equal(start.initAttached, true); assert.deepEqual(start.itemTypes, ['Episode']); assert.equal(start.query.ExcludeLocationTypes, 'Virtual');
        assert.ok(loaded.count >= 8 && loaded.virtual && loaded.tvClass, JSON.stringify(loaded));
        await page.screenshot({path:path.join(out,'episode-list-loaded.png')});

        await page.evaluate(() => { nativeEpisodeOwner.onPause(); nativeEpisodeOwner.hold=true; nativeEpisodeOwner.onResume({refresh:true}); });
        await page.waitForFunction(() => nativeEpisodeOwner.syntheticCalls >= 2);
        const pending = await page.evaluate(() => ({calls:nativeEpisodeOwner.syntheticCalls, count:nativeEpisodeOwner.itemsContainer.querySelectorAll('.card').length, virtual:!!nativeEpisodeOwner.itemsContainer.virtualScroller}));
        assert.ok(pending.count >= 8 && pending.virtual, JSON.stringify(pending));
        await page.screenshot({path:path.join(out,'episode-list-refresh-pending.png')});
        await page.evaluate(() => { nativeEpisodeOwner.hold=false; nativeEpisodeOwner.release(); });
        await page.waitForFunction(() => nativeEpisodeOwner.syntheticCalls >= 2);
        await page.waitForTimeout(300);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const refreshed = await page.evaluate(() => ({calls:nativeEpisodeOwner.syntheticCalls, count:nativeEpisodeOwner.itemsContainer.querySelectorAll('.card').length, title:nativeEpisodeOwner.itemsContainer.querySelector('.card .cardText')?.textContent || nativeEpisodeOwner.itemsContainer.querySelector('.card')?.textContent}));
        assert.ok(refreshed.count >= 8, JSON.stringify(refreshed)); assert.deepEqual(errors, []);
        await page.screenshot({path:path.join(out,'episode-list-refreshed.png')});
        const desktopStart = await page.evaluate(template => {
            document.documentElement.classList.remove('layout-tv');
            listVisual.runtime.modules.get('modules/layoutmanager.js').default.tv = false;
            const view = document.createElement('div'); view.className='view';
            view.style.cssText='position:fixed;inset:0;z-index:100001;height:100vh;overflow:auto;display:flex;flex-direction:column;background:#101820;color:white';
            view.innerHTML=template; const listScroller=view.querySelector('.scrollFrameY'), slider=view.querySelector('.scrollSlider'), items=view.querySelector('.itemsContainer');
            listScroller.style.cssText+=';height:88vh;min-height:0;flex:1;width:100vw'; slider.style.cssText+=';width:100%;min-width:100%;flex:0 0 auto'; items.style.cssText+=';width:calc(100vw - 48px);min-width:calc(100vw - 48px)'; document.body.append(view);
            const {VideosTab,api}=listVisual;
            const owner=new VideosTab(view,{serverId:'synthetic-server',parentId:'synthetic-movies'},{itemType:'Movie'});
            owner.supportsAlphaPicker=()=>false; owner.configureScrollingForView=()=>{};
            owner.getViewSettings=()=>({imageType:'primary',fields:['Name','ProductionYear']});
            owner.getContext=()=> 'video'; owner.isGlobalQuery=()=>false; owner.getSortValues=()=>({sortBy:'SortName',sortOrder:'Ascending'}); owner.getSortMenuOptions=()=>[];
            owner.enableAlphaPicker=()=>false; owner.supportsPlay=owner.supportsShuffle=owner.supportsQueue=()=>false; owner.updateSortText=()=>{};
            owner.getItems=async function(){this.syntheticCalls=(this.syntheticCalls||0)+1;if(this.hold)await new Promise(resolve=>this.release=resolve);return {TotalRecordCount:12,Items:Array.from({length:12},(_,i)=>({Id:'movie-'+i,Name:'Synthetic Movie '+i,Type:'Movie',MediaType:'Video',ServerId:'synthetic-server',PrimaryImageAspectRatio:16/9,ImageUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#764c88"/><circle cx="160" cy="90" r="35" fill="#d9b56c"/></svg>'),UserData:{PlaybackPositionTicks:0}}))};};
            owner.initItemsContainer(); owner.itemsContainer.parentContainer=view;
            window.nativeMovieOwner=owner;
            const query=owner.getBaseQuery(); owner.onResume({refresh:true});
            return {query,itemTypes:owner.getItemTypes(),viewFromSnapshot:!!view.querySelector('.itemsViewSettingsContainer'),itemsContainer:owner.itemsContainer.tagName,hasNativeControllerBindings:!!owner.itemsContainer.fetchData&&!!owner.itemsContainer.onDataFetched};
        }, itemsTemplate);
        await page.waitForFunction(()=>nativeMovieOwner.itemsContainer.querySelectorAll('.card').length>=8);
        await page.waitForTimeout(300);
        const desktopLoaded=await page.evaluate(()=>({calls:nativeMovieOwner.syntheticCalls,count:nativeMovieOwner.itemsContainer.querySelectorAll('.card').length,visible:[...nativeMovieOwner.itemsContainer.querySelectorAll('.card')].filter(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight}).length,firstRect:nativeMovieOwner.itemsContainer.querySelector('.card')?.getBoundingClientRect().toJSON(),itemsRect:nativeMovieOwner.itemsContainer.getBoundingClientRect().toJSON(),frameRect:nativeMovieOwner.view.querySelector('.scrollFrameY').getBoundingClientRect().toJSON(),images:[...nativeMovieOwner.itemsContainer.querySelectorAll('img')].filter(x=>x.complete&&x.naturalWidth>0).length,virtual:!!nativeMovieOwner.itemsContainer.virtualScroller,tvClass:nativeMovieOwner.itemsContainer.classList.contains('itemsContainer-tv')}));
        assert.deepEqual(desktopStart.itemTypes,['Movie']); assert.equal(desktopStart.viewFromSnapshot,true); assert.equal(desktopStart.hasNativeControllerBindings,true);
        assert.ok(desktopLoaded.count>=8&&desktopLoaded.visible>0&&desktopLoaded.virtual&&!desktopLoaded.tvClass,JSON.stringify(desktopLoaded));
        await page.screenshot({path:path.join(out,'desktop-movie-list-loaded.png')});
        await page.evaluate(()=>{nativeMovieOwner.onPause();nativeMovieOwner.hold=true;nativeMovieOwner.onResume({refresh:true});});
        await page.waitForFunction(()=>nativeMovieOwner.syntheticCalls>=2);
        const desktopPending=await page.evaluate(()=>({calls:nativeMovieOwner.syntheticCalls,count:nativeMovieOwner.itemsContainer.querySelectorAll('.card').length,virtual:!!nativeMovieOwner.itemsContainer.virtualScroller}));
        assert.ok(desktopPending.count>=8&&desktopPending.virtual,JSON.stringify(desktopPending));
        await page.screenshot({path:path.join(out,'desktop-movie-list-refresh-pending.png')});
        await page.evaluate(()=>{nativeMovieOwner.hold=false;nativeMovieOwner.release();});
        await page.waitForFunction(()=>nativeMovieOwner.syntheticCalls>=2); await page.waitForTimeout(300);
        const desktopRefreshed=await page.evaluate(()=>({calls:nativeMovieOwner.syntheticCalls,count:nativeMovieOwner.itemsContainer.querySelectorAll('.card').length}));
        assert.ok(desktopRefreshed.count>=8,JSON.stringify(desktopRefreshed)); assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(out,'desktop-movie-list-refreshed.png')});
        const genericStart=await page.evaluate(template=>{
            const view=document.createElement('div'); view.className='view'; view.style.cssText='position:fixed;inset:0;z-index:100002;height:100vh;overflow:hidden;display:flex;flex-direction:column;background:#101820;color:white'; view.innerHTML=template;
            const scroller=view.querySelector('.scrollFrameY'),slider=view.querySelector('.scrollSlider'),items=view.querySelector('.itemsContainer'); scroller.style.cssText+=';height:88vh;min-height:0;flex:1;width:100vw';slider.style.cssText+=';width:100%;min-width:100%;flex:0 0 auto';items.style.cssText+=';width:calc(100vw - 48px);min-width:calc(100vw - 48px)';document.body.append(view);
            const owner=new listVisual.ItemsView(view,{type:'Movie',parentId:'synthetic-library',setTitle:false}); owner.supportsAlphaPicker=()=>false; owner.hold=false;
            const query=owner.getBaseQuery(); owner.onResume({refresh:true}); window.nativeGenericListOwner=owner;
            return {query,itemTypes:owner.getItemTypes(),isItemsView:owner instanceof listVisual.ItemsView,hasInitBindings:!!owner.itemsContainer.fetchData&&!!owner.itemsContainer.onDataFetched};
        },itemsTemplate);
        await page.waitForFunction(()=>nativeGenericListOwner.itemsContainer.querySelectorAll('.card').length>=8);
        await page.waitForTimeout(300);
        const genericLoaded=await page.evaluate(()=>({calls:nativeGenericListOwner.syntheticCalls,count:nativeGenericListOwner.itemsContainer.querySelectorAll('.card').length,visible:[...nativeGenericListOwner.itemsContainer.querySelectorAll('.card')].filter(x=>{const r=x.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight}).length,images:[...nativeGenericListOwner.itemsContainer.querySelectorAll('img')].filter(x=>x.complete&&x.naturalWidth>0).length,virtual:!!nativeGenericListOwner.itemsContainer.virtualScroller,tvClass:nativeGenericListOwner.itemsContainer.classList.contains('itemsContainer-tv')}));
        assert.equal(genericStart.isItemsView,true); assert.deepEqual(genericStart.itemTypes,['Movie']); assert.equal(genericStart.hasInitBindings,true); assert.ok(genericLoaded.count>=8&&genericLoaded.visible>0&&genericLoaded.virtual&&!genericLoaded.tvClass,JSON.stringify(genericLoaded));
        await page.screenshot({path:path.join(out,'generic-itemsview-loaded.png')});
        await page.evaluate(()=>{nativeGenericListOwner.onPause();nativeGenericListOwner.hold=true;nativeGenericListOwner.onResume({refresh:true});});
        await page.waitForFunction(()=>nativeGenericListOwner.syntheticCalls>=2);
        const genericPending=await page.evaluate(()=>({calls:nativeGenericListOwner.syntheticCalls,count:nativeGenericListOwner.itemsContainer.querySelectorAll('.card').length,virtual:!!nativeGenericListOwner.itemsContainer.virtualScroller}));
        assert.ok(genericPending.count>=8&&genericPending.virtual,JSON.stringify(genericPending)); await page.screenshot({path:path.join(out,'generic-itemsview-refresh-pending.png')});
        await page.evaluate(()=>{nativeGenericListOwner.hold=false;nativeGenericListOwner.release();}); await page.waitForFunction(()=>nativeGenericListOwner.syntheticCalls>=2); await page.waitForTimeout(300);
        const genericRefreshed=await page.evaluate(()=>({calls:nativeGenericListOwner.syntheticCalls,count:nativeGenericListOwner.itemsContainer.querySelectorAll('.card').length})); assert.ok(genericRefreshed.count>=8,JSON.stringify(genericRefreshed)); assert.deepEqual(errors,[]);
        await page.screenshot({path:path.join(out,'generic-itemsview-refreshed.png')});
        const report = {status:'passed', browser:browser.version(), sourceSha, case:{name:'actual-ItemsTab-VideosTab-Episode-ListController-native-itemscontainer-TV',status:'passed',start,loaded,pending,refreshed}, desktopCase:{name:'actual-ItemsTab-template-VideosTab-Movie-ListController-native-itemscontainer-desktop',status:'passed',start:desktopStart,loaded:desktopLoaded,pending:desktopPending,refreshed:desktopRefreshed}, genericItemsViewCase:{name:'actual-vendored-list-list-js-ItemsView-ListController-native-itemscontainer-desktop',status:'passed',start:genericStart,loaded:genericLoaded,pending:genericPending,refreshed:genericRefreshed}, scope:'Actual vendored list/list.js ItemsView constructor/prototype and onResume/onPause lifecycle, actual ListController.initItemsContainer, actual ItemsTab template, native ItemsContainer/VirtualScroller/CardBuilder; synthetic API/artwork. Also actual VideosTab Episode TV and Movie desktop component cases. No application router/viewmanager, real Emby, Electron or Windows.'};
        fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
        console.log(JSON.stringify({status:'passed',evidence:out,case:report.case.name,scope:report.scope}));
    } finally { await page.close(); await browser.close(); }
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode=1; });
module.exports={main};
