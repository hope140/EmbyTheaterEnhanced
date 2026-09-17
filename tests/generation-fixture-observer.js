(function (root, factory) {
    'use strict';
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.eteGenerationFixtureObserver = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function create(options) {
        var settings = options || {};
        var target = settings.target;
        var timeoutMs = Number.isFinite(settings.timeoutMs) ? settings.timeoutMs : 3000;
        var now = settings.now || function () { return Date.now(); };
        var setTimer = settings.setTimeout || setTimeout;
        var clearTimer = settings.clearTimeout || clearTimeout;
        if (!target || typeof target.addEventListener !== 'function' || typeof target.removeEventListener !== 'function') throw new Error('event-target-required');

        var originalAdd = target.addEventListener.bind(target);
        var originalRemove = target.removeEventListener.bind(target);
        var fixtures = [];
        var retirements = [];
        var takeovers = [];
        var bridge = null;
        var originalBegin = null;
        var originalRetire = null;
        var ipc = target.ipc;
        var originalInvoke = ipc && typeof ipc.invoke === 'function' ? ipc.invoke : null;
        var originalSend = ipc && typeof ipc.send === 'function' ? ipc.send : null;
        var currentGeneration = null;
        var currentLabel = null;

        function fixtureForRequestId(requestId) {
            var match = /^play-(\d+)-/.exec(String(requestId || ''));
            return match ? entryForPlaybackId(Number(match[1])) : null;
        }

        if (originalInvoke) {
            ipc.invoke = function (channel, request) {
                var result = originalInvoke.apply(this, arguments);
                if (channel !== 'enhanced-cd2-resolve') return result;
                var entry = fixtureForRequestId(request && request.requestId);
                if (!entry) return result;
                entry.cd2ResolveEntered = true;
                entry.cd2ResolveEnteredAt = now();
                entry.cd2RequestId = request.requestId;
                entry.cd2PendingAtGate = !!result && typeof result.then === 'function';
                if (!entry.cd2GateSettled && entry.cd2PendingAtGate) {
                    entry.cd2GateSettled = true;
                    clearTimer(entry.cd2Timer);
                    entry.resolveCd2Gate({fixtureId:entry.fixtureId,requestId:entry.cd2RequestId,pending:true});
                }
                if (result && typeof result.then === 'function') {
                    Promise.resolve(result).then(function () { entry.cd2Settlement='fulfilled';entry.cd2SettledAt=now(); }, function () { entry.cd2Settlement='rejected';entry.cd2SettledAt=now(); });
                } else {
                    entry.cd2Settlement='non-thenable';
                    entry.cd2SettledAt=now();
                }
                return result;
            };
        }
        if (originalSend) {
            ipc.send = function (channel, request) {
                if (channel === 'enhanced-cd2-cancel') {
                    var entry = fixtureForRequestId(request && request.requestId);
                    if (entry) { entry.cd2CancelSent=true;entry.cd2CancelAt=now(); }
                }
                return originalSend.apply(this, arguments);
            };
        }

        function entryForPlaybackId(playbackRequestId) {
            return fixtures.find(function (entry) { return entry.playbackRequestId === Number(playbackRequestId); });
        }

        function playbackIdFromLabel(label) {
            var match = /^play-(\d+)-/.exec(String(label || ''));
            return match ? Number(match[1]) : 0;
        }

        function checkGate(entry) {
            if (!entry || entry.gateSettled || !entry.listenerRegistered || entry.nativeGenerationId == null) return;
            if (entry.promiseSettled) {
                entry.gateSettled = true;
                clearTimer(entry.timer);
                entry.rejectGate(new Error('fixture-play-settled-before-overlap-gate'));
                return;
            }
            entry.gateSettled = true;
            entry.pendingAtGate = true;
            entry.gateAt = now();
            clearTimer(entry.timer);
            entry.resolveGate({
                fixtureId: entry.fixtureId,
                playbackRequestId: entry.playbackRequestId,
                requestId: entry.requestId,
                nativeGenerationId: entry.nativeGenerationId,
                listenerId: entry.listenerId,
                pending: true
            });
        }

        target.addEventListener = function (name, listener, eventOptions) {
            if (name !== 'core-playing' || typeof listener !== 'function') return originalAdd(name, listener, eventOptions);
            var entry = fixtures.find(function (candidate) { return !candidate.listenerRegistered && !candidate.promiseSettled; });
            if (!entry) return originalAdd(name, listener, eventOptions);
            entry.listenerRegistered = true;
            entry.listenerId = fixtures.indexOf(entry) + 1;
            entry.listenerRegisteredAt = now();
            entry.originalListener = listener;
            entry.wrappedListener = function () {
                entry.callbackCount++;
                if (entry.takeoverAt != null) entry.callbackCountAfterTakeover++;
                return listener.apply(this, arguments);
            };
            if (!entry.promiseSettled && !entry.listenerGateSettled) {
                entry.listenerGateSettled = true;
                clearTimer(entry.listenerTimer);
                entry.resolveListenerGate({fixtureId:entry.fixtureId,playbackRequestId:entry.playbackRequestId,listenerId:entry.listenerId,pending:true});
            }
            checkGate(entry);
            return originalAdd(name, entry.wrappedListener, eventOptions);
        };

        target.removeEventListener = function (name, listener) {
            if (name === 'core-playing') {
                var entry = fixtures.find(function (candidate) { return candidate.originalListener === listener; });
                if (entry) {
                    entry.listenerRemoved = true;
                    entry.listenerRemovedAt = now();
                    return originalRemove(name, entry.wrappedListener);
                }
            }
            return originalRemove(name, listener);
        };

        function attachBridge(value) {
            if (!value || value === bridge || typeof value.beginGeneration !== 'function' || typeof value.retireGeneration !== 'function') return;
            bridge = value;
            originalBegin = value.beginGeneration;
            originalRetire = value.retireGeneration;
            value.beginGeneration = function (label) {
                var result = originalBegin.apply(this, arguments);
                return Promise.resolve(result).then(function (generation) {
                    currentGeneration = generation && generation.generationId;
                    currentLabel = String(label || '');
                    var entry = entryForPlaybackId(playbackIdFromLabel(label));
                    if (entry) {
                        entry.requestId = currentLabel;
                        entry.nativeGenerationId = currentGeneration;
                        entry.generationBeganAt = now();
                        checkGate(entry);
                    }
                    return generation;
                });
            };
            value.retireGeneration = function (reason) {
                retirements.push({
                    at: now(),
                    reason: reason || 'retired',
                    requestId: currentLabel,
                    generationId: currentGeneration
                });
                currentGeneration = null;
                currentLabel = null;
                return originalRetire.apply(this, arguments);
            };
        }

        function registerFixture(fixtureId, playbackRequestId) {
            var entry = {
                fixtureId: fixtureId,
                playbackRequestId: Number(playbackRequestId),
                requestId: null,
                nativeGenerationId: null,
                listenerId: null,
                listenerRegistered: false,
                listenerRemoved: false,
                callbackCount: 0,
                callbackCountAfterTakeover: 0,
                promiseSettled: false,
                promiseSettlement: null,
                promiseError: null,
                pendingAtGate: false,
                gateSettled: false,
                listenerGateSettled: false,
                cd2GateSettled: false,
                takeoverAt: null
            };
            entry.gate = new Promise(function (resolve, reject) { entry.resolveGate = resolve; entry.rejectGate = reject; });
            entry.listenerGate = new Promise(function (resolve, reject) { entry.resolveListenerGate = resolve; entry.rejectListenerGate = reject; });
            entry.cd2Gate = new Promise(function (resolve, reject) { entry.resolveCd2Gate = resolve; entry.rejectCd2Gate = reject; });
            entry.timer = setTimer(function () {
                if (entry.gateSettled) return;
                entry.gateSettled = true;
                entry.rejectGate(new Error('fixture-overlap-gate-timeout'));
            }, timeoutMs);
            entry.listenerTimer = setTimer(function () {
                if (entry.listenerGateSettled) return;
                entry.listenerGateSettled = true;
                entry.rejectListenerGate(new Error('fixture-listener-gate-timeout'));
            }, timeoutMs);
            entry.cd2Timer = setTimer(function () {
                if (entry.cd2GateSettled) return;
                entry.cd2GateSettled = true;
                entry.rejectCd2Gate(new Error('fixture-cd2-gate-timeout'));
            }, timeoutMs);
            fixtures.push(entry);
            return entry;
        }

        function waitForOverlapGate(fixtureId) {
            var entry = fixtures.find(function (candidate) { return candidate.fixtureId === fixtureId; });
            if (!entry) return Promise.reject(new Error('fixture-not-registered'));
            return entry.gate;
        }

        function waitForListenerGate(fixtureId) {
            var entry = fixtures.find(function (candidate) { return candidate.fixtureId === fixtureId; });
            if (!entry) return Promise.reject(new Error('fixture-not-registered'));
            return entry.listenerGate;
        }

        function cancelOverlapGate(fixtureId) {
            var entry = fixtures.find(function (candidate) { return candidate.fixtureId === fixtureId; });
            if (!entry || entry.gateSettled) return;
            entry.gateSettled = true;
            clearTimer(entry.timer);
            entry.resolveGate({fixtureId:entry.fixtureId,cancelled:true});
        }

        function waitForCd2PendingGate(fixtureId) {
            var entry = fixtures.find(function (candidate) { return candidate.fixtureId === fixtureId; });
            if (!entry) return Promise.reject(new Error('fixture-not-registered'));
            return entry.cd2Gate;
        }

        function cancelUnusedGates(fixtureId) {
            var entry = fixtures.find(function (candidate) { return candidate.fixtureId === fixtureId; });
            if (!entry) return;
            cancelOverlapGate(fixtureId);
            if (!entry.listenerGateSettled) {
                entry.listenerGateSettled=true;
                clearTimer(entry.listenerTimer);
                entry.resolveListenerGate({fixtureId:entry.fixtureId,cancelled:true});
            }
            if (!entry.cd2GateSettled) {
                entry.cd2GateSettled=true;
                clearTimer(entry.cd2Timer);
                entry.resolveCd2Gate({fixtureId:entry.fixtureId,cancelled:true});
            }
        }

        function markPromiseSettled(fixtureId, settlement, error) {
            var entry = fixtures.find(function (candidate) { return candidate.fixtureId === fixtureId; });
            if (!entry) return;
            entry.promiseSettled = true;
            entry.promiseSettlement = settlement;
            entry.promiseError = error ? {name:error.name || null, message:error.message || String(error), playbackSuperseded:!!error.playbackSuperseded} : null;
            entry.promiseSettledAt = now();
            if (!entry.listenerGateSettled) {
                entry.listenerGateSettled = true;
                clearTimer(entry.listenerTimer);
                entry.rejectListenerGate(new Error('fixture-play-settled-before-listener-gate'));
            }
            checkGate(entry);
        }

        function markTakeover(oldFixtureId, newFixtureId) {
            var oldEntry = fixtures.find(function (candidate) { return candidate.fixtureId === oldFixtureId; });
            var newEntry = fixtures.find(function (candidate) { return candidate.fixtureId === newFixtureId; });
            var at = now();
            if (oldEntry) {
                oldEntry.takeoverAt = at;
                oldEntry.callbackCountAtTakeover = oldEntry.callbackCount;
            }
            takeovers.push({at:at,oldFixtureId:oldFixtureId,newFixtureId:newFixtureId,activeRequestBefore:oldEntry && oldEntry.requestId || null,newRequestPlaybackId:newEntry && newEntry.playbackRequestId || null});
        }

        function snapshot() {
            return {
                fixtures: fixtures.map(function (entry) {
                    return {
                        fixtureId:entry.fixtureId,playbackRequestId:entry.playbackRequestId,requestId:entry.requestId,
                        nativeGenerationId:entry.nativeGenerationId,listenerId:entry.listenerId,listenerRegistered:entry.listenerRegistered,
                        listenerRemoved:entry.listenerRemoved,callbackCount:entry.callbackCount,callbackCountAtTakeover:entry.callbackCountAtTakeover||0,
                        callbackCountAfterTakeover:entry.callbackCountAfterTakeover,promiseSettled:entry.promiseSettled,
                        promiseSettlement:entry.promiseSettlement,promiseError:entry.promiseError,pendingAtGate:entry.pendingAtGate,
                        gateAt:entry.gateAt||null,takeoverAt:entry.takeoverAt||null
                        ,cd2RequestId:entry.cd2RequestId||null,cd2ResolveEntered:!!entry.cd2ResolveEntered,
                        cd2PendingAtGate:!!entry.cd2PendingAtGate,cd2Settlement:entry.cd2Settlement||null,
                        cd2CancelSent:!!entry.cd2CancelSent
                    };
                }),
                retirements: retirements.map(function (entry) { return Object.assign({}, entry); }),
                takeovers: takeovers.map(function (entry) { return Object.assign({}, entry); })
            };
        }

        function restore() {
            fixtures.forEach(function (entry) { cancelUnusedGates(entry.fixtureId); });
            target.addEventListener = originalAdd;
            target.removeEventListener = originalRemove;
            if (bridge && originalBegin) bridge.beginGeneration = originalBegin;
            if (bridge && originalRetire) bridge.retireGeneration = originalRetire;
            if (ipc && originalInvoke) ipc.invoke = originalInvoke;
            if (ipc && originalSend) ipc.send = originalSend;
        }

        return {attachBridge:attachBridge,registerFixture:registerFixture,waitForOverlapGate:waitForOverlapGate,waitForListenerGate:waitForListenerGate,waitForCd2PendingGate:waitForCd2PendingGate,cancelOverlapGate:cancelOverlapGate,cancelUnusedGates:cancelUnusedGates,markPromiseSettled:markPromiseSettled,markTakeover:markTakeover,snapshot:snapshot,restore:restore};
    }

    return {create:create};
}));
