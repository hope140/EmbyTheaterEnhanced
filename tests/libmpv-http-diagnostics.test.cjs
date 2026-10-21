'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),cp=require('node:child_process'),crypto=require('node:crypto');
const preparation=require('../tools/prepare-libmpv.cjs');
const asset='mpv-dev-x86_64-20260809-git-dd5d17d328.7z';
const source=`https://sourceforge.net/projects/mpv-player-windows/files/libmpv/${asset}/download`;
const secret='PRIVATE_FIXTURE_VALUE';
const archive=Buffer.concat([Buffer.from('377abcaf271c','hex'),Buffer.from('local synthetic archive; never executed')]);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');

async function fixture(t,mode) {
    const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'ete-http-diagnostic-')));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const requests=[];
    const server=http.createServer((req,res)=>{
        requests.push(req.url);
        assert.equal(req.socket.localAddress,'127.0.0.1');
        if(req.url==='/start') {
            const location=mode==='unsafe-redirect'
                ? `https://user:${secret}@downloads.sourceforge.net/project/mpv-player-windows/libmpv/${asset}?token=${secret}`
                : `https://downloads.sourceforge.net/project/mpv-player-windows/libmpv/${asset}?token=${secret}#${secret}`;
            res.writeHead(302,{'Location':location,'Content-Type':'text/plain','Set-Cookie':`session=${secret}`});
            res.end(secret);return;
        }
        if(mode==='transport-error') { req.socket.destroy();return; }
        const headers={'Content-Type':mode==='success'?'application/x-7z-compressed':mode==='malformed-headers'?`text/${secret}`:'text/html',
            'Server':mode==='malformed-headers'?`Bearer-${secret}`:mode==='date-header'?`nginx/1.27.0 (${secret})`:'cloudflare',
            'CF-Ray':mode==='malformed-headers'?`https://private.invalid/?token=${secret}`:'0123456789abcdef-DFW',
            'Retry-After':mode==='malformed-headers'?secret:mode==='date-header'?'Thu, 22 Oct 2026 00:00:00 GMT':'120',
            'Set-Cookie':`session=${secret}`,'Authorization':`Bearer ${secret}`,'X-Private':secret};
        const body=mode==='success'?archive:Buffer.from(secret);
        headers['Content-Length']=String(body.length);
        res.writeHead(mode==='success'?200:403,headers);res.end(body);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>server.close(resolve)));
    const base=`http://127.0.0.1:${server.address().port}`;
    const out=path.join(root,'archive.7z'),script=path.join(root,'fixture.ps1');
    fs.writeFileSync(script,`param($Downloader,$Base,$Output,$Source,$Bytes)
$ErrorActionPreference='Stop'
. $Downloader -SourceUrl $Source -Destination $Output -MaximumBytes $Bytes
$fixtureHandler=[System.Net.Http.HttpClientHandler]::new()
$fixtureHandler.AllowAutoRedirect=$false
$fixtureHandler.UseProxy=$false
$fixtureClient=[System.Net.Http.HttpClient]::new($fixtureHandler)
$fixtureClient.Timeout=[TimeSpan]::FromSeconds(10)
$fixtureClient.DefaultRequestHeaders.Add('Authorization','Bearer ${secret}')
try {
    $send={param($Uri)
        $suffix=if($Uri.Host -eq 'sourceforge.net'){'/start'}else{'/end'}
        $fixtureClient.GetAsync(($Base+$suffix),[System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
    }
    Invoke-PinnedLibmpvDownload -SourceUrl $Source -Destination $Output -MaximumBytes $Bytes -SendRequest $send | ConvertTo-Json -Depth 7 -Compress
} catch { [Console]::Error.WriteLine($_.Exception.Message);exit 1 }
finally {$fixtureClient.Dispose();$fixtureHandler.Dispose()}
`);
    const result=await new Promise((resolve,reject)=>{
        const downloader=path.resolve(__dirname,'../tools/download-libmpv.ps1');
        const args=mode==='cli-invalid'
            ? ['-NoProfile','-NonInteractive','-File',downloader,'-SourceUrl',base+`/start?token=${secret}`,'-Destination',out,'-MaximumBytes',String(archive.length)]
            : ['-NoProfile','-NonInteractive','-File',script,downloader,base,out,source+`?token=${secret}#${secret}`,String(archive.length)];
        const child=cp.spawn('pwsh',args,{stdio:['ignore','pipe','pipe']});
        let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('Local HTTP fixture timed out'));},20000);
        child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
        child.on('error',error=>{clearTimeout(timer);reject(error);});
        child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
    });
    return {root,out,requests,...result};
}
function diagnostic(result) {
    assert.equal(result.code,1);
    assert.doesNotMatch(result.stdout+result.stderr,new RegExp(secret+'|Set-Cookie|Authorization|X-Private|127\\.0\\.0\\.1|\\?token=','i'));
    assert.equal((result.stderr.match(/LIBMPV_HTTP_DIAGNOSTIC /g)||[]).length,1);
    return JSON.parse(result.stderr.slice(result.stderr.indexOf('LIBMPV_HTTP_DIAGNOSTIC ')+23).trim());
}

test('local HTTP 302 then 403 records two requests, one attempt, zero retries and only safe fields',async t=>{
    const r=await fixture(t,'forbidden'),d=diagnostic(r);
    assert.deepEqual(r.requests,['/start','/end']);
    assert.equal(d.event,'libmpv-http-failure');assert.match(d.attemptId,/^[a-f0-9-]{36}$/);
    assert.equal(d.reason,'http-status');assert.equal(d.requestCount,2);assert.equal(d.responseCount,2);
    assert.equal(d.requestCountScope,'explicit-transport-invocations');
    assert.equal(d.redirectCount,1);assert.equal(d.retryCount,0);
    assert.deepEqual(d.route.map(x=>x.status),[302,403]);
    assert.deepEqual(d.route.map(x=>x.host),['sourceforge.net','downloads.sourceforge.net']);
    assert.deepEqual(d.route[1].responseHeaders,{server:'cloudflare',cfRay:'0123456789abcdef-DFW',retryAfter:'120'});
    assert.equal(fs.existsSync(r.out),false);
});
test('malformed values in otherwise allowed response headers are redacted',async t=>{
    const r=await fixture(t,'malformed-headers'),d=diagnostic(r);
    assert.deepEqual(d.route[1].responseHeaders,{server:'other',cfRay:'redacted',retryAfter:'redacted'});
    assert.equal(d.route[1].contentType,'other');
    assert.equal(r.requests.length,2);
});
test('HTTP-date Retry-After is normalized and Server comments are never copied',async t=>{
    const r=await fixture(t,'date-header'),d=diagnostic(r);
    assert.equal(d.route[1].responseHeaders.server,'nginx');
    assert.equal(d.route[1].responseHeaders.retryAfter,'Thu, 22 Oct 2026 00:00:00 GMT');
});
test('credential-bearing redirects are refused before another request and never echoed',async t=>{
    const r=await fixture(t,'unsafe-redirect'),d=diagnostic(r);
    assert.equal(d.reason,'route-refused');assert.equal(d.requestCount,1);
    assert.deepEqual(r.requests,['/start']);assert.equal(d.route.length,1);
});
test('production CLI still refuses loopback HTTP without sending any request',async t=>{
    const r=await fixture(t,'cli-invalid'),d=diagnostic(r);
    assert.equal(d.reason,'invalid-source');assert.equal(d.requestCount,0);
    assert.deepEqual(r.requests,[]);assert.deepEqual(d.route,[]);
    assert.equal(fs.existsSync(r.out),false);
});
test('transport exceptions retain request counts without echoing exception details',async t=>{
    const r=await fixture(t,'transport-error'),d=diagnostic(r);
    assert.equal(d.reason,'transport');assert.equal(d.requestCount,2);assert.equal(d.responseCount,1);
    assert.equal(d.route[1].status,null);assert.equal(d.retryCount,0);
});
test('normal local archive bytes and the existing SHA256 gate remain unchanged',async t=>{
    const r=await fixture(t,'success');assert.equal(r.code,0,r.stderr);
    assert.equal(r.stderr,'');assert.deepEqual(r.requests,['/start','/end']);
    const receipt=JSON.parse(r.stdout);assert.deepEqual(Object.keys(receipt).sort(),['bytes','route']);
    assert.equal(receipt.bytes,archive.length);assert.deepEqual(receipt.route.map(x=>x.status),[302,200]);
    for(const hop of receipt.route)assert.deepEqual(Object.keys(hop).sort(),['contentType','host','path','status']);
    assert.deepEqual(fs.readFileSync(r.out),archive);
    const expected={size:archive.length,sha256:hash(archive)};preparation.verifyArchive(r.out,expected);
    const changed=Buffer.from(archive);changed[changed.length-1]^=1;fs.writeFileSync(r.out,changed);
    assert.throws(()=>preparation.verifyArchive(r.out,expected),/SHA256 mismatch/);
});
test('Node process boundary reports a child diagnostic exactly once and hides raw command failures',()=>{
    const modulePath=path.resolve(__dirname,'../tools/prepare-libmpv.cjs');
    const harness=`const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process');
const m={exports:{}};const realRequire=require;
const child={execFileSync:(file,args,options)=>{
 if(process.argv[1]==='empty'){const error=Error('private raw command ?token=${secret}');error.stderr='';throw error;}
 return cp.execFileSync(process.execPath,['-e',"process.stderr.write('LIBMPV_HTTP_DIAGNOSTIC fixture\\\\n');process.exit(1)"],options);
}};
let text=fs.readFileSync(${JSON.stringify(modulePath)},'utf8');
if(process.argv[1]==='legacy')text=text.replace(",stdio:['ignore','pipe','pipe']",'');
vm.runInNewContext(text+'\\nmodule.exports.download=download;',{require:n=>n==='node:child_process'?child:n==='./libmpv-input.cjs'?{}:realRequire(n),module:m,__dirname:${JSON.stringify(path.dirname(modulePath))},Buffer,console});
try{m.exports.download('https://sourceforge.net/fixed','unused',1)}catch(error){process.stderr.write(error.message);process.exitCode=1;}`;
    const actual=cp.spawnSync(process.execPath,['-e',harness,'diagnostic'],{encoding:'utf8'});
    assert.equal(actual.status,1);assert.equal((actual.stderr.match(/LIBMPV_HTTP_DIAGNOSTIC/g)||[]).length,1,actual.stderr);
    const legacy=cp.spawnSync(process.execPath,['-e',harness,'legacy'],{encoding:'utf8'});
    assert.equal(legacy.status,1);assert.equal((legacy.stderr.match(/LIBMPV_HTTP_DIAGNOSTIC/g)||[]).length,2,legacy.stderr);
    const empty=cp.spawnSync(process.execPath,['-e',harness,'empty'],{encoding:'utf8'});
    assert.equal(empty.status,1);assert.doesNotMatch(empty.stderr,new RegExp(secret));
    assert.match(empty.stderr,/without safe diagnostics/);
});
