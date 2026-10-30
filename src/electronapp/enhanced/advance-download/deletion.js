'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const {failure, reasonOf} = require('./source-probe');
const probeReason = (error, fallback) => reasonOf(error) === 'source-unavailable' ? failure(fallback) : error;
const records = require('./task-store');
const ascii = value => JSON.stringify(value).replace(/[^\x20-\x7e]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
function deleteWindows(record, options = {}) {
    const environment = options.environment || process.env, systemRoot = environment.SystemRoot;
    if (!/^[A-Za-z]:\\[^\r\n]+$/.test(systemRoot || '') || options.signal?.aborted) return Promise.reject(failure('file-delete-unavailable'));
    const executable = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const code = fs.readFileSync(path.join(__dirname, 'windows-delete.cs')).toString('base64');
    const command = "$ErrorActionPreference='Stop'; $eteStage='compile'; try { Import-Module ([IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Utility','Microsoft.PowerShell.Utility.psd1')) -ErrorAction Stop; " +
        "Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + code + "'))); " +
        "$p=ConvertFrom-Json ([Console]::In.ReadLine()); $eteStage='invoke'; $r=[EteMediaDelete]::Delete($p.directory,$p.name,$p.rootId.dev,$p.rootId.ino,$p.fileId.dev,$p.fileId.ino,[long]$p.size,$p.mtimeNs,$p.sha256); " +
        "[Console]::Out.WriteLine('ETE_MEDIA_DELETE '+$r) } catch { if($eteStage -eq 'invoke'){$eteStage=[EteMediaDelete]::Stage}; [Console]::Out.WriteLine('ETE_MEDIA_DELETE rejected '+$eteStage); exit 1 }";
    return new Promise((resolve, reject) => {
        let child, timer, output = '', invalid = false;
        const abort = () => {invalid = true; child?.kill();};
        try {
            child = (options.spawn || cp.spawn)(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
                windowsHide: true, detached: false, stdio: ['pipe', 'pipe', 'ignore'],
                env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)']
                    .filter(key => environment[key] !== undefined).map(key => [key, environment[key]]))});
            options.signal?.addEventListener('abort', abort, {once: true});
            timer = setTimeout(abort, 120000);
            child.on('error', () => {invalid = true;}); child.stdin.on('error', () => {invalid = true;});
            child.stdout.on('data', chunk => {output += chunk.toString('ascii'); if (output.length > 128) abort();});
            child.on('close', code => {
                clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
                if (!invalid && code === 0 && /^ETE_MEDIA_DELETE 0\r?\n$/.test(output)) return resolve();
                reject(failure('file-delete-unconfirmed'));
            });
            child.stdin.end(ascii(record) + '\n');
            if (options.signal?.aborted) abort();
        } catch (_) {clearTimeout(timer); options.signal?.removeEventListener('abort', abort); child?.kill(); reject(failure('file-delete-unavailable'));}
    });
}
function createDeleter(options = {}) {
    return async function remove(task, signal) {
        const receipt = task.file || task.partial;
        if (!receipt) return;
        if (!task.file && task.partial?.publishing) throw failure('publication-unconfirmed');
        const preflight = signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
        async function wait(work) {
            if (preflight.aborted) throw failure('file-unavailable');
            let abort;
            try {return await Promise.race([work, new Promise((_, reject) => {
                abort = () => reject(failure('file-unavailable'));
                preflight.addEventListener('abort', abort, {once: true});
                if (preflight.aborted) abort();
            })]);} finally {preflight.removeEventListener('abort', abort);}
        }
        let root, stat;
        try {
            root = await wait(fs.promises.realpath(task.directory));
            const expected = path.resolve(task.directory), rootStat = await wait(fs.promises.lstat(task.directory, {bigint: true}));
            if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (process.platform === 'win32' ? root.toLowerCase() !== expected.toLowerCase() : root !== expected)) throw Error();
            if (!records.sameId(rootStat, receipt.rootId)) throw failure('directory-changed');
        } catch (error) {throw probeReason(error, 'directory-unavailable');}
        try {stat = await wait(fs.promises.lstat(path.join(root, receipt.name), {bigint: true}));}
        catch (error) {throw error.downloadReason ? error : failure(error.code === 'ENOENT' ? 'file-missing' : 'file-unavailable');}
        const size = task.file ? receipt.size : receipt.offset;
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || !records.sameId(stat, receipt.fileId) || Number(stat.size) !== size ||
            task.file && String(stat.mtimeNs) !== receipt.mtimeNs) throw failure('file-changed');
        if ((options.platform || process.platform) !== 'win32') throw failure('file-delete-unavailable');
        if (signal?.aborted) throw failure('file-unavailable');
        await (options.removeWindows || deleteWindows)({directory: root, name: receipt.name, rootId: receipt.rootId, fileId: receipt.fileId,
            size, mtimeNs: String(stat.mtimeNs), sha256: receipt.sha256}, {...options, signal});
    };
}
module.exports = {createDeleter, deleteWindows};
