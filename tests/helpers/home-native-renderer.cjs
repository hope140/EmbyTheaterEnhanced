'use strict';
const fs=require('node:fs'),path=require('node:path');
function augment(root,input){
 const files={'modules/dom.js':'modules/dom.js','modules/common/textencoding.js':'modules/common/textencoding.js','modules/cardbuilder/cardbuilder.js':'modules/cardbuilder/cardbuilder.js',
 'modules/imageloader/imageloader.js':'modules/imageloader/imageloader.js','modules/indicators/indicators.js':'modules/indicators/indicators.js',
 'modules/common/itemsrefresher.js':'modules/common/itemsrefresher.js','modules/virtual-scroller/virtual-scroller.js':'modules/virtual-scroller/virtual-scroller.js',
 'modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js':'modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js'};
 const result={...input};for(const [id,file]of Object.entries(files))result[id]=fs.readFileSync(path.join(root,'vendor/web-snapshot/www',file),'utf8');
 const movie=require('../../tools/patch-movie-browser.cjs'),search=require('../../tools/patch-search-ui.cjs'),home=require('../../tools/patch-server-home.cjs');
 for(const [id,method]of [['modules/virtual-scroller/virtual-scroller.js','patchVirtualScroller'],['modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js','patchItemsContainer']])result[id]=home[method](search.patchBrowseGuard(movie[method](result[id])));
 result.nativeBabel=fs.readFileSync(path.join(root,'vendor/web-snapshot/www/modules/babelhelpers.js'),'utf8');
 result.nativeCss=['modules/sections.css','modules/layout.css','modules/cardbuilder/card.css','modules/indicators/indicators.css','modules/emby-elements/emby-progressbar/emby-progressbar.css','modules/themes/dark/theme.css','modules/virtual-scroller/virtual-scroller.css','modules/emby-elements/emby-itemscontainer/emby-itemscontainer.css'].map(file=>fs.readFileSync(path.join(root,'vendor/web-snapshot/www',file),'utf8')).join('\n');
 result.nativeSetup='('+install.toString()+')';return result;
}
function install({modules,load,api,connection,input}){
 document.documentElement.classList.add('layout-tv');
 (0,eval)(input.nativeBabel);window.require=()=>Promise.resolve([]);
 const set=(id,value)=>modules.set(id,{default:value});
 set('modules/browser.js',{});set('modules/layoutmanager.js',{tv:true});
 set('modules/common/globalize.js',{getCurrentLocale:()=> 'zh-CN',getCurrentLocales:()=>['zh-CN'],translate:s=>s});
 set('modules/emby-apiclient/connectionmanager.js',{...connection,getApiClient:()=>api,deviceId:()=> 'synthetic-device'});
 set('modules/focusmanager.js',{focus:e=>e?.focus({preventScroll:true}),autoFocus(){},containsActiveElement:e=>e.contains(document.activeElement)});
 set('modules/shortcuts.js',{on(){},off(){},onClick(){},getShortcutAttributes:i=>[{name:'data-id',value:i.Id}],getShortcutAttributesHtml:i=>' data-id="'+i.Id+'"'});
 set('modules/common/inputmanager.js',{trigger:()=>false});set('modules/common/input/api.js',{});
 set('modules/common/itemhelper.js',{getDisplayName:i=>i.Name||'',getItemTypeName:i=>i.Type,getContentTypeName:i=>i.Type,canMarkPlayed:()=>false,canRate:()=>false});
 set('modules/common/playback/playbackmanager.js',{canPlay:()=>true,currentItem:()=>null});
 set('modules/common/datetime.js',{getDisplayTime:d=>new Date(d).toISOString().slice(11,16),getDisplayRunningTime:()=>'',getHumanReadableRuntime:()=>'',toLocaleDateString:()=>'',toLocaleString:()=>''});
 set('modules/skinmanager.js',{getPreferredLogoImageTypes:()=>['Primary']});set('modules/mediainfo/mediainfo.js',{getCommunityRating:()=>'',getCriticRating:()=>''});
 set('modules/itemcontextmenu.js',{supportsContextMenu:()=>false});
 set('modules/emby-elements/userdatabuttons/emby-playstatebutton.js',{getHtml:()=>''});set('modules/emby-elements/userdatabuttons/emby-ratingbutton.js',{getHtml:()=>''});
 set('modules/humanedate/humanedate.js',{});set('modules/lazyloader/lazyloader-intersectionobserver.js',{});
 for(const id of ['modules/emby-elements/emby-checkbox/emby-checkbox.js','modules/emby-elements/emby-button/paper-icon-button-light.js','modules/common/servicelocator.js'])set(id,{});
 class Scroller extends HTMLDivElement{connectedCallback(){this.classList.add('emby-scroller');}addResizeObserver(fn){this.observers ||= new Map();const ro=new ResizeObserver(fn);this.observers.set(fn,ro);ro.observe(this);}removeResizeObserver(fn){this.observers?.get(fn)?.disconnect();this.observers?.delete(fn);}disconnectedCallback(){this.observers?.forEach(ro=>ro.disconnect());}getScrollPosition(){return this.scrollLeft;}scrollToPosition(o){this.scrollLeft=o.position;}}
 customElements.define('emby-scroller',Scroller,{extends:'div'});
 load('modules/emby-elements/emby-itemscontainer/emby-itemscontainer.js');
 modules.set('modules/common/servicelocator.js',{appHost:{supports:()=>false}});
 modules.delete('modules/cardbuilder/cardbuilder.js'); load('modules/cardbuilder/cardbuilder.js');
}
module.exports={augment};
