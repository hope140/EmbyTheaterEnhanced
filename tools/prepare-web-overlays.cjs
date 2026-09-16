'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const externalPlayerRegistration = require('./patch-external-player-registration.cjs');
const trackedFileHash = require('./tracked-file-hash.cjs');

const GENERATOR_PATH = 'tools/prepare-web-overlays.cjs';
const APP_GENERATOR_PATH = 'tools/patch-external-player-registration.cjs';

const WEB_OVERLAY_CONTRACT = Object.freeze([
    Object.freeze({
        id: 'apiclient',
        mode: 'vendor-payload-replacement',
        basePath: 'vendor/carnival/electronapp/www/modules/emby-apiclient/apiclient.js',
        inputPath: 'vendor/patch/payload/client/apiclient.js',
        runtimePath: 'electronapp/www/modules/emby-apiclient/apiclient.js',
        expectedBaseSha256: 'F3516C72784E5BC8782ABBCE021F22A7F939034E5B8B70639672AE682E18ACC0',
        expectedInputSha256: 'A4A901640ABE6BC25188C1CF27FB53125B4F65EF2A797DEF033DC55165B080AE',
        expectedOutputSha256: 'A4A901640ABE6BC25188C1CF27FB53125B4F65EF2A797DEF033DC55165B080AE',
        generatorPaths: Object.freeze([GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'toast-css',
        mode: 'vendor-payload-replacement',
        basePath: 'vendor/carnival/electronapp/www/modules/toast/toast.css',
        inputPath: 'vendor/patch/payload/client/toast.css',
        runtimePath: 'electronapp/www/modules/toast/toast.css',
        expectedBaseSha256: 'E4E8EFCDFBE4841FD05B6CFE6B2A94393474899F3977416077D99B4F8CAD0E39',
        expectedInputSha256: '654AEB05C1B89CA625CC6BD9145F1966A780C0E80FE1197F619800C5F1894743',
        expectedOutputSha256: '654AEB05C1B89CA625CC6BD9145F1966A780C0E80FE1197F619800C5F1894743',
        generatorPaths: Object.freeze([GENERATOR_PATH])
    }),
    Object.freeze({
        id: 'app-js',
        mode: 'tracked-canonical-transform',
        basePath: 'vendor/carnival/electronapp/www/app.js',
        inputPath: null,
        runtimePath: 'electronapp/www/app.js',
        expectedBaseSha256: '3EF3102567458359A02E2FE8F79A8700CFE9C223347ABE5AB6ECB8BD93BE89D2',
        expectedInputSha256: null,
        expectedOutputSha256: 'A5A3CDDCF279496EE3792EE0E29F7CD347F969C5EB3876C284CC990DF9755F08',
        generatorPaths: Object.freeze([GENERATOR_PATH, APP_GENERATOR_PATH])
    })
]);

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex').toUpperCase();
}

function readChecked(root, relativePath, expectedHash, label) {
    const file = path.join(root, relativePath);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        throw new Error(label + ' missing: ' + relativePath);
    }
    const value = fs.readFileSync(file);
    const actualHash = sha256(value);
    if (actualHash !== expectedHash) {
        throw new Error(label + ' hash mismatch: ' + relativePath + ' expected=' + expectedHash + ' actual=' + actualHash);
    }
    return value;
}

function outputFor(root, contract) {
    const base = readChecked(root, contract.basePath, contract.expectedBaseSha256, 'Web overlay base');
    if (contract.mode === 'vendor-payload-replacement') {
        return {
            base,
            input: readChecked(root, contract.inputPath, contract.expectedInputSha256, 'Web overlay input')
        };
    }
    if (contract.id === 'app-js' && contract.mode === 'tracked-canonical-transform') {
        const transformed = externalPlayerRegistration.patchText(base.toString('utf8'));
        if (transformed.action !== 'patched') {
            throw new Error('Web overlay canonical transform did not patch the frozen app.js base.');
        }
        return {base, input: Buffer.from(transformed.text, 'utf8')};
    }
    throw new Error('Unsupported Web overlay contract: ' + contract.id);
}

function generatorHashes(root, contract) {
    return contract.generatorPaths.map(generatorPath => {
        const file = path.join(root, generatorPath);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            throw new Error('Web overlay generator missing: ' + generatorPath);
        }
        return {path: generatorPath, sha256: trackedFileHash.hashTrackedTextFile(root, generatorPath)};
    });
}

function expectedEntry(root, runtimeRoot, contract, write) {
    const values = outputFor(root, contract);
    const outputHash = sha256(values.input);
    if (outputHash !== contract.expectedOutputSha256) {
        throw new Error('Web overlay generated output hash mismatch: ' + contract.runtimePath +
            ' expected=' + contract.expectedOutputSha256 + ' actual=' + outputHash);
    }
    const runtimeFile = path.join(runtimeRoot, contract.runtimePath);
    if (write) {
        fs.mkdirSync(path.dirname(runtimeFile), {recursive: true});
        fs.writeFileSync(runtimeFile, values.input);
    }
    if (!fs.existsSync(runtimeFile) || !fs.statSync(runtimeFile).isFile()) {
        throw new Error('Web overlay runtime output missing: ' + contract.runtimePath);
    }
    const runtimeSha256 = sha256(fs.readFileSync(runtimeFile));
    if (runtimeSha256 !== contract.expectedOutputSha256) {
        throw new Error('Web overlay runtime output hash mismatch: ' + contract.runtimePath +
            ' expected=' + contract.expectedOutputSha256 + ' actual=' + runtimeSha256);
    }
    return {
        id: contract.id,
        mode: contract.mode,
        basePath: contract.basePath,
        baseSha256: sha256(values.base),
        inputPath: contract.inputPath,
        inputSha256: contract.inputPath ? sha256(values.input) : null,
        generatorHashes: generatorHashes(root, contract),
        runtimePath: contract.runtimePath,
        expectedOutputSha256: contract.expectedOutputSha256,
        runtimeSha256
    };
}

function apply(rootArg, runtimeRootArg) {
    const root = path.resolve(rootArg);
    const runtimeRoot = path.resolve(runtimeRootArg);
    // Validate every input and generator before writing any output so a bad base
    // cannot leave a partially assembled Web snapshot.
    for (const contract of WEB_OVERLAY_CONTRACT) {
        const values = outputFor(root, contract);
        const outputHash = sha256(values.input);
        if (outputHash !== contract.expectedOutputSha256) {
            throw new Error('Web overlay generated output hash mismatch: ' + contract.runtimePath +
                ' expected=' + contract.expectedOutputSha256 + ' actual=' + outputHash);
        }
        generatorHashes(root, contract);
    }
    const entries = WEB_OVERLAY_CONTRACT.map(contract => expectedEntry(root, runtimeRoot, contract, true));
    return {schemaVersion: 1, status: 'passed', entries};
}

function inspect(rootArg, runtimeRootArg) {
    const root = path.resolve(rootArg);
    const runtimeRoot = path.resolve(runtimeRootArg);
    const entries = WEB_OVERLAY_CONTRACT.map(contract => expectedEntry(root, runtimeRoot, contract, false));
    return {schemaVersion: 1, status: 'passed', entries};
}

if (require.main === module) {
    const [root, runtimeRoot] = process.argv.slice(2);
    if (!root || !runtimeRoot) throw new Error('Usage: prepare-web-overlays.cjs <root> <runtime-root>');
    process.stdout.write(JSON.stringify(apply(root, runtimeRoot)) + '\n');
}

module.exports = {WEB_OVERLAY_CONTRACT, apply, inspect, sha256};
