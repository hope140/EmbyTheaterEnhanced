'use strict';

// Synchronous scope only. No pending/last command survives history.back().
// WeakMap bindings follow the actual router context through async view loading.
function create(log) {
    const routes = new WeakMap();
    let active = null, inRoute = false, sequence = 0;
    function emit(event, details) { try { const pending = log({category: 'playback', event, details}); if (pending && pending.catch) pending.catch(function () {}); } catch (_) {} }
    function scoped(token, callback, route) {
        const previous = active, previousRoute = inRoute;
        active = token; inRoute = !!route;
        try { return callback(); } finally { active = previous; inRoute = previousRoute; }
    }
    return {
        invoke(manager, command, origin, callback) {
            let token = null;
            try {
                const player = manager.getCurrentPlayer(), stream = player && player.streamInfo;
                token = {player, stream, request: stream && stream._etePlayRequestId,
                    id: 'navigation-' + (++sequence), command: command === 'home' ? 'home' : 'back',
                    origin: origin === 'remote-general' ? 'remote-general' : 'input', consumed: false};
                emit('navigation-requested', {navigationId: token.id, navigationCommand: token.command,
                    controlOrigin: token.origin, playbackRequestId: token.request || null,
                    association: 'input-request-only'});
            } catch (_) {}
            return scoped(token, callback);
        },
        capture(context) { try { if (active) routes.set(context, active); } catch (_) {} },
        copy(context, request) { try { if (routes.has(context)) routes.set(request, routes.get(context)); } catch (_) {} },
        withRoute(request, callback) {
            let token = null;
            try { if (!(request.abortController && request.abortController.signal.aborted)) token = routes.get(request) || null; } catch (_) {}
            return scoped(token, callback, true);
        },
        stopContext(player) {
            let matched = false;
            try { matched = !!(inRoute && active && !active.consumed && active.player === player && active.stream === player.streamInfo &&
                Number.isSafeInteger(active.request) && active.request > 0 && player.streamInfo._etePlayRequestId === active.request); } catch (_) {}
            const context = {controlOrigin: matched ? active.origin : 'unknown',
                navigationId: matched ? active.id : null,
                navigationCommand: matched ? active.command : 'route',
                navigationAssociation: matched ? 'route-context' : 'unknown'};
            if (matched) active.consumed = true;
            return context;
        }
    };
}
module.exports = {create};
