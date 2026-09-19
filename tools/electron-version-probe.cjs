'use strict';

const fs = require('fs');
const path = require('path');

function evaluateVersions(actual, expected) {
    const fields = ['electron', 'chrome', 'node', 'v8'];
    const mismatches = fields.filter(field => String(actual && actual[field] || '') !== String(expected && expected[field] || ''));
    return {ok: mismatches.length === 0, mismatches};
}

function probe(runtimeArg, versions, execPath) {
    const runtime = path.resolve(runtimeArg);
    const provenancePath = path.join(runtime, 'source-provenance.json');
    if (!fs.existsSync(provenancePath) || !fs.statSync(provenancePath).isFile()) throw new Error('Source provenance is missing.');
    const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
    const electron = provenance && provenance.runtimeIdentities && provenance.runtimeIdentities.electron;
    const expected = electron && electron.processVersions;
    if (!expected) throw new Error('Electron process version provenance is missing.');
    const actual = {
        electron: versions.electron || null,
        chrome: versions.chrome || null,
        node: versions.node || null,
        v8: versions.v8 || null
    };
    const versionResult = evaluateVersions(actual, expected);
    const expectedExecutable = path.resolve(runtime, 'x64', 'electron', 'electron.exe');
    const executableMatch = path.resolve(execPath).toLowerCase() === expectedExecutable.toLowerCase();
    return {
        status: versionResult.ok && executableMatch ? 'passed' : 'failed',
        actual,
        expected,
        executableMatch,
        mismatches: versionResult.mismatches
    };
}

if (require.main === module) {
    try {
        const runtime = process.argv[2];
        if (!runtime) throw new Error('Runtime path is required.');
        const result = probe(runtime, process.versions, process.execPath);
        process.stdout.write(JSON.stringify(result) + '\n');
        if (result.status !== 'passed') process.exitCode = 1;
    } catch (error) {
        process.stderr.write(String(error && error.message || error) + '\n');
        process.exitCode = 1;
    }
}

module.exports = {evaluateVersions, probe};
