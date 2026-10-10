'use strict';

function browserUrl(value) {
    if (typeof value !== 'string' || /[\s\u0000-\u001f\u007f-\u009f\\]/.test(value)) return null;
    const authority = /^https?:\/\/([^/?#]+)/i.exec(value);
    if (!authority || authority[1].includes('@')) return null;
    try {
        // Check one encoding layer without rewriting query/fragment or decoding twice.
        if (/[\u0000-\u001f\u007f-\u009f\\]/.test(decodeURI(value))) return null;
        const parsed = new URL(value);
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
            !parsed.hostname || parsed.username || parsed.password) return null;
        return value;
    } catch (_) {
        return null;
    }
}

async function openExternalUrl(shell, value) {
    const target = browserUrl(value);
    if (target === null) return false;
    try {
        await shell.openExternal(target);
        return true;
    } catch (_) {
        // Shell failures are contained; URLs and shell error text may contain secrets.
        return false;
    }
}

module.exports = {browserUrl, openExternalUrl};
