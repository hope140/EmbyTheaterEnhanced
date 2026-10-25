'use strict';
// Owned synthetic client for the hosted-Windows test ONLY; no Electron/bootstrap,
// public downloads, real installer, UI automation or policy changes.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    process.env.ETE_MANAGED_UPDATE_WIZARD_TEST !== '1' || process.argv.length !== 3) throw Error('hosted-test-only');
const root = fs.realpathSync.native(process.argv[2]);
if (!path.basename(root).startsWith('ete-controlled-wizard-') || !root.startsWith(fs.realpathSync.native(require('node:os').tmpdir()) + path.sep)) throw Error('owned-root-required');
const bytes = fs.readFileSync(path.join(root, 'probe.exe'));
const name = 'EmbyTheaterEnhanced-9.1.0-win-x64-setup.exe';
const installer = {id: 12, name, url: 'https://github.com/hope140/EmbyTheaterEnhanced/releases/download/v9.1.0/' + name,
    size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')};
const update = require('../../src/electronapp/enhanced/manual-app-update');
const handoff = require('../../src/electronapp/enhanced/update-install-handoff').createHandoff({spawn(exe, args, options) {
    // Keep this test-owned orphan in the hosted runner's teardown ownership.
    // Production's credential/environment whitelist remains unchanged.
    const child = cp.spawn(exe, args, {...options, env: {...options.env, RUNNER_TRACKING_ID: process.env.RUNNER_TRACKING_ID}});
    if (child.pid) fs.writeFileSync(path.join(root, 'helper-pid.json'), JSON.stringify({pid: child.pid, exe}));
    return child;
}});
const profileRoot = path.join(root, 'profile'); fs.mkdirSync(profileRoot);
const store = require('../../src/electronapp/enhanced/update-install-cache').createStore({profileRoot, executable: process.execPath, handoff,
    downloadInstaller: async (asset, directory) => {
        const file = path.join(directory, asset.name); fs.writeFileSync(file, bytes, {flag: 'wx'});
        fs.writeFileSync(file + ':Zone.Identifier', update.internetZone(asset.url), {flag: 'wx'});
        return {source: 'github'};
    }});
(async () => {
    const request = {currentVersion: '9.0.0', targetVersion: '9.1.0', tag: 'v9.1.0', signal: new AbortController().signal};
    const record = await store.download(installer, request);
    fs.writeFileSync(path.join(root, 'client-pid'), String(process.pid));
    const lease = await store.prepare(record, request.signal); await lease.commit();
    fs.writeFileSync(path.join(root, 'committed.json'), JSON.stringify({directory: record.directory, installer}));
    // Natural Node exit after the real handoff detaches; no forced exit/kill.
})().catch(() => { process.stderr.write('Controlled client handoff failed.\n'); process.exitCode = 1; });
