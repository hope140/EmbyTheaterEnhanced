'use strict';

function once(source, before, after) {
    if (typeof source !== 'string' || source.split(before).length !== 2) {
        throw new Error('Subtitle language source contract mismatch.');
    }
    return source.replace(before, after);
}

function patchHtml(source) {
    source = once(source, 'class="selectSubtitleLanguage" label=',
        'class="selectSubtitleLanguage" multiple label=');
    return once(source, 'class="selectSubtitleLanguage" multiple label="${LabelPreferredSubtitleLanguage}"></select>\r\n                </div>',
        'class="selectSubtitleLanguage" multiple label="${LabelPreferredSubtitleLanguage}"></select>\r\n                </div>\r\n                <div class="ete-language-order" role="list" aria-label="${LabelPreferredSubtitleLanguage}"></div>');
}

// The frozen Emby ActionSheet supports multiple values but predates its reorder
// control. Keep the selected order visible and movable with native focusable buttons.
const orderHelper = `function configureLanguagePreference(select,orderList,cultures,value){
    var selected=typeof value==="string"&&value?value.split(","):[];
    select._eteOrderList=orderList;
    select._eteCultures=cultures;
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
    renderLanguageOrder(select);
}function renderLanguageOrder(select){
    var list=select._eteOrderList,values=select.getValues(),cultures=select._eteCultures||[];
    list.textContent="";
    list.classList.toggle("hide",!values.length);
    values.forEach(function(value,index){
        var culture=cultures.find(function(item){return item.TwoLetterISOLanguageName===value});
        var name=culture?culture.DisplayName:value;
        var row=document.createElement("div");
        row.classList.add("ete-language-order-row","flex","align-items-center");
        row.style.gap=".5em";
        row.setAttribute("role","listitem");
        var label=document.createElement("span");
        label.textContent=(index+1)+". "+name;
        label.style.flex="1";
        row.appendChild(label);
        [-1,1].forEach(function(direction){
            var button=document.createElement("button",{is:"emby-button"});
            button.type="button";
            button.classList.add("button-link",direction<0?"ete-move-up":"ete-move-down");
            var action=_globalize.default.translate(direction<0?"Up":"Down");
            button.textContent=action;
            button.setAttribute("aria-label",action+": "+name);
            button.disabled=direction<0?index===0:index===values.length-1;
            button.addEventListener("click",function(){
                var next=select.getValues().slice(),target=index+direction;
                if(target<0||target>=next.length||next[index]!==value)return;
                next[index]=next[target];next[target]=value;
                select.setValues(next,true);
                var rows=list.querySelectorAll(".ete-language-order-row");
                var focus=rows[target].querySelector(direction<0?".ete-move-up":".ete-move-down");
                if(focus.disabled)focus=rows[target].querySelector(direction<0?".ete-move-down":".ete-move-up");
                focus.focus();
            });
            row.appendChild(button);
        });
        list.appendChild(row);
    });
}function onLanguagePreferenceChange(){
    this._eteLanguageChanged=true;
    renderLanguageOrder(this);
}`;

function patchScript(source) {
    // The current Emby web client uses this same configuration field and joins
    // ordered culture codes with a comma. The older ETE select already supports
    // multiple values; only this page still flattened them to one value.
    source = once(source, 'function loadForm(context,user,userSettings,appearanceSettings,apiClient){',
        orderHelper + 'function loadForm(context,user,userSettings,appearanceSettings,apiClient){');
    const loadStart = 'var html="";html+="<option"+(value?"":" selected")+" value=\'\'>"+_globalize.default.translate("AnyLanguage")+"</option>";';
    const loadEnd = '}(context.querySelector(".selectSubtitleLanguage"),allCultures,user.Configuration.SubtitleLanguagePreference);';
    const start = source.indexOf('!function(select,languages,value){' + loadStart);
    const end = source.indexOf(loadEnd, start);
    if (start < 0 || end < start || source.indexOf(loadEnd, end + loadEnd.length) !== -1) {
        throw new Error('Subtitle language load contract mismatch.');
    }
    source = source.slice(0, start) +
        'configureLanguagePreference(context.querySelector(".selectSubtitleLanguage"),context.querySelector(".ete-language-order"),allCultures,user.Configuration.SubtitleLanguagePreference);' +
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
    source = once(source, 'class="selectAudioLanguage" label=',
        'class="selectAudioLanguage" multiple label=');
    return once(source, 'class="selectAudioLanguage" multiple label="${LabelAudioLanguagePreference}"></select>\r\n                </div>',
        'class="selectAudioLanguage" multiple label="${LabelAudioLanguagePreference}"></select>\r\n                </div>\r\n                <div class="ete-language-order" role="list" aria-label="${LabelAudioLanguagePreference}"></div>');
}

function patchPlaybackScript(source) {
    source = once(source, '  function loadForm(context, user, userSettings, apiClient) {',
        orderHelper + '  function loadForm(context, user, userSettings, apiClient) {');
    const start = source.indexOf('          var select = context.querySelector(".selectAudioLanguage"),');
    const end = source.indexOf('            (context.querySelector(".chkEpisodeAutoPlay").checked', start);
    if (start < 0 || end < start || source.indexOf('          var select = context.querySelector(".selectAudioLanguage"),', end) !== -1) {
        throw new Error('Audio language load contract mismatch.');
    }
    source = source.slice(0, start) +
        '          configureLanguagePreference(context.querySelector(".selectAudioLanguage"),context.querySelector(".ete-language-order"),allCultures,user.Configuration.AudioLanguagePreference),\n' +
        source.slice(end);
    source = once(source,
        '(user.Configuration.AudioLanguagePreference = context.querySelector(".selectAudioLanguage").value),',
        '(context.querySelector(".selectAudioLanguage")._eteLanguageChanged && (user.Configuration.AudioLanguagePreference = context.querySelector(".selectAudioLanguage").getValues().join(","))),');
    source = once(source, 'userId.element.querySelector("form").addEventListener("submit", onSubmit.bind(userId)),',
        'userId.element.querySelector("form").addEventListener("submit", onSubmit.bind(userId)),\n          userId.element.querySelector(".selectAudioLanguage").addEventListener("change", onLanguagePreferenceChange),');
    return source;
}

module.exports = {patchHtml, patchScript, patchPlaybackHtml, patchPlaybackScript};
