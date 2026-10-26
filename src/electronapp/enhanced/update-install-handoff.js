'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const net = require('net');
const crypto = require('crypto');
const update = require('./manual-app-update');
const failure = () => Object.assign(Error('installer-launch-failed'), {code: 'installer-launch-failed'});

function createHandoff(options) {
    const settings = options || {};
    function start(record, mode, signal) {
        if ((settings.platform || process.platform) !== 'win32') return Promise.reject(failure());
        if (signal && signal.aborted) return Promise.reject(Object.assign(Error('cancelled'), {code: 'cancelled'}));
        const environment = settings.environment || process.env, systemRoot = environment.SystemRoot;
        if (!/^[A-Za-z]:\\[^\r\n]+$/.test(systemRoot || '')) return Promise.reject(failure());
        const executable = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        const bytes = settings.randomBytes || crypto.randomBytes;
        const pipe = 'ete-update-' + bytes(16).toString('hex'), secret = bytes(32).toString('hex');
        const source = update.SOURCES.find(item => item.id === record.source);
        const payload = {mode, parentPid: process.pid, root: record.root, rootIno: record.rootId.ino, rootDev: record.rootId.dev,
            mainExecutable: record.executable, hostPid: process.ppid, hostPath: path.resolve(__dirname, '../..', 'Emby.Theater.exe'),
            directory: record.directory, directoryIno: record.directoryId.ino, name: record.installer.name,
            ino: record.fileId && record.fileId.ino, size: record.installer.size, sha256: record.installer.sha256,
            zone: source ? update.internetZone(source.prefix + record.installer.url) : '', files: record.files || []};
        const ascii = value => JSON.stringify(value).replace(/[^\x20-\x7e]/g, character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
        const guard = fs.readFileSync(path.join(__dirname, 'update-install-guard.cs')).toString('base64');
        const command = "$eteGuardSource=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + guard + "'))\n" + fs.readFileSync(path.join(__dirname, 'update-install-handoff.ps1'), 'utf8');
        // Authenticated local IPC carries fixed shipped code and main-owned data.
        const bootstrap = "$ErrorActionPreference='Stop'; [Console]::Error.WriteLine('ETE_GUARD_STAGE start'); $p=[IO.Pipes.NamedPipeClientStream]::new('.', '" + pipe + "', [IO.Pipes.PipeDirection]::InOut); $p.Connect(30000); [Console]::Error.WriteLine('ETE_GUARD_STAGE connected'); " +
            "$r=[IO.StreamReader]::new($p,[Text.Encoding]::ASCII); $w=[IO.StreamWriter]::new($p,[Text.Encoding]::ASCII); $w.AutoFlush=$true; $w.WriteLine('" + secret + " '+$PID); " +
            "$code=$r.ReadLine(); [Console]::Error.WriteLine('ETE_GUARD_STAGE source-read'); $eteUpdateInput=$r; $eteUpdateOutput=$w; try { & ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($code)))) } finally { try{$w.Dispose()}catch{};try{$r.Dispose()}catch{};try{$p.Dispose()}catch{} }";
        const relay = fs.readFileSync(path.join(__dirname, 'update-install-relay.cs')).toString('base64');
        // Resolve the fixed inbox module directly. Autodiscovery without the
        // host's module-analysis cache can consume the entire prepare budget.
        const launch = "Import-Module ([IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Utility','Microsoft.PowerShell.Utility.psd1')) -ErrorAction Stop; Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + relay + "'))); exit [EteUpdateRelay]::Run()";
        return new Promise((resolve, reject) => {
            let child, socket, server, ready = false, settled = false, committed = false, stopping = false, cleaned = false, disposed = false;
            let commitResolve, commitReject, commitTimer, commitDeadline, guardPid;
            const sockets = new Set(), deadline = Date.now() + 30000;
            let confirmExit; const exited = new Promise(done => { confirmExit = done; });
            const disposeTransport = () => { if (disposed) return; disposed = true; for (const item of sockets) item.destroy(); if (server) server.close(); };
            const finish = error => {
                if (settled) return;
                settled = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', abort);
                const complete = () => { disposeTransport(); error ? reject(error) : resolve(); };
                if (error && child) exited.then(complete); else complete();
            };
            const abort = () => {
                if (committed) return Promise.resolve();
                if (signal) signal.removeEventListener('abort', abort);
                if (commitReject) { clearTimeout(commitTimer); const failed = commitReject; commitReject = null; exited.then(() => failed(failure())); }
                if (!stopping) { stopping = true; if (child) child.stdin.end('abort\n'); }
                if (!child) finish(signal && signal.aborted ? Object.assign(Error('cancelled'), {code: 'cancelled'}) : failure());
                return child ? exited : Promise.resolve();
            };
            const timer = setTimeout(() => { abort(); finish(failure()); }, 30000);
            server = (settings.createServer || net.createServer)(connection => {
                sockets.add(connection); let pending = '', authenticated = false;
                connection.on('error', () => {});
                connection.on('data', chunk => {
                    if (stopping || committed) { connection.destroy(); return; }
                    pending += chunk.toString('ascii').replace(/\r/g, '');
                    if (pending.length > 1024) { connection.destroy(); return; }
                    let index;
                    while ((index = pending.indexOf('\n')) !== -1) {
                        const line = pending.slice(0, index); pending = pending.slice(index + 1);
                        if (!authenticated) {
                            const match = /^([0-9a-f]{64}) ([1-9][0-9]{0,9})$/.exec(line);
                            if (socket || !match || !crypto.timingSafeEqual(Buffer.from(match[1]), Buffer.from(secret)) || Number(match[2]) > 0xffffffff) { connection.destroy(); return; }
                            authenticated = true; socket = connection; guardPid = Number(match[2]);
                            socket.write(Buffer.from(command, 'utf8').toString('base64') + '\n' + ascii(payload) + '\n');
                            continue;
                        }
                        if (stopping || Date.now() >= deadline || (signal && signal.aborted)) { abort(); return; }
                        if (mode === 'cleanup' && line === 'ETE_CLEANUP_DONE') { cleaned = true; continue; }
                        if (mode === 'install' && line === 'ETE_INSTALL_READY' && !ready) {
                            ready = true; settled = true; clearTimeout(timer);
                            resolve({processId: guardPid,
                                commit() {
                                    if (committed || stopping || commitResolve || child.exitCode !== null || (signal && signal.aborted)) throw failure();
                                    return new Promise((yes, no) => { commitResolve = yes; commitReject = no; commitDeadline = Date.now() + 5000; commitTimer = setTimeout(abort, 5000); socket.write('commit\n'); });
                                }, abort});
                        } else if (mode === 'install' && line === 'ETE_INSTALL_ARMED' && commitResolve) {
                            if (Date.now() >= commitDeadline) { abort(); return; }
                            committed = true; clearTimeout(commitTimer); if (signal) signal.removeEventListener('abort', abort);
                            child.stdin.end('detach\n'); child.unref(); disposeTransport();
                            const done = commitResolve; commitResolve = null; commitReject = null; done();
                        } else { abort(); finish(failure()); }
                    }
                });
                connection.on('close', () => { sockets.delete(connection); if (connection === socket && !committed && !cleaned && !stopping) abort(); });
            });
            server.on('error', () => { abort(); finish(failure()); });
            server.listen('\\\\.\\pipe\\' + pipe, () => {
                if (stopping) { disposeTransport(); return; }
                try {
                    child = (settings.spawn || cp.spawn)(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', launch], {
                        windowsHide: true, detached: false, stdio: ['pipe', 'ignore', 'ignore'],
                        env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)']
                            .filter(key => environment[key] !== undefined).map(key => [key, environment[key]]))});
                    child.stdin.on('error', () => { if (!committed) { abort(); finish(failure()); } });
                    child.on('error', () => { abort(); finish(failure()); });
                    child.on('close', code => {
                        confirmExit(); if (committed) return;
                        if (commitReject) { clearTimeout(commitTimer); commitReject(failure()); commitReject = null; }
                        disposeTransport();
                        if (mode === 'cleanup' && code === 0 && cleaned) finish();
                        else finish(signal && signal.aborted ? Object.assign(Error('cancelled'), {code: 'cancelled'}) : failure());
                    });
                    if (signal) signal.addEventListener('abort', abort, {once: true});
                    child.stdin.write(Buffer.from(bootstrap, 'utf16le').toString('base64') + '\n');
                    if (signal && signal.aborted) abort();
                } catch (_) { abort(); finish(failure()); }
            });
        });
    }
    return {prepare: (record, signal) => start(record, 'install', signal), cleanup: record => start(record, 'cleanup')};
}
module.exports = {createHandoff};
