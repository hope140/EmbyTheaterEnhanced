/* Copyright (c) Emby https://emby.media
 * Independent singleton and locale contract adaptations, 2026. MIT. */
import BaseConnectionManager from './mit-connectionmanager.js';

class ConnectionManager extends BaseConnectionManager {
    // The module object exists before initialization, as required by AMD consumers.
    initialize(...args) {
        if (this._initialized) return this;
        super.initialize(...args);
        this._initialized = true;
        return this;
    }
    setCurrentLocale(value) {
        this._currentLocale = value;
        for (const api of this._apiClients || []) api.setCurrentLocale(value);
    }
    getCurrentLocale() { return this._currentLocale; }
    getSavedServers() { return this._initialized ? super.getSavedServers() : []; }
    getEmbyServerUrl(baseUrl, handler) {
        return super.getEmbyServerUrl(baseUrl.replace(/\/+$/, ''), handler);
    }
    connectToAddress(address, options) {
        if (!address) return super.connectToAddress(address, options);
        address = address.trim();
        if (!/^https?:\/\//i.test(address)) {
            address = `${/:(443|8920)(?:\/|$)/.test(address) ? 'https' : 'http'}://${address}`;
        }
        return super.connectToAddress(address, options);
    }
    getApiClientFromServerInfo(serverInfo, serverUrlToMatch) {
        serverInfo.DateLastAccessed = Date.now();
        if (serverInfo.LastConnectionMode == null && serverInfo.ManualAddress) serverInfo.LastConnectionMode = 2;
        const provider = this.credentialProvider();
        const credentials = provider.credentials();
        provider.addOrUpdateServer(credentials.Servers, serverInfo, serverUrlToMatch);
        provider.credentials(credentials);
        let address;
        switch (serverInfo.LastConnectionMode) {
            case 0: address = serverInfo.LocalAddress; break;
            case 1: address = serverInfo.RemoteAddress; break;
            case 2: address = serverInfo.ManualAddress; break;
            default: address = serverInfo.ManualAddress || serverInfo.LocalAddress || serverInfo.RemoteAddress;
        }
        return this._getOrAddApiClient(serverInfo, address);
    }
    addApiClient(api, isOnlyServer) {
        if ((this._apiClients || []).includes(api)) return;
        api.setCurrentLocale(this._currentLocale);
        return super.addApiClient(api, isOnlyServer);
    }
}

const connectionManager = Object.create(ConnectionManager.prototype);
export default connectionManager;
