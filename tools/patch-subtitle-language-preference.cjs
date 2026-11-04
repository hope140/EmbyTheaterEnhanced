'use strict';

function once(source, before, after) {
    if (typeof source !== 'string' || source.split(before).length !== 2) {
        throw new Error('Language preference source contract mismatch.');
    }
    return source.replace(before, after);
}

function patchHtml(source) {
    return once(source, 'class="selectSubtitleLanguage" label=',
        'class="selectSubtitleLanguage" multiple data-reordering="true" data-virtualscroll="false" label=');
}

// Frozen EmbySelect supports multiple values. Its ActionSheet reorder extension
// consumes the opt-in data-reordering attribute on these two controls only.
const preferenceHelper = `function configureLanguagePreference(select,cultures,value){
    var selected=typeof value==="string"&&value?value.split(","):[];
    select.getItems=function(query){
        query=query||{};
        var ids=query.Ids;
        var entries=cultures.map(function(c){return{Name:c.DisplayName,Id:c.TwoLetterISOLanguageName,Type:"GenericListItem"}});
        var order=select.getValues();
        order.forEach(function(id){
            if(!entries.some(function(item){return item.Id===id}))entries.push({Name:id,Id:id,Type:"GenericListItem"});
        });
        if(ids){
            ids=Array.isArray(ids)?ids:ids.split(",");
            entries=ids.map(function(id){
                for(var i=0;i<entries.length;i++)if(entries[i].Id===id)return entries[i];
                return{Name:id,Id:id,Type:"GenericListItem"};
            });
        }else{
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
}function onLanguagePreferenceChange(){this._eteLanguageChanged=true}`;

function patchScript(source) {
    source = once(source, 'function loadForm(context,user,userSettings,appearanceSettings,apiClient){',
        preferenceHelper + 'function loadForm(context,user,userSettings,appearanceSettings,apiClient){');
    const loadStart = 'var html="";html+="<option"+(value?"":" selected")+" value=\'\'>"+_globalize.default.translate("AnyLanguage")+"</option>";';
    const loadEnd = '}(context.querySelector(".selectSubtitleLanguage"),allCultures,user.Configuration.SubtitleLanguagePreference);';
    const start = source.indexOf('!function(select,languages,value){' + loadStart);
    const end = source.indexOf(loadEnd, start);
    if (start < 0 || end < start || source.indexOf(loadEnd, end + loadEnd.length) !== -1) {
        throw new Error('Subtitle language load contract mismatch.');
    }
    source = source.slice(0, start) +
        'configureLanguagePreference(context.querySelector(".selectSubtitleLanguage"),allCultures,user.Configuration.SubtitleLanguagePreference);' +
        source.slice(end + loadEnd.length);
    source = once(source,
        'user.Configuration.SubtitleLanguagePreference=context.querySelector(".selectSubtitleLanguage").value,',
        'context.querySelector(".selectSubtitleLanguage")._eteLanguageChanged&&(user.Configuration.SubtitleLanguagePreference=context.querySelector(".selectSubtitleLanguage").getValues().join(",")),' );
    source = once(source,
        'apiClient.element.querySelector(".selectSubtitlePlaybackMode").addEventListener("change",onSubtitleModeChange)',
        'apiClient.element.querySelector(".selectSubtitleLanguage").addEventListener("change",onLanguagePreferenceChange),apiClient.element.querySelector(".selectSubtitlePlaybackMode").addEventListener("change",onSubtitleModeChange)');
    return source;
}

function patchPlaybackHtml(source) {
    return once(source, 'class="selectAudioLanguage" label=',
        'class="selectAudioLanguage" multiple data-reordering="true" data-virtualscroll="false" label=');
}

function patchPlaybackScript(source) {
    source = once(source, '  function loadForm(context, user, userSettings, apiClient) {',
        preferenceHelper + '  function loadForm(context, user, userSettings, apiClient) {');
    const start = source.indexOf('          var select = context.querySelector(".selectAudioLanguage"),');
    const end = source.indexOf('            (context.querySelector(".chkEpisodeAutoPlay").checked', start);
    if (start < 0 || end < start || source.indexOf('          var select = context.querySelector(".selectAudioLanguage"),', end) !== -1) {
        throw new Error('Audio language load contract mismatch.');
    }
    source = source.slice(0, start) +
        '          configureLanguagePreference(context.querySelector(".selectAudioLanguage"),allCultures,user.Configuration.AudioLanguagePreference),\n' +
        source.slice(end);
    source = once(source,
        '(user.Configuration.AudioLanguagePreference = context.querySelector(".selectAudioLanguage").value),',
        '(context.querySelector(".selectAudioLanguage")._eteLanguageChanged && (user.Configuration.AudioLanguagePreference = context.querySelector(".selectAudioLanguage").getValues().join(","))),');
    source = once(source, 'userId.element.querySelector("form").addEventListener("submit", onSubmit.bind(userId)),',
        'userId.element.querySelector("form").addEventListener("submit", onSubmit.bind(userId)),\n          userId.element.querySelector(".selectAudioLanguage").addEventListener("change", onLanguagePreferenceChange),');
    return source;
}

module.exports = {patchHtml, patchScript, patchPlaybackHtml, patchPlaybackScript};
