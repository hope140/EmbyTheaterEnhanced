'use strict';

const HASH_RE = /^[0-9a-f]{64}$/;

function baselineSelection(reasonCode) {
    return Object.freeze({kind: 'baseline', selectionState: reasonCode ? 'invalid' : 'valid',
        reasonCode: reasonCode || null});
}

async function prepare(options) {
    const settings = options || {};
    const isCancelled = function () {
        try { return typeof settings.shouldCancel === 'function' && settings.shouldCancel() === true; }
        catch (_) { return true; }
    };
    let versions = null;
    try {
        if (typeof settings.readBundledVersions === 'function') versions = await settings.readBundledVersions();
    } catch (_) { versions = null; }
    if (isCancelled()) {
        return Object.freeze({store: null, startupSelection: baselineSelection('startup-cancelled'), identityState: 'unavailable'});
    }

    const identity = versions && HASH_RE.test(versions.helperFileSha256 || '') &&
        typeof versions.helperVersion === 'string' && versions.helperVersion.trim()
        ? {sha256: versions.helperFileSha256, version: versions.helperVersion}
        : null;
    if (!identity) {
        return Object.freeze({store: null, startupSelection: baselineSelection('package-identity-unavailable'),
            identityState: 'unavailable'});
    }

    let store = null;
    try {
        if (typeof settings.createStore !== 'function') throw new Error('store-unavailable');
        store = settings.createStore({profileRoot: settings.profileRoot, expectedHelperIdentity: identity});
        if (!store || typeof store.freezeStartupSelection !== 'function') throw new Error('store-unavailable');
        if (typeof settings.onStoreCreated === 'function') settings.onStoreCreated(store);
        if (isCancelled()) {
            if (typeof store.close === 'function') await store.close();
            return Object.freeze({store: null, startupSelection: baselineSelection('startup-cancelled'), identityState: 'verified'});
        }
    } catch (_) {
        return Object.freeze({store: null, startupSelection: baselineSelection('store-unavailable'), identityState: 'verified'});
    }

    try {
        const startupSelection = await store.freezeStartupSelection();
        return Object.freeze({store, startupSelection, identityState: 'verified'});
    } catch (_) {
        // A profile read failure disables candidate activation for this process but does not block app startup.
        return Object.freeze({store, startupSelection: baselineSelection('selection-unavailable'), identityState: 'verified'});
    }
}

module.exports = Object.freeze({prepare});
