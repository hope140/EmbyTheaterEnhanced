'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const update = require('./manual-app-update');
const failure = () => Object.assign(Error('installer-launch-failed'), {code: 'installer-launch-failed'});

// No caller-controlled shell command, PATH search, inherited token, policy override or
// silent installer arguments. The helper has no network/download functionality.
function createHandoff(options) {
    const settings = options || {};
    function start(record, mode, signal) {
        if ((settings.platform || process.platform) !== 'win32') return Promise.reject(failure());
        if (signal && signal.aborted) return Promise.reject(Object.assign(Error('cancelled'), {code: 'cancelled'}));
        const environment = settings.environment || process.env;
        const systemRoot = environment.SystemRoot;
        if (!/^[A-Za-z]:\\[^\r\n]+$/.test(systemRoot || '')) return Promise.reject(failure());
        const executable = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        // Fixed shipped code, supplied as a command argument (not a downloaded
        // script). This releases every installation-directory file before quit.
        // No -ExecutionPolicy, policy setting or constrained-language override.
        const guard = fs.readFileSync(path.join(__dirname, 'update-install-guard.cs')).toString('base64');
        const command = "$eteGuardSource = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + guard + "'))\n" +
            fs.readFileSync(path.join(__dirname, 'update-install-handoff.ps1'), 'utf8');
        const source = update.SOURCES.find(item => item.id === record.source);
        const payload = {mode, parentPid: process.pid, root: record.root, rootIno: record.rootId.ino, rootDev: record.rootId.dev,
            mainExecutable: record.executable, hostPid: process.ppid, hostPath: path.resolve(__dirname, '../..', 'Emby.Theater.exe'),
            directory: record.directory, directoryIno: record.directoryId.ino,
            name: record.installer.name, ino: record.fileId && record.fileId.ino,
            size: record.installer.size, sha256: record.installer.sha256,
            zone: source ? update.internetZone(source.prefix + record.installer.url) : '', files: record.files || []};
        return new Promise((resolve, reject) => {
            let child, ready = false, settled = false, committed = false, stopRequested = false, output = '', commitResolve, commitReject, commitTimer, commitDeadline;
            const prepareDeadline = Date.now() + 30000;
            let confirmExit;
            const exited = new Promise(done => { confirmExit = done; });
            const finish = error => {
                if (settled) return;
                settled = true; clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', abort);
                if (error && child) exited.then(() => reject(error));
                else error ? reject(error) : resolve();
            };
            const abort = () => {
                if (committed) return Promise.resolve();
                if (signal) signal.removeEventListener('abort', abort);
                if (commitReject) { clearTimeout(commitTimer); const failed = commitReject; commitReject = null; exited.then(() => failed(failure())); }
                if (child && !stopRequested) { stopRequested = true; child.stdin.end('abort\n'); child.kill(); }
                return child ? exited : Promise.resolve();
            };
            const timer = setTimeout(() => { abort(); finish(failure()); }, 30000);
            try {
                child = (settings.spawn || cp.spawn)(executable,
                    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
                    {windowsHide: true, detached: true, stdio: ['pipe', 'pipe', 'ignore'],
                        env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)']
                            .filter(key => environment[key] !== undefined).map(key => [key, environment[key]]))});
                child.stdin.on('error', () => { if (!committed) { abort(); finish(failure()); } });
                child.on('error', () => { abort(); finish(failure()); });
                child.on('close', code => {
                    confirmExit();
                    if (committed) return;
                    if (commitReject) { clearTimeout(commitTimer); commitReject(failure()); commitReject = null; }
                    if (mode === 'cleanup' && code === 0 && output.trim() === 'ETE_CLEANUP_DONE') finish();
                    else finish(signal && signal.aborted ? Object.assign(Error('cancelled'), {code: 'cancelled'}) : failure());
                });
                if (signal) signal.addEventListener('abort', abort, {once: true});
                child.stdout.on('data', bytes => {
                    output += bytes.toString('utf8').replace(/\r/g, '');
                    if (output.length > 1024) { abort(); finish(failure()); return; }
                    if (!stopRequested && !ready && output.trim() === 'ETE_INSTALL_READY' && mode === 'install') {
                        if (Date.now() >= prepareDeadline || (signal && signal.aborted)) { abort(); finish(failure()); return; }
                        ready = true; clearTimeout(timer); settled = true;
                        resolve({
                            commit() {
                                if (committed || commitResolve || stopRequested || !ready || child.killed || child.exitCode !== null || (signal && signal.aborted)) throw failure();
                                return new Promise((resolveCommit, rejectCommit) => {
                                    commitResolve = resolveCommit; commitReject = rejectCommit;
                                    commitDeadline = Date.now() + 5000;
                                    commitTimer = setTimeout(abort, 5000);
                                    child.stdin.end('commit\n');
                                });
                            },
                            abort
                        });
                    }
                    if (!stopRequested && ready && commitResolve && output.trim() === 'ETE_INSTALL_READY\nETE_INSTALL_ARMED') {
                        if (Date.now() >= commitDeadline) { abort(); return; }
                        committed = true; clearTimeout(commitTimer);
                        if (signal) signal.removeEventListener('abort', abort);
                        child.stdout.destroy(); child.unref();
                        commitReject = null; const done = commitResolve; commitResolve = null; done();
                    }
                });
                // Windows PowerShell 5.1 may use the active OEM input encoding.
                // ASCII JSON escapes preserve Unicode paths without changing it.
                child.stdin.write(JSON.stringify(payload).replace(/[^\x20-\x7e]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
                if (mode === 'cleanup') child.stdin.end();
            } catch (_) { abort(); finish(failure()); }
        });
    }
    return {prepare: (record, signal) => start(record, 'install', signal), cleanup: record => start(record, 'cleanup')};
}

module.exports = {createHandoff};
