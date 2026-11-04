'use strict';

function once(source, before, after) {
    if (typeof source !== 'string' || source.split(before).length !== 2) {
        throw new Error('ActionSheet reordering source contract mismatch.');
    }
    return source.replace(before, after);
}

function patchSelect(source) {
    return once(source,
        'labelElem.hasItemAsideIcon="true"===select.getAttribute("data-hasitemicon"),_actionsheet.default.show(labelElem)',
        'labelElem.hasItemAsideIcon="true"===select.getAttribute("data-hasitemicon"),labelElem.enableReordering="true"===select.getAttribute("data-reordering")&&labelElem.multiple,_actionsheet.default.show(labelElem)');
}

const helper = `function eteReorderItems(options,query){
    return options._eteGetItems({}).then(function(result){
        var order=options.selectedValuesClone||options.selectedValues||[];
        var items=result.Items.slice(0).map(function(item,index){return{item:item,index:index}});
        items.sort(function(a,b){
            var ai=order.indexOf(a.item.Id),bi=order.indexOf(b.item.Id);
            if(ai<0)ai=order.length;if(bi<0)bi=order.length;
            return ai-bi||a.index-b.index;
        });
        var start=query.StartIndex||0,limit=query.Limit;
        return{Items:items.slice(start,limit==null?undefined:start+limit).map(function(entry){return entry.item}),TotalRecordCount:items.length};
    });
}function eteMoveSelection(options,itemsContainer,id,newIndex,direction){
    var values=options.selectedValuesClone,oldIndex=values.indexOf(id);
    if(oldIndex<0||newIndex<0||newIndex>=values.length||newIndex===oldIndex)return;
    values.splice(oldIndex,1);values.splice(newIndex,0,id);
    options._eteReorderVersion=(options._eteReorderVersion||0)+1;
    options._eteReorderFocus=direction?{id:id,direction:direction}:null;
    itemsContainer.refreshItems();
}function eteSyncDrop(options,itemsContainer){
    var rows=itemsContainer.querySelectorAll(".ete-reorder-selected"),ids=[];
    for(var i=0;i<rows.length;i++)ids.push(rows[i].getAttribute("data-ete-reorder-id"));
    if(ids.length!==options.selectedValuesClone.length)return;
    options.selectedValuesClone=ids;
    options._eteReorderVersion=(options._eteReorderVersion||0)+1;
    itemsContainer.refreshItems();
}function eteDecorateReorderRow(options,itemsContainer,row,item){
    var selected=options.selectedValuesClone;
    if(!item)return;
    var chosen=selected.indexOf(item.Id)>=0,version=options._eteReorderVersion||0;
    var previous=row.querySelector(".ete-reorder-controls");
    var handle=row.querySelector(".listViewDragHandle");
    if(row.getAttribute("data-ete-reorder-id")===item.Id&&row._eteReorderVersion===version&&
       row.classList.contains("ete-reorder-selected")===chosen&&row.hasAttribute("draggable")===chosen&&
       !!previous===chosen&&(!handle||handle.classList.contains("hide")===!chosen))return;
    if(previous)previous.remove();
    row._eteReorderVersion=version;
    row.setAttribute("data-ete-reorder-id",item.Id);
    if(!chosen){
        row.removeAttribute("draggable");
        row.classList.remove("drop-target","ordered-drop-target-y","ete-reorder-selected");
        if(handle)handle.classList.add("hide");
        return;
    }
    row.setAttribute("draggable","true");
    row.classList.add("drop-target","ordered-drop-target-y","ete-reorder-selected");
    if(handle)handle.classList.remove("hide");
        var controls=document.createElement("span");controls.classList.add("ete-reorder-controls");
        [-1,1].forEach(function(direction){
            var button=document.createElement("button",{is:"emby-button"});
            button.type="button";
            button.classList.add("ete-reorder-button",direction<0?"ete-reorder-up":"ete-reorder-down","paper-icon-button-light","md-icon");
            button.textContent=direction<0?"\\uE5D8":"\\uE5DB";
            button.setAttribute("aria-label",_globalize.default.translate(direction<0?"Up":"Down")+": "+item.Name);
            button.disabled=direction<0?selected.indexOf(item.Id)===0:selected.indexOf(item.Id)===selected.length-1;
            button.addEventListener("click",function(e){
                e.preventDefault();e.stopPropagation();
                eteMoveSelection(options,itemsContainer,item.Id,selected.indexOf(item.Id)+direction,direction);
            });
            controls.appendChild(button);
        });
        if(handle){handle.setAttribute("title",_globalize.default.translate("DragDropToReorder"));handle.parentNode.insertBefore(controls,handle)}
        else row.appendChild(controls);
    var pending=options._eteReorderFocus;
    if(pending&&pending.id===item.Id)setTimeout(function(){
        if(options._eteReorderFocus!==pending)return;
        var rows=itemsContainer.querySelectorAll(itemsContainer.getItemSelector()),current=null;
        for(var j=0;j<rows.length;j++)if(rows[j].getAttribute("data-ete-reorder-id")===pending.id){current=rows[j];break}
        if(!current)return;
        var focus=pending.direction===0?current.querySelector("input"):current.querySelector(pending.direction<0?".ete-reorder-up":".ete-reorder-down");
        if(focus&&focus.disabled)focus=current.querySelector(pending.direction<0?".ete-reorder-down":".ete-reorder-up");
        if(focus){focus.focus();options._eteReorderFocus=null}
    },250);
}function eteSetupReorderRows(options,itemsContainer){
    var rows=itemsContainer.querySelectorAll(itemsContainer.getItemSelector());
    for(var i=0;i<rows.length;i++){
        var row=rows[i];eteDecorateReorderRow(options,itemsContainer,row,itemsContainer.getItemFromElement(row));
    }
}`;

function patchActionSheet(source) {
    source = once(source, 'function getListOptions(){', helper + 'function getListOptions(){');
    source = once(source, 'draggable:!1,multiSelect:!1',
        'draggable:!!options.enableReordering,dragHandle:!!options.enableReordering,multiSelect:!1');
    source = once(source, 'show:function(options){var dialogOptions=',
        'show:function(options){if(options.enableReordering){options=Object.assign({},options);options._eteGetItems=options.getItems;options.getItems=function(query){return eteReorderItems(options,query||{})}}var dialogOptions=');
    source = once(source, 'dlg.classList.add("actionSheet"),',
        'dlg.classList.add("actionSheet"),options.enableReordering&&dlg.classList.add("ete-reorder-actionsheet"),');
    source = once(source, 'e.checked&&options.selectedValuesClone.push(itemValue)}),itemsContainer.afterRefresh=',
        'e.checked&&options.selectedValuesClone.push(itemValue),options.enableReordering&&(options._eteReorderVersion=(options._eteReorderVersion||0)+1,options._eteReorderFocus={id:itemValue,direction:0},Promise.resolve().then(function(){itemsContainer.refreshItems()}))}),options.enableReordering&&(itemsContainer.onUpdateElement=function(row,item){eteDecorateReorderRow(options,itemsContainer,row,item)},itemsContainer.addEventListener("itemdrop",function(e){var id=e.target.getAttribute("data-ete-reorder-id");if(id){if(itemsContainer.virtualScroller)eteMoveSelection(options,itemsContainer,id,Math.min(e.detail.newIndex,options.selectedValuesClone.length-1),0);else eteSyncDrop(options,itemsContainer)}})),itemsContainer.afterRefresh=');
    source = once(source, '_layoutmanager.default.tv&&itemsContainer.insertAdjacentHTML("afterbegin",previewHtml)},new Promise(function(resolve,reject){dlg.addEventListener("opened",resolve)})),',
        '_layoutmanager.default.tv&&itemsContainer.insertAdjacentHTML("afterbegin",previewHtml),options.enableReordering&&eteSetupReorderRows(options,itemsContainer)},new Promise(function(resolve,reject){dlg.addEventListener("opened",resolve)})),');
    return source;
}

module.exports = {patchSelect, patchActionSheet};
