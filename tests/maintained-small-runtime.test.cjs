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
    const previous=JSON.parse(fs.readFileSync(path.join(root,'vendor/snapshot-history/small-runtime-v1-manifest.json')));
    assert.equal(previous.files.find(x=>x.path==='config/system.xml').sha256,'d78758f94a14cea729fa28aed7fff98b30382ec5e435ecb02f31b6583becfcb9');
    const output = input.systemDefaults(root);
    assert.deepEqual(xmlContract(output.bytes),{root:'BaseApplicationConfiguration',namespaces:[['xsi','http://www.w3.org/2001/XMLSchema-instance'],['xsd','http://www.w3.org/2001/XMLSchema']],fields:[['EnableDebugLevelLogging','false'],['EnableAutoUpdate','false'],['LogFileRetentionDays','0'],['RunAtStartup','false'],['IsStartupWizardCompleted','false']]});
    assert.deepEqual(output.bytes, reference.CONFIGURATION);
    assert.equal(output.bytes.length, 543);
    assert.equal(sha(output.bytes), '03a596810424e4b4dc0ca38280927d6b9108e5df5ed300d12c1335ebe53121e7');
    const defaults = JSON.parse(fs.readFileSync(path.join(root,input.DEFAULT_SOURCE_PATH))).defaults;
    assert.deepEqual(defaults,{EnableDebugLevelLogging:false,EnableAutoUpdate:false,LogFileRetentionDays:0,RunAtStartup:false,IsStartupWizardCompleted:false});
});
test('v2 localization keeps the thirteen approved values and all twenty-four inherited value hashes',()=>{
    const manifest=input.load(root),review=manifest.migration.translationReview;
    const previous=JSON.parse(fs.readFileSync(path.join(root,manifest.migration.historicalManifestPath)));
    assert.equal(previous.files.find(x=>x.path===input.TRANSLATION_PATH).sha256,'9d2b20f0863b794146d8b8989be3965ad186664e645b89ba31c6c2dcce8e3015');
    const output=input.translationOutput(root),values=JSON.parse(output.bytes);
    assert.equal(Object.keys(values).length,37);
    assert.deepEqual([...review.changedKeys].sort(),Object.keys(reference.APPROVED_TRANSLATIONS).sort());
    assert.deepEqual(Object.keys(values).sort(),[...review.changedKeys,...Object.keys(review.retainedValueSha256)].sort());
    for(const [key,value]of Object.entries(reference.APPROVED_TRANSLATIONS))assert.equal(values[key],value);
    for(const [key,digest]of Object.entries(review.retainedValueSha256))assert.equal(sha(Buffer.from(values[key])),digest,key);
    assert.deepEqual(output.bytes,reference.translation());
    for(const key of ['LabelGpuApiHelp','LabelHardwareAccelerationHelp','VideoOutputHelp'])assert.doesNotMatch(values[key],/<br>|[\r\n]/);
});
test('generated seed is copied once and existing synthetic user config and CEC marker survive', t => {
    const directory=fixture(t),runtime=path.join(directory,'dist/candidate'),appData=path.join(directory,'appdata');
    input.assemble(directory,runtime);
    const first=bootstrap.bootstrap({runtimeRoot:runtime,appDataPath:appData});
    assert.deepEqual(fs.readFileSync(first.systemConfig),reference.CONFIGURATION);
    fs.writeFileSync(first.systemConfig,'<user-config keep="true"/>');
    const cancelFile=path.join(first.profileRoot,'cec-driver','cancel');
    assert.equal(fs.existsSync(path.dirname(cancelFile)),false);
    fs.mkdirSync(path.dirname(cancelFile));
    fs.writeFileSync(cancelFile,'preserved marker');
    bootstrap.bootstrap({runtimeRoot:runtime,appDataPath:appData});
    assert.equal(fs.readFileSync(first.systemConfig,'utf8'),'<user-config keep="true"/>');
    assert.equal(fs.readFileSync(cancelFile,'utf8'),'preserved marker');
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
