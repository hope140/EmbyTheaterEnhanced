'use strict';
// Test-only observation. Keep original store arguments, return values/Promises
// and admission behavior; never retry a skipped write or fill a missing range.
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyOf = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key) ? key : null;
function fields(value, names) {
  return Object.fromEntries(names.map(name => [name, typeof value?.[name] === 'boolean' || Number.isSafeInteger(value?.[name]) && value[name] >= 0 ? value[name] : null]));
}
function storeState(store) {
  const value = store.status();
  return {...fields(value, ['committed','reserved','pending','pendingCount','readers','current','next','entries','blocks','faulted','closed','unverifiedBytes']),currentKey:keyOf(value.currentKey)};
}
function proxyState(proxy) {
  return fields(proxy?.status(), ['receivedBytes','deliveredBytes','hitBytes','committedBytes','skippedWrites','captureBytes','peakCaptureBytes','writes','jobs','activeOrigins','activeBodies','pendingKeys','localReadTimeouts','localReadRefusals','peakWriteJobs']);
}
function create({now, context, onFailure = () => {}}) {
  const bindings = [], puts = [], samples = [], restores = [];
  const stores = new WeakMap();let storeSerial = 0;
  let errors = 0, dropped = 0, pending = 0, polls = 0, lastSignature = null, lastSample = null;
  const fail = () => {errors++;try {onFailure();} catch (_) {}};
  const safe = fn => {try {return fn();} catch (_) {fail();return null;}};
  const append = (rows, row) => {if(rows.length < 512) rows.push(row);else {dropped++;fail();}};
  function bind(key, identity, metadata, item, owner, store) {
    safe(() => append(bindings, {at:now(),storeInstance:stores.get(store)??null,key:keyOf(key),item,
      identityHash:hash(['server','account','item','mediaSource','resource','representation'].map(k=>identity?.[k]??null)),
      metadataHash:hash(['total','etag','lastModified','version'].map(k=>metadata?.[k]??null)),
      total:Number.isSafeInteger(metadata?.total)?metadata.total:null,owner:{...owner}}));
  }
  function watch(store) {
    if(stores.has(store)){fail();return;}
    stores.set(store,++storeSerial);
    const original = store.put;
    const replacement = function (...args) {
      const row = safe(() => ({id:puts.length+1,...context(),storeInstance:stores.get(store),key:keyOf(args[0]),offset:Number.isSafeInteger(args[1])&&args[1]>=0?args[1]:null,length:Buffer.isBuffer(args[2])?args[2].length:null,
        at:now(),before:storeState(store),outcome:'pending'}));
      if(row){append(puts,row);pending++;}
      const settle = (outcome, value) => {if(!row)return;safe(()=>{row.outcome=outcome;row.accepted=value===true;row.elapsedMs=Math.max(0,now()-row.at);row.after=storeState(store);});pending--;};
      let result;
      try {result=original.apply(this,args);} catch(error){settle('threw',false);throw error;}
      if(result&&typeof result.then==='function') result.then(value=>settle('fulfilled',value),()=>settle('rejected',false)).catch(fail);
      else settle('returned',result);
      return result;
    };
    store.put=replacement;
    restores.push(()=>{if(store.put!==replacement)throw Error('prefix-observer-owner');store.put=original;});
  }
  async function sample({store,proxy,key,offset,threshold,owner,item,phase}) {
    // Exactly the same one span call as the original prefix gate.
    const span = store && key ? await store.span(key,offset) : null;
    safe(()=>{
      polls++;
      const storeInstance=stores.get(store)??null;
      const binding=bindings.findLast(row=>row.key===key&&row.storeInstance===storeInstance);
      const row={phase,item,owner:{...owner},storeInstance,at:now(),poll:polls,key:keyOf(key),offset,threshold,
        binding:binding?{...binding}:null,span:span?{start:span.start,end:span.end}:null,
        store:store?storeState(store):null,proxy:proxyState(proxy)};
      const signature=JSON.stringify({...row,at:null,poll:null});
      if(signature!==lastSignature){append(samples,row);lastSignature=signature;}
      lastSample=row;
    });
    return {span,hit:proxy?.status().hitBytes??null};
  }
  function restore(){for(const undo of restores.reverse())safe(undo);restores.length=0;}
  function snapshot(){return structuredClone({bindings,puts,samples,lastSample,polls,pending,errors,dropped,restored:restores.length===0});}
  return {bind,watch,sample,restore,snapshot};
}
module.exports={create,storeState,proxyState};
