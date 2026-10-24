(function(factory) {
    if (typeof define === 'function') define(['exports', './server-sections.js', 'modules/cardbuilder/cardbuilder.js',
        'modules/layoutmanager.js', 'modules/common/globalize.js', 'modules/approuter.js',
        'modules/emby-elements/emby-button/emby-button.js', '../page-cache/home-layout-cache.js', 'modules/emby-apiclient/events.js', 'css!./home-flow.css'], function(exports, provider, cards, layout, globalize, router, button, cache, events) {
        exports.default = factory(provider.default, cards.default, layout.default, globalize.default, router.default, cache.default, events.default);
    });
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('./server-sections.js'), null, null, null, null, require('../page-cache/home-layout-cache.js'));
})(function(serverSections, cards, layout, globalize, router, cacheModule, defaultEvents) {
    'use strict';
    function abort() { var error = new Error('Home request cancelled'); error.name = 'AbortError'; return error; }
    function listOptions(section, renderer) {
        var resume = section.SectionType === 'resume', next = section.SectionType === 'nextup', onNow = section.SectionType === 'onnow';
        var options = {fields: ['Name', 'ProductionYear', 'ParentName'], preferThumb: resume || next ? true : 'auto',
            shape: resume || next ? 'backdrop' : 'auto', overlayText: false, lazy: true, centerText: true, cardLayout: false,
            context: 'home', overlayPlayButton: section.SectionType !== 'userviews', showDetailsMenu: true,
            focusTransformTitleAdjust: true};
        if (section.SectionType === 'userviews') { options.fields = ['Name']; options.multiSelect = false; options.hoverPlayButton = false; }
        if (section.SectionType === 'resumeaudio') { options.fields = ['Name', 'Album', 'ParentName']; options.albumFirst = true; }
        if (resume) options.lines = 2;
        if (onNow) Object.assign(options, {fields: ['CurrentProgramName', 'CurrentProgramParentName', 'CurrentProgramTime'],
            shape: 'autooverflow', defaultShape: 'portrait', showCurrentProgramImage: true, showAirDateTime: false,
            lines: 3, action: 'programlink', inheritThumb: false, multiSelect: false});
        var contextMenuOptions = resume ? {removeFromResume: true} : next ? {removeFromNextUp: true} : onNow ? {createRecording: false} : {};
        return {renderer: renderer, options: options, virtualScrollLayout: 'horizontal-grid', contextMenuOptions: contextMenuOptions};
    }
    function create(owner, dependencies) {
        var legacy = dependencies.legacy, loading = dependencies.loading, focus = dependencies.focus, connection = dependencies.connection;
        var document = dependencies.document || owner.view.ownerDocument;
        var renderer = dependencies.cards || cards, layoutManager = dependencies.layout || layout, locale = dependencies.globalize || globalize;
        var navigation = dependencies.router || router;
        var testOptions = typeof window === 'object' && window.__etePageCacheTestOptions;
        var flowMode = dependencies.homeFlowOptions && dependencies.homeFlowOptions.mode || testOptions && testOptions.homeFlow || 'baseline';
        if (!['baseline', 'retain', 'sections'].includes(flowMode)) throw new TypeError('Invalid Home flow mode.');
        var flowing = flowMode !== 'baseline', events = dependencies.events || defaultEvents;
        if (flowing && (!events || typeof events.on !== 'function' || typeof events.off !== 'function')) throw new TypeError('Canonical Home events required.');
        var layoutCache = cacheModule.create(connection, dependencies.pageCacheOptions || testOptions, dependencies.events);
        var strictIdentity = layoutCache.enabled || flowing;
        var provider = serverSections.createProvider(function() { return connection.currentApiClient(); }, {layoutCache: layoutCache.enabled ? layoutCache : null, strictIdentity: strictIdentity});
        var identityClock = dependencies.identityClock || {now: function() { return Date.now(); },
            setTimeout: function(fn, delay) { return setTimeout(fn, delay); },
            clearTimeout: function(timer) { clearTimeout(timer); }};
        var waits = new Set();
        var active = false, disposed = false, epoch = 0, stage = null, stageMode = null, pending = null;
        var focusedItemId = null, committedTicket = null;
        var focusedTitleId = null, focusedSeeAll = false;
        var flowRows = [], flowTicket = null, flowLayout = null, eventClient = null, eventQueued = null;
        var savedScroll = null, flowFocus = null, flowRevision = 0, inputRevision = 0;
        function current(ticket) {
            if (!ticket || disposed || !active || ticket.epoch !== epoch || !owner.view || flowing && ticket.flowRevision !== flowRevision) return false;
            try { return connection.currentApiClient() === ticket.client && ticket.client.serverId() === ticket.server && ticket.client.getCurrentUserId() === ticket.user &&
                (!strictIdentity || ticket.client.isLoggedIn() && (ticket.client._identityEpoch || 0) === ticket.auth &&
                    (ticket.client.getCurrentLocale() || '') === ticket.locale && ticket.client.serverVersion() === ticket.version && queryKey() === ticket.query); }
            catch (_) { return false; }
        }
        function getItems(root) { return root ? Array.from(root.querySelectorAll('.itemsContainer')) : []; }
        function pauseItems(root) { getItems(root).forEach(function(items) { if (typeof items.pause === 'function') items.pause(); }); }
        function cancelWaits() { Array.from(waits).forEach(function(cancel) { cancel(); }); }
        function activeEpoch(value) { return active && !disposed && !!owner.view && epoch === value; }
        function identity(value) {
            try {
                var client = connection.currentApiClient();
                if (!client) return null;
                var server = client.serverId(), user = client.getCurrentUserId();
                if (typeof server !== 'string' || !server || typeof user !== 'string' || !user) return null;
                if (strictIdentity && (!client.isLoggedIn() || !Number.isSafeInteger(client._identityEpoch || 0) || (client._identityEpoch || 0) < 0)) return null;
                return {epoch: value, client: client, server: server, user: user,
                    auth: strictIdentity ? client._identityEpoch || 0 : null,
                    locale: strictIdentity ? client.getCurrentLocale() || '' : null,
                    version: strictIdentity ? client.serverVersion() : null, query: strictIdentity ? queryKey() : null, flowRevision: flowRevision, fallback: null};
            } catch (_) { return null; }
        }
        function queryKey() {
            var params = owner.params || {}, keys = Object.keys(params).sort();
            if (keys.some(function(key) { return !['serverId', 'parentId', 'tab', 'context'].includes(key) ||
                typeof params[key] !== 'string' || params[key].length > 256; })) return null;
            return JSON.stringify([layoutManager.tv ? 'tv' : 'mobile,desktop', keys.map(function(key) { return [key, params[key]]; })]);
        }
        function sameScope(a, b) {
            return a && b && a.client === b.client && a.server === b.server && a.user === b.user && a.auth === b.auth &&
                a.locale === b.locale && a.version === b.version && a.query === b.query;
        }
        function sameIdentity(a, b) { return sameScope(a, b) && a.query !== null; }
        function scrollState(element) {
            if (!element) return null;
            var value = typeof element.getScrollPosition === 'function' ? element.getScrollPosition() : null;
            return {element: element, position: Number.isFinite(value) ? value : null, left: element.scrollLeft || 0, top: element.scrollTop || 0};
        }
        function restoreScroll(value) {
            if (!value) return;
            if (value.position !== null && typeof value.element.scrollToPosition === 'function') value.element.scrollToPosition({position: value.position, behavior: 'instant'});
            else { value.element.scrollLeft = value.left; value.element.scrollTop = value.top; }
        }
        function rowBusy(row) {
            if (!row.status) return;
            if (row.rendered && !row.readCount) row.block.classList.add('hide');
            else row.block.classList.remove('hide');
            row.block.setAttribute('aria-busy', 'true');
            row.items.inert = true; row.allowed = false;
            // Keep same-identity artwork/card geometry; only volatile fields are stale.
            row.items.style.visibility = '';
            row.items.classList.add('eteHomeFlowPending');
            if (['onnow', 'activerecordings'].includes(row.section.SectionType)) row.items.classList.add('eteHomeFlowProgramPending');
            if (row.placeholder) row.placeholder.classList[row.rendered ? 'add' : 'remove']('hide');
            row.status.textContent = /^zh/i.test(locale.getCurrentLocale()) ? '正在更新…' : 'Updating…';
            row.status.classList.add('homeFlowStatus-loading');
            row.status.classList.remove('hide');
        }
        function unwatchClient() {
            if (!eventClient) return;
            events.off(eventClient, 'message', flowMessage);
            events.off(eventClient, 'websocketopen', flowChanged);
            events.off(eventClient, 'websocketclose', flowChanged); eventClient = null;
        }
        function watchClient(client) {
            if (!flowing || eventClient === client) return;
            unwatchClient(); eventClient = client;
            events.on(client, 'message', flowMessage);
            events.on(client, 'websocketopen', flowChanged);
            events.on(client, 'websocketclose', flowChanged);
        }
        function flowRetire() {
            if (disposed) return;
            unwatchClient(); clear(); loading.hide();
            focusedItemId = focusedTitleId = null; focusedSeeAll = false; flowFocus = null;
        }
        function flowMessage(event, message) {
            if (message && message.MessageType === 'UserPolicyUpdated') {
                // A policy change may revoke visibility even when the auth string is unchanged.
                clear(); flowChanged(); return;
            }
            if (message && ['UserDataChanged', 'LibraryChanged', 'UserUpdated', 'UserConfigurationUpdated', 'UserPolicyUpdated'].includes(message.MessageType)) flowChanged();
        }
        function flowChanged() {
            if (disposed) return;
            flowRevision++;
            flowRows.forEach(function(row) { rowBusy(row); });
            // Coalesce synchronous notifications. No polling or repeated retry:
            // normal GETs do not produce another invalidation event.
            if (!active || eventQueued === epoch) return;
            var queuedEpoch = epoch; eventQueued = queuedEpoch;
            Promise.resolve().then(function() {
                if (eventQueued === queuedEpoch) eventQueued = null;
                if (!active || disposed || epoch !== queuedEpoch) return;
                layoutCache.invalidate();
                return start({refresh: true});
            }).catch(function() {});
        }
        if (flowing) ['localusersignedin', 'localusersignedout', 'connected'].forEach(function(name) { events.on(connection, name, flowRetire); });
        function userMoved() { inputRevision++; if (flowFocus) { flowFocus.done = true; flowFocus.interacted = true; } }
        if (flowing) ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function(name) { owner.view.addEventListener(name, userMoved, {capture: true, passive: true}); });
        function waitForIdentity(value, deadline) {
            return new Promise(function(resolve, reject) {
                var timer, settled = false;
                function done(error, ticket) {
                    if (settled) return;
                    settled = true;
                    identityClock.clearTimeout(timer);
                    waits.delete(cancel);
                    if (error) reject(error); else resolve(ticket);
                }
                function cancel() { done(abort()); }
                function check() {
                    if (!activeEpoch(value)) return cancel();
                    if (identityClock.now() >= deadline) return done(new Error('Home identity unavailable'));
                    var ticket = identity(value);
                    var stable = ticket && current(ticket);
                    if (identityClock.now() >= deadline) return done(new Error('Home identity unavailable'));
                    if (stable) return done(null, ticket);
                    timer = identityClock.setTimeout(check, Math.min(100, deadline - identityClock.now()));
                }
                waits.add(cancel);
                check();
            });
        }
        function showError() {
            owner.sectionsRendered = false;
            var errorStage = newStage(), message = document.createElement('p');
            message.className = 'padded-left padded-right';
            var chinese = /^zh/i.test(locale.getCurrentLocale());
            message.textContent = chinese ? '首页暂时无法加载。' : 'Home could not be loaded.';
            errorStage.appendChild(message);
            attach(errorStage, 'error');
        }
        function wait(ticket, operation) {
            if (!current(ticket)) return Promise.reject(abort());
            return new Promise(function(resolve, reject) {
                var controller = new AbortController(), timer, settled = false;
                function done(error, value) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    waits.delete(cancel);
                    if (error) reject(error); else resolve(value);
                }
                function cancel() { done(abort()); controller.abort(); }
                waits.add(cancel);
                timer = setTimeout(function() { done(new Error('Home fallback timeout')); controller.abort(); }, 5000);
                Promise.resolve().then(function() {
                    if (!current(ticket) || controller.signal.aborted) throw abort();
                    return operation(controller.signal);
                }).then(function(value) { if (current(ticket)) done(null, value); else done(abort()); }, done);
            });
        }
        function clear() {
            epoch++;
            provider.cancel();
            cancelWaits();
            pauseItems(stage);
            stage = null;
            stageMode = null;
            if (owner.sectionsContainer) owner.sectionsContainer.replaceChildren();
            owner.sectionsRendered = false;
            committedTicket = null;
            flowRows = []; flowTicket = null; flowLayout = null; savedScroll = null; flowFocus = null;
        }
        function attach(next, mode) {
            pauseItems(stage);
            owner.sectionsContainer.replaceChildren(next);
            stage = next;
            stageMode = mode;
            stage.setAttribute('data-ete-home-source', mode);
        }
        function newStage() {
            var element = document.createElement('div');
            element.className = 'homeSectionsContainer';
            return element;
        }
        function ready(ticket, options) {
            if (!current(ticket)) return;
            owner.sectionsRendered = true;
            committedTicket = ticket;
            getItems(stage).forEach(function(items) { owner.addFocusBehavior(items); });
            var match = focusedItemId && Array.from(stage.querySelectorAll('[data-id]')).find(function(element) {
                return element.getAttribute('data-id') === focusedItemId;
            });
            var title = focusedTitleId && Array.from(stage.querySelectorAll('[data-ete-home-title]')).find(function(element) {
                return element.getAttribute('data-ete-home-title') === focusedTitleId;
            });
            if (title) {
                var seeAll = focusedSeeAll && title.querySelector('.sectionSeeAllButton');
                match = seeAll && !seeAll.classList.contains('hide') ? seeAll : title.querySelector('.sectionTitleTextButton') || match;
            }
            if (match && typeof focus.focus === 'function') focus.focus(match);
            else if (options.autoFocus) focus.autoFocus(owner.view);
        }
        async function fallback(ticket, options) {
            if (!current(ticket)) return {status: 'cancelled'};
            provider.cancel();
            var next = newStage();
            attach(next, 'legacy');
            var user = await wait(ticket, function(signal) { return ticket.client.getCurrentUser({signal: signal}); });
            if (!current(ticket) || stage !== next) return {status: 'cancelled'};
            await wait(ticket, function() { return legacy.loadSections(next, ticket.client, user); });
            if (!current(ticket) || stage !== next) return {status: 'cancelled'};
            ready(ticket, options);
            return {status: 'legacy'};
        }
        function render(next, sections, initial, ticket, options) {
            return sections.map(function(section, index) {
                var block = document.createElement('div');
                block.className = 'verticalSection verticalSection-cards focusable hide';
                block.setAttribute('data-focusabletype', 'nearest');
                block.innerHTML = '<h2 class="sectionTitle sectionTitle-cards padded-left padded-right"></h2>' +
                    '<div is="emby-scroller" data-mousewheel="false" data-centerfocus="true" class="padded-top-focusscale padded-bottom-focusscale padded-left padded-right">' +
                    '<div is="emby-itemscontainer" class="itemsContainer scrollSlider focuscontainer-x" data-virtualscrolllayout="horizontal-grid"></div></div>';
                var heading = block.querySelector('h2');
                heading.textContent = section.Name;
                if (!layoutManager.tv && section.ParentItem && navigation && typeof navigation.getRouteUrl === 'function') {
                    var target = navigation.getRouteUrl(section.ParentItem, {section: 'latest', serverId: ticket.server});
                    var prefix = section.ParentItem.CollectionType === 'movies' ? '/videos?' : '/tv?';
                    if (typeof target === 'string' && target.indexOf(prefix) === 0) {
                        var title = document.createElement('div'), link = document.createElement('a', {is: 'emby-sectiontitle'});
                        title.className = 'sectionTitleContainer sectionTitleContainer-cards padded-left padded-right';
                        title.setAttribute('data-ete-home-title', section.Id);
                        link.setAttribute('is', 'emby-sectiontitle');
                        link.classList.add('more', 'button-link', 'button-link-color-inherit', 'sectionTitleTextButton');
                        link.setAttribute('href', '.' + target);
                        heading.classList.remove('padded-left', 'padded-right');
                        block.replaceChild(title, heading);
                        link.appendChild(heading);
                        title.appendChild(link);
                        // The native title adds its own See All anchor. Guard both
                        // links while leaving active clicks/keyboard to its router.
                        title.addEventListener('click', function(event) {
                            if (!current(lease.ticket) || stage !== next || flowing && !lease.allowed) { event.preventDefault(); event.stopImmediatePropagation(); }
                        }, true);
                    }
                }
                var items = block.querySelector('.itemsContainer'), lease = {ticket: ticket, section: section, cached: initial[index], block: block, items: items};
                if (flowing) {
                    lease.results = new WeakMap();
                    lease.status = document.createElement('p'); lease.status.className = 'homeFlowStatus padded-left padded-right'; lease.status.setAttribute('data-home-flow-status', ''); lease.status.setAttribute('role', 'status');
                    block.appendChild(lease.status); flowRows.push(lease);
                    lease.placeholder = document.createElement('div'); lease.placeholder.className = 'homeFlowPlaceholder' + (layoutManager.tv ? ' itemsContainer-tv' : '');
                    lease.placeholder.setAttribute('aria-hidden', 'true');
                    var shape = listOptions(section, renderer).options;
                    shape = shape.shape === 'backdrop' || shape.preferThumb === true ? 'backdrop' : shape.defaultShape || 'portrait';
                    for (var placeholderIndex = 0; placeholderIndex < 6; placeholderIndex++) {
                        var card = document.createElement('div'), box = document.createElement('div'), padder = document.createElement('div');
                        card.className = 'card card-horiz ' + shape + 'Card-horiz'; box.className = 'cardBox';
                        padder.className = 'cardScalable cardPadder-' + shape + ' homeFlowPlaceholderImage';
                        box.appendChild(padder); card.appendChild(box); lease.placeholder.appendChild(card);
                    }
                    items.parentElement.appendChild(lease.placeholder);
                    items.eteHomeFlowOwns = function(result) { var bound = lease.results.get(result); return bound && current(bound.ticket) &&
                        bound.ticket === lease.ticket && bound.sequence === lease.readSequence && bound.work === lease.work && stage === next; };
                    items.eteHomeFlowCanRestore = function(result) { var bound = lease.results.get(result); return items.eteHomeFlowOwns(result) &&
                        bound.input === inputRevision && !(pending && flowFocus && flowFocus.interacted); };
                }
                items.setAttribute('data-monitor', section.Monitor.join(','));
                items.parentContainer = block;
                items.getListOptions = function() { return listOptions(lease.section, renderer); };
                items.fetchData = async function(query, signal) {
                    var ticket = lease.ticket, section = lease.section;
                    var sequence = lease.readSequence = (lease.readSequence || 0) + 1, work = lease.work, input = inputRevision;
                    function delivered(result) {
                        if (flowing) {
                            lease.results.set(result, {ticket: ticket, sequence: sequence, work: work, input: input});
                            if (lease.readSequence === sequence && lease.work === work) { lease.readSucceeded = true; if (start === 0) lease.readCount = result.Items.length; }
                        }
                        return result;
                    }
                    try {
                        if (!current(ticket) || stage !== next || signal && signal.aborted) throw abort();
                        query = query || {};
                        var start = query.StartIndex == null ? 0 : query.StartIndex, limit = query.Limit == null ? 12 : query.Limit;
                        if (lease.cached && start === 0 && limit === 12) {
                            var result = lease.cached;
                            lease.cached = null;
                            await Promise.resolve();
                            if (!current(ticket) || stage !== next || signal && signal.aborted) throw abort();
                            return delivered(result);
                        }
                        var response = await provider.loadItems(section, {startIndex: start, limit: limit, signal: signal});
                        if (!current(ticket) || stage !== next || signal && signal.aborted || response.status === 'cancelled') throw abort();
                        if (response.status !== 'server') {
                            if (flowing) throw new Error('Home section unavailable');
                            if (!ticket.fallback) ticket.fallback = fallback(ticket, options).catch(function() { return {status: 'error'}; });
                            await ticket.fallback;
                            throw abort();
                        }
                        return delivered(response.result);
                    } catch (error) {
                        if (flowing && lease.readSequence === sequence && lease.work === work) lease.readSucceeded = false;
                        throw error;
                    }
                };
                next.appendChild(block);
                return items;
            });
        }
        function revealRow(row) {
            row.items.style.visibility = ''; row.items.inert = false; row.allowed = true; row.rendered = true;
            row.items.classList.remove('eteHomeFlowPending'); row.items.classList.remove('eteHomeFlowProgramPending');
            row.block.setAttribute('aria-busy', 'false'); row.status.classList.add('hide');
            row.placeholder.classList.add('hide'); row.block.style.minHeight = '';
            if (!row.focusBound) { owner.addFocusBehavior(row.items); row.focusBound = true; }
        }
        function restoreFlowFocus(ticket) {
            if (!current(ticket) || !flowFocus || flowFocus.done) return;
            if (document.activeElement !== flowFocus.started && owner.view.contains(document.activeElement)) { flowFocus.done = true; return; }
            var match = focusedItemId && Array.from(stage.querySelectorAll('[data-id]')).find(function(element) { return element.getAttribute('data-id') === focusedItemId; });
            var title = focusedTitleId && Array.from(stage.querySelectorAll('[data-ete-home-title]')).find(function(element) { return element.getAttribute('data-ete-home-title') === focusedTitleId; });
            if (title) {
                var seeAll = focusedSeeAll && title.querySelector('.sectionSeeAllButton');
                match = seeAll && !seeAll.classList.contains('hide') ? seeAll : title.querySelector('.sectionTitleTextButton') || match;
            }
            if (match && !match.closest('[aria-busy="true"]')) {
                flowFocus.done = true; focus.focus(match); restoreScroll(savedScroll);
            } else if (!focusedItemId && !focusedTitleId && flowFocus.autoFocus) {
                flowFocus.done = true; focus.autoFocus(owner.view);
            }
        }
        async function updateRow(row, ticket, deferReveal) {
            var stamp = row.work = {};
            row.readSucceeded = false;
            try {
                await row.items.resume({refresh: true});
                if (!current(ticket) || row.ticket !== ticket || row.work !== stamp) return;
                // Native refreshItemsInternal deliberately consumes transport
                // failures; do not reveal retained content as a fresh success.
                if (!row.readSucceeded) throw new Error('Home section unavailable');
                row.failed = false;
                if (!deferReveal) revealRow(row);
                if (!flowFocus || !flowFocus.interacted) restoreScroll(row.scroll);
                if (!deferReveal) {
                    owner.sectionsRendered = true; committedTicket = ticket; loading.hide(); restoreFlowFocus(ticket);
                }
            } catch (_) {
                if (!current(ticket) || row.ticket !== ticket || row.work !== stamp) return;
                row.failed = true; row.items.inert = true;
                row.block.classList.remove('hide'); row.block.setAttribute('aria-busy', 'false');
                row.status.classList.remove('homeFlowStatus-loading');
                row.status.textContent = /^zh/i.test(locale.getCurrentLocale()) ? '此分区暂时无法加载。' : 'This section could not be loaded.';
                row.status.classList.remove('hide');
                var retry = document.createElement('button', {is: 'emby-button'});
                retry.setAttribute('type', 'button'); retry.classList.add('raised');
                retry.textContent = /^zh/i.test(locale.getCurrentLocale()) ? '重试' : 'Retry';
                retry.addEventListener('click', function() {
                    if (!current(ticket) || row.ticket !== ticket) return;
                    rowBusy(row); updateRow(row, ticket, false);
                });
                row.status.appendChild(retry);
            }
        }
        async function flowRefresh(options) {
            options = options || {};
            if (!active || disposed || !owner.view) return {status: 'cancelled'};
            var previous = flowTicket, candidate = identity(epoch);
            var reuse = stageMode === 'server' && sameIdentity(previous, candidate) && flowLayout !== null;
            if (!reuse) clear();
            else {
                epoch++; provider.cancel(); cancelWaits(); pauseItems(stage);
            }
            var loadEpoch = epoch, ticket = identity(epoch), deadline = identityClock.now() + 3000;
            flowFocus = {started: document.activeElement, autoFocus: options.autoFocus, done: false};
            if (reuse) {
                flowRows.forEach(function(row) { row.ticket = ticket; rowBusy(row); });
                restoreScroll(savedScroll); loading.hide();
            } else loading.show();
            try {
                if (!ticket || !current(ticket)) ticket = await waitForIdentity(epoch, deadline);
                if (!current(ticket)) return {status: 'cancelled'};
                watchClient(ticket.client); owner.apiClient = ticket.client;
                var result = await provider.loadSections({displayMode: layoutManager.tv ? 'tv' : 'mobile,desktop'});
                if (!current(ticket) || result.status === 'cancelled') return {status: 'cancelled'};
                if (result.status !== 'server' || result.sections.some(function(section) { return section.ViewType !== 'cards' ||
                    section.ScrollDirection !== 'Horizontal' || section.ImageType !== 'Primary' || section.CardSizeOffset !== 0; })) {
                    flowRows = []; flowLayout = null; flowTicket = null;
                    unwatchClient(); // Legacy refresh ownership remains with homesections/itemsrefresher.
                    return await fallback(ticket, options);
                }
                var signature = JSON.stringify(result.sections), keep = reuse && signature === flowLayout;
                if (!keep) {
                    flowRows = []; var next = newStage();
                    render(next, result.sections, [], ticket, options); attach(next, 'server');
                } else flowRows.forEach(function(row, index) { row.section = result.sections[index]; });
                flowTicket = ticket; flowLayout = signature;
                flowRows.forEach(function(row) { row.ticket = ticket; rowBusy(row); });
                var deferReveal = !keep && flowMode === 'retain';
                await Promise.all(flowRows.map(function(row) { return updateRow(row, ticket, deferReveal); }));
                if (!current(ticket)) return {status: 'cancelled'};
                if (deferReveal) flowRows.forEach(function(row) { if (!row.failed) revealRow(row); });
                owner.sectionsRendered = true; committedTicket = ticket; restoreFlowFocus(ticket);
                if (flowFocus && !flowFocus.done && !flowFocus.interacted && options.autoFocus) {
                    flowFocus.done = true; focus.autoFocus(owner.view);
                }
                if (!flowFocus || !flowFocus.interacted) restoreScroll(savedScroll);
                return {status: 'server', failedSections: flowRows.filter(function(row) { return row.failed; }).length};
            } catch (_) {
                if (!activeEpoch(loadEpoch)) return {status: 'cancelled'};
                clear(); showError(); loading.hide(); return {status: 'error'};
            } finally {
                if (activeEpoch(loadEpoch)) {
                    if (flowTicket && !sameScope(flowTicket, identity(epoch))) clear();
                    loading.hide();
                }
            }
        }
        async function refresh(options) {
            options = options || {};
            if (!active || disposed || !owner.view) return {status: 'cancelled'};
            clear();
            var loadEpoch = epoch, identityDeadline = identityClock.now() + 3000, ticket = identity(loadEpoch);
            loading.show();
            try {
                if (!ticket || !current(ticket) || identityClock.now() >= identityDeadline) ticket = await waitForIdentity(loadEpoch, identityDeadline);
            } catch (_) {
                if (!activeEpoch(loadEpoch)) return {status: 'cancelled'};
                showError();
                loading.hide();
                return {status: 'error'};
            }
            if (!current(ticket) || identityClock.now() >= identityDeadline) {
                if (!activeEpoch(loadEpoch)) return {status: 'cancelled'};
                showError();
                loading.hide();
                return {status: 'error'};
            }
            owner.apiClient = ticket.client;
            owner.sectionsRendered = false;
            provider.cancel();
            pauseItems(stage);
            try {
                var response = await provider.loadSections({displayMode: layoutManager.tv ? 'tv' : 'mobile,desktop'});
                if (!current(ticket)) return {status: 'cancelled'};
                if (response.status === 'cancelled') return {status: 'cancelled'};
                if (response.status !== 'server' || response.sections.some(function(section) {
                    return section.ViewType !== 'cards' || section.ScrollDirection !== 'Horizontal' ||
                        section.ImageType !== 'Primary' || section.CardSizeOffset !== 0;
                })) return await fallback(ticket, options);
                var initial = await Promise.all(response.sections.map(function(section) { return provider.loadItems(section, {limit: 12}); }));
                if (!current(ticket) || initial.some(function(result) { return result.status === 'cancelled'; })) return {status: 'cancelled'};
                if (initial.some(function(result) { return result.status !== 'server'; })) return await fallback(ticket, options);
                var next = newStage(), items = render(next, response.sections, initial.map(function(result) { return result.result; }), ticket, options);
                if (!current(ticket)) return {status: 'cancelled'};
                attach(next, 'server');
                // The inherited itemscontainer/refresh monitor starts paused.
                // Resume through its public lifecycle before requesting data.
                await Promise.all(items.map(function(item) { return item.resume({refresh: true}); }));
                if (ticket.fallback) return await ticket.fallback;
                if (!current(ticket)) return {status: 'cancelled'};
                ready(ticket, options);
                return {status: 'server'};
            } catch (_) {
                if (current(ticket) && stageMode !== 'legacy') {
                    try { return await fallback(ticket, options); } catch (_) { }
                }
                if (current(ticket)) {
                    // Leave a retryable, bounded error without exposing request details.
                    showError();
                }
                return {status: current(ticket) ? 'error' : 'cancelled'};
            } finally { if (current(ticket)) loading.hide(); }
        }
        function start(options) {
            var work = (flowing ? flowRefresh : refresh)(options), record = {promise: work, epoch: epoch};
            pending = record;
            function release() { if (pending === record) pending = null; }
            work.then(release, release);
            return work;
        }
        return {
            flowEnabled: flowing,
            canRestore: function() {
                return flowing && !disposed && !!owner.view && stageMode === 'server' && flowLayout !== null &&
                    sameIdentity(flowTicket, identity(epoch));
            },
            refresh: function(options) { layoutCache.invalidate(); return start(options); },
            resume: function(options) {
                options = options || {};
                if (disposed) return Promise.resolve({status: 'cancelled'});
                if (layoutCache.enabled) layoutCache.revalidate();
                if (active && !options.refresh) {
                    if (pending && pending.epoch === epoch) return pending.promise;
                    if (owner.sectionsRendered && (!layoutCache.enabled || committedTicket && current(committedTicket))) return Promise.resolve({status: stageMode});
                }
                active = true;
                if (options.refresh) layoutCache.invalidate();
                return start(options);
            },
            pause: function() {
                if (flowing) {
                    savedScroll = scrollState(owner.scroller || owner.view);
                    flowRows.forEach(function(row) {
                        row.scroll = scrollState(row.items.parentElement);
                        var height = row.block.getBoundingClientRect().height;
                        if (height > 0) row.block.style.minHeight = height + 'px';
                    });
                }
                var element = document.activeElement;
                if (element && stage && stage.contains(element)) {
                    var title = element.closest && element.closest('[data-ete-home-title]');
                    focusedTitleId = title ? title.getAttribute('data-ete-home-title') : null;
                    focusedSeeAll = !!(title && element.closest('.sectionSeeAllButton'));
                    if (title) focusedItemId = null;
                    else {
                        while (element && element !== stage && !element.getAttribute('data-id')) element = element.parentElement;
                        focusedItemId = element && element !== stage ? element.getAttribute('data-id') : null;
                    }
                }
                active = false;
                epoch++;
                provider.cancel();
                cancelWaits();
                pauseItems(stage);
                loading.hide();
            },
            clear: function() { layoutCache.invalidate(); clear(); },
            dispose: function() {
                disposed = true; active = false;
                if (flowing) {
                    unwatchClient();
                    ['localusersignedin', 'localusersignedout', 'connected'].forEach(function(name) { events.off(connection, name, flowRetire); });
                    if (owner.view) ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function(name) { owner.view.removeEventListener(name, userMoved, {capture: true}); });
                }
                clear(); provider.dispose(); layoutCache.dispose(); loading.hide();
            }
        };
    }
    return Object.freeze({create: create, listOptions: listOptions});
});
