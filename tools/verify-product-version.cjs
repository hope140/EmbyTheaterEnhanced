'use strict';

const fs = require('node:fs');

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function readJson(filePath, label) {
    let text;
    try {
        text = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        throw new Error(`${label} could not be read: ${error.code || 'read-error'}`);
    }
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error(`${label} is not valid JSON.`);
    }
}

function validateProductVersion(values) {
    const versions = [
        ['root package.json', values.rootPackage && values.rootPackage.version],
        ['root package-lock.json', values.rootLock && values.rootLock.version],
        ['root package-lock.json packages[""].version', values.rootLock && values.rootLock.packages && values.rootLock.packages[''] && values.rootLock.packages[''].version],
        ['runtime electronapp/package.json', values.runtimePackage && values.runtimePackage.version],
        ['runtime build-manifest.json', values.buildManifest && values.buildManifest.version]
    ];

    for (const [label, version] of versions) {
        if (typeof version !== 'string' || !VERSION_PATTERN.test(version)) {
            throw new Error(`${label} version is missing or invalid.`);
        }
    }

    const expected = versions[0][1];
    const mismatch = versions.find(([, version]) => version !== expected);
    if (mismatch) {
        const details = versions.map(([label, version]) => `${label}=${version}`).join(', ');
        throw new Error(`Product version mismatch: ${details}.`);
    }

    return expected;
}

function validateProductVersionFiles(paths) {
    return validateProductVersion({
        rootPackage: readJson(paths.rootPackage, 'root package.json'),
        rootLock: readJson(paths.rootLock, 'root package-lock.json'),
        runtimePackage: readJson(paths.runtimePackage, 'runtime electronapp/package.json'),
        buildManifest: readJson(paths.buildManifest, 'runtime build-manifest.json')
    });
}

if (require.main === module) {
    const [rootPackage, rootLock, runtimePackage, buildManifest] = process.argv.slice(2);
    if (!rootPackage || !rootLock || !runtimePackage || !buildManifest) {
        process.stderr.write('Usage: node verify-product-version.cjs <root-package.json> <root-package-lock.json> <runtime-electronapp-package.json> <runtime-build-manifest.json>\n');
        process.exitCode = 2;
    } else {
        try {
            const version = validateProductVersionFiles({rootPackage, rootLock, runtimePackage, buildManifest});
            process.stdout.write(JSON.stringify({status: 'passed', version}) + '\n');
        } catch (error) {
            process.stderr.write(`${error.message}\n`);
            process.exitCode = 1;
        }
    }
}

module.exports = {validateProductVersion, validateProductVersionFiles};
