'use strict';

const https = require('https');
const http = require('http');

const RELEASES_URL = 'https://github.com/hope140/EmbyTheaterEnhanced/releases/latest';
const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/hope140/EmbyTheaterEnhanced/releases/latest';
const RELEASE_LIST_API_URL = 'https://api.github.com/repos/hope140/EmbyTheaterEnhanced/releases?per_page=5&page=';
const MAX_RELEASE_PAGES = 100;
const MAX_RELEASE_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

function parseVersion(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
    if (!match) return null;
    // Keep canonical decimal strings: SemVer does not limit core identifiers to
    // JavaScript's safe-integer range.
    const major = match[1];
    const minor = match[2];
    const patch = match[3];
    if (match[4] && match[4].split('.').some(part => /^\d+$/.test(part) && part.length > 1 && part[0] === '0')) return null;
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
        if (left[key].length !== right[key].length) return left[key].length < right[key].length ? -1 : 1;
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
    const suffix = target.pathname.slice(releasePath.length);
    const allowedPage = normalizedPathname === normalizedReleasePath || suffix === '/latest' ||
        (suffix.startsWith('/tag/') && !!parseVersion(suffix.slice(5)) && !suffix.slice(5).includes('/'));
    if (target.protocol !== 'https:' || target.hostname !== 'github.com' || target.username || target.password || target.port ||
        target.search || target.hash || !normalizedPathname.startsWith(normalizedReleasePath) || !allowedPage) {
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

function describeRelease(release, options) {
    const settings = options || {};
    const current = parseVersion(settings.currentVersion);
    if (!current) return {status: 'error', reason: 'invalid-current-version'};
    const channel = settings.channel || 'stable';
    if (!['stable', 'testing'].includes(channel)) return {status: 'error', reason: 'invalid-channel'};
    const latest = parseVersion(release && release.tag_name);
    if (!latest) return {status: 'error', reason: 'invalid-release-version'};
    if (release.draft !== false || typeof release.prerelease !== 'boolean' ||
        (channel === 'stable' && (release.prerelease || latest.prerelease.length))) {
        return {status: 'error', reason: 'not-stable-release'};
    }
    const expectedUrl = 'https://github.com/hope140/EmbyTheaterEnhanced/releases/tag/' + release.tag_name;
    if (release.html_url !== expectedUrl) return {status: 'error', reason: 'invalid-release-identity'};
    const comparison = compareParsedVersions(current, latest);
    return {
        status: comparison < 0 ? 'update-available' : comparison > 0 ? 'ahead' : 'latest',
        currentVersion: formatVersion(current),
        latestVersion: formatVersion(latest),
        releaseUrl: expectedUrl,
        releaseTag: release.tag_name,
        channel,
        prerelease: release.prerelease,
        notes: typeof release.body === 'string' ? release.body.slice(0, 65536) : '',
        installer: require('./manual-app-update').installerFromRelease(release)
    };
}

function checkLatestRelease(options) {
    const settings = options || {};
    if (!parseVersion(settings.currentVersion)) return Promise.resolve({status: 'error', reason: 'invalid-current-version'});
    const channel = settings.channel || 'stable';
    if (!['stable', 'testing'].includes(channel)) return Promise.resolve({status: 'error', reason: 'invalid-channel'});
    const requestJson = typeof settings.requestJson === 'function' ? settings.requestJson : require('./manual-app-update').requestJson;
    return Promise.resolve().then(async function () {
        if (channel === 'stable') return describeRelease(await requestJson(LATEST_RELEASE_API_URL), settings);
        let best = null;
        for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
            const releases = await requestJson(RELEASE_LIST_API_URL + page);
            if (!Array.isArray(releases) || releases.length > 5) return {status: 'error', reason: 'invalid-release-list'};
            for (const release of releases) {
                if (describeRelease(release, settings).status === 'error') continue;
                const order = best ? compareVersions(release.tag_name, best.tag_name) : 1;
                if (order > 0 || (order === 0 && best.prerelease && !release.prerelease)) best = release;
            }
            if (releases.length < 5) return best ? describeRelease(best, settings) : {status: 'error', reason: 'no-channel-release'};
        }
        // Never call a partial enumeration "latest".
        return {status: 'error', reason: 'pagination-limit'};
    }).catch(function () {
        return {status: 'error', reason: 'network-error'};
    });
}

function buildEnvironmentInfo(appInfo, platformInfo, displayInfo) {
    const info = appInfo || {};
    const nativeHelper = info.nativeHelper && typeof info.nativeHelper === 'object' ? info.nativeHelper : {};
    const bundled = info.bundledVersions || {};
    const platform = platformInfo || {};
    const display = displayInfo || {};
    const isReady = nativeHelper.state === 'ready';
    const capabilities = isReady && Array.isArray(nativeHelper.validatedCapabilities)
        ? nativeHelper.validatedCapabilities.filter(value => typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value))
        : [];
    return {
        appVersion: safeValue(info.appVersion),
        electron: safeValue(info.electron),
        chromium: safeValue(info.chromium),
        node: safeValue(info.node),
        nativeHelper: safeValue(bundled.helperVersion),
        libmpv: safeValue(bundled.libmpvVersion),
        packageLibmpvSha256: safeValue(bundled.libmpvFileSha256),
        nativeHelperState: ['idle', 'starting', 'ready', 'failed', 'destroyed', 'stopped'].includes(nativeHelper.state) ? nativeHelper.state : 'NOT AVAILABLE',
        expectedLibmpvVersion: safeValue(nativeHelper.expectedLibmpvVersion),
        expectedMpvClientApiVersion: safeValue(nativeHelper.expectedMpvClientApiVersion),
        expectedLibmpvSha256: safeValue(nativeHelper.expectedLibmpvSha256),
        runningNativeHelper: isReady ? safeValue(nativeHelper.helperVersion, 'UNKNOWN') : 'NOT AVAILABLE',
        runningLibmpv: isReady ? safeValue(nativeHelper.libmpvVersion, 'UNKNOWN') : 'NOT AVAILABLE',
        runningLibmpvClientApiVersion: isReady && Number.isSafeInteger(nativeHelper.mpvClientApiVersion) ? String(nativeHelper.mpvClientApiVersion) : 'UNKNOWN',
        validatedNativeHelperCapabilities: isReady && capabilities.length ? capabilities.join(', ') : 'UNKNOWN',
        runningLibmpvImageSha256: 'UNKNOWN',
        fixedNativeRenderPath: safeValue(nativeHelper.fixedNativeRenderPath),
        renderSettingUiValues: safeValue(nativeHelper.renderSettingUiValues),
        observedNativeRenderPath: safeValue(nativeHelper.observedNativeRenderPath),
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
        'Package Native Helper: ' + safeValue(value.nativeHelper),
        'Package libmpv: ' + safeValue(value.libmpv),
        'Package libmpv DLL SHA256: ' + safeValue(value.packageLibmpvSha256),
        'Expected libmpv version: ' + safeValue(value.expectedLibmpvVersion),
        'Expected libmpv client API: ' + safeValue(value.expectedMpvClientApiVersion),
        'Expected libmpv DLL SHA256: ' + safeValue(value.expectedLibmpvSha256),
        'Native Helper state: ' + safeValue(value.nativeHelperState, 'NOT AVAILABLE'),
        'Running Native Helper: ' + safeValue(value.runningNativeHelper, 'NOT AVAILABLE'),
        'Running libmpv: ' + safeValue(value.runningLibmpv, 'NOT AVAILABLE'),
        'Running libmpv client API: ' + safeValue(value.runningLibmpvClientApiVersion, 'UNKNOWN'),
        'Validated Native Helper capabilities: ' + safeValue(value.validatedNativeHelperCapabilities, 'UNKNOWN'),
        'Loaded libmpv image SHA256: ' + safeValue(value.runningLibmpvImageSha256, 'UNKNOWN'),
        'Native render path contract: ' + safeValue(value.fixedNativeRenderPath),
        'mpv-vo/mpv-gpuapi UI values: ' + safeValue(value.renderSettingUiValues),
        'Observed Native render properties: ' + safeValue(value.observedNativeRenderPath, 'UNKNOWN'),
        'Source Commit: ' + safeValue(value.sourceCommit),
        'Windows: ' + safeValue(value.windows),
        '显示缩放: ' + safeValue(value.displayDpi, 'NOT AVAILABLE')
    ].join('\r\n');
}

module.exports = {
    RELEASES_URL,
    LATEST_RELEASE_API_URL,
    RELEASE_LIST_API_URL,
    MAX_RELEASE_PAGES,
    DEFAULT_REQUEST_TIMEOUT_MS,
    parseVersion,
    compareVersions,
    formatVersion,
    requestLatestJson,
    checkLatestRelease,
    describeRelease,
    buildEnvironmentInfo,
    formatEnvironmentText,
    safeReleaseUrl
};
