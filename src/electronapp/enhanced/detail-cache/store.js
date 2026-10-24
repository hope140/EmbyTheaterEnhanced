(function(factory){
    if(typeof define==='function'&&define.amd) define(['exports'],function(exports){exports.default=factory();});
    else if(typeof module==='object'&&module.exports) module.exports=factory();
}(function(){
    'use strict';
    // This database and its quarantine marker belong to this owner. Never clear app storage.
    var DATABASE='ete-detail-page-cache-v1', LIMITS=Object.freeze({entries:200,bytes:4*1024*1024,entryBytes:64*1024});
    var TYPES=['Movie','Series','Season','Episode'];
    function text(value,max){return typeof value==='string'&&value.length<=max?value:null;}
    function project(item){
        if(!item||!TYPES.includes(item.Type)||!text(item.Id,256)||!text(item.Name,2048))return null;
        var overview=typeof item.Overview==='string'?item.Overview:'';
        // Persist plain text only. No markup, path, user data, media source or URL is copied.
        overview=overview.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?(?:p|div|br|li)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'');
        var entities={amp:'&',lt:'<',gt:'>',quot:'\"',apos:"'",nbsp:' '};
        overview=overview.replace(/&(amp|lt|gt|quot|apos|nbsp|#\d{1,7}|#x[0-9a-f]{1,6});/gi,function(all,entity){if(entity[0]!=='#')return entities[entity.toLowerCase()];var code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));return code>0&&code<=0x10ffff?String.fromCodePoint(code):all;}).trim().slice(0,24000);
        var dto={Id:item.Id,Type:item.Type,Name:item.Name,Overview:overview};
        if(Number.isInteger(item.ProductionYear)&&item.ProductionYear>0&&item.ProductionYear<10000)dto.ProductionYear=item.ProductionYear;
        var tag=item.ImageTags&&item.ImageTags.Primary;if(text(tag,256))dto.PrimaryImageTag=tag;
        return dto;
    }
    function valid(dto){if(!dto||Object.keys(dto).some(k=>!['Id','Type','Name','Overview','ProductionYear','PrimaryImageTag'].includes(k)))return false;
        var item=project({Id:dto.Id,Type:dto.Type,Name:dto.Name,Overview:'',ProductionYear:dto.ProductionYear,ImageTags:{Primary:dto.PrimaryImageTag}});if(!item||typeof dto.Overview!=='string'||dto.Overview.length>24000)return false;item.Overview=dto.Overview;return JSON.stringify(item)===JSON.stringify(dto);}
    function size(dto){return new TextEncoder().encode(JSON.stringify(dto)).length;}
    function rowSize(row){return size({key:row.key,dto:row.dto,access:row.access});}
    function validKey(value,dto){try{var parts=JSON.parse(value);return text(value,12000)&&Array.isArray(parts)&&parts.length===6&&parts[0]==='v1'&&parts.slice(1).every(v=>text(v,2048))&&dto&&parts[4]===dto.Id;}catch(_){return false;}}
    function itemKey(value){try{return JSON.stringify(JSON.parse(value).slice(0,5));}catch(_){return null;}}
    function key(scope){
        if(!scope||!['server','endpoint','user','item','representation'].every(k=>text(scope[k],2048)))return null;
        return JSON.stringify(['v1',scope.server,scope.endpoint,scope.user,scope.item,scope.representation]);
    }
    function create(indexedDB,name,storage){
        var marker=(name||DATABASE)+'-quarantine',quarantined=false,storageUnavailable=false;
        try{if(storage===undefined)storage=typeof localStorage==='undefined'?null:localStorage;quarantined=!!(storage&&storage.getItem(marker));}catch(_){storageUnavailable=true;}
        // A one-byte owner marker closes the delete-transaction failure across restart.
        // It is never an account/settings key and reserves 128 bytes of the same budget.
        function quarantine(value){try{if(storage){if(value)storage.setItem(marker,'1');else storage.removeItem(marker);}quarantined=value;return true;}catch(_){disabled=true;return false;}}
        var opening=null,generation=0,latest=new Map(),listeners=new Set(),disabled=storageUnavailable,removals=0,sticky=quarantined,closing=false,operations=new Set();
        function emit(value){listeners.forEach(fn=>{try{fn(value);}catch(_){}});}
        function ticket(scope){var id=key(scope);if(!id)return null;var value={key:id,generation:generation};latest.delete(id);latest.set(id,value);while(latest.size>LIMITS.entries)latest.delete(latest.keys().next().value);return value;}
        function current(t){return !!t&&t.generation===generation&&latest.get(t.key)===t;}
        function open(){
            if(!indexedDB||disabled)return Promise.resolve(null);if(opening)return opening;
            opening=new Promise(resolve=>{var request;try{request=indexedDB.open(name||DATABASE,1);}catch(_){resolve(null);return;}
                request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('entries'))request.result.createObjectStore('entries',{keyPath:'key'});};
                request.onerror=()=>resolve(null);request.onblocked=()=>{disabled=true;resolve(null);};request.onsuccess=()=>{var db=request.result;if(disabled){db.close();return;}db.onversionchange=()=>{disabled=true;db.close();};resolve(db);};});return opening;
        }
        async function transactionWork(work){var db=await open();if(!db)return {status:'unavailable'};return new Promise(resolve=>{var tx,answer={status:'unavailable'};try{tx=db.transaction('entries','readwrite');var object=tx.objectStore('entries'),req=object.getAll(undefined,LIMITS.entries+1);req.onsuccess=()=>{try{answer=work(object,req.result);}catch(_){tx.abort();}};tx.oncomplete=()=>resolve(answer);tx.onabort=()=>resolve({status:'unavailable'});tx.onerror=()=>{};}catch(_){resolve({status:'unavailable'});}});}
        function transaction(work){if(closing)return Promise.resolve({status:'unavailable'});var promise=transactionWork(work);operations.add(promise);promise.then(()=>operations.delete(promise),()=>operations.delete(promise));return promise;}
        function sanitize(object,rows){var kept=[];if(rows.length>LIMITS.entries){object.clear();return kept;}for(var row of rows){if(!row||Object.keys(row).some(k=>!['key','dto','access'].includes(k))||!validKey(row.key,row.dto)||!Number.isSafeInteger(row.access)||!valid(row.dto)||rowSize(row)>LIMITS.entryBytes){if(row&&row.key!==undefined)object.delete(row.key);continue;}delete row.bytes;kept.push(row);}kept.sort((a,b)=>a.access-b.access);while(kept.reduce((sum,row)=>sum+rowSize(row),0)>LIMITS.bytes-128){object.delete(kept.shift().key);}return kept;}
        function stats(rows){return {status:'ok',entries:rows.length,serializedBytes:rows.reduce((sum,row)=>sum+rowSize(row),0)};}
        async function read(t){var result=await transaction((object,input)=>{var rows=sanitize(object,input);if(!current(t)||quarantined)return {status:'miss'};var row=rows.find(row=>row.key===t.key);if(!row)return {status:'miss'};row.access=Math.max(Date.now(),...rows.map(r=>r.access+1));if(rowSize(row)>LIMITS.entryBytes||stats(rows).serializedBytes>LIMITS.bytes-128){object.delete(row.key);return {status:'miss'};}object.put(row);return {status:'hit',dto:row.dto};});return current(t)?result:{status:'miss'};}
        function write(t,item){var dto=project(item);if(quarantined||!current(t)||!dto||size(dto)>LIMITS.entryBytes)return Promise.resolve({status:'ignored'});
            return transaction((object,input)=>{var rows=sanitize(object,input);if(!current(t))return {status:'ignored'};rows=rows.filter(row=>row.key!==t.key);var next={key:t.key,dto:dto,access:Math.max(Date.now(),...rows.map(r=>r.access+1))};if(rowSize(next)>LIMITS.entryBytes)return {status:'ignored'};rows.push(next);rows.sort((a,b)=>a.access-b.access);while(rows.length>LIMITS.entries||stats(rows).serializedBytes>LIMITS.bytes-128){var removed=rows.shift();object.delete(removed.key);}if(rows.includes(next))object.put(next);return stats(rows);});}
        function remove(t,cause){if(!current(t))return Promise.resolve({status:'ignored'});var removedItem=itemKey(t.key);generation++;latest.clear();removals++;quarantine(true);emit({item:removedItem,reason:'removed',cause:cause||'missing'});return transaction((object,input)=>{var rows=sanitize(object,input),kept=rows.filter(row=>itemKey(row.key)!==removedItem);rows.filter(row=>itemKey(row.key)===removedItem).forEach(row=>object.delete(row.key));return stats(kept);}).then(result=>{removals--;if(result.status!=='ok')sticky=true;if(!removals&&!sticky)quarantine(false);return result;});}
        function clear(){generation++;latest.clear();quarantine(true);emit({reason:'cleared'});return transaction(object=>{object.clear();return stats([]);}).then(result=>{if(result.status==='ok'){sticky=false;if(!removals)quarantine(false);}else sticky=true;return result;});}
        function snapshot(){if(quarantined)return Promise.resolve({status:'unavailable'});return transaction((object,input)=>stats(sanitize(object,input)));}
        function subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
        async function flush(){closing=true;var result=await Promise.allSettled(Array.from(operations));return {status:result.some(value=>value.status==='rejected'||value.value&&value.value.status==='unavailable')?'unavailable':'flushed'};}
        async function close(){var db=await opening;if(db)db.close();opening=null;}
        return {ticket:ticket,current:current,read:read,write:write,remove:remove,clear:clear,snapshot:snapshot,subscribe:subscribe,close:close,flush:flush};
    }
    var shared=null;
    return {LIMITS:LIMITS,DATABASE:DATABASE,project:project,size:size,valid:valid,itemKey:itemKey,create:create,shared:function(){if(shared)return shared;var factory;try{factory=typeof indexedDB==='undefined'?null:indexedDB;}catch(_){factory=null;}shared=create(factory);
        if(typeof window!=='undefined'&&window.ipc&&typeof window.ipc.on==='function'&&typeof window.ipc.send==='function'){window.ipc.on('enhanced-detail-cache-flush',function(event,id){if(typeof id!=='string'||!/^detail-close-[0-9]+$/.test(id))return;shared.flush().then(result=>window.ipc.send('enhanced-detail-cache-flushed',{id:id,status:result.status}),()=>window.ipc.send('enhanced-detail-cache-flushed',{id:id,status:'unavailable'}));});window.ipc.send('enhanced-detail-cache-ready');}
        return shared;}};
}));
