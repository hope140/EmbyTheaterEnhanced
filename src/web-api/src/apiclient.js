/* Copyright (c) Emby https://emby.media
 * Independent behavior-contract adaptations, 2026. MIT; see ../LICENSE.md.
 * Input identities and limits are recorded in src/web-api/selection.json. */
import BaseApiClient from './mit-apiclient.js';
import events from './events.js';
import transport from './transport.js';

const id = value => encodeURIComponent(value);
const ids = items => items.map(item => item.Id);
const empty = () => ({ Items: [], TotalRecordCount: 0 });
const page = (items, query = {}) => {
    const start = Number(query.StartIndex) || 0;
    return { Items: query.Limit > 0 ? items.slice(start, start + Number(query.Limit)) : items.slice(start),
        TotalRecordCount: items.length };
};
const userKey = (userId, serverId) => `user-${userId}-${serverId}`;

class ApiClient extends BaseApiClient {
    getCurrentLocale() { return this._currentLocale; }
    setCurrentLocale(value) { this._currentLocale = value; }
    getUrl(name, params, serverAddress) {
        return super.getUrl(name, params, (serverAddress || this.serverAddress()).replace(/\/+$/, ''));
    }

    setSystemInfo(info) {
        super.setSystemInfo(info);
        this._queryStringAuth = true;
    }

    setAuthorizationInfoIntoRequest(request, includeAccessToken) {
        super.setAuthorizationInfoIntoRequest(request, includeAccessToken);
        const locale = this.getCurrentLocale();
        if (locale !== undefined && locale !== null && locale !== '') {
            if (this._queryStringAuth) request.url += `${request.url.includes('?') ? '&' : '?'}X-Emby-Language=${encodeURIComponent(locale)}`;
            else request.headers['X-Emby-Language'] = locale;
        }
    }

    fetch(request, includeAccessToken, signal) {
        if (!request) throw new Error('Request cannot be null');
        signal ||= request.signal;
        if (signal?.aborted) return Promise.reject(transport.abortError());
        request.headers ||= {};
        if (this.isMinServerVersion('4.7.0.33') && request.contentType?.toLowerCase().startsWith('application/json')) {
            request.contentType = 'text/plain';
            request.url += `${request.url.includes('?') ? '&' : '?'}reqformat=json`;
        }
        this.setAuthorizationInfoIntoRequest(request, includeAccessToken);
        if (this.enableAutomaticNetworking === false || request.type !== 'GET') return transport.send(request, signal);
        return this.fetchWithFailover(request, true, signal);
    }

    // Retain the public ThumbnailSet contract and legacy no-thumbnails result.
    getThumbnails(itemId, options, signal) {
        if (!this.isMinServerVersion('4.1.0.26')) return Promise.resolve({ Thumbnails: [] });
        return this.getJSON(this.getUrl(`Items/${id(itemId)}/ThumbnailSet`, options), signal);
    }

    ajax(request, includeAccessToken) { return this.fetch(request, includeAccessToken, request?.signal); }

    fetchWithFailover(request, reconnect, signal) {
        if (signal?.aborted) return Promise.reject(transport.abortError());
        request.timeout = 30000;
        return transport.send(request, signal).then(result => { this.connected = true; return result; }, error => {
            if (signal?.aborted || !transport.isNetworkError(error) || error?.status || !reconnect) throw error;
            const previous = this.serverAddress();
            return this.reconnectTest(signal).then(address => {
                if (signal?.aborted) throw transport.abortError();
                request.url = request.url.replace(previous, address);
                if (this.enableWebSocketAutoConnect) this.ensureWebSocket();
                return this.fetchWithFailover(request, false, signal);
            });
        });
    }

    reconnectTest(signal) {
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) controller.abort();
        (this._reconnectControllers ||= new Set()).add(controller);
        const attempt = count => transport.probe(this.serverInfo(), url => this.getUrl('system/info/public', null, url),
            this.rejectInsecureAddresses, controller.signal).catch(error => {
            if (controller.signal.aborted || count >= 2) throw error;
            return transport.delay(500, controller.signal).then(() => attempt(count + 1));
        });
        return attempt(0).then(result => {
            if (controller.signal.aborted) throw transport.abortError();
            this.serverAddress(result.url); this.connected = true; return result.url;
        }).finally(() => {
            signal?.removeEventListener('abort', abort); this._reconnectControllers.delete(controller);
        });
    }

    _retireReconnects() {
        for (const controller of this._reconnectControllers || []) controller.abort();
    }
    onNetworkChanged() {
        this._retireReconnects();
        return super.onNetworkChanged();
    }
    logout() {
        this._retireReconnects();
        this._cancelSocketReconnect();
        return super.logout();
    }

    setAuthenticationInfo(token, userId) {
        if (this.accessToken() !== token || this.getCurrentUserId() !== userId) {
            this._identityEpoch = (this._identityEpoch || 0) + 1;
            this._retireReconnects();
            if (!token || !userId) this._cancelSocketReconnect();
        }
        return super.setAuthenticationInfo(token, userId);
    }

    serverInfo(info) {
        if (info && (info.Id !== this._serverInfo?.Id || info.UserId !== this._serverInfo?.UserId ||
            info.AccessToken !== this._serverInfo?.AccessToken)) {
            this._identityEpoch = (this._identityEpoch || 0) + 1;
            this._retireReconnects();
        }
        return super.serverInfo(info);
    }

    getCurrentUserCached() {
        const userId = this.getCurrentUserId(), serverId = this.serverId();
        if (!userId || !serverId) return null;
        const text = this.appStorage.getItem(userKey(userId, serverId));
        if (!text) return null;
        const user = JSON.parse(text);
        if (!user || user.Id !== userId || user.ServerId !== serverId) return null;
        user.Type = 'User'; return user;
    }

    getUser(userId, enableCache, signal) {
        if (!userId) throw new Error('Must supply a userId');
        const serverId = this.serverId(), epoch = this._identityEpoch || 0;
        const read = () => {
            if (!serverId) return null;
            const text = this.appStorage.getItem(userKey(userId, serverId));
            const user = text ? JSON.parse(text) : null;
            if (user && user.Id === userId && user.ServerId === serverId) { user.Type = 'User'; return user; }
            return null;
        };
        const cached = enableCache !== false ? read() : null;
        if (cached && Date.now() - (cached.DateLastFetched || 0) <= 60000) return Promise.resolve(cached);
        const pending = this.getJSON(this.getUrl(`Users/${id(userId)}`), signal).then(user => {
            user.Type = 'User';
            if (serverId === this.serverId() && epoch === (this._identityEpoch || 0) &&
                (!user.ServerId || user.ServerId === serverId) && user.Id === userId && !signal?.aborted) {
                user.ServerId = serverId; user.DateLastFetched = Date.now();
                this.appStorage.setItem(userKey(userId, serverId), JSON.stringify(user));
            }
            return user;
        }, error => {
            if (!signal?.aborted && !error?.status && this.accessToken() &&
                serverId === this.serverId() && epoch === (this._identityEpoch || 0)) {
                const fallback = read(); if (fallback) return fallback;
            }
            throw error;
        });
        if (cached) { pending.catch(() => {}); return Promise.resolve(cached); }
        return pending;
    }

    getUsersQueryResult(query, signal) {
        return this.getJSON(this.getUrl('Users/Query', query), signal).then(result => {
            result.Items.forEach(user => { user.Type = 'User'; }); return result;
        });
    }
    getUsers(query, signal) { return this.getUsersQueryResult(query, signal).then(result => result.Items); }
    getPublicUsersQueryResult(query, signal) {
        return this.fetch({ type: 'GET', url: this.getUrl('users/public'), dataType: 'json' }, false, signal)
            .then(users => { users.forEach(user => { user.Type = 'User'; }); return page(users, query); });
    }
    getPublicUsers(query, signal) { return this.getPublicUsersQueryResult(query, signal).then(result => result.Items); }
    _prefixes(path, query, signal) {
        return this.getJSON(this.getUrl(path, query), signal).then(result => {
            if ((query?.Descending || query?.SortOrder === 'Descending') && !this.isMinServerVersion('4.7.0.19')) result.reverse();
            return result;
        });
    }
    getUserPrefixes(query, signal) { return this._prefixes('Users/Prefixes', query, signal); }

    getItemTypes(userId, options = {}) {
        options.userId = userId;
        return this.getJSON(this.getUrl('ItemTypes', options));
    }
    getSearchResults(options = {}) {
        const userId = this.getCurrentUserId();
        if (!options.SearchTerm) return Promise.resolve({ ...empty(), ItemTypes: [] });
        const items = this.getItems(userId, options);
        const types = !options.StartIndex && !options.IncludeItemTypes && options.IncludeSearchTypes !== false ?
            this.getItemTypes(userId, options) : Promise.resolve(null);
        return Promise.all([items, types]).then(([result, itemTypes]) => {
            if (itemTypes !== null) result.ItemTypes = Array.isArray(itemTypes) ? itemTypes : itemTypes.Items;
            return result;
        });
    }

    _message(MessageType, Data) { events.trigger(this, 'message', [{ MessageType, Data }]); }
    _libraryChanged(items) {
        this._userViewsPromise = null;
        this._message('LibraryChanged', { ItemsAdded: [], ItemsRemoved: ids(items), ItemsUpdated: [],
            FoldersRemovedFrom: items.map(item => item.ParentId).filter(Boolean), IsLocalEvent: true });
    }
    _itemsUpdated(itemIds) {
        this._userViewsPromise = null;
        this._message('LibraryChanged', { ItemsAdded: [], ItemsRemoved: [], ItemsUpdated: itemIds, IsLocalEvent: true });
    }
    _request(type, path, query, data, json = false) {
        return this.ajax({ type, url: this.getUrl(path, query),
            ...(data !== undefined ? { data: JSON.stringify(data), contentType: 'application/json' } : {}),
            ...(json ? { dataType: 'json' } : {}) });
    }
    _delete(path, query) {
        return this._request(this.isMinServerVersion('4.7.0.33') ? 'POST' : 'DELETE',
            path + (this.isMinServerVersion('4.7.0.33') ? '/Delete' : ''), query);
    }
    // The Web delete helper supplies the item DTO, not the MIT base's scalar ID.
    deleteItem(item) {
        if (!item || !item.Id) throw new Error('null itemId');
        return this._delete(`Items/${id(item.Id)}`).then(result => {
            this._libraryChanged([item]); return result;
        });
    }
    deleteItems(items) {
        const operation = this.isMinServerVersion('4.7.0.33') ?
            this._request('POST', 'Items/Delete', { Ids: ids(items).join(',') }) :
            Promise.all(items.map(item => this._request('DELETE', `Items/${id(item.Id)}`)));
        return operation.then(result => { this._libraryChanged(items); return result; });
    }
    deleteUserSingle(userId) {
        const serverId = this.serverId();
        return this._delete(`Users/${id(userId)}`).then(result => {
            this.appStorage.removeItem(userKey(userId, serverId)); this._userViewsPromise = null; return result;
        });
    }
    deleteDeviceSingle(deviceId) { return this._delete('Devices', { Id: deviceId }); }
    deleteDevice(deviceId) { return this.deleteDeviceSingle(deviceId); }
    uninstallPluginSingle(pluginId) { return this._delete(`Plugins/${id(pluginId)}`); }
    _batch(items, method, event) {
        return Promise.all(items.map(item => this[method](item.Id))).then(result => {
            this._message(event, { Ids: [], IsLocalEvent: true }); return result;
        });
    }
    deleteUsers(items) { return this._batch(items, 'deleteUserSingle', 'UsersDeleted'); }
    deleteDevices(items) { return this._batch(items, 'deleteDeviceSingle', 'DevicesDeleted'); }
    uninstallPlugins(items) { return this._batch(items, 'uninstallPluginSingle', 'PluginsUninstalled'); }

    getTunerHostConfiguration(tunerId) {
        return this.getNamedConfiguration('livetv').then(config => config.TunerHosts?.find(host => host.Id === tunerId));
    }
    saveTunerHostConfiguration(configuration) { return this._request('POST', 'LiveTv/TunerHosts', null, configuration, true); }
    deleteLiveTVGuideSource(guideId) { return this._delete('LiveTv/ListingProviders', { Id: guideId }); }
    deleteLiveTVTunerDevice(tunerId) { return this._delete('LiveTv/TunerHosts', { Id: tunerId }); }
    getLiveTvChannelsForManagement(query) { return this.getJSON(this.getUrl('LiveTv/Manage/Channels', query)); }
    setChannelDisabled(item, disabled) {
        return this.ajax({ type: 'POST', url: this.getUrl(`LiveTv/Manage/Channels/${id(item.Id)}/Disabled`,
            { ManagementId: item.ManagementId, Disabled: disabled }), contentType: 'application/json', dataType: 'json' }).then(channel => {
            this._message('ChannelManagementInfoUpdated', { Channel: channel, Id: item.Id, IsLocalEvent: true }); return channel;
        });
    }
    setChannelSortIndex(item, newIndex) {
        return this._request('POST', `LiveTv/Manage/Channels/${id(item.Id)}/SortIndex`,
            { ManagementId: item.ManagementId, NewIndex: newIndex }).then(result => {
            this._message('ChannelManagementInfoUpdated', { Id: item.Id, IsLocalEvent: true }); return result;
        });
    }
    getLiveTvChannelTags(options = {}, signal) {
        options.UserId = this.getCurrentUserId();
        return this.getJSON(this.getUrl('LiveTv/ChannelTags', options), signal).then(result => {
            if (!this.isMinServerVersion('4.7.0.31')) {
                if (options.OuterIds) {
                    const outerIds = Array.isArray(options.OuterIds) ? options.OuterIds : String(options.OuterIds).split(',');
                    result.Items = result.Items.filter(item => outerIds.includes(item.Id));
                }
                if (!result.TotalRecordCount && options.EnableTotalRecordCount !== false) result.TotalRecordCount = result.Items.length;
            }
            return result;
        });
    }
    getLiveTvChannelTagPrefixes(options = {}, signal) {
        options.UserId = this.getCurrentUserId();
        return this._prefixes('LiveTv/ChannelTags/Prefixes', options, signal);
    }

    getScaledImageUrl(itemId, options) { return this.getImageUrl(itemId, options); }
    getLogoImageUrl(item, options = {}, imageTypes = ['LogoLightColor', 'LogoLight', 'Logo']) {
        for (const type of imageTypes) {
            if (item.ImageTags?.[type]) {
                options.type = type; options.tag = item.ImageTags[type]; return this.getScaledImageUrl(item.Id, options);
            }
        }
        for (const type of imageTypes) {
            const parentId = item[`Parent${type}ItemId`], tag = item[`Parent${type}ImageTag`];
            if (parentId && tag) { options.type = type; options.tag = tag; return this.getScaledImageUrl(parentId, options); }
        }
        if ((item.Type === 'TvChannel' || item.Type === 'ChannelManagementInfo') && item.ImageTags?.Primary) {
            options.type = 'Primary'; options.tag = item.ImageTags.Primary; return this.getScaledImageUrl(item.Id, options);
        }
        return null;
    }

    createList(userId, type, name, addIds) {
        return this._request('POST', type === 'BoxSet' || type === 'Collection' ? 'Collections' : 'Playlists',
            { Name: name, Ids: addIds.join(','), userId }, undefined, true);
    }
    addToList(userId, type, listId, addIds) {
        return this._request('POST', `${type === 'BoxSet' || type === 'Collection' ? 'Collections' : 'Playlists'}/${id(listId)}/Items`,
            { Ids: addIds.join(','), userId });
    }
    removeItemsFromCollection(collectionId, items) {
        const itemIds = ids(items);
        return this._delete(`Collections/${id(collectionId)}/Items`, { Ids: itemIds.join(',') }).then(result => {
            this._message('ItemsRemovedFromCollection', { CollectionId: collectionId, ItemIds: itemIds, IsLocalEvent: true }); return result;
        });
    }
    removeItemsFromPlaylist(playlistId, items) {
        const entryIds = items.map(item => item.PlaylistItemId);
        return this._delete(`Playlists/${id(playlistId)}/Items`, { EntryIds: entryIds.join(',') }).then(result => {
            this._message('ItemsRemovedFromPlaylist', { PlaylistId: playlistId, PlaylistItemIds: entryIds, IsLocalEvent: true }); return result;
        });
    }
    getAllTrailers(query = {}, item) {
        const local = query.LocalTrailers !== false ? this.getLocalTrailers(this.getCurrentUserId(), item.Id) : Promise.resolve([]);
        return local.then(trailers => {
            const remote = query.RemoteTrailers !== false ? item.RemoteTrailers || [] : [];
            const total = trailers.length + remote.length;
            const localCount = trailers.length;
            for (const result of [...trailers, ...remote]) {
                result.Name ||= `Trailer: ${item.Name}`; result.Type ||= 'Trailer'; result.MediaType ||= 'Video';
                result.ServerId ||= item.ServerId;
                const streams = result.MediaStreams || result.MediaSources?.[0]?.MediaStreams ||
                    item.MediaSources?.[0]?.MediaStreams || item.MediaStreams;
                const stream = streams?.find(stream => stream.Type === 'Video');
                result.PrimaryImageAspectRatio ||= stream?.Width && stream?.Height ? stream.Width / stream.Height : item.PrimaryImageAspectRatio;
                if (!result.ImageTags?.Thumb && !result.ParentThumbImageTag) {
                    result.ParentThumbItemId = item.ImageTags?.Thumb ? item.Id : item.ParentThumbItemId;
                    result.ParentThumbImageTag = item.ImageTags?.Thumb || item.ParentThumbImageTag;
                }
                if (!result.ParentBackdropImageTags?.length) {
                    result.ParentBackdropItemId = item.Id; result.ParentBackdropImageTags = item.BackdropImageTags;
                }
            }
            const start = Number(query.StartIndex) || 0;
            // Local responses are an observable mutable queue, while remote objects
            // retain their caller-owned identities. Count before consuming the page.
            if (start) trailers.splice(0, Math.min(start, localCount));
            const remaining = trailers.concat(remote.slice(Math.max(0, start - localCount)));
            return { Items: query.Limit > 0 ? remaining.slice(0, Number(query.Limit)) : remaining, TotalRecordCount: total };
        });
    }
    getNextUpAudioBookItems(options, signal) {
        return this.isMinServerVersion('4.7.0.15') ? this.getJSON(this.getUrl('AudioBooks/NextUp', options), signal) : Promise.resolve(empty());
    }
    getConfigurationPages(options = {}, signal) {
        const query = { PageType: 'PluginConfiguration', UserId: this.getCurrentUserId(), ...options };
        return query.EnableInUserMenu === true && !this.isMinServerVersion('4.8.0.20') ? Promise.resolve([]) :
            this.getJSON(this.getUrl('web/configurationpages', query), signal);
    }
    getDevices(query) {
        return this.getJSON(this.getUrl('Devices', query)).then(result => {
            result.Items.forEach(device => {
                device.Type = 'Device'; device.ServerId = this.serverId(); device.PrimaryImageAspectRatio = 1;
                device.ImageUrl = device.IconUrl && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(device.IconUrl) ? this.getUrl(device.IconUrl) : device.IconUrl;
            }); return result;
        });
    }
    getFeatures(query) { return this.isMinServerVersion('4.8.0.20') ? this.getJSON(this.getUrl('Features', query)) : Promise.resolve([]); }
    getToneMapOptions() { return this.getJSON(this.getUrl('Encoding/ToneMapOptions')); }
    cancelSyncJob(jobId) { return this._delete(`Sync/Jobs/${id(jobId)}`); }
    cancelSyncJobItem(jobItemId) { return this._delete(`Sync/JobItems/${id(jobItemId)}`); }
    cancelSyncItems(itemIds, targetId) {
        if (!itemIds) throw new Error('null itemIds');
        return this._delete(`Sync/${id(targetId || this.deviceId())}/Items`, { ItemIds: itemIds.join(',') });
    }
    clearUserTrackSelections(userId, type) {
        const serverId = this.serverId();
        return this._delete(`Users/${id(userId)}/TrackSelections/${id(type)}`).then(result => {
            this.appStorage.removeItem(userKey(userId, serverId)); return result;
        });
    }
    deleteApiKey(token) { return this._delete(`Auth/Keys/${id(token)}`); }
    deleteSubtitles(itemId, mediaSourceId, index) {
        return this._delete(`Videos/${id(itemId)}/Subtitles/${id(index)}`, { MediaSourceId: mediaSourceId }).then(result => {
            this._itemsUpdated([itemId]); return result;
        });
    }
    mergeVersions(items) {
        return this._request('POST', 'Videos/MergeVersions', { Ids: ids(items).join(',') }).then(result => {
            this._message('ItemsMerged', { Items: ids(items), IsLocalEvent: true }); return result;
        });
    }
    ungroupVersions(itemId) {
        return this._delete(`Videos/${id(itemId)}/AlternateSources`).then(result => {
            this._message('ItemsSplit', { Items: [itemId], IsLocalEvent: true }); return result;
        });
    }
    removeEmbyConnectLink(userId) { return this._delete(`Users/${id(userId)}/Connect/Link`); }
    updateHideFromResume(itemId, hide) {
        if (!itemId) throw new Error('null itemId');
        const userId = this.getCurrentUserId();
        return this._request('POST', `Users/${id(userId)}/Items/${id(itemId)}/HideFromResume`, { Hide: hide !== false }, undefined, true)
            .then(userData => { userData.ItemId = itemId;
                this._message('UserDataChanged', { UserId: userId, UserDataList: [userData], IsLocalEvent: true }); return userData; });
    }
    updateItemImageFromUrl(itemId, imageType, index, url) {
        return this._request('POST', `Items/${id(itemId)}/Images/${id(imageType)}/${index ?? 0}/Url`, null, { Url: url }).then(result => {
            this._itemsUpdated([itemId]); return result;
        });
    }
    uploadItemImage(itemId, imageType, file) {
        return super.uploadItemImage(itemId, imageType, file).then(result => {
            this._itemsUpdated([itemId]); return result;
        });
    }
    getPlaybackInfo(itemId, options, deviceProfile, signal) {
        return this.ajax({ url: this.getUrl(`Items/${itemId}/PlaybackInfo`, options), type: 'POST',
            data: JSON.stringify({ DeviceProfile: deviceProfile }), contentType: 'application/json', dataType: 'json', signal });
    }
    reportPlaybackStart(options) {
        const report = super.reportPlaybackStart(options);
        if (options.ItemId && !String(options.ItemId).startsWith('local:')) this.ensureWebSocket();
        return report;
    }
    getIntros(itemId, signal) {
        return this.getJSON(this.getUrl(`Users/${this.getCurrentUserId()}/Items/${itemId}/Intros`), signal);
    }
    getNextUpEpisodes(options, signal) {
        return this.getJSON(this.getUrl('Shows/NextUp', options), signal);
    }
    openWebSocket() {
        this._cancelSocketReconnect();
        super.openWebSocket();
        const socket = this._webSocket;
        const epoch = this._socketEpoch = (this._socketEpoch || 0) + 1;
        const current = () => this._webSocket === socket && this._socketEpoch === epoch;
        for (const name of ['onmessage', 'onerror']) {
            const callback = socket[name];
            socket[name] = (...args) => { if (current()) callback?.(...args); };
        }
        socket.onopen = () => {
            if (!current()) return;
            this._socketReconnectAttempt = 0;
            this._cancelSocketReconnect();
            events.trigger(this, 'websocketopen');
            for (const listener of [...(this.messageListeners || [])]) {
                if (!current()) return;
                this.sendMessage(`${listener.name}Start`, listener.options);
            }
        };
        socket.onclose = () => {
            if (!current()) return;
            this._webSocket = null;
            setTimeout(() => {
                if (this._socketEpoch === epoch) events.trigger(this, 'websocketclose');
            }, 0);
            this._scheduleSocketReconnect(epoch);
        };
    }
    _cancelSocketReconnect() {
        if (this._socketReconnectTimer !== undefined) {
            clearTimeout(this._socketReconnectTimer);
            this._socketReconnectTimer = undefined;
        }
    }
    _scheduleSocketReconnect(epoch) {
        if (!this.isLoggedIn() || this._socketReconnectTimer !== undefined || this._socketEpoch !== epoch) return;
        const delays = [1000, 2000, 4000, 8000, 16000, 30000];
        const attempt = this._socketReconnectAttempt || 0;
        this._socketReconnectAttempt = attempt + 1;
        this._socketReconnectTimer = setTimeout(() => {
            this._socketReconnectTimer = undefined;
            if (this._socketEpoch !== epoch || !this.isLoggedIn() || this.isWebSocketOpenOrConnecting()) return;
            try { this.openWebSocket(); }
            catch { this._scheduleSocketReconnect(this._socketEpoch); }
        }, delays[Math.min(attempt, delays.length - 1)]);
    }
    startMessageListener(name, options) {
        this.sendMessage(`${name}Start`, options);
        const listeners = this.messageListeners ||= [];
        if (!listeners.some(listener => listener.name === name)) listeners.push({ name, options });
    }
    stopMessageListener(name) {
        this.sendMessage(`${name}Stop`);
        if (this.messageListeners) this.messageListeners = this.messageListeners.filter(listener => listener.name !== name);
    }
    closeWebSocket() {
        this._cancelSocketReconnect();
        const socket = this._webSocket;
        if (!socket) return;
        this._socketEpoch = (this._socketEpoch || 0) + 1;
        this._webSocket = null;
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            socket.close();
        }
        const epoch = this._socketEpoch;
        setTimeout(() => { if (this._socketEpoch === epoch) events.trigger(this, 'websocketclose'); }, 0);
    }
    getLatestItems(options = {}) {
        if (!options.ParentId && !options.parentId && !options.IncludeItemTypes && !this.isMinServerVersion('4.6.4')) {
            const video = 'Movie,Video,Episode,MusicVideo,Trailer';
            options.IncludeItemTypes = options.MediaTypes === 'Video' ? video : options.MediaTypes === 'Audio' ? `${video},Audio` : 'Audio';
        }
        return super.getLatestItems(options);
    }
}

export default ApiClient;
