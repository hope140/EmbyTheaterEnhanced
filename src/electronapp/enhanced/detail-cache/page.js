define(['exports','ete-detail-cache-store','modules/emby-apiclient/connectionmanager.js','modules/emby-apiclient/events.js','css!./page.css'],function(exports,storeModule,connection,events){
    'use strict';
    var store=storeModule.default.shared(),blocked=new WeakMap(),backgroundOwner=null;
    function context(api,params){
        try{
            if(!api||connection.default.currentApiClient()!==api||!api.isLoggedIn()||!params||!params.id||Object.keys(params).some(key=>!['id','serverId','asSeries','context'].includes(key)))return null;
            if(params.context&&!/^[A-Za-z0-9_-]{1,64}$/.test(params.context))return null;
            if(params.asSeries!=null&&!['true','false',true,false].includes(params.asSeries))return null;
            var epoch=api._identityEpoch||0;if(blocked.get(api)===epoch)return null;
            var endpoint=new URL(api.serverAddress());if(endpoint.username||endpoint.password||!['https:','http:'].includes(endpoint.protocol))return null;
            var representation=JSON.stringify([params.asSeries||'',params.context||'',api.getCurrentLocale()||'',api.serverVersion(),document.documentElement.classList.contains('layout-tv')?'tv':'standard']);
            return {server:api.serverId(),endpoint:endpoint.origin+endpoint.pathname,user:api.getCurrentUserId(),item:params.id,representation:representation,epoch:epoch};
        }catch(_){return null;}
    }
    function same(a,b){return !!a&&!!b&&['server','endpoint','user','item','representation','epoch'].every(key=>a[key]===b[key]);}
    async function failure(error,api,params){
        if(error&&(error.status===401||error.status===403))return 'authorization';
        if(!error||error.status!==404||!error.headers||!/^application\/(?:[\w.+-]*\+)?json(?:;|$)/i.test(error.headers.get('content-type')||''))return 'temporary';
        try{
            var actual=new URL(error.url),expected=new URL(api.getUrl('Users/'+encodeURIComponent(api.getCurrentUserId())+'/Items/'+encodeURIComponent(params.id)));
            if(actual.origin!==expected.origin||actual.pathname!==expected.pathname)return 'temporary';
            var payload=await error.clone().json(),status=payload&&payload.ResponseStatus;
            if(status&&(['ItemNotFound','ItemNotFoundException'].includes(status.ErrorCode)||
                ['ResourceNotFoundException','NotFoundException'].includes(status.ErrorCode)&&/^\s*(?:media\s+)?item(?:\s+[^\n]{0,256})?\s+(?:was\s+)?not found[.!]?\s*$/i.test(status.Message||'')))return 'missing';
        }catch(_){}
        return 'temporary';
    }
    function create(owner,bindings){
        var api=null,scope=null,ticket=null,epoch=0,active=false,disposed=false,ready=false,fresh=null,userReady=false,sourcesReady=false,queued=null,preview=null,status=null,hasStatic=false,retiredView=false,failed=false,terminalHandling=false,legacy=false,liveUserData=null,reading=Promise.resolve();
        var view=owner.view,backgroundToken={};
        function clearBackdrop(){if(backgroundOwner===backgroundToken||backgroundOwner===null&&owner._eteDetailActive){backgroundOwner=null;bindings.clearBackdrop();}}
        function current(value){return active&&!disposed&&value===epoch&&same(scope,context(api,owner.params));}
        function removePreview(){if(preview){preview.classList.remove('eteDetailCachePreview');preview.querySelector('.eteDetailPreviewPlay')?.remove();}preview=null;}
        function feedback(text,retry){
            if(!status){status=document.createElement('div');status.className='eteDetailCacheStatus';status.setAttribute('role','status');view.querySelector('.detailMainContainer').before(status);}
            status.replaceChildren(document.createTextNode(text));
            if(retry){var button=document.createElement('button',{is:'emby-button'});button.type='button';button.classList.add('raised');button.textContent='重试';button.onclick=()=>bindings.retry();status.append(button);}
        }
        function retired(){retiredView=true;epoch++;active=false;fresh=null;userReady=false;queued=null;ready=false;removePreview();if(view){view.allowRestore=false;view.classList.add('eteDetailRetired');view.style.removeProperty('background-image');clearBackdrop();}hasStatic=false;}
        function watch(event,message){
            if(!same(scope,context(api,owner.params))){retired();return;}
            if(message&&message.MessageType==='UserDataChanged'&&message.Data&&message.Data.UserId===scope.user){var changed=(message.Data.UserDataList||[]).find(value=>value.ItemId===scope.item);if(changed){liveUserData=changed;if(fresh)fresh.UserData=changed;}}
            if(message&&message.MessageType==='LibraryChanged'){
                var data=message.Data||{};
                if((data.ItemsRemoved||[]).includes(scope.item))store.remove(ticket);
            }
        }
        function detach(){if(api){events.default.off(api,'message',watch);events.default.off(api,'websocketclose',watch);}['localusersignedin','localusersignedout','connected'].forEach(name=>events.default.off(connection.default,name,watch));}
        var unsubscribe=store.subscribe(change=>{if(change.reason==='removed'&&ticket&&change.item===storeModule.default.itemKey(ticket.key)){retired();owner.currentItem=null;owner._currentPlaybackMediaSources=null;if(!terminalHandling)feedback(change.cause==='authorization'?'无法访问此内容。':'内容已不存在。',false);} });
        function draw(dto,value){
            if(!current(value)||ready||hasStatic||!store.current(ticket))return;
            removePreview();preview=view.querySelector('.detailMainContainer');preview.classList.add('eteDetailCachePreview');
            var name=document.createElement('h1');name.textContent=dto.Name;view.querySelector('.nameContainer').replaceChildren(name);
            var overview=view.querySelector('.overview-text');overview.textContent=dto.Overview;overview.closest('.overview-container').classList.remove('hide');
            var image=view.querySelector(dto.Type==='Season'?'.detailImageContainer-side':'.detailImageContainer-main');image.classList.remove('hide');image.classList.add('detailImageContainer-portrait');if(dto.Type==='Season')image.closest('.item-fixed-side').classList.remove('hide');image.replaceChildren();
            if(dto.PrimaryImageTag){var img=document.createElement('img');img.className='eteDetailPoster';img.alt='';img.decoding='async';img.width=240;img.height=360;img.src=api.getImageUrl(dto.Id,{type:'Primary',tag:dto.PrimaryImageTag,maxWidth:480});image.append(img);}
            var play=document.createElement('button',{is:'emby-button'});play.type='button';play.classList.add('raised','eteDetailPreviewPlay');play.textContent='播放';play.onclick=()=>bindings.play('play');view.querySelector('.mainDetailButtons').append(play);
            view.classList.add('eteDetailHasPreview');hasStatic=true;
        }
        function flushPlay(){if(!queued||!fresh||!userReady||!current(epoch))return;
            // Existing endpoint cold work must finish before overlapping play can duplicate it.
            if(!sourcesReady&&(!api.getSavedEndpointInfo||!api.getSavedEndpointInfo()))return;var play=queued;queued=null;if(bindings.canPlay(fresh))play(fresh);}
        function begin(client){
            detach();api=client;var next=context(api,owner.params),sameView=same(scope,next);if(scope&&!sameView){retired();owner.currentItem=null;owner._currentPlaybackMediaSources=null;}epoch++;active=!!next;ready=false;fresh=null;userReady=false;sourcesReady=false;liveUserData=null;queued=null;scope=next;
            if(!sameView){removePreview();hasStatic=false;}
            if(!active)return;failed=false;legacy=false;var playButton=view.querySelector('.eteDetailPreviewPlay');if(playButton)playButton.disabled=false;
            if(!retiredView)view.classList.remove('eteDetailRetired');view.classList.add('eteDetailRefreshing');ticket=store.ticket(scope);var value=epoch;
            events.default.on(api,'message',watch);events.default.on(api,'websocketclose',watch);['localusersignedin','localusersignedout','connected'].forEach(name=>events.default.on(connection.default,name,watch));
            reading=store.read(ticket).then(result=>{if(result.status==='hit')draw(result.dto,value);}).catch(()=>{});
        }
        function item(value){if(!current(epoch)||!value||value.Id!==scope.item||value.ServerId!==scope.server)return;
            if(!['Movie','Series','Season','Episode'].includes(value.Type)){legacy=true;queued=null;return;}fresh=value;if(liveUserData)fresh.UserData=liveUserData;store.write(ticket,value).catch(()=>{});flushPlay();}
        function user(value){if(!current(epoch))return;userReady=!!value&&!(value.Policy&&value.Policy.EnableMediaPlayback===false);flushPlay();}
        function complete(){if(!current(epoch))return;ready=true;hasStatic=true;retiredView=false;queued=null;removePreview();view.classList.remove('eteDetailHasPreview','eteDetailRefreshing','eteDetailRetired');if(status){status.remove();status=null;}}
        async function error(err){
            if(legacy||!scope&&!retiredView)return false;
            var value=epoch,kind=await failure(err,api,owner.params);if(!current(value))return true;
            if(kind==='temporary'){await reading;if(!current(value))return true;}
            if(kind==='authorization'||kind==='missing'){if(kind==='authorization')blocked.set(api,scope.epoch);var detailView=view;terminalHandling=true;store.remove(ticket,kind).catch(()=>{});terminalHandling=false;if(disposed||view!==detailView)return true;view.allowRestore=false;removePreview();view.classList.remove('eteDetailHasPreview','eteDetailRetired');view.classList.add('eteDetailMissing');clearBackdrop();view.querySelector('.itemBackdrop')?.style.removeProperty('background-image');return false;}
            queued=null;fresh=null;
            if(hasStatic){failed=true;var playButton=view.querySelector('.eteDetailPreviewPlay');if(playButton)playButton.disabled=true;feedback('暂时无法更新详情。',true);return true;}
            return false;
        }
        function requestPlay(mode,play){
            if(!scope||legacy)return false;
            if(!current(epoch))return true;
            if(ready)return false;
            if(failed){feedback('详情暂不可用，请重试。',true);return true;}
            queued=item=>play(item,mode);flushPlay();return true;
        }
        return {ownsBackground:function(){backgroundOwner=backgroundToken;},isCurrent:function(){return scope?current(epoch):!retiredView;},begin:begin,item:item,user:user,sources:function(){if(current(epoch)){sourcesReady=true;flushPlay();}},complete:complete,error:error,requestPlay:requestPlay,
            pause:function(){epoch++;active=false;fresh=null;queued=null;detach();if(backgroundOwner===backgroundToken)backgroundOwner=null;},
            dispose:function(){disposed=true;epoch++;active=false;queued=null;fresh=null;detach();if(backgroundOwner===backgroundToken)backgroundOwner=null;unsubscribe();removePreview();if(status)status.remove();status=null;view=null;}};
    }
    exports.default={create:create,context:context,failure:failure};
});
