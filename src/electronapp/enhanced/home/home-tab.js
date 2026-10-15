(function(factory) {
    if (typeof define === 'function') define(['exports', './server-sections.js', 'modules/cardbuilder/cardbuilder.js',
        'modules/layoutmanager.js', 'modules/common/globalize.js'], function(exports, provider, cards, layout, globalize) {
        exports.default = factory(provider.default, cards.default, layout.default, globalize.default);
    });
    else if (typeof module === 'object' && module.exports) module.exports = factory(require('./server-sections.js'));
})(function(serverSections, cards, layout, globalize) {
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
        var provider = serverSections.createProvider(function() { return connection.currentApiClient(); });
        var waits = new Set();
        var active = false, disposed = false, epoch = 0, stage = null, stageMode = null, pending = null;
        var focusedItemId = null;
        function current(ticket) {
            if (disposed || !active || ticket.epoch !== epoch || !owner.view) return false;
            try { return connection.currentApiClient() === ticket.client && ticket.client.serverId() === ticket.server && ticket.client.getCurrentUserId() === ticket.user; }
            catch (_) { return false; }
        }
        function getItems(root) { return root ? Array.from(root.querySelectorAll('.itemsContainer')) : []; }
        function pauseItems(root) { getItems(root).forEach(function(items) { if (typeof items.pause === 'function') items.pause(); }); }
        function cancelWaits() { Array.from(waits).forEach(function(cancel) { cancel(); }); }
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
            getItems(stage).forEach(function(items) { owner.addFocusBehavior(items); });
            var match = focusedItemId && Array.from(stage.querySelectorAll('[data-id]')).find(function(element) {
                return element.getAttribute('data-id') === focusedItemId;
            });
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
                block.querySelector('h2').textContent = section.Name;
                var items = block.querySelector('.itemsContainer'), cached = initial[index];
                items.setAttribute('data-monitor', section.Monitor.join(','));
                items.parentContainer = block;
                items.getListOptions = function() { return listOptions(section, renderer); };
                items.fetchData = async function(query, signal) {
                    if (!current(ticket) || stage !== next || signal && signal.aborted) throw abort();
                    query = query || {};
                    var start = query.StartIndex == null ? 0 : query.StartIndex, limit = query.Limit == null ? 12 : query.Limit;
                    if (cached && start === 0 && limit === 12) {
                        var result = cached;
                        cached = null;
                        await Promise.resolve();
                        if (!current(ticket) || stage !== next || signal && signal.aborted) throw abort();
                        return result;
                    }
                    var response = await provider.loadItems(section, {startIndex: start, limit: limit, signal: signal});
                    if (!current(ticket) || stage !== next || signal && signal.aborted || response.status === 'cancelled') throw abort();
                    if (response.status !== 'server') {
                        if (!ticket.fallback) ticket.fallback = fallback(ticket, options).catch(function() { return {status: 'error'}; });
                        await ticket.fallback;
                        throw abort();
                    }
                    return response.result;
                };
                next.appendChild(block);
                return items;
            });
        }
        async function refresh(options) {
            options = options || {};
            if (!active || disposed || !owner.view) return {status: 'cancelled'};
            clear();
            var client, ticket;
            try {
                client = connection.currentApiClient();
                if (!client) return {status: 'cancelled'};
                ticket = {epoch: epoch, client: client, server: client.serverId(), user: client.getCurrentUserId(), fallback: null};
            } catch (_) { return {status: 'cancelled'}; }
            owner.apiClient = client;
            owner.sectionsRendered = false;
            provider.cancel();
            pauseItems(stage);
            loading.show();
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
                    owner.sectionsRendered = false;
                    // Leave a retryable, bounded error without exposing request details.
                    var errorStage = newStage(), message = document.createElement('p');
                    message.className = 'padded-left padded-right';
                    message.textContent = /^zh/i.test(locale.getCurrentLocale()) ? '首页暂时无法加载，请重新进入重试。' : 'Home could not be loaded. Please reopen it to retry.';
                    errorStage.appendChild(message);
                    attach(errorStage, 'error');
                }
                return {status: current(ticket) ? 'error' : 'cancelled'};
            } finally { if (current(ticket)) loading.hide(); }
        }
        return {
            refresh: function(options) { pending = refresh(options); return pending; },
            resume: function(options) {
                options = options || {};
                if (disposed) return Promise.resolve({status: 'cancelled'});
                if (active && !options.refresh) return pending || Promise.resolve();
                active = true;
                pending = refresh(options);
                return pending;
            },
            pause: function() {
                var element = document.activeElement;
                if (element && stage && stage.contains(element)) {
                    while (element && element !== stage && !element.getAttribute('data-id')) element = element.parentElement;
                    focusedItemId = element && element !== stage ? element.getAttribute('data-id') : null;
                }
                active = false;
                epoch++;
                provider.cancel();
                cancelWaits();
                pauseItems(stage);
                loading.hide();
            },
            clear: clear,
            dispose: function() { disposed = true; active = false; clear(); provider.dispose(); loading.hide(); }
        };
    }
    return Object.freeze({create: create, listOptions: listOptions});
});
