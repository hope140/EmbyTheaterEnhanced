'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main(args = process.argv.slice(2)) {
    if (args.length !== 2 || !path.isAbsolute(args[0]) || !path.isAbsolute(args[1])) {
        throw Error('Usage: node tools/check-detail-store-renderer.cjs <installed Chromium executable> <new absolute evidence directory>');
    }
    const executable = path.resolve(args[0]);
    const output = path.resolve(args[1]);
    if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) throw Error('Chromium executable does not exist: ' + executable);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    fs.mkdirSync(output); // Evidence is immutable by default: require a fresh destination.

    const root = path.resolve(__dirname, '..');
    const storePath = 'src/electronapp/enhanced/detail-cache/store.js';
    const storeSource = fs.readFileSync(path.join(root, storePath), 'utf8');
    const alamedaSource = fs.readFileSync(path.join(root, 'vendor/web-snapshot/www/modules/alameda/alameda.js'), 'utf8');
    const {chromium} = require('playwright');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ete-detail-store-profile-'));
    const report = {status: 'failed', browser: null, scenarios: [], routes: [], scope: 'Real Alameda AMD loading and browser IndexedDB in a disposable Chromium profile; every HTTP request is route-fulfilled or aborted; synthetic fixtures only, no Emby server, Electron, or Work service.'};
    let context;
    const launch = () => chromium.launchPersistentContext(profile, {executablePath: executable, headless: true});
    const openSyntheticPage = async ctx => {
        const p = await ctx.newPage();
        p.on('pageerror', error => { (report.pageErrors ||= []).push(error.message); });
        await p.route('**/*', async route => {
            const url = new URL(route.request().url());
            report.routes.push({origin: url.origin, pathname: url.pathname});
            if (url.origin !== 'http://127.0.0.1:41837') return route.abort();
            if (url.pathname === '/') return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><script src="/modules/alameda/alameda.js"></script><script>require.config({baseUrl:location.origin+"/"});window.storeReady=new Promise((resolve,reject)=>require(["enhanced/detail-cache/store.js"],m=>{window.detailStore=m.default||m;resolve();},reject));</script>'});
            if (url.pathname === '/modules/alameda/alameda.js') return route.fulfill({status:200,contentType:'application/javascript',body:alamedaSource});
            if (url.pathname === '/enhanced/detail-cache/store.js') return route.fulfill({status:200,contentType:'application/javascript',body:storeSource});
            return route.abort();
        });
        await p.goto('http://127.0.0.1:41837/');
        await p.evaluate(() => window.storeReady);
        return p;
    };
    try {
        context = await launch();
        const browser = context.browser();
        report.browser = browser.version();
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            report.routes.push({origin: url.origin, pathname: url.pathname});
            if (url.origin !== 'http://127.0.0.1:41837') return route.abort();
            if (url.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="/modules/alameda/alameda.js"></script><script>require.config({baseUrl:location.origin+"/"});window.storeReady=new Promise((resolve,reject)=>require(["enhanced/detail-cache/store.js"],m=>{window.detailStore=m.default||m;resolve();},reject));</script></body></html>'});
            if (url.pathname === '/modules/alameda/alameda.js') return route.fulfill({status: 200, contentType: 'application/javascript', body: alamedaSource});
            if (url.pathname === '/enhanced/detail-cache/store.js') return route.fulfill({status: 200, contentType: 'application/javascript', body: storeSource});
            return route.abort();
        });
        await page.goto('http://127.0.0.1:41837/');
        await page.evaluate(() => window.storeReady);
        assert.equal(await page.evaluate(() => typeof detailStore.create), 'function');
        assert.deepEqual(pageErrors, []);

        const persistence = await page.evaluate(async () => {
            const s = detailStore.create(indexedDB, 'synthetic-detail-persistence');
            const t = s.ticket({server: 'srv', endpoint: 'https://server.invalid', user: 'usr', item: 'persist', representation: 'detail-v1'});
            await s.write(t, {Id:'persist', Type:'Movie', Name:'Persisted title', Overview:'survive browser restart'});
            await s.close();
            localStorage.setItem('detail-store-sentinel', 'localStorage survives');
            document.cookie = 'detail-store-sentinel=cookie-survives; Path=/';
            const other = await new Promise((resolve, reject) => { const req = indexedDB.open('synthetic-unowned-sentinel', 1); req.onupgradeneeded = () => req.result.createObjectStore('sentinel'); req.onerror = () => reject(req.error); req.onsuccess = () => { const db=req.result, tx=db.transaction('sentinel','readwrite'); tx.objectStore('sentinel').put('other database survives','key'); tx.oncomplete=()=>{db.close();resolve(true);}; }; });
            return {other};
        });
        assert.equal(persistence.other, true);
        await page.close();
        await context.close(); context = null;

        context = await launch();
        const page2 = await context.newPage();
        const errors2 = [];
        page2.on('pageerror', error => errors2.push(error.message));
        await page2.route('**/*', async route => {
            const url = new URL(route.request().url());
            report.routes.push({origin: url.origin, pathname: url.pathname});
            if (url.origin !== 'http://127.0.0.1:41837') return route.abort();
            if (url.pathname === '/') return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><script src="/modules/alameda/alameda.js"></script><script>require.config({baseUrl:location.origin+"/"});window.storeReady=new Promise((resolve,reject)=>require(["enhanced/detail-cache/store.js"],m=>{window.detailStore=m.default||m;resolve();},reject));</script>'});
            if (url.pathname === '/modules/alameda/alameda.js') return route.fulfill({status:200,contentType:'application/javascript',body:alamedaSource});
            if (url.pathname === '/enhanced/detail-cache/store.js') return route.fulfill({status:200,contentType:'application/javascript',body:storeSource});
            return route.abort();
        });
        await page2.goto('http://127.0.0.1:41837/');
        await page2.evaluate(() => window.storeReady);
        const persisted = await page2.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-detail-persistence');
            const t=s.ticket({server:'srv',endpoint:'https://server.invalid',user:'usr',item:'persist',representation:'detail-v1'});
            const hit=await s.read(t);
            const other=await new Promise((resolve,reject)=>{const req=indexedDB.open('synthetic-unowned-sentinel');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('sentinel'),get=tx.objectStore('sentinel').get('key');get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};});
            const result={hit,localStorage:localStorage.getItem('detail-store-sentinel'),cookie:document.cookie,other};
            await s.close();return result;
        });
        assert.deepEqual(persisted.hit, {status:'hit',dto:{Id:'persist',Type:'Movie',Name:'Persisted title',Overview:'survive browser restart'}});
        assert.equal(persisted.localStorage, 'localStorage survives');
        assert.match(persisted.cookie, /detail-store-sentinel=cookie-survives/);
        assert.equal(persisted.other, 'other database survives');
        report.scenarios.push({name:'Alameda loads the store through real IndexedDB; a browser restart with the same isolated profile preserves its row and unrelated storage', status:'passed'});

        const projection = await page2.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-detail-projection');
            const scope={server:'s',endpoint:'https://e.invalid',user:'u',item:'safe',representation:'full'};
            const t=s.ticket(scope);
            const source={Id:'safe',Type:'Episode',Name:'Safe title',Overview:'Plain description',ProductionYear:2024,ImageTags:{Primary:'tag'},Token:'TOKEN_CANARY',UserData:{Played:true,Private:'USERDATA_CANARY'},MediaSources:[{Path:'MEDIA_PATH_CANARY',DirectStreamUrl:'URL_CANARY'}],Path:'PATH_CANARY',Url:'URL_CANARY',ImageUrl:'IMAGE_URL_CANARY'};
            const write=await s.write(t,source), read=await s.read(t);
            await s.close();return {write,read,json:JSON.stringify(read.dto),keys:Object.keys(read.dto)};
        });
        assert.equal(projection.read.status, 'hit');
        assert.deepEqual(projection.keys.sort(), ['Id','Type','Name','Overview','ProductionYear','PrimaryImageTag'].sort());
        for (const canary of ['TOKEN_CANARY','USERDATA_CANARY','MEDIA_PATH_CANARY','URL_CANARY','PATH_CANARY','IMAGE_URL_CANARY']) assert.equal(projection.json.includes(canary), false, 'sensitive canary leaked: ' + canary);
        assert.deepEqual(projection.read.dto, {Id:'safe',Type:'Episode',Name:'Safe title',Overview:'Plain description',ProductionYear:2024,PrimaryImageTag:'tag'});
        report.scenarios.push({name:'projected DTO contains only the approved detail fields and excludes Token, UserData, MediaSources, paths, and URL canaries', status:'passed'});

        const isolation = await page2.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-detail-isolation');
            const base={server:'server',endpoint:'https://endpoint.invalid',user:'user',item:'same',representation:'rep'};
            const original=s.ticket(base); await s.write(original,{Id:'same',Type:'Movie',Name:'Identity row',Overview:''});
            const dimensions=['server','endpoint','user','item','representation'], misses=[];
            for(const dim of dimensions){const changed={...base,[dim]:base[dim]+'-changed'};misses.push({dimension:dim,status:(await s.read(s.ticket(changed))).status});}
            const same=await s.read(s.ticket(base)); await s.close();return {misses,same};
        });
        assert.deepEqual(isolation.misses, ['server','endpoint','user','item','representation'].map(dimension=>({dimension,status:'miss'})));
        assert.equal(isolation.same.status,'hit');
        report.scenarios.push({name:'server, endpoint, user, item, and representation identity dimensions isolate cached rows', status:'passed'});

        const ticketOwnership = await page2.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-detail-ticket-ownership');
            const scope={server:'s',endpoint:'e',user:'u',item:'same-item',representation:'rep'};
            const old=s.ticket(scope); await s.write(old,{Id:'same-item',Type:'Movie',Name:'original',Overview:''});
            const current=s.ticket(scope);
            const staleWrite=await s.write(old,{Id:'same-item',Type:'Movie',Name:'stale overwrite',Overview:''});
            const preserved=await s.read(current);
            const currentWrite=await s.write(current,{Id:'same-item',Type:'Movie',Name:'current value',Overview:''});
            const staleRemove=await s.remove(old);
            const afterStaleRemove=await s.read(current);
            const tickets=[];
            for(let i=0;i<201;i++)tickets.push(s.ticket({server:'s',endpoint:'e',user:'u',item:'cap-'+i,representation:'r'}));
            const result={staleWrite,preserved,currentWrite,staleRemove,afterStaleRemove,oldCurrent:s.current(old),latestCurrent:s.current(tickets[200]),firstAfterCapacity:s.current(tickets[0]),remainingCurrent:tickets.slice(1).every(t=>s.current(t))};
            await s.close();return result;
        });
        assert.equal(ticketOwnership.staleWrite.status,'ignored');
        assert.equal(ticketOwnership.preserved.dto.Name,'original');
        assert.equal(ticketOwnership.currentWrite.status,'ok');
        assert.equal(ticketOwnership.staleRemove.status,'ignored');
        assert.equal(ticketOwnership.afterStaleRemove.dto.Name,'current value');
        assert.equal(ticketOwnership.oldCurrent,false);
        assert.equal(ticketOwnership.latestCurrent,true);
        assert.equal(ticketOwnership.firstAfterCapacity,false);
        assert.equal(ticketOwnership.remainingCurrent,true);
        report.scenarios.push({name:'a newer ticket for the same key retires its predecessor; stale writes/removes are ignored and the ticket map retains only the latest 200 keys', status:'passed'});

        const lru = await page2.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-detail-lru');
            const tickets=[];
            for(let i=0;i<200;i++){const t=s.ticket({server:'s',endpoint:'e',user:'u',item:'i'+i,representation:'r'});tickets.push(t);await s.write(t,{Id:'i'+i,Type:'Movie',Name:'Item '+i,Overview:''});}
            const before=await s.snapshot();
            const touched=(await s.read(tickets[0])).status;
            const next=s.ticket({server:'s',endpoint:'e',user:'u',item:'i201',representation:'r'});
            await s.write(next,{Id:'i201',Type:'Movie',Name:'Item 201',Overview:''});
            const touchedAfterTicketTrim=(await s.read(s.ticket({server:'s',endpoint:'e',user:'u',item:'i0',representation:'r'}))).status;
            const evicted=(await s.read(s.ticket({server:'s',endpoint:'e',user:'u',item:'i1',representation:'r'}))).status;
            const result={before,after:await s.snapshot(),touched,touchedAfterTicketTrim,evicted,newest:(await s.read(next)).status};
            await s.close();return result;
        });
        assert.equal(lru.before.entries,200);
        assert.equal(lru.after.entries,200);
        assert.equal(lru.touched,'hit'); assert.equal(lru.touchedAfterTicketTrim,'hit'); assert.equal(lru.evicted,'miss'); assert.equal(lru.newest,'hit');
        report.scenarios.push({name:'201 writes enforce the 200-entry LRU cap; touching entry 0 protects its persisted row and the next write evicts entry 1', status:'passed'});

        const budgets = await page2.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-detail-byte-budget');
            const oversized=s.ticket({server:'s',endpoint:'e',user:'u',item:'huge',representation:'r'});
            const tooLarge=await s.write(oversized,{Id:'huge',Type:'Movie',Name:'Huge',Overview:'界'.repeat(24000)});
            const results=[];
            for(let i=0;i<190;i++){const t=s.ticket({server:'s',endpoint:'e',user:'u',item:'b'+i,representation:'r'});await s.write(t,{Id:'b'+i,Type:'Movie',Name:'Budget item '+i,Overview:'x'.repeat(24000)});}
            const snapshot=await s.snapshot();
            const first=s.ticket({server:'s',endpoint:'e',user:'u',item:'b0',representation:'r'}), last=s.ticket({server:'s',endpoint:'e',user:'u',item:'b189',representation:'r'});
            results.push((await s.read(first)).status,(await s.read(last)).status);
            await s.close();return {tooLarge,snapshot,first:results[0],last:results[1]};
        });
        assert.equal(budgets.tooLarge.status,'ignored','serialized DTO over 64 KiB must be rejected');
        assert.ok(budgets.snapshot.entries < 190, '4 MiB budget should evict at least one entry');
        assert.ok(budgets.snapshot.serializedBytes <= 4 * 1024 * 1024 - 128, 'the shared metadata reserve must remain inside the 4 MiB cap');
        assert.equal(budgets.first,'miss'); assert.equal(budgets.last,'hit');
        report.scenarios.push({name:'oversized UTF-8 entry is rejected at the 64 KiB per-entry limit and 190 large entries remain within the 4 MiB total budget by eviction', status:'passed', evidence:{entries:budgets.snapshot.entries,serializedBytes:budgets.snapshot.serializedBytes}});

        const healing = await page2.evaluate(async () => {
            const name='synthetic-detail-healing', s=detailStore.create(indexedDB,name);
            await s.write(s.ticket({server:'s',endpoint:'e',user:'u',item:'valid',representation:'r'}),{Id:'valid',Type:'Movie',Name:'Valid',Overview:''});
            await s.close();
            const mismatchTicket=s.ticket({server:'s',endpoint:'e',user:'u',item:'mismatch',representation:'r'});
            const extraTicket=s.ticket({server:'s',endpoint:'e',user:'u',item:'extra',representation:'r'});
            const hugeScope={server:'s'.repeat(2048),endpoint:'e'.repeat(2048),user:'u'.repeat(2048),item:'large-row',representation:'r'.repeat(2048)};
            const hugeTicket=s.ticket(hugeScope);
            let chars=17000, hugeDto, dtoBytes, rowBytes;
            do {
                hugeDto=detailStore.project({Id:'large-row',Type:'Movie',Name:'Large persisted row',Overview:'界'.repeat(chars)});
                dtoBytes=detailStore.size(hugeDto);
                rowBytes=new TextEncoder().encode(JSON.stringify({key:hugeTicket.key,dto:hugeDto,access:999})).length;
                if(dtoBytes<=65536&&rowBytes>65536)break;
                chars+=50;
            } while(chars<=24000);
            if(!(dtoBytes<=65536&&rowBytes>65536))throw Error('fixture could not place row metadata over 64 KiB while DTO remains under 64 KiB');
            await new Promise((resolve,reject)=>{const req=indexedDB.open(name,1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('entries','readwrite'),object=tx.objectStore('entries');
                object.put({key:mismatchTicket.key,dto:{Id:'wrong-id',Type:'Movie',Name:'Mismatch',Overview:''},access:999});
                object.put({key:extraTicket.key,dto:{Id:'extra',Type:'Movie',Name:'Extra',Overview:''},access:999,bytes:1});
                object.put({key:hugeTicket.key,dto:hugeDto,access:999});
                tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
            const next=detailStore.create(indexedDB,name), before=await next.snapshot();
            const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(name);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
            const remaining=await new Promise((resolve,reject)=>{const tx=db.transaction('entries'),object=tx.objectStore('entries'),keys=[mismatchTicket.key,extraTicket.key,hugeTicket.key],values=[];let left=keys.length;keys.forEach((key,index)=>{const req=object.get(key);req.onsuccess=()=>{values[index]=req.result;left--;if(!left)resolve(values);};req.onerror=()=>reject(req.error);});tx.oncomplete=()=>db.close();});
            await next.close();return {before,corruptRemaining:remaining.some(Boolean),dtoBytes,rowBytes,chars};
        });
        assert.equal(healing.before.entries,1); assert.equal(healing.corruptRemaining,false);
        assert.ok(healing.dtoBytes<=64*1024&&healing.rowBytes>64*1024);
        report.scenarios.push({name:'snapshot deletes DTO/key identity mismatches, legacy extra row fields, and a row over 64 KiB including serialized key/access metadata while preserving valid data', status:'passed',evidence:{dtoBytes:healing.dtoBytes,rowBytes:healing.rowBytes}});

        const fallback = await page2.evaluate(async () => {
            const s=detailStore.create(null,'synthetic-no-indexeddb'),t=s.ticket({server:'s',endpoint:'e',user:'u',item:'i',representation:'r'});
            return {write:await s.write(t,{Id:'i',Type:'Movie',Name:'Item',Overview:''}),read:await s.read(t),snapshot:await s.snapshot(),clear:await s.clear()};
        });
        assert.equal(fallback.write.status,'unavailable'); assert.equal(fallback.read.status,'unavailable');
        assert.equal(fallback.snapshot.status,'unavailable'); assert.equal(fallback.clear.status,'unavailable');
        report.scenarios.push({name:'unavailable IndexedDB degrades to explicit unavailable statuses without memory-backed success', status:'passed'});

        const retirement = await page2.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-detail-retirement');
            const removed=s.ticket({server:'s',endpoint:'e',user:'u',item:'removed',representation:'r'});
            await s.write(removed,{Id:'removed',Type:'Movie',Name:'Removed',Overview:''});
            const removeResult=await s.remove(removed), afterRemove=await s.write(removed,{Id:'removed',Type:'Movie',Name:'Stale write',Overview:''});
            const fresh=s.ticket({server:'s',endpoint:'e',user:'u',item:'fresh',representation:'r'});
            await s.write(fresh,{Id:'fresh',Type:'Movie',Name:'Fresh',Overview:''});
            const clearResult=await s.clear(), afterClear=await s.write(fresh,{Id:'fresh',Type:'Movie',Name:'Stale after clear',Overview:''});
            const final=await s.snapshot(); await s.close();return {removeResult,afterRemove,clearResult,afterClear,final,currentRemoved:s.current(removed),currentFresh:s.current(fresh)};
        });
        assert.equal(retirement.afterRemove.status,'ignored'); assert.equal(retirement.afterClear.status,'ignored');
        assert.equal(retirement.final.entries,0); assert.equal(retirement.currentRemoved,false); assert.equal(retirement.currentFresh,false);
        report.scenarios.push({name:'remove and clear retire their prior tickets so stale writes cannot repopulate the store', status:'passed'});

        const storageFailures = await page2.evaluate(async () => {
            const getter=detailStore.create(indexedDB,'synthetic-detail-storage-getter',{getItem(){throw Error('synthetic getItem failure');},setItem(){},removeItem(){}});
            const getterTicket=getter.ticket({server:'s',endpoint:'e',user:'u',item:'getter',representation:'r'});
            const getterResult={write:await getter.write(getterTicket,{Id:'getter',Type:'Movie',Name:'Getter',Overview:''}),read:await getter.read(getterTicket),snapshot:await getter.snapshot()};
            const writer=detailStore.create(indexedDB,'synthetic-detail-storage-writer',{getItem(){return null;},setItem(){throw Error('synthetic setItem failure');},removeItem(){throw Error('synthetic removeItem failure');}});
            const t=writer.ticket({server:'s',endpoint:'e',user:'u',item:'writer',representation:'r'});
            const seeded=await writer.write(t,{Id:'writer',Type:'Movie',Name:'Writer',Overview:''});
            const remove=await writer.remove(t), after={snapshot:await writer.snapshot(),read:await writer.read(writer.ticket({server:'s',endpoint:'e',user:'u',item:'writer',representation:'r'}))};
            await getter.close();await writer.close();return {getterResult,seeded,remove,after};
        });
        assert.equal(storageFailures.getterResult.write.status,'unavailable');
        assert.equal(storageFailures.getterResult.read.status,'unavailable');
        assert.equal(storageFailures.getterResult.snapshot.status,'unavailable');
        assert.equal(storageFailures.seeded.status,'ok');
        assert.equal(storageFailures.remove.status,'unavailable');
        assert.equal(storageFailures.after.snapshot.status,'unavailable');
        assert.equal(storageFailures.after.read.status,'unavailable');
        report.scenarios.push({name:'storage read/write exceptions degrade to unavailable and do not claim cache success',status:'passed'});

        const allRepresentations = await page2.evaluate(async () => {
            const name='synthetic-detail-all-representations', s=detailStore.create(indexedDB,name);
            const base={server:'s',endpoint:'e',user:'u',item:'same-media',representation:'detail'};
            const detail=s.ticket(base); await s.write(detail,{Id:'same-media',Type:'Movie',Name:'Detail',Overview:''});
            const alternate=s.ticket({...base,representation:'compact'}); await s.write(alternate,{Id:'same-media',Type:'Movie',Name:'Compact',Overview:''});
            const otherItem=s.ticket({...base,item:'other-media'}); await s.write(otherItem,{Id:'other-media',Type:'Movie',Name:'Other',Overview:''});
            const before=await s.snapshot(), removed=await s.remove(alternate), after=await s.snapshot();
            await s.close();return {name,before,removed,after,detailTicket:detail,alternateTicket:alternate,otherTicket:otherItem};
        });
        assert.equal(allRepresentations.before.entries,3);
        assert.equal(allRepresentations.removed.status,'ok');
        assert.equal(allRepresentations.after.entries,1);
        report.scenarios.push({name:'remove(item) deletes every persisted representation for that item while retaining unrelated items',status:'passed'});

        const cleanup = await page2.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-owned-name');
            await s.write(s.ticket({server:'s',endpoint:'e',user:'u',item:'owned',representation:'r'}),{Id:'owned',Type:'Movie',Name:'Owned',Overview:''});
            await s.clear();
            const local=localStorage.getItem('detail-store-sentinel'),cookie=document.cookie;
            const other=await new Promise((resolve,reject)=>{const req=indexedDB.open('synthetic-unowned-sentinel');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('sentinel'),get=tx.objectStore('sentinel').get('key');get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};});
            const databases=await indexedDB.databases(); await s.close();return {local,cookie,other,dbNames:databases.map(db=>db.name)};
        });
        assert.equal(cleanup.local,'localStorage survives'); assert.match(cleanup.cookie,/detail-store-sentinel=cookie-survives/);
        assert.equal(cleanup.other,'other database survives');
        assert.ok(cleanup.dbNames.includes('synthetic-owned-name'));
        assert.ok(cleanup.dbNames.includes('synthetic-unowned-sentinel'));
        report.scenarios.push({name:'owner clear empties only its own database; localStorage, cookies, and an unrelated IndexedDB sentinel survive', status:'passed'});

        await page2.close();
        await context.close(); context=null;
        context=await launch();
        const page3=await openSyntheticPage(context);
        const afterRepresentationRestart=await page3.evaluate(async () => {
            const s=detailStore.create(indexedDB,'synthetic-detail-all-representations');
            const base={server:'s',endpoint:'e',user:'u',item:'same-media'};
            const detail=await s.read(s.ticket({...base,representation:'detail'}));
            const compact=await s.read(s.ticket({...base,representation:'compact'}));
            const other=await s.read(s.ticket({...base,item:'other-media',representation:'detail'}));
            const snapshot=await s.snapshot();await s.close();return {detail,compact,other,snapshot};
        });
        assert.equal(afterRepresentationRestart.detail.status,'miss');
        assert.equal(afterRepresentationRestart.compact.status,'miss');
        assert.equal(afterRepresentationRestart.other.status,'hit');
        assert.equal(afterRepresentationRestart.snapshot.entries,1);
        report.scenarios.push({name:'after a browser restart, all deleted representations remain absent and the unrelated item remains persisted',status:'passed'});

        const abortedDelete=await page3.evaluate(async () => {
            const name='synthetic-detail-delete-abort', s=detailStore.create(indexedDB,name);
            const itemA=s.ticket({server:'s',endpoint:'e',user:'u',item:'item-a',representation:'r'});
            const itemB=s.ticket({server:'s',endpoint:'e',user:'u',item:'item-b',representation:'r'});
            await s.write(itemA,{Id:'item-a',Type:'Movie',Name:'A must stay quarantined',Overview:''});
            await s.write(itemB,{Id:'item-b',Type:'Movie',Name:'B is removed after failure',Overview:''});
            const originalTransaction=IDBDatabase.prototype.transaction, originalDelete=IDBObjectStore.prototype.delete;
            let targetTx=null, armed=true;
            try {
                IDBDatabase.prototype.transaction=function(...args){const tx=originalTransaction.apply(this,args);if(this.name===name&&args[1]==='readwrite'&&armed)targetTx=tx;return tx;};
                IDBObjectStore.prototype.delete=function(...args){const req=originalDelete.apply(this,args);if(this.name==='entries'&&targetTx&&armed){armed=false;const tx=targetTx;targetTx=null;queueMicrotask(()=>{try{tx.abort();}catch(_){}});}return req;};
                const failed=await s.remove(itemA);
                IDBDatabase.prototype.transaction=originalTransaction;
                IDBObjectStore.prototype.delete=originalDelete;
                const itemBLatest=s.ticket({server:'s',endpoint:'e',user:'u',item:'item-b',representation:'r'});
                const successfulOtherRemove=await s.remove(itemBLatest);
                const marker=localStorage.getItem(name+'-quarantine');
                await s.close();return {failed,successfulOtherRemove,marker};
            } finally {IDBDatabase.prototype.transaction=originalTransaction;IDBObjectStore.prototype.delete=originalDelete;await s.close();}
        });
        assert.equal(abortedDelete.failed.status,'unavailable');
        assert.equal(abortedDelete.successfulOtherRemove.status,'ok');
        assert.equal(abortedDelete.marker,'1','a later successful deletion must not clear the earlier failure quarantine');
        report.scenarios.push({name:'an actual IndexedDB delete transaction abort is recorded; a later successful removal of another item leaves the quarantine marker set',status:'passed'});

        await page3.close();
        await context.close(); context=null;
        context=await launch();
        const page4=await openSyntheticPage(context);
        const afterAbortRestart=await page4.evaluate(async () => {
            const name='synthetic-detail-delete-abort', s=detailStore.create(indexedDB,name);
            const a=s.ticket({server:'s',endpoint:'e',user:'u',item:'item-a',representation:'r'});
            const b=s.ticket({server:'s',endpoint:'e',user:'u',item:'item-b',representation:'r'});
            const before={a:await s.read(a),b:await s.read(b),snapshot:await s.snapshot(),marker:localStorage.getItem(name+'-quarantine')};
            const clear=await s.clear();
            const fresh=s.ticket({server:'s',endpoint:'e',user:'u',item:'item-a',representation:'r'});
            const after={clear,read:await s.read(fresh),snapshot:await s.snapshot(),marker:localStorage.getItem(name+'-quarantine')};
            await s.close();return {before,after};
        });
        assert.equal(afterAbortRestart.before.a.status,'miss');
        assert.equal(afterAbortRestart.before.b.status,'miss');
        assert.equal(afterAbortRestart.before.snapshot.status,'unavailable');
        assert.equal(afterAbortRestart.before.marker,'1');
        assert.equal(afterAbortRestart.after.clear.status,'ok');
        assert.equal(afterAbortRestart.after.read.status,'miss');
        assert.equal(afterAbortRestart.after.snapshot.entries,0);
        assert.equal(afterAbortRestart.after.marker,null);
        report.scenarios.push({name:'after a browser restart, failed-delete quarantine prevents stale rows returning; explicit owner clear removes them and releases the marker',status:'passed'});

        const flushing=await page4.evaluate(async () => {
            const name='synthetic-detail-flush', s=detailStore.create(indexedDB,name);
            await s.snapshot(); // Ensure the owner has an open native IDB connection before instrumenting one transaction.
            const originalTransaction=IDBDatabase.prototype.transaction;
            let armed=true,chainCount=0,firstHeld;
            const firstHeldPromise=new Promise(resolve=>{firstHeld=resolve;});
            try {
                IDBDatabase.prototype.transaction=function(...args){
                    const tx=originalTransaction.apply(this,args);
                    if(this.name===name&&args[1]==='readwrite'&&armed){
                        const nativeObjectStore=tx.objectStore.bind(tx);
                        Object.defineProperty(tx,'objectStore',{configurable:true,value:function(storeName){
                            const object=nativeObjectStore(storeName);
                            if(storeName!=='entries')return object;
                            return new Proxy(object,{get(target,property){
                                if(property==='getAll')return (...getArgs)=>{
                                    const request=target.getAll(...getArgs);
                                    if(armed){armed=false;let remaining=1000;const pump=()=>{if(remaining--<=0)return;chainCount++;if(chainCount===1)firstHeld();const next=target.getAll();next.addEventListener('success',pump,{once:true});};request.addEventListener('success',pump,{once:true});}
                                    return request;
                                };
                                const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
                            }});
                        }});
                    }
                    return tx;
                };
                const initialTicket=s.ticket({server:'s',endpoint:'e',user:'u',item:'committed',representation:'r'});
                const initialWrite=s.write(initialTicket,{Id:'committed',Type:'Movie',Name:'flush waits for this committed write',Overview:''});
                const flushPromise=s.flush();
                const observation=await Promise.race([flushPromise.then(()=> 'flushed-too-early'),firstHeldPromise.then(()=> 'native-idb-transaction-held')]);
                const afterFlushTicket=s.ticket({server:'s',endpoint:'e',user:'u',item:'rejected',representation:'r'});
                const rejectedWrite=await s.write(afterFlushTicket,{Id:'rejected',Type:'Movie',Name:'must not start after flush',Overview:''});
                const flushResult=await flushPromise,writeResult=await initialWrite;
                const count=chainCount;
                await s.close();
                const reopened=detailStore.create(indexedDB,name);
                const recovered=await reopened.read(reopened.ticket({server:'s',endpoint:'e',user:'u',item:'committed',representation:'r'}));
                await reopened.close();
                return {observation,chainCount:count,rejectedWrite,flushResult,writeResult,recovered};
            } finally {IDBDatabase.prototype.transaction=originalTransaction;await s.close();}
        });
        assert.equal(flushing.observation,'native-idb-transaction-held','flush must remain pending while the native IndexedDB transaction still has queued work');
        assert.ok(flushing.chainCount>1,'fixture must keep a real IndexedDB transaction active across chained requests');
        assert.equal(flushing.rejectedWrite.status,'unavailable','new writes must not start after flush begins');
        assert.equal(flushing.flushResult.status,'flushed');
        assert.equal(flushing.writeResult.status,'ok');
        assert.equal(flushing.recovered.status,'hit');
        assert.equal(flushing.recovered.dto.Name,'flush waits for this committed write');
        report.scenarios.push({name:'flush waits for an actually held IndexedDB transaction, refuses later writes, and preserves the committed cache row across owner recreation',status:'passed',evidence:{chainedRequests:flushing.chainCount}});

        assert.deepEqual(errors2, []);
        assert.deepEqual(report.pageErrors || [], []);
        report.status='passed';
        report.routes = report.routes.filter((entry,index,all)=>all.findIndex(x=>x.origin===entry.origin&&x.pathname===entry.pathname)===index);
        fs.writeFileSync(path.join(output,'report.json'), JSON.stringify(report,null,2)+'\n');
        console.log(JSON.stringify(report));
    } catch (error) {
        report.error = error.stack || String(error);
        fs.writeFileSync(path.join(output,'report.json'), JSON.stringify(report,null,2)+'\n');
        throw error;
    } finally {
        if (context) await context.close().catch(() => {});
        fs.rmSync(profile, {recursive:true,force:true});
    }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode=1; });
module.exports = {main};
