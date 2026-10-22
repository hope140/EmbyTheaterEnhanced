'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const web = require('./web-snapshot-input.cjs');
const {RETIRED_SMALL_RUNTIME_PATHS} = require('./runtime-exclusions.cjs');
const retired = new Set(RETIRED_SMALL_RUNTIME_PATHS);
const DEFAULT_SOURCE_PATH = 'src/config/system-defaults.json';
const TRANSLATION_PATH = 'electronapp/plugins/mpvplayer/strings/zh-CN.json';
const TRANSLATION_SOURCE_PATH = 'src/localization/mpvplayer/zh-CN.json';
const TRANSLATION_KEYS = Object.freeze(['UserRefreshRateHelp', 'EnableVideoDisplaySyncingHelp',
    'EnableInterpolationHelp', 'LabelNetworkCache', 'LabelNetworkCacheHelp', 'DefaultAudioDelay',
    'DefaultAudioDelayHelp', 'EnableExclusiveAudioModeHelp', 'LabelGpuApiHelp',
    'LabelHardwareAccelerationHelp', 'VideoOutputHelp', 'DisplayVDrop', 'DisplayResample']);
const DEFAULT_FIELDS = Object.freeze({EnableDebugLevelLogging: 'boolean', EnableAutoUpdate: 'boolean',
    LogFileRetentionDays: 'integer', RunAtStartup: 'boolean', IsStartupWizardCompleted: 'boolean'});
function systemDefaults(rootArg) {
    const root = path.resolve(rootArg), file = path.join(root, DEFAULT_SOURCE_PATH);
    physical(file, false);
    const raw = fs.readFileSync(file), text = raw.toString('utf8');
    if (!Buffer.from(text).equals(raw) || text.includes('\0') || /\r(?!\n)/.test(text)) throw Error('Invalid maintained default configuration text.');
    const canonical = Buffer.from(text.replace(/\r\n/g, '\n'));
    const source = JSON.parse(canonical.toString('utf8'));
    if (source.schemaVersion !== 1 || source.configurationType !== 'BaseApplicationConfiguration' ||
        Object.keys(source).sort().join(',') !== 'configurationType,defaults,schemaVersion' ||
        !source.defaults || Array.isArray(source.defaults) ||
        Object.keys(source.defaults).sort().join(',') !== Object.keys(DEFAULT_FIELDS).sort().join(',')) throw Error('Invalid maintained default configuration fields.');
    for (const [name, type] of Object.entries(DEFAULT_FIELDS)) {
        const value = source.defaults[name];
        if (type === 'boolean' ? typeof value !== 'boolean' : !Number.isSafeInteger(value) || value < 0) throw Error('Invalid maintained default configuration value: ' + name);
    }
    const xml = ['<?xml version="1.0" encoding="utf-8"?>',
        '<!-- ETE maintained first-run defaults; existing user configuration is never replaced. -->',
        '<BaseApplicationConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
        ...Object.keys(DEFAULT_FIELDS).map(name => '  <' + name + '>' + source.defaults[name] + '</' + name + '>'),
        '</BaseApplicationConfiguration>', ''].join('\n');
    const bytes = Buffer.from(xml);
    return {bytes, metadata: {sourcePath: DEFAULT_SOURCE_PATH, sourceSha256: sha(canonical),
        runtimePath: 'config/system.xml', size: bytes.length, sha256: sha(bytes),
        relation: 'ETE maintained typed defaults -> first-run XML seed; legacy field names/default behavior retained'}};
}
function runtimeFiles(root, manifest) {
    const generated = [systemDefaults(root).metadata, translationOutput(root).metadata];
    const historical=web.migrationHistory(root,manifest,[...retired],SMALL_PATHS);
    return manifest.files.filter(entry => !retired.has(entry.path)).map(entry => {
        const replacement = generated.find(item => item.runtimePath === entry.path);
        return replacement
        ? {...entry, size: replacement.size, sha256: replacement.sha256, sourcePath: replacement.sourcePath, sourceSha256: replacement.sourceSha256,
            historicalSha256: historical.files.find(item=>item.path===entry.path).sha256, relation: replacement.relation} : entry;
    });
}
function runtimeSelection(root, manifest) {
    const files = runtimeFiles(root, manifest), excludedFiles = manifest.files.filter(entry => retired.has(entry.path));
    return {runtimeFileCount: files.length, runtimeBytes: files.reduce((n, entry) => n + entry.size, 0),
        runtimeTreeSha256: web.treeHash(files), excludedFiles, maintainedDefaults: systemDefaults(root).metadata,
        maintainedTranslation: translationOutput(root).metadata};
}
function translationOutput(rootArg) {
    const root = path.resolve(rootArg), source = path.join(root,TRANSLATION_SOURCE_PATH);
    physical(source,false);
    const raw = fs.readFileSync(source), text = raw.toString('utf8');
    if (!Buffer.from(text).equals(raw)) throw Error('Invalid maintained translation encoding.');
    const bytes = Buffer.from(text.replace(/\r\n/g,'\n')), values = JSON.parse(bytes);
    if (!values || Array.isArray(values) || Object.keys(values).length !== 37 ||
        Object.values(values).some(value=>typeof value !== 'string') || TRANSLATION_KEYS.some(key=>!Object.hasOwn(values,key))) throw Error('Invalid maintained translation key contract.');
    const review=JSON.parse(fs.readFileSync(path.join(root,MANIFEST_PATH),'utf8')).migration?.translationReview;
    if (!review || review.oldKeyCount!==37 || review.newKeyCount!==37 ||
        JSON.stringify([...review.changedKeys].sort())!==JSON.stringify([...TRANSLATION_KEYS].sort()) ||
        Object.keys(review.retainedValueSha256).length!==24 ||
        Object.keys(values).some(key=>!TRANSLATION_KEYS.includes(key) && sha(Buffer.from(values[key]))!==review.retainedValueSha256[key])) throw Error('Invalid maintained translation inherited-value contract.');
    return {bytes, metadata:{sourcePath:TRANSLATION_SOURCE_PATH,sourceSha256:sha(bytes),
        runtimePath:TRANSLATION_PATH,size:bytes.length,sha256:sha(bytes),changedKeys:[...TRANSLATION_KEYS],retainedKeyCount:24,
        relation:'ETE maintained 37-key localization; 13 approved revisions, 24 inherited strings; historical identities retained separately'}};
}
function rejectRetiredOutput(runtime) {
    for (const name of retired) if (fs.existsSync(path.join(runtime, name))) {
        throw new Error('Retired resource present in runtime: ' + name);
    }
}
const MANIFEST_PATH = 'vendor/small-runtime-manifest.json';
const INPUT_ROOT = 'vendor/small-runtime/snapshot-v2';
const SMALL_PATHS=Object.freeze(['config/system.xml',TRANSLATION_PATH]);
const isSmallRuntime=name=>SMALL_PATHS.includes(name)||retired.has(name);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function relative(name) {
    if (typeof name !== 'string' || !name || /[\\:\x00-\x1f\x7f]/.test(name) ||
        name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid Small runtime snapshot component path.');
    return name;
}
function physical(file, directory) {
    const absolute=path.resolve(file),normalize=x=>process.platform==='win32'?x.toLowerCase():x;
    let cursor=path.parse(absolute).root;
    for(const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)) {
        cursor=path.join(cursor,part);
        if(fs.lstatSync(cursor).isSymbolicLink()||normalize(fs.realpathSync.native(cursor))!==normalize(cursor)) throw new Error('Small runtime snapshot links or redirects are forbidden.');
    }
    const stat=fs.lstatSync(absolute);
    if(directory?!stat.isDirectory():!stat.isFile())throw new Error('Unexpected Small runtime snapshot component file type.');
}
function mkdirPhysical(directory) {
    const absolute=path.resolve(directory);let cursor=path.parse(absolute).root;
    for(const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)) {
        cursor=path.join(cursor,part);if(!fs.existsSync(cursor))fs.mkdirSync(cursor);physical(cursor,true);
    }
}
function load(rootArg) {
    const root=path.resolve(rootArg),file=path.join(root,MANIFEST_PATH);physical(file,false);
    const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
    if(manifest.schemaVersion!==1||manifest.version!=='snapshot-v2'||manifest.inputRoot!==INPUT_ROOT||
        !Array.isArray(manifest.files)||manifest.files.length!==SMALL_PATHS.length||manifest.fileCount!==manifest.files.length)throw new Error('Invalid Small runtime snapshot component manifest.');
    const seen=new Set();
    for(const entry of manifest.files) {
        relative(entry.path);
        if(!isSmallRuntime(entry.path)||seen.has(entry.path.toLowerCase())||!Number.isSafeInteger(entry.size)||entry.size<0||!/^[a-f0-9]{64}$/.test(entry.sha256||'')) throw new Error('Invalid Small runtime snapshot component identity.');
        seen.add(entry.path.toLowerCase());
    }
    if(manifest.bytes!==manifest.files.reduce((n,f)=>n+f.size,0)||manifest.treeSha256!==web.treeHash(manifest.files))throw new Error('Small runtime snapshot component summary mismatch.');
    if(manifest.provenance?.mode!=='local-small-runtime-snapshot')throw new Error('Invalid small-runtime snapshot origin.');
    web.migrationHistory(root,manifest,[...retired],SMALL_PATHS);
    return manifest;
}
function paths(root) {return load(root).files.map(entry=>entry.path);}
function validate(rootArg) {
    const root=path.resolve(rootArg),manifest=load(root);
    web.verifyTree(path.join(root,INPUT_ROOT),manifest.files);
    return {status:'passed',manifestPath:MANIFEST_PATH,manifestSha256:sha(fs.readFileSync(path.join(root,MANIFEST_PATH))),
        version:manifest.version,migration:manifest.migration,provenance:manifest.provenance,fileCount:manifest.fileCount,bytes:manifest.bytes,treeSha256:manifest.treeSha256};
}
function importSnapshot(rootArg,sourceArg) {
    const root=path.resolve(rootArg),manifest=load(root),source=path.resolve(sourceArg);physical(source,true);
    const buffers=manifest.files.map(entry=>{const file=path.join(source,entry.path);physical(file,false);const bytes=fs.readFileSync(file);
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Small runtime import identity mismatch: '+entry.path);return{entry,bytes};});
    const destination=path.join(root,INPUT_ROOT);if(fs.existsSync(destination))return validate(root);
    for(const {entry,bytes} of buffers){const target=path.join(destination,entry.path);mkdirPhysical(path.dirname(target));fs.writeFileSync(target,bytes,{flag:'wx'});}return validate(root);
}
function validateRuntime(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),report=validate(root),manifest=load(root);
    rejectRetiredOutput(runtime);
    for(const entry of runtimeFiles(root, manifest)) {
        const file=path.join(runtime,entry.path);physical(file,false);const bytes=fs.readFileSync(file);
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Small runtime snapshot runtime identity mismatch: '+entry.path);
    }
    return {...report,...runtimeSelection(root, manifest),runtimeFiles:runtimeFiles(root, manifest).map(({path,size,sha256})=>({path,size,sha256}))};
}
function assemble(rootArg,runtimeArg) {
    const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),rel=path.relative(path.join(root,'dist'),runtime);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('Small runtime snapshot assembly requires dedicated dist output.');
    const report=validate(root),manifest=load(root);
    for(const entry of manifest.files) if(fs.existsSync(path.join(runtime,entry.path)))throw new Error('Small runtime snapshot output already exists: '+entry.path);
    rejectRetiredOutput(runtime);
    for(const entry of runtimeFiles(root, manifest)) {
        const bytes=entry.path === 'config/system.xml' ? systemDefaults(root).bytes :
            entry.path === TRANSLATION_PATH ? translationOutput(root).bytes : fs.readFileSync(path.join(root,INPUT_ROOT,entry.path));
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Small runtime input changed during assembly.');
        const target=path.join(runtime,entry.path);mkdirPhysical(path.dirname(target));fs.writeFileSync(target,bytes,{flag:'wx'});
    }
    return {...report,...runtimeSelection(root, manifest)};
}
if(require.main===module) {
    try {
        const [command,root,argument]=process.argv.slice(2);let result;
        if(command==='metadata'&&root&&!argument)result=load(root);
        else if(command==='validate'&&root&&!argument)result=validate(root);
        else if(command==='import'&&root&&argument)result=importSnapshot(root,argument);
        else if(command==='assemble'&&root&&argument)result=assemble(root,argument);
        else if(command==='validate-runtime'&&root&&argument)result=validateRuntime(root,argument);
        else throw new Error('Usage: small-runtime-input.cjs <metadata|validate> <root> | <import|assemble|validate-runtime> <root> <path>');
        process.stdout.write(JSON.stringify(result,null,2)+'\n');
    }catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}
}
module.exports={DEFAULT_SOURCE_PATH,systemDefaults,TRANSLATION_SOURCE_PATH,TRANSLATION_PATH,translationOutput,runtimeSelection,SMALL_PATHS,MANIFEST_PATH,INPUT_ROOT,isSmallRuntime,load,paths,validate,importSnapshot,validateRuntime,assemble};
