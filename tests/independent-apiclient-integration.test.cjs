'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),patch=require('../tools/patch-connectionmanager-transport.cjs').patchConnectionManager;
const read=p=>fs.readFileSync(path.join(root,p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const selection=JSON.parse(read('src/web-api/selection.json'));
const cmSource=()=>patch(read('vendor/web-snapshot/www/modules/emby-apiclient/connectionmanager.js').toString());
const {harness,storage}=require('./helpers/api-client-amd.cjs');

test('four maintained AMD outputs and MIT notice reproduce from fixed licensed inputs and source recipe',t=>{
    const input=JSON.parse(read('src/web-api/INPUT_MANIFEST.json'));
    for(const row of input.files){const b=read('src/web-api/'+row.path);assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);assert.equal(crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex'),row.git_blob_sha1);}
    for(const row of selection.inputs){const b=read(row.path);assert.equal(b.length,row.size);assert.equal(sha(b),row.sha256);}
    const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'ete-api-generation-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
    fs.cpSync(path.join(root,'src/web-api'),temporary,{recursive:true});
    const result=cp.spawnSync(process.execPath,[path.join(temporary,'tools/build-amd.mjs')],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    assert.equal(selection.outputs.length,4);
    for(const row of selection.outputs){const b=read(row.path);assert.equal(sha(b),row.sha256);assert.equal(b.length,row.size);assert.deepEqual(b,fs.readFileSync(path.join(temporary,'amd',path.basename(row.path))));}
    assert.equal(fs.existsSync(path.join(root,'src/electronapp/www/modules/emby-apiclient/mit-connectionmanager.js')),false,'the candidate CM is not selected');
    assert.deepEqual(read('src/electronapp/www/modules/emby-apiclient/LICENSE.md'),read('src/web-api/LICENSE.md'));
});

test('CM transform retains protected local text and after-connect reset ownership byte for byte',()=>{
    const before=read('vendor/web-snapshot/www/modules/emby-apiclient/connectionmanager.js').toString(),after=cmSource();
    function span(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a);return text.slice(a,b);}
    for(const [start,end]of[['  function getCacheKey(', '  function onConnectUserSignIn('],['  function afterConnectValidated(', '  function onSuccessfulConnection('],['          key: "resetRegistrationInfo",','          key: "createPin",']])assert.equal(span(after,start,end),span(before,start,end));
    assert.equal(after.split('instance.resetRegistrationInfo(result.ApiClient, !0);').length,2);
    assert.equal(after.split('"resetregistrationinfo"').length,before.split('"resetregistrationinfo"').length);
    assert.throws(()=>patch(before+' '),/fixed input mismatch/);new vm.Script(after);
});

test('real AMD ApiClientEx, Credentials and retained CM share client, storage and event identity',()=>{
    const h=harness(),events=h.load('events.js').default,Api=h.load('apiclient.js').default,Ex=h.load('apiclientex.js').default,Credentials=h.load('credentials.js').default,cm=h.load('connectionmanager.js').default;
    assert.strictEqual(h.load('events.js').default,events);const store=storage(),credentials=new Credentials(store),created=[];
    events.on(cm,'apiclientcreated',(e,client)=>created.push(client));
    cm.initialize(credentials,store,Ex,()=>Promise.resolve([]),{isSupported:()=>false},'ETE','test','Synthetic device','synthetic-id',()=>Promise.resolve({}),1);
    cm.setCurrentLocale('zh-CN');const info={Id:'synthetic-server',UserId:'synthetic-user',AccessToken:'synthetic-token',ManualAddress:'http://synthetic.invalid',LastConnectionMode:2};
    const client=cm.getApiClientFromServerInfo(info);assert(client instanceof Ex);assert(client instanceof Api);assert.strictEqual(cm.getApiClient(info.Id),client);
    assert.strictEqual(cm.getApiClientFromServerInfo(info),client);assert.equal(created.length,1);assert.equal(client.getCurrentLocale(),'zh-CN');assert.strictEqual(client.appStorage,store);
    assert.equal(credentials.credentials().Servers[0].Id,info.Id);assert.equal(client.getCurrentUserId(),info.UserId);assert.equal(client.accessToken(),info.AccessToken);assert.strictEqual(client.serverInfo(),info);
    assert.equal(h.requests.length,0,'module loading and saved-server selection do not issue network requests');
});

test('retained CM connects through canonical transport and invokes original two-argument reset boundary',async()=>{
    const h=harness(()=>({status:200,headers:{get:()=> 'application/json'},json:async()=>({Id:'synthetic-server',Version:'4.8.0.0',ServerName:'Synthetic'})}));
    const Ex=h.load('apiclientex.js').default,Credentials=h.load('credentials.js').default,cm=h.load('connectionmanager.js').default,store=storage(),resets=[];
    cm.initialize(new Credentials(store),store,Ex,()=>Promise.resolve([]),{isSupported:()=>false},'ETE','test','Synthetic device','synthetic-id',()=>Promise.resolve({}),1);
    // Spy only at the existing boundary. This is no claim of registration execution/acceptance.
    cm.resetRegistrationInfo=(...args)=>resets.push(args);
    const result=await cm.connectToServer({ManualAddress:'http://synthetic.invalid',ManualAddressOnly:true},{enableAutoLogin:false,reportCapabilities:false,enableWebSocket:false});
    assert.equal(result.State,'ServerSignIn');assert.strictEqual(result.ApiClient,cm.getApiClient('synthetic-server'));assert.equal(resets.length,1);assert.strictEqual(resets[0][0],result.ApiClient);assert.equal(resets[0][1],true);
    assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'http://synthetic.invalid/emby/system/info/public');assert.equal(h.timers.size,0,'winning probe retires its timers');
});
