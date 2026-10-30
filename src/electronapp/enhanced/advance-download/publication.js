'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const {failure} = require('./source-probe');
const unsupported = new Set(['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EPERM', 'EINVAL', 'UNKNOWN']);
const ascii = value => JSON.stringify(value).replace(/[^\x20-\x7e]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));

function moveWindows(record, options = {}) {
    const environment = options.environment || process.env, systemRoot = environment.SystemRoot;
    if (!/^[A-Za-z]:\\[^\r\n]+$/.test(systemRoot || '')) return Promise.reject(failure('publication-unavailable'));
    const executable = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const code = fs.readFileSync(path.join(__dirname, 'windows-publish.cs')).toString('base64');
    const command = "$ErrorActionPreference='Stop'; try { Import-Module ([IO.Path]::Combine($PSHOME,'Modules','Microsoft.PowerShell.Utility','Microsoft.PowerShell.Utility.psd1')) -ErrorAction Stop; " +
        "Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + code + "'))); " +
        "$p=ConvertFrom-Json ([Console]::In.ReadLine()); $r=[EteMediaPublish]::Move($p.directory,$p.from,$p.to,$p.rootId.dev,$p.rootId.ino,$p.fileId.dev,$p.fileId.ino,[long]$p.size,$p.mtimeNs); " +
        "[Console]::Out.WriteLine('ETE_MEDIA_MOVE '+$r) } catch { [Console]::Out.WriteLine('ETE_MEDIA_MOVE rejected'); exit 1 }";
    return new Promise((resolve, reject) => {
        let child, output = '', invalid = false, timer;
        try {
            child = (options.spawn || cp.spawn)(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
                windowsHide: true, detached: false, stdio: ['pipe', 'pipe', 'ignore'],
                env: Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)']
                    .filter(key => environment[key] !== undefined).map(key => [key, environment[key]]))});
            // The commit is indivisible: cancellation waits for this owned child.
            // A timeout/unknown result preserves the intent for recovery on retry.
            timer = setTimeout(() => {invalid = true; child.kill();}, 30000);
            child.on('error', () => {invalid = true;});
            child.stdin.on('error', () => {invalid = true;});
            child.stdout.on('data', chunk => {output += chunk.toString('ascii'); if (output.length > 128) {invalid = true; child.kill();}});
            child.on('close', code => {
                clearTimeout(timer);
                if (!invalid && code === 0 && /^ETE_MEDIA_MOVE 0\r?\n$/.test(output)) return resolve();
                if (!invalid && code === 0 && /^ETE_MEDIA_MOVE (80|183)\r?\n$/.test(output)) return reject(Object.assign(Error('exists'), {code: 'EEXIST'}));
                reject(failure('publication-unconfirmed'));
            });
            child.stdin.end(ascii(record) + '\n');
        } catch (_) {clearTimeout(timer); if (child) child.kill(); reject(failure('publication-unavailable'));}
    });
}

function createPublisher(options = {}) {
    return async function publish(record, beforeMove) {
        try {await (options.link || fs.promises.link)(path.join(record.directory, record.from), path.join(record.directory, record.to));}
        catch (error) {
            if ((options.platform || process.platform) !== 'win32' || !unsupported.has(error.code)) throw error;
            await beforeMove();
            await (options.move || moveWindows)(record);
        }
    };
}
module.exports = {createPublisher, moveWindows};
