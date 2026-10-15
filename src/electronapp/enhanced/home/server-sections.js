(function(factory) {
    if (typeof define === 'function') define(['exports'], function(exports) { exports.default = factory(); });
    else if (typeof module === 'object' && module.exports) module.exports = factory();
})(function() {
    'use strict';
    var minimumVersion = '4.10.0.4';
    var types = ['userviews', 'resume', 'resumeaudio', 'nextup', 'latestmedia', 'latestmoviereleases',
        'playlists', 'collections', 'activerecordings', 'onnow'];
    var views = ['cards', 'buttons', 'list', 'spotlight'];
    var imageTypes = ['Primary', 'Backdrop', 'Thumb'];
    var monitors = ['videoplayback', 'audioplayback', 'markplayed', 'Recordings', 'Timers'];
    var collectionTypes = ['movies', 'tvshows', 'music', 'audiobooks', 'livetv', 'mixed', 'boxsets', 'playlists', 'channels', 'homevideos', 'photos'];
    function text(value, max, empty) {
        return typeof value === 'string' && (empty || value.length > 0) && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
    }
    function plain(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
    function supportedVersion(value) {
        if (typeof value !== 'string' || !/^\d{1,5}(?:\.\d{1,5}){2,3}$/.test(value)) return false;
        var actual = value.split('.').map(Number), minimum = minimumVersion.split('.').map(Number);
        for (var i = 0; i < 4; i++) {
            if ((actual[i] || 0) > minimum[i]) return true;
            if ((actual[i] || 0) < minimum[i]) return false;
        }
        return true;
    }
    // Project only display data. QueryOptions, Href, HTML, header commands and
    // server-supplied fetch paths never cross this adapter boundary.
    function prepareSections(input) {
        if (!Array.isArray(input) || input.length > 64) throw new Error('sections-invalid');
        var ids = new Set();
        return input.map(function(row) {
            if (!plain(row) || !text(row.Id, 256, false) || ['.', '..'].includes(row.Id) || ids.has(row.Id) || !types.includes(row.SectionType) ||
                !text(row.Name, 256, true) || row.Subtitle != null && !text(row.Subtitle, 1024, true) ||
                row.ViewType != null && !views.includes(row.ViewType) ||
                row.ScrollDirection != null && !['Horizontal', 'Vertical'].includes(row.ScrollDirection) ||
                row.ImageType != null && !imageTypes.includes(row.ImageType) ||
                row.CollectionType != null && row.CollectionType !== '' && !collectionTypes.includes(row.CollectionType) ||
                row.CardSizeOffset != null && (!Number.isInteger(row.CardSizeOffset) || row.CardSizeOffset < -3 || row.CardSizeOffset > 3) ||
                row.Monitor != null && (!Array.isArray(row.Monitor) || row.Monitor.length > 8 || row.Monitor.some(function(value) { return !monitors.includes(value); })) ||
                row.RandomSeed != null && (!Number.isSafeInteger(row.RandomSeed) || row.RandomSeed < 1 || row.RandomSeed > 10000000) ||
                row.HeaderButtons != null && (!Array.isArray(row.HeaderButtons) || row.HeaderButtons.length)) throw new Error('sections-unsupported');
            ids.add(row.Id);
            return Object.freeze({Id: row.Id, SectionType: row.SectionType, Name: row.Name, Subtitle: row.Subtitle || '',
                ViewType: row.ViewType || 'cards', ScrollDirection: row.ScrollDirection || 'Horizontal',
                ImageType: row.ImageType || 'Primary', RandomSeed: row.RandomSeed || null,
                CollectionType: row.CollectionType || '', CardSizeOffset: row.CardSizeOffset || 0,
                Monitor: Object.freeze((row.Monitor || []).slice())});
        });
    }
    function createProvider(getCurrentClient, options) {
        options = options || {};
        var timeoutMs = options.timeoutMs == null ? 5000 : options.timeoutMs;
        if (typeof getCurrentClient !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) throw new Error('home-options-invalid');
        var epoch = 0, disposed = false, pending = new Set(), sectionOwners = new WeakMap();
        function cancel() {
            epoch++;
            pending.forEach(function(request) { request.abort(); });
            pending.clear();
        }
        function owner() {
            var client = getCurrentClient();
            if (!client || typeof client.getJSON !== 'function' || typeof client.getUrl !== 'function' ||
                typeof client.getCurrentUserId !== 'function' || typeof client.serverId !== 'function' || typeof client.serverVersion !== 'function') return null;
            var userId = client.getCurrentUserId(), serverId = client.serverId();
            if (!text(userId, 256, false) || ['.', '..'].includes(userId) || !text(serverId, 256, false)) return null;
            return {client: client, userId: userId, serverId: serverId, epoch: epoch};
        }
        function current(bound) {
            if (disposed || !bound || bound.epoch !== epoch) return false;
            try {
                return getCurrentClient() === bound.client && bound.client.getCurrentUserId() === bound.userId && bound.client.serverId() === bound.serverId;
            } catch (_) { return false; }
        }
        function cancelled() { var error = new Error('home-cancelled'); error.code = 'home-cancelled'; return error; }
        function read(bound, route, query, externalSignal) {
            if (!current(bound) || externalSignal && externalSignal.aborted) return Promise.reject(cancelled());
            var controller = new AbortController(), timer, finish, settled = false;
            var request = {abort: function() { if (finish) finish(cancelled()); controller.abort(); }};
            return new Promise(function(resolve, reject) {
                function done(error, data) {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    if (externalSignal) externalSignal.removeEventListener('abort', request.abort);
                    pending.delete(request);
                    if (error) reject(error); else resolve(data);
                }
                finish = function(error) { done(error); };
                pending.add(request);
                if (externalSignal) externalSignal.addEventListener('abort', request.abort, {once: true});
                timer = setTimeout(function() { var error = new Error('home-timeout'); error.code = 'home-timeout'; done(error); controller.abort(); }, timeoutMs);
                Promise.resolve().then(function() {
                    if (!current(bound) || controller.signal.aborted || settled) throw cancelled();
                    // getJSON owns existing authentication and explicitly performs GET.
                    return bound.client.getJSON(bound.client.getUrl(route, query), controller.signal);
                }).then(function(data) { if (!current(bound)) done(cancelled()); else done(null, data); }, done);
            });
        }
        function failure(error, bound) {
            if (!current(bound) || error && error.code === 'home-cancelled') return {status: 'cancelled'};
            return {status: 'fallback', reason: error && error.code === 'home-timeout' ? 'timeout' : 'request-or-schema-failed'};
        }
        async function loadSections(settings) {
            settings = settings || {};
            cancel();
            if (disposed || settings.signal && settings.signal.aborted) return {status: 'cancelled'};
            var bound;
            try {
                bound = owner();
                if (!bound || !supportedVersion(bound.client.serverVersion())) return {status: 'fallback', reason: 'unsupported-server'};
                if (!['tv', 'mobile,desktop'].includes(settings.displayMode)) return {status: 'fallback', reason: 'display-mode-invalid'};
                var data = await read(bound, 'Users/' + encodeURIComponent(bound.userId) + '/HomeSections', {displayMode: settings.displayMode}, settings.signal);
                var sections = prepareSections(data);
                if (!current(bound) || settings.signal && settings.signal.aborted) return {status: 'cancelled'};
                sections.forEach(function(section) {
                    sectionOwners.set(section, {bound: bound, seed: section.RandomSeed || Math.floor(Math.random() * 10000000) + 1});
                });
                // An explicit empty array is an intentional empty server layout.
                return {status: 'server', sections: sections};
            } catch (error) { return failure(error, bound); }
        }
        async function loadItems(section, settings) {
            settings = settings || {};
            var record = section && typeof section === 'object' ? sectionOwners.get(section) : null;
            if (!record || !current(record.bound) || settings.signal && settings.signal.aborted) return {status: 'cancelled'};
            var start = settings.startIndex == null ? 0 : settings.startIndex;
            var limit = settings.limit == null ? 24 : settings.limit;
            if (!Number.isSafeInteger(start) || start < 0 || start > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) return {status: 'fallback', reason: 'paging-invalid'};
            try {
                var data = await read(record.bound, 'Users/' + encodeURIComponent(record.bound.userId) + '/Sections/' + encodeURIComponent(section.Id) + '/Items', {
                    Fields: 'BasicSyncInfo,CanDelete,Container,PrimaryImageAspectRatio,ProductionYear', ImageTypeLimit: 1,
                    EnableImageTypes: 'Primary,Backdrop,Thumb', StartIndex: start, Limit: limit, RandomSeed: record.seed
                }, settings.signal);
                if (!plain(data) || !Array.isArray(data.Items) || data.Items.length > limit ||
                    data.Items.some(function(item) { return !plain(item) || !text(item.Id, 256, false) || item.ServerId != null && item.ServerId !== record.bound.serverId; }) ||
                    data.TotalRecordCount != null && (!Number.isSafeInteger(data.TotalRecordCount) || data.TotalRecordCount < 0)) throw new Error('items-invalid');
                if (!current(record.bound) || settings.signal && settings.signal.aborted) return {status: 'cancelled'};
                // Items stay ordinary Emby DTOs for the existing CardBuilder and
                // PlaybackManager. This module creates no playback identity.
                return {status: 'server', result: {Items: data.Items, TotalRecordCount: data.TotalRecordCount == null ? data.Items.length : data.TotalRecordCount}};
            } catch (error) { return failure(error, record.bound); }
        }
        return Object.freeze({loadSections: loadSections, loadItems: loadItems, cancel: cancel,
            dispose: function() { disposed = true; cancel(); }});
    }
    return Object.freeze({createProvider: createProvider, prepareSections: prepareSections, supportedVersion: supportedVersion});
});
