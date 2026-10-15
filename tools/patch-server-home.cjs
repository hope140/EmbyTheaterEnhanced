'use strict';

function once(text, anchor, replacement) {
    if (text.split(anchor).length !== 2) throw new Error('Server home anchor mismatch.');
    return text.replace(anchor, replacement);
}
function patchHomeTab(text) {
    text = once(text, '"./../modules/emby-apiclient/connectionmanager.js"]',
        '"./../modules/emby-apiclient/connectionmanager.js","ete-server-home"]');
    text = once(text, '_embyItemscontainer,_connectionmanager){', '_embyItemscontainer,_connectionmanager,_eteHome){');
    text = once(text, 'this.sectionsContainer=view.querySelector(".sections"),',
        'this.sectionsContainer=view.querySelector(".sections"),this.eteHome=_eteHome.default.create(this,{legacy:_homesections.default,loading:_loading.default,focus:_focusmanager.default,connection:_connectionmanager.default}),');
    const resumeStart = 'HomeTab.prototype.onResume=function(options){';
    const refreshStart = 'HomeTab.prototype.refresh=function(options){';
    const pauseStart = 'HomeTab.prototype.onPause=function(){';
    function replaceMethod(source, from, to, body) {
        if (source.split(from).length !== 2 || source.split(to).length !== 2) throw new Error('Server home method anchor mismatch.');
        const start = source.indexOf(from), end = source.indexOf(to, start);
        if (end < start) throw new Error('Server home method order mismatch.');
        return source.slice(0, start) + body + source.slice(end);
    }
    text = replaceMethod(text, resumeStart, refreshStart,
        'HomeTab.prototype.onResume=function(options){_basetab.default.prototype.onResume.apply(this,arguments);return this.eteHome.resume(options)},');
    text = replaceMethod(text, refreshStart, pauseStart,
        'HomeTab.prototype.refresh=function(options){return this.eteHome.refresh(options)},');
    text = once(text, 'sectionsContainer&&_homesections.default.pause(sectionsContainer)', 'this.eteHome.pause()');
    text = once(text, 'HomeTab.prototype.destroy=function(){_basetab.default.prototype.destroy.apply(this,arguments)',
        'HomeTab.prototype.destroy=function(){this.eteHome.dispose(),_basetab.default.prototype.destroy.apply(this,arguments)');
    text = once(text, 'sectionsContainer&&(sectionsContainer.innerHTML="")', 'this.eteHome.clear()');
    return text;
}
function patchApp(text) {
    if (text.includes('define("ete-server-home",')) throw new Error('Server home anchor mismatch.');
    return once(text, 'define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),',
        'define("ete-server-home", [], getDynamicImport("./../enhanced/home/home-tab.js")),\n' +
        '      define("baseView", [], getDynamicImport("./modules/viewmanager/baseview.js")),');
}
module.exports = {patchHomeTab, patchApp};
