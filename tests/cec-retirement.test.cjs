'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {namedFunction,pluginRoutes}=require('./fixtures/settings-menu-routes.cjs');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/electronapp/main.js'),'utf8');
test('Electron has no CEC scheme, initialization, executable option or process owner',()=>{
    assert.doesNotMatch(source,/electroncec|registerCec|initCec|cecExePath|cecProcess|onCecCommand/);
    for(const file of ['cec/cec.js','cec/command-map.js','plugins/cec.js','plugins/cec/cec.js','plugins/cec/cec.html']) {
        assert.equal(fs.existsSync(path.join(root,'src/electronapp',file)),false,file);
    }
    assert.equal(pluginRoutes(root).some(route=>route.pluginId==='cecinput'||route.path.startsWith('cec/')),false);
    for(const token of ['registerAppHost();','registerFileSystem();','registerServerdiscovery();','registerWakeOnLan();','registerFreshRate();','registerFile();'])assert.ok(source.includes(token),token);
});
for(const files of [['libmpv.js'],['cec.js','CEC.js','libmpv.js','testinput.js'],undefined]) {
    test('startup plugin discovery excludes stale CEC while retaining other plugins: '+JSON.stringify(files),async()=>{
        const context={Promise,__dirname:'/synthetic/electronapp',customFileProtocol:'electronfile',persistentDeviceId:'synthetic-device',
            app:{name:'Synthetic',getVersion:()=>'fixture'},startInfoJson:null,
            replaceAll:(value,search,replacement)=>value.split(search).join(replacement),
            require:name=>name==='os'?{hostname:()=>'synthetic-host'}:name==='path'?path:name==='fs'?{
                readdir:(dir,callback)=>path.basename(dir)==='plugins'?callback(files?null:new Error('synthetic missing directory'),files):callback(null,['videohandler.js'])
            }:(()=>{throw Error('Unexpected dependency '+name);})()};
        vm.createContext(context);vm.runInContext(namedFunction(source,'loadStartInfo'),context);
        await context.loadStartInfo();const info=JSON.parse(context.startInfoJson);
        assert.equal(info.plugins.some(url=>/\/cec\.js$/i.test(url)),false);
        assert.equal(info.plugins.length,files?files.filter(name=>name.toLowerCase()!=='cec.js').length:0);
        if(files)assert.ok(info.plugins.some(url=>url.endsWith('/libmpv.js')));
        if(files?.includes('testinput.js'))assert.ok(info.plugins.some(url=>url.endsWith('/testinput.js')));
        assert.equal(info.scripts.length,1);assert.ok(info.scripts[0].endsWith('/videohandler.js'));
        assert.equal(info.deviceId,'synthetic-device');
    });
}
for(const windows of [true,false])test('legacy CEC command argument is ignored without shifting Windows profile: '+windows,()=>{
    const context={process:{argv:['electron','main','C:\\synthetic-profile','C:\\old-cec-client.exe']},
        require:name=>name==='is-windows'?()=>windows:name==='detect-rpi'?()=>false:name==='path'?path:{}};
    vm.createContext(context);vm.runInContext(namedFunction(source,'parseCommandLine'),context);
    const options=context.parseCommandLine();
    assert.equal(options.userDataPath,windows?'C:\\synthetic-profile':undefined);
    assert.equal(Object.hasOwn(options,'cecExePath'),false);
});
