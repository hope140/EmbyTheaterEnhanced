'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const detail=require('./detail-renderer.cjs'),routes=require('./home-route-renderer.cjs');
async function open(browser,root,{legacyAlias=false}={}){
 const input=routes.augment(root,detail.sources(root,true),true);
 input.entryRouting=true;
 for(const file of ['modules/commandprocessor.js'])input[file]=fs.readFileSync(path.join(root,'vendor/web-snapshot/www',file),'utf8');
 const app=fs.readFileSync(path.join(root,'vendor/web-snapshot/www/app.js'),'utf8');
 input.itemRoute=app.slice(app.indexOf('appRouter.addRoute({\n                  contentPath: "/item/item.html",'),app.indexOf('appRouter.addRoute({\n                  contentPath: "/item/item.html",')+550).split('}),')[0]+'})';
 if(legacyAlias){
  const previous={exports:{}};new Function('module','exports',cp.execFileSync('git',['show','1ca9aecaabbd66520dbecf8db8c41c721c1b7744:tools/patch-server-home.cjs'],{cwd:root,encoding:'utf8'}))(previous,previous.exports);
  input.detailAlias=previous.exports.patchApp(app).split('\n').find(line=>line.includes('define("ete-detail-page-cache",')).trim().replace(/,$/,';');
 }
 const page=await detail.open(browser,root,true,{input});
 await page.evaluate(async()=>{
  const {input,modules,load}=trial.runtime,t=detail,amdDefine=window.define,amdRequire=window.require;
  const nativeLoad=id=>{try{return load(id);}finally{window.define=amdDefine;window.require=amdRequire;}};
  const set=(id,value)=>modules.set(id,{default:value}),get=id=>modules.get(id)?.default;
  const e=t.entry={errors:[],loads:[],requests:[],clicks:[]};
  const detailUrl=t.api.getUrl;t.api.getUrl=(route,query)=>route.includes('/HomeSections')||route.includes('/Sections/')?{route,query}:detailUrl(route,query);
  const detailItem=t.item;t.item=()=>({...detailItem(),Id:e.selectedItem||'synthetic-item'});
  addEventListener('unhandledrejection',event=>{e.errors.push(String(event.reason?.stack||event.reason));event.preventDefault();});
  addEventListener('error',event=>{e.errors.push(String(event.error?.stack||event.message));});
  get('modules/common/inputmanager.js').on=()=>{};get('modules/common/inputmanager.js').off=()=>{};
  set('modules/backdrop/backdrop.js',{clear(){},setBackdrop(){}});
  set('modules/common/usersettings/usersettings.js',{get:()=>null,enableBackdrops:()=>false,enableHomescreenFocusPreviews:()=>false});
  set('modules/appheader/appheader.js',{setTitle(){},hasFocus:()=>false});
  set('modules/emby-elements/emby-tabs/emby-tabs.js',{});
  const scroller=customElements.get('emby-scroller').prototype;for(const name of ['setHeaderBindingEnabled','beginResume','resume','pause'])scroller[name]=function(){};
  set('modules/maintabsmanager.js',{focus:()=>false,setTabVisible(){},setTabs(view,index,getTabs,getContainers,onChange,initial){getContainers().forEach((c,i)=>c.classList.toggle('hide',i!==index));if(initial)Promise.resolve().then(()=>onChange({detail:{selectedTabIndex:index,previousIndex:null}}));}});
  set('modules/loading/loading.js',{show(){},hide(){}});
  modules.set('ete-server-home',nativeLoad('enhanced/home/home-tab.js').default);
  set('modules/homesections/homesections.js',{loadSections:()=>Promise.resolve()});
  window.__etePageCacheTestOptions=Object.freeze({enabled:false,ttlMs:10000,maxEntries:2,maxBytes:1048576,homeFlow:'retain'});
  const HomeTab=nativeLoad('home/hometab.js').default,resumeHome=HomeTab.prototype.onResume;HomeTab.prototype.onResume=function(...args){return e.homePending=resumeHome.apply(this,args);};
  const home= nativeLoad('home/home.js').default;
  function Favorites(view,params){nativeLoad('modules/tabbedview/basetab.js').default.call(this,view,params);}Favorites.prototype=Object.create(nativeLoad('modules/tabbedview/basetab.js').default.prototype);
  window.Emby={importModule(url){e.loads.push(url);if(url==='./home/home.js')return Promise.resolve(home);if(url==='./home/favorites.js')return Promise.resolve(Favorites);return Promise.resolve(nativeLoad(url.replace(/^\.\//,'')).default);}};
  // Text transport is controlled, while controller dependencies retain real Alameda resolution.
  const requireRoute=ids=>{e.requests.push(...ids);if(ids[0]?.startsWith('text!')){const key=ids[0].slice(5).replace(/^\//,'').split('?')[0];return Promise.resolve([key==='home.html'?input['home/home.html']:input[key]]);}return amdRequire(ids);};
  const globalize=get('modules/common/globalize.js');
  const init=new Function('_viewmanager','_globalize','Emby','require','console','AbortController','_layoutmanager','_usersettings','_itemhelper',
   'var currentViewLoadRequest=null,baseRoute="",isDummyBackToHome=false,eteRouteEpoch=0;'+input.routerFunctions+';return {init:function(ctx,route){initRoute(ctx,route,++eteRouteEpoch);},url:getRouteUrl};')({default:t.manager},{default:globalize},Emby,requireRoute,console,AbortController,modules.get('modules/layoutmanager.js'),modules.get('modules/common/usersettings/usersettings.js'),modules.get('modules/common/itemhelper.js'));
  const configured=new Function('appRouter','return '+input.itemRoute)({addRoute:route=>route});e.itemRoute=configured;
  for(const name of ['loadView','tryRestoreView']){const original=t.manager[name];t.manager[name]=function(...args){const promise=original.apply(this,args);e.lastViewPromise=promise;return promise;};}
  const router=get('modules/approuter.js');router.getRouteUrl=init.url;
  router.showItem=(item,options)=>{const url=init.url(item,options);e.selectedItem=item.Id;e.clicks.push({id:item.Id,type:item.Type,url});history.pushState({},'',url);const parsed=new URL(url,location.href);init.init({path:parsed.pathname+parsed.search,querystring:parsed.search.slice(1),isBack:false,state:{}},configured);return Promise.resolve();};
  // CardBuilder/ItemsContainer use the same live shortcut object. Install the real
  // shortcut and commandprocessor implementations before creating Home cards.
  const oldShortcuts=get('modules/shortcuts.js');modules.delete('modules/commandprocessor.js');nativeLoad('modules/commandprocessor.js');modules.delete('modules/shortcuts.js');Object.assign(oldShortcuts,nativeLoad('modules/shortcuts.js').default);set('modules/shortcuts.js',oldShortcuts);
  const onClick=oldShortcuts.onClick;oldShortcuts.onClick=function(event){e.shortcutClicks=(e.shortcutClicks||0)+1;return onClick.call(this,event);};
  e.home=async()=>{history.pushState({},'','/home.html');init.init({path:'/home.html',querystring:'',isBack:false,state:{}},{path:'home.html',controller:'home/home.js',controllerType:'module',type:'home'});for(let attempt=0;attempt<200;attempt++){await new Promise(resolve=>setTimeout(resolve,0));if(t.manager.currentViewInfo()?.url==='/home.html'){await e.homePending;return;}}throw Error('Synthetic Home route did not settle');};
  e.inspect=()=>{const view=t.manager.currentView();if(view?.controller?.eteDetail){t.view=view;t.owner=view.controller;}return {url:location.pathname+location.search,current:t.manager.currentViewInfo()?.url,homeVisible:!!document.querySelector('.page[data-type="home"]:not(.hide)'),detail:view?.controller?.eteDetail?t.inspect():null,errors:e.errors,requests:e.requests,clicks:e.clicks};};
  await e.home();
 });
 return page;
}
module.exports={open};
