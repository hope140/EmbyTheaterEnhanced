(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.eteNextTrackTransition = factory();
}(this, function () {
    'use strict';

    var bindings = new WeakMap();

    function create(options) {
        var doc = options.document;
        var win = options.window;
        var revision = 0;
        var active = null;
        var state = 'IDLE';
        var paintWaiters = new Set();

        function imageUrls(item) {
            var urls = [];
            var client;
            if (!item || !item.Id || !options.connectionManager) return urls;
            try { client = options.connectionManager.getApiClient(item); } catch (_) { return urls; }
            if (!client || typeof client.getImageUrl !== 'function') return urls;

            var primary = item.ImageTags && item.ImageTags.Primary || item.PrimaryImageTag;
            var backdrop = item.BackdropImageTags && item.BackdropImageTags[0];
            if (backdrop) {
                try { urls.push(client.getImageUrl(item.Id, {type: 'Backdrop', index: 0, tag: backdrop})); }
                catch (_) { /* Artwork is optional. */ }
            }
            if (primary) {
                try { urls.push(client.getImageUrl(item.PrimaryImageItemId || item.Id, {type: 'Primary', tag: primary})); }
                catch (_) { /* Artwork is optional. */ }
            }
            return urls.filter(function (url) { return typeof url === 'string' && !!url; });
        }

        function clear(token) {
            if (!active || active.token !== token) return;
            var previous = active;
            active = null;
            state = 'IDLE';
            if (previous.cleanupFade) previous.cleanupFade();
            if (previous.element.parentNode) previous.element.parentNode.removeChild(previous.element);
            previous.container.style.opacity = previous.previousOpacity;
            // A retired visual task must not keep Stop waiting for a future frame.
            Array.from(paintWaiters).forEach(function (finish) { finish(); });
        }

        function show(item) {
            var container = options.getContainer();
            if (!container || !doc || typeof doc.createElement !== 'function') return null;
            var token = ++revision;
            var previousOpacity = active && active.container === container
                ? active.previousOpacity : container.style.opacity;
            if (active) {
                if (active.element.parentNode) active.element.parentNode.removeChild(active.element);
                if (active.container !== container) active.container.style.opacity = active.previousOpacity;
            }

            var element = doc.createElement('div');
            element.className = 'mpv-nextTrackTransition';
            element.setAttribute('aria-hidden', 'true');
            var urls = imageUrls(item);
            if (!urls.length) element.classList.add('mpv-nextTrackTransition-noArtwork');
            var image = urls.length ? doc.createElement('img') : null;
            if (image) {
                image.className = 'mpv-nextTrackTransition-artwork';
                image.alt = '';
                var imageIndex = 0;
                image.onerror = function () {
                    if (!active || active.token !== token) return;
                    imageIndex++;
                    if (imageIndex < urls.length) image.src = urls[imageIndex];
                    else {
                        if (image.parentNode) image.parentNode.removeChild(image);
                        element.classList.add('mpv-nextTrackTransition-noArtwork');
                    }
                };
                element.appendChild(image);
            }
            container.style.opacity = '1';
            container.appendChild(element);
            active = {token: token, container: container, element: element,
                previousOpacity: previousOpacity, requestId: null};
            state = 'TRANSITION_SHOWING';
            if (image) image.src = urls[0];
            return token;
        }

        function afterPaint() {
            if (!win || typeof win.requestAnimationFrame !== 'function' || doc.visibilityState === 'hidden') {
                return Promise.resolve();
            }
            return new Promise(function (resolve, reject) {
                var finished = false;
                var frameId = null;
                function done(error) {
                    if (finished) return;
                    finished = true;
                    doc.removeEventListener('visibilitychange', onVisibility);
                    paintWaiters.delete(done);
                    if (frameId != null && typeof win.cancelAnimationFrame === 'function') {
                        win.cancelAnimationFrame(frameId);
                    }
                    if (error) reject(error);
                    else resolve();
                }
                function onVisibility() {
                    if (doc.visibilityState === 'hidden') done();
                }
                paintWaiters.add(done);
                try {
                    doc.addEventListener('visibilitychange', onVisibility);
                    // The first callback precedes paint; the second runs after one completed frame.
                    frameId = win.requestAnimationFrame(function () {
                        if (finished) return;
                        try { frameId = win.requestAnimationFrame(function () { done(); }); }
                        catch (error) { done(error); }
                    });
                } catch (error) { done(error); }
            });
        }

        async function beforeTeardown() {
            if (!active || state === 'HIDE_TRANSITION') return;
            var token = active.token;
            await afterPaint();
            if (active && active.token !== token) await beforeTeardown();
        }

        function markLoading(token, requestId) {
            if (!active || active.token !== token) return;
            if (!Number.isSafeInteger(requestId) || requestId <= 0) { clear(token); return; }
            active.requestId = requestId;
            state = 'LOADING_NEXT';
        }

        function playbackStarted(requestId) {
            if (!active || active.requestId == null) return;
            if (requestId > active.requestId) clear(active.token);
        }

        function playbackReady(requestId) {
            if (!active || active.requestId !== requestId || state !== 'LOADING_NEXT') return;
            state = 'PLAYBACK_READY';
            var token = active.token;
            var painted;
            try { painted = afterPaint(); }
            catch (_) { clear(token); return; }
            Promise.resolve(painted).then(function () {
                if (!active || active.token !== token || state !== 'PLAYBACK_READY') return;
                var element = active.element;
                if (doc.visibilityState === 'hidden' ||
                    (win && typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
                    clear(token);
                    return;
                }
                function onTransitionEnd(event) {
                    if (event.target !== element || event.propertyName !== 'opacity') return;
                    clear(token);
                }
                active.cleanupFade = function () {
                    element.removeEventListener('transitionend', onTransitionEnd);
                    element.removeEventListener('transitioncancel', onTransitionEnd);
                };
                element.addEventListener('transitionend', onTransitionEnd);
                element.addEventListener('transitioncancel', onTransitionEnd);
                element.classList.add('mpv-nextTrackTransition-fading');
                state = 'HIDE_TRANSITION';
                // Hidden/non-rendered elements may never start a CSS transition or emit its end event.
                if (typeof element.getAnimations === 'function') {
                    var animations = element.getAnimations();
                    if (!animations.length) clear(token);
                    else Promise.all(animations.map(function (animation) { return animation.finished; }))
                        .then(function () { clear(token); }, function () { clear(token); });
                }
            }).catch(function () { clear(token); });
        }

        function playbackFailed(requestId) {
            if (active && active.requestId === requestId) clear(active.token);
        }

        function settled(token) {
            // Superseded or failed manager calls can fulfill without core-playing.
            if (active && active.token === token && state === 'LOADING_NEXT') clear(token);
        }

        function fail(token) { clear(token); }
        function cancel() { if (active) clear(active.token); }
        function isActive() { return !!active; }
        function currentState() { return state; }

        return {show: show, beforeTeardown: beforeTeardown, markLoading: markLoading,
            playbackStarted: playbackStarted, playbackReady: playbackReady,
            playbackFailed: playbackFailed,
            settled: settled, fail: fail, cancel: cancel, isActive: isActive,
            currentState: currentState};
    }

    function install(manager, player, transition) {
        if (!manager || typeof manager.nextTrack !== 'function') return;
        var binding = bindings.get(manager);
        if (binding) {
            binding.player = player;
            binding.transition = transition;
            return;
        }
        binding = {player: player, transition: transition};
        var original = manager.nextTrack;
        manager.nextTrack = function () {
            var receiver = this;
            var args = arguments;
            var current = arguments[0] || manager.getCurrentPlayer();
            var queue = manager._playQueueManager;
            if (current !== binding.player || !queue || typeof queue.getNextItemInfo !== 'function') {
                return original.apply(receiver, args);
            }
            var next;
            try { next = queue.getNextItemInfo(); }
            catch (_) { return original.apply(receiver, args); }
            if (!next || !next.item || next.item.MediaType !== 'Video') {
                return original.apply(receiver, args);
            }
            var visual = binding.transition;
            var token;
            try { token = visual.show(next.item); } catch (_) { token = null; }
            if (token == null) return original.apply(receiver, args);
            var before = Number(manager._etePlayRequestSequence) || 0;
            var result;
            try { result = original.apply(receiver, args); }
            catch (error) { visual.fail(token); throw error; }
            var requestId = Number(manager._etePlayRequestSequence) || 0;
            if (requestId > before) visual.markLoading(token, requestId);
            else visual.fail(token);
            return Promise.resolve(result).then(function (result) {
                    visual.settled(token);
                    return result;
                }, function (error) {
                    visual.fail(token);
                    throw error;
                });
        };
        bindings.set(manager, binding);
    }

    return {create: create, install: install};
}));
