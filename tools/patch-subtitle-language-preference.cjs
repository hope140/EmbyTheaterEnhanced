'use strict';

function once(source, before, after) {
    if (typeof source !== 'string' || source.split(before).length !== 2) {
        throw new Error('Subtitle language source contract mismatch.');
    }
    return source.replace(before, after);
}

function patchHtml(source) {
    return once(source, 'class="selectSubtitleLanguage" label=',
        'class="selectSubtitleLanguage" multiple label=');
}

function patchScript(source) {
    // The current Emby web client uses this same configuration field and joins
    // ordered culture codes with a comma. The older ETE select already supports
    // multiple values; only this page still flattened them to one value.
    const helper = `function configureSubtitleLanguages(select,cultures,value){
    var selected=typeof value==="string"&&value?value.split(","):[];
    select.getItems=function(query){
        query=query||{};
        var ids=query.Ids;
        var entries=cultures.map(function(c){return{Name:c.DisplayName,Id:c.TwoLetterISOLanguageName,Type:"GenericListItem"}});
        if(ids){
            ids=Array.isArray(ids)?ids:ids.split(",");
            entries=ids.map(function(id){
                for(var i=0;i<entries.length;i++)if(entries[i].Id===id)return entries[i];
                return{Name:id,Id:id,Type:"GenericListItem"};
            });
        }else{
            var order=select.getValues();
            entries.sort(function(a,b){
                var ai=order.indexOf(a.Id),bi=order.indexOf(b.Id);
                return(ai<0?order.length:ai)-(bi<0?order.length:bi);
            });
        }
        var total=entries.length,start=query.StartIndex||0;
        entries=entries.slice(start);
        if(query.Limit!=null)entries=entries.slice(0,query.Limit);
        return Promise.resolve({TotalRecordCount:total,Items:entries});
    };
    select.values=selected;
    select._eteLanguageChanged=false;
}function onSubtitleLanguageChange(){this._eteLanguageChanged=true}`;
    source = once(source, 'function loadForm(context,user,userSettings,appearanceSettings,apiClient){',
        helper + 'function loadForm(context,user,userSettings,appearanceSettings,apiClient){');
    const loadStart = 'var html="";html+="<option"+(value?"":" selected")+" value=\'\'>"+_globalize.default.translate("AnyLanguage")+"</option>";';
    const loadEnd = '}(context.querySelector(".selectSubtitleLanguage"),allCultures,user.Configuration.SubtitleLanguagePreference);';
    const start = source.indexOf('!function(select,languages,value){' + loadStart);
    const end = source.indexOf(loadEnd, start);
    if (start < 0 || end < start || source.indexOf(loadEnd, end + loadEnd.length) !== -1) {
        throw new Error('Subtitle language load contract mismatch.');
    }
    source = source.slice(0, start) +
        'configureSubtitleLanguages(context.querySelector(".selectSubtitleLanguage"),allCultures,user.Configuration.SubtitleLanguagePreference);' +
        source.slice(end + loadEnd.length);
    source = once(source,
        'user.Configuration.SubtitleLanguagePreference=context.querySelector(".selectSubtitleLanguage").value,',
        'context.querySelector(".selectSubtitleLanguage")._eteLanguageChanged&&(user.Configuration.SubtitleLanguagePreference=context.querySelector(".selectSubtitleLanguage").getValues().join(",")),' );
    source = once(source,
        'apiClient.element.querySelector(".selectSubtitlePlaybackMode").addEventListener("change",onSubtitleModeChange)',
        'apiClient.element.querySelector(".selectSubtitleLanguage").addEventListener("change",onSubtitleLanguageChange),apiClient.element.querySelector(".selectSubtitlePlaybackMode").addEventListener("change",onSubtitleModeChange)');
    return source;
}

module.exports = {patchHtml, patchScript};
