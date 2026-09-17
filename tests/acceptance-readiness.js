(function () {
    'use strict';
    if (window.__eteReadiness && window.__eteReadiness.version === 1) return window.__eteReadiness;
    var t0 = typeof window.__eteEpoch === 'number' ? window.__eteEpoch : Date.now();
    var installedAt = Date.now();
    var marks = Object.create(null);
    var timeline = [];
    var surface = null;
    var knownSurfaces = [];
    var surfaceLifecycle = [];
    var surfaceObserver = null;
    var surfaceCreatedObservationMs = null;
    var surfaceAttachedMs = null;
    var surfaceRecreated = false;
    var multipleSurfacesObserved = false;
    var originalDiagnostics = null;
    var diagnosticsWrapper = null;
    var originalConsoleLog = null;
    var consoleWrapper = null;
    var pollTimer = null;
    var lastError = null;
    var bridgeBootstrapReadySeen = false;
    var bridgeReadySignalSeen = false;
    var bridgeReadySignalMs = null;
    var diagnosticsReadySeen = false;
    var diagnosticsReadyObserved = false;
    var diagnosticsReadySource = null;
    var diagnosticsPlayingSeen = false;
    var stickyReadinessSupported = false;
    var stickyReadinessObserved = false;
    var stickyReadinessRunId = null;
    var stickyReadinessAt = null;
    var corePlayingSeen = false;
    var corePlayingMs = null;
    var firstVideoProgressMs = null;
    var videoProgressSeen = false;
    var firstVideoPosition = null;
    var lastVideoPosition = null;
    var corePlayingListener = null;
    var nativeHelperReadyListener = null;
    var currentRunId = null;
    var currentRunStartedAt = t0;

    function elapsed() { return Date.now() - t0; }
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function mark(stage, elapsedMs, status) {
        var name = String(stage || '');
        if (!name || name.length > 64 || marks[name]) return;
        marks[name] = true;
        timeline.push({ stage: name, elapsedMs: Math.round(typeof elapsedMs === 'number' ? elapsedMs : elapsed()), status: status || 'seen' });
    }
    function recordCorePlaying() {
        if (corePlayingSeen) return;
        corePlayingSeen = true;
        corePlayingMs = elapsed();
        mark('core-playing', corePlayingMs);
    }
    function recordVideoPosition(value) {
        if (!finite(value)) return;
        if (firstVideoPosition === null) firstVideoPosition = value;
        lastVideoPosition = value;
        if (!videoProgressSeen && lastVideoPosition - firstVideoPosition > 0.1) {
            videoProgressSeen = true;
            firstVideoProgressMs = elapsed();
            mark('video-progress', firstVideoProgressMs);
        }
    }
    function stickyState() {
        var state;
        try { state = window.__eteBridgeReadiness; } catch (error) { return null; }
        if (!state || typeof state !== 'object') return null;
        if (typeof state.snapshot === 'function') {
            stickyReadinessSupported = true;
            try { return state.snapshot(); } catch (error) { lastError = 'sticky-readiness-query-failed'; return null; }
        }
        return null;
    }
    function isCurrentStickyReady(snapshot) {
        if (!snapshot || snapshot.ready !== true || !finite(Number(snapshot.readyAt))) return false;
        if (currentRunId && snapshot.runId !== currentRunId) return false;
        if (Number(snapshot.readyAt) < Number(currentRunStartedAt)) return false;
        if (snapshot.readyBridgeMatches === false) return false;
        return true;
    }
    function syncStickyReadiness() {
        var snapshot = stickyState();
        if (!snapshot || !isCurrentStickyReady(snapshot)) return;
        stickyReadinessObserved = true;
        stickyReadinessRunId = snapshot.runId || null;
        stickyReadinessAt = Number(snapshot.readyAt);
        if (!diagnosticsReadySeen) {
            diagnosticsReadySeen = true;
            diagnosticsReadySource = 'sticky-state';
            mark('bridge-ready', Math.max(0, stickyReadinessAt - t0));
        }
    }
    function recordDiagnostics(stage, source) {
        var name = String(stage || '');
        if (name === 'ready') {
            diagnosticsReadySeen = true;
            if (source === 'observer-wrapper') diagnosticsReadyObserved = true;
            diagnosticsReadySource = source || diagnosticsReadySource || 'unknown';
            mark('bridge-ready');
        }
        if (name === 'playing') {
            diagnosticsPlayingSeen = true;
            mark('playing');
        }
    }
    function beginRun(runId) {
        currentRunId = String(runId || ('run-' + Date.now()));
        currentRunStartedAt = Date.now();
        try {
            var state = window.__eteBridgeReadiness;
            if (state && typeof state.beginRun === 'function') {
                stickyReadinessSupported = true;
                state.beginRun(currentRunId, currentRunStartedAt);
            }
        } catch (error) { lastError = 'sticky-readiness-reset-failed'; }
        ['play-called', 'surface-created', 'native-bridge-created', 'surface-attached', 'native-bootstrap-ready', 'bridge-ready', 'manager-play-resolved', 'resolver-result', 'loadfile', 'core-playing', 'video-progress', 'playing'].forEach(function (stage) {
            delete marks[stage];
        });
        timeline = timeline.filter(function (row) {
            return ['play-called', 'surface-created', 'native-bridge-created', 'surface-attached', 'native-bootstrap-ready', 'bridge-ready', 'manager-play-resolved', 'resolver-result', 'loadfile', 'core-playing', 'video-progress', 'playing'].indexOf(row.stage) < 0;
        });
        bridgeBootstrapReadySeen = false;
        bridgeReadySignalSeen = false;
        bridgeReadySignalMs = null;
        diagnosticsReadySeen = false;
        diagnosticsReadyObserved = false;
        diagnosticsReadySource = null;
        diagnosticsPlayingSeen = false;
        stickyReadinessObserved = false;
        stickyReadinessRunId = null;
        stickyReadinessAt = null;
        corePlayingSeen = false;
        corePlayingMs = null;
        firstVideoProgressMs = null;
        videoProgressSeen = false;
        firstVideoPosition = null;
        lastVideoPosition = null;
        return currentRunId;
    }
    function surfaceNodes() {
        try {
            if (document.querySelectorAll) return Array.prototype.slice.call(document.querySelectorAll('.mpv-videoPlayerContainer-native'));
        } catch (error) { lastError = 'surface-query-failed'; }
        try {
            var found = findSurface();
            return found ? [found] : [];
        } catch (error) { return []; }
    }
    function isSurfaceNode(node) {
        if (!node || node.nodeType !== 1) return false;
        try {
            if (typeof node.matches === 'function') return node.matches('.mpv-videoPlayerContainer-native');
            return !!(node.classList && typeof node.classList.contains === 'function' && node.classList.contains('mpv-videoPlayerContainer-native'));
        } catch (error) { return false; }
    }
    function nodeIsConnected(node) {
        try {
            if (node && node.isConnected === true) return true;
            return !!(document.documentElement && document.documentElement.contains && document.documentElement.contains(node));
        } catch (error) { return false; }
    }
    function currentSurfaceCount() { return surfaceNodes().length; }
    function lifecycleRecord(node) {
        for (var i = 0; i < knownSurfaces.length; i++) {
            if (knownSurfaces[i].node === node) return knownSurfaces[i];
        }
        var record = { node: node, connected: null, disconnected: false, index: knownSurfaces.length + 1 };
        knownSurfaces.push(record);
        return record;
    }
    function rememberSurfaceLifecycle(node, source, forceState) {
        if (!isSurfaceNode(node)) return;
        var record = lifecycleRecord(node);
        var connected = forceState === 'disconnected' ? false : nodeIsConnected(node);
        var count = currentSurfaceCount();
        var first = record.connected === null;
        if (first) {
            for (var previous = 0; previous < knownSurfaces.length; previous++) {
                if (knownSurfaces[previous] !== record && knownSurfaces[previous].disconnected) surfaceRecreated = true;
            }
            surfaceCreatedObservationMs = surfaceCreatedObservationMs === null ? elapsed() : surfaceCreatedObservationMs;
            mark('surface-created', surfaceCreatedObservationMs);
            surfaceLifecycle.push({ event: 'created-observed', surfaceIndex: record.index, connected: connected, currentCount: count, elapsedMs: surfaceCreatedObservationMs, source: source });
        }
        if (connected && record.connected !== true) {
            if (record.disconnected) surfaceRecreated = true;
            record.connected = true;
            surfaceAttachedMs = surfaceAttachedMs === null ? elapsed() : surfaceAttachedMs;
            mark('surface-attached', surfaceAttachedMs);
            surfaceLifecycle.push({ event: 'connected', surfaceIndex: record.index, connected: true, currentCount: count, elapsedMs: surfaceAttachedMs, source: source });
        } else if (!connected && record.connected === true) {
            record.connected = false;
            record.disconnected = true;
            surfaceLifecycle.push({ event: 'disconnected', surfaceIndex: record.index, connected: false, currentCount: count, elapsedMs: elapsed(), source: source });
        }
        if (count > 1 || knownSurfaces.length > 1) multipleSurfacesObserved = true;
        if (surfaceLifecycle.length > 64) surfaceLifecycle.shift();
    }
    function collectSurfaceNodes(node, output) {
        if (!node) return;
        if (isSurfaceNode(node)) output.push(node);
        try {
            if (node.querySelectorAll) {
                var nested = node.querySelectorAll('.mpv-videoPlayerContainer-native');
                for (var i = 0; i < nested.length; i++) output.push(nested[i]);
            }
        } catch (error) { lastError = 'surface-query-failed'; }
    }
    function processMutationRecords(records) {
        var added = [], removed = [];
        for (var i = 0; i < records.length; i++) {
            var row = records[i] || {};
            collectSurfaceNodes(row.addedNodes && row.addedNodes[0], added);
            collectSurfaceNodes(row.removedNodes && row.removedNodes[0], removed);
            if (row.addedNodes) for (var a = 1; a < row.addedNodes.length; a++) collectSurfaceNodes(row.addedNodes[a], added);
            if (row.removedNodes) for (var r = 1; r < row.removedNodes.length; r++) collectSurfaceNodes(row.removedNodes[r], removed);
        }
        for (var j = 0; j < added.length; j++) rememberSurfaceLifecycle(added[j], 'mutation-observer');
        for (var k = 0; k < removed.length; k++) rememberSurfaceLifecycle(removed[k], 'mutation-observer', 'disconnected');
        if (added.length) surface = added[added.length - 1];
        scanSurfaceState();
    }
    function scanSurfaceState() {
        var current = surfaceNodes();
        for (var i = 0; i < current.length; i++) rememberSurfaceLifecycle(current[i], 'poll');
        for (var j = 0; j < knownSurfaces.length; j++) {
            if (knownSurfaces[j].connected && current.indexOf(knownSurfaces[j].node) < 0) rememberSurfaceLifecycle(knownSurfaces[j].node, 'poll', 'disconnected');
        }
    }
    function installSurfaceObserver() {
        if (typeof MutationObserver !== 'function') { lastError = 'surface-observer-unavailable'; return; }
        try {
            surfaceObserver = new MutationObserver(processMutationRecords);
            surfaceObserver.observe(document.documentElement || document, { childList: true, subtree: true });
        } catch (error) { surfaceObserver = null; lastError = 'surface-observer-failed'; }
    }
    function onNativeHelperReady() {
        bridgeBootstrapReadySeen = true;
        bridgeReadySignalSeen = true;
        bridgeReadySignalMs = elapsed();
        mark('native-bridge-created');
        mark('native-bootstrap-ready');
    }
    function findSurface() {
        try { return document.querySelector('.mpv-videoPlayerContainer-native'); } catch (error) { return null; }
    }
    function attachSurface() {
        var found = findSurface();
        scanSurfaceState();
        if (!found || found === surface) return;
        surface = found;
        rememberSurfaceLifecycle(found, 'poll');
    }
    function installDiagnosticsHook() {
        var current = window.enhancedDiagnostics;
        if (typeof current !== 'function') return;
        if (current.__eteReadinessHook) return;
        if (diagnosticsWrapper) return;
        try {
            originalDiagnostics = current;
            diagnosticsWrapper = function (bridge, stage) {
                recordDiagnostics(stage, 'observer-wrapper');
                return originalDiagnostics.apply(this, arguments);
            };
            diagnosticsWrapper.__eteReadinessHook = true;
            window.enhancedDiagnostics = diagnosticsWrapper;
            mark('diagnostics-hook-installed');
        } catch (error) { lastError = 'diagnostics-hook-failed'; diagnosticsWrapper = null; }
    }
    function installResolverHook() {
        try {
            var current = console.log;
            if (typeof current !== 'function' || current === consoleWrapper) return;
            originalConsoleLog = current;
            consoleWrapper = function () {
                try { if (String(Array.prototype.join.call(arguments, ' ')).indexOf('STRM resolver: invoked') >= 0) mark('resolver-result'); } catch (error) { lastError = 'console-hook-failed'; }
                return originalConsoleLog.apply(console, arguments);
            };
            consoleWrapper.__eteReadinessHook = true;
            console.log = consoleWrapper;
        } catch (error) { lastError = 'console-hook-failed'; }
    }
    function poll() { try { installDiagnosticsHook(); installResolverHook(); attachSurface(); syncStickyReadiness(); } catch (error) { lastError = 'observer-poll-failed'; } }
    function install() {
        mark('observer-installed', installedAt - t0);
        installSurfaceObserver();
        try {
            if (typeof window.addEventListener === 'function') {
                corePlayingListener = recordCorePlaying;
                window.addEventListener('core-playing', corePlayingListener);
                nativeHelperReadyListener = onNativeHelperReady;
                window.addEventListener('native-helper-ready', nativeHelperReadyListener);
            }
        } catch (error) { lastError = 'core-playing-observer-failed'; }
        installResolverHook();
        poll();
        pollTimer = setInterval(poll, 50);
    }
    function snapshot() {
        scanSurfaceState();
        syncStickyReadiness();
        var bridgeReadinessStatus = diagnosticsReadyObserved ? 'observed-ready' : stickyReadinessObserved ? 'inferred-ready-from-authoritative-state' : stickyReadinessSupported ? 'not-ready' : 'observer-missing';
        var bridgeReadinessEvidence = [];
        if (bridgeReadySignalSeen) bridgeReadinessEvidence.push({ kind: 'bridge-ready-signal', source: 'native-helper-ready event' });
        if (diagnosticsReadyObserved) bridgeReadinessEvidence.push({ kind: 'bridge-ready', source: 'acceptance observer wrapper' });
        if (stickyReadinessObserved) bridgeReadinessEvidence.push({ kind: 'bridge-ready', source: 'prepared preload sticky state' });
        return {
            version: 1, installedAt: installedAt, installElapsedMs: installedAt - t0, elapsedMs: elapsed(),
            timeline: timeline.map(function (row) { return { stage: row.stage, elapsedMs: row.elapsedMs, status: row.status }; }),
            messageSummary: [], bridgeBootstrapReadySeen: bridgeBootstrapReadySeen,
            bridgeReadySignalSeen: bridgeReadySignalSeen, bridgeReadySignalMs: bridgeReadySignalMs,
            diagnosticsHookInstalled: !!diagnosticsWrapper, diagnosticsReadySeen: diagnosticsReadySeen,
            diagnosticsReadyObserved: diagnosticsReadyObserved, diagnosticsReadySource: diagnosticsReadySource,
            diagnosticsPlayingSeen: diagnosticsPlayingSeen, bridgeAuthoritativeReady: diagnosticsReadySeen,
            stickyReadinessSupported: stickyReadinessSupported, stickyReadinessObserved: stickyReadinessObserved,
            stickyReadinessRunId: stickyReadinessRunId, stickyReadinessAt: stickyReadinessAt,
            bridgeReadiness: { status: bridgeReadinessStatus, evidence: bridgeReadinessEvidence,
                rawEventObserved: bridgeReadySignalSeen, normalizedObservation: diagnosticsReadyObserved ? 'direct-product-diagnostics' : stickyReadinessObserved ? 'sticky-authoritative-state' : 'missing' },
            corePlayingSeen: corePlayingSeen, corePlayingMs: corePlayingMs,
            videoProgressSeen: videoProgressSeen, firstVideoProgressMs: firstVideoProgressMs,
            firstVideoPosition: firstVideoPosition, lastVideoPosition: lastVideoPosition,
            resolverResultSeen: !!marks['resolver-result'], loadfileSeen: false,
            loadfileObservation: 'unavailable', lastError: lastError,
            surfaceCount: knownSurfaces.length, connectedSurfaceCount: currentSurfaceCount(),
            surfaceConnected: !!surface && nodeIsConnected(surface), surfaceRecreated: surfaceRecreated,
            multipleSurfacesObserved: multipleSurfacesObserved, surfaceCreatedObservationMs: surfaceCreatedObservationMs,
            surfaceAttachedMs: surfaceAttachedMs, surfaceLifecycle: surfaceLifecycle.map(function (row) {
                return { event: row.event, surfaceIndex: row.surfaceIndex, connected: row.connected,
                    currentCount: row.currentCount, elapsedMs: row.elapsedMs, source: row.source };
            })
        };
    }
    function cleanup() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (surfaceObserver) { try { surfaceObserver.disconnect(); } catch (error) { } surfaceObserver = null; }
        if (corePlayingListener && typeof window.removeEventListener === 'function') { try { window.removeEventListener('core-playing', corePlayingListener); } catch (error) { } corePlayingListener = null; }
        if (nativeHelperReadyListener && typeof window.removeEventListener === 'function') { try { window.removeEventListener('native-helper-ready', nativeHelperReadyListener); } catch (error) { } nativeHelperReadyListener = null; }
        if (console.log === consoleWrapper && originalConsoleLog) { try { console.log = originalConsoleLog; } catch (error) { } }
        if (window.enhancedDiagnostics === diagnosticsWrapper && originalDiagnostics) { try { window.enhancedDiagnostics = originalDiagnostics; } catch (error) { } }
    }
    var api = { version: 1, mark: mark, beginRun: beginRun, snapshot: snapshot, cleanup: cleanup, observer: { install: install } };
    window.__eteReadiness = api;
    install();
    window.__eteInstallResult = 'installed';
    return api;
}());
void 0;
