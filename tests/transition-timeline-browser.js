(function (root) {
    'use strict';

    var MAX_TIMELINE_EVENTS = 80;
    var FIXTURE_DEADLINE_MS = 14500;

    function currentItemKey(manager, timelineKeyById) {
        try {
            var item = manager && typeof manager.currentItem === 'function' ? manager.currentItem() : null;
            if (!item) return null;
            if (item.__eteTimelineKey === 'A' || item.__eteTimelineKey === 'B') return item.__eteTimelineKey;
            var mapped = timelineKeyById && timelineKeyById[item.Id];
            return mapped === 'A' || mapped === 'B' ? mapped : null;
        } catch (_) {
            return null;
        }
    }

    function withDeadline(promise, timeoutMs, label) {
        var timer;
        return Promise.race([
            Promise.resolve(promise),
            new Promise(function (_resolve, reject) {
                timer = setTimeout(function () { reject(new Error('timeline-timeout:' + label)); }, timeoutMs);
            })
        ]).finally(function () { clearTimeout(timer); });
    }

    function waitUntil(predicate, timeoutMs, label) {
        var deadline = Date.now() + timeoutMs;
        return new Promise(function (resolve, reject) {
            function poll() {
                try {
                    if (predicate()) return resolve();
                } catch (_) { }
                if (Date.now() >= deadline) return reject(new Error('timeline-timeout:' + label));
                setTimeout(poll, 25);
            }
            poll();
        });
    }

    function waitForPixelColor(rootWindow, stage, expectedColor, remainingMs, record) {
        var stageStartedAt = Date.now();
        var stageDeadline = stageStartedAt + Math.min(1500, Math.max(0, remainingMs()));
        var result = {status: 'INCONCLUSIVE', expectedColor: expectedColor, observedColor: null, atMs: null};
        return new Promise(function (resolve) {
            function poll() {
                var sample = null;
                try {
                    var stream = rootWindow.__eteTransitionScreenStream;
                    if (stream && typeof stream.currentColor === 'function') sample = stream.currentColor();
                } catch (_) { }
                if (sample && Number.isFinite(sample.atMs) && sample.atMs >= stageStartedAt &&
                    Date.now() - sample.atMs <= 150 && typeof sample.colorClass === 'string') {
                    result.observedColor = sample.colorClass;
                    result.atMs = sample.atMs;
                    if (sample.colorClass === expectedColor) {
                        result.status = 'COLOR_OBSERVED';
                        record('pixel-prerequisite-observed', stage === 'initialA' ? 'A' : 'B', {
                            stage: stage, expectedColor: expectedColor, observedColor: sample.colorClass, sampleAtMs: sample.atMs
                        });
                        return resolve(result);
                    }
                }
                if (Date.now() >= stageDeadline) {
                    record('pixel-prerequisite-inconclusive', stage === 'initialA' ? 'A' : 'B', {
                        stage: stage, expectedColor: expectedColor, observedColor: result.observedColor, sampleAtMs: result.atMs
                    });
                    return resolve(result);
                }
                setTimeout(poll, 25);
            }
            poll();
        });
    }

    function createTimelineFixture(context) {
        var settings = context.options || {};
        var urls = {
            A: typeof settings.mediaAUrl === 'string' ? settings.mediaAUrl : '',
            B: typeof settings.mediaBUrl === 'string' ? settings.mediaBUrl : ''
        };
        var posterBaseUrl = typeof settings.posterBaseUrl === 'string' ? settings.posterBaseUrl : '';
        if (!urls.A || !urls.B || !posterBaseUrl) throw new Error('timeline-fixture-inputs-missing');

        var manager = context.manager;
        var embedded = context.embedded;
        var api = context.api;
        var items = context.items;
        var doc = root.document;
        var startedAt = Date.now();
        var deadlineAt = startedAt + FIXTURE_DEADLINE_MS;
        var timeline = [];
        var actions = [];
        var actionStates = Object.create(null);
        var timelineKeyById = Object.create(null);
        var pixelPrerequisite = {
            initialA: {status: 'INCONCLUSIVE', expectedColor: 'red', observedColor: null, atMs: null},
            beforePrevious: {status: 'INCONCLUSIVE', expectedColor: 'green', observedColor: null, atMs: null},
            evidenceClass: 'currentColor-prerequisite-only'
        };
        var activeAction = null;
        var observer = null;
        var style = null;
        var closed = false;
        var previousGetImageUrl = api.getImageUrl;
        var hadOwnGetImageUrl = Object.prototype.hasOwnProperty.call(api, 'getImageUrl');
        var maxEvents = MAX_TIMELINE_EVENTS;
        var initialItem = null;
        var completedStatus = 'completed';
        root.__eteTransitionTimeline = {
            kind: 'windowed-transition-timeline',
            status: 'running',
            timeline: timeline,
            actions: actions,
            pixelPrerequisite: pixelPrerequisite,
            evidenceClass: 'logical-only'
        };

        function remainingMs() { return Math.max(0, deadlineAt - Date.now()); }

        function record(event, itemKey, details) {
            if (closed) return;
            if (timeline.length >= maxEvents) return;
            var entry = {atMs: Date.now(), event: event, item: itemKey === 'A' || itemKey === 'B' ? itemKey : null};
            if (details && typeof details === 'object') Object.assign(entry, details);
            timeline.push(entry);
        }

        function safeImageItemKey(image) {
            try {
                var parsed = new URL(image && (image.currentSrc || image.src) || '', root.location.href);
                var key = parsed.searchParams.get('item');
                return key === 'A' || key === 'B' ? key : null;
            } catch (_) { return null; }
        }

        function addOrUpdateOverlay(overlay, inserted) {
            if (!overlay || !overlay.classList || !overlay.classList.contains('mpv-nextTrackTransition')) return;
            var slot = activeAction;
            var itemKey = slot ? slot.target : null;
            if (inserted && slot && !slot.overlayInserted) {
                slot.overlayInserted = true;
                record('overlay-insert', itemKey, {noArtwork: overlay.classList.contains('mpv-nextTrackTransition-noArtwork')});
            }
            var noArtwork = overlay.classList.contains('mpv-nextTrackTransition-noArtwork');
            if (noArtwork && slot) slot.noArtwork = true;
            var fading = overlay.classList.contains('mpv-nextTrackTransition-fading');
            if (fading && slot && !slot.overlayFading) {
                slot.overlayFading = true;
                record('overlay-fade-start', itemKey);
            }
        }

        function onImageEvent(event) {
            var image = event && event.target;
            if (!image || !image.classList || !image.classList.contains('mpv-nextTrackTransition-artwork')) return;
            var itemKey = safeImageItemKey(image) || (activeAction && activeAction.target) || null;
            var status = event.type === 'load' ? 'loaded' : 'error';
            if (activeAction && activeAction.target === itemKey) activeAction.imageStatus = status;
            record('poster-' + status, itemKey);
            if (event.type === 'load' && typeof image.decode === 'function') {
                Promise.resolve().then(function () { return image.decode(); }).then(function () {
                    record('poster-decode-complete', itemKey);
                }, function () {
                    record('poster-decode-failed', itemKey);
                });
            }
        }

        function onCorePlaying() {
            var currentKey = currentItemKey(manager, timelineKeyById);
            if (activeAction) {
                record('core-playing', activeAction.target, {attribution: 'active-action-window', currentItemAtEvent: currentKey});
                activeAction.corePlaying = true;
                return;
            }
            var requestedKey = initialItem && initialItem.__eteTimelineKey;
            var itemKey = currentKey || requestedKey || null;
            record('core-playing', itemKey, {attribution: currentKey ? 'manager-current-item' : requestedKey ? 'initial-request-window' : 'unavailable'});
        }

        function addPositionSample(label) {
            var milliseconds = null;
            try {
                if (embedded && typeof embedded.currentTime === 'function') milliseconds = embedded.currentTime();
            } catch (_) { }
            var seconds = Number.isFinite(Number(milliseconds)) ? Number(milliseconds) / 1000 : null;
            record('time-pos-sample', label, {positionSeconds: seconds, evidenceClass: 'logical-only'});
        }

        function actionItem(key, url) {
            var id = 'timeline-fixture-' + key;
            return {
                Id: id,
                __eteTimelineKey: key,
                fixtureUrl: url,
                ServerId: 'fixture-server',
                Name: 'Transition fixture ' + key,
                MediaType: 'Video',
                Type: 'Movie',
                Path: url,
                ImageTags: {Primary: 'timeline-primary-' + key},
                BackdropImageTags: ['timeline-backdrop-' + key],
                RunTimeTicks: 50000000,
                UserData: {},
                MediaStreams: []
            };
        }

        async function invokeAction(kind, target) {
            var slot = {
                kind: kind,
                target: target,
                startedAtMs: Date.now(),
                overlayInserted: false,
                overlayFading: false,
                overlayRemoved: false,
                noArtwork: false,
                imageStatus: null,
                corePlaying: false,
                currentItem: null,
                status: 'pending'
            };
            activeAction = slot;
            actionStates[kind] = slot;
            record('action-start', target, {kind: kind});
            if (!root.ipc || typeof root.ipc.send !== 'function') throw new Error('timeline-test-ipc-unavailable');
            root.ipc.send('ete-test-transition-timeline-action', kind);
            await withDeadline(new Promise(function (resolve) {
                if (typeof root.requestAnimationFrame === 'function') root.requestAnimationFrame(function () { resolve(); });
                else setTimeout(resolve, 16);
            }), Math.min(500, remainingMs()), kind + '-capture-start');

            var operation = kind === 'next' ? manager.nextTrack() : manager.previousTrack();
            await withDeadline(operation, Math.min(3500, remainingMs()), kind + '-playback');
            slot.currentItem = currentItemKey(manager, timelineKeyById);
            slot.status = 'fulfilled';
            record('action-settled', target, {kind: kind, status: slot.status, selected: slot.currentItem === target});
            var captureWindowEnd = slot.startedAtMs + 2100;
            if (Date.now() < captureWindowEnd) {
                await withDeadline(new Promise(function (resolve) { setTimeout(resolve, captureWindowEnd - Date.now()); }), remainingMs(), kind + '-capture-window');
            }
            slot.currentItem = currentItemKey(manager, timelineKeyById);
            addPositionSample(target);
            actions.push({kind: kind, target: target, status: slot.status, selected: slot.currentItem === target});
            return slot;
        }

        function installTimelineStyle() {
            style = doc.createElement('style');
            style.setAttribute('data-ete-test-style', 'transition-timeline');
            style.textContent = [
                'html,body{background:transparent!important;overflow:hidden!important;width:100%!important;height:100%!important}',
                'body>:not(.mpv-videoPlayerContainer){visibility:hidden!important;pointer-events:none!important}',
                '.mpv-videoPlayerContainer{visibility:visible!important}'
            ].join('\n');
            (doc.head || doc.documentElement).appendChild(style);
        }

        function installObservers() {
            doc.addEventListener('load', onImageEvent, true);
            doc.addEventListener('error', onImageEvent, true);
            root.addEventListener('core-playing', onCorePlaying);
            if (typeof root.MutationObserver === 'function') {
                observer = new root.MutationObserver(function (mutations) {
                    mutations.forEach(function (mutation) {
                        if (mutation.type === 'attributes') {
                            addOrUpdateOverlay(mutation.target, false);
                            return;
                        }
                        Array.prototype.forEach.call(mutation.addedNodes || [], function (node) {
                            if (node && node.nodeType === 1) {
                                addOrUpdateOverlay(node, true);
                                if (typeof node.querySelectorAll === 'function') {
                                    Array.prototype.forEach.call(node.querySelectorAll('.mpv-nextTrackTransition'), function (overlay) {
                                        addOrUpdateOverlay(overlay, true);
                                    });
                                }
                            }
                        });
                        Array.prototype.forEach.call(mutation.removedNodes || [], function (node) {
                            if (!node || node.nodeType !== 1 || !node.classList || !node.classList.contains('mpv-nextTrackTransition')) return;
                            var slot = activeAction;
                            if (slot && !slot.overlayRemoved) {
                                slot.overlayRemoved = true;
                                record('overlay-remove', slot.target);
                            }
                        });
                    });
                });
                observer.observe(doc.body || doc.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
            }
        }

        function cleanupObservers() {
            closed = true;
            if (observer) observer.disconnect();
            doc.removeEventListener('load', onImageEvent, true);
            doc.removeEventListener('error', onImageEvent, true);
            root.removeEventListener('core-playing', onCorePlaying);
            if (style && style.parentNode) style.parentNode.removeChild(style);
            if (hadOwnGetImageUrl) api.getImageUrl = previousGetImageUrl;
            else delete api.getImageUrl;
        }

        return (async function () {
            var result;
            var initialItemKey = null;
            try {
                if (!manager || typeof manager.play !== 'function' || typeof manager.nextTrack !== 'function' ||
                    typeof manager.previousTrack !== 'function' || !api || !items) {
                    throw new Error('timeline-fixture-api-unavailable');
                }
                installTimelineStyle();
                installObservers();

                var itemA = actionItem('A', urls.A);
                var itemB = actionItem('B', urls.B);
                items.set(itemA.Id, itemA);
                items.set(itemB.Id, itemB);
                timelineKeyById[itemA.Id] = 'A';
                timelineKeyById[itemB.Id] = 'B';
                api.getImageUrl = function (itemId) {
                    var item = items.get(itemId);
                    var key = item && item.__eteTimelineKey;
                    if (key !== 'A' && key !== 'B') return '';
                    return posterBaseUrl + '?item=' + key;
                };
                initialItem = itemA;

                record('initial-play-start', 'A');
                await withDeadline(manager.play({items: [itemA, itemB], fullscreen: false, startPositionTicks: 0}), Math.min(3500, remainingMs()), 'initial-play');
                initialItemKey = currentItemKey(manager, timelineKeyById);
                record('initial-play-settled', initialItemKey, {selected: initialItemKey === 'A'});
                if (initialItemKey !== 'A') throw new Error('timeline-initial-item-not-selected');
                await waitUntil(function () { return timeline.some(function (entry) { return entry.event === 'core-playing' && entry.item === 'A'; }); }, Math.min(500, remainingMs()), 'initial-core-playing');
                addPositionSample('A');
                pixelPrerequisite.initialA = await waitForPixelColor(root, 'initialA', 'red', remainingMs, record);

                var nextSlot = await invokeAction('next', 'B');
                pixelPrerequisite.beforePrevious = await waitForPixelColor(root, 'beforePrevious', 'green', remainingMs, record);
                var previousSlot = await invokeAction('previous', 'A');
                result = {
                    kind: 'windowed-transition-timeline',
                    status: 'completed',
                    timeline: timeline,
                    actions: actions,
                    logicalChecks: {
                        nextItemB: nextSlot.currentItem === 'B',
                        previousItemA: previousSlot.currentItem === 'A',
                        nextOverlay: nextSlot.overlayInserted,
                        previousOverlay: previousSlot.overlayInserted,
                        nextArtworkLoaded: nextSlot.imageStatus === 'loaded',
                        previousArtworkLoaded: previousSlot.imageStatus === 'loaded',
                        nextCorePlaying: nextSlot.corePlaying,
                        previousCorePlaying: previousSlot.corePlaying,
                        durationMs: Date.now() - startedAt
                    },
                    artwork: {
                        next: nextSlot.imageStatus || (nextSlot.noArtwork ? 'missing' : 'unobserved'),
                        previous: previousSlot.imageStatus || (previousSlot.noArtwork ? 'missing' : 'unobserved')
                    },
                    pixelPrerequisite: pixelPrerequisite,
                    evidenceClass: 'logical-only'
                };
            } catch (error) {
                completedStatus = 'failed';
                var failureMessage = error && typeof error.message === 'string' ? error.message : '';
                var safeFailure = /^timeline-[a-z-]+(?::[a-z-]+)?$/.test(failureMessage)
                    ? failureMessage : 'timeline-fixture-error';
                record('fixture-failed', currentItemKey(manager, timelineKeyById), {reason: safeFailure});
                var nextFailure = actionStates.next || {};
                var previousFailure = actionStates.previous || {};
                result = {
                    kind: 'windowed-transition-timeline',
                    status: completedStatus,
                    failure: safeFailure,
                    timeline: timeline,
                    actions: actions,
                    logicalChecks: {
                        nextItemB: nextFailure.currentItem === 'B',
                        previousItemA: previousFailure.currentItem === 'A',
                        nextOverlay: !!nextFailure.overlayInserted,
                        previousOverlay: !!previousFailure.overlayInserted,
                        nextArtworkLoaded: nextFailure.imageStatus === 'loaded',
                        previousArtworkLoaded: previousFailure.imageStatus === 'loaded',
                        nextCorePlaying: !!nextFailure.corePlaying,
                        previousCorePlaying: !!previousFailure.corePlaying,
                        durationMs: Date.now() - startedAt
                    },
                    artwork: {
                        next: nextFailure.imageStatus || (nextFailure.noArtwork ? 'missing' : 'unobserved'),
                        previous: previousFailure.imageStatus || (previousFailure.noArtwork ? 'missing' : 'unobserved')
                    },
                    pixelPrerequisite: pixelPrerequisite,
                    evidenceClass: 'logical-only'
                };
            } finally {
                cleanupObservers();
                if (manager && typeof manager.stop === 'function') {
                    try { await withDeadline(manager.stop(), Math.min(1000, remainingMs()), 'cleanup-stop'); } catch (_) { }
                }
            }
            root.__eteTransitionTimeline = result;
            return result;
        }());
    }

    root.runTransitionTimelineFixture = function (context) {
        return createTimelineFixture(context);
    };
}(window));
