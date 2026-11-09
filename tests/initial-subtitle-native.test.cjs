'use strict';
// Explicit opt-in: this test only accepts local synthetic fixtures. It never
// discovers an installed player, server, profile, or user's media URL.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const crypto = require('node:crypto'), {spawn} = require('node:child_process');
const {NativeHelperClient} = require('../src/electronapp/native-helper/controller');
const inputs = ['HELPER', 'DLL', 'MEDIA', 'SUBTITLE', 'PARENT'].map(key => process.env['ETE_SUBTITLE_TEST_' + key]);

test('compiled helper selects before playback and retires initial subtitle plans', {
    skip: process.platform !== 'win32' || inputs.some(value => !value) ? 'Requires explicitly supplied hidden parent, compiled helper, pinned DLL and local synthetic fixtures' : false,
    timeout: 90000
}, async t => {
    for (const file of inputs) assert.ok(path.isAbsolute(file) && fs.statSync(file).isFile());
    const [helper, dll, media, subtitle, parentPath] = inputs;
    const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    assert.equal(hash(dll), '965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c');
    const requests = [], results = [], size = fs.statSync(media).size;
    let activeCase = '', parent, client;
    const server = http.createServer((req, res) => {
        const match = /^bytes=(\d+)-$/.exec(req.headers.range || ''), start = match ? Number(match[1]) : 0;
        assert.ok(start >= 0 && start < size);
        requests.push({case: activeCase, range: req.headers.range, start});
        res.writeHead(match ? 206 : 200, {'Content-Length': size-start, 'Content-Type':'video/x-matroska',
            'Accept-Ranges':'bytes', 'Connection':'close', ...(match ? {'Content-Range':`bytes ${start}-${size-1}/${size}`} : {})});
        setTimeout(() => { if (res.destroyed) return; const stream=fs.createReadStream(media,{start});
            res.on('close',()=>stream.destroy()); stream.pipe(res); }, start === 0 ? 200 : 0);
    });
    const wait = async (predicate, label) => {
        const deadline=Date.now()+10000;
        while (Date.now()<deadline) { if (await predicate()) return; await new Promise(r=>setTimeout(r,10)); }
        throw Error('timeout: '+label);
    };
    t.after(async () => {
        if (client) await client.kill().catch(()=>{});
        if (parent) parent.kill();
        server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
        const report={scope:'Production controller and complete compiled helper; pinned mpv; hidden surface; synthetic HTTP. No visible-frame or original-media acceptance.',
            hashes:{helper:hash(helper),dll:hash(dll),media:hash(media)}, results,requests};
        if (process.env.ETE_SUBTITLE_TEST_REPORT) fs.writeFileSync(process.env.ETE_SUBTITLE_TEST_REPORT,JSON.stringify(report,null,2));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${server.address().port}/fixture`;
    parent=spawn(parentPath,[],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const handle=await new Promise((resolve,reject)=>{parent.stdout.once('data',data=>resolve(String(data).trim()));parent.once('error',reject);});
    assert.match(handle,/^\d+$/);
    const cases=[];
    for(const mapping of ['container-index','output-order']) for(const external of [false,true]) for(const index of [0,2,3])
        cases.push({name:`${mapping}-${index}-external-${external}`,mapping,index,external});
    for(const action of ['cancel','invalid','replace-plan','new-generation','stop-replay','retire-in-flight']) cases.push({name:action,index:3,action});
    for(const spec of cases) await t.test(spec.name,async subtest=>{
        activeCase=spec.name; const events=[]; let added=false;
        client=new NativeHelperClient({helperPath:helper,libmpvPath:dll,parentWindowHandle:handle,
            expectedLibmpvVersion:'mpv v0.41.0-920-gdd5d17d32',onEvent:event=>{
                events.push(event);
                if(spec.external && event.name==='start-file' && !added){added=true;client.submitCommand(['sub-add',subtitle,'cached']);}
            }});
        const owned=client;
        subtest.after(async()=>{await owned.kill().catch(()=>{});if(client===owned)client=null;});
        await client.start();
        let generation=client.beginGeneration(spec.name,['core-idle','eof-reached']);
        const setup=()=>{for(const [name,value] of Object.entries({start:'481',sid:'no','keep-open':'yes',hwdec:'no'}))client.setProperty(name,value);};
        setup();
        const plan={mapping:spec.mapping||'container-index',index:spec.index,ordinal:[0,2,3].indexOf(spec.index),count:3};
        client.setProperty('initial-subtitle',JSON.stringify(plan));
        let expected=spec.index;
        if(spec.action==='cancel'){client.setProperty('initial-subtitle','none');expected=null;}
        if(spec.action==='invalid'){client.setProperty('initial-subtitle','{"mapping":"container-index","index":-1}');expected=null;}
        if(spec.action==='replace-plan'){client.setProperty('initial-subtitle',JSON.stringify({mapping:'container-index',index:0}));expected=0;}
        if(spec.action==='new-generation' || spec.action==='stop-replay'){
            if(spec.action==='stop-replay') await client.stop();
            const old=generation;generation=client.beginGeneration('replacement',['core-idle','eof-reached']);setup();
            client.command('set-property',{name:'initial-subtitle',value:JSON.stringify(plan)},old);
            expected=null;
        }
        client.load(['loadfile',url]);
        if(spec.action==='retire-in-flight'){
            await wait(()=>events.some(e=>e.name==='start-file'),'old start');
            const old=generation;generation=client.beginGeneration('replacement',['core-idle','eof-reached']);setup();
            client.command('set-property',{name:'initial-subtitle',value:JSON.stringify(plan)},old);
            client.load(['loadfile',url]);expected=null;
        }
        await wait(()=>events.some(e=>e.generationId===generation && e.name==='core-idle' && e.value===false),'core playing');
        const selected=(await client.getProperty('track-list')).filter(track=>track.type==='sub'&&track.selected);
        if(expected===null) assert.deepEqual(selected,[]);
        else {assert.equal(selected.length,1);assert.equal(selected[0].external,false);assert.equal(selected[0]['ff-index'],expected);}
        // The hook is one-shot; ordinary mid-play changes remain effective.
        if(spec.name==='container-index-0-external-false'){
            client.submitCommand(['sub-add',subtitle,'select']);
            await wait(async()=> (await client.getProperty('track-list')).some(x=>x.type==='sub'&&x.external&&x.selected),'external selected');
            for(const index of [0,3,2,2]){
                const table=await client.getProperty('track-list'), target=table.find(x=>x.type==='sub'&&!x.external&&x['ff-index']===index);
                client.setProperty('sid','no');client.setProperty('sid',target.id);
                await wait(async()=> (await client.getProperty('track-list')).some(x=>x.type==='sub'&&!x.external&&x['ff-index']===index&&x.selected),'internal selected');
            }
        }
        results.push({name:spec.name,generation,expected,selected:selected.map(x=>({id:x.id,index:x['ff-index'],external:x.external})),passed:true});
        await client.stop();await client.kill();client=null;
    });
});
