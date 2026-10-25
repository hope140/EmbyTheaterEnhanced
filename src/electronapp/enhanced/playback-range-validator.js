'use strict';
// HTTP validators, not a content identity synthesized from path, size or expiry.
const strongTag = value => typeof value === 'string' && /^"[\x21\x23-\x7e]{1,255}"$/.test(value);
const MIN_DATE_GAP_MS = 60000;
const MAX_FUTURE_DATE_MS = 300000;
function httpDate(value) {
    if (typeof value !== 'string' || value.length !== 29) return null;
    const parsed = Date.parse(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 && new Date(parsed).toUTCString() === value ? parsed : null;
}
function dateRefusal(lastModified, date, now = Date.now()) {
    if (lastModified === undefined || lastModified === '') return 'last-modified-missing';
    if (date === undefined || date === '') return 'response-date-missing';
    const modified = httpDate(lastModified), generated = httpDate(date);
    if (modified === null || generated === null) return 'date-validator-invalid';
    // RFC 9110 8.8.2.2 also relies on honest origin metadata. Use a conservative
    // 60s separation to reduce clock-resolution/skew ambiguity; size is not a version.
    if (!Number.isSafeInteger(now) || generated > now + MAX_FUTURE_DATE_MS || generated - modified < MIN_DATE_GAP_MS) return 'date-validator-unsafe';
    return null;
}
function validator(proof) {
    if (!proof) return null;
    if (strongTag(proof.etag)) return {kind: 'etag', value: proof.etag};
    if (proof.etag !== undefined) return null;
    return dateRefusal(proof.lastModified, proof.date) === null ? {kind: 'last-modified', value: proof.lastModified} : null;
}
module.exports = {strongTag, httpDate, dateRefusal, validator, MIN_DATE_GAP_MS};
