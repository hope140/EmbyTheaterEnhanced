'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function displayPath(value) {
    // Keep short-name evidence in flags, without publishing a profile name.
    return value.replace(/([A-Za-z]:[\\/]Users[\\/])[^\\/]+/i, '$1<USER>')
        .replace(/(\/(?:home|Users)\/)[^/]+/, '$1<USER>');
}

function inspectPath(value) {
    const resolved = path.resolve(value);
    const native = fs.realpathSync.native(resolved);
    const stat = fs.lstatSync(resolved);
    const normalize = p => process.platform === 'win32' ? p.toLowerCase() : p;
    return {
        resolved: displayPath(resolved), native: displayPath(native),
        resolvedEqualsNative: normalize(resolved) === normalize(native),
        hasShortNameSegment: /(?:^|[\\/])[^\\/]*~\d+(?:[\\/]|$)/.test(resolved),
        lstat: {directory: stat.isDirectory(), symbolicLink: stat.isSymbolicLink(), mode: stat.mode}
    };
}

function collect() {
    const temporaryRoot = os.tmpdir();
    const raw = fs.mkdtempSync(path.join(temporaryRoot, 'ete-ci-path-'));
    const physical = fs.realpathSync.native(raw);
    const physicalParent = fs.realpathSync.native(temporaryRoot);
    // Cleanup is confined to the one physical directory created by this probe.
    if (path.dirname(physical) !== physicalParent || !path.basename(physical).startsWith('ete-ci-path-') ||
        fs.lstatSync(physical).isSymbolicLink()) throw new Error('Diagnostic temporary directory boundary mismatch.');
    try {
        const child = path.join(raw, 'repo', 'electronapp', 'node_modules');
        fs.mkdirSync(child, {recursive: true});
        const ancestors = [];
        for (let current = path.resolve(temporaryRoot);;) {
            ancestors.push(inspectPath(current));
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
        return {
            schemaVersion: 1, platform: process.platform, node: process.version,
            temporaryRoot: inspectPath(temporaryRoot), parent: inspectPath(path.dirname(temporaryRoot)),
            rawMkdtemp: inspectPath(raw), physicalMkdtemp: inspectPath(physical),
            rawChild: inspectPath(child), physicalChild: inspectPath(path.join(physical, 'repo', 'electronapp', 'node_modules')),
            ancestors, credentialsCollected: false
        };
    } finally {
        fs.rmSync(physical, {recursive: true, force: true});
    }
}

module.exports = {collect, inspectPath, displayPath};
if (require.main === module) process.stdout.write(JSON.stringify(collect(), null, 2) + '\n');
