'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {RETIRED_WEB_PATHS} = require('./runtime-exclusions.cjs');
const retiredWeb = new Set(RETIRED_WEB_PATHS.map(name => name.slice('electronapp/'.length)));
function runtimeFiles(manifest) { return manifest.files.filter(entry => !retiredWeb.has(entry.path)); }
function runtimeSelection(manifest) {
    const files = runtimeFiles(manifest);
    return {runtimeFileCount: files.length, runtimeBytes: files.reduce((sum, entry) => sum + entry.size, 0),
        runtimeTreeSha256: treeHash(files), excludedFiles: manifest.files.filter(entry => retiredWeb.has(entry.path))};
}

const MANIFEST_PATH = 'vendor/web-snapshot-manifest.json';
const INPUT_ROOT = 'vendor/web-snapshot';
const WEB_ROOT = INPUT_ROOT + '/www';
const LEGACY_WEB_PREFIX = 'electronapp/www/';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const isLegacyWeb = name => name.startsWith(LEGACY_WEB_PREFIX);

function relative(name) {
    if (typeof name !== 'string' || !name || /[\\:\x00-\x1f\x7f]/.test(name) ||
        name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid Web snapshot path.');
    return name;
}
function physical(file, directory) {
    const absolute = path.resolve(file);
    const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
    let cursor = path.parse(absolute).root;
    for (const part of path.relative(cursor, absolute).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        const stat = fs.lstatSync(cursor);
        if (stat.isSymbolicLink() || normalize(fs.realpathSync.native(cursor)) !== normalize(cursor)) throw new Error('Web snapshot links or redirects are forbidden.');
    }
    const stat = fs.lstatSync(absolute);
    if (directory ? !stat.isDirectory() : !stat.isFile()) throw new Error('Unexpected Web snapshot file type.');
}
function mkdirPhysical(directory) {
    const absolute = path.resolve(directory);
    let cursor = path.parse(absolute).root;
    for (const part of path.relative(cursor,absolute).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor,part);
        if (!fs.existsSync(cursor)) fs.mkdirSync(cursor);
        physical(cursor,true);
    }
}
function treeHash(files) {
    return sha(files.slice().sort((a,b) => a.path.localeCompare(b.path, 'en'))
        .map(file => file.path + '\0' + file.size + '\0' + file.sha256 + '\n').join(''));
}
function load(root) {
    physical(path.join(root, MANIFEST_PATH), false);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_PATH), 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.inputRoot !== INPUT_ROOT || !Array.isArray(manifest.files) ||
        !manifest.files.length || !Array.isArray(manifest.userPatches)) throw new Error('Invalid Web snapshot manifest.');
    const entries = [...manifest.files, ...manifest.userPatches];
    const seen = new Set();
    for (const entry of entries) {
        relative(entry.path);
        if (entry.originalPath !== undefined) relative(entry.originalPath);
        if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || seen.has(entry.path.toLowerCase())) throw new Error('Invalid Web snapshot identity.');
        if (!(entry.path.startsWith('www/') || entry.path.startsWith('user-patches/'))) throw new Error('Unexpected Web snapshot component.');
        seen.add(entry.path.toLowerCase());
    }
    if (manifest.files.some(entry => !entry.path.startsWith('www/') || entry.path.startsWith('www/modules/externalplayer/')) ||
        manifest.userPatches.some(entry => !entry.path.startsWith('user-patches/')) ||
        manifest.fileCount !== manifest.files.length || manifest.bytes !== manifest.files.reduce((n,f) => n+f.size,0) ||
        manifest.treeSha256 !== treeHash(manifest.files)) throw new Error('Web snapshot manifest summary mismatch.');
    return manifest;
}
function verifyTree(directory, entries) {
    physical(directory, true);
    const expected = new Map(entries.map(entry => [entry.path, entry]));
    const found = new Set();
    const pending = [{absolute: directory, prefix: ''}];
    while (pending.length) {
        const {absolute, prefix} = pending.pop();
        for (const child of fs.readdirSync(absolute, {withFileTypes:true})) {
            const name = relative(prefix + child.name), full = path.join(absolute, child.name);
            const stat = fs.lstatSync(full);
            physical(full, stat.isDirectory());
            if (stat.isDirectory()) { pending.push({absolute:full,prefix:name+'/'}); continue; }
            const entry = expected.get(name);
            if (!entry) throw new Error('Unexpected Web snapshot input: ' + name);
            const bytes = fs.readFileSync(full);
            if (bytes.length !== entry.size || sha(bytes) !== entry.sha256) throw new Error('Web snapshot identity mismatch: ' + name);
            found.add(name);
        }
    }
    for (const entry of entries) if (!found.has(entry.path)) throw new Error('Missing Web snapshot input: ' + entry.path);
}
function validate(rootArg) {
    const root = path.resolve(rootArg), manifest = load(root);
    verifyTree(path.join(root, INPUT_ROOT), [...manifest.files, ...manifest.userPatches]);
    return {status:'passed',manifestPath:MANIFEST_PATH,manifestSha256:sha(fs.readFileSync(path.join(root,MANIFEST_PATH))),fileCount:manifest.fileCount,bytes:manifest.bytes,treeSha256:manifest.treeSha256,userPatchCount:manifest.userPatches.length};
}
function assemble(rootArg, runtimeArg) {
    const root = path.resolve(rootArg), runtime = path.resolve(runtimeArg);
    const rel = path.relative(path.join(root,'dist'), runtime);
    if (!rel || rel === '..' || rel.startsWith('..'+path.sep) || path.isAbsolute(rel)) throw new Error('Web assembly requires a dedicated dist output.');
    const report = validate(root), manifest = load(root);
    const target = path.join(runtime, 'electronapp/www');
    if (fs.existsSync(target)) throw new Error('Web assembly requires an absent www output.');
    mkdirPhysical(target);
    for (const entry of runtimeFiles(manifest)) {
        const bytes = fs.readFileSync(path.join(root,INPUT_ROOT,entry.path));
        if (bytes.length !== entry.size || sha(bytes) !== entry.sha256) throw new Error('Web snapshot changed during assembly.');
        const destination = path.join(target,entry.path.slice('www/'.length));
        mkdirPhysical(path.dirname(destination));
        fs.writeFileSync(destination,bytes,{flag:'wx'});
    }
    return {...report,...runtimeSelection(manifest)};
}
// Restore an already independent snapshot without any original package layout.
function restoreSnapshot(rootArg, sourceArg) {
    const root=path.resolve(rootArg),source=path.resolve(sourceArg),manifest=load(root);
    const entries=[...manifest.files,...manifest.userPatches];
    verifyTree(source,entries);
    const destination=path.join(root,INPUT_ROOT);
    if(fs.existsSync(destination))throw new Error('Web snapshot input already exists; restoration never overwrites.');
    const buffers=entries.map(entry=>{
        const bytes=fs.readFileSync(path.join(source,entry.path));
        if(bytes.length!==entry.size||sha(bytes)!==entry.sha256)throw new Error('Web snapshot restore identity mismatch: '+entry.path);
        return {entry,bytes};
    });
    for(const {entry,bytes} of buffers){
        const target=path.join(destination,entry.path);mkdirPhysical(path.dirname(target));
        fs.writeFileSync(target,bytes,{flag:'wx'});
    }
    return validate(root);
}
// Explicit historical one-time import only. Production validation/assembly never reads the
// old www tree or the old patch payload. Never edits or deletes either source.
function importSnapshot(rootArg, carnivalArg, patchArg) {
    const root = path.resolve(rootArg), manifest = load(root), destination = path.join(root,INPUT_ROOT);
    if (fs.existsSync(destination)) throw new Error('Web snapshot input already exists; import never overwrites.');
    const inputs = [...manifest.files.map(entry => ({...entry, source:path.join(carnivalArg,entry.originalPath)})),
        ...manifest.userPatches.map(entry => ({...entry,source:path.join(patchArg,entry.originalPath)}))];
    const buffers = inputs.map(entry => {
        physical(entry.source,false);
        const bytes = fs.readFileSync(entry.source);
        if (bytes.length !== entry.size || sha(bytes) !== entry.sha256) throw new Error('Web snapshot import identity mismatch: ' + entry.path);
        return {entry,bytes};
    });
    for (const {entry,bytes} of buffers) {
        const file = path.join(destination,entry.path);
        mkdirPhysical(path.dirname(file));
        fs.writeFileSync(file,bytes,{flag:'wx'});
    }
    return validate(root);
}
if (require.main === module) {
    try {
        const [command,root,a,b] = process.argv.slice(2);
        let result;
        if (command === 'validate' && root && !a && !b) result = validate(root);
        else if (command === 'assemble' && root && a && !b) result = assemble(root,a);
        else if (command === 'restore' && root && a && !b) result = restoreSnapshot(root,a);
        else if (command === 'import' && root && a && b) result = importSnapshot(root,a,b);
        else throw new Error('Usage: web-snapshot-input.cjs validate <root> | assemble <root> <dist-output> | restore <root> <independent-snapshot-root> | import <root> <historical-carnival-root> <historical-patch-root>');
        process.stdout.write(JSON.stringify(result,null,2)+'\n');
    } catch(error) { process.stderr.write(error.message+'\n');process.exitCode=1; }
}
module.exports = {runtimeSelection,MANIFEST_PATH,INPUT_ROOT,WEB_ROOT,LEGACY_WEB_PREFIX,isLegacyWeb,treeHash,load,verifyTree,validate,assemble,restoreSnapshot,importSnapshot};
