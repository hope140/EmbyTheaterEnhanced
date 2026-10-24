'use strict';

const NATIVE_COMMAND_CHANNEL = 'enhanced-windows-native-media-command';
const NATIVE_CHANNEL = 'enhanced-windows-native-media-state';
const NATIVE_SESSION_CHANNEL = 'enhanced-windows-native-media-session';
const crypto = require('crypto');

// Supplements the frozen MediaSession metadata/action owner. It never starts
// media or installs a second set of playback command handlers.
function install(window, send, options = {}) {
    if (!window || window.top !== window || !window.document) return function () {};
    let disposed = false, manager, events, player, bound = false;
    let lastCommandSequence = 0;
    let requireInput = options.requireInput || (typeof window.require === 'function' ? window.require.bind(window) : null);
    let lastNativeState, lastNativePositionAt = 0, nativeSequence = 0, nativeSessionToken = null;
    let nativeFlushTimer = null, lastNativePosition = null, playbackEpoch = 0, nativeStopped = false;
    const nativeClock = options.clock || {now: window.performance && typeof window.performance.now === 'function' ? window.performance.now.bind(window.performance) : Date.now,
        setTimeout: typeof window.setTimeout === 'function' ? window.setTimeout.bind(window) : setTimeout,
        clearTimeout: typeof window.clearTimeout === 'function' ? window.clearTimeout.bind(window) : clearTimeout};
    let nativeSessionError = false;
    let readyTimer = null, readyCalls = 0;
    let disposeCause = null;
    const readinessDeadline = Date.now() + 30000;
    function scheduleReady() {
        if (disposed || bound || readyTimer || Date.now() >= readinessDeadline) return;
        readyTimer = setTimeout(function() { readyTimer = null; ready(); }, 100);
    }
    const eventNames = ['pause', 'unpause', 'statechange', 'timeupdate', 'playbackratechange', 'playlistitemadd', 'playlistitemremove', 'playlistitemmove', 'repeatmodechange'];
    function queueCapabilities() {
        try {
            const index = manager.getCurrentPlaylistIndex(player), length = manager.getCurrentPlaylistLength(player), repeat = manager.getRepeatMode(player);
            if (!Number.isSafeInteger(index) || !Number.isSafeInteger(length) || length < 1 || index < 0 || index >= length) return {canPrevious: false, canNext: false};
            return {canPrevious: index > 0, canNext: index + 1 < length || repeat === 'RepeatAll' || repeat === 'RepeatOne'};
        } catch (_) { return {canPrevious: false, canNext: false}; }
    }
    function publish(inactive, nativeInactive, nativeOnly) {
        if (disposed) return;
        let state;
        try { state = !inactive && !nativeOnly && player && manager.getPlayerState(player); } catch (_) { }
        const item = state && state.NowPlayingItem;
        const active = !!(item && (item.MediaType === 'Video' || item.MediaType === 'Audio'));
        const paused = !!(state && state.PlayState && state.PlayState.IsPaused);
        const native = !nativeInactive && !nativeStopped && active && player && player.id === 'libmpvmediaplayer';
        const duration = native && Number.isFinite(Number(item.RunTimeTicks)) ? Math.max(0, Math.min(31622400, Number(item.RunTimeTicks) / 10000000)) : 0;
        const position = native && state.PlayState ? Math.max(0, Math.min(duration, Number(state.PlayState.PositionTicks) / 10000000 || 0)) : 0;
        const nativeRate = native && state.PlayState ? Number(state.PlayState.PlaybackRate) : 1;
        let nativeOwner = null;
        if (nativeSessionToken && native && typeof player.getNativePreviewOwner === 'function') {
            try {
                const value = player.getNativePreviewOwner(item);
                if (value && Object.keys(value).length === 2 && typeof value.endpointId === 'string' && /^[a-f0-9-]{36}$/.test(value.endpointId) &&
                    Number.isSafeInteger(value.generationId) && value.generationId > 0) nativeOwner = {endpointId:value.endpointId,generationId:value.generationId};
            } catch (_) { }
        }
        const nativeState = {version: 4, nativeOwner, playbackEpoch, active: !!native, paused: !!native && paused,
            title: native ? String(item.Name || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 512) : '',
            mediaKey: native ? crypto.createHash('sha256').update(String(item.ServerId || '') + ':' + String(item.Id || '')).digest('hex') : '',
            mediaType: native ? item.MediaType : '', duration, position,
            ...(native ? queueCapabilities() : {canPrevious: false, canNext: false}),
            rate: Number.isFinite(nativeRate) && nativeRate > 0 && nativeRate <= 64 ? nativeRate : 1};
        const nativeKey = JSON.stringify({...nativeState, position: 0});
        const now = nativeClock.now();
        if (nativeSessionToken && (nativeKey !== lastNativeState || now - lastNativePositionAt >= 1000)) {
            if (nativeFlushTimer) nativeClock.clearTimeout(nativeFlushTimer);
            nativeFlushTimer = null;
            lastNativeState = nativeKey; lastNativePositionAt = now;
            lastNativePosition = position;
            try { send(NATIVE_CHANNEL, {...nativeState, sequence: ++nativeSequence, sessionToken: nativeSessionToken}); } catch (_) { }
        } else if (nativeSessionToken && native && position !== lastNativePosition && !nativeFlushTimer) {
            nativeFlushTimer = nativeClock.setTimeout(function() { nativeFlushTimer = null; publish(false); }, Math.max(1, 1000 - (now - lastNativePositionAt)));
        }
        if (nativeOnly) return;
        const session = window.navigator && window.navigator.mediaSession;
        if (!session) return;
        try { session.playbackState = active ? paused ? 'paused' : 'playing' : 'none'; } catch (_) { }
        if (typeof session.setPositionState !== 'function') return;
        try {
            const duration = Number(item && item.RunTimeTicks) / 10000000;
            const position = Number(state && state.PlayState && state.PlayState.PositionTicks) / 10000000;
            const rate = Number(state && state.PlayState && state.PlayState.PlaybackRate);
            if (!active || !Number.isFinite(duration) || duration <= 0) session.setPositionState();
            else session.setPositionState({duration, playbackRate: Number.isFinite(rate) && rate > 0 ? rate : 1,
                position: Math.max(0, Math.min(duration, Number.isFinite(position) ? position : 0))});
        } catch (_) { /* Optional OS presentation must never fail playback. */ }
    }
    function update() { publish(false); }
    function start() { playbackEpoch++; nativeStopped = false; publish(false); }
    function stop(_event, state) {
        // Retire native controls and pixels even while the next item is known.
        nativeStopped = true;
        const hasNext = !!(state && state.NextMediaType);
        publish(!hasNext, true, hasNext);
    }
    function unbind() {
        if (!player || !events) return;
        for (const name of eventNames) events.off(player, name, update);
        events.off(player, 'playbackstop', stop);
        events.off(player, 'playbackstart', start);
        player = null;
    }
    function bindPlayer() {
        if (disposed) return;
        unbind();
        playbackEpoch++; nativeStopped = false;
        try { player = manager.getCurrentPlayer(); } catch (_) { player = null; }
        if (player) {
            for (const name of eventNames) events.on(player, name, update);
            events.on(player, 'playbackstop', stop);
            events.on(player, 'playbackstart', start);
        }
        publish(false);
    }
    function connect(managerModule, eventsModule) {
                if (disposed) return;
                if (!requireInput && typeof window.require === 'function') requireInput = window.require.bind(window);
                manager = managerModule.default || managerModule;
                events = eventsModule.default || eventsModule;
                events.on(manager, 'playerchange', bindPlayer);
                bindPlayer();
                if (typeof options.requestNativeSession === 'function') {
                    Promise.resolve().then(options.requestNativeSession).then(function(session) {
                        if (disposed || !session || typeof session.token !== 'string') return;
                        nativeSessionToken = session.token; lastNativeState = null; nativeSequence = 0;
                        publish(false);
                    }).catch(function() { nativeSessionError = true; });
                }
    }
    function ready() {
        readyCalls++;
        if (disposed || bound) return;
        if (options.playbackManager && options.events) {
            bound = true; connect(options.playbackManager, options.events); return;
        }
        if (typeof window.require !== 'function' || !window.define || !window.define.amd) { scheduleReady(); return; }
        if (readyTimer) { clearTimeout(readyTimer); readyTimer = null; }
        bound = true;
        window.require(['modules/common/playback/playbackmanager.js', 'modules/emby-apiclient/events.js'],
            connect, function() { bound = false; scheduleReady(); });
    }
    function dispose(event) {
        if (disposed) return;
        stop();
        disposed = true;
        disposeCause = event && event.type === 'unload' ? event.isTrusted === false ? 'synthetic-unload' : 'native-unload' : 'explicit';
        if (readyTimer) clearTimeout(readyTimer);
        readyTimer = null;
        if (nativeFlushTimer) nativeClock.clearTimeout(nativeFlushTimer);
        nativeFlushTimer = null;
        unbind();
        if (manager && events) events.off(manager, 'playerchange', bindPlayer);
        window.document.removeEventListener('appready', ready);
        window.removeEventListener('unload', dispose);
    }
    window.document.addEventListener('appready', ready, {once: true});
    window.addEventListener('unload', dispose, {once: true});
    if (options.playbackManager && options.events) ready(); else scheduleReady();
    dispose.command = function(packet) {
        const keys = ['version', 'command', 'sequence', 'nativeOwner', 'mediaKey', 'playbackEpoch', 'sessionToken'];
        if (!packet || Object.keys(packet).length !== keys.length || !keys.every(key => Object.hasOwn(packet, key)) || packet.version !== 1 ||
            !Number.isSafeInteger(packet.sequence) || packet.sequence <= lastCommandSequence || !['play', 'pause', 'stop', 'previous', 'next'].includes(packet.command)) return false;
        const commandPlayer = player;
        function currentCommand() {
            if (disposed || nativeStopped || !commandPlayer || commandPlayer !== player || commandPlayer.id !== 'libmpvmediaplayer' ||
                packet.sessionToken !== nativeSessionToken || packet.playbackEpoch !== playbackEpoch || packet.sequence < lastCommandSequence) return false;
            try {
                if (manager.getCurrentPlayer() !== commandPlayer) return false;
                const state = manager.getPlayerState(commandPlayer), item = state && state.NowPlayingItem;
                if (!item || !['Video', 'Audio'].includes(item.MediaType) || packet.mediaKey !== crypto.createHash('sha256').update(String(item.ServerId || '') + ':' + String(item.Id || '')).digest('hex')) return false;
                let owner = null;
                if (typeof commandPlayer.getNativePreviewOwner === 'function') owner = commandPlayer.getNativePreviewOwner(item);
                if (JSON.stringify(owner) !== JSON.stringify(packet.nativeOwner)) return false;
                const paused = !!(state.PlayState && state.PlayState.IsPaused), capabilities = queueCapabilities();
                return packet.command === 'play' ? paused : packet.command === 'pause' ? !paused :
                    packet.command === 'previous' ? capabilities.canPrevious : packet.command === 'next' ? capabilities.canNext : true;
            } catch (_) { return false; }
        }
        if (!currentCommand() || !requireInput) return false;
        lastCommandSequence = packet.sequence;
        try { requireInput(['inputmanager'], function(input) { if (currentCommand()) (input.default || input).trigger(packet.command); }, function() {}); }
        catch (_) { return false; }
        return true;
    };
    dispose.status = function() { return {bound, hasPlayer: !!player, nativePlayer: !!player && player.id === 'libmpvmediaplayer',
        sessionRequested: typeof options.requestNativeSession === 'function', nativeSessionReady: !!nativeSessionToken,
        nativeSessionError, nativeSequence, readyCalls, disposed, timerQueued: !!readyTimer,
        amdVisible: !!(window.define && window.define.amd), requireType: typeof window.require, disposeCause}; };
    return dispose;
}

module.exports = {NATIVE_COMMAND_CHANNEL, NATIVE_CHANNEL, NATIVE_SESSION_CHANNEL, install};
