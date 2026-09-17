'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const trackedProductSources = require('./copy-tracked-product-sources.cjs');
const preloadPreparation = require('./prepare-preload.cjs');
const sourceProvenance = require('./source-provenance.cjs');
const trackedFileHash = require('./tracked-file-hash.cjs');
const runtimeExclusions = require('./runtime-exclusions.cjs');

const OVERLAY_RUNTIME_PATH = 'electronapp/www/modules/common/playback/playbackmanager.js';
const OVERLAY_GENERATOR_PATH = 'tools/patch-playbackmanager.cjs';
const PACKAGE_RUNTIME_PATH = 'electronapp/package.json';
const PACKAGE_GENERATOR_PATH = 'tools/build.ps1';
const TRACKED_SOURCE_GENERATOR_PATH = 'tools/copy-tracked-product-sources.cjs';
const SOURCE_PROVENANCE_PATH = 'source-provenance.json';
const PREPARED_SOURCE_PATHS = Object.freeze([preloadPreparation.PREPARED_PRELOAD_PATH]);
const PREPARED_ARTIFACT_CONTRACT = Object.freeze([{
    preparedPath: preloadPreparation.PREPARED_PRELOAD_PATH,
    basePath: preloadPreparation.BASE_PRELOAD_PATH,
    runtimePath: preloadPreparation.RUNTIME_PRELOAD_PATH,
    generatorPath: 'tools/prepare-preload.cjs',
    category: 'prepared-workspace-artifact'
}]);
const EXCLUDED_SOURCE_PREFIXES = Object.freeze([]);
const RUNTIME_OVERLAY_CONTRACT = Object.freeze([
    {runtimePath: OVERLAY_RUNTIME_PATH, sourcePath: 'vendor/carnival/electronapp/www/modules/common/playback/playbackmanager.js', generatorPath: OVERLAY_GENERATOR_PATH},
    {runtimePath: PACKAGE_RUNTIME_PATH, sourcePath: 'vendor/carnival/electronapp/package.json', generatorPath: PACKAGE_GENERATOR_PATH}
]);

function usage() {
    throw new Error('Usage: runtime-provenance.cjs <write|validate> <root> <runtime> <sourceCommit>');
}

function hashFile(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function exists(file) {
    try { return fs.statSync(file).isFile(); } catch (_) { return false; }
}

function isExcludedSourcePath(sourcePath) {
    return EXCLUDED_SOURCE_PREFIXES.some(prefix => sourcePath.startsWith(prefix));
}

function isPreparedSourcePath(sourcePath) {
    return PREPARED_SOURCE_PATHS.indexOf(sourcePath) >= 0;
}

function sameStringArray(actual, expected) {
    return Array.isArray(actual) && actual.length === expected.length &&
        actual.every((value, index) => value === expected[index]);
}

function buildOverlayEntries(root, runtime) {
    return RUNTIME_OVERLAY_CONTRACT.map(contract => {
        const sourceFile = path.join(root, contract.sourcePath);
        const runtimeFile = path.join(runtime, contract.runtimePath);
        const generatorFile = path.join(root, contract.generatorPath);
        if (!exists(runtimeFile)) throw new Error('Provenance runtime overlay missing: ' + contract.runtimePath);
        if (!exists(generatorFile)) throw new Error('Provenance overlay generator missing: ' + contract.generatorPath);
        const sourcePresent = exists(sourceFile);
        return Object.assign({}, contract, {
            sourcePresent,
            sourceSha256: sourcePresent ? hashFile(sourceFile) : null,
            generatorSha256: trackedFileHash.hashTrackedTextFile(root, contract.generatorPath),
            runtimeSha256: hashFile(runtimeFile)
        });
    });
}

function sourceEntries(root, sourceCommit) {
    return trackedProductSources.listTrackedProductSources(root, sourceCommit).map(source => {
        if (isExcludedSourcePath(source.sourcePath) || isPreparedSourcePath(source.sourcePath)) return null;
        const value = trackedProductSources.readBlob(root, source.gitBlobObjectId);
        return Object.assign({}, source, {
            sourceCommit: sourceCommit.toLowerCase(),
            sourceSha256: trackedProductSources.sha256(value),
            relation: 'git-blob-copy'
        });
    }).filter(Boolean);
}

function sourceAcquisitionIdentity(root) {
    return {
        generatorPath: TRACKED_SOURCE_GENERATOR_PATH,
        generatorSha256: trackedFileHash.hashTrackedTextFile(root, TRACKED_SOURCE_GENERATOR_PATH),
        relation: 'HEAD git blob bytes -> runtime'
    };
}

function sourceProvenanceIdentity(root, runtime, sourceCommit) {
    const result = sourceProvenance.validateManifest(root, runtime, sourceCommit);
    if (result.status !== 'passed') {
        throw new Error('Source provenance validation failed: ' + (result.errors || []).join(','));
    }
    const file = path.join(runtime, SOURCE_PROVENANCE_PATH);
    return {path: SOURCE_PROVENANCE_PATH, sha256: hashFile(file), status: result.status};
}

function buildPreparedArtifactEntries(root, runtime) {
    return PREPARED_ARTIFACT_CONTRACT.map(contract => {
        const baseFile = path.join(root, contract.basePath);
        const preparedFile = path.join(root, contract.preparedPath);
        const runtimeFile = path.join(runtime, contract.runtimePath);
        const generatorFile = path.join(root, contract.generatorPath);
        if (!exists(baseFile) || !exists(preparedFile) || !exists(runtimeFile) || !exists(generatorFile)) {
            throw new Error('Prepared artifact input missing: ' + contract.preparedPath);
        }
        const baseText = fs.readFileSync(baseFile, 'utf8');
        const expectedText = preloadPreparation.buildPreparedPreload(baseText);
        const baseSha256 = hashFile(baseFile);
        const generatorSha256 = trackedFileHash.hashTrackedTextFile(root, contract.generatorPath);
        const preparedSha256 = hashFile(preparedFile);
        const runtimeSha256 = hashFile(runtimeFile);
        const expectedPreparedSha256 = preloadPreparation.sha256(Buffer.from(expectedText, 'utf8'));
        if (preparedSha256 !== expectedPreparedSha256) {
            throw new Error('Prepared artifact hash mismatch: ' + contract.preparedPath);
        }
        if (runtimeSha256 !== preparedSha256) {
            throw new Error('Prepared artifact runtime mismatch: ' + contract.preparedPath + ' -> ' + contract.runtimePath);
        }
        return {
            preparedPath: contract.preparedPath,
            basePath: contract.basePath,
            runtimePath: contract.runtimePath,
            generatorPath: contract.generatorPath,
            category: contract.category,
            baseSha256: baseSha256,
            generatorSha256: generatorSha256,
            expectedPreparedSha256: expectedPreparedSha256,
            preparedSha256: preparedSha256,
            runtimeSha256: runtimeSha256
        };
    });
}

function baselineIdentity(root) {
    const manifestPath = path.join(root, 'vendor', 'runtime-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return {
        manifestPath: 'vendor/runtime-manifest.json',
        sha256: hashFile(manifestPath),
        baseline: manifest.baseline || 'unknown',
        vendorFileCount: Array.isArray(manifest.files) ? manifest.files.length : null,
        vendorPatchFileCount: Array.isArray(manifest.patchFiles) ? manifest.patchFiles.length : null,
        runtimeExclusions: Array.isArray(manifest.runtimeExclusions) ? manifest.runtimeExclusions.slice() : [],
        coverage: 'vendor files are identified by the external runtime manifest, not by sourceCommit'
    };
}

function runtimeExclusionIdentity(root) {
    return {
        generatorPath: 'tools/runtime-exclusions.cjs',
        generatorSha256: trackedFileHash.hashTrackedTextFile(root, 'tools/runtime-exclusions.cjs'),
        paths: [...runtimeExclusions.RETIRED_RUNTIME_PATHS]
    };
}

function writeManifest(root, runtime, sourceCommit) {
    if (!/^[0-9a-fA-F]{40}$/.test(sourceCommit || '')) throw new Error('sourceCommit must be a 40-character git commit.');
    const entries = sourceEntries(root, sourceCommit);
    const exclusionResult = runtimeExclusions.verify(runtime);
    if (exclusionResult.status !== 'passed') throw new Error('Retired runtime artifact present: ' + exclusionResult.presentPaths.join(','));
    const buildOverlays = buildOverlayEntries(root, runtime);
    const preparedArtifacts = buildPreparedArtifactEntries(root, runtime);
    const sourceProvenanceEntry = sourceProvenanceIdentity(root, runtime, sourceCommit);
    const files = entries.map(entry => {
        const runtimeFile = path.join(runtime, entry.runtimePath);
        if (!exists(runtimeFile)) throw new Error('Provenance runtime file missing: ' + entry.runtimePath);
        const value = Object.assign({}, entry, {
            runtimeSha256: hashFile(runtimeFile)
        });
        if (value.sourceSha256 !== value.runtimeSha256) {
            throw new Error('Git blob runtime mismatch: ' + value.sourcePath + ' -> ' + value.runtimePath);
        }
        return value;
    });
    const manifest = {
        schemaVersion: 1,
        sourceCommit: sourceCommit.toLowerCase(),
        sourceProvenance: sourceProvenanceEntry,
        baselineIdentity: baselineIdentity(root),
        runtimeExclusions: runtimeExclusionIdentity(root),
        validatedProductScope: {
            sourceRoot: 'src/electronapp',
            runtimeRoot: 'electronapp',
            includesIgnoredSourceFiles: false,
            sourceSelection: 'git-commit-blobs',
            sourceCommit: sourceCommit.toLowerCase(),
            sourceAcquisition: sourceAcquisitionIdentity(root),
            excludedSourcePrefixes: [...EXCLUDED_SOURCE_PREFIXES],
            preparedSourcePaths: [...PREPARED_SOURCE_PATHS],
            description: 'All regular src/electronapp blobs from sourceCommit; checkout bytes are ignored and prepared/vendor transformations are recorded separately',
            fileCount: files.length,
            files
        },
        buildOverlays,
        preparedArtifacts,
        exclusions: ['vendor baseline payload', 'node_modules production closure', 'Electron runtime binaries', 'native mpv binary']
    };
    fs.writeFileSync(path.join(runtime, 'runtime-provenance.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    return {status: 'passed', sourceCommit: manifest.sourceCommit, fileCount: files.length};
}

function failedValidation(runtime, sourceCommit, errors, files, manifest) {
    return {
        schemaVersion: 1,
        status: 'failed',
        sourceCommit: sourceCommit || '',
        runtimeName: path.basename(runtime),
        manifest: 'runtime-provenance.json',
        baselineIdentity: manifest && manifest.baselineIdentity || null,
        sourceProvenance: manifest && manifest.sourceProvenance || null,
        runtimeExclusions: manifest && manifest.runtimeExclusions || null,
        buildOverlays: manifest && Array.isArray(manifest.buildOverlays) ? manifest.buildOverlays : [],
        validatedProductScope: manifest && manifest.validatedProductScope
            ? {
                sourceRoot: manifest.validatedProductScope.sourceRoot,
                runtimeRoot: manifest.validatedProductScope.runtimeRoot,
                sourceSelection: manifest.validatedProductScope.sourceSelection,
                sourceCommit: manifest.validatedProductScope.sourceCommit,
                sourceAcquisition: manifest.validatedProductScope.sourceAcquisition || null,
                excludedSourcePrefixes: Array.isArray(manifest.validatedProductScope.excludedSourcePrefixes)
                    ? manifest.validatedProductScope.excludedSourcePrefixes : [],
                preparedSourcePaths: Array.isArray(manifest.validatedProductScope.preparedSourcePaths)
                    ? manifest.validatedProductScope.preparedSourcePaths : [],
                fileCount: manifest.validatedProductScope.fileCount
            }
            : null,
        preparedArtifacts: manifest && Array.isArray(manifest.preparedArtifacts) ? manifest.preparedArtifacts : [],
        files: files || [],
        errors
    };
}

function validateBuildOverlays(root, runtime, manifest, errors) {
    let expected;
    try {
        expected = buildOverlayEntries(root, runtime);
    } catch (error) {
        errors.push('build-overlay-input-missing');
        return [];
    }
    const actual = manifest && Array.isArray(manifest.buildOverlays) ? manifest.buildOverlays : [];
    if (actual.length !== expected.length) errors.push('build-overlay-contract-mismatch');
    const checks = expected.map((expectedEntry, index) => {
        const entry = actual[index] || {};
        const contractMatch = entry.runtimePath === expectedEntry.runtimePath &&
            entry.sourcePath === expectedEntry.sourcePath &&
            entry.generatorPath === expectedEntry.generatorPath;
        const sourcePresenceMatch = entry.sourcePresent === expectedEntry.sourcePresent;
        const sourceMatch = entry.sourceSha256 === expectedEntry.sourceSha256;
        const generatorMatch = entry.generatorSha256 === expectedEntry.generatorSha256;
        const runtimeMatch = entry.runtimeSha256 === expectedEntry.runtimeSha256;
        const valid = contractMatch && sourcePresenceMatch && sourceMatch && generatorMatch && runtimeMatch;
        if (!contractMatch) errors.push('build-overlay-contract-mismatch:' + expectedEntry.runtimePath);
        if (!sourcePresenceMatch) errors.push('build-overlay-source-presence-mismatch:' + expectedEntry.sourcePath);
        if (!sourceMatch) errors.push('build-overlay-source-hash-mismatch:' + expectedEntry.sourcePath);
        if (!generatorMatch) errors.push('build-overlay-generator-mismatch:' + expectedEntry.generatorPath);
        if (!runtimeMatch) errors.push('build-overlay-runtime-hash-mismatch:' + expectedEntry.runtimePath);
        return Object.assign({}, entry, {
            contractMatch,
            sourcePresenceMatch,
            sourceMatch,
            generatorMatch,
            runtimeMatch,
            valid
        });
    });
    return checks;
}

function validatePreparedArtifacts(root, runtime, manifest, errors) {
    let expected;
    try {
        expected = buildPreparedArtifactEntries(root, runtime);
    } catch (error) {
        errors.push(String(error && error.message || '').indexOf('Prepared artifact runtime mismatch:') === 0
            ? 'prepared-artifact-runtime-mismatch' : 'prepared-artifact-input-missing');
        return [];
    }
    const actual = manifest && Array.isArray(manifest.preparedArtifacts) ? manifest.preparedArtifacts : [];
    if (actual.length !== expected.length) errors.push('prepared-artifact-contract-mismatch');
    return expected.map((expectedEntry, index) => {
        const entry = actual[index] || {};
        const fields = ['preparedPath', 'basePath', 'runtimePath', 'generatorPath', 'category', 'baseSha256', 'generatorSha256', 'expectedPreparedSha256', 'preparedSha256', 'runtimeSha256'];
        const matches = fields.every(field => entry[field] === expectedEntry[field]);
        if (!matches) errors.push('prepared-artifact-mismatch:' + expectedEntry.preparedPath);
        return Object.assign({}, entry, {valid: matches});
    });
}

function validateManifest(root, runtime, sourceCommit) {
    const errors = [];
    const manifestPath = path.join(runtime, 'runtime-provenance.json');
    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_) {
        return failedValidation(runtime, sourceCommit, ['runtime-provenance-missing-or-invalid'], [], null);
    }
    if (manifest.schemaVersion !== 1) errors.push('unsupported-provenance-schema');
    if (manifest.sourceCommit !== String(sourceCommit || '').toLowerCase()) errors.push('source-commit-mismatch');
    try {
        const expectedSourceProvenance = sourceProvenanceIdentity(root, runtime, sourceCommit);
        if (!manifest.sourceProvenance || manifest.sourceProvenance.path !== expectedSourceProvenance.path ||
            manifest.sourceProvenance.sha256 !== expectedSourceProvenance.sha256 ||
            manifest.sourceProvenance.status !== 'passed') errors.push('source-provenance-mismatch');
    } catch (_) {
        errors.push('source-provenance-invalid');
    }
    if (!manifest.baselineIdentity || manifest.baselineIdentity.manifestPath !== 'vendor/runtime-manifest.json') errors.push('baseline-identity-missing');
    else {
        const baselinePath = path.join(root, manifest.baselineIdentity.manifestPath);
        if (!exists(baselinePath)) errors.push('baseline-manifest-missing');
        else if (hashFile(baselinePath) !== manifest.baselineIdentity.sha256) errors.push('baseline-manifest-changed');
    }
    const expectedRuntimeExclusions = runtimeExclusionIdentity(root);
    const actualRuntimeExclusions = manifest.runtimeExclusions;
    if (!actualRuntimeExclusions || actualRuntimeExclusions.generatorPath !== expectedRuntimeExclusions.generatorPath ||
        actualRuntimeExclusions.generatorSha256 !== expectedRuntimeExclusions.generatorSha256 ||
        !sameStringArray(actualRuntimeExclusions.paths, expectedRuntimeExclusions.paths)) {
        errors.push('runtime-exclusion-contract-mismatch');
    }
    const exclusionResult = runtimeExclusions.verify(runtime);
    if (exclusionResult.status !== 'passed') errors.push('retired-runtime-artifact-present');
    const scope = manifest.validatedProductScope;
    if (!scope || scope.sourceRoot !== 'src/electronapp' || scope.runtimeRoot !== 'electronapp' ||
        scope.includesIgnoredSourceFiles !== false || scope.sourceSelection !== 'git-commit-blobs' ||
        scope.sourceCommit !== String(sourceCommit || '').toLowerCase() || !Array.isArray(scope.files)) {
        return failedValidation(runtime, sourceCommit, errors.concat('validated-product-scope-missing'), [], manifest);
    }
    const expectedSourceAcquisition = sourceAcquisitionIdentity(root);
    if (!scope.sourceAcquisition ||
        scope.sourceAcquisition.generatorPath !== expectedSourceAcquisition.generatorPath ||
        scope.sourceAcquisition.generatorSha256 !== expectedSourceAcquisition.generatorSha256 ||
        scope.sourceAcquisition.relation !== expectedSourceAcquisition.relation) {
        errors.push('source-acquisition-contract-mismatch');
    }
    if (!sameStringArray(scope.excludedSourcePrefixes, EXCLUDED_SOURCE_PREFIXES)) {
        errors.push('source-exclusion-contract-mismatch');
    }
    if (!sameStringArray(scope.preparedSourcePaths, PREPARED_SOURCE_PATHS)) {
        errors.push('prepared-source-contract-mismatch');
    }
    const buildOverlays = validateBuildOverlays(root, runtime, manifest, errors);
    const preparedArtifacts = validatePreparedArtifacts(root, runtime, manifest, errors);
    const expected = sourceEntries(root, sourceCommit);
    const bySource = new Map(scope.files.map(entry => [entry.sourcePath, entry]));
    const expectedSources = new Set(expected.map(entry => entry.sourcePath));
    for (const entry of expected) if (!bySource.has(entry.sourcePath)) errors.push('manifest-file-missing:' + entry.sourcePath);
    for (const entry of scope.files) if (!expectedSources.has(entry.sourcePath)) errors.push('manifest-file-extra:' + entry.sourcePath);
    if (scope.fileCount !== scope.files.length || scope.files.length !== expected.length) errors.push('product-file-count-mismatch');

    const checks = [];
    for (const expectedEntry of expected) {
        const entry = bySource.get(expectedEntry.sourcePath);
        if (!entry) continue;
        const runtimeFile = path.join(runtime, entry.runtimePath);
        const runtimeExists = exists(runtimeFile);
        const sourceSha256 = expectedEntry.sourceSha256;
        const runtimeSha256 = runtimeExists ? hashFile(runtimeFile) : null;
        const sourceMatch = sourceSha256 === entry.sourceSha256;
        const runtimeMatch = runtimeSha256 === entry.runtimeSha256;
        const gitBlobIdentityMatch = entry.sourceCommit === expectedEntry.sourceCommit &&
            entry.gitMode === expectedEntry.gitMode &&
            entry.gitBlobObjectId === expectedEntry.gitBlobObjectId;
        const relationMatch = entry.relation === expectedEntry.relation &&
            entry.runtimePath === expectedEntry.runtimePath && gitBlobIdentityMatch;
        const copiedMatch = sourceSha256 === runtimeSha256;
        const check = {
            sourcePath: entry.sourcePath,
            runtimePath: entry.runtimePath,
            relation: entry.relation,
            sourceCommit: entry.sourceCommit,
            gitMode: entry.gitMode,
            gitBlobObjectId: entry.gitBlobObjectId,
            sourceSha256,
            runtimeSha256,
            manifestSourceSha256: entry.sourceSha256,
            manifestRuntimeSha256: entry.runtimeSha256,
            relationMatch,
            gitBlobIdentityMatch,
            sourceMatch,
            runtimeMatch,
            valid: runtimeExists && relationMatch && sourceMatch && runtimeMatch && copiedMatch
        };
        if (!relationMatch) errors.push('manifest-relation-mismatch:' + entry.sourcePath);
        if (!gitBlobIdentityMatch) errors.push('git-blob-identity-mismatch:' + entry.sourcePath);
        if (!runtimeExists) errors.push('runtime-file-missing:' + entry.runtimePath);
        if (!sourceMatch) errors.push('source-hash-mismatch:' + entry.sourcePath);
        if (runtimeExists && !runtimeMatch) errors.push('runtime-hash-mismatch:' + entry.runtimePath);
        if (runtimeExists && sourceSha256 !== runtimeSha256) errors.push('git-blob-copy-hash-mismatch:' + entry.sourcePath);
        checks.push(check);
    }
    return {
        schemaVersion: 1,
        status: errors.length ? 'failed' : 'passed',
        sourceCommit: String(sourceCommit || '').toLowerCase(),
        runtimeName: path.basename(runtime),
        manifest: 'runtime-provenance.json',
        baselineIdentity: manifest.baselineIdentity,
        runtimeExclusions: manifest.runtimeExclusions,
        validatedProductScope: {
            sourceRoot: scope.sourceRoot,
            runtimeRoot: scope.runtimeRoot,
            includesIgnoredSourceFiles: scope.includesIgnoredSourceFiles === true,
            sourceSelection: scope.sourceSelection,
            sourceCommit: scope.sourceCommit,
            sourceAcquisition: scope.sourceAcquisition,
            excludedSourcePrefixes: Array.isArray(scope.excludedSourcePrefixes) ? scope.excludedSourcePrefixes : [],
            preparedSourcePaths: Array.isArray(scope.preparedSourcePaths) ? scope.preparedSourcePaths : [],
            fileCount: scope.fileCount,
            currentFileCount: expected.length
        },
        buildOverlays,
        preparedArtifacts,
        files: checks,
        errors
    };
}

const [command, rootArg, runtimeArg, sourceCommit] = process.argv.slice(2);
if (!command || !rootArg || !runtimeArg || !sourceCommit) usage();
const root = path.resolve(rootArg);
const runtime = path.resolve(runtimeArg);
const result = command === 'write'
    ? writeManifest(root, runtime, sourceCommit)
    : command === 'validate'
        ? validateManifest(root, runtime, sourceCommit)
        : usage();
process.stdout.write(JSON.stringify(result) + '\n');
if (result.status === 'failed') process.exitCode = 1;
