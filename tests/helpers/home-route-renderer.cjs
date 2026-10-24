'use strict';
const fs=require('node:fs'),path=require('node:path');
function extract(text,prefix){const start=text.indexOf(prefix);if(start<0)throw Error('Missing route anchor');const open=text.indexOf('{',start);let depth=0,quote=null,escape=false;for(let i=open;i<text.length;i++){const c=text[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;}else if(c==='"'||c==="'"||c==='`')quote=c;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return text.slice(start,i+1);}throw Error('Unclosed route function');}
function augment(root,input,candidate=false){
 const result={...input};const home=require('../../tools/patch-server-home.cjs'),plugin=require('../../tools/patch-plugin-settings.cjs');
 for(const file of ['modules/viewmanager/baseview.js','modules/tabbedview/tabbedview.js','modules/tabbedview/basetab.js','home/home.js','home/home.html','settings/settings.js','settings/settings.html','modules/navdrawer/navdrawercontent.js','modules/listview/listview.js','modules/shortcuts.js','modules/common/pluginmanager.js'])result[file]=fs.readFileSync(path.join(root,'vendor/web-snapshot/www',file),'utf8');
 result['home/hometab.js']=home.patchHomeTab(fs.readFileSync(path.join(root,'vendor/web-snapshot/www/home/hometab.js'),'utf8'));
 let manager=plugin.patchViewManager(fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/viewmanager/viewmanager.js'),'utf8'));
 let router=plugin.patchRouter(fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/approuter.js'),'utf8'));
 if(candidate){manager=home.patchViewManager(manager);router=home.patchRouter(router);result['home/home.js']=home.patchHomeView(result['home/home.js']);}
 result['modules/viewmanager/viewmanager.js']=manager;
 result.routerFunctions=extract(router,'function loadContentUrl(ctx, request, signal)')+'\n'+extract(router,'function initRoute(ctx, route, routeEpoch)');
 result.pluginRoot=fs.readFileSync(path.join(root,'src/electronapp/plugins/libmpv.js'),'utf8');
 for(const file of ['cache-management.js','cache-management.html','cache-management.css','cache-settings.js','about.js','about.html','enhanced-settings.css'])result['plugins/mpvplayer/'+file]=fs.readFileSync(path.join(root,'src/electronapp/plugins/mpvplayer',file),'utf8');
 result.routeSetup='('+install.toString()+')';return result;
}
function install(trial){
 const {load,modules,input,view}=trial.runtime;trial.controller.dispose();view.remove();document.body.insertAdjacentHTML('beforeend','<div class="backgroundContainer"></div>');
 const set=(id,value)=>modules.set(id,{default:value});
 const dom=load('modules/dom.js').default;dom.supportsEventListenerOnce=()=>false; // Same no-animation boundary for control and candidate.
 const inputManager=modules.get('modules/common/inputmanager.js').default;inputManager.on=()=>{};inputManager.off=()=>{};
 set('modules/backdrop/backdrop.js',{clear(){},setBackdrop(){}});
 set('modules/common/usersettings/usersettings.js',{get:()=>null,enableBackdrops:()=>false,enableHomescreenFocusPreviews:()=>false});
 set('modules/appheader/appheader.js',{setTitle(){},hasFocus:()=>false});
 set('modules/emby-elements/emby-tabs/emby-tabs.js',{});
 const Scroller=customElements.get('emby-scroller').prototype;for(const name of ['setHeaderBindingEnabled','beginResume','resume','pause'])Scroller[name]=function(){};
 const globalize=modules.get('modules/common/globalize.js').default;globalize.translateDocument=s=>s;globalize.translateHtml=s=>s;
 const focus=modules.get('modules/focusmanager.js').default;focus.isCurrentlyFocusable=e=>!!e?.getClientRects().length&&!e.closest('[inert]');
 set('modules/maintabsmanager.js',{focus:()=>false,setTabVisible(){},setTabs(view,index,getTabs,getContainers,onChange,initial){getContainers().forEach((c,i)=>c.classList.toggle('hide',i!==index));if(initial)Promise.resolve().then(()=>onChange({detail:{selectedTabIndex:index,previousIndex:null}}));}});
 const loading={show(){document.body.dataset.loading='true';},hide(){document.body.dataset.loading='false';}};set('modules/loading/loading.js',loading);
 modules.set('ete-server-home',load('enhanced/home/home-tab.js').default);
 set('modules/homesections/homesections.js',{loadSections:()=>Promise.resolve()});
 const route={created:0,destroyed:0,homes:[],tabs:[],promises:[]};trial.route=route;
 window.__etePageCacheTestOptions=Object.freeze({enabled:false,ttlMs:10000,maxEntries:2,maxBytes:1048576,homeFlow:trial.runtime.mode});
 const HomeTab=load('home/hometab.js').default,originalResume=HomeTab.prototype.onResume;
 HomeTab.prototype.onResume=function(...args){const work=originalResume.apply(this,args);route.homePending=work;route.tabs.push(this);return work;};
 const ActualHome=load('home/home.js').default;
 function Home(view,params){route.created++;ActualHome.call(this,view,params);route.homes.push(this);view.addEventListener('viewdestroy',()=>route.destroyed++);}
 Home.prototype=Object.create(ActualHome.prototype);Home.prototype.constructor=Home;
 // BaseView and the native home / tab controllers own all resume/pause/destroy callbacks.
 const Base=load('modules/viewmanager/baseview.js').default;
 function Settings(view,params){Base.call(this,view,params);}Settings.prototype=Object.create(Base.prototype);Settings.prototype.constructor=Settings;
 function Favorites(view,params){load('modules/tabbedview/basetab.js').default.call(this,view,params);}Favorites.prototype=Object.create(load('modules/tabbedview/basetab.js').default.prototype);Favorites.prototype.constructor=Favorites;
 window.Emby={importModule(url){url=url.replace(/^\.\//,'').replace('file:///synthetic/runtime/electronapp/','');if(url==='home/home.js')return Promise.resolve(Home);if(url==='home/hometab.js')return Promise.resolve(HomeTab);if(url==='home/favorites.js')return Promise.resolve(Favorites);if(url==='settings/settings.js')return Promise.resolve(load(url).default);if(url.startsWith('settings/'))return Promise.resolve(Settings);return Promise.resolve(load(url).default);}};
 modules.delete('modules/common/pluginmanager.js');
 const pluginManager=load('modules/common/pluginmanager.js').default, plugin={id:'libmpvmediaplayer',baseUrl:'file:///synthetic/runtime/electronapp/plugins'};
 const routeStart=input.pluginRoot.indexOf('self.getRoutes = function () {')+'self.getRoutes = '.length,routeEnd=input.pluginRoot.indexOf('        self.getTranslations',routeStart);
 const pluginRoutes=new Function('self','pluginManager','return ('+input.pluginRoot.slice(routeStart,routeEnd).trim().replace(/;$/,'')+');')(plugin,pluginManager)().map(r=>({...r,path:pluginManager.mapRoute(plugin,r)}));
 route.pluginRoutes=pluginRoutes;
 set('modules/querystring/querystring.js',{parse:s=>Object.fromEntries(new URLSearchParams(s))});
 document.body.insertAdjacentHTML('beforeend','<div class="mainAnimatedPages"></div>');
 window.require=(ids,callback)=>{const values=ids.map(id=>{if(id.startsWith('css!'))return{};if(id.startsWith('text!')){const p=id.slice(5).replace(/^\//,'').split('?')[0];if(p==='home.html')return input['home/home.html'];if(p==='settings/settings.html')return input[p];if(p.startsWith('plugins/libmpvmediaplayer/'))return input[p.replace('plugins/libmpvmediaplayer/','plugins/')];return '<div class="view" data-name="settings"><p>Controlled settings route</p></div>';}return load(id.replace('file:///synthetic/runtime/electronapp/',''));});const result=Promise.resolve(values);if(callback)result.then(v=>callback(...v));return result;};
 const manager=load('modules/viewmanager/viewmanager.js').default;route.manager=manager;
 for(const method of ['loadView','tryRestoreView']){const original=manager[method];manager[method]=function(...args){const work=original.apply(this,args);route.promises.push(work);work.catch(()=>{});return work;};}
 const createRouter=new Function('_viewmanager','_globalize','Emby','require','console','AbortController',
  'var currentViewLoadRequest=null,baseRoute="",isDummyBackToHome=false,eteRouteEpoch=0;'+input.routerFunctions+';return function(ctx,route){initRoute(ctx,route,++eteRouteEpoch);};');
 const init=createRouter({default:manager},{default:globalize},Emby,window.require,console,AbortController);
 route.navigate=async function(name,isBack=false){const configured=pluginRoutes.find(r=>r.path===name),target=configured?name:name==='home'?'/home.html?tab=home':'/settings/'+name+'.html',start=route.promises.length;
  init({path:target,querystring:name==='home'?'tab=home':'',isBack,state:{}},configured||{path:name==='home'?'home.html':'settings/'+name+'.html',controller:name==='home'?'home/home.js':'settings/'+name+'.js',controllerType:'module',type:name==='home'?'home':'settings'});
  for(let attempts=0;attempts<200;attempts++){await Promise.resolve();if(route.promises.length>start){await Promise.allSettled(route.promises.slice(start));if(manager.currentViewInfo()?.url===target)return manager.currentView();}await new Promise(r=>setTimeout(r,0));}throw Error('Controlled route did not settle');};
 const user=()=>({Id:trial.api.getCurrentUserId(),ServerId:trial.api.serverId(),Name:'Synthetic user',Policy:{IsAdministrator:false,EnableUserPreferenceAccess:true,RestrictedFeatures:[]}});trial.api.getCurrentUser=()=>Promise.resolve(user());trial.api.getUser=()=>Promise.resolve(user());
 const oldShortcuts=modules.get('modules/shortcuts.js').default;modules.delete('modules/shortcuts.js');set('modules/commandprocessor.js',{executeCommand(){throw Error('Media command forbidden in settings probe');}});Object.assign(oldShortcuts,load('modules/shortcuts.js').default);set('modules/shortcuts.js',oldShortcuts);
 modules.set('baseView',Base);modules.set('loading',loading);modules.set('emby-button',{});modules.set('emby-scroller',{});
 modules.set('modules/common/servicelocator.js',{appHost:{supports:()=>false,appName:()=> 'ETE test',appVersion:()=> '0.4.0'}});
 set('modules/emby-elements/emby-collapse/emby-collapse.js',{});modules.delete('modules/listview/listview.js');load('modules/listview/listview.js');
 set('modules/approuter.js',{getRoutes:()=>pluginRoutes,getRouteInfo:()=>null,getRouteUrl:t=>'/'+t,validateUserAccessToRoute:()=>true,show:target=>{route.clickedNavigation=route.navigate(target);return route.clickedNavigation;}});
 window.ipc={invoke:channel=>{route.ipcCalls||=[];route.ipcCalls.push(channel);return Promise.resolve(channel.endsWith('clear')?{status:'cleared',bytes:3}:channel==='enhanced-http-cache-status'?{status:'ok',bytes:128}:{status:'unavailable'});}};
 route.settleHome=async()=>{for(let i=0;i<30;i++)await Promise.resolve();await route.homePending;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
 route.homeTab=()=>manager.currentView()?.controller?.tabControllers?.[0];
 route.tab=async function(index){const home=manager.currentView().controller,previous=home.currentTabIndex;home.onTabChangeFn({detail:{selectedTabIndex:index,previousIndex:previous}});for(let i=0;i<30;i++)await Promise.resolve();if(index===0)await route.settleHome();};
 route.state=()=>({created:route.created,destroyed:route.destroyed,pages:document.querySelectorAll('.mainAnimatedPages>.page').length,liveTabOwners:route.homes.filter(h=>h.tabControllers?.[0]?.eteHome).length,current:manager.currentViewInfo()?.url,stage:route.homeTab()?.sectionsContainer?.firstChild?.getAttribute('data-ete-home-source'),cards:manager.currentView()?.querySelectorAll('.itemsContainer .card').length||0,skeletons:manager.currentView()?.querySelectorAll('.homeFlowPlaceholder:not(.hide)').length||0});
}
module.exports={augment};
