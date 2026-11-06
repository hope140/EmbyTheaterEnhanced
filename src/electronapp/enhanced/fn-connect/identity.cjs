'use strict';

// All supported Emby credential carriers must agree; adding a token header
// cannot override a stale token embedded in the original source URL.
function tokens(address, headers) {
    const tokens = [];
    function authorization(value) {
        if (typeof value !== 'string') return false;
        const bearer = /^Bearer\s+([^\s,]+)$/i.exec(value);
        if (bearer) { tokens.push(bearer[1]); return true; }
        if (!/^(?:MediaBrowser|Emby)\s+/i.test(value)) return false;
        const fields = [...value.matchAll(/(?:^|[,\s])Token\s*=\s*"([^"\r\n]*)"/gi)];
        if ([...value.matchAll(/\bToken\s*=/gi)].length !== fields.length) return false;
        fields.forEach(field => tokens.push(field[1]));
        return true;
    }
    for (const [key, value] of Object.entries(headers)) {
        if (/^(?:authorization|x-emby-authorization)$/i.test(key) && !authorization(value)) return null;
        if (/^(?:x-emby-token|x-mediabrowser-token)$/i.test(key)) tokens.push(value);
    }
    for (const [key, value] of address.searchParams) {
        if (/^(?:api_key|x-emby-token|x-mediabrowser-token)$/i.test(key)) tokens.push(value);
        if (/^(?:authorization|x-emby-authorization)$/i.test(key) && !authorization(value)) return null;
    }
    return tokens;
}
function matches(address, headers, expected) { const values = tokens(address, headers); return values !== null && values.every(value => value === expected); }
module.exports = {tokens, matches};
