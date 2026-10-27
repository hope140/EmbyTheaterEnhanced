'use strict';
// Tool-only lexical observation of the verified store source. No process-global
// fs hooks, new timers, extra I/O, forced GC, or altered cache preparation.
const crypto=require('node:crypto'),path=require('node:path');
const {createRequire}=require('node:module');
const {performance}=require('node:perf_hooks');
const METHODS=new Set(['lstat','mkdir','realpath','readFile','readdir','writeFile','unlink','rename','open']);
const HANDLES=['stat','read','write','truncate','close'];
const CODES=new Set(['ENOENT','EACCES','EPERM','EBUSY','EIO','ENOSPC','EEXIST','EMFILE','ENFILE','ENOTDIR','EADDRINUSE']);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const need=(v,code)=>{if(!v)throw Error('store-bootstrap-'+code);};
function unionMs(rows){
  const sorted=rows.filter(r=>Number.isFinite(r.end)).map(r=>[r.start,r.end]).sort((a,b)=>a[0]-b[0]);
  let sum=0,start=null,end=null;
  for(const [a,b] of sorted){if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else{sum+=end-start;start=a;end=b;}}
  return sum+(start===null?0:end-start);
}
function install({target,filename,source,expectedSha256,root,emit=()=>{},context=()=>({}),onFailure=()=>{},
  now=()=>performance.now(),maxOperations=256},dependencies={}){
  need(target&&typeof target.createStore==='function'&&path.isAbsolute(filename||'')&&path.isAbsolute(root||''),'arguments');
  need(Buffer.isBuffer(source)&&/^[a-f0-9]{64}$/i.test(expectedSha256||'')&&sha(source)===expectedSha256.toLowerCase(),'source-mismatch');
  const text=source.toString('utf8');
  need(Buffer.from(text).equals(source)&&text.includes("const fs = require('node:fs/promises');")&&
    text.includes("const {acquireGuard} = require('../playback-range-identity');"),'source-contract');
  need(Number.isInteger(maxOperations)&&maxOperations>0&&maxOperations<=256,'limit');
  const requireModule=dependencies.requireModule||createRequire(filename);
  const utilization=dependencies.utilization||(()=>performance.eventLoopUtilization());
  const original=target.createStore,normalize=v=>process.platform==='win32'?v.toLowerCase():v;
  const owned=path.resolve(root),normalizedRoot=normalize(owned);
  let live=true,current=null,creates=0,operations=0,errors=0,dropped=0,restored=false;
  const summaries=[],handles=new Set();
  const fail=()=>{errors++;try{onFailure();}catch(_){};};
  const send=row=>{if(!live)return;try{const result=emit(row);if(result&&typeof result.catch==='function')result.catch(()=>{fail();});}catch(_){fail();}};
  function role(value){
    if(typeof value!=='string')return null;
    const absolute=path.resolve(value),relative=path.relative(normalizedRoot,normalize(absolute));
    if(relative==='')return 'root';
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return null;
    if(relative==='.owner')return 'owner';if(relative==='blocks')return 'blocks';
    if(relative==='index.json')return 'checkpoint';if(relative==='index.log')return 'journal';
    if(/^\.index-[a-f0-9-]+\.tmp$/.test(relative))return 'checkpoint-temp';
    if(relative.startsWith('blocks'+path.sep))return 'block';return 'other-owned';
  }
  function code(error){try{return CODES.has(error?.code)?error.code:null;}catch(_){return null;}}
  function observe(owner,operation,label,invoke,after){
    if(!live||!owner||owner.done)return invoke();
    if(owner.rows.length>=maxOperations){if(!owner.truncated){owner.truncated=true;dropped++;fail();}return invoke();}
    const row={id:++operations,operation,role:label,start:now(),end:null};owner.rows.push(row);
    send({event:'operation',phase:'begin',create:owner.id,id:row.id,generation:owner.generation,operation,role:label,requestMs:row.start});
    const settled=(outcome,value,error)=>{
      if(after&&outcome==='fulfilled'&&live&&!owner.done){try{after(value);}catch(_){fail();}}
      row.end=now();row.outcome=outcome;
      send({event:'operation',phase:'settled',create:owner.id,id:row.id,generation:owner.generation,operation,role:label,
        requestMs:row.start,elapsedMs:Math.max(0,row.end-row.start),outcome,...(code(error)?{code:code(error)}:{})});
    };
    let result;try{result=invoke();}catch(error){settled('threw',null,error);throw error;}
    if(result&&typeof result.then==='function')result.then(value=>settled('fulfilled',value),error=>settled('rejected',null,error)).catch(()=>{fail();});
    else settled('fulfilled',result);
    return result;
  }
  function restoreHandle(record){
    let bad=false;
    for(const method of record.methods){
      if(record.handle[method.name]!==method.wrapper){bad=true;continue;}
      if(method.descriptor)Object.defineProperty(record.handle,method.name,method.descriptor);else delete record.handle[method.name];
    }
    handles.delete(record);if(bad)fail();
  }
  function watchHandle(owner,handle,label){
    if(!handle||typeof handle!=='object')return;
    const record={owner,handle,methods:[]};handles.add(record);
    for(const name of HANDLES){
      if(typeof handle[name]!=='function')continue;
      const originalMethod=handle[name],descriptor=Object.getOwnPropertyDescriptor(handle,name);
      const wrapper=function(...args){return observe(owner,'handle.'+name,label,()=>originalMethod.apply(this,args));};
      handle[name]=wrapper;record.methods.push({name,descriptor,wrapper});
    }
  }
  const actualIO=requireModule('node:fs/promises'),wrappers=new Map();
  const observedIO=new Proxy(actualIO,{get(object,key){
    const value=Reflect.get(object,key);if(!METHODS.has(key)||typeof value!=='function')return value;
    if(!wrappers.has(key))wrappers.set(key,function(...args){
      if(!live||!current||current.done)return value.apply(object,args);
      const label=role(args[0]),owner=label?current:null;return observe(owner,'fs.'+key,label,()=>value.apply(object,args),
        key==='open'?handle=>watchHandle(owner,handle,label):null);
    });return wrappers.get(key);
  }});
  const identity=requireModule('../playback-range-identity');
  const observedIdentity={...identity,acquireGuard:function(...args){
    return observe(role(args[0])?current:null,'guard.acquire','root',()=>identity.acquireGuard.apply(this,args));
  }};
  const loaded={exports:{}};
  const observedRequire=id=>id==='node:fs/promises'?observedIO:id==='../playback-range-identity'?observedIdentity:requireModule(id);
  new Function('exports','require','module','__filename','__dirname',text)(loaded.exports,observedRequire,loaded,filename,path.dirname(filename));
  need(typeof loaded.exports.createStore==='function','factory');
  function replacement(...args){
    const options=args[0];
    if(!live||!options||typeof options.root!=='string'||normalize(path.resolve(options.root))!==normalizedRoot)return original.apply(this,args);
    if(current||options.io!==undefined||creates>=4){fail();return original.apply(this,args);}
    let generation=null;try{const value=context()?.generation;generation=Number.isSafeInteger(value)&&value>0?value:null;}catch(_){fail();}
    const owner={id:++creates,generation,start:now(),rows:[],done:false,truncated:false};current=owner;
    try{owner.utilization=utilization();}catch(_){owner.utilization=null;}
    send({event:'create',phase:'begin',create:owner.id,generation,requestMs:owner.start});
    const finish=outcome=>{
      owner.done=true;const end=now(),elapsedMs=Math.max(0,end-owner.start),awaitedMs=unionMs(owner.rows);
      const longest=[...owner.rows].filter(r=>r.end!==null).sort((a,b)=>(b.end-b.start)-(a.end-a.start))[0];
      let processWindow=null;
      try{const endValue=utilization();if(owner.utilization&&endValue){
        const activeMs=endValue.active-owner.utilization.active,idleMs=endValue.idle-owner.utilization.idle;
        if([activeMs,idleMs].every(v=>Number.isFinite(v)&&v>=0))processWindow={activeMs,idleMs,scope:'whole-process-during-create'};
      }}catch(_){}
      const summary={event:'create',phase:'settled',create:owner.id,generation,requestMs:owner.start,elapsedMs,outcome,
        operationCount:owner.rows.length,pendingOperations:owner.rows.filter(r=>r.end===null).length,truncated:owner.truncated,
        observedOperationUnionMs:awaitedMs,unattributedMs:Math.max(0,elapsedMs-awaitedMs),processWindow,
        longestOperation:longest?{operation:longest.operation,role:longest.role,elapsedMs:Math.max(0,longest.end-longest.start),outcome:longest.outcome}:null};
      if(current===owner)current=null;
      for(const record of [...handles])if(record.owner===owner)restoreHandle(record);
      summaries.push(summary);send(summary);
    };
    let result;try{result=loaded.exports.createStore.apply(this,args);}catch(error){finish('threw');throw error;}
    if(result&&typeof result.then==='function')result.then(()=>finish('fulfilled'),()=>finish('rejected')).catch(()=>{fail();});else finish('fulfilled');
    return result;
  }
  target.createStore=replacement;
  return {snapshot:()=>({mode:'verified-store-source-bootstrap-only',sourceSha256:sha(source),creates,operations,observerErrors:errors,
    dropped,pendingCreates:current?1:0,restored,summaries:summaries.map(v=>({...v}))}),restore(){
    if(restored)return;
    need(target.createStore===replacement,'owner');live=false;restored=true;target.createStore=original;
    for(const record of [...handles])restoreHandle(record);
  }};
}
module.exports={install,unionMs};
