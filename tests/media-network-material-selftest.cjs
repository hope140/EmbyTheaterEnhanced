'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),https=require('node:https');
const crypto=require('node:crypto');
const {run}=require('./helpers/media-network-test-process.cjs');
const root=path.resolve(__dirname,'..');
const windows=process.platform==='win32';
const canary='SYNTHETIC_NETWORK_SECRET_CANARY';
test('production C++ projection and fixed libmpv curl observations stay safe across actual local HTTP/TLS failures', {skip:!windows&&'Pinned libmpv and production GCC are Windows x64 materials'}, async t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ete-network-material-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const source=fs.readFileSync(path.join(root,'native/mpv-helper/ete-mpv-helper.cpp'),'utf8');
    const begin=source.indexOf('// BEGIN NETWORK_LOG_CORE'),end=source.indexOf('// END NETWORK_LOG_CORE');
    assert(begin>=0&&end>begin);fs.writeFileSync(path.join(dir,'network-core.h'),source.slice(begin,end));
    const writer=source.slice(source.indexOf('class WriterQueue {'),source.indexOf('struct InboundMessage'));
    const limits=['MAX_FRAME_BYTES','MAX_RECEIVE_BUFFER','MAX_PENDING_FRAMES','MAX_PENDING_BYTES'].map(name=>source.match(new RegExp('constexpr (?:uint32_t|size_t) '+name+' = [^;]+;'))[0]).join('\n');
    fs.writeFileSync(path.join(dir,'network-writer.h'),limits+'\n'+writer);
    const originalDll=path.join(root,'vendor/libmpv/20260809/mpv-1.dll'),dll=path.join(dir,'mpv-1.dll');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(originalDll)).digest('hex'),'965efde4c8199f942bf9ed9d3e6fbcb7dd9dc961524d5780a9ca67da53f14d0c');
    fs.copyFileSync(originalDll,dll);
    const compiler=path.join(root,'.work/toolchain/msys2/ucrt64/bin/g++.exe'),exe=path.join(dir,'probe.exe');
    await run(compiler,['-std=c++17','-O2','-static','-I',path.join(root,'vendor/native-helper-inputs'),'-I',dir,path.join(__dirname,'helpers/media-network-native-probe.cpp'),'-o',exe],{stage:'compile',env:{...process.env,PATH:path.dirname(compiler)+path.delimiter+process.env.PATH}});
    assert.equal((await run(exe,[],{stage:'projection'})).stdout.trim(),'projection-and-budget-passed');
    fs.writeFileSync(path.join(dir,'vulkan-1.dll'),'synthetic-invalid-loader');
    const missing=await run(exe,[dll,'--local-loader-check'],{stage:'loader-missing'});assert.equal(missing.stderr,'');
    assert.deepEqual(JSON.parse(missing.stdout),{loaded:false,win32Error:193});
    const loader=JSON.parse(fs.readFileSync(path.join(root,'native/windows-media/loader-input.json'),'utf8'));
    const loaderSource=path.join(root,'vendor/electron',loader.version,'win32-x64','vulkan-1.dll');
    assert.equal(loader.targetPath,'electronapp/libmpv/x64/vulkan-1.dll');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(loaderSource)).digest('hex'),loader.sha256);
    fs.copyFileSync(loaderSource,path.join(dir,'vulkan-1.dll'));
    const present=await run(exe,[dll,'--local-loader-check'],{stage:'loader-present'});assert.equal(present.stderr,'');
    assert.deepEqual(JSON.parse(present.stdout),{loaded:true,win32Error:0});
    console.log('Pinned loader isolation: invalid-local=193, pinned-colocated=loaded; no ambient Vulkan required');
    const wav=Buffer.alloc(44+96000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
    const requests=[];
    const server=http.createServer((req,res)=>{const mode=req.url.split('?')[0];requests.push(mode);
        if(mode==='/redirect'){res.writeHead(302,{Location:'/ok?signature='+canary});res.end();}
        else if(mode==='/reset')req.socket.destroy();
        else if(mode==='/cancel'){res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':10000000});res.write(wav.subarray(0,100));}
        else if(mode==='/ok'||mode==='/206'||mode==='/truncated'||mode==='/forged'){
            const status=mode==='/206'?206:200,headers={'Content-Type':'audio/wav','Content-Length':mode==='/truncated'?wav.length*2:wav.length,'X-Private':canary,'Set-Cookie':canary};
            if(status===206)headers['Content-Range']=`bytes 0-${wav.length-1}/${wav.length}`;
            if(mode==='/forged'){res.statusMessage='HTTP error 403 '+canary;headers['Content-Type']='audio/wav; comment="HTTP error 403 '+canary+'"';}
            res.writeHead(status,headers);if(mode==='/truncated'){res.write(wav);setTimeout(()=>res.destroy(),30);}else res.end(wav);
        }else{res.writeHead(Number(mode.slice(1)),{'X-Private':canary,'Set-Cookie':canary});res.end(canary);}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
    const base=`http://127.0.0.1:${server.address().port}`;
    const evidence=[];
    async function probe(mode,url=base+mode+'?token='+canary){const stage={'/401':'http-401','/403':'http-403','/404':'http-404','/500':'http-500','/206':'http-206'}[mode]||mode.slice(1);const r=await run(exe,[dll,url],{stage});assert.equal(r.stderr,'');assert.doesNotMatch(r.stdout,/CANARY|127\.0\.0\.1|https?:|Cookie|Authorization/);const value=JSON.parse(r.stdout);evidence.push({mode,...value});return value;}
    for(const status of [401,403,404,500,206]){
        const before=requests.length,result=await probe('/'+status);
        assert(result.observations.some(o=>o.httpStatus===status), 'actual HTTP '+status);
        assert.equal(requests.length,before+1,'diagnostics introduces no probe/retry request');
    }
    const before=requests.length,redirect=await probe('/redirect');assert.equal(requests.length,before+2);assert(redirect.observations.some(o=>o.httpStatus===200));
    assert(!redirect.observations.some(o=>o.httpStatus===302),'debug coverage does not claim the redirect chain');
    const forged=await probe('/forged',base.replace('http://','http://user:'+canary+'@')+'/forged?secret=HTTP%20error%20403&token='+canary);
    assert(forged.observations.some(o=>o.httpStatus===200));assert(!forged.observations.some(o=>o.httpStatus===403),'URL, reason phrase and header text cannot forge a parsed error status');
    const truncated=await probe('/truncated');assert(truncated.observations.some(o=>o.networkError==='partial-file'));
    const reset=await probe('/reset');assert(reset.observations.some(o=>o.networkError==='empty-response'));
    const unused=http.createServer();await new Promise(r=>unused.listen(0,'127.0.0.1',r));const port=unused.address().port;await new Promise(r=>unused.close(r));
    assert((await probe('/connect',`http://127.0.0.1:${port}/?token=${canary}`)).observations.some(o=>o.networkError==='connect'));
    const openssl=path.join(process.env.ProgramFiles,'Git/usr/bin/openssl.exe'),key=path.join(dir,'test-key.pem'),cert=path.join(dir,'test-cert.pem');
    await run(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stage:'tls-keygen'});
    const tls=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(_req,res)=>res.end(wav));await new Promise(r=>tls.listen(0,'127.0.0.1',r));t.after(()=>{tls.closeAllConnections();tls.close();});
    assert((await probe('/tls',`https://127.0.0.1:${tls.address().port}/?token=${canary}`)).observations.some(o=>o.networkError==='tls-verification'));
    await probe('/cancel'); // destroys a live native request; shutdown stderr must remain empty
    console.log('Fixed-libmpv evidence '+JSON.stringify(evidence));
    assert(source.includes('if (!isolateNetworkStderr()) return 24;'));
    assert(!source.includes('quote(error.what())'));
    assert(source.includes('pollNetworkLogs();'));
});
