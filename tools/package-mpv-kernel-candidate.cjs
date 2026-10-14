'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {readBundledVersions} = require('../src/electronapp/enhanced/bundled-versions');
const {validateCandidateArchive, validateCandidateMembers} = require('../src/electronapp/enhanced/mpv-kernel-package');

const NAMES = Object.freeze(['candidate.json', 'mpv-1.dll', 'SOURCE.txt', 'NOTICE.txt']);
const CAPS = Object.freeze(['private-inherited-pipe', 'native-child-hwnd', 'gpu-next', 'd3d11', 'generation-attribution']);
const LIMITS = Object.freeze({archive: 192 * 1024 * 1024, dll: 160 * 1024 * 1024, metadata: 32 * 1024, text: 64 * 1024});

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    crcTable[index] = value >>> 0;
}
function crc32(buffer) {
    let value = 0xffffffff;
    for (const byte of buffer) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff];
    return (value ^ 0xffffffff) >>> 0;
}

function createMetadata(details, members, helperIdentity) {
    if (!details || !members || !helperIdentity || !/^[0-9a-f]{64}$/.test(helperIdentity.sha256 || '') ||
        !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(helperIdentity.version || '')) fail('candidate-input-invalid');
    if (!Buffer.isBuffer(members['mpv-1.dll']) || members['mpv-1.dll'].length < 1 || members['mpv-1.dll'].length > LIMITS.dll ||
        !Buffer.isBuffer(members.SOURCE) || !Buffer.isBuffer(members.NOTICE)) fail('candidate-input-invalid');
    const source = members.SOURCE;
    const notice = members.NOTICE;
    if (!source.length || source.length > LIMITS.text || !notice.length || notice.length > LIMITS.text) fail('candidate-input-invalid');
    if (!details.source || !details.license || !/^[\x20-\x7e]{1,128}$/.test(details.libmpvVersion || '')) fail('candidate-input-invalid');
    const metadata = {
        schemaVersion: 1,
        libmpv: {
            file: 'mpv-1.dll',
            version: details.libmpvVersion,
            sizeBytes: members['mpv-1.dll'].length,
            sha256: sha256(members['mpv-1.dll']),
            machine: 'x64',
            clientApiVersion: 131077
        },
        helperContract: {
            fileSha256: helperIdentity.sha256,
            version: helperIdentity.version,
            protocolVersion: 1,
            clientApiVersion: 131077,
            requiredCapabilities: CAPS.slice()
        },
        source: details.source,
        license: details.license,
        sourceSha256: sha256(source),
        noticeSha256: sha256(notice)
    };
    const bytes = Buffer.from(JSON.stringify(metadata), 'utf8');
    if (bytes.length > LIMITS.metadata) fail('candidate-input-invalid');
    return bytes;
}

function buildArchive(members) {
    if (!members || typeof members !== 'object' || Array.isArray(members) ||
        Object.keys(members).sort().join('\0') !== NAMES.slice().sort().join('\0') ||
        NAMES.some(name => !Buffer.isBuffer(members[name]))) fail('candidate-input-invalid');
    let total = 0;
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const name of NAMES) {
        const data = members[name];
        const maximum = name === 'candidate.json' ? LIMITS.metadata : name === 'mpv-1.dll' ? LIMITS.dll : LIMITS.text;
        if (data.length > maximum) fail('candidate-input-invalid');
        total += data.length;
        if (!Number.isSafeInteger(total) || total > 160 * 1024 * 1024) fail('candidate-input-invalid');
        const filename = Buffer.from(name, 'ascii');
        const checksum = crc32(data);
        const local = Buffer.alloc(30 + filename.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(filename.length, 26);
        filename.copy(local, 30);
        locals.push(local, data);

        const central = Buffer.alloc(46 + filename.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(filename.length, 28);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        filename.copy(central, 46);
        centrals.push(central);
        offset += local.length + data.length;
    }
    const centralDirectory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(NAMES.length, 8);
    end.writeUInt16LE(NAMES.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    const archive = Buffer.concat([...locals, centralDirectory, end]);
    if (archive.length > LIMITS.archive) fail('candidate-input-invalid');
    return archive;
}

async function resolveHelperIdentity(runtimeRoot) {
    let runtime;
    try { runtime = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'runtime-provenance.json'), 'utf8')); }
    catch (_) { fail('helper-identity-unavailable'); }
    if (!runtime || !/^[0-9a-f]{40}$/.test(runtime.sourceCommit || '')) fail('helper-identity-unavailable');
    const versions = await readBundledVersions(runtimeRoot, runtime.sourceCommit);
    if (!versions || !/^[0-9a-f]{64}$/.test(versions.helperFileSha256 || '') || !versions.helperVersion) fail('helper-identity-unavailable');
    return {sha256: versions.helperFileSha256, version: versions.helperVersion};
}

async function packageCandidate(input) {
    const settings = input || {};
    const [helperIdentity, detailsBytes, dll, source, notice] = await Promise.all([
        resolveHelperIdentity(settings.runtimeRoot),
        fs.promises.readFile(settings.detailsPath),
        fs.promises.readFile(settings.dllPath),
        fs.promises.readFile(settings.sourcePath),
        fs.promises.readFile(settings.noticePath)
    ]);
    let details;
    try { details = JSON.parse(detailsBytes.toString('utf8')); } catch (_) { fail('candidate-input-invalid'); }
    if (!details || Array.isArray(details) || Object.keys(details).sort().join('\0') !== ['libmpvVersion', 'license', 'source'].sort().join('\0')) {
        fail('candidate-input-invalid');
    }
    const metadataBytes = createMetadata(details, {'mpv-1.dll': dll, SOURCE: source, NOTICE: notice}, helperIdentity);
    const packageMembers = {
        'candidate.json': metadataBytes,
        'mpv-1.dll': dll,
        'SOURCE.txt': source,
        'NOTICE.txt': notice
    };
    validateCandidateMembers(packageMembers, helperIdentity);
    const archive = buildArchive(packageMembers);
    const validated = validateCandidateArchive(archive, helperIdentity);
    return {archive, candidateId: validated.candidateId, metadata: validated.metadata};
}

async function writeOutput(outputPath, archive) {
    const target = path.resolve(outputPath);
    let descriptor;
    let createdStat = null;
    try {
        descriptor = fs.openSync(target, 'wx', 0o600);
        createdStat = fs.fstatSync(descriptor);
        fs.writeFileSync(descriptor, archive);
        fs.fsyncSync(descriptor);
    } catch (_) {
        if (descriptor !== undefined) { try { fs.closeSync(descriptor); } catch (_) { } }
        if (createdStat) {
            try {
                const current = fs.lstatSync(target);
                if (current.isFile() && current.dev === createdStat.dev && current.ino === createdStat.ino) fs.unlinkSync(target);
            } catch (_) { }
        }
        fail('candidate-output-write-failed');
    }
    fs.closeSync(descriptor);
}

async function main(argv) {
    if (argv.length !== 8) fail('usage: package-mpv-kernel-candidate <runtime-root> <details.json> <mpv-1.dll> <SOURCE.txt> <NOTICE.txt> <output.zip>');
    const result = await packageCandidate({
        runtimeRoot: path.resolve(argv[1]),
        detailsPath: path.resolve(argv[2]),
        dllPath: path.resolve(argv[3]),
        sourcePath: path.resolve(argv[4]),
        noticePath: path.resolve(argv[5])
    });
    await writeOutput(argv[6], result.archive);
    process.stdout.write(JSON.stringify({status: 'written', candidateId: result.candidateId,
        version: result.metadata.libmpv.version, archiveSha256: sha256(result.archive), bytes: result.archive.length}) + '\n');
}

if (require.main === module) {
    main(process.argv).catch(error => {
        const code = error && typeof error.code === 'string' && /^[a-z0-9-]{1,96}$/.test(error.code)
            ? error.code
            : 'candidate-package-failed';
        process.stderr.write(code + '\n');
        process.exitCode = 1;
    });
}

module.exports = Object.freeze({buildArchive, createMetadata, packageCandidate, resolveHelperIdentity, writeOutput});
