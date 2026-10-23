'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p));
const patch=require('../../tools/patch-connectionmanager-transport.cjs').patchConnectionManager;
const cmSource=()=>patch(read('vendor/web-snapshot/www/modules/emby-apiclient/connectionmanager.js').toString());
function harness(fetcher=()=>{throw Error('Unexpected synthetic fetch');}, globals={}) {
    const modules=new Map(),requests=[],timers=new Set();
    const sandbox={console:{log(){},warn(){},error(){}},AbortController,DOMException,URL,URLSearchParams,setTimeout(fn,delay){let timer=setTimeout(()=>{timers.delete(timer);fn();},delay);timers.add(timer);return timer;},clearTimeout(timer){timers.delete(timer);clearTimeout(timer);},TextEncoder,TextDecoder,
        navigator:{},...globals,fetch:async(url,options)=>{requests.push({url,options});return fetcher(url,options);}};
    sandbox.window=sandbox;sandbox.self=sandbox;const context=vm.createContext(sandbox);
    vm.runInContext(read('vendor/web-snapshot/www/modules/babelhelpers.js').toString(),context);
    function load(name) {
        if(modules.has(name))return modules.get(name);
        const relative='modules/emby-apiclient/'+name;
        const maintained='src/electronapp/www/'+relative;
        const text=name==='connectionmanager.js'?cmSource():(fs.existsSync(path.join(root,maintained))?read(maintained):read('vendor/web-snapshot/www/'+relative)).toString();
        let result;const exports={};sandbox.define=(dependencies,factory)=>{
            const values=dependencies.map(dep=>dep==='exports'?exports:load(path.posix.normalize(path.posix.join(path.posix.dirname(name),dep))));
            result=factory(...values);if(result===undefined)result=exports;
        };
        vm.runInContext(text,context,{filename:relative});modules.set(name,result);return result;
    }
    return{load,requests,timers};
}
function storage(){const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}

module.exports={harness,storage};
