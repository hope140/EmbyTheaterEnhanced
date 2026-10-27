'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function actualControlHandler(context){
  const file=path.join(__dirname,'../tools/shared-playback-cache/app-performance-runner.cjs');
  const source=fs.readFileSync(file,'utf8');
  const start=source.indexOf('control=http.createServer(');
  const end=source.indexOf(';\n    control.on(\'connection\'',start);
  assert(start>=0&&end>start,'control handler source markers');
  const expression=source.slice(start+'control='.length,end);
  let handler;
  const sandbox={http:{createServer(callback){handler=callback;return {}; }},Buffer,JSON,Object,Number,Promise,Error};
  for(const key of ['active','observed','fixture','events','sources','need'])Object.defineProperty(sandbox,key,{
    enumerable:true,get(){return context[key];},set(value){context[key]=value;}
  });
  vm.runInNewContext(expression,sandbox,{filename:file});
  assert.equal(typeof handler,'function');
  return handler;
}

function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function request(url,body,{aborted=false}={}){
  const consumed=deferred(),release=deferred();
  return {url,method:'POST',headers:{},aborted,
    async *[Symbol.asyncIterator](){
      const bytes=Buffer.from(body);const split=Math.max(1,Math.floor(bytes.length/2));
      yield bytes.subarray(0,split);consumed.resolve();await release.promise;yield bytes.subarray(split);
    },consumed,release};
}
function response(){
  const result={status:null,headers:{},body:null,destroyed:false,writableEnded:false};
  result.setHeader=(key,value)=>{result.headers[key]=value;};
  result.writeHead=status=>{result.status=status;return result;};
  result.end=body=>{result.body=body;result.writableEnded=true;result.done.resolve();};
  result.done=deferred();return result;
}
async function invoke(handler,req,res,afterFirstChunk){
  handler(req,res);
  await req.consumed.promise;
  if(afterFirstChunk)afterFirstChunk();
  req.release.resolve();
  if(res.destroyed)await new Promise(resolve=>setImmediate(resolve));
  else await res.done.promise;
}

function context(){
  const state0={bodyBytes:0,overlapBytes:0,ranges:[],advances:0},state1={bodyBytes:0,overlapBytes:0,ranges:[],advances:0};
  const calls=[],events=[];
  return {active:0,observed:[state0,state1],fixture:{media:{A:{size:10000}}},events,
    sources:{advancePaced(){calls.push('advance');return {advanced:true};}},calls,
    need(value,code){if(!value)throw Error(code);}};
}

test('control handler retires body-parsing requests before any per-case mutation',async()=>{
  const c=context(),handler=actualControlHandler(c);
  const staleAdvance=request('/advance/0',JSON.stringify({scenario:'boundary-seek'})),advanceRes=response();
  await invoke(handler,staleAdvance,advanceRes,()=>{c.active=1;});
  assert.equal(c.observed[0].advances,0);assert.equal(c.calls.length,0);
  assert.equal(advanceRes.status,400);

  c.active=0;
  const staleWindow=request('/window/0',JSON.stringify({ranges:[{start:0,end:32}]})),windowRes=response();
  await invoke(handler,staleWindow,windowRes,()=>{c.active=1;});
  assert.equal(windowRes.status,400);assert.deepEqual(c.observed[0].ranges,[]);

  for(const flags of [{aborted:true},{destroyed:true}]){
    c.active=0;
    const req=request('/advance/0',JSON.stringify({scenario:'boundary-seek'}),{aborted:flags.aborted}),res=response();
    await invoke(handler,req,res,()=>{if(flags.destroyed){res.destroyed=true;res.done.resolve();}});
    assert.equal(c.observed[0].advances,0,JSON.stringify(flags));
    assert.equal(c.calls.length,0,JSON.stringify(flags));
    assert.equal(res.status,flags.destroyed?null:400,JSON.stringify(flags));
  }
});

test('same-case advance sequence stays boundary, uncached, far and rejects duplicates',async()=>{
  const c=context(),handler=actualControlHandler(c);c.active=0;
  for(const scenario of ['boundary-seek','uncached-seek','far-seek']){
    const req=request('/advance/0',JSON.stringify({scenario})),res=response();
    // This test does not need a retirement transition; release the body normally.
    handler(req,res);await req.consumed.promise;req.release.resolve();await res.done.promise;
    assert.equal(res.status,null);assert.equal(c.observed[0].advances,c.calls.length);
  }
  const duplicate=request('/advance/0',JSON.stringify({scenario:'boundary-seek'})),duplicateRes=response();
  handler(duplicate,duplicateRes);await duplicate.consumed.promise;duplicate.release.resolve();await duplicateRes.done.promise;
  assert.equal(duplicateRes.status,400);assert.equal(c.observed[0].advances,3);assert.equal(c.calls.length,3);
});
