'use strict';
const boundary=require('../renderer-boundary');
const CHANNELS=Object.freeze({READY:'enhanced-detail-cache-ready',FLUSH:'enhanced-detail-cache-flush',DONE:'enhanced-detail-cache-flushed'});
function register({ipcMain,getWebContents,clock={setTimeout,clearTimeout}}){
    let ready=null,readyFrame=null,pending=null,finished=false,closed=false,sequence=0,observed=null;
    function trusted(event,web){return boundary.isTrusted(event,web);}
    function unobserve(){
        if(observed&&observed.removeListener){
            observed.removeListener('did-start-navigation',onNavigation);
            observed.removeListener('render-process-gone',retire);
            observed.removeListener('destroyed',retire);
        }
        observed=null;
    }
    function retire(){ready=null;readyFrame=null;unobserve();if(pending)complete('unavailable');}
    function onNavigation(details,url,isInPlace,isMainFrame){
        // Electron 44 exposes event details; retain its deprecated positional form too.
        const main=details&&typeof details.isMainFrame==='boolean'?details.isMainFrame:isMainFrame;
        const same=details&&typeof details.isSameDocument==='boolean'?details.isSameDocument:isInPlace;
        if(main===true&&same!==true)retire();
    }
    function onReady(event){
        const web=getWebContents();if(closed||finished||!trusted(event,web))return;
        if(observed!==web){
            unobserve();observed=web;
            if(web.on){web.on('did-start-navigation',onNavigation);web.on('render-process-gone',retire);web.on('destroyed',retire);}
        }
        ready=web;readyFrame=event.senderFrame;
    }
    function complete(status){
        const work=pending;if(!work)return;pending=null;finished=true;clock.clearTimeout(work.timer);ready=null;readyFrame=null;unobserve();
        if(work.web.removeListener)work.web.removeListener('destroyed',work.destroyed);
        // Close the same window only after the event handler has returned.
        Promise.resolve().then(()=>work.close(status));
    }
    function onDone(event,value){
        const work=pending;if(!work||!trusted(event,work.web)||event.senderFrame!==work.frame||!value||Object.keys(value).sort().join(',')!=='id,status'||value.id!==work.id||!['flushed','unavailable'].includes(value.status))return;
        complete(value.status);
    }
    ipcMain.on(CHANNELS.READY,onReady);ipcMain.on(CHANNELS.DONE,onDone);
    return {
        beforeClose(event,close){
            const web=getWebContents();if(closed||finished||!web||ready!==web||readyFrame!==web.mainFrame||web.isDestroyed&&web.isDestroyed())return false;
            if(!event||typeof event.preventDefault!=='function')return false;
            event.preventDefault();if(pending)return true;
            const work=pending={web,frame:readyFrame,id:'detail-close-'+(++sequence),close,timer:null,destroyed:()=>complete('unavailable')};
            work.timer=clock.setTimeout(()=>complete('unavailable'),1000);if(web.once)web.once('destroyed',work.destroyed);
            try{web.send(CHANNELS.FLUSH,work.id);}catch(_){complete('unavailable');}return true;
        },
        dispose(){closed=true;ready=null;readyFrame=null;unobserve();ipcMain.removeListener(CHANNELS.READY,onReady);ipcMain.removeListener(CHANNELS.DONE,onDone);if(pending)complete('unavailable');}
    };
}
module.exports={CHANNELS,register};
