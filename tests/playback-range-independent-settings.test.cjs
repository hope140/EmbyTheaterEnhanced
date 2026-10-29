'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const {createSourceSession} = require('../src/electronapp/enhanced/playback-range-source-session');
const {createSession} = require('../src/electronapp/enhanced/playback-range-session');
const {createStore} = require('../src/electronapp/enhanced/shared-playback-cache/store');
const {uncachedIdentity} = require('../src/electronapp/enhanced/shared-playback-cache/adapter');
const context = {source:'http://synthetic.invalid/a.mkv', serverOrigin:'http://synthetic.invalid', serverId:'server', accountId:'account', itemId:'item', mediaSourceId:'media', playSessionId:'session', mode:'DirectPlay', mediaType:'Video', container:'mkv'};
for (const retainPlayback of [false,true]) test('legacy maintenance obeys explicit retention '+retainPlayback+' for the same actual media', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(),'ete-independent-maintenance-')), sharedRoot = path.join(root,'shared');
    let session, owned, commits=0, creates=0;
    try {
        owned = await createStore({root:sharedRoot,currentBytes:262144,nextBytes:104857600});
        const key = await owned.open(uncachedIdentity(context),{total:20,etag:'"v1"'},'current'); await owned.actual(key);
        assert.equal(await owned.put(key,0,Buffer.from('same-media')),true); await owned.close(); owned=null;
        const helper={currentGenerationId:1};
        session=createSourceSession({config:{kind:'source-aware',root:path.join(root,'legacy'),sharedRoot,retainPlayback,preloadEnabled:true},
            readCurrentBytes:async()=>({bytes:262144,isCurrent:()=>true,commit(){commits++;}})}, {
            createSession:()=>({setContext:async()=>({state:'ready'}),started:async()=>{},retire:async()=>{},close:async()=>{},status:()=>({kind:'next-prefix',diskBytes:0}),preload:async()=>({state:'ready'})}),
            async createStore(options){creates++;assert.equal(options.retainPlayback,retainPlayback);assert.equal(options.existingOnly,true);return createStore(options);}
        });
        await session.setContext(context,helper,1); await session.started(helper,1); await session.close();session=null;
        assert.equal(creates,1); assert.equal(commits,1);
        owned=await createStore({root:sharedRoot,currentBytes:262144,nextBytes:104857600});
        assert.equal(owned.status().committed,retainPlayback?10:0);
    } finally {if(session)await session.close();if(owned)await owned.close();await fs.rm(root,{recursive:true,force:true});}
});
test('retention-only rejects next before source authorization, budget, or backend creation',async()=>{
    let work=0;const forbidden=()=>{work++;throw Error('unexpected-next-work');};
    const session=createSession({config:{kind:'shared-byte-trial',root:os.tmpdir(),preloadEnabled:false,retainPlayback:true},create:forbidden,readCurrentBytes:forbidden,authorize:forbidden,authorizeOrdinary:forbidden});
    try{assert.deepEqual(await session.preload(context,{},1),{state:'disabled'});assert.equal(session.status().preloadEnabled,false);assert.equal(work,0);}finally{await session.close();}
    const source=createSourceSession({config:{kind:'source-aware',root:path.join(os.tmpdir(),'synthetic-legacy'),sharedRoot:path.join(os.tmpdir(),'synthetic-shared'),preloadEnabled:false,retainPlayback:true},readCurrentBytes:forbidden},{createSession:forbidden,createStore:forbidden});
    try{assert.deepEqual(await source.preload(context,{},1),{state:'disabled'});assert.equal(source.status().preloadEnabled,false);assert.equal(work,0);}finally{await source.close();}
});
