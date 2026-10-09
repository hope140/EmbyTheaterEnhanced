'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Only the package's fixed provenance and binary paths are admitted. Renderer
// requests never supply paths, versions or hashes.
function readBundledVersions(runtimeRoot, sourceCommit) {
    try {
        if (!/^[0-9a-f]{40}$/.test(sourceCommit || '')) return null;
        const file = path.join(runtimeRoot, 'native-helper-provenance.json');
        if (fs.statSync(file).size > 64 * 1024) return null;
        const bytes = fs.readFileSync(file);
        const manifestFile = path.join(runtimeRoot, 'build-manifest.json');
        if (fs.statSync(manifestFile).size > 2 * 1024 * 1024) return null;
        const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
        if (manifest.schemaVersion !== 3 || manifest.sourceCommit !== sourceCommit || !Array.isArray(manifest.files)) return null;
        const bindings = manifest.files.filter(entry => entry.path === 'native-helper-provenance.json');
        if (bindings.length !== 1 || bindings[0].sha256 !== crypto.createHash('sha256').update(bytes).digest('hex')) return null;
        const record = JSON.parse(bytes.toString('utf8'));
        if (record.schemaVersion !== 1 || record.protocolVersion !== 1 || record.sourceCommit !== sourceCommit) return null;
        const helper = record.helper;
        const mpv = record.libmpv;
        if (!helper || helper.testing !== false || !/^\d+\.\d+\.\d+$/.test(helper.version || '') ||
            !mpv || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(mpv.version || '')) return null;
        const entries = [[helper, 'electronapp/native-helper/ete-mpv-helper.exe'], [mpv, 'electronapp/libmpv/x64/mpv-1.dll']];
        for (const [entry, relative] of entries) {
            if (entry.runtimePath !== relative || !/^[0-9a-f]{64}$/.test(entry.sha256 || '')) return null;
            const binary = path.join(runtimeRoot, relative);
            const stat = fs.lstatSync(binary);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024 * 1024) return null;
            if (crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex') !== entry.sha256) return null;
        }
        return {helperVersion: helper.version, libmpvVersion: mpv.version};
    } catch (_) {
        return null;
    }
}

module.exports = {readBundledVersions};
