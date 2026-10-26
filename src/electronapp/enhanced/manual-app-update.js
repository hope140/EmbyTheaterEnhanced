'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const REPO = 'hope140/EmbyTheaterEnhanced';
const API = 'https://api.github.com/repos/' + REPO + '/releases/';
const MAX_INSTALLER_BYTES = 512 * 1024 * 1024;
// Maintained candidates, never a user supplied URL. Evidence and limits: docs/MANUAL_APP_UPDATE.md.
const SOURCES = Object.freeze([
    Object.freeze({id: 'github', prefix: ''}),
    Object.freeze({id: 'gh-proxy.com', prefix: 'https://gh-proxy.com/'})
]);
const CONNECTION_ERRORS = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'timeout']);
const CONNECTION_FAILURE = Symbol('connection-failure');

function failure(code) { return Object.assign(new Error(code), {code}); }
function connectionFailure(error) {
    if (CONNECTION_ERRORS.has(error.code)) error[CONNECTION_FAILURE] = true;
    return error;
}
async function* connectionChunks(response) {
    try { for await (const chunk of response) yield chunk; }
    catch (error) { throw connectionFailure(error); }
}
function check(signal, deadline) {
    if (signal && signal.aborted) throw failure(signal.reason && signal.reason.code === 'timeout' ? 'timeout' : 'cancelled');
    if (Date.now() >= deadline) throw failure('timeout');
}

function installerFromRelease(release) {
    const tag = release.tag_name;
    if (!require('./maintenance').parseVersion(tag) || tag !== tag.trim()) return null;
    const version = tag.replace(/^v/, '');
    const name = 'EmbyTheaterEnhanced-' + version + '-win-x64-setup.exe';
    const assets = Array.isArray(release.assets) ? release.assets.filter(asset => asset.name === name) : [];
    if (assets.length !== 1) return null;
    const asset = assets[0];
    const url = 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + name;
    if (asset.browser_download_url !== url || asset.state !== 'uploaded' ||
        !Number.isSafeInteger(asset.id) || asset.id <= 0 ||
        !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_INSTALLER_BYTES ||
        !/^sha256:[0-9a-f]{64}$/.test(asset.digest || '')) return null;
    return {id: asset.id, name, url, size: asset.size, sha256: asset.digest.slice(7)};
}

function safeTarget(value, context) {
    let url;
    try { url = new URL(value); } catch (_) { throw failure('unsafe-redirect'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw failure('unsafe-redirect');
    if (context.metadata) {
        if (url.href !== context.metadata) throw failure('unsafe-redirect');
    } else {
        const official = value === context.assetUrl ||
            ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname);
        const proxy = context.source.prefix && value === context.source.prefix + context.assetUrl;
        if (!official && !proxy) throw failure('unsafe-redirect');
    }
    return url;
}

async function responseFor(url, context, options) {
    const signal = options.signal;
    const deadline = options.deadline;
    const get = options.get || https.get;
    for (let redirects = 0; ; redirects++) {
        check(signal, deadline);
        const target = safeTarget(url, context);
        const response = await new Promise((resolve, reject) => {
            const request = get(target, {
                signal, agent: options.agent,
                headers: {'User-Agent': 'EmbyTheaterEnhanced', Accept: context.metadata ? 'application/vnd.github+json' : 'application/octet-stream', 'Accept-Encoding': 'identity'}
            }, resolve);
            request.on('error', reject);
            request.setTimeout(Math.min(15000, Math.max(1, deadline - Date.now())), () => request.destroy(failure('timeout')));
        }).catch(error => { throw connectionFailure(error); });
        // Also listen while rejecting headers or a redirect, before an async iterator owns it.
        response.on('error', function () {});
        try {
            check(signal, deadline);
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                if (redirects >= 4 || !response.headers.location) throw failure('unsafe-redirect');
                url = new URL(response.headers.location, target).href;
                safeTarget(url, context);
                response.destroy();
                continue;
            }
            if (response.statusCode !== 200) throw failure('http-rejected');
            if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') throw failure('encoding-rejected');
            return response;
        } catch (error) { response.destroy(); throw error; }
    }
}

async function requestJson(url, options) {
    const settings = options || {};
    if (!(url === API + 'latest' || /^https:\/\/api\.github\.com\/repos\/hope140\/EmbyTheaterEnhanced\/releases\/tags\/v?[0-9A-Za-z.+-]+$/.test(url) ||
        /^https:\/\/api\.github\.com\/repos\/hope140\/EmbyTheaterEnhanced\/releases\?per_page=5&page=(?:[1-9]\d?|100)$/.test(url))) throw failure('invalid-release-identity');
    const controller = new AbortController();
    const signal = settings.signal ? AbortSignal.any([settings.signal, controller.signal]) : controller.signal;
    const deadline = Date.now() + (settings.timeoutMs || 8000);
    const timer = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
    const agent = new https.Agent({keepAlive: false});
    try {
        const response = await responseFor(url, {metadata: url}, {...settings, signal, deadline, agent});
        let size = 0;
        const chunks = [];
        try {
            for await (const chunk of response) {
                check(signal, deadline);
                size += chunk.length;
                if (size > 256 * 1024) throw failure('metadata-too-large');
                chunks.push(chunk);
            }
            check(signal, deadline);
            return JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } finally { response.destroy(); }
    } finally { clearTimeout(timer); agent.destroy(); }
}

function physicalDirectory(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw failure('directory-invalid');
    const resolved = path.resolve(directory);
    if (process.platform === 'win32' && !/^[A-Za-z]:\\/.test(resolved)) throw failure('directory-invalid');
    const actual = fs.realpathSync.native(resolved);
    const same = process.platform === 'win32' ? actual.toLowerCase() === resolved.toLowerCase() : actual === resolved;
    if (!same || !fs.lstatSync(resolved).isDirectory() || fs.lstatSync(resolved).isSymbolicLink()) throw failure('directory-invalid');
    return actual;
}

function sameFile(left, right) { return left.dev === right.dev && left.ino === right.ino; }
function ownedDirectory(root, identity) {
    return physicalDirectory(root) === root && sameFile(fs.lstatSync(root, {bigint: true}), identity);
}
function ownedTemporary(file, identity) {
    const stat = fs.lstatSync(file, {bigint: true});
    return stat.isFile() && !stat.isSymbolicLink() && sameFile(stat, identity);
}

function internetZone(assetUrl) {
    return '[ZoneTransfer]\r\nZoneId=3\r\nReferrerUrl=https://github.com/' + REPO + '/releases\r\nHostUrl=' + assetUrl + '\r\n';
}

async function markInternetDownload(file, assetUrl) {
    if (process.platform !== 'win32') return;
    // Native downloads must retain Windows Attachment Manager/SmartScreen's
    // Internet-zone input. If ADS is unsupported, fail closed; do not silently
    // produce an unmarked installer or tell users to disable security checks.
    const zone = internetZone(assetUrl);
    const marker = file + ':Zone.Identifier';
    await fs.promises.writeFile(marker, zone, {flag: 'wx', encoding: 'utf8'});
    if (await fs.promises.readFile(marker, 'utf8') !== zone) throw failure('internet-zone-failed');
}

async function downloadInstaller(installer, directory, options) {
    const settings = options || {};
    // This entry point only accepts the fixed current installer contract, even when
    // called outside IPC. The renderer never supplies one of these objects.
    const name = installer && /^EmbyTheaterEnhanced-([0-9A-Za-z.+-]+)-win-x64-setup\.exe$/.exec(installer.name || '');
    if (!name || !require('./maintenance').parseVersion(name[1]) ||
        !/^[0-9a-f]{64}$/.test(installer.sha256 || '') || !Number.isSafeInteger(installer.size) ||
        installer.size <= 0 || installer.size > MAX_INSTALLER_BYTES) throw failure('invalid-installer');
    const version = installer.name.slice('EmbyTheaterEnhanced-'.length, -'-win-x64-setup.exe'.length);
    if (![version, 'v' + version].some(tag => installer.url === 'https://github.com/' + REPO + '/releases/download/' + tag + '/' + installer.name)) throw failure('invalid-installer');
    const controller = new AbortController();
    const signal = settings.signal ? AbortSignal.any([settings.signal, controller.signal]) : controller.signal;
    const deadline = settings.deadline || Date.now() + 10 * 60 * 1000;
    const root = physicalDirectory(directory);
    const rootIdentity = fs.lstatSync(root, {bigint: true});
    const destination = path.join(root, installer.name);
    // link() below is the atomic no-replace commit; this check merely avoids needless traffic.
    try { fs.lstatSync(destination); throw failure('file-exists'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const temporary = path.join(root, '.ete-download-' + crypto.randomBytes(16).toString('hex') + '.part');
    const agent = new https.Agent({keepAlive: false});
    const timer = setTimeout(() => controller.abort(failure('timeout')), Math.max(1, deadline - Date.now()));
    let handle;
    let temporaryIdentity;
    try {
        handle = await fs.promises.open(temporary, 'wx', 0o600);
        temporaryIdentity = await handle.stat({bigint: true});
        if (settings.onTemporary) settings.onTemporary(path.basename(temporary), temporaryIdentity);
        for (let index = 0; index < SOURCES.length; index++) {
            const source = SOURCES[index];
            check(signal, deadline);
            await handle.truncate(0);
            let bytes = 0;
            const hash = crypto.createHash('sha256');
            let response;
            try {
                response = await responseFor(source.prefix + installer.url, {source, assetUrl: installer.url}, {...settings, agent, signal, deadline});
                const length = response.headers['content-length'];
                if (length !== undefined && (!/^\d+$/.test(length) || Number(length) !== installer.size)) throw failure('size-mismatch');
                for await (const chunk of connectionChunks(response)) {
                    check(signal, deadline);
                    bytes += chunk.length;
                    if (bytes > installer.size || bytes > MAX_INSTALLER_BYTES) throw failure('size-mismatch');
                    hash.update(chunk);
                    // Explicit position: retries never append to a failed transfer.
                    let offset = 0;
                    while (offset < chunk.length) {
                        const written = await handle.write(chunk, offset, chunk.length - offset, bytes - chunk.length + offset);
                        if (!written.bytesWritten) throw failure('write-failed');
                        offset += written.bytesWritten;
                    }
                    if (settings.onProgress) settings.onProgress({bytes, total: installer.size, source: source.id});
                }
                check(signal, deadline);
                if (bytes !== installer.size) throw failure('size-mismatch');
                if (hash.digest('hex') !== installer.sha256) throw failure('hash-mismatch');
                if (!ownedDirectory(root, rootIdentity) || !ownedTemporary(temporary, temporaryIdentity)) throw failure('directory-invalid');
                await markInternetDownload(temporary, source.prefix + installer.url);
                await handle.sync();
                await handle.close();
                handle = null;
                check(signal, deadline);
                if (!ownedDirectory(root, rootIdentity) || !ownedTemporary(temporary, temporaryIdentity)) throw failure('directory-invalid');
                try { await fs.promises.link(temporary, destination); }
                catch (error) { if (error.code === 'EEXIST') throw failure('file-exists'); throw error; }
                return {status: 'downloaded', fileName: installer.name, directory: root, sha256: installer.sha256, source: source.id};
            } catch (error) {
                check(signal, deadline);
                // Only transport connection failures qualify. HTTP denials, TLS, policy,
                // checksum, filesystem and explicit cancellation never switch sources.
                if (!error[CONNECTION_FAILURE] || index === SOURCES.length - 1) throw error;
                if (settings.onProgress) settings.onProgress({bytes: 0, total: installer.size, source: SOURCES[index + 1].id});
            } finally { if (response) response.destroy(); }
        }
        throw failure('download-failed');
    } catch (error) {
        check(signal, deadline);
        throw error;
    } finally {
        clearTimeout(timer);
        agent.destroy();
        try { if (handle) await handle.close(); }
        finally {
            // An exchanged directory/temp path is no longer ours to delete.
            try {
                if (temporaryIdentity && ownedDirectory(root, rootIdentity) && ownedTemporary(temporary, temporaryIdentity)) await fs.promises.unlink(temporary);
            } catch (_) {}
        }
    }
}

module.exports = {API, SOURCES, MAX_INSTALLER_BYTES, installerFromRelease, requestJson, downloadInstaller, safeTarget, internetZone};
