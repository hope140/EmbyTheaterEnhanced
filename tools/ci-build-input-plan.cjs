'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {hashTrackedTextFile} = require('./tracked-file-hash.cjs');
const toolchains = require('./build-toolchains.cjs');

const AUTHORITIES = [
    'vendor/windows-host-manifest.json', 'vendor/electron-runtime-manifest.json',
    'vendor/inherited-npm-manifest.json', 'vendor/native-helper-manifest.json',
    'vendor/toolchain-manifest.json', 'tools/build-toolchains.lock.json',
    'docs/evidence/third-party-toolchains-20261009.json', 'tools/ci-build-input-plan.cjs'
];

function item(id, url, file, size, sha256, destination) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        !/^[A-Za-z0-9._-]+$/.test(file) ||
        size !== null && (!Number.isSafeInteger(size) || size <= 0) ||
        !/^[a-f0-9]{64}$/.test(sha256 || '') ||
        !destination.startsWith('.work/') && !destination.startsWith('vendor/native-helper-inputs/')) {
        throw new Error('Invalid locked CI acquisition item: ' + id);
    }
    if (destination.split('/').some(segment => segment === '..' || !segment) || destination.includes('\\')) {
        throw new Error('Invalid CI acquisition destination.');
    }
    return {id, url, file, size, sha256, destination};
}

function planFrom(values) {
    const {host, electron, inherited, native, tools, lock, evidence} = values;
    if (host.version !== '3.0.20' || electron.version !== '44.4.2' ||
        inherited.source.repository !== 'https://github.com/MediaBrowser/emby-theater-electron' ||
        !/^[a-f0-9]{40}$/.test(inherited.source.commit) || evidence.msys2.packages.length !== 17) {
        throw new Error('Unexpected pinned component identity.');
    }
    if (tools.inno.sha256 !== lock.inno.archive.sha256 ||
        tools.unpacker.sha256 !== lock.inno.unpackerArchive.sha256 ||
        evidence.innounp.binaryArchive.identity.sha256 !== lock.inno.unpackerArchive.sha256) {
        throw new Error('Toolchain acquisition authorities disagree.');
    }
    const archiveRoot = '.work/actions-inputs/archives/';
    const files = [
        item('windows-host', host.archive.sourceUrl, host.archive.name, host.archive.size, host.archive.sha256, archiveRoot + host.archive.name),
        item('electron', electron.archive.sourceUrl, electron.archive.name, electron.archive.size, electron.archive.sha256, archiveRoot + electron.archive.name),
        item('inno', tools.inno.source, 'innosetup-6.7.3.exe', lock.inno.archive.size, lock.inno.archive.sha256, lock.inno.archive.relativePath),
        item('innounp', evidence.innounp.binaryArchive.url, 'innounp.zip', lock.inno.unpackerArchive.size, lock.inno.unpackerArchive.sha256, lock.inno.unpackerArchive.relativePath),
        item('mpv-header', native.clientHeader.source, 'client.h', null, native.clientHeader.sha256, native.clientHeader.path)
    ];
    for (const entry of evidence.msys2.packages) {
        const archive = entry.archive;
        files.push(item('msys2-' + archive.file, 'https://repo.msys2.org/mingw/ucrt64/' + archive.file,
            archive.file, archive.size, archive.sha256, '.work/actions-inputs/msys2/' + archive.file));
    }
    return {schemaVersion: 1, files, officialElectronSource: inherited.source,
        archiveRoot: archiveRoot.slice(0, -1), msysPrefix: lock.native.compilerRoot,
        unpackerRoot: lock.inno.unpackerRoot, innoRoot: '.work/toolchain/inno'};
}

function createPlan(rootArg) {
    const root = path.resolve(rootArg);
    for (const file of AUTHORITIES) hashTrackedTextFile(root, file);
    const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    return planFrom({host: read(AUTHORITIES[0]), electron: read(AUTHORITIES[1]),
        inherited: read(AUTHORITIES[2]), native: read(AUTHORITIES[3]), tools: read(AUTHORITIES[4]),
        lock: read(AUTHORITIES[5]), evidence: read(AUTHORITIES[6])});
}

function verifyFile(file, expected) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || expected.size !== null && stat.size !== expected.size) {
        throw new Error('Locked CI input file size or type mismatch: ' + expected.id);
    }
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (sha256 !== expected.sha256) throw new Error('Locked CI input SHA256 mismatch: ' + expected.id);
    return {id: expected.id, size: stat.size, sha256};
}

function verifyMsys(rootArg, prefix) {
    const lock = toolchains.readLock(path.resolve(rootArg));
    const actual = toolchains.treeIdentity(prefix);
    const expected = lock.native.tree;
    if (actual.fileCount !== expected.fileCount || actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
        throw new Error('Prepared MSYS2 prefix differs from the fixed tree.');
    }
    return {fileCount: actual.fileCount, bytes: actual.bytes, sha256: actual.sha256};
}

if (require.main === module) {
    try {
        const [command, root, value, id] = process.argv.slice(2);
        const plan = createPlan(root);
        const result = command === 'plan' ? plan : command === 'verify-file'
            ? verifyFile(value, plan.files.find(entry => entry.id === id) || {})
            : command === 'verify-msys' ? verifyMsys(root, value) : null;
        if (!result) throw new Error('Usage: ci-build-input-plan.cjs <plan|verify-file|verify-msys> <root> [path] [id]');
        console.log(JSON.stringify(result));
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = {AUTHORITIES, item, planFrom, createPlan, verifyFile, verifyMsys};
