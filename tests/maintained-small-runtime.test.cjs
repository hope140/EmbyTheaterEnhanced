'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const input = require('../tools/small-runtime-input.cjs');
const reference = require('./helpers/small-runtime-reference.cjs');
const bootstrap = require('../src/electronapp/enhanced/bootstrap');
const root = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
    const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'ete-maintained-small-')));
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
    require('./helpers/small-runtime-fixture.cjs').create(directory);
    return directory;
}
function xmlContract(bytes) {
    const text = bytes.toString('utf8').replace(/<!--[\s\S]*?-->/g, '');
    return {
        root: text.match(/<(BaseApplicationConfiguration)\s/)[1],
        namespaces: [...text.matchAll(/xmlns:(\w+)="([^"]+)"/g)].map(x => [x[1],x[2]]),
        fields: [...text.matchAll(/<(\w+)>([^<>]*)<\/\1>/g)].map(x => [x[1],x[2]])
    };
}
test('maintained XML keeps the original five values, root and namespaces', () => {
    const original = fs.readFileSync(path.join(root, input.INPUT_ROOT, 'config/system.xml'));
    assert.equal(sha(original), 'd78758f94a14cea729fa28aed7fff98b30382ec5e435ecb02f31b6583becfcb9');
    const output = input.systemDefaults(root);
    assert.deepEqual(xmlContract(output.bytes), xmlContract(original));
    assert.deepEqual(output.bytes, reference.CONFIGURATION);
    assert.equal(output.bytes.length, 543);
    assert.equal(sha(output.bytes), '03a596810424e4b4dc0ca38280927d6b9108e5df5ed300d12c1335ebe53121e7');
    const defaults = JSON.parse(fs.readFileSync(path.join(root,input.DEFAULT_SOURCE_PATH))).defaults;
    assert.deepEqual(defaults,{EnableDebugLevelLogging:false,EnableAutoUpdate:false,LogFileRetentionDays:0,RunAtStartup:false,IsStartupWizardCompleted:false});
});
test('exactly the selected thirteen strings change; all other keys and lines survive', () => {
    const original = fs.readFileSync(path.join(root,input.INPUT_ROOT,input.TRANSLATION_PATH));
    assert.equal(sha(original),'9d2b20f0863b794146d8b8989be3965ad186664e645b89ba31c6c2dcce8e3015');
    const output = input.translationOutput(root), base = JSON.parse(original), result = JSON.parse(output.bytes);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,input.TRANSLATION_SOURCE_PATH))),reference.APPROVED_TRANSLATIONS);
    assert.equal(Object.keys(result).length,37);
    assert.deepEqual(Object.keys(result),Object.keys(base));
    const changed = Object.keys(base).filter(key=>base[key]!==result[key]);
    assert.deepEqual(changed.sort(),Object.keys(reference.APPROVED_TRANSLATIONS).sort());
    assert.equal(changed.length,13);
    for(const key of Object.keys(base)) assert.equal(result[key],Object.hasOwn(reference.APPROVED_TRANSLATIONS,key)?reference.APPROVED_TRANSLATIONS[key]:base[key],key);
    assert.deepEqual(output.bytes,reference.translation(original));
    const oldLines=original.toString('utf8').split('\n'),newLines=output.bytes.toString('utf8').split('\n');
    assert.equal(oldLines.length,newLines.length);
    assert.equal(oldLines.filter((line,index)=>line!==newLines[index]).length,13);
    for(const key of changed) {
        assert.deepEqual(result[key].match(/\{[^}]+\}|%\w|\$\{[^}]+\}/g),base[key].match(/\{[^}]+\}|%\w|\$\{[^}]+\}/g));
    }
    for(const key of ['LabelGpuApiHelp','LabelHardwareAccelerationHelp','VideoOutputHelp']) assert.doesNotMatch(result[key],/<br>|[\r\n]/);
    for(const key of ['LabelUpmixAudioFor','LabelUpmixAudioForHelp','LabelOutputRangeHelp','AudioDelay2325','AudioDelay2325Help']) assert.equal(result[key],base[key]);
});
test('generated seed is copied once and existing synthetic user config and CEC marker survive', t => {
    const directory=fixture(t),runtime=path.join(directory,'dist/candidate'),appData=path.join(directory,'appdata');
    input.assemble(directory,runtime);
    const first=bootstrap.bootstrap({runtimeRoot:runtime,appDataPath:appData});
    assert.deepEqual(fs.readFileSync(first.systemConfig),reference.CONFIGURATION);
    fs.writeFileSync(first.systemConfig,'<user-config keep="true"/>');
    fs.writeFileSync(first.cancelFile,'preserved marker');
    bootstrap.bootstrap({runtimeRoot:runtime,appDataPath:appData});
    assert.equal(fs.readFileSync(first.systemConfig,'utf8'),'<user-config keep="true"/>');
    assert.equal(fs.readFileSync(first.cancelFile,'utf8'),'preserved marker');
});
test('actual player translation registration resolves the assembled zh-CN resource', t => {
    const directory=fixture(t),runtime=path.join(directory,'dist/candidate');
    input.assemble(directory,runtime);
    const source=fs.readFileSync(path.join(root,'src/electronapp/plugins/libmpv.js'),'utf8');
    const start=source.indexOf('        self.getTranslations = function () {');
    const end=source.indexOf('        self.canPlayMediaType = function',start);
    assert.ok(start>=0&&end>start);
    const context={self:{},pluginManager:{mapPath:(_self,name)=>'electronapp/plugins/'+name}};
    vm.runInNewContext(source.slice(start,end),context);
    const entry=context.self.getTranslations().find(item=>item.lang==='zh-CN');
    assert.equal(entry.path,input.TRANSLATION_PATH);
    const loaded=JSON.parse(fs.readFileSync(path.join(runtime,entry.path)));
    assert.equal(Object.keys(loaded).length,37);
    assert.equal(loaded.VideoOutputHelp,reference.APPROVED_TRANSLATIONS.VideoOutputHelp);
    input.validateRuntime(directory,runtime);
});
for(const mutation of ['missing-key','unapproved-key','wrong-type']) test('translation '+mutation+' fails before assembly writes',t=>{
    const directory=fixture(t),file=path.join(directory,input.TRANSLATION_SOURCE_PATH),values=JSON.parse(fs.readFileSync(file));
    if(mutation==='missing-key') delete values.DisplayVDrop;
    if(mutation==='unapproved-key') values.Auto='unapproved change';
    if(mutation==='wrong-type') values.DisplayVDrop=123;
    fs.writeFileSync(file,JSON.stringify(values));
    const runtime=path.join(directory,'dist/candidate');
    assert.throws(()=>input.assemble(directory,runtime),/maintained translation/);
    assert.equal(fs.existsSync(runtime),false);
});
for(const mutation of ['wrong-boolean','negative-days','extra-field']) test('default '+mutation+' fails before assembly writes',t=>{
    const directory=fixture(t),file=path.join(directory,input.DEFAULT_SOURCE_PATH),source=JSON.parse(fs.readFileSync(file));
    if(mutation==='wrong-boolean') source.defaults.EnableAutoUpdate='false';
    if(mutation==='negative-days') source.defaults.LogFileRetentionDays=-1;
    if(mutation==='extra-field') source.defaults.Unapproved=true;
    fs.writeFileSync(file,JSON.stringify(source));
    const runtime=path.join(directory,'dist/candidate');
    assert.throws(()=>input.assemble(directory,runtime),/maintained default configuration/);
    assert.equal(fs.existsSync(runtime),false);
});
