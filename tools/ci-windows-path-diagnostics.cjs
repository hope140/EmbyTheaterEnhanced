'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function displayPath(value) {
    // Keep short-name evidence in flags, without publishing a profile name.
    return value.replace(/([A-Za-z]:[\\/]Users[\\/])[^\\/]+/i, '$1<USER>')
        .replace(/(\/(?:home|Users)\/)[^/]+/, '$1<USER>');
}

function inspectPath(value, format = displayPath) {
    const resolved = path.resolve(value);
    const native = fs.realpathSync.native(resolved);
    const stat = fs.lstatSync(resolved);
    const normalize = p => process.platform === 'win32' ? p.toLowerCase() : p;
    return {
        resolved: format(resolved), native: format(native),
        resolvedEqualsNative: normalize(resolved) === normalize(native),
        hasShortNameSegment: /(?:^|[\\/])[^\\/]*~\d+(?:[\\/]|$)/.test(resolved),
        lstat: {directory: stat.isDirectory(), symbolicLink: stat.isSymbolicLink(), mode: stat.mode}
    };
}

function collect() {
    // Stable labels preserve equality relationships for arbitrary TEMP locations.
    const labels = new Map();
    const snapshot = value => inspectPath(value, actual => {
        if (!labels.has(actual)) labels.set(actual, '<PATH_' + (labels.size + 1) + '>');
        return labels.get(actual);
    });
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
            ancestors.push(snapshot(current));
            const parent = path.dirname(current);
            if (parent === current) break;
            current = parent;
        }
        return {
            schemaVersion: 1, platform: process.platform, node: process.version,
            temporaryRoot: snapshot(temporaryRoot), parent: snapshot(path.dirname(temporaryRoot)),
            rawMkdtemp: snapshot(raw), physicalMkdtemp: snapshot(physical),
            rawChild: snapshot(child), physicalChild: snapshot(path.join(physical, 'repo', 'electronapp', 'node_modules')),
            ancestors, credentialsCollected: false
        };
    } finally {
        fs.rmSync(physical, {recursive: true, force: true});
    }
}

module.exports = {collect, inspectPath, displayPath};
if (require.main === module) process.stdout.write(JSON.stringify(collect(), null, 2) + '\n');
