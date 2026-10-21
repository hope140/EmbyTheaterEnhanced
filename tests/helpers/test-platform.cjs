'use strict';

const fs = require('node:fs');

// These probes test portable PowerShell logic. Windows retains its original
// Windows PowerShell / PowerShell 7 coverage; POSIX hosts use installed pwsh.
function portablePowerShell(platform = process.platform) {
    return platform === 'win32' ? 'powershell.exe' : 'pwsh';
}

function powerShell7(platform = process.platform) {
    return platform === 'win32' ? 'pwsh.exe' : 'pwsh';
}

function windowsIntegrationSkip(reason, platform = process.platform) {
    return platform === 'win32' ? false : reason;
}

// Mount identities belong to the Windows client, even when Node runs on Linux.
// Keep real filesystem fixtures on Windows and model only their exact existing
// paths elsewhere. Product code still rejects POSIX local filesystem probes.
function windowsMountFileSystem(platform = process.platform) {
    if (platform === 'win32') return fs;
    const files = new Set();
    let sequence = 0;
    return {
        mkdtempSync() { return 'C:\\ete-mount-fixture\\' + (++sequence); },
        writeFileSync(name) { files.add(name); },
        existsSync(name) { return files.has(name); },
        rmSync(directory) {
            for (const name of files) {
                if (name.startsWith(directory + '\\')) files.delete(name);
            }
        }
    };
}

module.exports = {portablePowerShell, powerShell7, windowsIntegrationSkip, windowsMountFileSystem};
