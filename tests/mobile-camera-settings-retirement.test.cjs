'use strict';
// Actual desktop capability, route literals and server controller in isolated mocks.
// No real upload service, server, user storage or GUI is started.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),web=require('../tools/web-snapshot-input.cjs'),overlays=require('../tools/prepare-web-overlays.cjs');
const removed=['www/settings/cameraupload.js','www/settings/cameraupload.html'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const app=fs.readFileSync(path.join(root,web.WEB_ROOT,'app.js'),'utf8');
function routeLiteral(source,name){
    const at=source.indexOf('path: "'+name+'"');assert.ok(at>=0,name);
    const start=source.lastIndexOf('appRouter.addRoute({',at),open=source.indexOf('{',start);
    assert.ok(start>=0&&open<at);
    let depth=0,quote=null,escaped=false;
    for(let i=open;i<source.length;i++){
        const c=source[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue;}
        if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'&&--depth===0)return source.slice(open,i+1);
    }
    throw Error('Unclosed route literal');
}
test('native camera upload remains unavailable in the current Electron desktop host',()=>{
    let host;
    vm.runInNewContext(fs.readFileSync(path.join(root,'src/electronapp/apphost.js'),'utf8'),{window:{},navigator:{},self:{},document:{},define:(_deps,factory)=>{host=factory({});}});
    assert.equal(host.supports('cameraupload'),false);
    const caps={};vm.runInNewContext('caps.SupportsContentUploading = appHost.supports("cameraupload")',{caps,appHost:host});assert.equal(caps.SupportsContentUploading,false);
    assert.ok(app.includes('caps.SupportsContentUploading = appHost.supports("cameraupload")'));
    assert.equal(host.supports('multiserver'),true);
    assert.equal(host.supports('subtitleappearancesettings'),true);
    const start=app.indexOf('      "ios" === self.appMode\n        ? define("cameraUpload"');
    const end=app.indexOf('      define("detailtablecss"',start);assert.ok(start>=0&&end>start);
    const fragment=app.slice(start,end).trim().replace(/,$/,'');
    for(const mode of ['electron','ios','android']){
        const calls=[];
        vm.runInNewContext(fragment,{self:{appMode:mode},returnFirstDependency:()=>{},define:(name,deps)=>calls.push({name,deps:Array.from(deps)})});
        assert.deepEqual(calls,mode==='electron'?[]:[{name:'cameraUpload',deps:['native/'+mode+'/cameraupload']}]);
    }
});
test('desktop settings routes remain and server devices camera administration keeps its admin route',()=>{
    const routes=[];
    for(const name of ['/settings/display.html','/settings/playback.html','/settings/subtitles.html','/devices/cameraupload.html']){
        vm.runInNewContext('appRouter.addRoute('+routeLiteral(app,name)+')',{appRouter:{addRoute:route=>routes.push(route)}});
    }
    for(const route of routes){const module=route.controller.endsWith('.js')?route.controller:route.controller+'.js';assert.equal(fs.existsSync(path.join(root,web.WEB_ROOT,module)),true,module);assert.equal(fs.existsSync(path.join(root,web.WEB_ROOT,route.path.slice(1))),true,route.path);}
    const server=routes.find(route=>route.path==='/devices/cameraupload.html');
    assert.equal(server.roles,'admin');assert.equal(server.controller,'devices/cameraupload.js');assert.equal(server.controllerType,'module');
    assert.doesNotMatch(app,/settings\/cameraupload/);
    const nav=fs.readFileSync(path.join(root,web.WEB_ROOT,'modules/navdrawer/navdrawercontent.js'),'utf8');
    assert.ok(nav.includes('href: "/devices/cameraupload.html"'));
    assert.doesNotMatch(nav,/settings\/cameraupload/);
});
test('server devices controller still reads and updates only the devices named configuration',async()=>{
    const reads=[],writes=[],handlers={},loading=[];let saved=0,View;
    const nodes={
        '#txtUploadPath':{value:''},'#chkSubfolder':{checked:false},'.premiereInfo':{},
        '#btnSelectUploadPath':{addEventListener:(name,fn)=>{handlers['picker:'+name]=fn;}},
        '.devicesUploadForm':{addEventListener:(name,fn)=>{handlers[name]=fn;},closest:()=>view}
    };
    const view={querySelector:selector=>{assert.ok(nodes[selector],selector);return nodes[selector];}};
    function BaseView(element){this.view=element;}BaseView.prototype.onResume=function(){};
    const config={CameraUploadPath:'/synthetic/server/original',EnableCameraUploadSubfolders:true,OtherServerSetting:'keep'};
    const ApiClient={getNamedConfiguration:name=>{reads.push(name);return Promise.resolve({...config});},updateNamedConfiguration:(name,value)=>{writes.push({name,value:JSON.parse(JSON.stringify(value))});return Promise.resolve({ok:true});}};
    vm.runInNewContext(fs.readFileSync(path.join(root,web.WEB_ROOT,'devices/cameraupload.js'),'utf8'),{
        ApiClient,define:(_deps,factory)=>{
            const exports={};factory(exports,{default:BaseView},{},{},{},{default:{handleConfigurationSavedResponse:()=>saved++}},{default:{show:()=>loading.push('show'),hide:()=>loading.push('hide')}},{default:{translate:(text,value)=>text||value||''}});View=exports.default;
        },require:()=>{throw Error('No native or browser service should be loaded during this test');}
    });
    const controller=new View(view,{});controller.onResume({});await Promise.resolve();await Promise.resolve();
    assert.equal(nodes['#txtUploadPath'].value,config.CameraUploadPath);assert.equal(nodes['#chkSubfolder'].checked,true);
    nodes['#txtUploadPath'].value='/synthetic/server/selected';nodes['#chkSubfolder'].checked=false;
    let stopped=0,prevented=0;
    assert.equal(handlers.submit.call(nodes['.devicesUploadForm'],{stopPropagation:()=>stopped++,preventDefault:()=>prevented++}),false);
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    assert.deepEqual(reads,['devices','devices']);
    assert.deepEqual(writes,[{name:'devices',value:{CameraUploadPath:'/synthetic/server/selected',EnableCameraUploadSubfolders:false,OtherServerSetting:'keep'}}]);
    assert.equal(stopped,1);assert.equal(prevented,1);assert.equal(saved,1);assert.deepEqual(loading,['show','hide']);
});
test('active camera pair is absent while server devices files retain exact previous bytes',()=>{
    for(const name of removed)assert.equal(fs.existsSync(path.join(root,web.INPUT_ROOT,name)),false);
    for(const [name,expected]of Object.entries({'devices/cameraupload.js':'bbd038cc8c4244ce1393aba17950852527321afb52cebfd24fca5fea4dea3218','devices/cameraupload.html':'72a55e3b4b9be2c74ba5eaa2dd0cffcf0bad909b3c59a721f2d2286a78d9dd30'}))assert.equal(hash(fs.readFileSync(path.join(root,web.WEB_ROOT,name))),expected);
    for(const entry of web.load(root).files.filter(item=>/\.(?:js|html)$/.test(item.path))){
        const text=fs.readFileSync(path.join(root,web.INPUT_ROOT,entry.path),'utf8');
        assert.doesNotMatch(text,/settings\/cameraupload(?:\.js|\.html)?/,entry.path);
    }
});
test('production Web assembly and overlays contain no dangling mobile settings imports',t=>{
    fs.mkdirSync(path.join(root,'dist'),{recursive:true});const runtime=fs.mkdtempSync(path.join(root,'dist','mobile-camera-retirement-'));
    t.after(()=>fs.rmSync(runtime,{recursive:true}));
    const report=web.assemble(root,runtime);assert.equal(report.fileCount,716);assert.equal(report.runtimeFileCount,716);
    overlays.apply(root,runtime);assert.equal(overlays.inspect(root,runtime).status,'passed');
    for(const name of removed)assert.equal(fs.existsSync(path.join(runtime,'electronapp',name)),false);
    const result=fs.readFileSync(path.join(runtime,'electronapp/www/app.js'),'utf8');assert.doesNotMatch(result,/settings\/cameraupload/);
    assert.ok(result.includes('controller: "devices/cameraupload.js"'));assert.equal(fs.existsSync(path.join(runtime,'electronapp/www/devices/cameraupload.js')),true);
    const exclusions=require('../tools/runtime-exclusions.cjs');
    for(const name of removed){const file=path.join(runtime,'electronapp',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic stale mobile file');assert.equal(exclusions.verify(runtime).status,'failed');exclusions.remove(runtime);assert.equal(fs.existsSync(file),false);}
    assert.equal(hash(fs.readFileSync(path.join(runtime,'electronapp/www/devices/cameraupload.js'))),'bbd038cc8c4244ce1393aba17950852527321afb52cebfd24fca5fea4dea3218');
});
