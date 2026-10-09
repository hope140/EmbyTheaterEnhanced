'use strict';

const https = require('https');
const http = require('http');

const RELEASES_URL = 'https://github.com/hope140/EmbyTheaterEnhanced/releases/latest';
const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/hope140/EmbyTheaterEnhanced/releases/latest';
const MAX_RELEASE_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

function parseVersion(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/i);
    if (!match) return null;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    const patch = Number(match[3]);
    if (![major, minor, patch].every(Number.isSafeInteger)) return null;
    return {major, minor, patch, prerelease: match[4] ? match[4].split('.') : []};
}

function comparePrerelease(left, right) {
    if (!left.length && !right.length) return 0;
    if (!left.length) return 1;
    if (!right.length) return -1;
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index++) {
        if (index >= left.length) return -1;
        if (index >= right.length) return 1;
        const a = left[index];
        const b = right[index];
        const aNumeric = /^\d+$/.test(a);
        const bNumeric = /^\d+$/.test(b);
        if (aNumeric && bNumeric) {
            const normalizedA = a.replace(/^0+/, '') || '0';
            const normalizedB = b.replace(/^0+/, '') || '0';
            if (normalizedA.length !== normalizedB.length) return normalizedA.length < normalizedB.length ? -1 : 1;
            if (normalizedA !== normalizedB) return normalizedA < normalizedB ? -1 : 1;
        } else if (aNumeric !== bNumeric) {
            return aNumeric ? -1 : 1;
        } else if (a !== b) {
            return a < b ? -1 : 1;
        }
    }
    return 0;
}

function compareParsedVersions(left, right) {
    for (const key of ['major', 'minor', 'patch']) {
        if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
    }
    return comparePrerelease(left.prerelease, right.prerelease);
}

function compareVersions(left, right) {
    const parsedLeft = parseVersion(left);
    const parsedRight = parseVersion(right);
    if (!parsedLeft || !parsedRight) return null;
    return compareParsedVersions(parsedLeft, parsedRight);
}

function formatVersion(version) {
    const parsed = typeof version === 'string' ? parseVersion(version) : version;
    if (!parsed) return 'UNKNOWN';
    return parsed.major + '.' + parsed.minor + '.' + parsed.patch + (parsed.prerelease.length ? '-' + parsed.prerelease.join('.') : '');
}

function safeValue(value, fallback) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback || 'UNKNOWN';
}

function safeReleaseUrl(value) {
    if (typeof value !== 'string') return RELEASES_URL;
    let target;
    try {
        target = new URL(value.trim());
    } catch (_) {
        return RELEASES_URL;
    }
    const releasePath = '/hope140/EmbyTheaterEnhanced/releases';
    const normalizedPathname = target.pathname.toLowerCase();
    const normalizedReleasePath = releasePath.toLowerCase();
    if (target.protocol !== 'https:' || target.hostname !== 'github.com' || target.username || target.password || target.port ||
        (normalizedPathname !== normalizedReleasePath && !normalizedPathname.startsWith(normalizedReleasePath + '/'))) {
        return RELEASES_URL;
    }
    return target.href;
}

function requestLatestJson(url, options) {
    const settings = options || {};
    const target = String(url || LATEST_RELEASE_API_URL);
    const transport = target.indexOf('https://') === 0 ? https : http;
    const timeoutMs = Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0 ? settings.timeoutMs : DEFAULT_REQUEST_TIMEOUT_MS;
    const userAgent = safeValue(settings.userAgent, 'EmbyTheaterEnhanced');

    return new Promise(function (resolve, reject) {
        let settled = false;
        let request = null;
        let deadlineTimer = null;
        function finish(error, value) {
            if (settled) return;
            settled = true;
            if (deadlineTimer !== null) {
                clearTimeout(deadlineTimer);
                deadlineTimer = null;
            }
            if (error) reject(error);
            else resolve(value);
        }

        function rejectAndDestroy(error) {
            finish(error);
            if (request && !request.destroyed) request.destroy(error);
        }

        deadlineTimer = setTimeout(function () {
            rejectAndDestroy(new Error('release-request-timeout'));
        }, timeoutMs);

        try {
            request = transport.get(target, {
                headers: {
                    Accept: 'application/vnd.github+json',
                    'User-Agent': userAgent
                }
            }, function (response) {
                if (settled) {
                    response.destroy();
                    return;
                }
                const statusCode = Number(response.statusCode) || 0;
                if (statusCode < 200 || statusCode >= 300) {
                    rejectAndDestroy(new Error('release-http-' + statusCode));
                    return;
                }
                let totalBytes = 0;
                const chunks = [];
                response.setEncoding('utf8');
                response.on('data', function (chunk) {
                    totalBytes += Buffer.byteLength(chunk, 'utf8');
                    if (totalBytes > MAX_RELEASE_RESPONSE_BYTES) {
                        rejectAndDestroy(new Error('release-response-too-large'));
                        return;
                    }
                    chunks.push(chunk);
                });
                response.on('error', function (error) { finish(error); });
                response.on('end', function () {
                    if (settled) return;
                    try {
                        finish(null, JSON.parse(chunks.join('')));
                    } catch (_) {
                        finish(new Error('release-response-invalid-json'));
                    }
                });
            });
            request.on('error', function (error) { finish(error); });
            request.setTimeout(timeoutMs, function () {
                rejectAndDestroy(new Error('release-request-timeout'));
            });
        } catch (error) {
            rejectAndDestroy(error);
        }
    });
}

function checkLatestRelease(options) {
    const settings = options || {};
    const current = parseVersion(settings.currentVersion);
    if (!current) return Promise.resolve({status: 'error', reason: 'invalid-current-version'});
    const requestJson = typeof settings.requestJson === 'function' ? settings.requestJson : requestLatestJson;
    return Promise.resolve().then(function () {
        return requestJson(LATEST_RELEASE_API_URL);
    }).then(function (release) {
        const latest = parseVersion(release && release.tag_name);
        if (!latest) return {status: 'error', reason: 'invalid-release-version'};
        const comparison = compareParsedVersions(current, latest);
        return {
            status: comparison < 0 ? 'update-available' : 'latest',
            currentVersion: formatVersion(current),
            latestVersion: formatVersion(latest),
            releaseUrl: safeReleaseUrl(release && release.html_url)
        };
    }).catch(function () {
        return {status: 'error', reason: 'network-error'};
    });
}

function buildEnvironmentInfo(appInfo, platformInfo, displayInfo) {
    const info = appInfo || {};
    const nativeHelper = info.nativeHelper && typeof info.nativeHelper === 'object' ? info.nativeHelper : {};
    const platform = platformInfo || {};
    const display = displayInfo || {};
    return {
        appVersion: safeValue(info.appVersion),
        electron: safeValue(info.electron),
        chromium: safeValue(info.chromium),
        node: safeValue(info.node),
        nativeHelper: safeValue(nativeHelper.helperVersion),
        libmpv: nativeHelper.state === 'ready' ? safeValue(nativeHelper.libmpvVersion) : 'UNKNOWN',
        sourceCommit: safeValue(info.buildCommit),
        windows: safeValue(platform.windows),
        displayDpi: safeValue(display.summary, 'NOT AVAILABLE')
    };
}

function formatEnvironmentText(info) {
    const value = info || {};
    return [
        'Emby Theater Enhanced: ' + safeValue(value.appVersion),
        'Electron: ' + safeValue(value.electron),
        'Chromium: ' + safeValue(value.chromium),
        'Node: ' + safeValue(value.node),
        'Native Helper: ' + safeValue(value.nativeHelper),
        'libmpv: ' + safeValue(value.libmpv),
        'Source Commit: ' + safeValue(value.sourceCommit),
        'Windows: ' + safeValue(value.windows),
        '显示缩放: ' + safeValue(value.displayDpi, 'NOT AVAILABLE')
    ].join('\r\n');
}

module.exports = {
    RELEASES_URL,
    LATEST_RELEASE_API_URL,
    DEFAULT_REQUEST_TIMEOUT_MS,
    parseVersion,
    compareVersions,
    formatVersion,
    requestLatestJson,
    checkLatestRelease,
    buildEnvironmentInfo,
    formatEnvironmentText,
    safeReleaseUrl
};
