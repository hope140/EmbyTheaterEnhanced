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
        var view=owner.view,backgroundToken={},visual=null,previewButtonState=null,sizing=null;
        function releaseSizing(){if(!sizing)return;clearTimeout(sizing.timer);sizing.image.removeEventListener('load',sizing.done);sizing.image.removeEventListener('error',sizing.done);if(view)view.classList.remove('eteDetailSizing');sizing=null;}
        // Data/play readiness never waits for this page-owned decoded image cover.
        function releaseVisual(record){
            if(!record||visual!==record)return;
            visual=null;clearTimeout(record.timer);if(record.observer)record.observer.disconnect();
            if(record.resize)window.removeEventListener('resize',record.resize);
            (record.frames||[]).forEach(id=>cancelAnimationFrame(id));
            record.listeners.forEach(pair=>{pair[0].removeEventListener('load',pair[1]);pair[0].removeEventListener('error',pair[1]);});
            record.covers.forEach(cover=>cover.remove());
            record.targets.forEach(target=>target.container.classList.remove('eteDetailProtectImage'));
            (record.sections||[]).forEach(section=>section.node.classList.remove('eteDetailVisualPending'));
        }
        function protectVisual(){
            releaseVisual(visual);releaseSizing();if(!active||!hasStatic||legacy||!fresh)return;
            var record=visual={epoch:epoch,view:view,covers:[],targets:[],sections:[],listeners:[],observer:null,timer:null};
            record.timer=setTimeout(()=>releaseVisual(record),1000);
            var people=view.querySelector('.peopleItemsContainer');
            if(people&&!people.childElementCount&&fresh&&fresh.People&&fresh.People.length){var section=people.closest('.verticalSection');if(section){section.classList.add('eteDetailVisualPending');record.sections.push({node:section,container:people});}}
            view.querySelectorAll('.detailImageContainer-main').forEach(container=>{
                var old=Array.from(container.querySelectorAll('img')).find(img=>img.complete&&img.naturalWidth>0);
                if(!old||!container.getBoundingClientRect().width)return;
                container.classList.add('eteDetailProtectImage');
                var cover=old.cloneNode(true);cover.className='eteDetailImageCover';cover.setAttribute('aria-hidden','true');
                var box=old.getBoundingClientRect(),parent=container.parentElement.getBoundingClientRect();Object.assign(cover.style,{left:(box.left-parent.left)+'px',top:(box.top-parent.top)+'px',width:box.width+'px',height:box.height+'px'});
                container.parentElement.append(cover);record.covers.push(cover);record.targets.push({container:container,old:old,cover:cover});
            });
            var backdrop=view.querySelector('.itemBackdrop'),source=backdrop&&backdrop.style.backgroundImage;
            if(source&&source!=='none'&&backdrop.getBoundingClientRect().width){
                var cover=document.createElement('div'),box=backdrop.getBoundingClientRect(),parent=backdrop.parentElement.getBoundingClientRect(),style=getComputedStyle(backdrop);
                cover.className='eteDetailImageCover';cover.setAttribute('aria-hidden','true');
                Object.assign(cover.style,{left:(box.left-parent.left)+'px',top:(box.top-parent.top)+'px',width:box.width+'px',height:box.height+'px',backgroundImage:source,backgroundSize:style.backgroundSize,backgroundPosition:style.backgroundPosition});
                backdrop.parentElement.append(cover);record.covers.push(cover);record.targets.push({container:backdrop,background:true,cover:cover});
            }
        }
        function finishVisual(){
            var record=visual;if(!record)return;
            function reveal(target,image){
                if(target.decoding)return;target.decoding=true;
                var work;try{work=image&&typeof image.decode==='function'?image.decode():Promise.resolve();}catch(_){work=Promise.resolve();}
                Promise.resolve(work).catch(()=>{}).then(()=>{
                    if(visual!==record||!current(record.epoch)||view!==record.view)return;
                    record.frames.push(requestAnimationFrame(()=>{if(visual===record&&current(record.epoch)&&view===record.view){target.cover.remove();probe();}}));
                });
            }
            function probe(){
                if(visual!==record)return;
                if(!current(record.epoch)||view!==record.view){releaseVisual(record);return;}
                var waiting=false;
                record.sections.forEach(section=>{
                    var images=Array.from(section.container.querySelectorAll('img'));
                    if(images.length&&images.every(image=>image.complete)){section.node.classList.remove('eteDetailVisualPending');return;}
                    images.forEach(image=>{if(record.listeners.some(pair=>pair[0]===image))return;record.listeners.push([image,probe]);image.addEventListener('load',probe);image.addEventListener('error',probe);});
                    if(section.node.classList.contains('eteDetailVisualPending'))waiting=true;
                });
                record.targets.forEach(target=>{
                    if(target.background){
                        if(!target.cover.isConnected)return;
                        var rectangle=target.container.getBoundingClientRect(),parentRectangle=target.container.parentElement.getBoundingClientRect();
                        if(!rectangle.width||!rectangle.height){target.cover.remove();return;}
                        Object.assign(target.cover.style,{left:(rectangle.left-parentRectangle.left)+'px',top:(rectangle.top-parentRectangle.top)+'px',width:rectangle.width+'px',height:rectangle.height+'px'});
                        if(!target.image){
                            var match=/^url\(["']?(.*?)["']?\)$/.exec(target.container.style.backgroundImage||'');
                            if(!match){target.cover.remove();return;}
                            var image=target.image=new Image(),listener=()=>{if(image.naturalWidth>0)reveal(target,image);else{target.cover.remove();probe();}};record.listeners.push([image,listener]);image.addEventListener('load',listener);image.addEventListener('error',listener);image.src=match[1];
                            if(image.complete){if(image.naturalWidth>0)reveal(target,image);else target.cover.remove();}
                        }
                        waiting=true;return;
                    }
                    var candidates=Array.from(target.container.querySelectorAll('img')).filter(img=>img!==target.old),box=(candidates[0]||target.container).getBoundingClientRect(),parent=target.container.parentElement.getBoundingClientRect();
                    Object.assign(target.cover.style,{left:(box.left-parent.left)+'px',top:(box.top-parent.top)+'px',width:box.width+'px',height:box.height+'px'});
                    if(!box.width||!box.height){target.cover.remove();return;}
                    var images=candidates;
                    var loaded=images.find(img=>img.complete&&img.naturalWidth>0);
                    if(loaded)reveal(target,loaded);
                    else if(images.some(img=>img.complete&&img.currentSrc)||target.container.querySelector('.cardImageIcon')){target.cover.remove();return;}
                    images.forEach(img=>{if(record.listeners.some(pair=>pair[0]===img))return;var listener=()=>{if(img.complete&&img.naturalWidth===0)target.cover.remove();probe();};record.listeners.push([img,listener]);img.addEventListener('load',listener);img.addEventListener('error',listener);});
                    if(target.cover.isConnected)waiting=true;
                });
                if(!waiting)releaseVisual(record);
            }
            record.frames=[];record.resize=probe;window.addEventListener('resize',probe);
            if(typeof MutationObserver==='function'){record.observer=new MutationObserver(probe);record.targets.concat(record.sections).forEach(target=>record.observer.observe(target.container,{childList:true,subtree:true}));}
            probe();
        }
        function clearBackdrop(){if(backgroundOwner===backgroundToken||backgroundOwner===null&&owner._eteDetailActive){backgroundOwner=null;bindings.clearBackdrop();}}
        function current(value){return active&&!disposed&&value===epoch&&same(scope,context(api,owner.params));}
        function removePreview(){releaseSizing();if(preview){preview.classList.remove('eteDetailCachePreview');var button=preview.querySelector('.eteDetailPreviewPlay');if(button){button.classList.remove('eteDetailPreviewPlay');if(previewButtonState&&previewButtonState.button===button){button.disabled=previewButtonState.disabled;if(!ready)button.classList.toggle('hide',previewButtonState.hidden);}}}previewButtonState=null;preview=null;}
        function feedback(text,retry){
            if(!status){status=document.createElement('div');status.className='eteDetailCacheStatus';status.setAttribute('role','status');view.querySelector('.detailMainContainer').before(status);}
            status.replaceChildren(document.createTextNode(text));
            if(retry){var button=document.createElement('button',{is:'emby-button'});button.type='button';button.classList.add('raised');button.textContent='重试';button.onclick=()=>bindings.retry();status.append(button);}
        }
        function retired(){releaseVisual(visual);retiredView=true;epoch++;active=false;fresh=null;userReady=false;queued=null;ready=false;removePreview();if(view){view.allowRestore=false;view.classList.add('eteDetailRetired');view.style.removeProperty('background-image');clearBackdrop();}hasStatic=false;}
        function watch(event,message){
            if(!same(scope,context(api,owner.params))){retired();return;}
            if(message&&message.MessageType==='UserDataChanged'&&message.Data&&message.Data.UserId===scope.user){var changed=(message.Data.UserDataList||[]).find(value=>value.ItemId===scope.item);if(changed){liveUserData=changed;if(fresh)fresh.UserData=changed;}}
            if(message&&message.MessageType==='LibraryChanged'){
                var data=message.Data||{};
                if((data.ItemsRemoved||[]).includes(scope.item))store.remove(ticket);
            }
        }
        function detach(){if(api){events.default.off(api,'message',watch);events.default.off(api,'websocketclose',watch);}['localusersignedin','localusersignedout','connected'].forEach(name=>events.default.off(connection.default,name,watch));}
        var unsubscribe=store.subscribe(change=>{if(change.reason==='cleared'){releaseVisual(visual);releaseSizing();}if(change.reason==='removed'&&ticket&&change.item===storeModule.default.itemKey(ticket.key)){retired();owner.currentItem=null;owner._currentPlaybackMediaSources=null;if(!terminalHandling)feedback(change.cause==='authorization'?'无法访问此内容。':'内容已不存在。',false);} });
        function draw(dto,value){
            if(!current(value)||ready||hasStatic||!store.current(ticket))return;
            removePreview();preview=view.querySelector('.detailMainContainer');preview.classList.add('eteDetailCachePreview');
            var image=view.querySelector('.detailImageContainer-main'),presentation=bindings.presentation&&bindings.presentation(dto,image,scope.server);
            view.querySelector('.item-fixed-side').classList.add('hide');image.classList.remove('hide');
            ['portrait','square','backdrop','fourThree','banner'].forEach(shape=>image.classList.remove('detailImageContainer-'+shape));
            image.classList.add('detailImageContainer-'+(presentation?presentation.shape:dto.Type==='Episode'?'backdrop':'portrait'),'detailImageContainer-main-extrabottommargin','detailImageContainer-hidemobile');
            if(dto.Type==='Season')image.classList.add('detailImage-nomarginleft');
            if(dto.Type==='Season')image.classList.add('detailImageContainer-small');
            if(presentation&&presentation.tv)image.classList.add('detailImageContainer-main-tv');
            view.querySelector('.detailMainContainer').classList.add('detailMainContainer-withitembackdrop');
            if(presentation&&presentation.graphic){
                if(dto.Type!=='Season')view.querySelector('.detailTextContainer').classList.add('detailTextContainer-extrapadding');
                view.querySelector('.topDetailsMain').classList.add('topDetailsMain-graphic');
                if(presentation.tv)view.querySelector('.topDetailsMain').classList.add('topDetailsMain-graphic-tv');
                view.querySelector('.itemMainScrollSlider').classList.add('itemMainScrollSlider-nopaddingtop');
                if(dto.PrimaryImageTag)view.querySelector('.itemBackdrop').style.backgroundImage='url("'+api.getImageUrl(dto.Id,{type:'Primary',index:0,maxWidth:screen.availWidth,tag:dto.PrimaryImageTag,EnableImageEnhancers:false})+'")';
            }
            var wrapper=document.createElement('div');wrapper.className='flex align-items-center flex-wrap-wrap itemPrimaryNameContainer';
            var name=document.createElement('h1');name.className='itemName-primary';name.textContent=dto.SeriesName||(presentation?presentation.name:dto.Name);wrapper.append(name);view.querySelector('.nameContainer').replaceChildren(wrapper);
            if(dto.SeriesName){var secondary=document.createElement('h3');secondary.className='itemName-secondary';secondary.textContent=presentation?presentation.name:dto.Name;var row=document.createElement('div');row.className='flex align-items-center flex-wrap-wrap itemSecondaryNameContainer';row.append(secondary);view.querySelector('.nameContainer').append(row);}
            var overview=view.querySelector('.overview-text');overview.textContent=dto.Overview;overview.closest('.overview-container').classList.remove('hide');
            image.replaceChildren();
            if(presentation)image.innerHTML=presentation.poster();
            else if(dto.PrimaryImageTag){var img=document.createElement('img');img.className='eteDetailPoster';img.alt='';img.decoding='async';img.width=240;img.height=360;img.src=api.getImageUrl(dto.Id,{type:'Primary',tag:dto.PrimaryImageTag,maxWidth:480});image.append(img);}
            var play=view.querySelector('.btnMainPlay');previewButtonState={button:play,disabled:play.disabled,hidden:play.classList.contains('hide')};play.classList.remove('hide');play.classList.add('eteDetailPreviewPlay');
            view.classList.add('eteDetailHasPreview');hasStatic=true;
            // Old rows lacked aspect metadata. Use the same preview image, never
            // another image URL/request or a persisted layout/permission snapshot.
            var legacyImage=image.querySelector('img');
            if(!dto.PrimaryImageAspectRatio&&legacyImage&&presentation){
                view.classList.add('eteDetailSizing');
                var record=sizing={image:legacyImage,timer:null,done:null};
                record.done=function(){
                    if(sizing!==record||!current(value)||ready){if(sizing===record)releaseSizing();return;}
                    if(legacyImage.naturalWidth&&legacyImage.naturalHeight){
                        var ratio=legacyImage.naturalWidth/legacyImage.naturalHeight,shape=bindings.presentation(Object.assign({},dto,{PrimaryImageAspectRatio:ratio}),image,scope.server).shape;
                        ['portrait','square','backdrop','fourThree','banner'].forEach(name=>{image.classList.remove('detailImageContainer-'+name);image.querySelectorAll('.cardPadder-'+name).forEach(element=>{element.classList.remove('cardPadder-'+name);element.classList.add('cardPadder-'+shape);});});image.classList.add('detailImageContainer-'+shape);
                    }
                    releaseSizing();
                };
                legacyImage.addEventListener('load',record.done);legacyImage.addEventListener('error',record.done);record.timer=setTimeout(()=>{if(sizing===record)releaseSizing();},1000);if(legacyImage.complete)record.done();
            }
        }
        function flushPlay(){if(!queued||!fresh||!userReady||!current(epoch))return;
            // Existing endpoint cold work must finish before overlapping play can duplicate it.
            if(!sourcesReady&&(!api.getSavedEndpointInfo||!api.getSavedEndpointInfo()))return;var play=queued;queued=null;if(bindings.canPlay(fresh))play(fresh);}
        function begin(client){
            releaseVisual(visual);releaseSizing();detach();api=client;var next=context(api,owner.params),sameView=same(scope,next);if(scope&&!sameView){retired();owner.currentItem=null;owner._currentPlaybackMediaSources=null;}epoch++;active=!!next;ready=false;fresh=null;userReady=false;sourcesReady=false;liveUserData=null;queued=null;scope=next;
            if(!sameView){removePreview();hasStatic=false;}
            if(!active)return;failed=false;legacy=false;var playButton=view.querySelector('.eteDetailPreviewPlay');if(playButton)playButton.disabled=false;
            if(!retiredView)view.classList.remove('eteDetailRetired');view.classList.add('eteDetailRefreshing');ticket=store.ticket(scope);var value=epoch;
            events.default.on(api,'message',watch);events.default.on(api,'websocketclose',watch);['localusersignedin','localusersignedout','connected'].forEach(name=>events.default.on(connection.default,name,watch));
            reading=store.read(ticket).then(result=>{if(result.status==='hit')draw(result.dto,value);}).catch(()=>{});
        }
        function item(value){if(!current(epoch)||!value||value.Id!==scope.item||value.ServerId!==scope.server)return;
            if(!['Movie','Series','Season','Episode'].includes(value.Type)){legacy=true;queued=null;return;}fresh=value;if(liveUserData)fresh.UserData=liveUserData;store.write(ticket,value).catch(()=>{});flushPlay();}
        function user(value){if(!current(epoch))return;userReady=!!value&&!(value.Policy&&value.Policy.EnableMediaPlayback===false);flushPlay();}
        function complete(){if(!current(epoch))return;ready=true;hasStatic=true;retiredView=false;queued=null;removePreview();view.classList.remove('eteDetailHasPreview','eteDetailRefreshing','eteDetailRetired');if(status){status.remove();status=null;}finishVisual();}
        async function error(err){
            if(legacy||!scope&&!retiredView)return false;
            var value=epoch,kind=await failure(err,api,owner.params);if(!current(value))return true;
            if(kind==='temporary'){await reading;if(!current(value))return true;}
            if(kind==='authorization'||kind==='missing'){releaseVisual(visual);if(kind==='authorization')blocked.set(api,scope.epoch);var detailView=view;terminalHandling=true;store.remove(ticket,kind).catch(()=>{});terminalHandling=false;if(disposed||view!==detailView)return true;view.allowRestore=false;removePreview();view.classList.remove('eteDetailHasPreview','eteDetailRetired');view.classList.add('eteDetailMissing');clearBackdrop();view.querySelector('.itemBackdrop')?.style.removeProperty('background-image');return false;}
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
        return {prepare:protectVisual,ownsBackground:function(){backgroundOwner=backgroundToken;},isCurrent:function(){return scope?current(epoch):!retiredView;},begin:begin,item:item,user:user,sources:function(){if(current(epoch)){sourcesReady=true;flushPlay();}},complete:complete,error:error,requestPlay:requestPlay,
            pause:function(){releaseVisual(visual);releaseSizing();epoch++;active=false;fresh=null;queued=null;detach();if(backgroundOwner===backgroundToken)backgroundOwner=null;},
            dispose:function(){releaseVisual(visual);disposed=true;epoch++;active=false;queued=null;fresh=null;detach();if(backgroundOwner===backgroundToken)backgroundOwner=null;unsubscribe();removePreview();if(status)status.remove();status=null;view=null;}};
    }
    exports.default={create:create,context:context,failure:failure};
});
