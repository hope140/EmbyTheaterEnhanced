'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const contract = require('./build-input-contract.cjs');
const {readBlob} = require('./copy-tracked-product-sources.cjs');

const NAME = 'build-input-provenance.json';
const CONFIG_PATH = 'Emby.Theater.exe.config';
const FROM = '<add key="ProgramDataPath" value=""/>';
const TO = '<add key="ProgramDataPath" value="%ApplicationData%\\EmbyTheaterEnhanced"/>';
function hash(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function configOutput(base) {
    const text = base.toString('utf8');
    if (text.split(FROM).length !== 2) throw new Error('ProgramDataPath base must contain exactly one canonical anchor.');
    return Buffer.from(text.replace(FROM, TO), 'utf8');
}
function record(root, runtime, sourceCommit, write) {
    const inputs = contract.inspect(root, sourceCommit);
    const byPath = new Map(inputs.files.map(file => [file.path, file]));
    const manifest = JSON.parse(readBlob(root, byPath.get('vendor/runtime-manifest.json').gitBlobObjectId));
    const base = fs.readFileSync(path.join(root, 'vendor/carnival', CONFIG_PATH));
    const expectedBase = manifest.files.find(file => file.path === CONFIG_PATH);
    if (!expectedBase || hash(base) !== expectedBase.sha256.toLowerCase()) throw new Error('Config base does not match committed vendor manifest.');
    const generated = configOutput(base);
    if (write) {
        fs.writeFileSync(path.join(runtime, CONFIG_PATH), generated);
        contract.materializeNotices(root, runtime, inputs);
    }
    if (!fs.readFileSync(path.join(runtime, CONFIG_PATH)).equals(generated)) throw new Error('ProgramDataPath generated output mismatch.');
    const notices = contract.NOTICE_PATHS.map(relativePath => {
        const input = byPath.get(relativePath);
        const runtimeHash = hash(fs.readFileSync(path.join(runtime, relativePath)));
        if (runtimeHash !== input.sha256) throw new Error('Committed notice runtime mismatch: ' + relativePath);
        return {...input, runtimePath: relativePath, relation: 'git-blob-copy'};
    });
    return {...inputs, configTransform: {
        basePath: 'vendor/carnival/' + CONFIG_PATH, baseSha256: hash(base),
        generatorPath: 'tools/build-input-provenance.cjs', generatorSha256: byPath.get('tools/build-input-provenance.cjs').sha256,
        runtimePath: CONFIG_PATH, outputSha256: hash(generated), relation: 'single ProgramDataPath anchor replacement; preserve other bytes'
    }, notices};
}
function run(command, root, runtime, sourceCommit) {
    if (!['write', 'validate'].includes(command)) throw new Error('Expected write or validate.');
    const expected = record(root, runtime, sourceCommit, command === 'write');
    const output = path.join(runtime, NAME);
    if (command === 'write') fs.writeFileSync(output, JSON.stringify(expected, null, 2) + '\n');
    else if (JSON.stringify(JSON.parse(fs.readFileSync(output))) !== JSON.stringify(expected)) throw new Error('Build input provenance mismatch.');
    return {status: 'passed', sourceCommit, fileCount: expected.files.length, notices: expected.notices.length};
}
if (require.main === module) {
    const [command, root, runtime, sourceCommit] = process.argv.slice(2);
    process.stdout.write(JSON.stringify(run(command, root, runtime, sourceCommit)) + '\n');
}
module.exports = {run, record, configOutput, NAME};
